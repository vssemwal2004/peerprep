// Detection quality on seeded mistakes: every field a recruiter reads is checked (skills, tech
// stack, degree, titles, bullets), misspelt tools are matched to the tool, and a clean résumé
// stays clean. Run: node --test test/resumeDetection.test.js
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { Dialect, LocalLinter } from 'harper.js';
import { binaryInlined } from 'harper.js/binaryInlined';

const root = fileURLToPath(new URL('..', import.meta.url));
let server, engine, utils, sample, vocab, scoring;
const clone = (value) => JSON.parse(JSON.stringify(value));
const createLinter = async () => { const linter = new LocalLinter({ binary: binaryInlined, dialect: Dialect.Indian }); await linter.setup(); return linter; };

before(async () => {
  server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  engine = await server.ssrLoadModule('/src/features/resume/review/grammarEngine.js');
  utils = await server.ssrLoadModule('/src/features/resume/resumeUtils.js');
  vocab = await server.ssrLoadModule('/src/features/resume/review/techVocabulary.js');
  scoring = await server.ssrLoadModule('/src/features/resume/review/resumeScore.js');
  sample = (await server.ssrLoadModule('/src/features/resume/templates/sampleResume.js')).SAMPLE_RESUME;
});
after(async () => { await server?.close(); });

// Each seeded mistake: [field path for the message, wrong word, the fix we expect first (or null = any finding)].
const SEEDED = [
  ['skills', 'Pyhton', 'Python'], ['skills', 'Javscript', 'JavaScript'], ['skills', 'react', 'React'], ['skills', 'nodejs', 'Node.js'],
  ['skills', 'MongoDb', 'MongoDB'], ['skills', 'Sovling', 'Solving'], ['skills', 'Comunication', 'Communication'],
  ['skills category', 'Langauges', 'Languages'], ['tech stack', 'JavaSrcipt', 'JavaScript'], ['tech stack', 'Firebse', 'Firebase'],
  ['degree', 'Sceince', 'Science'], ['project title', 'Attendence', 'Attendance'], ['role', 'Sofware', 'Software'],
  ['bullet', 'Develped', 'Developed'], ['bullet', 'help', 'helps'], ['bullet', 'attendence', 'attendance'], ['bullet', 'Impelemented', 'Implemented'],
  ['bullet', 'the the', null], ['bullet', 'I', null], ['headline', 'Aspirng', 'Aspiring'],
];

function seededResume() {
  const resume = utils.normalizeClientResume(clone(sample));
  resume.basics.headline = 'Aspirng full-stack developer';
  resume.skills = [
    { category: 'Langauges', skills: 'Pyhton, Javscript, C++, SQL' },
    { category: 'Web', skills: 'react, nodejs, MongoDb, Express' },
    { category: 'Soft skills', skills: 'Problem Sovling, Comunication, Teamwork' },
  ];
  resume.education[0].degree = 'B.Tech, Computer Sceince and Engineering';
  resume.experience[0].subtitle = 'Sofware Engineering Intern';
  resume.projects[0].title = 'Smart Attendence System';
  resume.projects[0].technologies = 'JavaSrcipt, Firebse, Flutter';
  resume.projects[0].bullets = [
    { text: 'Develped a web app that help teachers mark attendence for 300 students.' },
    { text: 'Impelemented REST APIs for a Zomato-style menu and cut page load time by 30%.' },
    { text: 'I tested the the application with 40 classmates.' },
  ];
  return resume;
}

test('misspelt tools are matched to the tool, ordinary words are not guessed', () => {
  assert.equal(vocab.nearestTechTerm('Pyhton'), 'Python');
  assert.equal(vocab.nearestTechTerm('JavaSrcipt'), 'JavaScript');
  assert.equal(vocab.nearestTechTerm('Kubernets'), 'Kubernetes');
  assert.equal(vocab.nearestTechTerm('Python'), null, 'exact names are not typos');
  assert.equal(vocab.nearestTechTerm('Go'), null, 'short words are never guessed');
  assert.equal(vocab.typoDistance('pyhton', 'python'), 1, 'a swap of two letters is one typo');
});

