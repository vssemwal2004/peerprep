import { listActiveUniversityIds, getTenant } from './tenantConnections.js';
import { runForPlatform, runForTenant } from './tenantContext.js';
import { syncPrepScores } from '../services/prepScore/sync.js';
import { sweepPendingCharges } from './coinSpend.js';
import { PLATFORM_WALLET_SCOPE } from './coins.js';
import { chargeVerifiers } from '../services/coinEntitlements.js';
import { dispatchPendingAssessmentEvaluations } from '../services/assessmentEvaluationDispatchService.js';
import { discoverAssessmentReportRefreshes, refreshPendingAssessmentReports } from '../services/assessmentReportSummaryService.js';
import { drainMailQueue } from '../workers/mailQueue.worker.js';
import { ensureMailQueueRetention } from '../services/mailQueueService.js';
import { sweepAssessmentExpiry } from '../jobs/assessmentExpiry.js';
import { sendReminders } from '../jobs/reminders.js';
import { runDailyAnalytics } from '../jobs/analytics.js';

// A failed score pass is retried next minute; it must not skip mail or assessment work.
const logPrepScoreFailure = (error) => console.error(`[SharedMaintenance] Prep Score sync failed (${error?.name || 'Error'}).`);
const logCoinFailure = (error) => console.error(`[SharedMaintenance] Prep Coin charge sweep failed (${error?.name || 'Error'}).`);

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
      // PeerPrep's own students live in the main database, outside every university.
      if (scheduled && due('platform', 'prepScores', 60_000)) await runForPlatform(() => syncPrepScores()).catch(logPrepScoreFailure);
      if (scheduled && due('platform', 'coinCharges', 60_000)) {
        await runForPlatform(() => sweepPendingCharges({ scope: PLATFORM_WALLET_SCOPE, verifiers: chargeVerifiers })).catch(logCoinFailure);
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
          // A rebuild (new policy or edited content) advances one batch per university per pass.
          if (due(id, 'prepScores', 60_000)) await syncPrepScores().catch(logPrepScoreFailure);
          // Settles Prep Coin charges a crash left pending (verified against this university's data).
          if (due(id, 'coinCharges', 60_000)) await sweepPendingCharges({ scope: id, verifiers: chargeVerifiers }).catch(logCoinFailure);
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
