import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  announcementFields, announcementPlainText, categoryFor, legacyTypeFor, safeLink, sanitizeAnnouncementHtml,
} from '../src/services/announcementContent.js';

test('formatted content keeps headings, colours and links but never scripts, handlers or unsafe styles', () => {
  const html = sanitizeAnnouncementHtml([
    '<h2 style="color:#0284c7;position:fixed">Exam week</h2>',
    '<p onclick="steal()">Read <b>this</b> <a href="https://geu.ac.in/x" onmouseover="x()">link</a></p>',
    '<script>alert(1)</script><img src=x onerror=alert(1)><iframe src="https://evil"></iframe>',
    '<p><a href="javascript:alert(1)">bad</a> <span style="background-color: rgb(254, 243, 199); font-size: 90px">mark</span></p>',
    '<p style="text-align:center;background:url(https://evil)">centred</p>',
  ].join(''));
  assert.match(html, /<h2 style="color:#0284c7">Exam week<\/h2>/);
  assert.match(html, /<strong>this<\/strong>/, '<b> is stored as <strong>');
  assert.match(html, /<a href="https:\/\/geu.ac.in\/x" target="_blank" rel="noopener noreferrer nofollow">link<\/a>/);
  assert.doesNotMatch(html, /script|onerror|onclick|onmouseover|iframe|<img|javascript:|position|font-size|url\(/i);
  assert.match(html, /<span style="background-color:rgb\(254, 243, 199\)">mark<\/span>/);
  assert.match(html, /<p style="text-align:center">centred<\/p>/);
});

test('content escaped by the xss-clean middleware is restored before sanitising', () => {
  assert.equal(sanitizeAnnouncementHtml('&lt;p&gt;Hello &lt;strong&gt;all&lt;/strong&gt;&lt;/p&gt;'), '<p>Hello <strong>all</strong></p>');
  assert.equal(sanitizeAnnouncementHtml('&lt;script&gt;alert(1)&lt;/script&gt;&lt;p&gt;ok&lt;/p&gt;'), '<p>ok</p>');
});

test('plain text keeps line breaks and list bullets for bars, cards and the bell', () => {
  assert.equal(announcementPlainText('<h2>Drive</h2><p>TCS &amp; Infosys</p><ul><li>Bring CV</li><li>Be on time</li></ul>'), 'Drive\nTCS & Infosys\n• Bring CV\n• Be on time');
});

test('fields: formatted content sets the plain message; category sets the legacy type', () => {
  const fields = announcementFields({ title: ' Exam ', messageHtml: '<p>Room <strong>101</strong></p>', category: 'exam', design: 'banner', theme: 'rose', label: 'Mid-sem', ctaLabel: 'Open', ctaUrl: '/student/assessments' });
  assert.equal(fields.title, 'Exam');
  assert.equal(fields.message, 'Room 101');
  assert.equal(fields.messageHtml, '<p>Room <strong>101</strong></p>');
  assert.deepEqual([fields.category, fields.type, fields.design, fields.theme, fields.label], ['exam', 'alert', 'banner', 'rose', 'Mid-sem']);
  assert.deepEqual([fields.ctaLabel, fields.ctaUrl], ['Open', '/student/assessments']);
  assert.deepEqual([fields.status, fields.priority], ['inactive', 'normal']);
});

test('fields: old clients (plain message + type) still work', () => {
  const fields = announcementFields({ title: 'Hi', message: 'Plain', type: 'alert' });
  assert.deepEqual([fields.message, fields.messageHtml, fields.type, fields.category, fields.design, fields.theme], ['Plain', '', 'alert', 'alert', 'classic', 'sky']);
});

test('fields: partial updates touch only what was sent (status toggle keeps the content)', () => {
  assert.deepEqual(announcementFields({ status: 'active' }, { partial: true }), { status: 'active' });
});

test('fields: clear errors for missing or unsafe input', () => {
  assert.throws(() => announcementFields({ title: '', message: 'x' }), /Title is required/);
  assert.throws(() => announcementFields({ title: 'x', messageHtml: '<script>x</script>' }), /Message is required/);
  assert.throws(() => announcementFields({ title: 'x', message: 'y', category: 'party' }), /Category must be one of/);
  assert.throws(() => announcementFields({ title: 'x', message: 'y', ctaLabel: 'Go' }), /both a label and a link/);
  assert.throws(() => announcementFields({ title: 'x', message: 'y', imageUrl: 'http://insecure.example/a.png' }), /https/);
  assert.throws(() => safeLink('javascript:alert(1)'), /https/);
  assert.throws(() => safeLink('//evil.example'), /https/);
  assert.equal(safeLink('https://example.com/a?b=1'), 'https://example.com/a?b=1');
});

test('old announcements get a category from their type', () => {
  assert.equal(categoryFor({ type: 'alert' }), 'alert');
  assert.equal(categoryFor({ type: 'info' }), 'update');
  assert.equal(categoryFor({ type: 'motivation' }), 'announcement');
  assert.equal(categoryFor({ category: 'placement', type: 'info' }), 'placement');
  assert.equal(legacyTypeFor('holiday'), 'info');
});
