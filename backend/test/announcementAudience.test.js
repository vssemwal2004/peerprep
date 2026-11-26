import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Announcement from '../src/models/Announcement.js';
import User from '../src/models/User.js';
import {
  createAnnouncement, getAnnouncementAudience, listAnnouncementsAdmin, listAnnouncementsStudent, updateAnnouncement,
} from '../src/controllers/announcementController.js';
import { matchAudienceUpload, uploadRowsFrom, csvMatrix } from '../src/services/announcementAudience.js';

// "Selected students": an announcement can go to chosen students only, picked from the registered
// list or an uploaded CSV/Excel file; coordinators stay inside their own students.
let mongo;
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'admin@example.test' };
const ownCoordinator = { _id: new mongoose.Types.ObjectId(), role: 'coordinator', coordinatorId: 'T1', coordinatorDataScope: 'own', coordinatorPermissions: ['coordinator.announcements.create', 'coordinator.announcements.manage', 'coordinator.students.view'], email: 'c@example.test' };
let students;

function capture() {
  const state = { statusCode: 200, body: null };
  return { state, status(code) { state.statusCode = code; return this; }, json(body) { state.body = body; return this; } };
}
const call = async (handler, req) => { const res = capture(); await handler(req, res); return res.state; };
const titlesFor = async (student) => (await call(listAnnouncementsStudent, { user: { _id: student._id, role: 'student' } })).body.announcements.map((item) => item.title).sort();
const csvFile = (text, name = 'list.csv') => ({ buffer: Buffer.from(text, 'utf8'), originalname: name, size: text.length });

