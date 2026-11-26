import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Assessment from '../src/models/Assessment.js';
import PrepMockPattern from '../src/models/PrepMockPattern.js';
import User from '../src/models/User.js';
import { Publication, University } from '../src/platform/models.js';
import {
  createAssessment, getStudentAssessmentDashboard, listAssessments, mockPatternProblem, publishMock, unpublishMock, updateAssessment,
} from '../src/controllers/assessmentController.js';
import { changeMockOwnStudents, mockOwnStudents } from '../src/services/prepMockOwnStudents.js';
import { bulkChangeOwnStudents, bulkUnpublishMocks } from '../src/services/prepMockBulk.js';
import { updateStudentAccess } from '../src/controllers/studentAccessController.js';
import { studentHasFeature } from '../src/services/studentFeatureAccess.js';
import { withOwnStudentWindow } from '../src/utils/assessmentAssignment.js';
import {
  createPattern, deletePattern, listPatterns, patternFields, patternForMock, updatePattern,
} from '../src/services/prepMockPattern.js';

// Prep Mock builder (2026-11-26): one wizard (no separate publish wizard), an admin-written exam
// pattern per company + role, always-open mocks. Universities get every published mock while their
// PrepMock grant and dates are active (no per-mock assignment).
let mongo;
let originalRole;
const adminId = new mongoose.Types.ObjectId();
const admin = { _id: adminId, role: 'admin', email: 'mock-builder@example.test' };
const NOW = new Date('2026-11-26T08:00:00Z');

function capture() {
  const state = { statusCode: 200, body: null };
  return { state, status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; return this; } };
}
const request = (extra = {}) => ({ user: admin, ip: '127.0.0.1', get: () => 'test', headers: {}, socket: { remoteAddress: '127.0.0.1' }, query: {}, params: {}, ...extra });
async function call(handler, extra) {
  const res = capture();
  await handler(request(extra), res);
  return res.state;
}
const mcqSection = (name = 'Aptitude', count = 2) => ({
  sectionName: name, type: 'mcq',
  questions: Array.from({ length: count }, (_, index) => ({
    questionId: `${name}-${index}`, type: 'mcq', questionText: `${name} question ${index + 1}?`, options: ['A', 'B'], correctOptionIndex: 0,
  })),
});
const patternBody = (extra = {}) => ({
  company: 'Acme', role: 'SDE 1', patternFrom: { month: 3, year: 2025 },
  rows: [{ name: 'Aptitude', type: 'mcq', questions: 20, minutes: 25, marks: 20 }, { name: 'Coding', type: 'coding', questions: 2, minutes: 60, marks: 40 }],
  ...extra,
});
async function withRole(role, work) {
  const previous = process.env.PEERPREP_DEPLOYMENT_ROLE;
  const previousId = process.env.PEERPREP_UNIVERSITY_ID;
  process.env.PEERPREP_DEPLOYMENT_ROLE = role;
  if (role === 'university') process.env.PEERPREP_UNIVERSITY_ID = 'own-campus';
  try { return await work(); } finally {
    process.env.PEERPREP_DEPLOYMENT_ROLE = previous;
    if (previousId === undefined) delete process.env.PEERPREP_UNIVERSITY_ID; else process.env.PEERPREP_UNIVERSITY_ID = previousId;
  }
}
async function newMock(extra = {}) {
  const made = await call(createAssessment, { body: {
    kind: 'mock', company: 'Acme', role: 'SDE 1', title: 'Acme SDE mock', duration: 60, lifecycleStatus: 'draft',
    sections: [mcqSection('Aptitude')], ...extra,
  } });
  assert.equal(made.statusCode, 201, JSON.stringify(made.body));
  return String(made.body.assessmentId);
}

before(async () => {
  originalRole = process.env.PEERPREP_DEPLOYMENT_ROLE;
  process.env.PEERPREP_DEPLOYMENT_ROLE = 'control';
  mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_mock_builder_test' });
  await Promise.all([PrepMockPattern.init(), User.init(), Publication.init(), University.init()]);
});

after(async () => {
  if (originalRole === undefined) delete process.env.PEERPREP_DEPLOYMENT_ROLE;
  else process.env.PEERPREP_DEPLOYMENT_ROLE = originalRole;
  await mongoose.disconnect();
  await mongo?.stop();
});

