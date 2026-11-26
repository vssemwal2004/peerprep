// Prep Mock bulk actions (2026-11-26): the Master Admin assigns own (platform) students to many
// mocks at once, and publishes / unpublishes many mocks at once. Platform (control plane) only.
//
//   resolveMockScope      scope → the platform mocks it covers ({ mockIds } | { company[, role] } | { all })
//   bulkChangeOwnStudents add / remove / re-date own students on every mock in a scope
//   bulkPublishMocks      the same checks as the single publish toggle, per mock; failures are listed
//   bulkUnpublishMocks    mirrors the single unpublish
//
// Every per-mock write is atomic (prepMockOwnStudents.applyGrantChange for grants, the mock document
// for publishing), so a bulk call and single-mock edits running together never lose each other's
// changes. Requests are capped (BULK_LIMITS) and refused with a clear 400 before anything is written.
import Assessment from '../models/Assessment.js';
import { isControlPlane } from '../platform/deployment.js';
import {
  applyMockPublish, applyMockUnpublish, assertMockPublisher, isMockLive, mockPublishProblem,
} from '../controllers/assessmentController.js';
import {
  applyGrantChange, assertOwnStudentAdmin, OWN_STUDENT_LIMITS, ownAccessFrom, platformStudents, studentChangeFrom, turnOnPrepMock,
} from './prepMockOwnStudents.js';
import { HttpError } from '../utils/errors.js';

export const BULK_LIMITS = Object.freeze({ maxMocks: 1000, maxStudents: 20000, maxPairs: 200000 });
const STATUSES = ['published', 'draft'];
const WRITE_CONCURRENCY = 8;
const PUBLISH_CONCURRENCY = 4;
const SCOPE_FIELDS = '_id title company role lifecycleStatus isVisible createdAt';
const fmt = (value) => Number(value).toLocaleString('en-US');

