import { Router } from 'express';
import {
  createMasterData,
  deleteMasterData,
  listMasterData,
  syncMasterDataFromStudents,
  updateMasterData,
} from '../controllers/masterDataController.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireAdmin, listMasterData);
router.post('/', requireAuth, requireAdmin, createMasterData);
router.post('/sync', requireAuth, requireAdmin, syncMasterDataFromStudents);
router.put('/:id', requireAuth, requireAdmin, updateMasterData);
router.delete('/:id', requireAuth, requireAdmin, deleteMasterData);

export default router;