/* ------------------------------------------------------------------ patterns */

test('pattern fields: company, role, a past OA month and named sections are required', () => {
  const fields = patternFields(patternBody({ company: '  Acme   Corp ', role: ' SDE  1 ' }), NOW);
  assert.equal(fields.company, 'Acme Corp');
  assert.equal(fields.companyKey, 'acme corp');
  assert.equal(fields.roleKey, 'sde 1');
  assert.deepEqual(fields.rows.map((row) => [row.name, row.type, row.questions, row.minutes, row.marks]), [['Aptitude', 'mcq', 20, 25, 20], ['Coding', 'coding', 2, 60, 40]]);
  assert.equal(patternFields(patternBody({ rows: [{ name: 'X', type: 'essay', questions: 2.6, minutes: -4, marks: 1.005 }] }), NOW).rows[0].type, 'mcq', 'unknown type falls back to MCQ');
  const clamped = patternFields(patternBody({ rows: [{ name: 'X', questions: 2.6, minutes: -4, marks: 99999 }] }), NOW).rows[0];
  assert.deepEqual([clamped.questions, clamped.minutes, clamped.marks], [3, 0, 10000]);
  const status = (body) => { try { patternFields(body, NOW); return 0; } catch (error) { return error.status; } };
  assert.throws(() => patternFields(patternBody({ company: ' ' }), NOW), /company/);
  assert.throws(() => patternFields(patternBody({ role: '' }), NOW), /role/);
  assert.throws(() => patternFields(patternBody({ patternFrom: { month: 12, year: 2026 } }), NOW), /not in the future/);
  assert.throws(() => patternFields(patternBody({ rows: [] }), NOW), /at least one section/);
  assert.throws(() => patternFields(patternBody({ rows: [{ name: '', questions: 2 }] }), NOW), /Section 1 needs a name/);
  assert.throws(() => patternFields(patternBody({ rows: [{ name: 'Coding', questions: 1 }, { name: 'coding', questions: 1 }] }), NOW), /Two sections/);
  assert.throws(() => patternFields(patternBody({ rows: [{ name: 'Aptitude', questions: 0 }] }), NOW), /number of questions/);
  assert.equal(status(patternBody({ rows: Array.from({ length: 31 }, (_, i) => ({ name: `S${i}`, questions: 1 })) })), 400);
});

test('patterns: one per company + role + OA month (case-insensitive), 409 on a duplicate', async () => {
  const { pattern } = await createPattern(patternBody(), admin);
  assert.equal(pattern.company, 'Acme');
  assert.deepEqual(pattern.totals, { questions: 22, minutes: 85, marks: 60 });
  await assert.rejects(createPattern(patternBody({ company: 'ACME', role: 'sde 1' }), admin), (error) => error.status === 409 && /already has a pattern for 3\/2025/.test(error.message));
  const older = await createPattern(patternBody({ patternFrom: { month: 8, year: 2024 } }), admin);
  await createPattern(patternBody({ role: 'Analyst' }), admin);
  const listed = await listPatterns({ company: 'acme', role: 'SDE 1' });
  assert.deepEqual(listed.patterns.map((row) => `${row.patternFrom.month}/${row.patternFrom.year}`), ['3/2025', '8/2024'], 'newest OA first, only this role');
  assert.equal((await listPatterns({ company: 'Acme' })).patterns.length, 3, 'every role of the company');
  // Moving a pattern onto a month that already has one is refused too.
  await assert.rejects(updatePattern(older.pattern._id, patternBody({ patternFrom: { month: 3, year: 2025 } }), admin), (error) => error.status === 409);
  await assert.rejects(updatePattern('nope', patternBody(), admin), (error) => error.status === 400);
  await assert.rejects(updatePattern(String(new mongoose.Types.ObjectId()), patternBody(), admin), (error) => error.status === 404);
});

