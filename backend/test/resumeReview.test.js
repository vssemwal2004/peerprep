import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { after, test } from 'node:test';
import PDFDocument from 'pdfkit';
import { createExtractor } from '../src/modules/resumeReview/resumeReview.extractor.js';
import { perStudentLimit } from '../src/modules/resumeReview/resumeReview.routes.js';
import { checkResumePdf, explainReview, sanitizeExplainInput } from '../src/modules/resumeReview/resumeReview.service.js';

const extractor = createExtractor();
after(() => extractor.close());

function resumePdf(lines) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    lines.forEach((line) => doc.fontSize(line.startsWith('#') ? 13 : 10).text(line.replace(/^#\s*/, '')));
    doc.end();
  });
}

const RESUME = [
  '# Asha Verma', 'asha.verma@example.com | +91 98765 43210 | linkedin.com/in/asha-sample', '',
  '# EDUCATION', 'Northfield Institute of Technology, B.Tech Computer Science, 2022 - 2026, CGPA 8.4', '',
  '# EXPERIENCE', 'Software Engineering Intern, Brightline Software, May 2025 - Jul 2025',
  '• Built an admin dashboard in React used by 40 support staff.', '• Reduced report time from 9 s to 1.4 s with indexed SQL queries.', '',
  '# PROJECTS', 'CampusRide, Mar 2025', '• Designed a route-matching service in Node.js for 200 riders.', '• Shipped the MVP in 36 hours with Firebase.', '',
  '# SKILLS', 'Languages: Java, Python, JavaScript, SQL', 'Web: React, Node.js, Express',
];

test('a real exported PDF is read in the child process and scored by the engine', { timeout: 60000 }, async () => {
  const report = await checkResumePdf(await resumePdf(RESUME), { extractor, jobDescription: 'Requirements:\n- Java and React\n- Experience with Docker and Kubernetes\n- SQL' });
  assert.ok(report.readinessScore >= 0 && report.readinessScore <= 100);
  assert.equal(report.parsed.email, 'asha.verma@example.com');
  assert.ok(report.categories.length >= 5);
  assert.ok(report.text.includes('Brightline'));
  assert.ok(report.job && typeof report.job.score === 'number', 'job match is scored separately');
  assert.ok(report.job.missingKeywords.map((k) => k.toLowerCase()).some((k) => k.includes('kubernetes') || k.includes('docker')));
  for (let i = 1; i < report.failedChecks.length; i += 1) assert.ok(report.failedChecks[i - 1].scoreImpact >= report.failedChecks[i].scoreImpact, 'failed checks sorted by impact');
});

test('uploads that are not PDFs are refused before reaching the reader', async () => {
  await assert.rejects(checkResumePdf(Buffer.from('hello'), { extractor }), (error) => error.status === 400);
  await assert.rejects(checkResumePdf(Buffer.alloc(0), { extractor }), (error) => error.status === 400);
});

function fakeChild(behaviour) {
  const child = new EventEmitter();
  child.connected = true;
  child.killed = false;
  child.kill = () => { child.killed = true; child.connected = false; setImmediate(() => child.emit('exit', null, 'SIGKILL')); };
  child.send = (message) => behaviour(child, message);
  return child;
}

test('a stuck extraction is killed at the timeout and the next job gets a fresh child', async () => {
  const spawned = [];
  const stuckThenOk = createExtractor({
    timeoutMs: 50,
    spawn: () => {
      const child = fakeChild((self, message) => { if (spawned.length > 1) setImmediate(() => self.emit('message', { id: message.id, ok: true, text: 'ok' })); });
      spawned.push(child);
      return child;
    },
  });
  await assert.rejects(stuckThenOk.extractPdf(Buffer.from('%PDF-1')), (error) => error.status === 504);
  assert.equal(spawned[0].killed, true);
  assert.deepEqual(await stuckThenOk.extractPdf(Buffer.from('%PDF-1')), { text: 'ok', layout: undefined });
  assert.equal(spawned.length, 2);
});

test('a crashed reader fails only the running job; a full queue is refused politely', async () => {
  const crashing = createExtractor({ maxQueue: 1, spawn: () => fakeChild((self) => setImmediate(() => { self.connected = false; self.emit('exit', 1); })) });
  const first = crashing.extractPdf(Buffer.from('%PDF-1'));
  const second = crashing.extractPdf(Buffer.from('%PDF-1'));
  await assert.rejects(crashing.extractPdf(Buffer.from('%PDF-1')), (error) => error.status === 503 && error.details.code === 'RESUME_READER_BUSY');
  await assert.rejects(first, (error) => error.status === 503);
  await assert.rejects(second, (error) => error.status === 503);
});

