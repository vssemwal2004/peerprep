import { after, before, beforeEach, test } from 'node:test';
// JD Match stores the job description encrypted and refuses to run without the key.
process.env.PEERPREP_TENANT_SECRET_KEY ||= Buffer.alloc(32, 5).toString('base64');
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import {
  buildResumeLines, checkFits, cleanJobDescription, exactOnResume, exampleKeepsFacts, phraseInText, planPrompt, safeTip, stems, termInJd, verifyMatch, callUsd,
} from '../src/modules/resumeReview/jdMatch.engine.js';
import { createJdMatchService, istDayStart, latinShare } from '../src/modules/resumeReview/jdMatch.service.js';
import { createJdMatchRouter } from '../src/modules/resumeReview/jdMatch.routes.js';
import { ResumeJdMatch } from '../src/modules/resumeReview/jdMatch.model.js';
import { clearJdLimitsCache, saveJdMatchLimits, normalizeJdLimits } from '../src/modules/resumeReview/jdMatch.limits.js';
import Resume from '../src/models/Resume.js';
import { PlatformAiSpend, PlatformAudit, PlatformCoinCharge, PlatformCoinMovement, PlatformCoinPricing, PlatformCoinWallet, University } from '../src/platform/models.js';
import { allocateCoins, topUpUniversity, walletBalance, PLATFORM_WALLET_SCOPE } from '../src/platform/coins.js';
import { clearCoinPricingCache, getCoinPricing, sweepPendingCharges } from '../src/platform/coinSpend.js';
import { chargeVerifiers } from '../src/services/coinEntitlements.js';
import { studentHasFeature } from '../src/services/studentFeatureAccess.js';
import { errorHandler } from '../src/utils/errors.js';

const RESUME = {
  basics: { headline: 'Full-stack developer and final-year CSE student' },
  sectionOrder: ['education', 'experience', 'projects', 'skills', 'achievements'],
  hiddenSections: [],
  education: [{ degree: 'B.Tech CSE', institute: 'Graphic Era', score: '8.4 CGPA', year: '2026' }],
  experience: [],
  projects: [{ title: 'Chat App', subtitle: 'Personal project', technologies: 'React, Node', bullets: [{ text: 'Built a real-time chat app using React and Node' }, { text: 'Deployed on Render for 120 users' }] }],
  skills: [{ category: 'Languages', skills: 'Java, Python, JavaScript' }, { category: 'Tools', skills: 'Git, VS Code' }],
  achievements: [],
  customSections: [],
};

const JD = `Software Engineer Intern
We are looking for an intern to build and ship web services used by thousands of customers every day.
You will work with senior engineers on product features, code reviews and production support.
Requirements:
- Strong Java or JavaScript skills
- Experience with React and REST APIs (required)
- Docker and CI/CD pipelines
- Familiarity with AWS
- Good communication
We are an equal opportunity employer and value diversity.
Apply now to join our team!`;

test('résumé lines follow the résumé order, with headings and builder targets', () => {
  const lines = buildResumeLines(RESUME);
  assert.deepEqual(lines.map((line) => line.heading), ['PROFILE', 'EDUCATION', 'PROJECTS', 'PROJECTS', 'PROJECTS', 'PROJECTS', 'TECHNICAL SKILLS', 'TECHNICAL SKILLS']);
  assert.equal(lines[0].id, 'L1');
  assert.equal(lines.find((line) => line.text.startsWith('Built')).focus, 'projects|0|bullet|0');
  assert.equal(lines.find((line) => line.text.startsWith('Tools')).focus, 'skills|1|skills');
  assert.equal(lines.find((line) => line.text.startsWith('Tech:')).text, 'Tech: React, Node');
  assert.deepEqual(buildResumeLines({}), [], 'an empty résumé has no lines');
  assert.equal(buildResumeLines({ ...RESUME, hiddenSections: ['skills'] }).some((line) => line.section === 'skills'), false, 'hidden sections are not read');
});

