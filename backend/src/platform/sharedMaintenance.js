import { listActiveUniversityIds, getTenant } from './tenantConnections.js';
import { runForTenant } from './tenantContext.js';
import { dispatchPendingAssessmentEvaluations } from '../services/assessmentEvaluationDispatchService.js';
import { discoverAssessmentReportRefreshes, refreshPendingAssessmentReports } from '../services/assessmentReportSummaryService.js';
import { drainMailQueue } from '../workers/mailQueue.worker.js';
import { ensureMailQueueRetention } from '../services/mailQueueService.js';
import { sweepAssessmentExpiry } from '../jobs/assessmentExpiry.js';
import { sendReminders } from '../jobs/reminders.js';
import { runDailyAnalytics } from '../jobs/analytics.js';

export function startSharedMaintenance({ scheduled = true, mail = true } = {}) {
  let stopped = false;
  let timer;
  let running = Promise.resolve();
  let universityIds = [];
  let nextRefresh = 0;
  let cursor = 0;
  const last = new Map();
  const due = (id, task, intervalMs) => {
    const key = `${id}:${task}`;
    if (Date.now() - (last.get(key) || 0) < intervalMs) return false;
    last.set(key, Date.now());
    return true;
  };
  const tick = () => {
    running = (async () => {
      if (Date.now() >= nextRefresh) {
        universityIds = await listActiveUniversityIds();
        nextRefresh = Date.now() + 60_000;
      }
      if (!universityIds.length) return;
      const id = universityIds[cursor++ % universityIds.length];
      const tenant = await getTenant(id);
      await runForTenant(tenant, async () => {
        if (scheduled) {
          await dispatchPendingAssessmentEvaluations({ limit: 10 });
          if (due(id, 'reports', 3000)) {
            await discoverAssessmentReportRefreshes({ limit: 10 });
            await refreshPendingAssessmentReports({ limit: 5 });
          }
          if (due(id, 'expiry', 60_000)) await sweepAssessmentExpiry();
          if (due(id, 'reminders', 300_000)) await sendReminders();
          const now = new Date();
          const day = now.toISOString().slice(0, 10);
          if (now.getHours() === 2 && now.getMinutes() >= 15 && last.get(`${id}:analyticsDay`) !== day) {
            last.set(`${id}:analyticsDay`, day);
            await runDailyAnalytics();
          }
        }
        if (mail && due(id, 'mail', 5000)) {
          if (due(id, 'mailRetention', 24 * 60 * 60_000)) await ensureMailQueueRetention();
          await drainMailQueue();
        }
      });
    })().catch((error) => console.error(`[SharedMaintenance] Sweep failed (${error?.name || 'Error'}).`))
      .finally(() => { if (!stopped) timer = setTimeout(tick, 1000); });
  };
  tick();
  return async () => { stopped = true; clearTimeout(timer); await running; };
}
