// Prep Mock "Assign own students" (2026-11-26): Master Admin gives a mock to platform students
// (not university students — universities get every live mock through their PrepMock package).
// Platform (control plane) only.
//
// Model (2026-11-26 v2, per-student windows):
//   Assessment.ownGrants   [{ student, startTime, endTime, grantedAt, grantedBy }]  one per student
//   Assessment.ownStudents [ObjectId]  the id index (dashboard query); always the grant students
//   Assessment.ownAccess   { startTime, endTime }  the mock's default window for new students; also
//                          the window of an older student that has no grant yet (legacy data)
// Every write goes through grantPipeline: one atomic update per mock (an aggregation pipeline), so a
// single-mock edit and a bulk edit running together never lose each other's students, and a legacy
// mock (ownStudents without grants) is converted in the same write.
import mongoose from 'mongoose';
import Assessment from '../models/Assessment.js';
import User from '../models/User.js';
import { isControlPlane } from '../platform/deployment.js';
import { applyStudentFeatureChange, normalizeStudentFeatureAccess, studentHasFeature } from './studentFeatureAccess.js';
import { ownWindowFor } from '../utils/assessmentAssignment.js';
import { HttpError } from '../utils/errors.js';

export const OWN_STUDENT_LIMITS = Object.freeze({ maxStudents: 20000, maxChange: 20000 });
const STUDENT_FIELDS = 'name email studentId semester branch course college featureAccess accessScope prepMockEnrolledAt';
const { ObjectId } = mongoose.Types;

export function assertOwnStudentAdmin(user) {
  if (!isControlPlane()) throw new HttpError(404, 'Not found');
  if (user?.role !== 'admin') throw new HttpError(403, 'Only the Master Admin can assign own students to a Prep Mock.');
  if (user.adminAccess === 'limited') throw new HttpError(403, 'Your admin access cannot assign students to Prep Mocks.');
}

const idList = (value) => [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean))];

/** A date-time from the form ('' or null = no limit on that side); invalid values are refused. */
function windowTime(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, `Enter a valid ${label}.`);
  return date;
}

/** The own-student window from a body: { startTime, endTime } (each optional; missing = `current`). */
export function ownAccessFrom(body = {}, current = null) {
  const startTime = windowTime(body.startTime, 'start date and time');
  const endTime = windowTime(body.endTime, 'end date and time');
  const next = {
    startTime: startTime === undefined ? current?.startTime || null : startTime,
    endTime: endTime === undefined ? current?.endTime || null : endTime,
  };
  if (next.startTime && next.endTime && next.endTime <= next.startTime) throw new HttpError(400, 'The end date and time must be after the start.');
  return next;
}

/**
 * Validated add/remove lists from a body: unique, valid ObjectIds, not in both lists, at most
 * `maxChange` together. Returns ObjectIds.
 */
export function studentChangeFrom(body = {}, { maxChange = OWN_STUDENT_LIMITS.maxChange } = {}) {
  const add = idList(body.add);
  const remove = idList(body.remove);
  if (add.length + remove.length > maxChange) {
    throw new HttpError(400, `Choose up to ${maxChange.toLocaleString('en-US')} students at once. Split them into smaller batches.`);
  }
  if ([...add, ...remove].some((id) => !mongoose.isValidObjectId(id) || !/^[0-9a-f]{24}$/i.test(id))) throw new HttpError(400, 'Choose valid students.');
  const removing = new Set(remove);
  if (add.some((id) => removing.has(id))) throw new HttpError(400, 'The same student cannot be added and removed together.');
  return { add: add.map((id) => new ObjectId(id)), remove: remove.map((id) => new ObjectId(id)) };
}

/** Students of this platform among `ids` (role student), with the fields Prep Mock access needs. */
export async function platformStudents(ids = []) {
  if (!ids.length) return [];
  return User.find({ _id: { $in: ids }, role: 'student' }).select(STUDENT_FIELDS).lean();
}

/**
 * Turns Prep Mock on for students who lack it (they cannot see a mock without it): the feature and
 * an enrolment date, as for students a university SPOC uploads. Never turns anything off.
 * Returns how many students were changed.
 */
export async function turnOnPrepMock(students = [], user) {
  const needAccess = students.filter((student) => !studentHasFeature({ ...student, role: 'student' }, 'prep_mock'));
  if (!needAccess.length) return 0;
  const now = new Date();
  await User.bulkWrite(needAccess.map((student) => {
    const next = applyStudentFeatureChange(normalizeStudentFeatureAccess(student.featureAccess, { legacyAccessScope: student.accessScope }), { type: 'grant', features: ['prep_mock'] });
    return { updateOne: { filter: { _id: student._id }, update: { $set: {
      featureAccess: { ...next, source: 'manual', updatedBy: user?._id || null, updatedAt: now },
      ...(student.prepMockEnrolledAt ? {} : { prepMockEnrolledAt: now }),
    } } } };
  }), { ordered: false });
  return needAccess.length;
}

/* ------------------------------------------------------------------ atomic grant writes */

const GRANT_STUDENTS = { $ifNull: ['$ownGrants.student', []] };
const notIn = (value, list) => ({ $not: [{ $in: [value, list] }] });

