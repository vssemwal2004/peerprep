import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import Assessment from '../models/Assessment.js';
import AssessmentSubmission from '../models/AssessmentSubmission.js';
import Event from '../models/Event.js';
import EventParticipant from '../models/EventParticipant.js';
import User from '../models/User.js';
import Submission from '../models/Submission.js';
import Feedback from '../models/Feedback.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri || uri === 'memory') {
    throw new Error('Set MONGODB_URI to the target database before creating production indexes.');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
    maxPoolSize: 5,
  });

  const models = [Assessment, AssessmentSubmission, Event, EventParticipant, User, Submission, Feedback];
  for (const model of models) {
    const created = await model.createIndexes();
    console.log(`[Indexes] ${model.modelName}: ${created || 'already current'}`);
  }
}

run()
  .then(async () => {
    await mongoose.disconnect();
    console.log('[Indexes] Performance indexes are ready.');
  })
  .catch(async (error) => {
    console.error(`[Indexes] Failed: ${error.message}`);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
