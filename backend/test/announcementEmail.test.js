import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANNOUNCEMENT_TEMPLATE, announcementForMail, applyDraft, emailContentHtml, renderAnnouncementMail, validateStudentIds,
} from '../src/services/announcementEmail.js';
import { studentMailDraftOf, xssProtectionMiddleware } from '../src/middleware/sanitization.js';

const row = { id: 'a', name: 'Riya <b>Sharma</b>', email: 'riya@example.com', studentId: 'S1', student: { college: 'GEU', semester: 5 } };
const announcement = announcementForMail({
  title: 'Campus drive', category: 'placement', theme: 'teal', label: '',
  messageHtml: '<h3>Eligibility</h3><p>CGPA <strong>7+</strong></p><script>x</script>', ctaLabel: 'Apply', ctaUrl: '/student/prep-mock',
});

test('the announcement email comes from the template: title, name, colour, content, button and student values', () => {
  const mail = renderAnnouncementMail(ANNOUNCEMENT_TEMPLATE, announcement, row, 'https://peerprep.co.in/u/geu-122/');
  assert.equal(mail.subject, 'Placement: Campus drive');
  assert.match(mail.html, /background-color:#0d9488/, 'announcement colour');
  assert.match(mail.html, />Placement</);
  assert.match(mail.html, /Hi Riya,/, 'first name');
  assert.match(mail.html, /<h3 style="[^"]*font-size:16px[^"]*">Eligibility<\/h3>/, 'content with email inline styles');
  assert.match(mail.html, /<strong>7\+<\/strong>/);
  assert.doesNotMatch(mail.html, /<script/i, 'content is sanitised');
  assert.match(mail.html, /href="https:\/\/peerprep.co.in\/u\/geu-122\/student\/prep-mock"/, 'a PeerPrep page becomes this university\'s full link');
  assert.match(mail.html, />Apply<\/a>/);
  assert.match(mail.html, /Sent by GEU/);
});

test('student values are escaped; the subject stays one plain line', () => {
  const template = { subject: '{{name}}\nnews', htmlContent: '<p>{{name}}</p>' };
  const mail = renderAnnouncementMail(template, announcement, row, 'https://x/');
  assert.equal(mail.subject, 'Riya <b>Sharma</b> news', 'subject is plain text, not HTML');
  assert.equal(mail.html, '<p>Riya &lt;b&gt;Sharma&lt;/b&gt;</p>');
});

test('no button: the button block is empty; plain announcements become paragraphs', () => {
  const plain = announcementForMail({ title: 'Hi', message: 'Line 1\nLine <2>' });
  const mail = renderAnnouncementMail({ subject: 'x', htmlContent: '{{announcementContent}}|{{buttonBlock}}|' }, plain, row, 'https://x/');
  assert.equal(mail.html, '<p style="margin:0 0 12px;">Line 1<br>Line &lt;2&gt;</p>||');
});

test('the edited draft is sanitised for email (coordinators can send) but keeps tables and styles', () => {
  const draft = applyDraft(ANNOUNCEMENT_TEMPLATE, { subject: 'S', html: '<table><tr><td style="color:#fff">{{firstName}}</td></tr></table>' });
  assert.match(draft.htmlContent, /<td style="color:#fff">\{\{firstName\}\}<\/td>/);
  assert.throws(() => applyDraft(ANNOUNCEMENT_TEMPLATE, { html: '<p onclick="x()">hi</p>' }), /Remove scripts/);
  assert.throws(() => applyDraft(ANNOUNCEMENT_TEMPLATE, { subject: ' ' }), /Add a subject/);
  assert.throws(() => announcementForMail({ title: '', message: '' }), /Title is required|title and message/);
});

test('the ready-made template survives the email sanitiser with its variables intact', () => {
  const { htmlContent } = applyDraft(ANNOUNCEMENT_TEMPLATE, undefined);
  assert.match(htmlContent, /background-color:\{\{accentColor\}\}/);
  assert.match(htmlContent, /href="\{\{dashboardUrl\}\}"/);
  assert.match(htmlContent, /\{\{announcementContent\}\}/);
  assert.match(htmlContent, /\{\{buttonBlock\}\}/);
});

test('inline email styles keep the content\'s own colours', () => {
  assert.equal(emailContentHtml('<p style="text-align:center">x</p>'), '<p style="margin:0 0 12px;text-align:center">x</p>');
});

test('recipient ids: unique, valid, capped', () => {
  assert.deepEqual(validateStudentIds(['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439011', 'bad']), ['507f1f77bcf86cd799439011']);
  assert.throws(() => validateStudentIds([]), /Choose the students/);
});

test('the email draft survives xss-clean on the announcement email routes only', async () => {
  const html = '<div style="padding:24px"><p>Hi {{firstName}}</p></div>';
  const run = (req) => new Promise((resolve) => {
    const draft = studentMailDraftOf(req);
    xssProtectionMiddleware(req, {}, () => { if (draft) req.body.draft = draft; resolve(req.body); });
  });
  for (const path of ['/api/admin/announcements/email/preview', '/api/u/geu-122/admin/announcements/email/send', '/api/admin/announcements/email/test']) {
    assert.equal((await run({ method: 'POST', path, body: { draft: { subject: 'x', html } }, query: {}, params: {} })).draft.html, html, path);
  }
  assert.notEqual((await run({ method: 'POST', path: '/api/admin/announcements/create', body: { draft: { html } }, query: {}, params: {} })).draft.html, html);
});