test('patternForMock: null clears, another company or role is refused, the copy matches the pattern', async () => {
  const [pattern] = (await listPatterns({ company: 'Acme', role: 'SDE 1' })).patterns;
  assert.equal(await patternForMock(null, { company: 'Acme', role: 'SDE 1' }), null);
  assert.equal(await patternForMock('', { company: 'Acme', role: 'SDE 1' }), null);
  await assert.rejects(patternForMock('not-an-id', { company: 'Acme', role: 'SDE 1' }), /valid exam pattern/);
  await assert.rejects(patternForMock(String(new mongoose.Types.ObjectId()), { company: 'Acme', role: 'SDE 1' }), /no longer exists/);
  await assert.rejects(patternForMock(pattern._id, { company: 'Acme', role: 'Analyst' }), (error) => error.status === 400 && /This pattern is for Acme · SDE 1/.test(error.message));
  await assert.rejects(patternForMock(pattern._id, { company: 'Globex', role: 'SDE 1' }), /Choose a pattern of Globex/);
  const copy = await patternForMock(pattern._id, { company: ' acme ', role: 'SDE  1' });
  assert.equal(String(copy.patternId), pattern._id);
  assert.deepEqual(copy.patternFrom, { month: 3, year: 2025 });
  assert.deepEqual(copy.totals, { questions: 22, minutes: 85, marks: 60 });
});

test('editing a pattern refreshes every mock that uses it; a used pattern cannot be deleted', async () => {
  const { pattern } = await createPattern(patternBody({ company: 'Initech', role: 'QA', patternFrom: { month: 1, year: 2025 } }), admin);
  const first = await newMock({ company: 'Initech', role: 'QA', patternId: pattern._id });
  const second = await newMock({ company: 'Initech', role: 'QA', patternId: pattern._id });
  const other = await newMock({ company: 'Initech', role: 'QA' });
  const saved = await Assessment.findById(first).lean();
  assert.equal(String(saved.patternId), pattern._id);
  assert.deepEqual(saved.patternFrom, { month: 1, year: 2025 }, 'the OA month comes from the pattern');
  assert.equal(saved.mockPattern.rows.length, 2);

  const edited = await updatePattern(pattern._id, { patternFrom: { month: 2, year: 2025 }, rows: [{ name: 'Logic', type: 'mcq', questions: 15, minutes: 20, marks: 15 }], company: 'Hijack', role: 'Other' }, admin);
  assert.equal(edited.mocksUpdated, 2);
  assert.equal(edited.pattern.company, 'Initech', 'company and role of a pattern never change');
  assert.equal(edited.pattern.mocks, 2);
  for (const id of [first, second]) {
    const mock = await Assessment.findById(id).lean();
    assert.deepEqual(mock.mockPattern.rows.map((row) => row.name), ['Logic']);
    assert.deepEqual(mock.mockPattern.totals, { questions: 15, minutes: 20, marks: 15 });
    assert.deepEqual(mock.patternFrom, { month: 2, year: 2025 });
  }
  assert.equal((await Assessment.findById(other).lean()).mockPattern, null, 'a mock without the pattern is untouched');

  await assert.rejects(deletePattern(pattern._id), (error) => error.status === 409 && /2 mocks use this pattern/.test(error.message));
  // Clearing it from both mocks frees it.
  for (const id of [first, second]) {
    const cleared = await call(updateAssessment, { params: { id }, body: { patternId: null } });
    assert.equal(cleared.statusCode, 200, JSON.stringify(cleared.body));
  }
  const clearedMock = await Assessment.findById(first).lean();
  assert.equal(clearedMock.patternId, null);
  assert.equal(clearedMock.mockPattern, null);
  assert.deepEqual(await deletePattern(pattern._id), { deleted: true });
  await assert.rejects(deletePattern(pattern._id), (error) => error.status === 404);
});

test('changing a mock\'s company or role drops a pattern of the old pair', async () => {
  const { pattern } = await createPattern(patternBody({ company: 'Umbrella', role: 'SRE', patternFrom: { month: 5, year: 2024 } }), admin);
  const id = await newMock({ company: 'Umbrella', role: 'SRE', patternId: pattern._id });
  const moved = await call(updateAssessment, { params: { id }, body: { role: 'Data Analyst' } });
  assert.equal(moved.statusCode, 200, JSON.stringify(moved.body));
  const mock = await Assessment.findById(id).lean();
  assert.equal(mock.patternId, null);
  assert.equal(mock.mockPattern, null);
  const wrong = await call(updateAssessment, { params: { id }, body: { patternId: pattern._id } });
  assert.equal(wrong.statusCode, 400, 'the SRE pattern cannot go on a Data Analyst mock');
});

