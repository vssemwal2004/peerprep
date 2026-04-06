import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  listEmailTemplates,
  getEmailTemplate,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
} from '../controllers/emailTemplateController.js';

const router = Router();

router.use(requireAuth, requireAdmin);
router.get('/', listEmailTemplates);
router.post('/', createEmailTemplate);
router.get('/:id', getEmailTemplate);
router.put('/:id', updateEmailTemplate);
router.delete('/:id', deleteEmailTemplate);

export default router;
