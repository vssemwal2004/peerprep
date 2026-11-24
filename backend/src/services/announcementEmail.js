// "Also send as email" for announcements (2026-11-24). The admin picks one of their own email
// templates (Settings → Email Templates; a ready-made "Announcement email" is added once per
// university), may edit it for this send (text or HTML), previews it, sends a test to themselves,
// and queues it for chosen students. The announcement's own title, content, name and button fill
// the template's {{announcement…}} variables, so the design lives in the template, not in code.
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import EmailTemplate from '../models/EmailTemplate.js';
import User from '../models/User.js';
import { enqueueMailJobs } from './mailQueueService.js';
import { announcementFields, categoryFor, LIMITS } from './announcementContent.js';
import { normalizeAssessmentInvitationHtml } from './assessmentInvitationTemplate.js';
import { getDashboardUrl, renderTemplate } from '../utils/mailer.js';
import { HttpError } from '../utils/errors.js';

export const ANNOUNCEMENT_MAIL_LIMITS = Object.freeze({ maxRecipients: 5000, maxSubject: 300, maxHtml: 200_000 });
export const ANNOUNCEMENT_TEMPLATE_TYPE = 'ANNOUNCEMENT_EMAIL';

// Ready-made, editable: created as an ordinary template the first time the email dialog opens.
export const ANNOUNCEMENT_TEMPLATE = Object.freeze({
  type: ANNOUNCEMENT_TEMPLATE_TYPE,
  templateKey: ANNOUNCEMENT_TEMPLATE_TYPE,
  name: 'Announcement email',
  subject: '{{announcementLabel}}: {{announcementTitle}}',
  variables: ['firstName', 'name', 'college', 'dashboardUrl', 'announcementLabel', 'announcementTitle', 'announcementContent', 'announcementText', 'buttonLabel', 'buttonUrl', 'buttonBlock', 'accentColor'],
  htmlContent: `
<div style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <tr><td style="background-color:{{accentColor}};padding:22px 28px;color:#ffffff;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.9;">{{announcementLabel}}</div>
      <div style="margin-top:6px;font-size:22px;font-weight:800;line-height:1.3;">{{announcementTitle}}</div>
    </td></tr>
    <tr><td style="padding:24px 28px 8px;color:#0f172a;font-size:15px;line-height:1.65;">
      <p style="margin:0 0 14px;">Hi {{firstName}},</p>
      {{announcementContent}}
      {{buttonBlock}}
    </td></tr>
    <tr><td style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
      Sent by {{college}} through PeerPrep · <a href="{{dashboardUrl}}" style="color:#64748b;">Open PeerPrep</a>
    </td></tr>
  </table>
</div>`.trim(),
});

/** Template variables shown as insert chips in the dialog. */
export const ANNOUNCEMENT_MAIL_VARIABLES = Object.freeze([
  { key: 'firstName', label: 'First name' }, { key: 'name', label: 'Full name' }, { key: 'studentId', label: 'Student ID' },
  { key: 'semester', label: 'Semester' }, { key: 'branch', label: 'Branch' }, { key: 'section', label: 'Section' }, { key: 'college', label: 'Campus' },
  { key: 'announcementTitle', label: 'Announcement title' }, { key: 'announcementLabel', label: 'Its name (Notice, Exam…)' },
  { key: 'announcementContent', label: 'Announcement content' }, { key: 'announcementText', label: 'Content as text' },
  { key: 'buttonBlock', label: 'Button' }, { key: 'buttonLabel', label: 'Button text' }, { key: 'buttonUrl', label: 'Button link' },
  { key: 'accentColor', label: 'Announcement colour' }, { key: 'dashboardUrl', label: 'PeerPrep link' },
]);

