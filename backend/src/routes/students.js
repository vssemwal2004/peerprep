import { Router } from 'express';
import multer from 'multer';
import { uploadStudentsCsv, createStudent, checkStudentsCsv, listAllStudents, listAllSpecialStudents, listSpecialStudentsByEvent, deleteStudent, updateStudent, bulkDeleteStudents, resendStudentCredentials, exportStudentsCsv, getStudentById, listPromotionSemesters, listPromotionStudents, promoteStudents, listStudentUploadBatches, createStudentUploadBatch, renameStudentUploadBatch, deleteStudentUploadBatch } from '../controllers/studentController.js';
import { getStudentActivityByAdmin, getStudentStats, getStudentVideosWatched, getStudentCoursesEnrolled } from '../controllers/activityController.js';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import { authorizeStudent } from '../middleware/authorization.js';
import { uploadLimiter, bulkOperationLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/list', requireAuth, requireCoordinatorPermission('coordinator.students.view'), listAllStudents);
router.get('/export', requireAuth, requireCoordinatorPermission('coordinator.students.view'), exportStudentsCsv);
router.get('/upload-batches', requireAuth, requireCoordinatorPermission('coordinator.students.bulk-lists'), listStudentUploadBatches);
router.post('/upload-batches', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), createStudentUploadBatch);
router.patch('/upload-batches/:batchId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), renameStudentUploadBatch);
router.delete('/upload-batches/:batchId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), deleteStudentUploadBatch);
router.get('/special', requireAuth, requireCoordinatorPermission('coordinator.students.view'), listAllSpecialStudents);
router.get('/special/:eventId', requireAuth, requireCoordinatorPermission('coordinator.students.view'), listSpecialStudentsByEvent);
router.get('/promotion/semesters', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), listPromotionSemesters);
router.get('/promotion/semesters/:semester/students', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), listPromotionStudents);
router.post('/promotion/promote', requireAuth, requireCoordinatorPermission('coordinator.students.promote'), bulkOperationLimiter, promoteStudents);
router.get('/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.profile'), getStudentById);
// SECURITY: Add authorization check for student-specific data
router.get('/:studentId/activity', requireAuth, authorizeStudent('studentId'), getStudentActivityByAdmin);
router.get('/:studentId/stats', requireAuth, authorizeStudent('studentId'), getStudentStats);
router.get('/:studentId/videos-watched', requireAuth, authorizeStudent('studentId'), getStudentVideosWatched);
router.get('/:studentId/courses-enrolled', requireAuth, authorizeStudent('studentId'), getStudentCoursesEnrolled);
// SECURITY: Rate limit bulk operations
router.post('/check', requireAuth, requireCoordinatorPermission('coordinator.students.create'), uploadLimiter, bulkOperationLimiter, upload.single('file'), checkStudentsCsv);
router.post('/upload', requireAuth, requireCoordinatorPermission('coordinator.students.create'), uploadLimiter, bulkOperationLimiter, upload.single('file'), uploadStudentsCsv);
router.post('/create', requireAuth, requireCoordinatorPermission('coordinator.students.create'), async (req, res) => {
	return createStudent(req, res);
});
router.post('/bulk-delete', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), bulkOperationLimiter, bulkDeleteStudents);
router.post('/resend-credentials', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), bulkOperationLimiter, resendStudentCredentials);
router.put('/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), updateStudent);
router.delete('/:studentId', requireAuth, requireCoordinatorPermission('coordinator.students.manage'), deleteStudent);

export default router;
