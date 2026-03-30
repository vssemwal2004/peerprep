import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import path from 'path';

// Load env consistently (same strategy as src/setup.js)
dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false });
dotenv.config({ path: path.join(__dirname, '.env'), override: false });

const uri = process.env.MONGODB_URI;
console.log('MONGODB_URI (masked):', uri ? uri.replace(/(mongodb\+srv:\/\/)(.*?):(.*?)@/, '$1$2:*****@') : '(not set)');

(async () => {
  try {
    await mongoose.connect(uri, { autoIndex: false });
    console.log('Connected to MongoDB successfully');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Connection error:');
    console.error(err);
    process.exit(1);
  }
})();
