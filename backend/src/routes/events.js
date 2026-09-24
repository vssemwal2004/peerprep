

import { Router } from 'express';
import multer from 'multer';
import { createEvent, listEvents, joinEvent, exportJoinedCsv, eventAnalytics, replaceEventTemplate, getTemplateUrl, deleteEventTemplate, getEvent, createSpecialEvent, checkSpecialEventCsv, checkInterviewParticipantCsv, updateEvent, updateEventStatus, listEventParticipants, addEventParticipants, removeEventParticipant, deleteEvent, sendEventInvitations } from '../controllers/eventController.js';
import { supabase } from '../utils/supabase.js';
import { requireAuth, requireAdmin, requireCoordinatorPermission, requireStudent } from '../middleware/auth.js';
import { cacheJsonResponse, invalidateResponseCache } from '../middleware/responseCache.js';

const router = Router();
const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: 10 * 1024 * 1024, files: 2, fields: 30 },
});
const multi = upload.fields([
	{ name: 'template', maxCount: 1 },
	{ name: 'csv', maxCount: 1 },
]);

router.get('/', requireAuth, cacheJsonResponse({ namespace: 'events', ttlSeconds: Number(process.env.RESPONSE_CACHE_EVENTS_TTL_SECONDS || 30) }), listEvents);
router.post('/', requireAuth, requireCoordinatorPermission('coordinator.interviews.create'), invalidateResponseCache('events'), upload.single('template'), createEvent);
router.post('/special/check-csv', requireAuth, requireCoordinatorPermission('coordinator.interviews.create'), upload.single('csv'), checkSpecialEventCsv);
router.post('/participants/check-csv', requireAuth, requireCoordinatorPermission('coordinator.interviews.create'), upload.single('csv'), checkInterviewParticipantCsv);
router.post('/special', requireAuth, requireCoordinatorPermission('coordinator.interviews.create'), invalidateResponseCache('events'), multi, createSpecialEvent);
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
router.get('/:id', requireAuth, requireCoordinatorPermission('coordinator.interviews.view'), getEvent);
router.patch('/:id', requireAuth, requireCoordinatorPermission('coordinator.interviews.edit'), invalidateResponseCache('events'), updateEvent);
router.patch('/:id/status', requireAuth, requireCoordinatorPermission('coordinator.interviews.manage'), invalidateResponseCache('events'), updateEventStatus);
router.get('/:id/participants', requireAuth, requireCoordinatorPermission('coordinator.interviews.participants'), listEventParticipants);
router.post('/:id/participants', requireAuth, requireCoordinatorPermission('coordinator.interviews.participants'), invalidateResponseCache('events'), addEventParticipants);
router.post('/:id/invitations', requireAuth, requireCoordinatorPermission('coordinator.interviews.participants'), sendEventInvitations);
router.delete('/:id/participants/:studentId', requireAuth, requireCoordinatorPermission('coordinator.interviews.participants'), invalidateResponseCache('events'), removeEventParticipant);
router.delete('/:id', requireAuth, requireCoordinatorPermission('coordinator.interviews.delete'), invalidateResponseCache('events'), deleteEvent);
router.post('/:id/join', requireAuth, requireStudent, invalidateResponseCache('events'), joinEvent);
router.post('/:id/template', requireAuth, requireAdmin, invalidateResponseCache('events'), upload.single('template'), replaceEventTemplate);
router.get('/:id/participants.csv', requireAuth, requireCoordinatorPermission('coordinator.interviews.view'), exportJoinedCsv);
router.get('/:id/analytics', requireAuth, requireCoordinatorPermission('coordinator.interviews.view'), eventAnalytics);
router.get('/:id/template-url', requireAuth, getTemplateUrl);
router.delete('/:id/template', requireAuth, requireAdmin, invalidateResponseCache('events'), deleteEventTemplate);

// Coordinator-scoped event creation
// Removed unused coordinator route here; coordinator events are handled in /api/coordinators/events

export default router;
