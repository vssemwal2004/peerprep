// GET /api/admin/performance-reports/assessment/:id?format=pdf|xlsx|csv
// GET /api/admin/performance-reports/quickprep/:id?format=pdf|xlsx|csv
// Same access as the screens they download from: the assessment report
// permission plus the per-assessment scope check, and the QuickPrep author rule.
import { Router } from 'express';
import { requireAdmin, requireAuth, requireCoordinatorPermission } from '../../middleware/auth.js';
import { quickPrepAuthoringAllowed } from '../../services/questService.js';
import { HttpError } from '../../utils/errors.js';
import { PERFORMANCE_FORMATS, renderPerformanceReport } from './performanceReport.render.js';
import { buildAssessmentPerformance, buildQuickPrepPerformance } from './performanceReport.service.js';

const router = Router();
const requireQuickPrepAuthor = (req, res, next) => (quickPrepAuthoringAllowed()
  ? requireAdmin(req, res, next)
  : next(new HttpError(403, 'QuickPreps are managed by the super admin.')));

/** Express handler: builds the report with `build(user, id)` and sends it in ?format. */
export function downloadPerformanceReport(build) {
  return async (req, res) => {
    const format = String(req.query?.format || '').toLowerCase();
    if (!PERFORMANCE_FORMATS[format]) return res.status(400).json({ error: 'format must be pdf, xlsx or csv.', code: 'INVALID_FORMAT' });
    try {
      const report = await build(req.user, req.params.id);
      const { buffer, contentType, fileName } = await renderPerformanceReport(report, format);
      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store',
      });
      return res.send(buffer);
    } catch (error) {
      if (error?.status && error.status < 500) return res.status(error.status).json({ error: error.message, code: error.code });
      console.error('Performance report failed:', error);
      return res.status(500).json({ error: 'The performance report could not be generated.' });
    }
  };
}

router.get('/assessment/:id', requireAuth, requireCoordinatorPermission('coordinator.assessment.reports'), downloadPerformanceReport(buildAssessmentPerformance));
router.get('/quickprep/:id', requireAuth, requireQuickPrepAuthor, downloadPerformanceReport(buildQuickPrepPerformance));

export default router;
