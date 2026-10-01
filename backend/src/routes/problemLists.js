import { Router } from 'express';
import {
  createProblemList,
  deleteProblemList,
  listProblemLists,
  setProblemListMembership,
  updateProblemList,
} from '../controllers/problemListController.js';
import { requireAuth, requireFullStudent, requireStudent } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth, requireStudent, requireFullStudent);
router.get('/', listProblemLists);
router.post('/', createProblemList);
router.patch('/:id', updateProblemList);
router.delete('/:id', deleteProblemList);
router.patch('/:id/problems/:problemId', setProblemListMembership);

export default router;
