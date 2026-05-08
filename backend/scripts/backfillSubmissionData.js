/**
 * Backfill script to populate missing timeTakenSec and violation fields in AssessmentSubmission documents
 * Run with: node backend/scripts/backfillSubmissionData.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import AssessmentSubmission from '../src/models/AssessmentSubmission.js';
import Assessment from '../src/models/Assessment.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function backfillSubmissionData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const submissions = await AssessmentSubmission.find({
      status: { $in: ['submitted', 'violation'] },
    });

    console.log(`Found ${submissions.length} submitted/violation submissions to process`);

    let updated = 0;
    let skipped = 0;

    for (const submission of submissions) {
      const needsUpdate = {};

      // Backfill timeTakenSec if missing
      if (!submission.timeTakenSec && submission.startedAt && submission.submittedAt) {
        const startTime = new Date(submission.startedAt).getTime();
        const endTime = new Date(submission.submittedAt).getTime();
        needsUpdate.timeTakenSec = Math.max(0, Math.floor((endTime - startTime) / 1000));
      }

      // Ensure violation fields have default values
      if (submission.tabSwitches === undefined || submission.tabSwitches === null) {
        needsUpdate.tabSwitches = 0;
      }
      if (submission.fullscreenExits === undefined || submission.fullscreenExits === null) {
        needsUpdate.fullscreenExits = 0;
      }
      if (submission.cameraFlags === undefined || submission.cameraFlags === null) {
        needsUpdate.cameraFlags = 0;
      }
      if (submission.copyPasteCount === undefined || submission.copyPasteCount === null) {
        needsUpdate.copyPasteCount = 0;
      }

      if (Object.keys(needsUpdate).length > 0) {
        await AssessmentSubmission.updateOne({ _id: submission._id }, { $set: needsUpdate });
        console.log(`Updated submission ${submission._id}:`, needsUpdate);
        updated++;
      } else {
        skipped++;
      }
    }

    console.log(`\nBackfill complete:`);
    console.log(`- Updated: ${updated}`);
    console.log(`- Skipped: ${skipped}`);
    console.log(`- Total processed: ${submissions.length}`);

  } catch (error) {
    console.error('Error during backfill:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

backfillSubmissionData();
