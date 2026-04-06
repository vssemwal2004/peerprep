import nodemailer from 'nodemailer';
import EmailTemplate from '../models/EmailTemplate.js';
import { EMAIL_TEMPLATE_TYPES } from '../services/emailTemplateService.js';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for 465, false for other ports
  auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  } : undefined,
  pool: true, // Use pooled connections for faster sending
  maxConnections: 5, // Allow up to 5 parallel connections
  maxMessages: 100, // Reuse connections for multiple messages
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 10000, // 10 seconds
  socketTimeout: 30000, // 30 seconds
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates (for development)
    ciphers: 'SSLv3' // Compatibility with older servers
  }
});

export async function sendMail({ to, subject, html, text, attachments }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@example.com';
  const info = await transporter.sendMail({ from, to, subject, html, text, attachments });
  console.log(`[MAIL] Sent to: ${to} | Subject: ${subject}`);
  return info;
}

// Send multiple emails in parallel (faster for bulk operations)
export async function sendBulkMail(emails) {
  if (!emails || emails.length === 0) return [];
  
  console.log(`[MAIL] Sending ${emails.length} emails in parallel...`);
  const startTime = Date.now();
  
  const results = await Promise.allSettled(
    emails.map(email => sendMail(email))
  );
  
  const successful = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  const elapsed = Date.now() - startTime;
  
  console.log(`[MAIL] Bulk send complete: ${successful} sent, ${failed} failed in ${elapsed}ms`);
  
  return results;
}

export function renderTemplate(template, vars = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*(\w+)\s*\}\}|\{(\w+)\}/g, (_, k1, k2) => {
    const key = k1 || k2;
    const value = vars[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function getDashboardUrl() {
  const origin = (process.env.FRONTEND_ORIGIN || 'https://peerprep.co.in').split(',')[0].trim();
  return origin.endsWith('/') ? origin : `${origin}/`;
}

async function getTemplateByType(type) {
  const template = await EmailTemplate.findOne({ type }).lean();
  if (!template) {
    throw new Error(`Email template not found for type: ${type}`);
  }
  return template;
}

function buildSlotsBlock(slots, accentColor, highlightColor) {
  if (slots.length > 1) {
    const items = slots
      .map((s) => `<li style="margin:8px 0;font-weight:500;color:#334155;">${s}</li>`)
      .join('');
    return `<ul style="background:${highlightColor};padding:20px 24px;border-radius:8px;border-left:4px solid ${accentColor};list-style:none;margin:20px 0;">${items}</ul>`;
  }
  return `<div style="background:${highlightColor};padding:20px;border-radius:8px;border-left:4px solid ${accentColor};margin:20px 0;"><p style="margin:0;font-size:16px;font-weight:600;color:#334155;">${slots[0]}</p></div>`;
}

// Simple iCal (ICS) event generator
export function buildICS({ uid, start, end, summary, description, url, organizer, attendees = [] }) {
  const dt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Interview System//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dt(Date.now())}`,
    `DTSTART:${dt(start)}`,
    `DTEND:${dt(end)}`,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description.replace(/\n/g, '\\n')}` : null,
    url ? `URL:${url}` : null,
    organizer ? `ORGANIZER;CN=${organizer.name}:MAILTO:${organizer.email}` : null,
    ...attendees.map(a => `ATTENDEE;CN=${a.name};ROLE=REQ-PARTICIPANT:MAILTO:${a.email}`),
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);
  return lines.join('\r\n');
}

// Onboarding email: StudentId & Password
export async function sendOnboardingEmail({ to, studentId, password }) {
  const template = await getTemplateByType(EMAIL_TEMPLATE_TYPES.ONBOARDING);
  const vars = { studentId, password, dashboardUrl: getDashboardUrl() };
  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}

// Password reset email
export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  const template = await getTemplateByType(EMAIL_TEMPLATE_TYPES.PASSWORD_RESET);
  const vars = { name, resetUrl, dashboardUrl: getDashboardUrl() };
  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}

// Event notification email (unified for both regular and special events)
export async function sendEventNotificationEmail({ to, event, interviewer, interviewee }) {
  const template = await getTemplateByType(EMAIL_TEMPLATE_TYPES.EVENT_NOTIFICATION);
  const templateSection = event.templateUrl
    ? `<br/><strong>Template:</strong> <a href="${event.templateUrl}">Download Template</a>`
    : '';
  const vars = {
    title: event.title,
    date: event.date,
    details: event.details,
    templateSection,
    dashboardUrl: getDashboardUrl(),
  };
  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}

// Assessment notification email
export async function sendAssessmentNotificationEmail({ to, assessment, student }) {
  const start = assessment.startTime ? new Date(assessment.startTime) : null;
  const end = assessment.endTime ? new Date(assessment.endTime) : null;
  const startLabel = start ? start.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const endLabel = end ? end.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
  const duration = assessment.duration ? `${assessment.duration} minutes` : '-';

  const template = await getTemplateByType(EMAIL_TEMPLATE_TYPES.ASSESSMENT_NOTIFICATION);
  const vars = {
    studentName: student?.name || 'Student',
    assessmentTitle: assessment.title,
    startLabel,
    endLabel,
    duration,
    dashboardUrl: getDashboardUrl(),
  };

  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}

// Slot proposal email (to interviewee)
export async function sendSlotProposalEmail({ to, interviewer, slot }) {
  const slots = String(slot).split('|').map(s => s.trim()).filter(Boolean);
  const template = await getTemplateByType(EMAIL_TEMPLATE_TYPES.SLOT_PROPOSAL);
  const slotIntro = slots.length > 1 ? 'the following time slots' : 'the following time slot';
  const slotsBlock = buildSlotsBlock(slots, '#0ea5e9', '#f8fafc');
  const vars = {
    interviewer,
    slotIntro,
    slotsBlock,
    dashboardUrl: getDashboardUrl(),
  };
  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}

// Slot acceptance/notification email (to interviewer)
export async function sendSlotAcceptanceEmail({ to, interviewee, slot, accepted }) {
  const slots = String(slot).split('|').map(s => s.trim()).filter(Boolean);
  const type = accepted ? EMAIL_TEMPLATE_TYPES.SLOT_ACCEPTED : EMAIL_TEMPLATE_TYPES.SLOT_COUNTER;
  const template = await getTemplateByType(type);
  const slotIntro = slots.length > 1 ? 'the following alternative time slots' : 'an alternative time slot';
  const slotsBlock = buildSlotsBlock(slots, accepted ? '#10b981' : '#f59e0b', accepted ? '#f0fdf4' : '#fef3c7');
  const vars = {
    interviewee,
    slot: slots[0],
    slotIntro,
    slotsBlock,
    dashboardUrl: getDashboardUrl(),
  };
  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}

// Interview scheduled email 
export async function sendInterviewScheduledEmail({ to, interviewer, interviewee, event, link }) {
  const template = await getTemplateByType(EMAIL_TEMPLATE_TYPES.INTERVIEW_SCHEDULED);
  const detailsSection = event.details
    ? `<div style="background:#fef3c7;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #eab308;"><p style="margin:0;font-size:14px;color:#713f12;"><strong>Additional Details:</strong></p><p style="margin:8px 0 0 0;font-size:14px;color:#713f12;">${event.details}</p></div>`
    : '';
  const vars = {
    title: event.title,
    date: event.date,
    detailsSection,
    interviewer,
    dashboardUrl: getDashboardUrl(),
  };
  return sendMail({
    to,
    subject: renderTemplate(template.subject, vars),
    html: renderTemplate(template.htmlContent, vars),
  });
}