test('resending the same company (other spacing) keeps the pattern; the mock copy has no admin notes', async () => {
  const { pattern } = await createPattern(patternBody({ company: 'Wayne Corp', role: 'SDE 2', patternFrom: { month: 6, year: 2024 }, notes: 'Reported by 2024 candidates' }), admin);
  const id = await newMock({ company: 'Wayne  Corp', role: 'SDE 2', patternId: pattern._id });
  const resent = await call(updateAssessment, { params: { id }, body: { company: 'Wayne  Corp', role: 'SDE 2' } });
  assert.equal(resent.statusCode, 200, JSON.stringify(resent.body));
  const mock = await Assessment.findById(id).lean();
  assert.equal(String(mock.patternId), String(pattern._id), 'same company + role by key: the pattern stays');
  assert.equal(mock.mockPattern.notes, undefined, 'notes are admin-only and stay on the pattern');
  assert.equal(pattern.notes, 'Reported by 2024 candidates', 'the admin still sees the notes');
});

test('an older month-only mock keeps its OA month when saved with patternId null', async () => {
  const id = await newMock({ title: 'Legacy month mock', patternFrom: { month: 4, year: 2024 } });
  const saved = await call(updateAssessment, { params: { id }, body: { title: 'Legacy month mock (typo fixed)', patternId: null } });
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
  assert.deepEqual((await Assessment.findById(id).lean()).patternFrom, { month: 4, year: 2024 });
  const published = await call(updateAssessment, { params: { id }, body: { lifecycleStatus: 'published', duration: 60, patternId: null } });
  assert.equal(published.statusCode, 200, `a published older mock can still be saved: ${JSON.stringify(published.body)}`);
  assert.deepEqual((await Assessment.findById(id).lean()).patternFrom, { month: 4, year: 2024 });
});

test('mockPatternProblem: the OA month is needed (from the written pattern or the mock); a pattern needs rows', () => {
  assert.match(mockPatternProblem({ mockPattern: null }), /month and year/);
  assert.equal(mockPatternProblem({ mockPattern: null, patternFrom: { month: 1, year: 2025 } }), '', 'older mocks with only a month still publish');
  assert.match(mockPatternProblem({ mockPattern: { rows: [], patternFrom: { month: 1, year: 2025 } } }), /exam pattern/);
  assert.equal(mockPatternProblem({ mockPattern: { rows: [{ name: 'A' }], patternFrom: { month: 1, year: 2025 } } }), '');
});

/* ------------------------------------------------------------------ builder: create / update / publish */

test('a new mock is always open, never takes students or universities from the request, and keeps its pattern', async () => {
  const [pattern] = (await listPatterns({ company: 'Acme', role: 'SDE 1' })).patterns;
  const student = await User.create({ name: 'Ignored Student', email: 'ignored@example.test', role: 'student', passwordHash: 'x' });
  const body = {
    kind: 'mock', company: 'Acme', role: 'SDE 1', title: 'Published at once', duration: 45, lifecycleStatus: 'published',
    sections: [mcqSection('Aptitude', 3)],
    // Everything below belongs to the old publish wizard and must be ignored.
    availabilityMode: 'scheduled', startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-02T10:00:00Z',
    targetType: 'selected', assignedStudents: [String(student._id)], mockAudienceMode: 'universities', mockUniversityIds: ['ignored-uni'],
  };
  const noPattern = await call(createAssessment, { body });
  assert.equal(noPattern.statusCode, 400);
  assert.match(noPattern.body.error, /month and year/);
  const otherRole = await createPattern(patternBody({ role: 'Analyst', patternFrom: { month: 1, year: 2024 } }), admin);
  const mismatch = await call(createAssessment, { body: { ...body, patternId: otherRole.pattern._id } });
  assert.equal(mismatch.statusCode, 400);
  assert.match(mismatch.body.error, /This pattern is for Acme · Analyst/);

  const made = await call(createAssessment, { body: { ...body, patternId: pattern._id } });
  assert.equal(made.statusCode, 201, JSON.stringify(made.body));
  const mock = await Assessment.findById(made.body.assessmentId).lean();
  assert.equal(mock.lifecycleStatus, 'published');
  assert.equal(mock.availabilityMode, 'always');
  assert.equal(new Date(mock.endTime).getUTCFullYear(), 9999);
  assert.ok(new Date(mock.startTime).getTime() <= Date.now(), 'open now, not on the old wizard date');
  assert.equal(mock.targetType, 'selected');
  assert.deepEqual(mock.assignedStudents, []);
  assert.deepEqual(mock.mockUniversityIds, [], 'universities come from their PrepMock grant, never from the request');
  assert.equal(String(mock.patternId), pattern._id);
  assert.deepEqual(mock.patternFrom, { month: 3, year: 2025 });
  assert.ok(mock.questionSets.length <= 1, 'the set system is not used for mocks');
});

