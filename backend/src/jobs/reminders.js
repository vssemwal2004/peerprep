import cron from 'node-cron';
import crypto from 'crypto';
import Pair from '../models/Pair.js';

// Run every 5 minutes to auto-generate meeting links for upcoming interviews
// No reminder emails are sent - only meeting link generation
cron.schedule('*/5 * * * *', async () => {
  const now = new Date();
  const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
  const pairs = await Pair.find({ 
    scheduledAt: { $gte: now, $lte: oneHour },
    meetingLink: { $exists: false } // Only pairs without a link
  });
  
  for (const p of pairs) {
    // Auto-generate meeting link within 1 hour window if not already generated
    const base = (process.env.MEETING_LINK_BASE || 'https://meet.jit.si').replace(/\/$/, '');
    const token = crypto.randomUUID();
    p.meetingLink = `${base}/${token}`;
    await p.save();
    console.log(`[reminders] Auto-generated meeting link for pair ${p._id}: ${p.meetingLink}`);
  }
  
  if (pairs.length > 0) {
    console.log(`[reminders] Generated ${pairs.length} meeting links`);
  }
});