before(async () => {
  mongo = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
  await mongoose.connect(mongo.getUri(), { dbName: 'announcement_audience_test' });
  await Promise.all([Announcement.init(), User.init()]);
  students = await User.insertMany([
    { name: 'Asha Rao', email: 'asha@uni.test', role: 'student', passwordHash: 'x', semester: 5, branch: 'CSE', teacherIds: ['T1'] },
    { name: 'Bilal Khan', email: 'Bilal@Uni.test', role: 'student', passwordHash: 'x', semester: 3, branch: 'ECE', teacherIds: ['T2'] },
    { name: 'Chen Li', email: 'chen@uni.test', role: 'student', passwordHash: 'x', semester: 5, branch: 'CSE', teacherIds: ['T1'] },
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('selected announcements reach only the chosen students; others and the list of names stay private', async () => {
  const [asha, bilal, chen] = students;
  await call(createAnnouncement, { body: { title: 'Everyone', message: 'For all', status: 'active' }, user: admin });
  const made = await call(createAnnouncement, { body: { title: 'Only Asha and Bilal', message: 'Chosen', status: 'active', audience: 'selected', studentIds: [String(asha._id), String(bilal._id), 'not-an-id'] }, user: admin });
  assert.equal(made.statusCode, 201);
  assert.equal(made.body.announcement.audience, 'selected');
  assert.equal(made.body.announcement.audienceCount, 2);
  assert.equal(made.body.announcement.studentIds, undefined, 'admins get the count, not the list');

  assert.deepEqual(await titlesFor(asha), ['Everyone', 'Only Asha and Bilal']);
  assert.deepEqual(await titlesFor(chen), ['Everyone']);
  const forStudent = (await call(listAnnouncementsStudent, { user: { _id: bilal._id, role: 'student' } })).body.announcements;
  assert.ok(forStudent.every((item) => item.studentIds === undefined), 'students never see who else was chosen');

  const listed = await call(listAnnouncementsAdmin, { query: {}, user: admin });
  const chosen = listed.body.announcements.find((item) => item.title === 'Only Asha and Bilal');
  assert.equal(chosen.audienceCount, 2);
  assert.equal(chosen.studentIds, undefined);

  const audience = await call(getAnnouncementAudience, { params: { id: String(made.body.announcement._id) }, user: admin });
  assert.deepEqual(audience.body.students.map((s) => s.name), ['Asha Rao', 'Bilal Khan']);

  const empty = await call(createAnnouncement, { body: { title: 'Nobody', message: 'x', audience: 'selected', studentIds: [] }, user: admin }).catch((error) => error);
  assert.equal(empty.status, 400, 'selected with no students is refused');

  const toAll = await call(updateAnnouncement, { params: { id: String(made.body.announcement._id) }, body: { audience: 'all' }, user: admin });
  assert.equal(toAll.body.announcement.audienceCount, 0);
  assert.deepEqual(await titlesFor(chen), ['Everyone', 'Only Asha and Bilal']);
});

test('an "own data" coordinator chooses only their students, and an edit keeps students they cannot see', async () => {
  const [asha, bilal, chen] = students;
  const made = await call(createAnnouncement, { body: { title: 'Coordinator pick', message: 'x', status: 'active', audience: 'selected', studentIds: [String(asha._id), String(bilal._id)] }, user: ownCoordinator });
  assert.equal(made.body.announcement.audienceCount, 1, 'Bilal is not this coordinator\'s student');
  assert.equal(made.body.skippedStudents, 1);

  const byAdmin = await call(createAnnouncement, { body: { title: 'Admin pick', message: 'x', status: 'active', audience: 'selected', studentIds: [String(asha._id), String(bilal._id)] }, user: admin });
  const id = String(byAdmin.body.announcement._id);
  const seen = await call(getAnnouncementAudience, { params: { id }, user: ownCoordinator });
  assert.deepEqual(seen.body.students.map((s) => s.name), ['Asha Rao']);
  assert.equal(seen.body.hiddenCount, 1);

  const edited = await call(updateAnnouncement, { params: { id }, body: { audience: 'selected', studentIds: [String(chen._id)] }, user: ownCoordinator });
  assert.equal(edited.body.announcement.audienceCount, 2, 'Chen added, Asha removed, Bilal (not visible to them) kept');
  const stored = await Announcement.findById(id).lean();
  assert.deepEqual(stored.studentIds.map(String).sort(), [String(bilal._id), String(chen._id)].sort());

  const noView = { ...ownCoordinator, coordinatorPermissions: ['coordinator.announcements.create'] };
  const refused = await call(createAnnouncement, { body: { title: 'x', message: 'x', audience: 'selected', studentIds: [String(asha._id)] }, user: noView }).catch((error) => error);
  assert.equal(refused.status, 403);
});

test('upload template rows: name and email required, optional columns, duplicates, bad rows', () => {
  const rows = uploadRowsFrom(csvMatrix(String.fromCharCode(0xfeff) + 'Name,E-mail,Sem,College,Branch\nAsha Rao,ASHA@uni.test,5,Main,CSE\n,missing@uni.test,,,\nNo Mail,,,,\nBad,not-an-email,,,\nAsha again,asha@uni.test,,,\n,,,,\n'));
  assert.deepEqual(rows.map((row) => [row.row, row.email, row.problem || 'ok']), [
    [2, 'asha@uni.test', 'ok'], [3, 'missing@uni.test', 'Name is missing'], [4, '', 'Email is missing'], [5, 'not-an-email', 'Email is not valid'], [6, 'asha@uni.test', 'duplicate'],
  ]);
  assert.equal(rows[0].semester, '5');
  assert.equal(uploadRowsFrom(csvMatrix('name,email\nA,a@b.co')).length, 1, 'optional columns can be left out');
  assert.throws(() => uploadRowsFrom(csvMatrix('name,phone\nA,1')), /"email" column/);
  assert.throws(() => uploadRowsFrom(csvMatrix('name,email\n')), /no student rows/);
});

test('uploaded CSV and Excel lists are matched to registered students by email, within the user\'s rights', async () => {
  const csv = 'name,email,semester\nAsha Rao,asha@uni.test,5\nBilal K,bilal@uni.test,3\nNew Person,new@uni.test,1\nBroken,nope,\n';
  const result = await matchAudienceUpload(csvFile(csv), admin);
  assert.deepEqual(result.totals, { rows: 4, matched: 2, notFound: 1, invalid: 1, duplicate: 0 });
  const bilal = result.rows.find((row) => row.email === 'bilal@uni.test');
  assert.equal(bilal.status, 'matched', 'stored email with capitals still matches');
  assert.equal(bilal.nameDiffers, true);
  assert.equal(bilal.student.name, 'Bilal Khan');

  const mine = await matchAudienceUpload(csvFile(csv), ownCoordinator);
  assert.equal(mine.rows.find((row) => row.email === 'bilal@uni.test').status, 'not_found', 'another coordinator\'s student is not revealed');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Students');
  sheet.addRow(['Name', 'Email', 'Branch']);
  sheet.addRow(['Chen Li', { text: 'chen@uni.test', hyperlink: 'mailto:chen@uni.test' }, 'CSE']);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const fromExcel = await matchAudienceUpload({ buffer, originalname: 'list.xlsx', size: buffer.length }, admin);
  assert.equal(fromExcel.rows[0].status, 'matched');
  assert.equal(fromExcel.rows[0].branch, 'CSE');

  await assert.rejects(matchAudienceUpload({ buffer: Buffer.from('name,email'), originalname: 'old.xls' }, admin), /\.xls files are not supported/);
  await assert.rejects(matchAudienceUpload(null, admin), /Choose a CSV or Excel file/);
});
