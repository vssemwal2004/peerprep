// Platform guides (the ⓘ page tours on every student, coordinator and admin page): each
// person's progress. The guides themselves live in the browser (frontend src/guide).

import mongoose from 'mongoose';
import GuideProgress from '../../models/GuideProgress.js';
import { HttpError } from '../../utils/errors.js';

export const GUIDE_PROGRESS_LIMITS = Object.freeze({ ids: 600, idLength: 80 });
const GUIDE_ID = /^[a-z0-9:._-]{1,80}$/i;

const userIdOf = (user) => {
  const id = String(user?._id || user?.id || '');
  if (!mongoose.isValidObjectId(id)) throw new HttpError(401, 'Sign in again.');
  return new mongoose.Types.ObjectId(id);
};

const publicProgress = (doc) => ({
  completed: doc?.completed || [],
  dismissed: doc?.dismissed || [],
  nudgesOff: Boolean(doc?.nudgesOff),
});

export async function getPlatformGuideProgress(user) {
  return publicProgress(await GuideProgress.findOne({ userId: userIdOf(user) }).lean());
}

/**
 * Finished tours and closed nudges are only ever added; `nudgesOff` can be switched both ways.
 * body: { completed?: [id], dismissed?: [id], nudgesOff?: boolean }
 */
export function validatePlatformGuideProgress(body = {}) {
  const list = (value) => (Array.isArray(value)
    ? [...new Set(value.map((entry) => String(entry ?? '').trim()).filter((id) => GUIDE_ID.test(id)))].slice(0, GUIDE_PROGRESS_LIMITS.ids)
    : []);
  const update = { completed: list(body?.completed), dismissed: list(body?.dismissed) };
  if (typeof body?.nudgesOff === 'boolean') update.nudgesOff = body.nudgesOff;
  return update;
}

export async function updatePlatformGuideProgress(user, body) {
  const { completed, dismissed, ...flags } = validatePlatformGuideProgress(body);
  const userId = userIdOf(user);
  const add = {};
  if (completed.length) add.completed = { $each: completed };
  if (dismissed.length) add.dismissed = { $each: dismissed };
  const doc = await GuideProgress.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: { userId },
      ...(Object.keys(add).length ? { $addToSet: add } : {}),
      ...(Object.keys(flags).length ? { $set: flags } : {}),
    },
    { upsert: true, new: true },
  ).lean();
  return publicProgress(doc);
}
