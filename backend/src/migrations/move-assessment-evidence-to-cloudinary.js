// Moves camera evidence stored in MongoDB (AssessmentEvent.legacyDataUrl) to private
// Cloudinary images and removes the image bodies from MongoDB, on the platform
// database and every active university. It also strips the image bodies still
// embedded in old AssessmentSubmission.proctoringSnapshots; reports only read their
// type, time and size, so those images are never shown anywhere.
// Safe to re-run: each image is uploaded under its own event ID and removed from
// MongoDB only after Cloudinary has it. Run outside an exam: it uploads in parallel.
//   npm run migrate:evidence-cloudinary -- --check      count only, change nothing
//   npm run migrate:evidence-cloudinary                 platform and all universities
//   npm run migrate:evidence-cloudinary -- north        one university (or "platform")
import '../setup.js';
import mongoose from 'mongoose';
import { closeDb } from '../utils/db.js';
import { verifyDeploymentDatabaseIdentity } from '../platform/dbIdentity.js';
import { getTenant, listActiveUniversityIds } from '../platform/tenantConnections.js';
import { runForPlatform, runForTenant } from '../platform/tenantContext.js';
import AssessmentEvent from '../models/AssessmentEvent.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import { cloudinaryEvidenceObjectKey, cloudinaryEvidencePublicId } from '../services/assessmentEvidenceService.js';
import { isCloudinaryConfigured, uploadPrivateImage } from '../utils/cloudinary.js';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const only = args.find((arg) => !arg.startsWith('--'));
const BATCH_SIZE = 50;
const CONCURRENCY = 6;
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/;

let failures = 0;

async function moveEvent(event) {
  const match = DATA_URL.exec(event.legacyDataUrl || '');
  if (!match) throw new Error('stored value is not an image data URL');
  const publicId = cloudinaryEvidencePublicId(
    { _id: event.submissionId, assessmentId: event.assessmentId, attemptGeneration: event.attemptGeneration },
    String(event._id),
  );
  await uploadPrivateImage(Buffer.from(match[2], 'base64'), { publicId });
  await AssessmentEvent.updateOne(
    { _id: event._id, legacyDataUrl: { $exists: true } },
    { $set: { objectKey: cloudinaryEvidenceObjectKey(publicId) }, $unset: { legacyDataUrl: 1 } },
  );
}

async function migrate(label) {
  const legacyFilter = { kind: 'snapshot', legacyDataUrl: { $exists: true } };
  const embeddedFilter = { 'proctoringSnapshots.dataUrl': { $exists: true } };
  const [legacy, embedded] = await Promise.all([
    AssessmentEvent.countDocuments(legacyFilter),
    AssessmentSubmission.countDocuments(embeddedFilter),
  ]);
  console.log(`[Evidence] ${label}: ${legacy} image(s) in assessmentevents, ${embedded} submission(s) with embedded snapshot images`);
  if (checkOnly) return;

  let moved = 0;
  let lastId = null;
  for (;;) {
    const batch = await AssessmentEvent.find(lastId ? { ...legacyFilter, _id: { $gt: lastId } } : legacyFilter)
      .sort({ _id: 1 }).limit(BATCH_SIZE)
      .select('+legacyDataUrl submissionId assessmentId attemptGeneration').lean();
    if (!batch.length) break;
    lastId = batch[batch.length - 1]._id;
    for (let index = 0; index < batch.length; index += CONCURRENCY) {
      await Promise.all(batch.slice(index, index + CONCURRENCY).map((event) => moveEvent(event).then(
        () => { moved += 1; },
        (error) => { failures += 1; console.error(`[Evidence] ${label} event ${event._id}: ${error?.message || error?.error?.message || 'upload failed'}`); },
      )));
    }
    console.log(`[Evidence] ${label}: ${moved}/${legacy} moved to Cloudinary`);
  }
  if (embedded) {
    const result = await AssessmentSubmission.updateMany(embeddedFilter, { $unset: { 'proctoringSnapshots.$[].dataUrl': '' } });
    console.log(`[Evidence] ${label}: removed embedded snapshot images from ${result.modifiedCount} submission(s)`);
  }
}

if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('Set MONGODB_URI to the intended deployment database.');
if (!checkOnly && !isCloudinaryConfigured()) throw new Error('Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET first.');
try {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 8000 });
  await verifyDeploymentDatabaseIdentity();
  if (!only || only === 'platform') await runForPlatform(() => migrate('platform'));
  const ids = only && only !== 'platform' ? [only] : only ? [] : await listActiveUniversityIds();
  for (const id of ids) {
    const tenant = await getTenant(id);
    await runForTenant(tenant, () => migrate(id));
  }
} catch (error) {
  failures += 1;
  console.error(`[Evidence] Migration failed: ${error.message}`);
} finally {
  if (failures) {
    console.error(`[Evidence] ${failures} problem(s). Images that failed stay in MongoDB; re-run to retry them.`);
    process.exitCode = 1;
  }
  await closeDb();
}
