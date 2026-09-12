import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import MasterData from '../models/MasterData.js';
import User from '../models/User.js';
import { seedDefaultMasterData } from '../services/masterDataService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../.env') });

function normalizedName(category, value) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return category === 'semester' ? text.replace(/^semester\s*/i, '') : text.toLowerCase();
}

async function normalizeStudents() {
  const updates = [
    User.updateMany(
      { role: 'student', college: { $regex: /^(geu|graphic era university)$/i } },
      { $set: { college: 'GEU' } },
    ),
    User.updateMany(
      { role: 'student', college: { $regex: /^gehu$/i } },
      { $set: { college: 'GEHU' } },
    ),
    User.updateMany(
      { role: 'student', branch: { $regex: /^computer\s*science$/i } },
      { $set: { branch: 'Computer Science' } },
    ),
    User.updateMany(
      { role: 'student', course: { $regex: /^b\.?\s*tech(?:\s+cse)?$/i } },
      { $set: { course: 'B.Tech' } },
    ),
  ];
  const results = await Promise.all(updates);
  return results.reduce((total, result) => total + (result.modifiedCount || 0), 0);
}

async function importRemainingStudentValues() {
  const categoryField = {
    campus: 'college',
    branch: 'branch',
    semester: 'semester',
    course: 'course',
  };
  const operations = [];
  for (const [category, field] of Object.entries(categoryField)) {
    const values = await User.distinct(field, { role: 'student' });
    values
      .filter((value) => value !== null && value !== undefined && String(value).trim())
      .forEach((value) => {
        const name = category === 'semester'
          ? String(Number(String(value).replace(/^semester\s*/i, '')))
          : String(value).trim().replace(/\s+/g, ' ');
        if (category === 'semester' && (!Number.isInteger(Number(name)) || Number(name) < 1 || Number(name) > 8)) return;
        const key = normalizedName(category, name);
        operations.push({
          updateOne: {
            filter: { category, normalizedName: key },
            update: {
              $setOnInsert: {
                category,
                name,
                normalizedName: key,
                order: category === 'semester' ? Number(name) : 0,
              },
              $set: { isActive: true },
            },
            upsert: true,
          },
        });
      });
  }
  if (operations.length) await MasterData.bulkWrite(operations, { ordered: false });
  return operations.length;
}

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(uri, { autoIndex: true });
  await seedDefaultMasterData();
  const normalizedStudents = await normalizeStudents();
  const importedValues = await importRemainingStudentValues();
  const masterValues = await MasterData.find({}).sort({ category: 1, order: 1, name: 1 }).lean();
  console.log(JSON.stringify({ normalizedStudents, importedValues, masterValues }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
