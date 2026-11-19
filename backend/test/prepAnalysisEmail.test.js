// Prep Analysis "Send email": chosen students get one of the admin's own templates through the mail queue.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import User from '../src/models/User.js';
import EmailTemplate from '../src/models/EmailTemplate.js';
import MailJob from '../src/models/MailJob.js';
import { decryptMailPayload } from '../src/services/mailQueueService.js';
import {
  STUDENT_MAIL_LIMITS, listStudentMailTemplates, previewStudentMail, renderStudentMail, sendStudentMail, sendStudentTestMail, validateStudentIds,
} from '../src/modules/prepAnalysis/prepAnalysis.email.js';
import { matchingStudentIds, validatePrepAnalysisQuery } from '../src/modules/prepAnalysis/prepAnalysis.service.js';

let mongo;
let skipped = false;
const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin', email: 'admin@example.test' };
const people = {};
let custom;
let system;
let disabled;

before(async () => {
  process.env.JWT_SECRET ||= 'test-secret-for-mail-queue-encryption';
  try { mongo = await MongoMemoryServer.create({ instance: { ip: '127.0.0.1', launchTimeout: 60000 } }); } catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri(), { dbName: 'prep_analysis_email_test' });
  await Promise.all([User.init(), EmailTemplate.init(), MailJob.init()]);
  for (const [key, name, email, branch] of [['s1', 'Asha <Rao>', 'asha@example.test', 'CSE'], ['s2', 'Bilal Khan', 'bilal@example.test', 'ECE'], ['s3', 'Chen Li', '', 'CSE']]) {
    const user = await User.create({ name, email: email || undefined, studentId: key.toUpperCase(), passwordHash: 'x', role: 'student', branch, semester: 5, section: 'A' });
    people[key] = String(user._id);
  }
  custom = await EmailTemplate.create({ type: 'PRACTICE_REMINDER', name: 'Practice reminder', subject: 'Hi {{firstName}} ({{studentId}})',
    htmlContent: '<p>Dear {{name}}, {{branch}} sem {{semester}} sec {{section}}: <a href="{{dashboardUrl}}">open</a> {{unknown}}</p>' });
  system = await EmailTemplate.create({ type: 'ONBOARDING_TEST', name: 'Welcome', subject: 'Welcome', htmlContent: '<p>{{password}}</p>', isSystem: true });
  disabled = await EmailTemplate.create({ type: 'OLD_NOTE', name: 'Old note', subject: 'Old', htmlContent: '<p>old</p>', isEnabled: false });
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

const guard = (t) => { if (skipped) { t.skip('MongoDB memory server is not available here'); return true; } return false; };
const query = (extra = {}) => validatePrepAnalysisQuery({ module: 'coding', range: { preset: 'all' }, ...extra }, undefined);

test('a template is filled per student: HTML values escaped, subject on one line, unknown variables empty', () => {
  const template = { subject: 'Hi {{firstName}}\n{{name}}', htmlContent: '<p>{{name}} {{studentName}} {{missing}}</p>' };
  const mail = renderStudentMail(template, { name: 'Asha <b>Rao</b>', studentId: 'S1', student: {} }, 'https://x/');
  assert.equal(mail.subject, 'Hi Asha Asha <b>Rao</b>');
  assert.equal(mail.html, '<p>Asha &lt;b&gt;Rao&lt;/b&gt; Asha &lt;b&gt;Rao&lt;/b&gt; </p>');
});

test('student id lists are validated, de-duplicated and capped', () => {
  const id = new mongoose.Types.ObjectId().toString();
  assert.deepEqual(validateStudentIds([id, id, 'not-an-id']), [id]);
  assert.throws(() => validateStudentIds([]), /Choose the students/);
  assert.throws(() => validateStudentIds('x'), /Choose the students/);
  const many = Array.from({ length: STUDENT_MAIL_LIMITS.maxRecipients + 1 }, () => new mongoose.Types.ObjectId().toString());
  assert.throws(() => validateStudentIds(many), /up to/);
});

test('only the admin\'s own enabled templates are offered', async (t) => {
  if (guard(t)) return;
  const { templates, variables } = await listStudentMailTemplates();
  // The ready-made "next step reminder" and one email per Practice journey gap are added once, as
  // ordinary editable templates.
  assert.deepEqual(templates.map((template) => template.name), [
    'Practice journey 1: never tried a problem', 'Practice journey 2: tried, nothing solved yet', 'Practice journey 3: ready for Medium',
    'Practice journey 4: take on a Hard', 'Practice reminder', 'Prep Coding: next step reminder',
  ]);
  assert.equal(templates.find((template) => template.suggested)?.name, 'Prep Coding: next step reminder');
  assert.match(templates.find((template) => template.name === 'Practice reminder').html, /Dear \{\{name\}\}/, 'the dialog gets the HTML to edit');
  assert.ok(variables.some((variable) => variable.key === 'firstName'));
  // Emailing a gap suggests that gap's own template.
  const forGap = await listStudentMailTemplates({ stage: 'lost:3' });
  assert.equal(forGap.templates.find((template) => template.suggested)?.name, 'Practice journey 3: ready for Medium');
  assert.equal(forGap.templates.find((template) => template.suggested)?.stage, 'lost:3');
  assert.match(forGap.templates.find((template) => template.stage === 'lost:1').html, /data-pp="title"[^>]*>Start with one problem today</, 'marked up for the text editor');
  await listStudentMailTemplates();
  assert.equal(await EmailTemplate.countDocuments({ type: 'PREP_PRACTICE_NUDGE' }), 1, 'never added twice');
  assert.equal(await EmailTemplate.countDocuments({ type: /^PREP_JOURNEY_/ }), 4, 'four gap templates, never added twice');
  const nudge = await EmailTemplate.findOne({ type: 'PREP_PRACTICE_NUDGE' }).lean();
  assert.equal(nudge.isSystem, false, 'editable in Settings → Email Templates');
});

test('an edited draft is used for this send only, with limits; the saved template is unchanged', async (t) => {
  if (guard(t)) return;
  const draft = { subject: 'Hello {{firstName}}', html: '<p>Edited for {{name}}</p>' };
  const preview = await previewStudentMail({ user: admin, query: query(), templateId: String(custom._id), studentId: people.s2, draft });
  assert.equal(preview.subject, 'Hello Bilal');
  assert.equal(preview.html, '<p>Edited for Bilal Khan</p>');
  assert.equal((await EmailTemplate.findById(custom._id).lean()).subject, 'Hi {{firstName}} ({{studentId}})');
  await assert.rejects(previewStudentMail({ user: admin, query: query(), templateId: String(custom._id), studentId: people.s2, draft: { subject: '  ' } }), /Add a subject/);
  await assert.rejects(previewStudentMail({ user: admin, query: query(), templateId: String(custom._id), studentId: people.s2, draft: { html: 'x'.repeat(STUDENT_MAIL_LIMITS.maxHtml + 1) } }), /too long/);
});

test('"send test to me" goes only to the signed-in admin, marked [Test], as the first student would see it', async (t) => {
  if (guard(t)) return;
  const result = await sendStudentTestMail({ user: admin, query: query(), templateId: String(custom._id), studentId: people.s1, draft: { subject: 'Hi {{firstName}}', html: '<p>{{name}}</p>' } });
  assert.deepEqual(result, { sentTo: 'admin@example.test', asStudent: 'Asha <Rao>' });
  const job = await MailJob.findOne({ to: 'admin@example.test' }).lean();
  const payload = decryptMailPayload(job.payloadEncrypted);
  assert.equal(payload.subject, '[Test] Hi Asha');
  assert.equal(payload.html, '<p>Asha &lt;Rao&gt;</p>');
  assert.equal(await MailJob.countDocuments({ to: 'asha@example.test', idempotencyKey: /^student-message-test/ }), 0, 'the student is never mailed by a test');
  await assert.rejects(sendStudentTestMail({ user: { ...admin, email: '' }, query: query(), templateId: String(custom._id), studentId: people.s1 }), /no email address/);
});

test('preview shows what one student gets', async (t) => {
  if (guard(t)) return;
  const preview = await previewStudentMail({ user: admin, query: query(), templateId: String(custom._id), studentId: people.s2 });
  assert.equal(preview.to, 'bilal@example.test');
  assert.equal(preview.subject, 'Hi Bilal (S2)');
  assert.match(preview.html, /Dear Bilal Khan, ECE sem 5 sec A: <a href="http/);
  await assert.rejects(previewStudentMail({ user: admin, query: query(), templateId: String(system._id), studentId: people.s2 }), /not available/);
  await assert.rejects(previewStudentMail({ user: admin, query: query(), templateId: String(disabled._id), studentId: people.s2 }), /not available/);
});

test('send queues one email per student with an address; others are counted, never mailed', async (t) => {
  if (guard(t)) return;
  const stranger = new mongoose.Types.ObjectId().toString();
  const result = await sendStudentMail({ user: admin, query: query(), templateId: String(custom._id), studentIds: [people.s1, people.s2, people.s3, stranger] });
  assert.deepEqual([result.requested, result.queued, result.noEmail, result.notFound], [4, 2, 1, 1]);
  const jobs = await MailJob.find({ batchId: result.batchId }).lean();
  assert.deepEqual(jobs.map((job) => job.to).sort(), ['asha@example.test', 'bilal@example.test']);
  assert.ok(jobs.every((job) => job.type === 'student_message' && job.status === 'queued'));
  const asha = decryptMailPayload(jobs.find((job) => job.to === 'asha@example.test').payloadEncrypted);
  assert.equal(asha.subject, 'Hi Asha (S1)');
  assert.match(asha.html, /Dear Asha &lt;Rao&gt;/, 'student names are escaped in the HTML');
});

test('"select all matching" returns every student behind the table and its search box', async (t) => {
  if (guard(t)) return;
  const all = await matchingStudentIds({ user: admin, query: query() });
  assert.deepEqual(all.sort(), [people.s1, people.s2, people.s3].sort());
  const searched = await matchingStudentIds({ user: admin, query: query({ table: { search: 'bilal, S3' } }) });
  assert.deepEqual(searched.sort(), [people.s2, people.s3].sort());
});