const CATEGORY_LABELS = {
  announcement: 'Announcement', notice: 'Notice', alert: 'Alert', update: 'Update', event: 'Event', reminder: 'Reminder', deadline: 'Deadline',
  exam: 'Exam', placement: 'Placement', holiday: 'Holiday', achievement: 'Achievement', motivation: 'Motivation',
};
const THEME_COLORS = { sky: '#0284c7', teal: '#0d9488', emerald: '#059669', amber: '#d97706', orange: '#ea580c', rose: '#e11d48', slate: '#334155' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function ensureAnnouncementTemplate() {
  try {
    if (await EmailTemplate.exists({ type: ANNOUNCEMENT_TEMPLATE_TYPE })) return;
    await EmailTemplate.create({ ...ANNOUNCEMENT_TEMPLATE, isSystem: false, isEnabled: true });
  } catch (error) {
    // Two admins opening the dialog at once: the unique type lets only one create it.
    if (error?.code !== 11000) console.warn('[announcements] could not add the ready-made email template:', error.message);
  }
}

/** The admin's own enabled templates for the picker; the announcement template is suggested. */
export async function listAnnouncementMailTemplates() {
  await ensureAnnouncementTemplate();
  const templates = await EmailTemplate.find({ isSystem: { $ne: true }, isEnabled: { $ne: false } })
    .select('name subject htmlContent type variables updatedAt').sort({ name: 1 }).limit(200).lean();
  return {
    templates: templates.map((template) => ({
      id: String(template._id), name: template.name, subject: template.subject, html: template.htmlContent || '',
      variables: template.variables || [], updatedAt: template.updatedAt, suggested: template.type === ANNOUNCEMENT_TEMPLATE_TYPE,
    })),
    variables: ANNOUNCEMENT_MAIL_VARIABLES,
    limits: ANNOUNCEMENT_MAIL_LIMITS,
  };
}

async function loadTemplate(templateId) {
  if (!mongoose.isValidObjectId(String(templateId || ''))) throw new HttpError(400, 'Choose an email template.');
  const template = await EmailTemplate.findOne({ _id: templateId, isSystem: { $ne: true }, isEnabled: { $ne: false } }).lean();
  if (!template) throw new HttpError(404, 'That email template is not available. Choose one of your own enabled templates.');
  return template;
}

/**
 * The message for this send: the chosen template, optionally edited in the dialog (`draft`:
 * { subject, html }). The edit never changes the saved template. The HTML goes through the email
 * sanitiser (no scripts, handlers or unsafe links), since coordinators can send too.
 */
export function applyDraft(template, draft) {
  const subject = draft?.subject === undefined ? template.subject : String(draft.subject);
  const source = draft?.html === undefined ? template.htmlContent : String(draft.html);
  if (!subject.trim()) throw new HttpError(400, 'Add a subject.');
  if (!source.trim()) throw new HttpError(400, 'The email is empty.');
  if (subject.length > ANNOUNCEMENT_MAIL_LIMITS.maxSubject) throw new HttpError(400, `Keep the subject under ${ANNOUNCEMENT_MAIL_LIMITS.maxSubject} characters.`);
  if (source.length > ANNOUNCEMENT_MAIL_LIMITS.maxHtml) throw new HttpError(400, 'This email is too long. Shorten it and try again.');
  // {{accentColor}} sits inside style attributes, where the sanitiser drops any value that is not
  // valid CSS: swap in a stand-in colour for the check and put the variable back after.
  const STAND_IN = '#a11c0e';
  let html;
  try {
    html = normalizeAssessmentInvitationHtml(source.replace(/\{\{\s*accentColor\s*\}\}/g, STAND_IN)).replaceAll(STAND_IN, '{{accentColor}}');
  } catch (error) { throw new HttpError(400, error.message); }
  return { ...template, subject, htmlContent: html };
}

// Email clients ignore page CSS: give the announcement's content inline styles.
const INLINE = {
  h2: 'margin:18px 0 8px;font-size:19px;line-height:1.35;color:#0f172a;', h3: 'margin:16px 0 6px;font-size:16px;line-height:1.4;color:#0f172a;',
  h4: 'margin:14px 0 6px;font-size:15px;color:#0f172a;', p: 'margin:0 0 12px;', ul: 'margin:0 0 12px;padding-left:20px;', ol: 'margin:0 0 12px;padding-left:20px;',
  li: 'margin:4px 0;', blockquote: 'margin:0 0 12px;padding-left:12px;border-left:4px solid #e2e8f0;color:#475569;font-style:italic;',
  a: 'color:#0284c7;', hr: 'border:0;border-top:1px solid #e2e8f0;margin:16px 0;',
};
export function emailContentHtml(html) {
  return String(html || '').replace(/<(h2|h3|h4|p|ul|ol|li|blockquote|a|hr)(\s[^>]*)?>/g, (match, tag, attributes = '') => {
    const existing = /style="([^"]*)"/.exec(attributes);
    const rest = attributes.replace(/\sstyle="[^"]*"/, '');
    return `<${tag}${rest} style="${INLINE[tag]}${existing ? existing[1] : ''}">`;
  });
}

