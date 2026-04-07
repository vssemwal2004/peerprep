import cron from 'node-cron';
import { computeAllStudentsAnalytics } from '../services/analyticsEngine.js';

// Precompute student analytics daily at 02:15 server time
cron.schedule('15 2 * * *', async () => {
  try {
    const results = await computeAllStudentsAnalytics();
    console.log(`[analytics] Precomputed analytics for ${results.length} students`);
  } catch (err) {
    console.error('[analytics] Failed to compute analytics', err);
  }
});