/**
 * The update pipeline for one mock (runs atomically on the server, reading the current document):
 *  1. legacy: every student in ownStudents without a grant gets one carrying the mock's ownAccess;
 *  2. `remove` drops grants;
 *  3. `updateExisting` sets `window` on every remaining grant;
 *  4. `add` grants students not already granted, with `window`;
 *  5. ownStudents = the grant students; `defaultWindow` (single-mock dialog) sets ownAccess.
 */
export function grantPipeline({ add = [], remove = [], window = { startTime: null, endTime: null }, updateExisting = false, actorId = null, now = new Date(), defaultWindow } = {}) {
  const startTime = { $literal: window.startTime || null };
  const endTime = { $literal: window.endTime || null };
  const grantedBy = actorId && mongoose.isValidObjectId(String(actorId)) ? new ObjectId(String(actorId)) : null;
  const stages = [{
    $set: {
      ownGrants: {
        $let: {
          vars: { grants: { $ifNull: ['$ownGrants', []] } },
          in: {
            $concatArrays: ['$$grants', {
              $map: {
                input: { $filter: { input: { $setUnion: [{ $ifNull: ['$ownStudents', []] }, []] }, as: 'id', cond: notIn('$$id', { $ifNull: ['$$grants.student', []] }) } },
                as: 'id',
                in: { student: '$$id', startTime: { $ifNull: ['$ownAccess.startTime', null] }, endTime: { $ifNull: ['$ownAccess.endTime', null] }, grantedAt: null, grantedBy: null },
              },
            }],
          },
        },
      },
    },
  }];
  if (remove.length) {
    stages.push({ $set: { ownGrants: { $filter: { input: '$ownGrants', as: 'grant', cond: notIn('$$grant.student', { $literal: remove }) } } } });
  }
  if (updateExisting) {
    stages.push({ $set: { ownGrants: { $map: { input: '$ownGrants', as: 'grant', in: { $mergeObjects: ['$$grant', { startTime, endTime }] } } } } });
  }
  if (add.length) {
    stages.push({ $set: { ownGrants: { $concatArrays: ['$ownGrants', {
      $map: {
        input: { $filter: { input: { $literal: add }, as: 'id', cond: notIn('$$id', GRANT_STUDENTS) } },
        as: 'id',
        in: { student: '$$id', startTime, endTime, grantedAt: { $literal: now }, grantedBy: { $literal: grantedBy } },
      },
    }] } } });
  }
  stages.push({ $set: {
    ownStudents: GRANT_STUDENTS,
    updatedAt: '$$NOW',
    ...(defaultWindow ? { ownAccess: { $literal: { startTime: defaultWindow.startTime || null, endTime: defaultWindow.endTime || null } } } : {}),
  } });
  return stages;
}

/** Filter guard: after the change the mock still has at most `maxStudents` own students. */
function underStudentLimit(add, remove, maxStudents) {
  return { $expr: { $lte: [{ $size: { $setDifference: [
    { $setUnion: [{ $ifNull: ['$ownStudents', []] }, GRANT_STUDENTS, { $literal: add }] },
    { $literal: remove },
  ] } }, maxStudents] } };
}

const sameTime = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

/** What a change did to one mock, worked out from the document just before the atomic write. */
export function grantChangeCounts(before, { add = [], remove = [], window, updateExisting = false }) {
  const had = new Set([...(before?.ownStudents || []), ...(before?.ownGrants || []).map((grant) => grant.student)].map(String));
  const removed = remove.filter((id) => had.has(String(id))).length;
  const removing = new Set(remove.map(String));
  const granted = add.filter((id) => !had.has(String(id))).length;
  let updated = 0;
  if (updateExisting) {
    for (const id of had) {
      if (removing.has(id)) continue;
      const current = ownWindowFor(before, id);
      if (!sameTime(current.startTime, window.startTime) || !sameTime(current.endTime, window.endTime)) updated += 1;
    }
  }
  return { granted, updated, removed, students: had.size - removed + granted };
}

/**
 * Applies one change to one platform mock atomically. Returns { title, granted, updated, removed,
 * students } or { missing: true } (no such mock) or { overLimit: true, title } (the change would
 * pass the per-mock student limit; nothing was written).
 */
export async function applyGrantChange(mockId, change, { maxStudents = OWN_STUDENT_LIMITS.maxStudents } = {}) {
  const { add = [], remove = [] } = change;
  const filter = { _id: new ObjectId(String(mockId)), kind: 'mock', platformShared: { $ne: true } };
  const before = await Assessment.collection.findOneAndUpdate(
    add.length ? { ...filter, ...underStudentLimit(add, remove, maxStudents) } : filter,
    grantPipeline(change),
    { returnDocument: 'before', projection: { title: 1, ownStudents: 1, ownGrants: 1, ownAccess: 1 } },
  );
  if (!before) {
    const exists = await Assessment.findOne(filter).select('title').lean();
    return exists ? { overLimit: true, title: exists.title || '' } : { missing: true };
  }
  return { title: before.title || '', ...grantChangeCounts(before, change) };
}

