import mongoose from 'mongoose';
import Pair from '../models/Pair.js';
import Event from '../models/Event.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function checkPairs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const pairs = await Pair.find().populate('event').lean();
    console.log(`\nTotal pairs in database: ${pairs.length}\n`);

    for (const pair of pairs) {
      console.log('─────────────────────────────────────');
      console.log(`Pair ID: ${pair._id}`);
      console.log(`Event: ${pair.event?.name || 'N/A'}`);
      console.log(`Default Time Slot: ${pair.defaultTimeSlot ? new Date(pair.defaultTimeSlot).toLocaleString() : '❌ MISSING'}`);
      console.log(`Scheduled At: ${pair.scheduledAt ? new Date(pair.scheduledAt).toLocaleString() : 'Not scheduled'}`);
      console.log(`Status: ${pair.status}`);
    }

    console.log('─────────────────────────────────────\n');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

checkPairs();
