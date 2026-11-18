import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import MasterData, { MASTER_DATA_CATEGORIES } from '../src/models/MasterData.js';
import User from '../src/models/User.js';
import { canonicalizeOptionalStudentFields } from '../src/services/masterDataService.js';
import { checkStudentsCsv, createStudent, listTeacherOptions, updateStudent, uploadStudentsCsv } from '../src/controllers/studentController.js';

let mongo;
let skipped = false;
const admin = { _id: new mongoose.Types.ObjectId(), email: 'admin@x.edu', role: 'admin', name: 'Admin' };

before(async () => {
  try {
    mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } });
  } catch (error) {
    if (error?.code === 'EPERM') { skipped = true; return; }
    throw error;
  }
  await mongoose.connect(mongo.getUri(), { dbName: 'student_section_master_data_test' });
  await MasterData.init();
  await MasterData.insertMany([
    { category: 'campus', name: 'GEU', normalizedName: 'geu' },
    { category: 'course', name: 'B.Tech', normalizedName: 'b.tech' },
    { category: 'branch', name: 'CSE', normalizedName: 'cse' },
    { category: 'semester', name: '5', normalizedName: '5', order: 5 },
    { category: 'section', name: 'A', normalizedName: 'a' },
    { category: 'section', name: 'B', normalizedName: 'b' },
    { category: 'section', name: 'Z', normalizedName: 'z', isActive: false },
  ]);
  await User.create({ role: 'coordinator', name: 'Coord', email: 'coord@x.edu', passwordHash: 'x', coordinatorId: '48327' });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    set() { return this; },
    setHeader() {},
    send(body) { this.body = body; return this; },
  };
}
const csvFile = (text) => ({ buffer: Buffer.from(text, 'utf8'), size: Buffer.byteLength(text), originalname: 'students.csv' });
const HEADER = 'Name,Email,Studentid,Branch,TeacherId,Semester,Course,College,Section,Group';

test('Master Data has Section and Group categories', () => {
  assert.ok(MASTER_DATA_CATEGORIES.includes('section'));
  assert.ok(MASTER_DATA_CATEGORIES.includes('group'));
});

test('section and group: free text without Master Data values, a listed value (any case) once there are some', () => {
  const maps = { section: new Map([['a', 'A'], ['b', 'B']]), group: new Map() };
  assert.deepEqual(canonicalizeOptionalStudentFields({ section: ' a ', group: '  G7 ' }, maps), { section: 'A', group: 'G7' });
  assert.deepEqual(canonicalizeOptionalStudentFields({ section: '' }, maps), { section: '' }, 'an empty value clears the field');
  assert.deepEqual(canonicalizeOptionalStudentFields({}, maps), {}, 'a missing column changes nothing');
  assert.throws(() => canonicalizeOptionalStudentFields({ section: 'C' }, maps), (error) => error.status === 400 && /Section "C" is not available in Master Data/.test(error.message));
});

test('CSV check and upload accept a listed section, store its Master Data spelling and reject others per row', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  const csv = [
    HEADER,
    'Asha,asha@x.edu,S1,cse,48327,5,b.tech,geu,a,G1',
    'Bilal,bilal@x.edu,S2,CSE,48327,5,B.Tech,GEU,C,G2',
    'Chen,chen@x.edu,S3,CSE,48327,5,B.Tech,GEU,z,',
    'Dev,dev@x.edu,S4,CSE,48327,5,B.Tech,GEU,,',
  ].join('\n');

  const check = fakeRes();
  await checkStudentsCsv({ file: csvFile(csv), user: admin, body: {} }, check);
  const checked = Object.fromEntries(check.body.results.map((result) => [result.studentid, result]));
  assert.equal(checked.S1.status, 'ready');
  assert.equal(checked.S2.status, 'invalid_master_data');
  assert.match(checked.S2.message, /Section "C" is not available in Master Data/);
  assert.equal(checked.S3.status, 'invalid_master_data', 'an inactive section is not accepted');
  assert.equal(checked.S4.status, 'ready', 'the section column is optional per row');

  const upload = fakeRes();
  await uploadStudentsCsv({ file: csvFile(csv), user: admin, body: {} }, upload);
  const uploaded = Object.fromEntries(upload.body.results.map((result) => [result.studentid, result]));
  assert.equal(uploaded.S1.status, 'created');
  assert.equal(uploaded.S2.status, 'invalid_master_data');
  assert.equal(uploaded.S4.status, 'created');
  const asha = await User.findOne({ studentId: 'S1' }).lean();
  assert.equal(asha.section, 'A', 'the Master Data spelling is stored');
  assert.equal(asha.group, 'G1', 'groups stay free text while Master Data has no groups');
  assert.equal((await User.findOne({ studentId: 'S4' }).lean()).section, undefined);
  assert.equal(await User.countDocuments({ studentId: { $in: ['S2', 'S3'] } }), 0);
});

