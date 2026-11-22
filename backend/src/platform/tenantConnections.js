import mongoose from 'mongoose';
import { University } from './models.js';
import { decryptTenantSecret } from './tenantSecrets.js';
import { HttpError } from '../utils/errors.js';

const connections = new Map();
const registrations = new Map();
const retiredConnections = new Set();
function retireConnection(connection) {
  retiredConnections.add(connection);
  const timer = setTimeout(() => {
    if (retiredConnections.delete(connection)) void connection.close().catch(() => {});
  }, 5 * 60_000);
  timer.unref?.();
}
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;
const CENTRAL_MODELS = new Set(['GlobalRankSnapshot', 'InterviewCompany', 'InterviewCompanySettings', 'InterviewQuestionReport', 'PrepScorePolicy']);
const isUniversityModel = (name) => !name.startsWith('Platform') && !CENTRAL_MODELS.has(name);

export function validUniversityId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function validateTenantMongoUri(value) {
  const uri = String(value || '').trim();
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri) || uri.length > 4096) {
    throw new HttpError(400, 'Paste a MongoDB URI starting with mongodb:// or mongodb+srv://, without MONGODB_URI= or surrounding quotes.');
  }
  return uri;
}

export async function verifyTenantDatabase(connection, universityId, { claim = false, allowUnclaimed = false } = {}) {
  const collection = connection.db.collection('peerprep_deployment_identity');
  const existing = await collection.findOne({ _id: 'deployment' });
  if (existing && (existing.role !== 'university' || existing.universityId !== universityId)) {
    throw new HttpError(422, 'This database is already claimed by another PeerPrep deployment or university.');
  }
  if (!existing && (claim || allowUnclaimed)) {
    const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
    if (collections.some((entry) => !entry.name.startsWith('system.'))) {
      throw new HttpError(422, 'This database already contains data but has no PeerPrep university identity. Use an empty database or the database already claimed for this university.');
    }
    if (claim) await collection.insertOne({ _id: 'deployment', role: 'university', universityId, createdAt: new Date() });
  }
  if (!existing && !claim && !allowUnclaimed) throw new HttpError(422, 'This university database has not been claimed by PeerPrep.');
}

export async function testTenantConnection(uri, universityId, { claim = false, allowUnclaimed = false } = {}) {
  if (!validUniversityId(universityId)) throw new HttpError(400, 'Invalid university ID');
  const mongoUri = validateTenantMongoUri(uri);
  let connection;
  try {
    connection = mongoose.createConnection(mongoUri, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 2,
      minPoolSize: 0,
    });
    await connection.asPromise();
    await connection.db.admin().ping();
    await verifyTenantDatabase(connection, universityId, { claim, allowUnclaimed });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error?.name === 'MongoParseError') throw new HttpError(400, 'The MongoDB URI is malformed. Check its host, database name, and options.');
    if (error?.code === 18 || error?.code === 13 || error?.codeName === 'AuthenticationFailed') {
      throw new HttpError(422, 'MongoDB authentication failed. Check the username, password, and authSource in the URI.');
    }
    throw new HttpError(422, 'Could not connect to MongoDB. Check the URI, database network access, and server availability.');
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

// Delete only a database that PeerPrep itself claimed for this university.
export async function dropTenantDatabase(uri, universityId, { allowAlreadyDropped = false } = {}) {
  if (!validUniversityId(universityId)) throw new HttpError(400, 'Invalid university ID');
  const mongoUri = validateTenantMongoUri(uri);
  const connection = mongoose.createConnection(mongoUri, {
    autoIndex: false, serverSelectionTimeoutMS: 5000, maxPoolSize: 2, minPoolSize: 0,
  });
  try {
    await connection.asPromise();
    const identity = await connection.db.collection('peerprep_deployment_identity').findOne({ _id: 'deployment' });
    if (!identity && allowAlreadyDropped) {
      const collections = await connection.db.listCollections({}, { nameOnly: true }).toArray();
      if (!collections.some((entry) => !entry.name.startsWith('system.'))) return { alreadyDropped: true };
    }
    if (identity?.role !== 'university' || identity.universityId !== universityId) {
      throw new HttpError(422, 'Database identity does not match this university. No data was deleted.');
    }
    await connection.dropDatabase();
    return { alreadyDropped: false };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, 'Could not delete the university database. The university registration was kept.');
  } finally {
    await connection.close().catch(() => {});
  }
}

export async function inspectTenantDatabase(uri) {
  const mongoUri = validateTenantMongoUri(uri);
  const connection = mongoose.createConnection(mongoUri, {
    autoIndex: false, serverSelectionTimeoutMS: 5000, maxPoolSize: 2, minPoolSize: 0,
  });
  try {
    await connection.asPromise();
    return await connection.db.collection('peerprep_deployment_identity').findOne({ _id: 'deployment' });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(422, 'Could not inspect the MongoDB database. Check the URI and network access.');
  } finally {
    await connection.close().catch(() => {});
  }
}

export async function closeTenantConnection(universityId) {
  const pending = [];
  for (const key of [universityId, `inactive:${universityId}`]) {
    const cached = connections.get(key);
    if (cached) { connections.delete(key); pending.push(cached.promise); }
  }
  const tenants = await Promise.allSettled(pending);
  const unique = new Set(tenants.filter((item) => item.status === 'fulfilled').map((item) => item.value.connection));
  await Promise.allSettled([...unique].map((connection) => connection.close()));
}