/** The announcement as the form currently has it (sanitised like a save, nothing stored). */
export function announcementForMail(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  // Only the keys the form sent (a present-but-empty messageHtml would wipe the message).
  const body = Object.fromEntries(['title', 'messageHtml', 'message', 'category', 'label', 'theme', 'ctaLabel', 'ctaUrl']
    .filter((key) => source[key] !== undefined && source[key] !== null && !(key === 'messageHtml' && !String(source[key]).trim()))
    .map((key) => [key, source[key]]));
  const fields = announcementFields({ category: 'announcement', ...body }, { partial: true });
  if (!fields.title || !fields.message) throw new HttpError(400, 'Add the announcement title and message first.');
  return { ...fields, category: categoryFor(fields), theme: THEME_COLORS[fields.theme] ? fields.theme : 'sky' };
}

/** Absolute link for a button: PeerPrep pages are resolved against this university's address. */
function absoluteLink(url, dashboardUrl) {
  if (!url) return '';
  if (url.startsWith('/')) return new URL(url.slice(1), dashboardUrl).toString();
  return url;
}

/** One student's subject (one plain line) and HTML: student values escaped, content sanitised. */
export function renderAnnouncementMail(template, announcement, row, dashboardUrl = getDashboardUrl()) {
  const student = row.student || {};
  const name = String(row.name || '').trim();
  const label = announcement.label || CATEGORY_LABELS[announcement.category] || 'Announcement';
  const accent = THEME_COLORS[announcement.theme] || THEME_COLORS.sky;
  const buttonUrl = absoluteLink(announcement.ctaUrl, dashboardUrl);
  const plain = {
    name, studentName: name, firstName: name.split(/\s+/)[0] || 'there', studentId: row.studentId || '', email: row.email || '',
    semester: student.semester ?? '', branch: student.branch || '', course: student.course || '', section: student.section || '', group: student.group || '',
    college: student.college || 'your university', dashboardUrl, announcementTitle: announcement.title, announcementLabel: label,
    announcementText: announcement.message, buttonLabel: announcement.ctaLabel || '', buttonUrl, accentColor: accent,
  };
  const values = Object.fromEntries(Object.entries(plain).map(([key, value]) => [key, escapeHtml(value)]));
  values.announcementContent = announcement.messageHtml ? emailContentHtml(announcement.messageHtml)
    : `<p style="margin:0 0 12px;">${escapeHtml(announcement.message).replace(/\n/g, '<br>')}</p>`;
  values.buttonBlock = announcement.ctaLabel && buttonUrl
    ? `<p style="margin:20px 0 8px;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;background:${accent};color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;">${escapeHtml(announcement.ctaLabel)}</a></p>`
    : '';
  return {
    subject: renderTemplate(template.subject, plain).replace(/[\r\n]+/g, ' ').trim().slice(0, ANNOUNCEMENT_MAIL_LIMITS.maxSubject),
    html: renderTemplate(template.htmlContent, values),
  };
}

/** Unique valid ids; too many is a clear error rather than a silent cut. */
export function validateStudentIds(value) {
  if (!Array.isArray(value)) throw new HttpError(400, 'Choose the students to email.');
  const ids = [...new Set(value.map((id) => String(id || '').trim()).filter((id) => mongoose.isValidObjectId(id)))];
  if (!ids.length) throw new HttpError(400, 'Choose the students to email.');
  if (ids.length > ANNOUNCEMENT_MAIL_LIMITS.maxRecipients) throw new HttpError(400, `You can email up to ${ANNOUNCEMENT_MAIL_LIMITS.maxRecipients.toLocaleString('en-US')} students at a time.`);
  return ids;
}

