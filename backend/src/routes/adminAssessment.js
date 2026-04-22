import { Router } from 'express';
import { requireAuth, requireAdmin, requireAdminOrCoordinator } from '../middleware/auth.js';
import {
  createAssessment,
  listAssessments,
  getAssessment,
  updateAssessment,
  deleteAssessment,
  getAssessmentReports,
  exportAssessmentReports,
} from '../controllers/assessmentController.js';
import { getAssessmentRules, upsertAssessmentRules } from '../controllers/assessmentRulesController.js';
import {
  getLibraryQuestion,
  listLibraryQuestions,
  resolveLibraryQuestions,
  createLibraryQuestion,
  createLibraryQuestionsBulk,
} from '../controllers/questionLibraryController.js';

const router = Router();

router.post('/assessment/create', requireAuth, requireAdminOrCoordinator, createAssessment);
router.get('/assessment/list', requireAuth, requireAdminOrCoordinator, listAssessments);
router.get('/assessment/reports', requireAuth, requireAdminOrCoordinator, getAssessmentReports);
router.get('/assessment/reports/export', requireAuth, requireAdminOrCoordinator, exportAssessmentReports);
router.get('/assessment/rules', requireAuth, requireAdmin, getAssessmentRules);
router.put('/assessment/rules', requireAuth, requireAdmin, upsertAssessmentRules);
router.get('/library/questions', requireAuth, requireAdminOrCoordinator, listLibraryQuestions);
router.post('/library/questions', requireAuth, requireAdminOrCoordinator, createLibraryQuestion);
router.post('/library/questions/bulk', requireAuth, requireAdminOrCoordinator, createLibraryQuestionsBulk);
router.get('/library/questions/:id', requireAuth, requireAdminOrCoordinator, getLibraryQuestion);
router.post('/library/questions/resolve', requireAuth, requireAdminOrCoordinator, resolveLibraryQuestions);
router.get('/assessment/:id', requireAuth, requireAdminOrCoordinator, getAssessment);
router.put('/assessment/:id', requireAuth, requireAdminOrCoordinator, updateAssessment);
router.delete('/assessment/:id', requireAuth, requireAdminOrCoordinator, deleteAssessment);

export default router;
