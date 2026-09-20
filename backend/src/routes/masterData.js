import { Router } from 'express';
import {
  createMasterData,
  deleteMasterData,
  listMasterData,
  syncMasterDataFromStudents,
  updateMasterData,
} from '../controllers/masterDataController.js';
import { requireAnyCoordinatorPermission, requireAuth, requireCoordinatorPermission } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireAnyCoordinatorPermission('coordinator.master-data.manage', 'coordinator.students.create'), listMasterData);
router.post('/', requireAuth, requireCoordinatorPermission('coordinator.master-data.manage'), createMasterData);
router.post('/sync', requireAuth, requireCoordinatorPermission('coordinator.master-data.manage'), syncMasterDataFromStudents);
router.put('/:id', requireAuth, requireCoordinatorPermission('coordinator.master-data.manage'), updateMasterData);
router.delete('/:id', requireAuth, requireCoordinatorPermission('coordinator.master-data.manage'), deleteMasterData);

export default router;
