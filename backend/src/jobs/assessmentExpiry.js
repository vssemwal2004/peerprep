import cron from 'node-cron';
import { reconcileExpiredAssessmentSubmissions } from '../services/assessmentExpiryService.js';

let sweepRunning = false;

// Browser timers disappear when a student closes the tab. The server remains
// authoritative and closes elapsed attempts once per minute.
cron.schedule('* * * * *', async () => {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const result = await reconcileExpiredAssessmentSubmissions();
    if (result.completed > 0) {
      console.log(`[AssessmentExpiry] Auto-completed ${result.completed} expired attempt(s).`);
    }
  } catch (error) {
    console.error('[AssessmentExpiry] Sweep failed:', error.message);
  } finally {
    sweepRunning = false;
  }
});

