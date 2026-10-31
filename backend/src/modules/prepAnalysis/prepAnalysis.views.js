// Saved Prep Analysis views: list, save, rename or re-save, share and delete. An admin sees
// their own views and the views other admins shared; only the owner can change a view.

import mongoose from 'mongoose';
import PrepAnalysisView from '../../models/PrepAnalysisView.js';
import { HttpError } from '../../utils/errors.js';
import { allowedModules } from './fields.js';

export const VIEW_LIMITS = Object.freeze({ perOwner: 50, nameLength: 80, maxBytes: 64 * 1024, listed: 200 });

const ownerOf = (user) => String(user?._id || user?.id || '');
const cleanName = (value) => String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, VIEW_LIMITS.nameLength);

function publicView(view, user) {
  return {
    id: String(view._id), name: view.name, area: view.area, state: view.state, layout: view.layout || [],
    shared: Boolean(view.shared), mine: String(view.ownerId) === ownerOf(user), ownerName: view.ownerName || '',
    updatedAt: view.updatedAt,
  };
}

/** The saved parts of a view, checked: a known licensed area, plain objects, and a size limit. */
export function validateViewBody(body = {}, permissions, { partial = false } = {}) {
  const result = {};
  if (!partial || body.name !== undefined) {
    result.name = cleanName(body.name);
    if (!result.name) throw new HttpError(400, 'Give the view a name.');
  }
  if (!partial || body.state !== undefined || body.area !== undefined) {
    const areas = new Set(['all', ...allowedModules(permissions).filter((key) => key !== 'student')]);
    const area = String(body.area || body.state?.area || '');
    if (!areas.has(area)) throw new HttpError(400, 'Unknown analysis area.');
    if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) throw new HttpError(400, 'A view needs its filters.');
    result.area = area;
    result.state = body.state;
  }
  if (body.layout !== undefined) {
    if (!Array.isArray(body.layout)) throw new HttpError(400, 'A view layout is a list of charts.');
    result.layout = body.layout;
  }
  if (body.shared !== undefined) result.shared = body.shared === true;
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > VIEW_LIMITS.maxBytes) throw new HttpError(413, 'This view is too large to save.');
  return result;
}

export async function listViews({ user }) {
  const owner = ownerOf(user);
  const views = await PrepAnalysisView.find({ $or: [{ ownerId: owner }, { shared: true }] })
    .sort({ updatedAt: -1 }).limit(VIEW_LIMITS.listed).lean();
  return { views: views.map((view) => publicView(view, user)), limit: VIEW_LIMITS.perOwner };
}

export async function createView({ user, permissions, body }) {
  const owner = ownerOf(user);
  const fields = validateViewBody(body, permissions);
  if (await PrepAnalysisView.countDocuments({ ownerId: owner }) >= VIEW_LIMITS.perOwner) {
    throw new HttpError(409, `You can keep up to ${VIEW_LIMITS.perOwner} views. Delete one first.`);
  }
  const view = await PrepAnalysisView.create({ ...fields, ownerId: owner, ownerName: user?.name || '' });
  return publicView(view.toObject(), user);
}

async function ownView(user, id) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'View not found.');
  const view = await PrepAnalysisView.findById(id).lean();
  if (!view || (String(view.ownerId) !== ownerOf(user) && !view.shared)) throw new HttpError(404, 'View not found.');
  if (String(view.ownerId) !== ownerOf(user)) throw new HttpError(403, 'Only the admin who saved this view can change it.');
  return view;
}

export async function updateView({ user, permissions, id, body }) {
  await ownView(user, id);
  const fields = validateViewBody(body, permissions, { partial: true });
  const view = await PrepAnalysisView.findByIdAndUpdate(id, { $set: fields }, { new: true }).lean();
  return publicView(view, user);
}

export async function deleteView({ user, id }) {
  await ownView(user, id);
  await PrepAnalysisView.deleteOne({ _id: id });
  return { deleted: true };
}
