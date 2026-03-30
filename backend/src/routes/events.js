

import { Router } from 'express';
import multer from 'multer';
import { createEvent, listEvents, joinEvent, exportJoinedCsv, eventAnalytics, replaceEventTemplate, getTemplateUrl, deleteEventTemplate, getEvent, createSpecialEvent, checkSpecialEventCsv} from '../controllers/eventController.js';
import { supabase } from '../utils/supabase.js';
import { requireAuth, requireAdmin, requireAdminOrCoordinator } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });
const multi = upload.fields([
	{ name: 'template', maxCount: 1 },
	{ name: 'csv', maxCount: 1 },
]);

router.get('/', requireAuth, listEvents);
router.post('/', requireAuth, requireAdminOrCoordinator, upload.single('template'), createEvent);
router.post('/special/check-csv', requireAuth, requireAdminOrCoordinator, upload.single('csv'), checkSpecialEventCsv);
router.post('/special', requireAuth, requireAdminOrCoordinator, multi, createSpecialEvent);
router.get('/:id', requireAuth, requireAdminOrCoordinator, getEvent);
router.post('/:id/join', requireAuth, joinEvent);
router.post('/:id/template', requireAuth, requireAdmin, upload.single('template'), replaceEventTemplate);
router.get('/:id/participants.csv', requireAuth, requireAdminOrCoordinator, exportJoinedCsv);
router.get('/:id/analytics', requireAuth, requireAdminOrCoordinator, eventAnalytics);
router.get('/:id/template-url', requireAuth, getTemplateUrl);
router.delete('/:id/template', requireAuth, requireAdmin, deleteEventTemplate);
router.get('/__supabase/health', requireAuth, requireAdmin, async (req, res) => {
	try {
		if (!supabase) return res.status(500).json({ ok: false, reason: 'not_configured' });
		const bucket = process.env.SUPABASE_BUCKET || 'templates';
		const { data, error } = await supabase.storage.from(bucket).list('', { limit: 1 });
		if (error) return res.status(500).json({ ok: false, reason: 'list_failed', error: error.message });
		res.json({ ok: true, bucket, sample: data?.length || 0 });
	} catch (e) {
		res.status(500).json({ ok: false, reason: 'exception', error: e?.message || String(e) });
	}
});
router.get('/__supabase/write-test', requireAuth, requireAdmin, async (req, res) => {
	try {
		if (!supabase) return res.status(500).json({ ok: false, reason: 'not_configured' });
		const bucket = process.env.SUPABASE_BUCKET || 'templates';
		const key = `__health/${Date.now()}_ping.txt`;
		const data = Buffer.from(`ping ${new Date().toISOString()}`, 'utf8');
		const up = await supabase.storage.from(bucket).upload(key, data, { contentType: 'text/plain', upsert: false });
		if (up.error) return res.status(500).json({ ok: false, reason: 'upload_failed', error: up.error.message });
		// cleanup
		await supabase.storage.from(bucket).remove([key]);
		return res.json({ ok: true, bucket, key });
	} catch (e) {
		return res.status(500).json({ ok: false, reason: 'exception', error: e?.message || String(e) });
	}
});

// Coordinator-scoped event creation
// Removed unused coordinator route here; coordinator events are handled in /api/coordinators/events

export default router;
