import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';
import {
  listSemesters,
  createSemester,
  updateSemester,
  deleteSemester,
  reorderSemesters,
  addSubject,
  updateSubject,
  deleteSubject,
  reorderSubjects,
  addChapter,
  updateChapter,
  deleteChapter,
  reorderChapters,
  addTopic,
  updateTopic,
  deleteTopic,
  reorderTopics
} from '../controllers/subjectController.js';
import { cleanupDuplicateSemesters } from '../controllers/cleanupController.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Semester routes
router.get('/', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), listSemesters);
router.post('/', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), createSemester);
router.put('/:id', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), updateSemester);
router.delete('/:id', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), deleteSemester);
router.post('/reorder', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), reorderSemesters);
router.post('/cleanup-duplicates', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), cleanupDuplicateSemesters);

// Subject routes (nested under semester)
router.post('/:semesterId/subjects', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), addSubject);
router.put('/:semesterId/subjects/:subjectId', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), updateSubject);
router.delete('/:semesterId/subjects/:subjectId', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), deleteSubject);
router.post('/:semesterId/subjects/reorder', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), reorderSubjects);

// Chapter routes (nested under subject)
router.post('/:semesterId/subjects/:subjectId/chapters', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), addChapter);
router.put('/:semesterId/subjects/:subjectId/chapters/:chapterId', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), updateChapter);
router.delete('/:semesterId/subjects/:subjectId/chapters/:chapterId', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), deleteChapter);
router.post('/:semesterId/subjects/:subjectId/chapters/reorder', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), reorderChapters);

// Topic routes (nested under chapter) - with file upload support
router.post('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), upload.fields([
  { name: 'notesPDF', maxCount: 1 },
  { name: 'questionPDF', maxCount: 1 }
]), addTopic);
router.put('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics/:topicId', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), upload.fields([
  { name: 'notesPDF', maxCount: 1 },
  { name: 'questionPDF', maxCount: 1 }
]), updateTopic);
router.delete('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics/:topicId', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), deleteTopic);
router.post('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics/reorder', requireAuth, requireCoordinatorPermission('coordinator.learning.manage'), reorderTopics);

export default router;
