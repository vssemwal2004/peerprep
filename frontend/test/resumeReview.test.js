// ANVI resume check: grammar pipeline (real harper.js), fix application,
// locations, ATS rule mapping and the "fix first" ranking.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { Dialect, LocalLinter } from 'harper.js';
import { binaryInlined } from 'harper.js/binaryInlined';

const root = fileURLToPath(new URL('..', import.meta.url));
let server, model, engine, utils, sample;
const clone = (value) => JSON.parse(JSON.stringify(value));
const createLinter = async () => { const linter = new LocalLinter({ binary: binaryInlined, dialect: Dialect.Indian }); await linter.setup(); return linter; };

before(async () => {
  server = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
  model = await server.ssrLoadModule('/src/features/resume/review/reviewModel.js');
  engine = await server.ssrLoadModule('/src/features/resume/review/grammarEngine.js');
  utils = await server.ssrLoadModule('/src/features/resume/resumeUtils.js');
  sample = (await server.ssrLoadModule('/src/features/resume/templates/sampleResume.js')).SAMPLE_RESUME;
});
after(async () => { await server?.close(); });

function faultyResume() {
  const resume = utils.normalizeClientResume(clone(sample));
  resume.projects[0].bullets = [
    { text: 'Built a dashboard that help students track progress.' },
    { text: 'Responsible for maintaing the the backend APIs using nodejs and **postgres**.' },
  ];
  resume.experience[0].bullets[0] = { text: 'Lead a team of 4 to build a e-commerce website with javascript.' };
  resume.customSections[0].entries[0].title = 'AWS Certifed Cloud Practitioner';
  return resume;
}

test('ATS eligibility needs visible, complete entries and accepts a project in place of employment', () => {
  const resume = utils.createEmptyResume();
  resume.basics = { name: 'Riya', headline: 'Student', location: 'Pune', email: 'riya@example.com' };
  const partial = utils.getResumeRequirements(resume);
  assert.equal(partial.ready, false);
  assert.equal(partial.complete, 2);
  assert.equal(partial.missing.length, 5);
  resume.education = [{ degree: 'B.Tech' }, { institute: 'Pune Institute' }];
  resume.skills = [{ category: 'Languages' }];
  resume.projects = [{ title: 'Course project', bullets: [] }, { bullets: [{ text: 'Created a study planner.' }] }];
  assert.deepEqual(utils.getResumeRequirements(resume).missing.map(item => item.id), ['institute', 'skills', 'work-bullet']);
  resume.education[0].institute = 'Pune Institute';
  resume.skills[0].skills = 'Python';
  resume.projects[0].bullets = ['Built a study planner.'];
  assert.equal(utils.getResumeRequirements(resume).percent, 100);
  resume.hiddenSections = ['projects'];
  resume.basicsVisibility.email = false;
  assert.deepEqual(utils.getResumeRequirements(resume).missing.map(item => item.id), ['contact', 'work-title', 'work-bullet']);
  resume.basics.mobile = '+91 98765 43210';
  resume.experience = [{ title: 'Library', bullets: ['Organised the catalogue.'] }];
  assert.equal(utils.getResumeRequirements(resume).ready, true);
});

test('formatting markers are invisible to the checker and fixes land in the right place', () => {
  const raw = 'Built a **role-based** dashbord for *staff*.';
  const plain = model.toPlain(raw);
  assert.equal(plain.text, 'Built a role-based dashbord for staff.');
  const start = plain.text.indexOf('dashbord');
  assert.equal(model.replaceInRaw(raw, plain, start, start + 8, 'dashboard'), 'Built a **role-based** dashboard for *staff*.');
  const inside = plain.text.indexOf('role');
  assert.equal(model.replaceInRaw(raw, plain, inside, inside + 4, 'Role'), 'Built a **Role-based** dashbord for *staff*.', 'edits inside bold keep the markers');
});

test('every checked line knows its section, entry and bullet, and edits touch only that line', () => {
  const resume = utils.normalizeClientResume(clone(sample));
  const units = model.collectTextUnits(resume);
  const bullet = units.find((unit) => unit.section === 'projects' && unit.entryIndex === 0 && unit.bulletIndex === 1);
  assert.deepEqual(model.locationLabel(bullet), ['Projects', 'CampusRide — Shared Commute Planner', 'Bullet 2']);
  const custom = units.find((unit) => unit.section.startsWith('custom:') && unit.field === 'title');
  const edited = model.writeUnitRaw(resume, custom, 'AWS Certified Developer');
  assert.equal(model.readUnitRaw(edited, custom), 'AWS Certified Developer');
  assert.deepEqual(edited.projects, resume.projects, 'other sections are untouched');
  assert.notEqual(model.grammarSignature(edited), model.grammarSignature(resume), 'edits make earlier results outdated');
  assert.equal(model.grammarSignature(utils.normalizeClientResume({ ...resume, template: 'navigator' })), model.grammarSignature(resume), 'a template switch does not outdate grammar');
  assert.notEqual(model.atsSignature({ ...resume, template: 'navigator' }), model.atsSignature(resume), 'a template switch outdates the ATS check');
});