test('the job description loses boilerplate, bullets and repeats', () => {
  const clean = cleanJobDescription(`${JD}\n- Docker and CI/CD pipelines`);
  assert.match(clean, /^Software Engineer Intern/);
  assert.doesNotMatch(clean, /equal opportunity|Apply now/i);
  assert.equal(clean.match(/Docker and CI\/CD/g).length, 1);
  assert.doesNotMatch(clean, /^- /m);
});

test('term matching keeps tech marks and needs consecutive words for a résumé match', () => {
  assert.ok(stems('C++ and C# with Node.js, .NET').includes('c++'));
  assert.ok(stems('C++ and C# with Node.js, .NET').includes('node.js'));
  const jd = new Set(stems(JD));
  assert.ok(termInJd('REST APIs', jd));
  assert.ok(termInJd('Docker', jd));
  assert.equal(termInJd('Kubernetes', jd), false);
  assert.ok(phraseInText('React', 'Built a chat app using React and Node'));
  assert.equal(phraseInText('React Native', 'React and Native modules'), false, 'two words must be next to each other');
  assert.ok(phraseInText('REST API', 'Designed REST APIs for the app'));
});

const RATES = { inputUsdPerM: 0.25, outputUsdPerM: 1.5 };

test('the prompt always fits the per-check cost cap, trimming long inputs', () => {
  const lines = buildResumeLines(RESUME);
  const capUsd = 0.5 / 88;
  const plan = planPrompt({ jd: cleanJobDescription(JD), lines, rates: RATES, capUsd });
  assert.ok(plan.worstUsd <= capUsd, 'worst case is under the cap');
  assert.equal(plan.maxOutputTokens, 2400);
  const long = planPrompt({ jd: 'Java developer with React. '.repeat(1200), lines, rates: RATES, capUsd: 0.35 / 88 });
  assert.ok(long, 'a long JD is trimmed to fit (safety net only: start() refuses it before charging)');
  assert.ok(long.jd.length < 'Java developer with React. '.repeat(1200).length);
  assert.ok(long.worstUsd <= 0.35 / 88);
  assert.ok(long.maxOutputTokens >= 1800, 'still room for a complete answer');
  const fits = checkFits({ jd: 'Java developer with React. '.repeat(400), lines, rates: RATES, capUsd: 0.35 / 88 });
  assert.equal(fits.ok, false);
  assert.equal(fits.reason, 'jd');
  assert.ok(fits.jdMaxChars > 600 && fits.jdMaxChars < 10800, 'tells the student how long it may be');
  assert.equal(checkFits({ jd: cleanJobDescription(JD), lines, rates: RATES, capUsd: 0.5 / 88 }).ok, true);
  assert.equal(checkFits({ jd: cleanJobDescription(JD), lines, rates: RATES, capUsd: 0.1 / 88 }).reason, 'cap', 'a cap too low is a setup problem, not the student\'s');
  assert.equal(planPrompt({ jd: 'x'.repeat(400), lines, rates: RATES, capUsd: 0.0001 }), null, 'an impossible cap is refused, not exceeded');
  assert.equal(callUsd({ input: 1_000_000, output: 1_000_000 }, RATES), 1.75);
});

const raw = (keywords) => ({ keywords });
const kw = (term, extra = {}) => ({ term, importance: 'good', category: 'skill', status: 'missing', lines: [], place: '', example: '', tip: 'Add it.', ...extra });

