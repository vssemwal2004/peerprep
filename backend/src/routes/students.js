import { Router } from 'express';
import multer from 'multer';
import { uploadStudentsCsv, createStudent, checkStudentsCsv, listAllStudents, listAllSpecialStudents, listSpecialStudentsByEvent, deleteStudent, updateStudent, bulkDeleteStudents, resendStudentCredentials, exportStudentsCsv, getStudentById, listPromotionSemesters, listPromotionStudents, promoteStudents, listStudentUploadBatches, createStudentUploadBatch, renameStudentUploadBatch, deleteStudentUploadBatch } from '../controllers/studentController.js';
import { getStudentActivityByAdmin, getStudentStats, getStudentVideosWatched, getStudentCoursesEnrolled } from '../controllers/activityController.js';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/auth.js';
import { getStudentAccess, getStudentAccessPolicy, updateStudentAccess, updateStudentAccessPolicy } from '../controllers/studentAccessController.js';
import { authorizeStudent } from '../middleware/authorization.js';
import { uploadLimiter, bulkOperationLimiter } from '../middleware/rateLimiter.js';
import { cacheJsonResponse, invalidateResponseCache } from '../middleware/responseCache.js';
import { studentQuickPrepReport } from '../services/questService.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/list', requireAuth, requireCoordinatorPermission('coordinator.students.view'), cacheJsonResponse({ namespace: 'students', ttlSeconds: Number(process.env.RESPONSE_CACHE_STUDENTS_TTL_SECONDS || 30) }), listAllStudents);
router.get('/access-policy', requireAuth, requireCoordinatorPermission('coordinator.students.create'), getStudentAccessPolicy);
router.put('/access-policy', requireAuth, requireAdmin, updateStudentAccessPolicy);
router.get('/export', requireAuth, requireCoordinatorPermission('coordinator.students.view'), exportStudentsCsv);
router.get('/upload-batches', requireAuth, requireCoordinatorPermission('coordinator.students.bulk-lists'), listStudentUploadBatches);
router.post('/upload-batches', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), createStudentUploadBatch);
router.patch('/upload-batches/:batchId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), renameStudentUploadBatch);
router.delete('/upload-batches/:batchId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), deleteStudentUploadBatch);
router.get('/special', requireAuth, requireCoordinatorPermission('coordinator.students.view'), listAllSpecialStudents);
router.get('/special/:eventId', requireAuth, requireCoordinatorPermission('coordinator.students.view'), listSpecialStudentsByEvent);
router.get('/promotion/semesters', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), listPromotionSemesters);
router.get('/promotion/semesters/:semester/students', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), listPromotionStudents);
router.post('/promotion/promote', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), bulkOperationLimiter, invalidateResponseCache('students'), promoteStudents);
router.get('/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.profile'), getStudentById);
// SECURITY: Add authorization check for student-specific data
router.get('/:studentId/activity', requireAuth, authorizeStudent('studentId'), getStudentActivityByAdmin);
router.get('/:studentId/stats', requireAuth, authorizeStudent('studentId'), getStudentStats);
router.get('/:studentId/videos-watched', requireAuth, authorizeStudent('studentId'), getStudentVideosWatched);
router.get('/:studentId/courses-enrolled', requireAuth, authorizeStudent('studentId'), getStudentCoursesEnrolled);
// Staff-only: the student's QuickPrep sheets for the profile's Quick Prep tab (coordinators see only their own students).
router.get('/:studentId/quickprep', requireAuth, requireCoordinatorPermission('coordinator.students.profile'), async (req, res, next) => {
	try {
		res.set('Cache-Control', 'private, no-store');
		res.json(await studentQuickPrepReport(req.user, req.params.studentId));
	} catch (error) {
		if (error?.status || error?.statusCode) return res.status(error.status || error.statusCode).json({ error: error.message });
		next(error);
	}
});
// SECURITY: Rate limit bulk operations
router.post('/check', requireAuth, requireCoordinatorPermission('coordinator.students.create'), uploadLimiter, bulkOperationLimiter, upload.single('file'), checkStudentsCsv);
router.post('/upload', requireAuth, requireCoordinatorPermission('coordinator.students.create'), uploadLimiter, bulkOperationLimiter, invalidateResponseCache('students'), upload.single('file'), uploadStudentsCsv);
router.post('/create', requireAuth, requireCoordinatorPermission('coordinator.students.create'), invalidateResponseCache('students'), async (req, res) => {
	return createStudent(req, res);
});
router.post('/bulk-delete', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), bulkOperationLimiter, invalidateResponseCache('students'), bulkDeleteStudents);
router.post('/resend-credentials', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), bulkOperationLimiter, resendStudentCredentials);
router.get('/:studentId/access', requireAuth, requireAdmin, getStudentAccess);
router.patch('/:studentId/access', requireAuth, requireAdmin, invalidateResponseCache('students'), updateStudentAccess);
router.put('/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), invalidateResponseCache('students'), updateStudent);
router.delete('/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), invalidateResponseCache('students'), deleteStudent);

export default router;
