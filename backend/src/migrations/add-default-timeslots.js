import mongoose from 'mongoose';
import Pair from '../models/Pair.js';
import Event from '../models/Event.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function addDefaultTimeSlots() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all pairs without defaultTimeSlot
    const pairsWithoutDefault = await Pair.find({
      $or: [
        { defaultTimeSlot: { $exists: false } },
        { defaultTimeSlot: null }
      ]
    }).lean();

    console.log(`Found ${pairsWithoutDefault.length} pairs without default time slots`);

    // Group pairs by event
    const pairsByEvent = {};
    for (const pair of pairsWithoutDefault) {
      const eventId = pair.event.toString();
      if (!pairsByEvent[eventId]) {
        pairsByEvent[eventId] = [];
      }
      pairsByEvent[eventId].push(pair);
    }

    let updatedCount = 0;

    // Process each event's pairs
    for (const [eventId, pairs] of Object.entries(pairsByEvent)) {
      const event = await Event.findById(eventId).lean();
      if (!event) {
        console.log(`Event ${eventId} not found, skipping pairs`);
        continue;
      }

      // Generate default time slots - evenly distributed between event start and end
      const eventStart = event.startDate ? new Date(event.startDate).getTime() : Date.now();
      const eventEnd = event.endDate ? new Date(event.endDate).getTime() : eventStart + (7 * 24 * 60 * 60 * 1000);
      const totalPairs = pairs.length;
      const timeGap = totalPairs > 1 ? (eventEnd - eventStart) / totalPairs : 0;

      console.log(`\nProcessing event: ${event.name} with ${totalPairs} pairs`);

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        
        // Calculate default time slot for this pair
        const defaultTime = new Date(eventStart + (timeGap * i));
        // Round to nearest 30 minutes
        const minutes = defaultTime.getMinutes();
        const roundedMinutes = Math.round(minutes / 30) * 30;
        defaultTime.setMinutes(roundedMinutes, 0, 0);

        // Update the pair
        await Pair.findByIdAndUpdate(pair._id, {
          defaultTimeSlot: defaultTime
        });

        console.log(`  Updated pair ${pair._id}: ${defaultTime.toLocaleString()}`);
        updatedCount++;
      }
    }

    console.log(`\n✅ Successfully added default time slots to ${updatedCount} pairs`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
addDefaultTimeSlots();