test('every claim is checked against the JD and the résumé before the student sees it', () => {
  const lines = buildResumeLines(RESUME);
  const id = (start) => lines.find((line) => line.text.startsWith(start)).id;
  const report = verifyMatch({
    jd: JD, lines, company: 'Acme', role: 'SDE Intern',
    raw: raw([
      kw('React', { importance: 'must', status: 'missing' }), // written on the résumé → present
      kw('REST APIs', { importance: 'must', status: 'missing', place: id('Built'), example: 'Built a real-time chat app using React, Node and REST APIs' }),
      kw('Docker', { importance: 'must', status: 'missing', place: id('Deployed'), example: 'Deployed on Render with Docker for 500 users' }), // adds a number → example dropped
      kw('CI/CD', { status: 'missing', place: 'new:skills' }),
      kw('AWS', { status: 'missing', place: 'L99' }), // unknown line → listed in Skills
      kw('Kubernetes', { importance: 'must', status: 'missing' }), // not in the JD → dropped
      kw('communication', { category: 'soft', status: 'missing', place: 'none' }),
      kw('Java', { status: 'present', lines: ['L42'] }), // bad evidence id, but written on the résumé
      kw('react', { status: 'present' }), // duplicate of React
    ]),
  });
  const byTerm = Object.fromEntries(report.sections.flatMap((section) => section.lines.flatMap((line) => line.add.map((add) => [add.term, { section: section.heading, line }]))));
  assert.equal(report.dropped, 1, 'Kubernetes is not in the JD');
  assert.ok(report.present.some((item) => item.term === 'React'), 'a word-for-word résumé term is never missing');
  assert.ok(report.present.some((item) => item.term === 'Java'));
  assert.equal(byTerm['REST APIs'].section, 'PROJECTS');
  assert.equal(byTerm['REST APIs'].line.example, 'Built a real-time chat app using React, Node and REST APIs');
  assert.equal(byTerm.Docker.line.example, '', 'an example that adds a number is not shown');
  const skills = report.sections.find((section) => section.key === 'skills');
  assert.deepEqual(skills.newLine.terms.map((term) => term.term), ['CI/CD', 'AWS']);
  assert.equal(skills.newLine.focus, 'skills|0|skills');
  assert.deepEqual(report.noEvidence.map((item) => item.term), ['communication']);
  // React(2, present) + REST(2, missing) + Docker(2, missing) + CI/CD(1) + AWS(1) + communication(1) + Java(1, present) = 3 / 10.
  assert.equal(report.score, 30);
  assert.equal(report.totals.toAdd, 5);
  assert.deepEqual(report.sections.map((section) => section.heading), ['PROFILE', 'EDUCATION', 'PROJECTS', 'TECHNICAL SKILLS']);
  assert.match(report.summary, /30%/);
});

test('examples may add the term but no other technology or claim, and titles are never rewritten', () => {
  assert.equal(exampleKeepsFacts('Languages: Java, Python, JavaScript, and SQL databases like PostgreSQL or MySQL.', 'Languages: Java, Python, JavaScript, SQL', 'SQL databases'), false, 'PostgreSQL and MySQL were never on the résumé');
  assert.equal(exampleKeepsFacts('Wrote Express endpoints to fetch orders from MongoDB, designing RESTful APIs for efficient data retrieval.', 'Wrote Express endpoints to fetch orders from MongoDB', 'RESTful APIs'), false, 'too many new words');
  assert.equal(exampleKeepsFacts('Wrote RESTful API endpoints in Express to fetch orders from MongoDB', 'Wrote Express endpoints to fetch orders from MongoDB', 'RESTful APIs'), true);
  assert.equal(exampleKeepsFacts('Deployed on Render for 500 users', 'Deployed on Render for 120 users', 'Docker'), false, 'a changed number');
  const lines = buildResumeLines(RESUME);
  const title = lines.find((line) => line.field === 'title').id;
  const report = verifyMatch({ jd: JD, lines, raw: raw([kw('CI/CD', { importance: 'must', place: title, example: 'Chat App with CI/CD — Personal project' })]) });
  const projects = report.sections.find((section) => section.key === 'projects');
  assert.equal(projects.lines.length, 0, 'the title line is not rewritten');
  assert.deepEqual(projects.newLine.terms.map((term) => term.term), ['CI/CD']);
  assert.equal(projects.newLine.focus, 'projects|0', 'opens that project in the builder');
});

