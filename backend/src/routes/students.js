import { Router } from 'express';
import multer from 'multer';
import { uploadStudentsCsv, createStudent, checkStudentsCsv, listAllStudents, listAllSpecialStudents, listSpecialStudentsByEvent, deleteStudent, updateStudent, bulkDeleteStudents, resendStudentCredentials, exportStudentsCsv, getStudentById, listPromotionSemesters, listPromotionStudents, promoteStudents } from '../controllers/studentController.js';
import { getStudentActivityByAdmin, getStudentStats, getStudentVideosWatched, getStudentCoursesEnrolled } from '../controllers/activityController.js';
import { requireAuth, requireAdmin, requireAdminOrCoordinator, requireCoordinatorPermission } from '../middleware/auth.js';
import { authorizeStudent } from '../middleware/authorization.js';
import { uploadLimiter, bulkOperationLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/list', requireAuth, requireAdminOrCoordinator, listAllStudents);
router.get('/export', requireAuth, requireAdminOrCoordinator, exportStudentsCsv);
router.get('/special', requireAuth, requireAdmin, listAllSpecialStudents);
router.get('/special/:eventId', requireAuth, requireAdmin, listSpecialStudentsByEvent);
router.get('/promotion/semesters', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), listPromotionSemesters);
router.get('/promotion/semesters/:semester/students', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), listPromotionStudents);
router.post('/promotion/promote', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), bulkOperationLimiter, promoteStudents);
router.get('/:studentId', requireAuth, requireAdminOrCoordinator, getStudentById);
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
router.post('/bulk-delete', requireAuth, requireAdmin, bulkOperationLimiter, bulkDeleteStudents);
router.post('/resend-credentials', requireAuth, requireAdmin, bulkOperationLimiter, resendStudentCredentials);
router.put('/:studentId', requireAuth, requireAdmin, updateStudent);
router.delete('/:studentId', requireAuth, requireAdmin, deleteStudent);

export default router;
