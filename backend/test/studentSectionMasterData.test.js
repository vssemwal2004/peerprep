import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import MasterData, { MASTER_DATA_CATEGORIES } from '../src/models/MasterData.js';
import User from '../src/models/User.js';
import { canonicalizeOptionalStudentFields } from '../src/services/masterDataService.js';
import { checkStudentsCsv, createStudent, updateStudent, uploadStudentsCsv } from '../src/controllers/studentController.js';

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

test('adding one student needs a section once Master Data has sections; editing checks only a changed section', async (t) => {
  if (skipped) return t.skip('MongoDB memory server is not available here');
  const body = { name: 'Esha', email: 'esha@x.edu', studentid: 'S5', branch: 'CSE', course: 'B.Tech', college: 'GEU', teacherid: '48327', semester: '5' };
  const missing = fakeRes();
  await createStudent({ body, user: admin }, missing);
  assert.equal(missing.statusCode, 400);
  assert.match(missing.body.error, /section/i);

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
