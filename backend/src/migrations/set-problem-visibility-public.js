import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Problem from '../models/Problem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function setProblemVisibilityPublic() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const result = await Problem.updateMany(
      { $or: [{ visibility: { $exists: false } }, { visibility: null }, { visibility: '' }] },
      { $set: { visibility: 'public' } }
    );

    console.log(`Updated ${result.modifiedCount || 0} problems to visibility=public`);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

setProblemVisibilityPublic();