/** Students this user may email: active students, and only their own for "own data" coordinators. */
async function studentRows(user, ids) {
  const query = { _id: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) }, role: 'student', isActive: { $ne: false } };
  if (user?.role === 'coordinator' && user.coordinatorDataScope !== 'all') query.teacherIds = user.coordinatorId;
  const users = await User.find(query).select('name email studentId semester branch course section group college').limit(ANNOUNCEMENT_MAIL_LIMITS.maxRecipients).lean();
  return users.map((student) => ({
    id: String(student._id), name: student.name, email: student.email, studentId: student.studentId,
    student: { semester: student.semester, branch: student.branch, course: student.course, section: student.section, group: student.group, college: student.college },
  }));
}

/** A sample student for the preview: the first chosen one, else the signed-in admin's own details. */
async function sampleRow(user, studentId) {
  if (studentId && mongoose.isValidObjectId(String(studentId))) {
    const [row] = await studentRows(user, [String(studentId)]);
    if (row) return row;
  }
  return { id: String(user?._id || ''), name: user?.name || 'Student', email: user?.email || '', studentId: '', student: { college: user?.college || '' } };
}

/** What a student will receive (no email is sent). */
export async function previewAnnouncementMail({ user, templateId, draft, announcement, studentId }) {
  const template = applyDraft(await loadTemplate(templateId), draft);
  const row = await sampleRow(user, studentId);
  return { to: row.email || '', name: row.name, ...renderAnnouncementMail(template, announcementForMail(announcement), row) };
}

/** "Send test to me": as the sample student would get it, to the signed-in user's own address only. */
export async function sendAnnouncementTestMail({ user, templateId, draft, announcement, studentId }) {
  const to = String(user?.email || '').trim();
  if (!EMAIL.test(to)) throw new HttpError(400, 'Your account has no email address to send the test to.');
  const template = applyDraft(await loadTemplate(templateId), draft);
  const row = await sampleRow(user, studentId);
  const message = renderAnnouncementMail(template, announcementForMail(announcement), row);
  const batchId = crypto.randomUUID();
  await enqueueMailJobs([{
    type: 'student_message', to: to.toLowerCase(),
    payload: { to, subject: `[Test] ${message.subject}`.slice(0, ANNOUNCEMENT_MAIL_LIMITS.maxSubject), html: message.html },
    idempotencyKey: `announcement-mail-test:${batchId}`, targetType: 'email_template', targetId: String(template._id), recipientId: String(user._id),
  }], { batchId, requestedBy: user?._id, requestedByEmail: user?.email });
  return { sentTo: to, asStudent: row.name };
}

/** Queues the email for every chosen student this user may reach who has an email address. */
export async function sendAnnouncementMail({ user, templateId, draft, announcement, announcementId, studentIds }) {
  const template = applyDraft(await loadTemplate(templateId), draft);
  const content = announcementForMail(announcement);
  const ids = validateStudentIds(studentIds);
  const rows = await studentRows(user, ids);
  const dashboardUrl = getDashboardUrl();
  const withEmail = rows.filter((row) => EMAIL.test(String(row.email || '').trim()));
  const batchId = crypto.randomUUID();
  const target = mongoose.isValidObjectId(String(announcementId || '')) ? { targetType: 'announcement', targetId: String(announcementId) } : { targetType: 'email_template', targetId: String(template._id) };
  const jobs = withEmail.map((row) => ({
    type: 'student_message', to: String(row.email).trim().toLowerCase(),
    payload: { to: String(row.email).trim(), ...renderAnnouncementMail(template, content, row, dashboardUrl) },
    idempotencyKey: `announcement-mail:${batchId}:${row.id}`, ...target, recipientId: row.id,
  }));
  const result = jobs.length ? await enqueueMailJobs(jobs, { batchId, requestedBy: user?._id, requestedByEmail: user?.email }) : { batchId, queued: 0 };
  return {
    batchId: result.batchId, template: { id: String(template._id), name: template.name },
    requested: ids.length, queued: result.queued, noEmail: rows.length - withEmail.length,
    // Ids that are not students this user can reach (removed, another university's, not assigned) are never mailed.
    notFound: ids.length - rows.length,
  };
}

export { LIMITS as ANNOUNCEMENT_LIMITS };