test('review fixes: ambiguous words, empty partials, new tools in examples, unsafe tips, non-English JDs', () => {
  assert.equal(exactOnResume('Go', 'Helped the team go live in 2 weeks'), false, '"go live" is not the Go language');
  assert.equal(exactOnResume('Go', 'Languages: Go, Python'), true);
  assert.equal(exactOnResume('R', 'Worked in R&D'), true, 'exact-case R still matches a real R');
  assert.equal(exactOnResume('Spring', 'Spring 2024 internship'), true, 'exact case only — the model verdict decides beyond that');
  assert.equal(exampleKeepsFacts('Built a REST API in Flask with PostgreSQL and Redis for orders', 'Built a REST API in Flask for orders', 'PostgreSQL'), false, 'Redis is a new tool');
  assert.equal(exampleKeepsFacts('Built a REST API in Flask using PostgreSQL on docker', 'Built a REST API in Flask', 'PostgreSQL'), false, 'docker is a new tool');
  assert.equal(safeTip('Email your Aadhaar to hr@fake.com'), '');
  assert.equal(safeTip('Visit www.scam.in for help'), '');
  assert.equal(safeTip('Name the SQL database you used.'), 'Name the SQL database you used.');
  assert.ok(latinShare('Backend developer with Java') > 0.9);
  assert.ok(latinShare('बैकएंड डेवलपर जावा अनुभव') < 0.1);
  const lines = buildResumeLines(RESUME);
  const empty = verifyMatch({ jd: JD, lines, raw: raw([kw('AWS', { status: 'partial', lines: [] })]) });
  assert.equal(empty.score, 0, 'partial with nothing to point at earns no credit');
  const title = lines.find((line) => line.field === 'title').id;
  const viaPartial = verifyMatch({ jd: JD, lines, raw: raw([kw('React', { status: 'partial', lines: [title], place: '', example: 'Chat App with React' })]) });
  assert.equal(viaPartial.sections.find((section) => section.key === 'projects').lines.some((line) => line.id === title), false, 'never rewrites a title through the partial fallback');
});

test('a present claim with no line on the résumé to point at counts as missing', () => {
  const lines = buildResumeLines(RESUME);
  const report = verifyMatch({ jd: JD, lines, raw: raw([kw('AWS', { status: 'present', lines: ['L77'] })]) });
  assert.equal(report.present.length, 0);
  assert.equal(report.totals.toAdd, 1);
  assert.equal(report.score, 0);
});

test('limits are validated and IST days start at midnight India time', () => {
  assert.deepEqual(normalizeJdLimits({}), { perCheckCapInr: 0.5, monthlyBudgetInr: 2000, dailyChecksPerStudent: 5, usdToInr: 88 });
  assert.throws(() => normalizeJdLimits({ perCheckCapInr: 9 }), /from 0.3 to 5/);
  assert.throws(() => normalizeJdLimits({ perCheckCapInr: 0.2 }), /from 0.3 to 5/, 'below ₹0.30 a full answer cannot fit');
  assert.throws(() => normalizeJdLimits({ dailyChecksPerStudent: 2.5 }), /whole number/);
  assert.equal(istDayStart(new Date('2026-11-25T20:00:00Z')).toISOString(), '2026-11-25T18:30:00.000Z');
});

test('the JD Match feature is opt-in and needs Prep Resume', () => {
  assert.equal(studentHasFeature({ role: 'student' }, 'resume_jd_match'), false, '"All access" does not include it');
  assert.equal(studentHasFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['resume', 'resume_jd_match'] } }, 'resume_jd_match'), true);
  assert.equal(studentHasFeature({ role: 'student', featureAccess: { mode: 'custom', features: ['resume_jd_match'] } }, 'resume_jd_match'), false, 'without Prep Resume it stays off');
});

// ───────────── with coins and a database ─────────────

let mongo;
let skipped = false;
const admin = new mongoose.Types.ObjectId();

before(async () => {
  try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, ip: '127.0.0.1' } }); }
  catch (error) { if (error?.code === 'EPERM') { skipped = true; return; } throw error; }
  await mongoose.connect(mongo.getUri());
  await Promise.all([University, PlatformCoinWallet, PlatformCoinMovement, PlatformCoinCharge, PlatformCoinPricing, ResumeJdMatch, Resume].map((model) => model.createIndexes()));
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });
beforeEach(async () => {
  if (skipped) return;
  await Promise.all([University, PlatformCoinWallet, PlatformCoinMovement, PlatformCoinCharge, PlatformCoinPricing, PlatformAudit, PlatformAiSpend, ResumeJdMatch, Resume].map((model) => model.deleteMany({})));
  clearCoinPricingCache();
  clearJdLimitsCache();
  await University.create({ universityId: PLATFORM_WALLET_SCOPE, name: 'Platform' }).catch(() => {});
});

