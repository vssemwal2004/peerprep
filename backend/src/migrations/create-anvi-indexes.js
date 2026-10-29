// Creates the ANVI interview indexes on the platform database and on every active university.
// University connections never auto-create indexes (autoIndex is off), so without this step the
// live-session TTL (anvi_live_ttl) and the one-active-attempt unique index do not exist there:
// stale live docs would never expire and parallel starts could create duplicate attempts.
// Additive and safe to re-run: no index drops, no data changes.
//   npm run migrate:anvi-indexes            platform and all universities
//   npm run migrate:anvi-indexes -- north   one university (or "platform")
import '../setup.js';
import { connectDb, closeDb } from '../utils/db.js';
import { getTenant, listActiveUniversityIds } from '../platform/tenantConnections.js';
import { runForPlatform, runForTenant } from '../platform/tenantContext.js';
import AIInterview from '../models/AIInterview.js';
import { ANVI_MODELS, ANVI_RESUME_MODELS, AnviAttempt } from '../modules/anviInterview/anviInterview.models.js';
import { ANVI_AUDIO_MODELS } from '../modules/anviInterview/anviInterview.audio.models.js';
import { ANVI_SCHEDULING_MODELS } from '../modules/anviInterview/anviInterview.scheduling.models.js';
import { AnviUsage } from '../modules/anviInterview/anviInterview.usage.js';

async function ensure(label) {
  for (const model of ANVI_MODELS) await model.createIndexes();
  // Interview resumes: one per student and interview or assignment, removed by the TTL index (anvi_resume_ttl).
  for (const model of ANVI_RESUME_MODELS) await model.createIndexes();
  // Usage ledger: report lookups and the 180-day TTL (the ledger also creates these on first write).
  await AnviUsage.createIndexes();
  // Scheduling guards rely on these unique indexes: one active booking per student and assignment,
  // one target row per student and assignment, one slot per start time.
  for (const model of ANVI_SCHEDULING_MODELS) await model.createIndexes();
  // Question audio metadata: the unique (tenantKey, hash) index is the cross-instance TTS claim.
  for (const model of ANVI_AUDIO_MODELS) await model.createIndexes();
  // Cohort reports, no-show checks and assigned-attempt lookups read attempts by assignment.
  await AnviAttempt.collection.createIndex({ assignmentId: 1, studentId: 1 },
    { name: 'anvi_attempt_assignment', partialFilterExpression: { assignmentId: { $type: 'objectId' } } });
  // The student list reads published interviews across all authors.
  await AIInterview.collection.createIndex({ lifecycle: 1, publishedAt: -1 }, { name: 'ai_interview_published' });
  console.log(`[ANVI] ${label}: indexes ready`);
}

if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('Set MONGODB_URI to the intended deployment database.');
try {
  await connectDb({ allowMemoryFallback: false });
  const only = process.argv[2];
  if (!only || only === 'platform') await runForPlatform(() => ensure('platform'));
  const ids = only && only !== 'platform' ? [only] : only ? [] : await listActiveUniversityIds();
  for (const id of ids) await runForTenant(await getTenant(id), () => ensure(id));
} catch (error) {
  console.error(`[ANVI] Index migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDb();
}