test('seeded mistakes in every field are found, located and fixable', { timeout: 120000 }, async (t) => {
  const resume = seededResume();
  const { issues } = await engine.checkGrammar(resume, { createLinter });
  const missed = [];
  for (const [where, wrong, fix] of SEEDED) {
    const hit = issues.find((item) => item.problem === wrong || (wrong.includes(' ') && item.problem.toLowerCase().includes(wrong)));
    if (!hit) { missed.push(`${where}: ${wrong}`); continue; }
    if (fix) assert.equal(hit.suggestions[0], fix, `${where}: “${wrong}” should suggest “${fix}” first (got ${JSON.stringify(hit.suggestions)})`);
  }
  const recall = (SEEDED.length - missed.length) / SEEDED.length;
  t.diagnostic(`recall ${SEEDED.length - missed.length}/${SEEDED.length}${missed.length ? `; missed: ${missed.join('; ')}` : ''}; ${issues.length} findings in all`);
  assert.ok(recall >= 0.9, `recall ${(recall * 100).toFixed(0)}%, missed: ${missed.join('; ')}`);
  const skill = issues.find((item) => item.problem === 'Pyhton');
  assert.deepEqual([skill.unit.section, skill.unit.entryIndex, skill.unit.field], ['skills', 0, 'skills']);
  assert.equal(skill.confidence, 'high', 'a misspelt tool is a sure mistake');
  for (const word of ['Sovling', 'Comunication', 'Attendence', 'Langauges']) assert.equal(issues.find((item) => item.problem === word)?.confidence, 'high', `capitalised typo “${word}” is sure`);
  const name = issues.find((item) => item.problem === 'Zomato');
  assert.ok(!name || name.confidence === 'low', 'a brand name is at most “name or typo?”');
});

test('a clean résumé stays clean: no high-confidence findings, names are only low-confidence', { timeout: 120000 }, async (t) => {
  const { issues } = await engine.checkGrammar(utils.normalizeClientResume(clone(sample)), { createLinter });
  t.diagnostic(`clean résumé: ${issues.length} findings: ${issues.map((item) => `${item.problem} [${item.category}/${item.confidence}]`).join(', ') || 'none'}`);
  const sure = issues.filter((item) => item.category !== 'style' && item.confidence !== 'low');
  assert.deepEqual(sure.map((item) => `${item.problem} (${item.message})`), []);
});

test('the score falls with every mistake and caps a résumé full of errors', async (t) => {
  const resume = seededResume();
  const { issues } = await engine.checkGrammar(resume, { createLinter });
  const ats = { readinessScore: 96, wordCount: 320, failedChecks: [] };
  const clean = scoring.resumeScore({ resume, atsReport: ats, issues: [] });
  const faulty = scoring.resumeScore({ resume, atsReport: ats, issues });
  t.diagnostic(`ATS 96 → clean ${clean.overall} ${JSON.stringify(clean.parts)}; with ${issues.length} mistakes ${faulty.overall} ${JSON.stringify(faulty.parts)} caps: ${faulty.caps.map((cap) => cap.limit).join(',')}`);
  assert.ok(faulty.overall < 70, `a résumé with ${issues.length} mistakes scored ${faulty.overall}`);
  assert.ok(faulty.caps.length >= 1, 'the cap that applied is explained');
  assert.ok(clean.overall > faulty.overall);
  let previous = 101;
  for (let count = 0; count <= 8; count += 2) {
    const { overall } = scoring.resumeScore({ resume, atsReport: ats, issues: issues.filter((item) => item.category === 'spelling' && item.confidence === 'high').slice(0, count) });
    assert.ok(overall <= previous, `score must not rise as mistakes are added (${count} → ${overall})`);
    previous = overall;
  }
});