async function studentWith(coins, features = ['resume', 'resume_jd_match']) {
  const _id = new mongoose.Types.ObjectId();
  if (coins) {
    const coordinator = new mongoose.Types.ObjectId();
    await topUpUniversity({ universityId: PLATFORM_WALLET_SCOPE, amount: coins, actorId: admin, requestId: crypto.randomUUID() });
    await allocateCoins({ universityId: PLATFORM_WALLET_SCOPE, actorId: admin, fromRole: 'university', toRole: 'coordinator', toUserId: coordinator, amount: coins, requestId: crypto.randomUUID() });
    await allocateCoins({ universityId: PLATFORM_WALLET_SCOPE, actorId: coordinator, fromRole: 'coordinator', fromUserId: coordinator, toRole: 'student', toUserId: _id, amount: coins, requestId: crypto.randomUUID() });
  }
  await Resume.create({ student: _id, ...RESUME });
  return { _id, role: 'student', featureAccess: { mode: 'custom', features } };
}

const goodAnswer = { keywords: [kw('React', { importance: 'must', status: 'present', lines: ['L4'] }), kw('Docker', { importance: 'must', place: 'new:skills' })] };
function fakeGemini(answer = goodAnswer, { fail = false, tokens = { input: 2000, output: 900, thoughts: 200 } } = {}) {
  const calls = [];
  return {
    calls,
    configured: true,
    generateJson: async (options) => {
      calls.push(options);
      options.onUsage?.({ kind: 'generate', model: options.model, tokens });
      if (fail) throw Object.assign(new Error('bad'), { code: 'GEMINI_INVALID_RESPONSE' });
      return { value: answer, model: options.model, tokens };
    },
  };
}

function app(service, user) {
  const server = express();
  server.use(express.json());
  server.use((req, res, next) => { req.user = user; next(); });
  server.use('/jd', createJdMatchRouter({ service }));
  server.use(errorHandler);
  return server;
}

async function call(server, method, path, body, headers = {}) {
  const listener = server.listen(0);
  try {
    const { port } = listener.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    return { status: response.status, body: await response.json() };
  } finally { listener.close(); }
}

const waitFor = async (check) => {
  for (let i = 0; i < 100; i += 1) { if (await check()) return; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error('timed out');
};

test('a student without the feature is refused before any coin is touched', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const student = await studentWith(30, ['resume']);
  const gemini = fakeGemini();
  const res = await call(app(createJdMatchService({ gemini }), student), 'POST', '/jd', { jobDescription: JD });
  assert.equal(res.status, 403);
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 30);
  assert.equal(await PlatformCoinCharge.countDocuments(), 0);
  assert.equal(gemini.calls.length, 0);
});

test('a check charges 10 coins, captures them with the report, and repeats free within 24 hours', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  assert.equal((await getCoinPricing({ fresh: true })).features['resume.jd_match'].price, 10, 'priced at 10 until the Master Admin changes it');
  const student = await studentWith(30);
  const gemini = fakeGemini();
  const server = app(createJdMatchService({ gemini }), student);
  const started = await call(server, 'POST', '/jd', { jobDescription: JD, company: 'Acme', role: 'SDE Intern' }, { 'X-Prep-Coin-Cost': '10' });
  assert.equal(started.status, 202);
  assert.deepEqual(started.body.charge, { cost: 10, balance: 20 });
  const id = started.body.match.id;
  await waitFor(async () => (await ResumeJdMatch.findById(id).lean()).status === 'done');
  const read = await call(server, 'GET', `/jd/${id}`);
  assert.equal(read.body.match.status, 'done');
  assert.equal(read.body.match.report.score, 50, 'React (must, present) of React + Docker (both must)');
  assert.equal(read.body.match.report.sections.find((section) => section.key === 'skills').newLine.terms[0].term, 'Docker');
  assert.equal((await PlatformCoinCharge.findOne().lean()).status, 'captured');
  const movement = await PlatformCoinMovement.findOne({ kind: 'student_spend' }).lean();
  assert.equal(movement.note, 'SDE Intern · Acme', 'the wallet history says what the coins were for');
  assert.equal(gemini.calls[0].includeDefaultFallback, false, 'never falls back to a costlier model');
  assert.ok(gemini.calls[0].maxOutputTokens <= 2400);
  assert.equal(gemini.calls[0].temperature, 0);
  const spend = await PlatformAiSpend.findOne().lean();
  assert.equal(spend.calls, 1);
  assert.ok(Math.abs(spend.usd - (2000 * 0.25 + 900 * 1.5) / 1e6) < 1e-12);

  const again = await call(server, 'POST', '/jd', { jobDescription: JD, company: 'Acme', role: 'SDE Intern' }, { 'X-Prep-Coin-Cost': '10' });
  assert.equal(again.status, 200);
  assert.equal(again.body.cached, true);
  assert.equal(again.body.match.id, id);
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 20, 'the repeat is free');
  assert.equal(gemini.calls.length, 1);
  const overview = await call(server, 'GET', '/jd');
  assert.equal(overview.body.history.length, 1);
  assert.equal(overview.body.usedToday, 1);
});