/* ------------------------------------------------------------------ student-side reads */

/**
 * The grant of `studentId` on each of their own platform mocks (mockId → grant), read without
 * loading every other student's grant. Mocks with no grant for them (older data) are absent.
 */
export async function ownGrantsForStudent(studentId, mockIds = null) {
  if (!studentId || !mongoose.isValidObjectId(String(studentId))) return new Map();
  const id = new ObjectId(String(studentId));
  const rows = await Assessment.aggregate([
    { $match: { kind: 'mock', ownStudents: id, ...(mockIds ? { _id: { $in: mockIds.map((mock) => new ObjectId(String(mock))) } } : {}) } },
    { $project: { grant: { $arrayElemAt: [{ $filter: { input: { $ifNull: ['$ownGrants', []] }, as: 'grant', cond: { $eq: ['$$grant.student', id] } } }, 0] } } },
  ]);
  return new Map(rows.filter((row) => row.grant).map((row) => [String(row._id), row.grant]));
}

/**
 * The assessment with only this student's grant in ownGrants (enough for withOwnStudentWindow),
 * when it was loaded without grants. Other assessments are returned unchanged.
 */
export async function withOwnGrantOf(assessment, student) {
  if (!assessment || assessment.kind !== 'mock' || assessment.platformShared === true || Array.isArray(assessment.ownGrants)) return assessment;
  const id = String(student?._id || '');
  if (!id || !(assessment.ownStudents || []).some((entry) => String(entry) === id)) return assessment;
  const grant = (await ownGrantsForStudent(id, [assessment._id])).get(String(assessment._id));
  return { ...assessment, ownGrants: grant ? [grant] : [] };
}

/* ------------------------------------------------------------------ single mock (dialog) */

async function loadMock(mockId) {
  if (!mongoose.isValidObjectId(String(mockId || ''))) throw new HttpError(400, 'Mock not found.');
  const mock = await Assessment.findOne({ _id: mockId, kind: 'mock' }).select('title company role lifecycleStatus isVisible ownStudents ownGrants ownAccess').lean();
  if (!mock) throw new HttpError(404, 'Mock not found.');
  return mock;
}

const mockCard = (mock) => ({
  _id: String(mock._id), title: mock.title || '', company: mock.company || '', role: mock.role || '',
  live: mock.lifecycleStatus === 'published' && mock.isVisible !== false,
});
const windowOf = (value) => ({ startTime: value?.startTime || null, endTime: value?.endTime || null });

/** What the dialog shows: the mock, its default window and its own students with their own window. */
export async function mockOwnStudents(mockId, user) {
  assertOwnStudentAdmin(user);
  const mock = await loadMock(mockId);
  const ids = [...new Set([...(mock.ownStudents || []), ...(mock.ownGrants || []).map((grant) => grant.student)].map(String))];
  const grants = new Map((mock.ownGrants || []).map((grant) => [String(grant.student), grant]));
  const students = ids.length
    ? await User.find({ _id: { $in: ids }, role: 'student' }).select(STUDENT_FIELDS).sort({ name: 1 }).lean()
    : [];
  return {
    mock: mockCard(mock),
    window: windowOf(mock.ownAccess),
    students: students.map((student) => {
      const own = ownWindowFor(mock, student);
      return {
        _id: String(student._id), name: student.name || '', email: student.email || '', studentId: student.studentId || '',
        semester: student.semester ?? null, branch: student.branch || '', college: student.college || '',
        prepMockOn: studentHasFeature({ ...student, role: 'student' }, 'prep_mock'),
        startTime: own.startTime, endTime: own.endTime,
        grantedAt: grants.get(String(student._id))?.grantedAt || null,
      };
    }),
  };
}

/**
 * Adds/removes own students of one mock: body { add, remove, startTime, endTime, updateExisting }.
 * The dates (missing = the mock's current default) become the mock's default window and the window
 * of newly added students; with updateExisting:true every student already on the mock gets them
 * too ("Save dates"). Added students get Prep Mock turned on; removing never turns it off.
 */
export async function changeMockOwnStudents(mockId, body = {}, user) {
  assertOwnStudentAdmin(user);
  const { add, remove } = studentChangeFrom(body);
  const mock = await loadMock(mockId);
  const window = ownAccessFrom(body, mock.ownAccess);
  const updateExisting = body.updateExisting === true;

  const found = await platformStudents(add);
  const change = { add: found.map((student) => student._id), remove, window, updateExisting, actorId: user._id || null, now: new Date(), defaultWindow: window };
  const result = await applyGrantChange(mock._id, change);
  if (result.missing) throw new HttpError(404, 'Mock not found.');
  if (result.overLimit) throw new HttpError(400, `A mock can have up to ${OWN_STUDENT_LIMITS.maxStudents.toLocaleString('en-US')} own students.`);
  const prepMockTurnedOn = await turnOnPrepMock(found, user);
  return {
    added: result.granted, updated: result.updated, notFound: add.length - found.length, removed: result.removed, prepMockTurnedOn,
    students: result.students,
    window: windowOf(window),
    live: mock.lifecycleStatus === 'published' && mock.isVisible !== false,
  };
}
