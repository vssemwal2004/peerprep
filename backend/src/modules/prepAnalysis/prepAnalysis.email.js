// "Send email" from Prep Analysis: an admin picks students and one of their own email templates
// (Settings → Email Templates). Each student gets the template with their own details filled in,
// through the mail queue (retries, Email Queue page). System templates (welcome, password reset,
// invitations…) need values only their own flows have, so they are not offered here.

import crypto from 'node:crypto';
import mongoose from 'mongoose';
import EmailTemplate from '../../models/EmailTemplate.js';
import { enqueueMailJobs } from '../../services/mailQueueService.js';
import { getDashboardUrl, renderTemplate } from '../../utils/mailer.js';
import { HttpError } from '../../utils/errors.js';
import { studentRowsByIds } from './prepAnalysis.service.js';

export const STUDENT_MAIL_LIMITS = Object.freeze({ maxRecipients: 5000, maxSubject: 300, maxHtml: 200_000 });

// A ready-made, editable template for nudging students who stopped at a step of Prep Coding
// ("How far students get"). Created once per university the first time the picker opens, as an
// ordinary (non-system) template, so it shows in Settings → Email Templates and can be changed.
export const PRACTICE_NUDGE_TYPE = 'PREP_PRACTICE_NUDGE';
export const PRACTICE_NUDGE_TEMPLATE = Object.freeze({
  type: PRACTICE_NUDGE_TYPE,
  templateKey: PRACTICE_NUDGE_TYPE,
  name: 'Prep Coding: next step reminder',
  subject: '{{firstName}}, your next Prep Coding step is waiting',
  variables: ['firstName', 'name', 'college', 'dashboardUrl'],
  htmlContent: `
<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr><td style="background:linear-gradient(135deg,#0ea5e9,#0369a1);background-color:#0284c7;padding:22px 28px;color:#ffffff;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.85;">PeerPrep · Prep Coding</div>
      <div style="margin-top:6px;font-size:22px;font-weight:800;line-height:1.3;">Keep your momentum going</div>
    </td></tr>
    <tr><td style="padding:26px 28px 8px;color:#0f172a;font-size:15px;line-height:1.65;">
      <p style="margin:0 0 14px;">Hi {{firstName}},</p>
      <p style="margin:0 0 14px;">You have made a start on Prep Coding. A few focused problems a week is the most reliable way to get placement-ready, and your next step is only one problem away.</p>
      <p style="margin:0 0 6px;font-weight:700;">This week, try to:</p>
      <ul style="margin:0 0 18px;padding-left:20px;color:#334155;">
        <li style="margin:4px 0;">Solve one Easy problem to warm up</li>
        <li style="margin:4px 0;">Attempt one Medium problem on a topic you find hard</li>
        <li style="margin:4px 0;">Keep a short daily streak, even 15 minutes counts</li>
      </ul>
      <p style="margin:0 0 24px;text-align:center;">
        <a href="{{dashboardUrl}}" style="display:inline-block;background:#0284c7;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:10px;">Continue practising</a>
      </p>
      <p style="margin:0 0 6px;color:#475569;font-size:13px;">If you are stuck on something, reply to this email and we will help.</p>
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
      Sent by your placement team at {{college}} through PeerPrep.
    </td></tr>
  </table>
</div>`.trim(),
});

async function ensurePracticeNudgeTemplate() {
  try {
    const exists = await EmailTemplate.exists({ type: PRACTICE_NUDGE_TYPE });
    if (!exists) await EmailTemplate.create({ ...PRACTICE_NUDGE_TEMPLATE, isSystem: false, isEnabled: true });
  } catch (error) {
    // Two admins opening the picker at once: the unique type lets only one create it.
    if (error?.code !== 11000) console.warn('[prep-analysis] could not add the next-step template:', error.message);
  }
}

/** The {{variables}} a template can use here, filled from each student's record. */
export const STUDENT_MAIL_VARIABLES = Object.freeze([
  { key: 'name', label: 'Full name' },
  { key: 'firstName', label: 'First name' },
  { key: 'studentId', label: 'Student ID' },
  { key: 'email', label: 'Email' },
  { key: 'semester', label: 'Semester' },
  { key: 'branch', label: 'Branch' },
  { key: 'course', label: 'Course' },
  { key: 'section', label: 'Section' },
  { key: 'group', label: 'Group' },
  { key: 'college', label: 'Campus' },
  { key: 'dashboardUrl', label: 'PeerPrep link' },
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** One student's values for the template ({{studentName}} is accepted as another name for {{name}}). */
export function studentMailValues(row, dashboardUrl = '') {
  const student = row.student || {};
  const name = String(row.name || '').trim();
  return {
    name, studentName: name, firstName: name.split(/\s+/)[0] || '',
    studentId: row.studentId || '', email: row.email || '',
    semester: student.semester ?? '', branch: student.branch || '', course: student.course || '',
    section: student.section || '', group: student.group || '', college: student.college || '',
    dashboardUrl,
  };
}

/** Subject (plain text, one line) and HTML (values escaped) for one student. */
export function renderStudentMail(template, row, dashboardUrl = '') {
  const values = studentMailValues(row, dashboardUrl);
  const escaped = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, escapeHtml(value)]));
  return {
    subject: renderTemplate(template.subject, values).replace(/[\r\n]+/g, ' ').trim().slice(0, 300),
    html: renderTemplate(template.htmlContent, escaped),
  };
}

