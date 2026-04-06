import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';

import { fileURLToPath } from 'url';
import path from 'path';

// Load env consistently (same strategy as src/setup.js)
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });
dotenv.config({ path: path.join(__dirname, '.env'), override: false });

const uri = process.env.MONGODB_URI;

(async () => {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    const students = await User.find({ role: 'student' })
      .select('name studentId semester')
      .limit(5)
      .lean();
    
    console.log('Sample students:');
    students.forEach(s => {
      console.log(`- ${s.name} (${s.studentId}): semester = ${s.semester || 'NOT SET'}`);
    });
    
    const withSemester = await User.countDocuments({ role: 'student', semester: { $exists: true, $ne: null } });
    const total = await User.countDocuments({ role: 'student' });
    console.log(`\nStudents with semester: ${withSemester}/${total}`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
})();
