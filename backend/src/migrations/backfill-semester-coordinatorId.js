import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Semester from '../models/Subject.js';
import User from '../models/User.js';

dotenv.config();

async function connect() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/interview_system';
  await mongoose.connect(uri, { autoIndex: false });
}

async function run() {
  await connect();
  console.log('[Backfill] Starting coordinatorId normalization for semesters...');

  // Fetch all coordinators to build lookup maps
  const coordinators = await User.find({ role: 'coordinator' }).select('_id coordinatorId').lean();
  const idToCoordId = new Map(coordinators.map(c => [c._id.toString(), c.coordinatorId]));
  const coordIdSet = new Set(coordinators.map(c => (c.coordinatorId || '').trim()).filter(Boolean));

  const semesters = await Semester.find({}).select('_id coordinatorId').lean();
  let updates = 0;
  for (const s of semesters) {
    const stored = (s.coordinatorId || '').trim();
    if (!stored) continue;

    // If coordinatorId already a known coordinatorId string, skip
    if (coordIdSet.has(stored)) continue;

    // If coordinatorId equals some coordinator's ObjectId string, backfill
    const mapped = idToCoordId.get(stored);
    if (mapped && mapped !== stored) {
      await Semester.updateOne({ _id: s._id }, { coordinatorId: mapped });
      updates++;
      console.log(`[Backfill] Semester ${s._id} coordinatorId: ${stored} -> ${mapped}`);
    }
  }

  console.log(`[Backfill] Completed. Updated ${updates} semesters.`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[Backfill] Error:', err);
  process.exit(1);
});