test('only the Master Admin on the platform creates mocks (not a university deployment)', async () => {
  await withRole('university', async () => {
    const made = await call(createAssessment, { body: { kind: 'mock', company: 'Acme', role: 'SDE 1', title: 'Campus mock', duration: 60, lifecycleStatus: 'draft', sections: [mcqSection('Aptitude')] } });
    assert.equal(made.statusCode, 403);
  });
});

test('updating: publishing needs the pattern month; clearing the pattern of a published mock is refused', async () => {
  const [pattern] = (await listPatterns({ company: 'Acme', role: 'SDE 1' })).patterns;
  const id = await newMock({ title: 'Edit flow' });
  const blocked = await call(updateAssessment, { params: { id }, body: { lifecycleStatus: 'published', duration: 60 } });
  assert.equal(blocked.statusCode, 400);
  assert.match(blocked.body.error, /month and year/);
  const published = await call(updateAssessment, { params: { id }, body: {
    lifecycleStatus: 'published', duration: 60, patternId: pattern._id,
    availabilityMode: 'scheduled', startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-01T12:00:00Z',
    targetType: 'all', mockAudienceMode: 'universities', mockUniversityIds: ['ignored-uni'],
  } });
  assert.equal(published.statusCode, 200, JSON.stringify(published.body));
  const mock = await Assessment.findById(id).lean();
  assert.equal(mock.availabilityMode, 'always');
  assert.equal(new Date(mock.endTime).getUTCFullYear(), 9999);
  assert.equal(mock.targetType, 'selected');
  assert.deepEqual(mock.mockUniversityIds, []);
  const cleared = await call(updateAssessment, { params: { id }, body: { patternId: null } });
  assert.equal(cleared.statusCode, 400);
  assert.match(cleared.body.error, /month and year/);
  assert.equal(String((await Assessment.findById(id).lean()).patternId), pattern._id, 'nothing saved');
});

