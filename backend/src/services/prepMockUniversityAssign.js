// University "Assign students" for a Prep Mock (2026-11-26): the university SPOC (a full university
// admin) picks some of its Prep Mock students for one live mock with a date-time window. Every
// enrolled student still sees every live mock (teammate model); the assignment adds an "Assigned by
// your college · between …" schedule for the chosen students. Changed one add/remove at a time.
import mongoose from 'mongoose';
import User from '../models/User.js';
import PrepMockAssignment from '../models/PrepMockAssignment.js';
import { isUniversity } from '../platform/deployment.js';
import { universityPolicy } from '../platform/client.js';
import { sharedAssessment } from '../platform/sharedContent.js';
import { ownAccessFrom } from './prepMockOwnStudents.js';
import { studentHasFeature } from './studentFeatureAccess.js';
import { HttpError } from '../utils/errors.js';

export const UNIVERSITY_ASSIGN_LIMITS = Object.freeze({ maxStudents: 20000, maxChange: 20000 });
const STUDENT_FIELDS = 'name email studentId semester branch college featureAccess accessScope prepMockEnrolledAt';

export async function assertUniversitySpoc(user) {
  if (!isUniversity()) throw new HttpError(404, 'Not found');
  if (user?.role !== 'admin' || user.adminAccess === 'limited') throw new HttpError(403, 'Only the university SPOC can assign students to a Prep Mock.');
  const policy = await universityPolicy();
  if (policy.permissions?.prepmock !== true) throw new HttpError(403, 'Prep Mock is not active for this university.');
}

/** The live platform mock this university can see, or an error. */
async function liveMock(mockId) {
  if (!mongoose.isValidObjectId(String(mockId || ''))) throw new HttpError(400, 'Mock not found.');
  const mock = await sharedAssessment(mockId);
  if (!mock || mock.kind !== 'mock' || mock.platformPublished === false || mock.lifecycleStatus !== 'published' || mock.isVisible === false) {
    throw new HttpError(404, 'Mock not found.');
  }
  return mock;
}

const studentCard = (student) => ({
  _id: String(student._id), name: student.name || '', email: student.email || '', studentId: student.studentId || '',
  semester: student.semester ?? null, branch: student.branch || '', college: student.college || '',
  prepMockOn: studentHasFeature({ ...student, role: 'student' }, 'prep_mock'),
});

export async function universityAssignment(mockId, user) {
  await assertUniversitySpoc(user);
  const mock = await liveMock(mockId);
  const assignment = await PrepMockAssignment.findOne({ mockId: mock._id }).lean();
  const students = assignment?.studentIds?.length
    ? await User.find({ _id: { $in: assignment.studentIds }, role: 'student' }).select(STUDENT_FIELDS).sort({ name: 1 }).lean()
    : [];
  return {
    mock: { _id: String(mock._id), title: mock.title || '', company: mock.company || '', role: mock.role || '', live: mock.platformPublished !== false && mock.lifecycleStatus === 'published' },
    window: { startTime: assignment?.startTime || null, endTime: assignment?.endTime || null },
    students: students.map(studentCard),
  };
}

/** body { add, remove, startTime, endTime }: only this university's Prep Mock students are added. */
export async function changeUniversityAssignment(mockId, body = {}, user) {
  await assertUniversitySpoc(user);
  const mock = await liveMock(mockId);
  const ids = (value) => [...new Set((Array.isArray(value) ? value : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const add = ids(body.add);
  const remove = ids(body.remove);
  if (add.length + remove.length > UNIVERSITY_ASSIGN_LIMITS.maxChange) throw new HttpError(400, 'Too many changes at once. Split them into smaller batches.');
  if ([...add, ...remove].some((id) => !mongoose.isValidObjectId(id))) throw new HttpError(400, 'Choose valid students.');
  if (add.some((id) => remove.includes(id))) throw new HttpError(400, 'The same student cannot be added and removed together.');

  const current = await PrepMockAssignment.findOne({ mockId: mock._id }).lean();
  const window = ownAccessFrom(body, current ? { startTime: current.startTime, endTime: current.endTime } : null);
  const found = add.length ? await User.find({ _id: { $in: add }, role: 'student' }).select(STUDENT_FIELDS).lean() : [];
  const eligible = found.filter((student) => studentHasFeature({ ...student, role: 'student' }, 'prep_mock'));
  const total = new Set([...(current?.studentIds || []).map(String), ...eligible.map((student) => String(student._id))]);
  remove.forEach((id) => total.delete(id));
  if (total.size > UNIVERSITY_ASSIGN_LIMITS.maxStudents) throw new HttpError(400, 'Too many students for one mock.');

  await PrepMockAssignment.updateOne({ mockId: mock._id }, {
    $setOnInsert: { mockId: mock._id },
    $set: { startTime: window.startTime, endTime: window.endTime, updatedBy: user._id },
  }, { upsert: true });
  if (eligible.length) await PrepMockAssignment.updateOne({ mockId: mock._id }, { $addToSet: { studentIds: { $each: eligible.map((student) => student._id) } } });
  if (remove.length) await PrepMockAssignment.updateOne({ mockId: mock._id }, { $pull: { studentIds: { $in: remove.map((id) => new mongoose.Types.ObjectId(id)) } } });
  const fresh = await PrepMockAssignment.findOne({ mockId: mock._id }).lean();
  return {
    added: eligible.length,
    notFound: add.length - found.length,
    notEnrolled: found.length - eligible.length,
    removed: remove.length,
    students: (fresh?.studentIds || []).length,
    window: { startTime: fresh?.startTime || null, endTime: fresh?.endTime || null },
    live: mock.platformPublished !== false && mock.lifecycleStatus === 'published',
  };
}

/** mockId → { startTime, endTime } for the mocks this student was assigned by the university. */
export async function universityAssignmentsFor(studentId) {
  if (!isUniversity() || !mongoose.isValidObjectId(String(studentId || ''))) return new Map();
  const rows = await PrepMockAssignment.find({ studentIds: studentId }).select('mockId startTime endTime').lean();
  return new Map(rows.map((row) => [String(row.mockId), { startTime: row.startTime || null, endTime: row.endTime || null }]));
}