test('adding one student: section and group are optional, a given section must be listed; editing checks only a changed section', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  const body = { name: 'Esha', email: 'esha@x.edu', studentid: 'S5', branch: 'CSE', course: 'B.Tech', college: 'GEU', teacherid: '48327', semester: '5' };
  const noSection = fakeRes();
  await createStudent({ body: { ...body, email: 'farah@x.edu', studentid: 'S6', name: 'Farah' }, user: admin }, noSection);
  assert.equal(noSection.statusCode, 201, 'no section, no group: still added');
  assert.ok(!(await User.findOne({ studentId: 'S6' }).lean()).section);

  const unlisted = fakeRes();
  await createStudent({ body: { ...body, section: 'Q' }, user: admin }, unlisted);
  assert.equal(unlisted.statusCode, 400, 'a section Master Data does not list is refused');

  const created = fakeRes();
  await createStudent({ body: { ...body, section: 'b' }, user: admin }, created);
  assert.equal(created.statusCode, 201);
  const esha = await User.findOne({ studentId: 'S5' }).lean();
  assert.equal(esha.section, 'B');

  // An older free-text section that Master Data does not list never blocks other edits.
  await User.updateOne({ _id: esha._id }, { $set: { section: 'Old-7' } });
  const rename = fakeRes();
  await updateStudent({ params: { studentId: String(esha._id) }, body: { name: 'Esha K', section: 'Old-7' }, user: admin }, rename);
  assert.equal(rename.statusCode, 200);
  assert.equal(rename.body.student.section, 'Old-7');

  const bad = fakeRes();
  await updateStudent({ params: { studentId: String(esha._id) }, body: { section: 'Q' }, user: admin }, bad);
  assert.equal(bad.statusCode, 400);
  const good = fakeRes();
  await updateStudent({ params: { studentId: String(esha._id) }, body: { section: 'a' }, user: admin }, good);
  assert.equal(good.body.student.section, 'A');
});

test('Teacher ID picker: only existing coordinators, searchable; an own-data coordinator sees only their own', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  await User.create([
    { role: 'coordinator', name: 'Meera Joshi', email: 'meera@x.edu', passwordHash: 'x', coordinatorId: 'COO1', department: 'CSE' },
    { role: 'coordinator', name: 'Ravi Kumar', email: 'ravi@x.edu', passwordHash: 'x', coordinatorId: 'COO2', department: 'ECE', isActive: false },
  ]);
  const all = fakeRes();
  await listTeacherOptions({ query: {}, user: admin }, all);
  assert.deepEqual(all.body.teachers.map((teacher) => teacher.id).sort(), ['48327', 'COO1', 'COO2']);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.teachers.find((teacher) => teacher.id === 'COO2').active, false, 'inactive coordinators are marked');
  assert.ok(!('email' in all.body.teachers[0]), 'no contact details in the picker');

  const search = fakeRes();
  await listTeacherOptions({ query: { search: 'meera' }, user: admin }, search);
  assert.deepEqual(search.body.teachers.map((teacher) => teacher.id), ['COO1']);
  const byDepartment = fakeRes();
  await listTeacherOptions({ query: { search: 'ece' }, user: admin }, byDepartment);
  assert.deepEqual(byDepartment.body.teachers.map((teacher) => teacher.id), ['COO2']);

  const own = fakeRes();
  await listTeacherOptions({ query: {}, user: { role: 'coordinator', coordinatorId: 'COO1', coordinatorDataScope: 'own' } }, own);
  assert.equal(own.body.ownOnly, true);
  assert.deepEqual(own.body.teachers.map((teacher) => teacher.id), ['COO1']);
});

test('bulk access: turn Prep Mates on for ticked students, then off for every matching student', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  const { bulkUpdateStudentAccess } = await import('../src/controllers/studentController.js');
  const ids = (await User.find({ role: 'student', studentId: { $in: ['S1', 'S4'] } }).select('_id').lean()).map((student) => String(student._id));
  const on = fakeRes();
  await bulkUpdateStudentAccess({ body: { studentIds: ids, change: { type: 'grant', features: ['peers'] } }, user: admin }, on);
  assert.equal(on.statusCode, 200);
  assert.deepEqual([on.body.matched, on.body.updated, on.body.unchanged], [2, 2, 0]);
  const asha = await User.findOne({ studentId: 'S1' }).lean();
  assert.equal(asha.featureAccess.mode, 'custom');
  assert.ok(asha.featureAccess.features.includes('peers') && asha.featureAccess.features.includes('learning'), 'Prep Mates added, every standard module kept');

  const again = fakeRes();
  await bulkUpdateStudentAccess({ body: { studentIds: ids, change: { type: 'grant', features: ['peers'] } }, user: admin }, again);
  assert.deepEqual([again.body.updated, again.body.unchanged], [0, 2], 'already had it');

  const off = fakeRes();
  await bulkUpdateStudentAccess({ body: { allMatching: true, filters: {}, change: { type: 'revoke', features: ['peers'] } }, user: admin }, off);
  assert.equal(off.body.updated, 2, 'only the two who had it change');
  assert.equal((await User.findOne({ studentId: 'S1' }).lean()).featureAccess.mode, 'all', 'back to All access');

  const bad = fakeRes();
  await bulkUpdateStudentAccess({ body: { studentIds: ids, change: { type: 'grant', features: [] } }, user: admin }, bad);
  assert.equal(bad.statusCode, 400);
});