test('publish toggle (publishMock): the same checks as the builder, then always open; unpublish keeps the pattern', async () => {
  const [pattern] = (await listPatterns({ company: 'Acme', role: 'SDE 1' })).patterns;
  const noLength = await newMock({ title: 'No length', duration: undefined, patternId: pattern._id });
  const result = await call(publishMock, { params: { id: noLength } });
  assert.equal(result.statusCode, 400);
  assert.match(result.body.error, /test length/);

  const noPattern = await newMock({ title: 'No pattern' });
  const missingPattern = await call(publishMock, { params: { id: noPattern } });
  assert.equal(missingPattern.statusCode, 400);
  assert.match(missingPattern.body.error, /month and year.*Open Edit mock/);

  const noQuestions = await newMock({ title: 'No questions', sections: [], patternId: pattern._id });
  const empty = await call(publishMock, { params: { id: noQuestions } });
  assert.equal(empty.statusCode, 400);
  assert.match(empty.body.error, /section/);

  // A question pool that asks for more questions than the mock has (draft saves allow it).
  const pool = await newMock({ title: 'Bad pool', patternId: pattern._id, settings: { questionSelectionEnabled: true, questionRequirements: { mcq: 10 } } });
  const badPool = await call(publishMock, { params: { id: pool } });
  assert.equal(badPool.statusCode, 400);
  assert.match(badPool.body.error, /between 1 and 2/);
  assert.equal((await Assessment.findById(pool).lean()).lifecycleStatus, 'draft');

  assert.equal((await call(publishMock, { params: { id: String(new mongoose.Types.ObjectId()) } })).statusCode, 404);
  const regular = await Assessment.create({ title: 'Regular', createdBy: adminId, lifecycleStatus: 'draft' });
  assert.equal((await call(publishMock, { params: { id: String(regular._id) } })).statusCode, 404, 'only mocks');
  const id = await newMock({ title: 'Ready', patternId: pattern._id });
  assert.equal((await call(publishMock, { params: { id }, user: { ...admin, role: 'coordinator' } })).statusCode, 403, 'Master Admin only');

  await University.create({ universityId: 'granted-uni', name: 'Granted University', permissions: { assessments: true, prepmock: true }, prepMockStartDate: '2026-01-01', prepMockEndDate: '2099-12-31' });
  const before = await Assessment.findById(id).lean();
  const ok = await call(publishMock, { params: { id } });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  const live = await Assessment.findById(id).lean();
  assert.equal(live.lifecycleStatus, 'published');
  assert.equal(live.isVisible, true);
  assert.equal(live.availabilityMode, 'always');
  assert.equal(new Date(live.endTime).getUTCFullYear(), 9999);
  assert.equal(live.mockHasHistory, true);
  assert.equal(live.version, before.version + 1);
  const publication = await Publication.findOne({ contentId: live._id }).lean();
  assert.equal(publication.published, true);
  assert.ok(publication.universityIds.includes('granted-uni'), 'reaches universities with an active PrepMock grant');
  const opened = new Date(live.startTime).getTime();
  await call(publishMock, { params: { id } });
  const again = await Assessment.findById(id).lean();
  assert.equal(again.version, live.version, 'publishing a live mock again changes nothing');
  assert.equal(new Date(again.startTime).getTime(), opened, 'keeps its opening time');

  const off = await call(unpublishMock, { params: { id } });
  assert.equal(off.statusCode, 200);
  const hidden = await Assessment.findById(id).lean();
  assert.equal(hidden.lifecycleStatus, 'draft');
  assert.equal(hidden.isVisible, false);
  assert.equal(String(hidden.patternId), pattern._id, 'unpublishing keeps the pattern');
  assert.equal((await Publication.findOne({ contentId: live._id }).lean()).published, false);
});

/* ------------------------------------------------------------------ own students */