export async function getTenant(universityId, { includeInactive = false } = {}) {
  if (!validUniversityId(universityId)) throw new Error('Invalid university ID');
  const cacheKey = includeInactive ? `inactive:${universityId}` : universityId;
  const registration = await loadRegistration(universityId, includeInactive);
  if (!registration?.dbUriEncrypted) throw new Error('University is unavailable');
  const revision = String(registration.updatedAt || '');
  const cached = connections.get(cacheKey);
  if (cached?.revision === revision) return cached.promise;
  if (cached?.uriCipher === registration.dbUriEncrypted) {
    const promise = cached.promise.then((value) => ({ ...value,
      permissions: registration.permissions,
      sources: registration.sources,
      serviceStartDate: registration.serviceStartDate,
      serviceEndDate: registration.serviceEndDate,
      judge0Url: registration.judge0UrlEncrypted ? decryptTenantSecret(registration.judge0UrlEncrypted) : '',
      judge0AuthHeader: registration.judge0AuthHeaderEncrypted ? decryptTenantSecret(registration.judge0AuthHeaderEncrypted) : '',
      judge0AuthToken: registration.judge0AuthTokenEncrypted ? decryptTenantSecret(registration.judge0AuthTokenEncrypted) : '',
      interviewServiceUrl: registration.interviewUrlEncrypted ? decryptTenantSecret(registration.interviewUrlEncrypted) : '',
      interviewServiceSecret: registration.interviewSecretEncrypted ? decryptTenantSecret(registration.interviewSecretEncrypted) : '',
    }));
    connections.set(cacheKey, { revision, uriCipher: registration.dbUriEncrypted, promise });
    return promise;
  }
  if (cached) {
    connections.delete(cacheKey);
    void cached.promise.then((value) => retireConnection(value.connection)).catch(() => {});
  }
  const promise = (async () => {
    const uri = decryptTenantSecret(registration.dbUriEncrypted);
    const connection = mongoose.createConnection(uri, {
      autoIndex: false,
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
      socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 30000),
      maxPoolSize: Number(process.env.MONGODB_TENANT_MAX_POOL_SIZE || 20),
      minPoolSize: 0,
      maxIdleTimeMS: Number(process.env.MONGODB_MAX_IDLE_TIME_MS || 30000),
      waitQueueTimeoutMS: Number(process.env.MONGODB_WAIT_QUEUE_TIMEOUT_MS || 5000),
    });
    try {
      await connection.asPromise();
      await verifyTenantDatabase(connection, universityId);
      // Register refs before any populate() call, including models whose
      // modules were imported by a different route before this request.
      for (const model of Object.values(mongoose.models)) {
        if (isUniversityModel(model.modelName) && !connection.models[model.modelName]) connection.model(model.modelName, model.schema);
      }
      return {
        universityId,
        connection,
        permissions: registration.permissions,
        sources: registration.sources,
        serviceStartDate: registration.serviceStartDate,
        serviceEndDate: registration.serviceEndDate,
        judge0Url: registration.judge0UrlEncrypted ? decryptTenantSecret(registration.judge0UrlEncrypted) : '',
        judge0AuthHeader: registration.judge0AuthHeaderEncrypted ? decryptTenantSecret(registration.judge0AuthHeaderEncrypted) : '',
        judge0AuthToken: registration.judge0AuthTokenEncrypted ? decryptTenantSecret(registration.judge0AuthTokenEncrypted) : '',
        interviewServiceUrl: registration.interviewUrlEncrypted ? decryptTenantSecret(registration.interviewUrlEncrypted) : '',
        interviewServiceSecret: registration.interviewSecretEncrypted ? decryptTenantSecret(registration.interviewSecretEncrypted) : '',
      };
    } catch (error) {
      await connection.close();
      throw error;
    }
  })();
  connections.set(cacheKey, { revision, uriCipher: registration.dbUriEncrypted, promise });
  promise.catch(() => { if (connections.get(cacheKey)?.promise === promise) connections.delete(cacheKey); });
  return promise;
}

export async function ensureTenantIndexes(tenant) {
  const models = Object.values(tenant.connection.models).filter((model) => isUniversityModel(model.modelName));
  for (let index = 0; index < models.length; index += 4) {
    await Promise.all(models.slice(index, index + 4).map((model) => model.createIndexes()));
  }
}

async function loadRegistration(universityId, includeInactive = false) {
  const cacheKey = includeInactive ? `inactive:${universityId}` : universityId;
  const cached = registrations.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = University.findOne({ universityId, ...(includeInactive ? {} : { active: true }), deletedAt: null })
    .select('+dbUriEncrypted +judge0UrlEncrypted +judge0AuthHeaderEncrypted +judge0AuthTokenEncrypted +interviewUrlEncrypted +interviewSecretEncrypted').lean().exec();
  registrations.set(cacheKey, { promise, expiresAt: Date.now() + 5000 });
  promise.catch(() => { if (registrations.get(cacheKey)?.promise === promise) registrations.delete(cacheKey); });
  return promise;
}

export function invalidateTenantRegistration(universityId) {
  registrations.delete(universityId);
  registrations.delete(`inactive:${universityId}`);
}

export async function listActiveUniversityIds() {
  const rows = await University.find({ active: true, deletedAt: null, dbUriEncrypted: { $exists: true } })
    .select('universityId').lean();
  return rows.map((row) => row.universityId);
}

export async function closeTenantConnections() {
  const entries = [...connections.values()];
  connections.clear();
  registrations.clear();
  await Promise.allSettled([...entries.map(async (entry) => (await entry.promise).connection.close()),
    ...[...retiredConnections].map((connection) => connection.close())]);
  retiredConnections.clear();
}
