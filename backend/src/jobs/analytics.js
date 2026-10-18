import cron from 'node-cron';
import { computeAllStudentsAnalytics } from '../services/analyticsEngine.js';
import { deploymentRole } from '../platform/deployment.js';

// Precompute student analytics daily at 02:15 server time
export async function runDailyAnalytics() {
  try {
    const results = await computeAllStudentsAnalytics();
    console.log(`[analytics] Precomputed analytics for ${results.length} students`);
  } catch (err) {
    console.error('[analytics] Failed to compute analytics', err);
  }
}
if (deploymentRole() !== 'shared') cron.schedule('15 2 * * *', runDailyAnalytics);
