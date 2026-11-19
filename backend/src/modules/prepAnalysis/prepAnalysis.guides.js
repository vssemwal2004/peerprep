// Prep Analysis guides: each admin's progress (guides finished, getting-started steps done, the
// welcome card and checklist closed). The guides themselves live in the browser.

import mongoose from 'mongoose';
import PrepAnalysisGuideProgress from '../../models/PrepAnalysisGuideProgress.js';
import { HttpError } from '../../utils/errors.js';

export const GUIDE_LIMITS = Object.freeze({ ids: 400, idLength: 80 });
// The getting-started checklist's steps (frontend guide/checklist.js).
export const GUIDE_MILESTONES = Object.freeze(['pageTour', 'filter', 'chartGuide', 'studentList', 'email', 'download', 'savedView']);

const userIdOf = (user) => {
  const id = String(user?._id || user?.id || '');
  if (!mongoose.isValidObjectId(id)) throw new HttpError(401, 'Sign in again.');
  return new mongoose.Types.ObjectId(id);
};
const GUIDE_ID = /^[a-z0-9:_-]{1,80}$/i;

function publicProgress(doc) {
  return {
    completed: doc?.completed || [],
    milestones: doc?.milestones || [],
    welcomeDismissed: Boolean(doc?.welcomeDismissed),
    checklistDismissed: Boolean(doc?.checklistDismissed),
  };
}

export async function getGuideProgress(user) {
  return publicProgress(await PrepAnalysisGuideProgress.findOne({ userId: userIdOf(user) }).lean());
}

/**
 * Adds finished guides and done milestones (never removes them), and sets the two "closed"
 * switches. body: { completed?: [id], milestones?: [key], welcomeDismissed?, checklistDismissed? }.
 */
export function validateGuideProgress(body = {}) {
  const list = (value, test) => (Array.isArray(value) ? [...new Set(value.map((entry) => String(entry || '').trim()).filter(test))].slice(0, GUIDE_LIMITS.ids) : []);
  const update = {
    completed: list(body.completed, (id) => GUIDE_ID.test(id)),
    milestones: list(body.milestones, (key) => GUIDE_MILESTONES.includes(key)),
  };
  for (const key of ['welcomeDismissed', 'checklistDismissed']) if (typeof body[key] === 'boolean') update[key] = body[key];
  return update;
}

export async function updateGuideProgress(user, body) {
  const { completed, milestones, ...flags } = validateGuideProgress(body);
  const doc = await PrepAnalysisGuideProgress.findOneAndUpdate(
    { userId: userIdOf(user) },
    {
      $setOnInsert: { userId: userIdOf(user) },
      ...(completed.length || milestones.length ? { $addToSet: { ...(completed.length ? { completed: { $each: completed } } : {}), ...(milestones.length ? { milestones: { $each: milestones } } : {}) } } : {}),
      ...(Object.keys(flags).length ? { $set: flags } : {}),
    },
    { upsert: true, new: true },
  ).lean();
  return publicProgress(doc);
}
