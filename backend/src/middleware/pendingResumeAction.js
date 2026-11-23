import { HttpError } from '../utils/errors.js';

/** Let students repeat an action as soon as their previous request finishes. */
export function pendingResumeAction() {
  const pending = new Set();
  return (req, res, next) => {
    const student = `${req.tenant?.universityId || req.user.universityId || ''}:${req.user._id}`;
    if (pending.has(student)) {
      return next(new HttpError(409, 'This request is already running. Wait for it to finish, then try again.'));
    }
    pending.add(student);
    const release = () => {
      pending.delete(student);
      res.off('close', release);
      res.off('finish', release);
    };
    res.once('close', release);
    res.once('finish', release);
    return next();
  };
}
