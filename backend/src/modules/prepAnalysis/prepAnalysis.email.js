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

export const STUDENT_MAIL_LIMITS = Object.freeze({ maxRecipients: 5000 });

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

/** The admin's own enabled templates, for the picker. */
export async function listStudentMailTemplates() {
  const templates = await EmailTemplate.find({ isSystem: { $ne: true }, isEnabled: { $ne: false } })
    .select('name subject variables updatedAt').sort({ name: 1 }).limit(200).lean();
  return {
    templates: templates.map((template) => ({ id: String(template._id), name: template.name, subject: template.subject, variables: template.variables || [], updatedAt: template.updatedAt })),
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

/** What one student would receive. */
export async function previewStudentMail({ user, query, templateId, studentId }) {
  const template = await loadTemplate(templateId);
  const [row] = await studentRowsByIds({ user, query, ids: validateStudentIds([studentId]) });
  if (!row) throw new HttpError(404, 'Student not found');
  return { to: row.email || '', name: row.name, ...renderStudentMail(template, row, getDashboardUrl()) };
}

/** Queues the template for every chosen student who has an email address. */
export async function sendStudentMail({ user, query, templateId, studentIds }) {
  const template = await loadTemplate(templateId);
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
