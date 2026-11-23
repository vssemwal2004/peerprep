import { Router } from 'express';
import multer from 'multer';
import { HttpError } from '../../utils/errors.js';
import { pendingResumeAction } from '../../middleware/pendingResumeAction.js';
import { IMPORT_LIMIT, importResume } from './resumeImport.service.js';

const receive = multer({ storage: multer.memoryStorage(), limits: { fileSize: IMPORT_LIMIT, files: 1, fields: 1, fieldSize: 100, parts: 3 } }).single('file');
const router = Router();
router.post('/', pendingResumeAction(), (req, res, next) => {
  receive(req, res, (error) => {
    if (error) {
      return next(error.code === 'LIMIT_FILE_SIZE' ? new HttpError(413, 'Choose a file smaller than 5 MB.') : new HttpError(400, 'Choose one PDF or Word (.docx) file.'));
    }
    importResume(req.file).then((draft) => res.json(draft)).catch(next);
  });
});
export default router;

