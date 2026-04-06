import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireAdminOrCoordinator } from '../middleware/auth.js';
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
router.get('/', requireAuth, requireAdminOrCoordinator, listSemesters);
router.post('/', requireAuth, requireAdminOrCoordinator, createSemester);
router.put('/:id', requireAuth, requireAdminOrCoordinator, updateSemester);
router.delete('/:id', requireAuth, requireAdminOrCoordinator, deleteSemester);
router.post('/reorder', requireAuth, requireAdminOrCoordinator, reorderSemesters);
router.post('/cleanup-duplicates', requireAuth, requireAdminOrCoordinator, cleanupDuplicateSemesters);

// Subject routes (nested under semester)
router.post('/:semesterId/subjects', requireAuth, requireAdminOrCoordinator, addSubject);
router.put('/:semesterId/subjects/:subjectId', requireAuth, requireAdminOrCoordinator, updateSubject);
router.delete('/:semesterId/subjects/:subjectId', requireAuth, requireAdminOrCoordinator, deleteSubject);
router.post('/:semesterId/subjects/reorder', requireAuth, requireAdminOrCoordinator, reorderSubjects);

// Chapter routes (nested under subject)
router.post('/:semesterId/subjects/:subjectId/chapters', requireAuth, requireAdminOrCoordinator, addChapter);
router.put('/:semesterId/subjects/:subjectId/chapters/:chapterId', requireAuth, requireAdminOrCoordinator, updateChapter);
router.delete('/:semesterId/subjects/:subjectId/chapters/:chapterId', requireAuth, requireAdminOrCoordinator, deleteChapter);
router.post('/:semesterId/subjects/:subjectId/chapters/reorder', requireAuth, requireAdminOrCoordinator, reorderChapters);

// Topic routes (nested under chapter) - with file upload support
router.post('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics', requireAuth, requireAdminOrCoordinator, upload.fields([
  { name: 'notesPDF', maxCount: 1 },
  { name: 'questionPDF', maxCount: 1 }
]), addTopic);
router.put('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics/:topicId', requireAuth, requireAdminOrCoordinator, upload.fields([
  { name: 'notesPDF', maxCount: 1 },
  { name: 'questionPDF', maxCount: 1 }
]), updateTopic);
router.delete('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics/:topicId', requireAuth, requireAdminOrCoordinator, deleteTopic);
router.post('/:semesterId/subjects/:subjectId/chapters/:chapterId/topics/reorder', requireAuth, requireAdminOrCoordinator, reorderTopics);

export default router;