test('own students: Master Admin adds platform students with a date window; they see the mock only inside it', async () => {
  const [pattern] = (await listPatterns({ company: 'Acme', role: 'SDE 1' })).patterns;
  const id = await newMock({ title: 'Own students mock', patternId: pattern._id });
  await call(publishMock, { params: { id } });
  const [plain, other] = await User.insertMany([
    { name: 'Own Plain', email: 'own-plain@example.test', role: 'student', passwordHash: 'x' },
    { name: 'Not Chosen', email: 'not-chosen@example.test', role: 'student', passwordHash: 'x', featureAccess: { mode: 'custom', features: ['prep_mock'] }, prepMockEnrolledAt: new Date() },
  ]);

  await assert.rejects(changeMockOwnStudents(id, { add: [String(plain._id)] }, { ...admin, role: 'coordinator' }), (error) => error.status === 403);
  await assert.rejects(changeMockOwnStudents(id, { add: [String(plain._id)], startTime: '2030-01-02T00:00:00Z', endTime: '2030-01-01T00:00:00Z' }, admin), /end date and time must be after/);
  await withRole('university', async () => {
    await assert.rejects(mockOwnStudents(id, admin), (error) => error.status === 404, 'platform only');
  });

  const added = await changeMockOwnStudents(id, { add: [String(plain._id), String(new mongoose.Types.ObjectId())] }, admin);
  assert.deepEqual([added.added, added.notFound, added.prepMockTurnedOn, added.students], [1, 1, 1, 1]);
  const plainNow = await User.findById(plain._id).lean();
  assert.equal(studentHasFeature(plainNow, 'prep_mock'), true, 'Prep Mock turned on');
  // Editing the mock (which clears assignedStudents) keeps own students.
  const edited = await call(updateAssessment, { params: { id }, body: { title: 'Own students mock v2' } });
  assert.equal(edited.statusCode, 200, JSON.stringify(edited.body));
  assert.equal((await Assessment.findById(id).lean()).ownStudents.length, 1);

  const sees = async (user) => {
    const dashboard = await call(getStudentAssessmentDashboard, { user, query: { kind: 'mock' } });
    assert.equal(dashboard.statusCode, 200, JSON.stringify(dashboard.body));
    const find = (list) => (dashboard.body[list] || []).some((row) => String(row._id) === id);
    return find('ongoingAssessments') ? 'open' : find('upcomingAssessments') ? 'upcoming' : find('completedAssessments') ? 'closed' : 'hidden';
  };
  assert.equal(await sees(plainNow), 'open', 'no dates: open now');
  assert.equal(await sees(await User.findById(other._id).lean()), 'hidden', 'a student who was not chosen never sees it');
  // An older platform mock saved "open to all" still reaches only assigned students.
  await Assessment.updateOne({ _id: id }, { $set: { targetType: 'all', assignedStudents: [] } });
  assert.equal(await sees(await User.findById(other._id).lean()), 'hidden', 'open-to-all platform mock: not shown unless assigned');
  assert.equal(await sees(plainNow), 'open', 'the assigned student still sees it');
  assert.equal(withOwnStudentWindow({ ...(await Assessment.findById(id).lean()), ownGrants: undefined, ownAccess: { startTime: new Date(Date.now() + 86400000), endTime: null } }, plainNow).startTime > new Date(), true, 'the window applies even on an open-to-all mock');

  // "Save dates" (updateExisting) changes the window of students already on the mock.
  await changeMockOwnStudents(id, { startTime: new Date(Date.now() + 86400000).toISOString(), endTime: null, updateExisting: true }, admin);
  assert.equal(await sees(plainNow), 'upcoming', 'before the window: upcoming');
  await changeMockOwnStudents(id, { startTime: new Date(Date.now() - 2 * 86400000).toISOString(), endTime: new Date(Date.now() - 86400000).toISOString(), updateExisting: true }, admin);
  assert.ok(['closed', 'hidden'].includes(await sees(plainNow)), 'after the window it is no longer open');

  const view = await mockOwnStudents(id, admin);
  assert.deepEqual(view.students.map((row) => row.name), ['Own Plain']);
  assert.ok(view.window.endTime);
  const removed = await changeMockOwnStudents(id, { remove: [String(plain._id)] }, admin);
  assert.equal(removed.students, 0);
  assert.equal(studentHasFeature(await User.findById(plain._id).lean(), 'prep_mock'), true, 'removing never revokes Prep Mock');
});

test('withOwnStudentWindow: only own students get the window; others keep the mock as it is', () => {
  const student = { _id: new mongoose.Types.ObjectId() };
  const base = { kind: 'mock', targetType: 'selected', assignedStudents: [], startTime: new Date('2026-01-01T00:00:00Z'), endTime: new Date('9999-12-31T23:59:59Z'),
    ownStudents: [student._id], ownAccess: { startTime: new Date('2026-12-01T00:00:00Z'), endTime: new Date('2026-12-31T00:00:00Z') } };
  const own = withOwnStudentWindow(base, student);
  assert.equal(own.startTime.toISOString(), '2026-12-01T00:00:00.000Z');
  assert.equal(own.endTime.toISOString(), '2026-12-31T00:00:00.000Z');
  assert.equal(withOwnStudentWindow(base, { _id: new mongoose.Types.ObjectId() }), base, 'not an own student: unchanged');
  assert.equal(withOwnStudentWindow({ ...base, targetType: 'all', platformShared: true }, student).endTime.getUTCFullYear(), 9999, 'a university copy that is open to all: unchanged');
  assert.equal(withOwnStudentWindow({ ...base, targetType: 'all' }, student).endTime.toISOString(), '2026-12-31T00:00:00.000Z', 'a platform mock: the window always applies');
  assert.equal(withOwnStudentWindow({ ...base, ownAccess: null }, student).endTime.getUTCFullYear(), 9999, 'no window: open');
});

test('turning Prep Mock on from Access & features enrols the student (else the sidebar hides Prep Mock)', async () => {
  const student = await User.create({ name: 'Access Page Student', email: 'access-page@example.test', role: 'student', passwordHash: 'x' });
  const result = await call(updateStudentAccess, { params: { studentId: String(student._id) }, body: { access: { mode: 'custom', features: ['dashboard', 'prep_mock'] } } });
  assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  const saved = await User.findById(student._id).lean();
  assert.ok(saved.prepMockEnrolledAt, 'enrolled');
  assert.equal(studentHasFeature(saved, 'prep_mock'), true);
  // Turning it off keeps the enrolment; the feature check alone hides it.
  await call(updateStudentAccess, { params: { studentId: String(student._id) }, body: { access: { mode: 'custom', features: ['dashboard'] } } });
  const off = await User.findById(student._id).lean();
  assert.ok(off.prepMockEnrolledAt);
  assert.equal(studentHasFeature(off, 'prep_mock'), false);
});