test('ANVI resume rules catch what harper misses on resumes', () => {
  const unit = { field: 'bullet', scope: 'all' };
  const rules = (text) => model.anviRules(text, unit).map((item) => `${item.ruleId}:${text.slice(item.start, item.end)}>${item.suggestions[0] ?? ''}`);
  assert.deepEqual(rules('Built a dashboard that help students track progress.'), ['anvi.agreement:help>helps']);
  assert.deepEqual(rules('Lead a team of 4 engineers.'), ['anvi.ledPast:Lead>Led']);
  assert.ok(rules('Responsible for testing the APIs.').some((item) => item.startsWith('anvi.weakOpener')));
  assert.ok(rules('Used nodejs and javascript daily.').includes('anvi.techName:nodejs>Node.js'));
  assert.ok(rules('Used nodejs and javascript daily.').includes('anvi.techName:javascript>JavaScript'));
  assert.deepEqual(rules('Built the students that help others.'), [], 'plural nouns take the plain verb');
  assert.deepEqual(rules('Shipped React and Node.js features on github.com/asha.'), [], 'correct names and links are left alone');
});

test('the sample resume is clean and a faulty resume gets precise, located fixes', { timeout: 120000 }, async () => {
  const clean = await engine.checkGrammar(utils.normalizeClientResume(clone(sample)), { createLinter });
  const serious = clean.issues.filter((item) => item.category !== 'style');
  assert.deepEqual(serious.map((item) => `${item.problem} (${item.message})`), [], 'no false alarms on good resume text');

  const resume = faultyResume();
  const { issues } = await engine.checkGrammar(resume, { createLinter });
  const find = (problem) => issues.find((item) => item.problem.toLowerCase() === problem.toLowerCase());
  const help = find('help');
  assert.ok(help, 'subject-verb agreement');
  assert.deepEqual([help.unit.section, help.unit.entryIndex, help.unit.bulletIndex, help.suggestions[0]], ['projects', 0, 0, 'helps']);
  assert.ok(find('maintaing')?.suggestions.includes('maintaining') || find('maintaing')?.suggestions.length, 'spelling');
  assert.ok(issues.some((item) => /the the/i.test(item.problem)), 'repeated word');
  assert.equal(find('nodejs')?.suggestions[0], 'Node.js');
  assert.equal(find('postgres')?.suggestions[0], 'PostgreSQL', 'found inside bold text');
  assert.equal(find('Lead')?.suggestions[0], 'Led');
  assert.ok(find('Certifed'), 'titles get spelling checks');
  assert.ok(issues.some((item) => item.ruleId === 'anvi.weakOpener'));
  const technical = await engine.lintUnit(await engine.loadGrammarEngine(), {
    ...model.collectTextUnits(resume)[0], raw: 'Cached project data in Valkey.',
  });
  assert.ok(!technical.some(item => item.problem === 'Valkey'));

  // Apply every first suggestion (one per line, then re-check): the fixable problems go away.
  let fixed = resume;
  for (let round = 0; round < 6; round += 1) {
    const { issues: current } = await engine.checkGrammar(fixed, { createLinter });
    const fixable = current.filter((item) => item.suggestions.length && item.category !== 'style');
    if (!fixable.length) break;
    const seen = new Set();
    fixable.forEach((item) => {
      if (seen.has(item.unitId)) return;
      seen.add(item.unitId);
      const unit = model.collectTextUnits(fixed).find((candidate) => candidate.id === item.unitId);
      const raw = model.readUnitRaw(fixed, unit);
      fixed = model.writeUnitRaw(fixed, unit, model.replaceInRaw(raw, model.toPlain(raw), item.start, item.end, item.suggestions[0]));
    });
  }
  assert.equal(fixed.projects[0].bullets[0].text, 'Built a dashboard that helps students track progress.');
  assert.match(fixed.projects[0].bullets[1].text, /maintaining the backend APIs using Node\.js and \*\*PostgreSQL\*\*/);
  assert.match(fixed.experience[0].bullets[0].text, /^Led a team of 4 to build an e-commerce website with JavaScript\./);
});

test('ATS rules map to the place they are fixed; the fix-first list mixes ATS and grammar by impact', () => {
  const resume = utils.normalizeClientResume(clone(sample));
  assert.deepEqual(model.atsRuleInfo('ats-v2.format.columns', resume), { title: 'Single-column reading order', section: 'template', template: true });
  assert.equal(model.atsRuleInfo('ats-v2.structure.education', resume).section, 'education');
  assert.equal(model.atsRuleInfo('ats-v2.content.verbs', resume).section, 'experience');
  const report = { failedChecks: [
    { id: 'ats-v2.format.columns', severity: 'error', scoreImpact: 15, fix: 'Use one column.', evidence: 'Two columns.' },
    { id: 'ats-v2.writing.bulletsPerRole', severity: 'info', scoreImpact: 1, fix: 'Two to eight bullets.', evidence: '1 role.' },
  ] };
  const issues = [{ id: 'g1', category: 'spelling', problem: 'maintaing', suggestions: ['maintaining'], message: 'Spelling', plainText: 'x', unit: { section: 'projects', entryIndex: 0, bulletIndex: 1 } }];
  const top = model.fixFirst({ report, issues, resume });
  assert.deepEqual(top.map((item) => item.key), ['ats:ats-v2.format.columns', 'grammar:g1', 'ats:ats-v2.writing.bulletsPerRole']);
  assert.equal(top[0].target.template, true);
  const payload = model.explainPayload({ resume, report: { readinessScore: 80, ...report, job: null }, issues });
  assert.equal(payload.ats.failedChecks[0].section, 'template');
  assert.ok(payload.outline.some((section) => section.key === 'projects' && section.entries[0].lines.length === 2));
  assert.deepEqual(model.verdictFor(91), { label: 'Strong', tone: 'emerald' });
});
