import { connectDb, closeDb } from '../utils/db.js';
import StudentChallenge from '../models/StudentChallenge.js';
import DailyChallengeDay from '../models/DailyChallengeDay.js';
import Submission from '../models/Submission.js';
import Progress from '../models/Progress.js';
import CodingStreak from '../models/CodingStreak.js';

// Additive deployment step: no index drops, data deletion, seeding or mail delivery.
if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'memory') throw new Error('Set MONGODB_URI to the intended persistent deployment database.');
try {
  await connectDb({ allowMemoryFallback: false });
  await Promise.all([StudentChallenge, DailyChallengeDay, Submission, CodingStreak, Progress].map((model) => model.createIndexes()));
  console.log('Student engagement indexes created. Earned awards are permanent; no TTL is applied.');
} finally { await closeDb(); }