test('a failed check refunds the coins and the sweeper never keeps an undelivered charge', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const student = await studentWith(30);
  const service = createJdMatchService({ gemini: fakeGemini(goodAnswer, { fail: true }) });
  const started = await call(app(service, student), 'POST', '/jd', { jobDescription: JD }, { 'X-Prep-Coin-Cost': '10' });
  await waitFor(async () => (await ResumeJdMatch.findById(started.body.match.id).lean()).status === 'failed');
  await waitFor(async () => (await ResumeJdMatch.findById(started.body.match.id).lean()).refunded);
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 30);
  assert.equal((await PlatformCoinCharge.findOne().lean()).status, 'refunded');
  assert.equal((await PlatformAiSpend.findOne().lean()).calls, 1, 'a billed but rejected answer still counts toward the budget');
  const read = await call(app(service, student), 'GET', `/jd/${started.body.match.id}`);
  assert.match(read.body.match.error.message, /Prep Coins were returned/);

  // A charge whose check never finished (e.g. the server restarted) is refunded by the sweeper.
  const other = await studentWith(30);
  const idle = createJdMatchService({ gemini: fakeGemini(), concurrency: 0 });
  const stuck = await call(app(idle, other), 'POST', '/jd', { jobDescription: JD }, { 'X-Prep-Coin-Cost': '10' });
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, other), 20);
  await PlatformCoinCharge.updateOne({ resourceKey: stuck.body.match.id }, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } }, { timestamps: false });
  await sweepPendingCharges({ scope: PLATFORM_WALLET_SCOPE, verifiers: chargeVerifiers });
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, other), 20, 'a check still queued a few minutes is left alone');
  await ResumeJdMatch.updateOne({ _id: stuck.body.match.id }, { $set: { updatedAt: new Date(Date.now() - 20 * 60_000) } }, { timestamps: false });
  await sweepPendingCharges({ scope: PLATFORM_WALLET_SCOPE, verifiers: chargeVerifiers });
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, other), 30, 'one stuck for 20 minutes is refunded');
  // And it can never run for free afterwards.
  await idle.run(stuck.body.match.id);
  assert.equal((await ResumeJdMatch.findById(stuck.body.match.id).lean()).status, 'failed');
});

test('size is checked before any charge: a long résumé or JD is refused with what to shorten', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const gemini = fakeGemini();
  const service = createJdMatchService({ gemini });
  // A résumé far past two pages: refused, nothing charged, Gemini never called.
  const big = await studentWith(30);
  await Resume.updateOne({ student: big._id }, { $set: { projects: Array.from({ length: 40 }, (_, index) => ({ title: `Project ${index}`, bullets: Array.from({ length: 4 }, () => ({ text: 'Built and deployed a full stack web application with authentication, payments and dashboards for many users across teams' })) })) } });
  await assert.rejects(service.start(big, { jobDescription: JD }, { expectedCost: 10 }), (error) => error.status === 413 && error.details.code === 'JD_MATCH_RESUME_TOO_LONG');
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, big), 30);
  assert.equal(gemini.calls.length, 0);
  assert.equal((await service.overview(big)).resumeTooLong, true, 'the page can warn before the button is pressed');

  // With a low cap, a long JD is refused and the student is told the limit for their résumé.
  await saveJdMatchLimits({ limits: { perCheckCapInr: 0.4 }, expectedVersion: 0, actorId: admin });
  const student = await studentWith(30);
  const limit = (await service.overview(student)).jdMaxChars;
  assert.ok(limit > 600 && limit < 12000, `limit ${limit}`);
  const longJd = `${JD}\n${'Experience building distributed backend services with Java and Node.js. '.repeat(Math.ceil(limit / 60))}`;
  await assert.rejects(service.start(student, { jobDescription: longJd.slice(0, 11900) }, { expectedCost: 10 }), (error) => error.status === 413 && error.details.code === 'JD_MATCH_JD_TOO_LONG' && error.details.jdMaxChars === limit);
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 30, 'no coins taken');
});