/** Runs `work` over `items` with at most `limit` in flight; results keep the input order. */
async function eachLimited(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/** A case-insensitive match for a company or role name, ignoring outer and repeated spaces. */
function nameMatcher(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^\\s*${words.join('\\s+')}\\s*$`, 'i');
}

function statusFilterFrom(statuses) {
  if (statuses === undefined || statuses === null) return [];
  if (!Array.isArray(statuses) || statuses.some((status) => !STATUSES.includes(status))) {
    throw new HttpError(400, 'Statuses can be "published" and/or "draft".');
  }
  return [...new Set(statuses)];
}
const statusOf = (mock) => (isMockLive(mock) ? 'published' : 'draft');

/**
 * The platform Prep Mocks (kind 'mock', never a university copy) a scope covers:
 *   { mockIds: [id, …] }            those mocks (unknown ids are returned in notFound)
 *   { company: 'Acme' }             every mock of the company (case-insensitive)
 *   { company: 'Acme', role: 'SDE 1' }  every mock of that company role
 *   { all: true }                   every mock
 * plus optional statuses: ['published'] | ['draft'] | both. At most BULK_LIMITS.maxMocks mocks.
 * Returns { mocks: [{ _id, title, company, role, lifecycleStatus, isVisible }], notFound: [id] }.
 */
export async function resolveMockScope(scope, { maxMocks = BULK_LIMITS.maxMocks } = {}) {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) throw new HttpError(400, 'Choose which mocks: mockIds, a company (and role) or all.');
  const byIds = scope.mockIds !== undefined;
  const company = typeof scope.company === 'string' ? scope.company.trim() : '';
  const role = typeof scope.role === 'string' ? scope.role.trim() : '';
  const all = scope.all === true;
  if ([byIds, Boolean(company), all].filter(Boolean).length !== 1) throw new HttpError(400, 'Choose which mocks: mockIds, a company (and role) or all.');
  if (role && !company) throw new HttpError(400, 'Choose the company of this role.');
  const statuses = statusFilterFrom(scope.statuses);
  const base = { kind: 'mock', platformShared: { $ne: true } };

  if (byIds) {
    if (!Array.isArray(scope.mockIds)) throw new HttpError(400, 'mockIds must be a list.');
    const ids = [...new Set(scope.mockIds.map((id) => String(id || '').trim()).filter(Boolean))];
    if (ids.length > maxMocks) throw new HttpError(400, `Choose up to ${fmt(maxMocks)} mocks at once.`);
    const valid = ids.filter((id) => /^[0-9a-f]{24}$/i.test(id));
    const found = valid.length ? await Assessment.find({ ...base, _id: { $in: valid } }).select(SCOPE_FIELDS).sort({ createdAt: -1 }).lean() : [];
    const seen = new Set(found.map((mock) => String(mock._id)));
    return {
      mocks: statuses.length ? found.filter((mock) => statuses.includes(statusOf(mock))) : found,
      notFound: ids.filter((id) => !seen.has(id)),
    };
  }

  const filter = { ...base };
  if (company) filter.company = nameMatcher(company);
  if (role) filter.role = nameMatcher(role);
  if (statuses.length === 1) {
    Object.assign(filter, statuses[0] === 'published'
      ? { lifecycleStatus: 'published', isVisible: { $ne: false } }
      : { $or: [{ lifecycleStatus: { $ne: 'published' } }, { isVisible: false }] });
  }
  const mocks = await Assessment.find(filter).select(SCOPE_FIELDS).sort({ createdAt: -1 }).limit(maxMocks + 1).lean();
  if (mocks.length > maxMocks) throw new HttpError(400, `This covers more than ${fmt(maxMocks)} mocks. Choose a company, a role or fewer mocks.`);
  return { mocks, notFound: [] };
}

const card = (mock) => ({ _id: String(mock._id), title: mock.title || '' });

/* ------------------------------------------------------------------ own students */

/**
 * Bulk "Assign own students": body { scope, add, remove, startTime, endTime, updateExisting }.
 * For every mock in scope: new students are granted with the window (startTime/endTime, missing or
 * '' = no limit); with updateExisting, students already on the mock get that window too; `remove`
 * drops grants. Added students get Prep Mock turned on. Master Admin only.
 */
export async function bulkChangeOwnStudents(body = {}, user) {
  assertOwnStudentAdmin(user);
  const { add, remove } = studentChangeFrom(body, { maxChange: BULK_LIMITS.maxStudents });
  const updateExisting = body.updateExisting === true;
  if (!add.length && !remove.length && !updateExisting) throw new HttpError(400, 'Choose students to add or remove, or change the dates of students already assigned.');
  const window = ownAccessFrom(body, null);
  const { mocks, notFound: mocksNotFound } = await resolveMockScope(body.scope);
  const pairs = mocks.length * (add.length + remove.length);
  if (pairs > BULK_LIMITS.maxPairs) {
    throw new HttpError(400, `That is ${fmt(pairs)} mock-student changes; up to ${fmt(BULK_LIMITS.maxPairs)} at once. Choose fewer mocks or students.`);
  }

  const found = await platformStudents(add);
  const addIds = found.map((student) => student._id);
  // Refuse up front when a mock would pass its student limit (checked again atomically per write).
  if (addIds.length && mocks.length) {
    const over = await Assessment.aggregate([
      { $match: { _id: { $in: mocks.map((mock) => mock._id) } } },
      { $project: { title: 1, students: { $size: { $setDifference: [
        { $setUnion: [{ $ifNull: ['$ownStudents', []] }, { $ifNull: ['$ownGrants.student', []] }, { $literal: addIds }] },
        { $literal: remove },
      ] } } } },
      { $match: { students: { $gt: OWN_STUDENT_LIMITS.maxStudents } } },
      { $limit: 5 },
    ]);
    if (over.length) {
      throw new HttpError(400, `A mock can have up to ${fmt(OWN_STUDENT_LIMITS.maxStudents)} own students. Too many for: ${over.map((mock) => mock.title || 'Untitled mock').join(', ')}.`);
    }
  }

  const change = { add: addIds, remove, window, updateExisting, actorId: user._id || null, now: new Date() };
  const results = await eachLimited(mocks, WRITE_CONCURRENCY, (mock) => applyGrantChange(mock._id, change).catch((error) => ({ error })));
  const perMock = [];
  const skipped = [];
  results.forEach((result, index) => {
    const mock = mocks[index];
    if (result.error) skipped.push({ ...card(mock), reason: failure(result.error) });
    else if (result.missing) mocksNotFound.push(String(mock._id));
    else if (result.overLimit) skipped.push({ ...card(mock), reason: `A mock can have up to ${fmt(OWN_STUDENT_LIMITS.maxStudents)} own students.` });
    else perMock.push({ ...card(mock), granted: result.granted, updated: result.updated, removed: result.removed, students: result.students });
  });
  let prepMockTurnedOn = 0;
  let prepMockActivationFailed = false;
  if (perMock.length) {
    try {
      prepMockTurnedOn = await turnOnPrepMock(found, user);
    } catch (error) {
      // The mock changes are already saved, so keep their results even if access updates fail.
      prepMockActivationFailed = true;
      console.error('[Prep Mock] Could not enable student access after bulk assignment:', error?.message);
    }
  }
  const total = (key) => perMock.reduce((sum, row) => sum + row[key], 0);
  return {
    mocks: perMock.length,
    granted: total('granted'), updated: total('updated'), removed: total('removed'),
    notFound: add.length - found.length,
    prepMockTurnedOn,
    prepMockActivationFailed,
    window: { startTime: window.startTime, endTime: window.endTime },
    mocksNotFound, skipped, perMock,
  };
}

/* ------------------------------------------------------------------ publish / unpublish */

async function assertBulkPublisher(user) {
  if (!isControlPlane()) throw new HttpError(404, 'Not found');
  await assertMockPublisher(user);
  if (user?.adminAccess === 'limited') throw new HttpError(403, 'Your admin access cannot publish Prep Mocks.');
}

const failure = (error) => `Could not change this mock (${error?.message || 'unknown error'}). Try again.`;

/**
 * Bulk publish: body { scope }. Each mock that is not live gets exactly the single toggle's checks
 * (mockPublishProblem) and, when ready, the same publish; live mocks are counted as alreadyLive.
 * Returns { mocks, published, alreadyLive, skipped: [{ _id, title, reason }], notFound, publishedMocks }.
 */
export async function bulkPublishMocks(body = {}, user) {
  await assertBulkPublisher(user);
  const { mocks, notFound } = await resolveMockScope(body.scope);
  const outcomes = await eachLimited(mocks, PUBLISH_CONCURRENCY, async (row) => {
    try {
      const mock = await Assessment.findById(row._id);
      if (!mock || mock.kind !== 'mock') return { missing: true };
      if (isMockLive(mock)) return { alreadyLive: true };
      const problem = await mockPublishProblem(mock);
      if (problem) return { reason: problem };
      await applyMockPublish(mock, user._id);
      return { published: true };
    } catch (error) {
      return { reason: failure(error) };
    }
  });
  const result = { mocks: mocks.length, published: 0, alreadyLive: 0, skipped: [], notFound: [...notFound], publishedMocks: [] };
  outcomes.forEach((outcome, index) => {
    const mock = mocks[index];
    if (outcome.missing) result.notFound.push(String(mock._id));
    else if (outcome.alreadyLive) result.alreadyLive += 1;
    else if (outcome.published) { result.published += 1; result.publishedMocks.push(card(mock)); }
    else result.skipped.push({ ...card(mock), reason: outcome.reason });
  });
  return result;
}

/**
 * Bulk unpublish: body { scope }. Published mocks, including hidden ones, return to draft.
 * Returns { mocks, unpublished, alreadyOff, failed: [{ _id, title, reason }], notFound, unpublishedMocks }.
 */
export async function bulkUnpublishMocks(body = {}, user) {
  await assertBulkPublisher(user);
  const { mocks, notFound } = await resolveMockScope(body.scope);
  const outcomes = await eachLimited(mocks, PUBLISH_CONCURRENCY, async (row) => {
    try {
      const mock = await Assessment.findById(row._id);
      if (!mock || mock.kind !== 'mock') return { missing: true };
      if (mock.lifecycleStatus !== 'published') return { alreadyOff: true };
      await applyMockUnpublish(mock, user._id);
      return { unpublished: true };
    } catch (error) {
      return { reason: failure(error) };
    }
  });
  const result = { mocks: mocks.length, unpublished: 0, alreadyOff: 0, failed: [], notFound: [...notFound], unpublishedMocks: [] };
  outcomes.forEach((outcome, index) => {
    const mock = mocks[index];
    if (outcome.missing) result.notFound.push(String(mock._id));
    else if (outcome.alreadyOff) result.alreadyOff += 1;
    else if (outcome.unpublished) { result.unpublished += 1; result.unpublishedMocks.push(card(mock)); }
    else result.failed.push({ ...card(mock), reason: outcome.reason });
  });
  return result;
}
