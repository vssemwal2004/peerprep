// Reports or creates the schema indexes on the platform database and every active university.
// University connections never auto-create indexes (autoIndex is off) and ensureTenantIndexes
// runs only when a university is first set up, so an index added to a schema afterwards never
// reaches existing universities and their queries fall back to collection scans.
// Additive and safe to re-run: no index drops, no data changes. Index builds on large
// collections add database load, so run the create step outside peak hours.
//   npm run migrate:tenant-indexes -- --check          list missing indexes only
//   npm run migrate:tenant-indexes                     platform and all universities
//   npm run migrate:tenant-indexes -- north            one university (or "platform")
import '../setup.js';
import { readdir } from 'fs/promises';
import mongoose from 'mongoose';
import { closeDb } from '../utils/db.js';
import { verifyDeploymentDatabaseIdentity } from '../platform/dbIdentity.js';
import { getTenant, listActiveUniversityIds } from '../platform/tenantConnections.js';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const only = args.find((arg) => !arg.startsWith('--'));

// getTenant registers every loaded model on a university connection, so load them all first.
const modelDirs = [['../models/', () => true], ['../modules/anviInterview/', (file) => /\.(models|usage)\.js$/.test(file)]];
for (const [dir, include] of modelDirs) {
  const url = new URL(dir, import.meta.url);
  for (const file of await readdir(url)) {
    if (file.endsWith('.js') && include(file)) await import(new URL(file, url));
  }
}

let failures = 0;

async function ensure(label, connection, models) {
  // A collection that does not exist yet has nothing to scan; creating its indexes here
  // would also create stray collections for models this database never uses.
  const existing = new Set((await connection.db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
  let missing = 0;
  for (const model of models) {
    if (!existing.has(model.collection.collectionName)) continue;
    try {
      const { toCreate } = await model.diffIndexes();
      if (!toCreate.length) continue;
      missing += toCreate.length;
      const specs = toCreate.map((spec) => JSON.stringify(Array.isArray(spec) ? spec[0] : spec)).join(' ');
      console.log(`[Indexes] ${label} ${model.modelName}: ${checkOnly ? 'missing' : 'creating'} ${specs}`);
      if (!checkOnly) await model.createIndexes();
    } catch (error) {
      failures += 1;
      console.error(`[Indexes] ${label} ${model.modelName}: ${error.message}`);
    }
  }
  console.log(`[Indexes] ${label}: ${missing ? `${missing} index${missing === 1 ? '' : 'es'} ${checkOnly ? 'missing' : 'created'}` : 'up to date'}`);
}

if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('Set MONGODB_URI to the intended deployment database.');
try {
  // connectDb turns autoIndex on outside production, which would build indexes during --check.
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 8000 });
  await verifyDeploymentDatabaseIdentity();
  if (!only || only === 'platform') await ensure('platform', mongoose.connection, Object.values(mongoose.models));
  const ids = only && only !== 'platform' ? [only] : only ? [] : await listActiveUniversityIds();
  for (const id of ids) {
    const tenant = await getTenant(id);
    await ensure(id, tenant.connection, Object.values(tenant.connection.models));
  }
} catch (error) {
  failures += 1;
  console.error(`[Indexes] Migration failed: ${error.message}`);
} finally {
  if (failures) process.exitCode = 1;
  await closeDb();
}