/* ------------------------------------------------------------------ admin list */

test('All Mocks list: the written pattern copy and availability on every row', async () => {
  const [pattern] = (await listPatterns({ company: 'Acme', role: 'SDE 1' })).patterns;
  const id = await newMock({ title: 'Listed mock', patternId: pattern._id });
  const full = await call(listAssessments, { query: { kind: 'mock' } });
  assert.equal(full.statusCode, 200, JSON.stringify(full.body));
  const row = full.body.assessments.find((item) => String(item._id) === id);
  assert.equal(String(row.patternId), pattern._id);
  assert.deepEqual(row.mockPattern.rows.map((item) => item.name), ['Aptitude', 'Coding']);
  assert.equal(row.availabilityMode, 'always');
  assert.equal(typeof row.totalQuestions, 'number', 'the usual list fields stay');
  const plainRow = full.body.assessments.find((item) => item.title === 'No pattern');
  assert.deepEqual([plainRow.patternId, plainRow.mockPattern], [null, null]);

  const dashboard = await call(listAssessments, { query: { kind: 'mock', view: 'dashboard' } });
  const compact = dashboard.body.assessments.find((item) => String(item._id) === id);
  assert.equal(String(compact.patternId), pattern._id);
  assert.equal(compact.company, 'Acme');

  const regular = await call(listAssessments, { query: {} });
  assert.ok(regular.body.assessments.length > 0 && regular.body.assessments.every((item) => item.kind !== 'mock'), 'Prep Assessment list has no mocks');
});

test('bulk unpublish returns a hidden published mock to draft and reports missing and already-draft mocks', async () => {
  const hiddenId = await newMock({ title: 'Hidden published mock' });
  const draftId = await newMock({ title: 'Already draft mock' });
  const missingId = String(new mongoose.Types.ObjectId());
  await Assessment.findByIdAndUpdate(hiddenId, { lifecycleStatus: 'published', isVisible: false });

  const result = await bulkUnpublishMocks({ scope: { mockIds: [hiddenId, draftId, missingId] } }, admin);

  assert.equal(result.unpublished, 1);
  assert.equal(result.alreadyOff, 1);
  assert.deepEqual(result.notFound, [missingId]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(result.unpublishedMocks.map((mock) => mock._id), [hiddenId]);
  const hidden = await Assessment.findById(hiddenId).lean();
  assert.equal(hidden.lifecycleStatus, 'draft');
  assert.equal(hidden.isVisible, false);
  assert.equal(hidden.mockHasHistory, true);
});

test('bulk assignment acknowledges saved grants when enabling student access fails and can retry safely', async (t) => {
  const mockId = await newMock({ title: 'Bulk assignment mock' });
  const student = await User.create({ name: 'Bulk Student', email: 'bulk-access@example.test', role: 'student', passwordHash: 'x' });
  const change = { scope: { mockIds: [mockId] }, add: [String(student._id)] };
  const failedActivation = t.mock.method(User, 'bulkWrite', async () => { throw new Error('Simulated activation failure'); });

  const partial = await bulkChangeOwnStudents(change, admin);

  assert.equal(partial.prepMockActivationFailed, true);
  assert.equal(partial.granted, 1);
  assert.equal(partial.perMock[0].granted, 1);
  assert.deepEqual((await Assessment.findById(mockId).lean()).ownStudents.map(String), [String(student._id)]);
  assert.equal(studentHasFeature(await User.findById(student._id).lean(), 'prep_mock'), false);

  failedActivation.mock.restore();
  const retried = await bulkChangeOwnStudents(change, admin);
  assert.equal(retried.prepMockActivationFailed, false);
  assert.equal(retried.granted, 0);
  assert.equal(retried.prepMockTurnedOn, 1);
  assert.equal(studentHasFeature(await User.findById(student._id).lean(), 'prep_mock'), true);
});