const EXPLAIN_BODY = {
  outline: [
    { key: 'experience', label: 'Experience', entries: [{ title: 'Brightline Software', lines: ['Worked on dashboard that help students', 'Reduced report time from 9 s to 1.4 s'] }] },
    { key: 'skills', label: 'Skills', entries: [{ title: 'Languages', lines: ['Java, Python'] }] },
    { key: 'evil', label: 'Bad', entries: [] },
  ],
  ats: { failedChecks: [{ title: 'Strong bullet openers', evidence: 'Bullets such as "Worked on dashboard" open with a duty.', fix: 'Open with what you did.', scoreImpact: 2, section: 'experience' }], missingKeywords: ['Docker', 'Python'] },
  grammar: [{ section: 'experience', entryIndex: 0, bulletIndex: 0, message: 'Subject-verb agreement', original: 'Worked on dashboard that help students', suggestion: 'Worked on dashboard that helps students' }],
};

test('ANVI explanations rank scan fixes, link to matching bullets, and check job skills against the resume', () => {
  const input = sanitizeExplainInput(EXPLAIN_BODY);
  assert.deepEqual(input.outline.map((section) => section.key), ['experience', 'skills'], 'unknown section keys are dropped');
  const result = explainReview({
    ...EXPLAIN_BODY,
    ats: { ...EXPLAIN_BODY.ats, failedChecks: [...EXPLAIN_BODY.ats.failedChecks, { title: 'Text the ATS can read', evidence: 'PDF text is hard to read.', fix: 'Use a text-based PDF.', scoreImpact: 20, section: 'template' }] },
    grammar: [...EXPLAIN_BODY.grammar, { ...EXPLAIN_BODY.grammar[0], entryIndex: 99 }],
  });
  assert.equal(result.fixes.length, 3, 'at most three fixes');
  assert.deepEqual(result.fixes.map(({ title }) => title), ['Text the ATS can read', 'Strong bullet openers', 'Fix grammar']);
  assert.equal(result.fixes[0].action, 'Use a text-based PDF.');
  assert.deepEqual([result.fixes[2].section, result.fixes[2].entryIndex, result.fixes[2].bulletIndex, result.fixes[2].evidence], ['experience', 0, 0, EXPLAIN_BODY.grammar[0].original]);
  assert.deepEqual(result.skillNotes, [{ skill: 'Docker', foundInResume: false }, { skill: 'Python', foundInResume: true }]);
  const stemmed = explainReview({ ...EXPLAIN_BODY, outline: [{ key: 'experience', entries: [{ title: 'X', lines: ['Wrote 60+ unit tests in Java.'] }] }], ats: { missingKeywords: ['unit testing', 'Kubernetes'] } });
  assert.deepEqual(stemmed.skillNotes.map((note) => note.foundInResume), [true, false], '"unit testing" matches "unit tests"');
  assert.equal(stemmed.fixes[0].bulletIndex, null, 'a changed bullet is not linked as though it still matched');
});

test('a full explanation uses only the scan results without an outbound request', async (t) => {
  const outbound = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected network call'); });
  const result = await explainReview(EXPLAIN_BODY);
  assert.equal(result.fixes[1].action, EXPLAIN_BODY.grammar[0].suggestion);
  assert.deepEqual(await explainReview(EXPLAIN_BODY), result);
  const jobOnly = await explainReview({ ats: { missingKeywords: ['Docker'] } });
  assert.equal(jobOnly.skillNotes[0].skill, 'Docker');
  assert.deepEqual((await explainReview({})).fixes, []);
  assert.equal(outbound.mock.callCount(), 0);
});

test('per-student limiter returns 429 with Retry-After once the window is full', () => {
  const limit = perStudentLimit({ max: 2, windowMs: 60_000, message: 'slow down', code: 'X' });
  const req = { user: { _id: 'u1' } };
  const headers = {};
  const res = { set: (key, value) => { headers[key] = value; } };
  const outcomes = [];
  for (let i = 0; i < 3; i += 1) limit(req, res, (error) => outcomes.push(error?.status || 'ok'));
  assert.deepEqual(outcomes, ['ok', 'ok', 429]);
  assert.ok(Number(headers['Retry-After']) > 0);
  limit({ user: { _id: 'u2' } }, res, (error) => assert.equal(error, undefined, 'other students are unaffected'));
});
