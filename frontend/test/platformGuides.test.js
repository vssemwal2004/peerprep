import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import student from '../src/guide/modules/student/index.js';
import admin from '../src/guide/modules/admin/index.js';
import coordinator from '../src/guide/modules/coordinator/index.js';
import { AREAS, findModule, matchScore, moduleAvailable, moduleProblems, openPath, roleOf } from '../src/guide/platform/registry.js';
import { buildPageGuide, tourLengths } from '../src/guide/platform/buildPageGuide.js';
import { GUIDE_ICON_KEYS } from '../src/guide/platform/iconKeys.js';
import { PLATFORM_GLOSSARY, glossaryFor } from '../src/guide/platform/glossary.js';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, '..', 'src');
const ROLES = { student, coordinator, admin };

function sourceFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== '__harness__') sourceFiles(path, out); } else if (/\.(jsx?|tsx?)$/.test(name)) out.push(path);
  }
  return out;
}
const files = sourceFiles(SRC);
const appSource = readFileSync(join(SRC, 'App.jsx'), 'utf8');
// Routes written as path="…" and as path={SOME_PATH} (constants from platform/universityPermissions.js).
const constants = Object.fromEntries([...readFileSync(join(SRC, 'platform', 'universityPermissions.js'), 'utf8').matchAll(/export const ([A-Z_]+_PATH)\s*=\s*['"]([^'"]+)['"]/g)].map((match) => [match[1], match[2]]));
const routes = new Set([
  ...[...appSource.matchAll(/path=["']([^"']+)["']/g)].map((match) => match[1]),
  ...[...appSource.matchAll(/path=\{([A-Z_]+_PATH)\}/g)].map((match) => constants[match[1]]).filter(Boolean),
]);
// Names marked on the page: data-guide="x" (or passed down to an element that sets data-guide).
const marked = new Set();
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes('data-guide') && !text.includes('dataGuide') && !text.includes('guideTarget')) continue;
  for (const match of text.matchAll(/(?:data-guide|dataGuide|guideTarget|guide)=\{?["'`]([a-z0-9-]+)["'`]/g)) marked.add(match[1]);
  for (const match of text.matchAll(/(?:dataGuide|guideTarget|guide):\s*["'`]([a-z0-9-]+)["'`]/g)) marked.add(match[1]);
}

test('every role has guides, and every guide is well formed', () => {
  for (const [role, modules] of Object.entries(ROLES)) {
    assert.ok(modules.length > 0, `${role}: has guides`);
    assert.deepEqual(moduleProblems(modules, role, GUIDE_ICON_KEYS), [], `${role}: content problems`);
  }
});

test('every guide points at a real route of its role', () => {
  const prefix = { student: /^\/(student|problems|assessments|assessment-reports|assessment-history)/, coordinator: /^\/coordinator/, admin: /^\/admin/ };
  for (const [role, modules] of Object.entries(ROLES)) {
    for (const module of modules) {
      for (const path of module.paths) {
        assert.ok(routes.has(path), `${module.id}: ${path} is not a route in App.jsx`);
        assert.match(path, prefix[role], `${module.id}: ${path} is not a ${role} page`);
      }
    }
  }
});

test('every part a tour points at is marked on a page', () => {
  const missing = [];
  for (const modules of Object.values(ROLES)) {
    for (const module of modules) {
      for (const step of module.steps || []) if (step.target && !marked.has(step.target)) missing.push(`${module.id} › ${step.id} → ${step.target}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('no two pages of one role claim the same route', () => {
  for (const [role, modules] of Object.entries(ROLES)) {
    // Two guides may share a route only when they are for different deployments (university vs control).
    const seen = new Map();
    for (const module of modules) {
      for (const path of module.paths) {
        const other = seen.get(path);
        const clash = other && (!other.deployment || !module.deployment || other.deployment === module.deployment);
        assert.ok(!clash, `${role}: ${path} is claimed by ${other?.id} and ${module.id}`);
        seen.set(path, module);
      }
    }
  }
});

test('the page in view finds its guide (most specific route wins)', () => {
  assert.equal(matchScore('/student/peers/:id', '/student/peers/abc'), 9);
  assert.equal(matchScore('/student/peers/:id', '/student/peers'), -1);
  assert.equal(matchScore('/admin/ai-interviews/*', '/admin/ai-interviews/new/x'), 7);
  const modules = [
    { id: 'a', paths: ['/student/peers'] },
    { id: 'b', paths: ['/student/peers/:id'] },
    { id: 'c', paths: ['/student/peers/:id/compare'] },
  ];
  assert.equal(findModule(modules, '/student/peers')?.id, 'a');
  assert.equal(findModule(modules, '/student/peers/42')?.id, 'b');
  assert.equal(findModule(modules, '/student/peers/42/compare')?.id, 'c');
  assert.equal(findModule(modules, '/student/wallet'), null);
  assert.equal(findModule(student, '/student/dashboard')?.id, 'student.dashboard');
  assert.equal(findModule(admin, '/admin/overview')?.id, 'admin.overview');
  assert.equal(openPath({ paths: ['/admin/students/:studentId'] }), null);
  assert.deepEqual([roleOf({ role: 'student' }), roleOf({ role: 'coordinator' }), roleOf({ role: 'admin' }), roleOf(null)], ['student', 'coordinator', 'admin', null]);
});

test('guides are listed only for what the person can use', () => {
  const quick = { id: 'student.quickprep', paths: ['/student/quickprep'] };
  const env = { role: 'student', featureForPath: () => 'quickprep', hasFeature: (key) => key !== 'quickprep', allowsPath: () => true };
  assert.equal(moduleAvailable(quick, env), false, 'feature turned off');
  assert.equal(moduleAvailable(quick, { ...env, hasFeature: () => true }), true);
  assert.equal(moduleAvailable(quick, { ...env, hasFeature: () => true, allowsPath: () => false }), false, 'not licensed');
  assert.equal(moduleAvailable({ id: 'coordinator.x', paths: ['/coordinator/x'], permission: 'p' }, { role: 'coordinator', hasPermission: () => false }), false);
  assert.equal(moduleAvailable({ id: 'admin.x', paths: ['/admin/x'], deployment: 'control' }, { role: 'admin', deployment: 'university' }), false);
});

test('a tour keeps only the parts on the page, with an intro and a closing card', () => {
  const module = student.find((entry) => entry.id === 'student.dashboard');
  const everything = buildPageGuide(module, { mode: 'full', find: () => ({}) });
  assert.equal(everything.steps.length, module.steps.length + 2);
  assert.equal(everything.steps[0].id, 'intro');
  assert.equal(everything.steps.at(-1).id, 'done');
  const quick = buildPageGuide(module, { mode: 'quick', find: () => ({}) });
  assert.ok(quick.steps.length < everything.steps.length);
  assert.equal(quick.id, 'student.dashboard:quick');
  assert.deepEqual(tourLengths(module), { quick: quick.steps.length, full: everything.steps.length });
  const bare = buildPageGuide(module, { mode: 'full', find: () => null });
  assert.equal(bare.steps.length, 2 + module.steps.filter((step) => !step.target).length, 'parts not on the page are skipped');
  const fromStep = buildPageGuide(module, { mode: 'full', find: () => ({}), at: 'dash-rank' });
  assert.equal(fromStep.steps[fromStep.startAt].id, 'dash-rank');
  let started = null;
  const withNext = buildPageGuide(module, { find: () => ({}), modules: student, startModule: (id) => { started = id; } });
  const action = withNext.steps.at(-1).action?.();
  if (module.next) { action.run(); assert.equal(started, module.next); }
});

test('glossary: platform words plus a page\'s own words', () => {
  const keys = PLATFORM_GLOSSARY.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  const parts = glossaryFor({ terms: [{ term: 'Mastery', text: 'How well you know a topic.' }] }).parts('Mastery grows as your Prep Score rises.');
  assert.deepEqual(parts.filter((part) => part.entry).map((part) => part.text), ['Mastery', 'Prep Score']);
  assert.ok(Object.keys(AREAS).every((role) => AREAS[role].includes('Get started')));
});
