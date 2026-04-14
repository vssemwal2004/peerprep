import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
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
} from '../controllers/questionLibraryController.js';

const router = Router();

router.post('/assessment/create', requireAuth, requireAdmin, createAssessment);
router.get('/assessment/list', requireAuth, requireAdmin, listAssessments);
router.get('/assessment/reports', requireAuth, requireAdmin, getAssessmentReports);
router.get('/assessment/reports/export', requireAuth, requireAdmin, exportAssessmentReports);
router.get('/assessment/rules', requireAuth, requireAdmin, getAssessmentRules);
router.put('/assessment/rules', requireAuth, requireAdmin, upsertAssessmentRules);
router.get('/library/questions', requireAuth, requireAdmin, listLibraryQuestions);
router.get('/library/questions/:id', requireAuth, requireAdmin, getLibraryQuestion);
router.post('/library/questions/resolve', requireAuth, requireAdmin, resolveLibraryQuestions);
router.get('/assessment/:id', requireAuth, requireAdmin, getAssessment);
router.put('/assessment/:id', requireAuth, requireAdmin, updateAssessment);
router.delete('/assessment/:id', requireAuth, requireAdmin, deleteAssessment);

export default router;

