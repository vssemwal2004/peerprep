import { Router } from 'express';
import multer from 'multer';
import { uploadStudentsCsv, createStudent, checkStudentsCsv, listAllStudents, listAllSpecialStudents, listSpecialStudentsByEvent, deleteStudent, updateStudent, exportStudentsCsv } from '../controllers/studentController.js';
import { getStudentActivityByAdmin, getStudentStats, getStudentVideosWatched, getStudentCoursesEnrolled } from '../controllers/activityController.js';
import { requireAuth, requireAdmin, requireAdminOrCoordinator } from '../middleware/auth.js';
import { authorizeStudent } from '../middleware/authorization.js';
import { uploadLimiter, bulkOperationLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/list', requireAuth, requireAdminOrCoordinator, listAllStudents);
router.get('/export', requireAuth, requireAdminOrCoordinator, exportStudentsCsv);
router.get('/special', requireAuth, requireAdmin, listAllSpecialStudents);
router.get('/special/:eventId', requireAuth, requireAdmin, listSpecialStudentsByEvent);
// SECURITY: Add authorization check for student-specific data
router.get('/:studentId/activity', requireAuth, authorizeStudent('studentId'), getStudentActivityByAdmin);
router.get('/:studentId/stats', requireAuth, authorizeStudent('studentId'), getStudentStats);
router.get('/:studentId/videos-watched', requireAuth, authorizeStudent('studentId'), getStudentVideosWatched);
router.get('/:studentId/courses-enrolled', requireAuth, authorizeStudent('studentId'), getStudentCoursesEnrolled);
// SECURITY: Rate limit bulk operations
router.post('/check', requireAuth, requireAdmin, uploadLimiter, bulkOperationLimiter, upload.single('file'), checkStudentsCsv);
router.post('/upload', requireAuth, requireAdmin, uploadLimiter, bulkOperationLimiter, upload.single('file'), uploadStudentsCsv);
router.post('/create', requireAuth, requireAdmin, async (req, res) => {
	return createStudent(req, res);
});
router.put('/:studentId', requireAuth, requireAdmin, updateStudent);
router.delete('/:studentId', requireAuth, requireAdmin, deleteStudent);

export default router;