test('parallel starts charge once, and billed failures count toward the daily limit', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const student = await studentWith(50);
  const service = createJdMatchService({ gemini: fakeGemini(), concurrency: 0 });
  const server = app(service, student);
  const results = await Promise.all([1, 2, 3].map((n) => service.start(student, { jobDescription: `${JD}\nTeam ${n}` }, { expectedCost: 10 }).catch((error) => ({ error }))));
  assert.equal(results.filter((result) => result.charge?.cost === 10).length, 1, 'only one paid check starts');
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, student), 40);
  assert.equal(await ResumeJdMatch.countDocuments({ student: student._id }), 1);
  void server;

  await saveJdMatchLimits({ limits: { dailyChecksPerStudent: 1 }, expectedVersion: 0, actorId: admin });
  const other = await studentWith(50);
  const failing = createJdMatchService({ gemini: fakeGemini(goodAnswer, { fail: true }) });
  const first = await failing.start(other, { jobDescription: JD }, { expectedCost: 10 });
  await waitFor(async () => (await ResumeJdMatch.findById(first.match.id).lean()).refunded);
  assert.equal((await ResumeJdMatch.findById(first.match.id).lean()).billed, true);
  await assert.rejects(failing.start(other, { jobDescription: `${JD}\nAgain` }, { expectedCost: 10 }), (error) => error.status === 429, 'a refunded but billed check still uses the daily check');
});

test('short JDs, empty balances, the daily limit and a spent budget never take coins', async (t) => {
  if (skipped) return t.skip('Local sockets are unavailable');
  const gemini = fakeGemini();
  const service = createJdMatchService({ gemini });
  const poor = await studentWith(5);
  assert.equal((await call(app(service, poor), 'POST', '/jd', { jobDescription: 'Java developer' })).status, 400);
  const short = await call(app(service, poor), 'POST', '/jd', { jobDescription: JD }, { 'X-Prep-Coin-Cost': '10' });
  assert.equal(short.status, 402, 'a short balance is refused');
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, poor), 5);
  assert.equal(await ResumeJdMatch.countDocuments(), 0, 'no check is left behind');

  await saveJdMatchLimits({ limits: { dailyChecksPerStudent: 1 }, expectedVersion: 0, actorId: admin });
  const busy = await studentWith(50);
  const first = await call(app(service, busy), 'POST', '/jd', { jobDescription: JD }, { 'X-Prep-Coin-Cost': '10' });
  await waitFor(async () => (await ResumeJdMatch.findById(first.body.match.id).lean()).status === 'done');
  const second = await call(app(service, busy), 'POST', '/jd', { jobDescription: `${JD}\nAlso: Kotlin` }, { 'X-Prep-Coin-Cost': '10' });
  assert.equal(second.status, 429);
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, busy), 40);

  await saveJdMatchLimits({ limits: { dailyChecksPerStudent: 5, monthlyBudgetInr: 0 }, expectedVersion: 1, actorId: admin });
  const paused = await call(app(service, busy), 'POST', '/jd', { jobDescription: `${JD}\nAlso: Kotlin` }, { 'X-Prep-Coin-Cost': '10' });
  assert.equal(paused.status, 503);
  assert.equal(await walletBalance(PLATFORM_WALLET_SCOPE, busy), 40);
});