/** The admin's own enabled templates, for the picker (with their HTML, which the dialog lets them edit). */
export async function listStudentMailTemplates() {
  await ensurePracticeNudgeTemplate();
  const templates = await EmailTemplate.find({ isSystem: { $ne: true }, isEnabled: { $ne: false } })
    .select('name subject htmlContent type variables updatedAt').sort({ name: 1 }).limit(200).lean();
  return {
    templates: templates.map((template) => ({
      id: String(template._id), name: template.name, subject: template.subject, html: template.htmlContent || '',
      variables: template.variables || [], updatedAt: template.updatedAt, suggested: template.type === PRACTICE_NUDGE_TYPE,
    })),
    variables: STUDENT_MAIL_VARIABLES,
    limits: STUDENT_MAIL_LIMITS,
  };
}

async function loadTemplate(templateId) {
  if (!mongoose.isValidObjectId(String(templateId || ''))) throw new HttpError(400, 'Choose an email template.');
  const template = await EmailTemplate.findOne({ _id: templateId, isSystem: { $ne: true }, isEnabled: { $ne: false } }).lean();
  if (!template) throw new HttpError(404, 'That email template is not available. Choose one of your own enabled templates.');
  return template;
}

/** Unique, valid student ids from the request; too many is a clear error rather than a silent cut. */
export function validateStudentIds(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Choose the students to email.');
  const ids = [...new Set(value.map((id) => String(id || '').trim()).filter((id) => mongoose.isValidObjectId(id)))];
  if (!ids.length) throw new HttpError(400, 'Choose the students to email.');
  if (ids.length > STUDENT_MAIL_LIMITS.maxRecipients) throw new HttpError(400, `You can email up to ${STUDENT_MAIL_LIMITS.maxRecipients.toLocaleString('en-US')} students at a time.`);
  return ids;
}

/**
 * The message to send: a chosen template, optionally edited in the dialog first (`draft`: { subject,
 * html }). The edit applies to this send only; the saved template is not changed.
 */
export function applyDraft(template, draft) {
  if (!draft || typeof draft !== 'object') return template;
  const subject = draft.subject === undefined ? template.subject : String(draft.subject);
  const html = draft.html === undefined ? template.htmlContent : String(draft.html);
  if (!subject.trim()) throw new HttpError(400, 'Add a subject.');
  if (!html.trim()) throw new HttpError(400, 'The email is empty.');
  if (subject.length > STUDENT_MAIL_LIMITS.maxSubject) throw new HttpError(400, `Keep the subject under ${STUDENT_MAIL_LIMITS.maxSubject} characters.`);
  if (html.length > STUDENT_MAIL_LIMITS.maxHtml) throw new HttpError(400, 'This email is too long. Shorten it and try again.');
  return { ...template, subject, htmlContent: html };
}

/** What one student would receive. */
export async function previewStudentMail({ user, query, templateId, studentId, draft }) {
  const template = applyDraft(await loadTemplate(templateId), draft);
  const [row] = await studentRowsByIds({ user, query, ids: validateStudentIds([studentId]) });
  if (!row) throw new HttpError(404, 'Student not found');
  return { to: row.email || '', name: row.name, ...renderStudentMail(template, row, getDashboardUrl()) };
}

/**
 * "Send test to me": the message as the first chosen student would get it, sent to the signed-in
 * admin's own address only (never to a typed address), marked [Test].
 */
export async function sendStudentTestMail({ user, query, templateId, studentId, draft }) {
  const to = String(user?.email || '').trim();
  if (!EMAIL.test(to)) throw new HttpError(400, 'Your account has no email address to send the test to.');
  const template = applyDraft(await loadTemplate(templateId), draft);
  const [row] = await studentRowsByIds({ user, query, ids: validateStudentIds([studentId]) });
  if (!row) throw new HttpError(404, 'Student not found');
  const message = renderStudentMail(template, row, getDashboardUrl());
  const batchId = crypto.randomUUID();
  await enqueueMailJobs([{
    type: 'student_message',
    to: to.toLowerCase(),
    payload: { to, subject: `[Test] ${message.subject}`.slice(0, STUDENT_MAIL_LIMITS.maxSubject), html: message.html },
    idempotencyKey: `student-message-test:${batchId}`,
    targetType: 'email_template',
    targetId: String(template._id),
    recipientId: String(user._id),
  }], { batchId, requestedBy: user?._id, requestedByEmail: user?.email });
  return { sentTo: to, asStudent: row.name };
}

/** Queues the template for every chosen student who has an email address. */
export async function sendStudentMail({ user, query, templateId, studentIds, draft }) {
  const template = applyDraft(await loadTemplate(templateId), draft);
  const ids = validateStudentIds(studentIds);
  const rows = await studentRowsByIds({ user, query, ids });
  const dashboardUrl = getDashboardUrl();
  const withEmail = rows.filter((row) => EMAIL.test(String(row.email || '').trim()));
  const batchId = crypto.randomUUID();
  const jobs = withEmail.map((row) => ({
    type: 'student_message',
    to: String(row.email).trim().toLowerCase(),
    payload: { to: String(row.email).trim(), ...renderStudentMail(template, row, dashboardUrl) },
    idempotencyKey: `student-message:${batchId}:${row.id}`,
    targetType: 'email_template',
    targetId: String(template._id),
    recipientId: row.id,
  }));
  const result = jobs.length
    ? await enqueueMailJobs(jobs, { batchId, requestedBy: user?._id, requestedByEmail: user?.email })
    : { batchId, queued: 0 };
  return {
    batchId: result.batchId, template: { id: String(template._id), name: template.name },
    requested: ids.length, queued: result.queued,
    noEmail: rows.length - withEmail.length,
    // Ids that are not students this admin can see (removed, or another university's) are never mailed.
    notFound: ids.length - rows.length,
  };
}
