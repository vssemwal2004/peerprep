import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { boxStats, buildKpiGroups, buildKpis, CHARTS, codingKpiSeries, pageItems, practising, seriesPoints, submissionSplit, topicTier, topicTierRanges, topicTiers } from '../src/modules/prepAnalysis/charts.js';
import { drillDetail, drillStudents } from '../src/modules/prepAnalysis/drill.js';
import { chartSummary } from '../src/modules/prepAnalysis/summaries.js';
import { buildChartBook, renderChartCsv, renderChartPdf, renderChartXlsx, validateChartExportOptions } from '../src/modules/prepAnalysis/prepAnalysis.export.js';
import { buildStudentReport, renderStudentReportPdf, renderStudentReportXlsx } from '../src/modules/prepAnalysis/studentReport.js';
import { publicFieldCatalog } from '../src/modules/prepAnalysis/fields.js';
import {
  applyRankCuts, evaluateFilterTree, normalizeFilterTree, normalizeRankCuts,
} from '../src/modules/prepAnalysis/filterEngine.js';
import {
  buildStudentProfile, compareGroups, previousRange, validatePrepAnalysisQuery, withDeltas,
} from '../src/modules/prepAnalysis/prepAnalysis.service.js';
import {
  buildReport, DEFAULT_EXPORT_COLUMNS, EXPORT_COLUMNS, renderCsv, renderPdf, renderXlsx, validateExportOptions,
} from '../src/modules/prepAnalysis/prepAnalysis.export.js';
import { mockScore } from '../src/modules/prepAnalysis/interviewFacts.js';
import { scoreFromLevelCounts } from '../src/services/prepScore/engine.js';
import { attachStoredScores, buildStudentRows, indexProblemMeta, qualifiedCodingMetric } from '../src/modules/prepAnalysis/studentRows.js';

const ALL_MODULES = { allowedModules: new Set(['student', 'coding', 'quickprep', 'learning', 'interview', 'assessment']) };

/** Stand-in for the StudentPrepScore store: what the sync would have saved for each row's coding solves. */
function storedFromCoding(rows) {
  return new Map(rows.map((row) => {
    const { Easy, Medium, Hard } = row.coding.solved;
    const score = scoreFromLevelCounts({ coding: { Easy, Medium, Hard } }, { coding: true });
    return [row.id, { total: score.total, modules: { coding: { score: score.features.coding.score, counts: score.features.coding.counts } } }];
  }));
}

// ---------------------------------------------------------------- Prep Score

test('admin rows show the stored Prep Score students rank on, never a period-limited recalculation', () => {
  const rows = buildStudentRows({ students: [{ _id: 's1', name: 'Asha' }, { _id: 's2', name: 'Bilal' }], facts: { byStudent: new Map(), days: new Map() }, problems: new Map() });
  assert.equal(rows[0].coding.prepScore, 0, 'nothing is computed from the period facts');
  attachStoredScores(rows, new Map([['s1', {
    total: 9.5,
    modules: { coding: { score: 8.09, counts: { Easy: 1, Medium: 3, Hard: 2 } }, learning: { score: 3, counts: { Easy: 3, Medium: 0, Hard: 0 } } },
  }]]), { features: { coding: true, learning: false }, points: { Easy: 1, Medium: 2, Hard: 4 } });
  assert.equal(rows[0].coding.prepScore, 9.5, 'the stored total the profile shows, not the coding module score (8.09)');
  assert.deepEqual(rows[0].coding.points, { Easy: 1, Medium: 6, Hard: 8 }, 'work split by configured points');
  assert.equal(rows[0].scores.total, 9.5);
  assert.equal(rows[0].scores.features.learning, undefined, 'an unlicensed module is not shown');
  assert.deepEqual(rows[1].scores, { total: 0, features: {} }, 'no stored row yet means 0');
});

test('every Prep Analysis Prep Score equals the profile score even when the coding module score differs', () => {
  // Production case: ledger total 18.5 (solves + logins + challenges) vs formula coding score 16.5.
  const rows = buildStudentRows({
    students: [{ _id: 's1', name: 'Asha' }],
    facts: { byStudent: new Map([['s1', [{ problemId: 'p1', language: 'cpp', attempts: 1, accepted: 1 }]]]), days: new Map() },
    problems: indexProblemMeta(new Map([['p1', { id: 'p1', title: 'One', difficulty: 'Easy', topicIds: [], topics: [], tags: [], companies: [] }]])),
  });
  attachStoredScores(rows, new Map([['s1', { total: 18.5, modules: { coding: { score: 16.5, counts: { Easy: 38, Medium: 30, Hard: 18 } } } }]]), { features: { coding: true } });
  const [row] = rows;
  assert.equal(row.coding.prepScore, 18.5);
  assert.equal(row.scores.total, 18.5);
  const [item] = CHARTS.find((chart) => chart.id === 'top-students').build({ rows, options: {}, range: {} }).items;
  assert.equal(item.score, 18.5, 'top-students bar shows the profile score');
  assert.equal(Math.round((item.segments.Easy + item.segments.Medium + item.segments.Hard) * 100) / 100, 18.5, 'bar parts add up to it');
});

test('top-student bars are the Prep Score split by difficulty, so a longer bar always means a higher score', () => {
  // Many Easy solves give lots of points but a lower score than fewer, harder solves.
  const rows = buildStudentRows({
    students: [{ _id: 's1', name: 'Volume' }, { _id: 's2', name: 'Depth' }],
    facts: { byStudent: new Map([['s1', [{ problemId: 'p1', language: 'cpp', attempts: 1, accepted: 1 }]], ['s2', [{ problemId: 'p1', language: 'cpp', attempts: 1, accepted: 1 }]]]), days: new Map() },
    problems: indexProblemMeta(new Map([['p1', { id: 'p1', title: 'One', difficulty: 'Easy', topicIds: [], topics: [], tags: [], companies: [] }]])),
  });
  const counts = { s1: { Easy: 45, Medium: 5, Hard: 0 }, s2: { Easy: 2, Medium: 6, Hard: 6 } };
  attachStoredScores(rows, new Map(Object.entries(counts).map(([id, levelCounts]) => {
    const score = scoreFromLevelCounts({ coding: levelCounts }, { coding: true });
    return [id, { total: score.total, modules: { coding: { score: score.features.coding.score, counts: score.features.coding.counts } } }];
  })), { features: { coding: true }, points: { Easy: 1, Medium: 2, Hard: 4 } });
  const volume = rows.find((row) => row.id === 's1');
  const depth = rows.find((row) => row.id === 's2');
  assert.ok(volume.coding.points.Easy + volume.coding.points.Medium > depth.coding.points.Easy + depth.coding.points.Medium + depth.coding.points.Hard, 'the volume student has more raw points');
  assert.ok(depth.coding.prepScore > volume.coding.prepScore, 'but the depth student has the higher score');

  const items = CHARTS.find((chart) => chart.id === 'top-students').build({ rows, options: {}, range: {} }).items;
  assert.deepEqual(items.map((item) => item.name), ['Depth', 'Volume']);
  const length = (item) => Math.round((item.segments.Easy + item.segments.Medium + item.segments.Hard) * 100) / 100;
  for (const item of items) assert.equal(length(item), item.score, `${item.name}: the parts add up to the score`);
  assert.ok(length(items[0]) > length(items[1]), 'the higher score has the longer bar');
  assert.ok(items[0].segments.Hard > items[0].segments.Easy, 'Hard work is the largest part of the depth student\'s score');
  assert.deepEqual(items[0].counts, counts.s2, 'all-time counts behind the stored score');
  assert.equal(items[0].solved.total, 1, 'period solves stay separate');
});

// ---------------------------------------------------------------- synthetic cohort

function cohort() {
  const problems = indexProblemMeta(new Map([
    ['p1', { id: 'p1', title: 'Two Sum', difficulty: 'Easy', topicIds: ['t1'], topics: ['Arrays'], tags: ['Hash Table'], companies: ['Google'] }],
    ['p2', { id: 'p2', title: 'Course Schedule', difficulty: 'Medium', topicIds: ['t2'], topics: ['Graphs'], tags: ['BFS'], companies: ['Amazon'] }],
    ['p3', { id: 'p3', title: 'Word Ladder II', difficulty: 'Hard', topicIds: ['t2'], topics: ['Graphs'], tags: ['BFS'], companies: [] }],
    ['p4', { id: 'p4', title: 'Climbing Stairs', difficulty: 'Easy', topicIds: ['t3'], topics: ['Dynamic Programming'], tags: ['DP'], companies: [] }],
  ]));
  const students = [
    { _id: 's1', name: 'Asha', email: 'asha@x.edu', studentId: 'A1', semester: 5, branch: 'CSE', course: 'B.Tech', college: 'GEHU', group: 'G1', teacherIds: ['C1'] },
    { _id: 's2', name: 'Bilal', email: 'bilal@x.edu', studentId: 'B2', semester: 5, branch: 'ECE', course: 'B.Tech', college: 'GEU', group: 'G2', teacherIds: ['C2'] },
    { _id: 's3', name: 'Chen', email: 'chen@x.edu', studentId: 'C3', semester: 3, branch: 'CSE', course: 'BCA', college: 'GEHU', group: 'G1', teacherIds: ['C1', 'C2'] },
    { _id: 's4', name: 'Dev', email: 'dev@x.edu', studentId: 'D4', semester: 7, branch: 'CSE', course: 'B.Tech', college: 'GEU', group: 'G3', isActive: false },
  ];
  const entry = (problemId, language, attempts, accepted) => ({ problemId, language, attempts, accepted, verdicts: { AC: accepted, WA: attempts - accepted, TLE: 0, RE: 0, CE: 0 } });
  const byStudent = new Map([
    // Asha: hard and medium graph work in C++.
    ['s1', [entry('p2', 'cpp', 2, 1), entry('p3', 'cpp', 3, 1), entry('p1', 'cpp', 1, 1)]],
    // Bilal: easy volume in Python, sloppy.
    ['s2', [entry('p1', 'python', 4, 1), entry('p4', 'python', 5, 1), entry('p2', 'java', 3, 0)]],
    // Chen: one easy in Java.
    ['s3', [entry('p4', 'java', 1, 1)]],
  ]);
  const days = new Map([
    ['s1', new Map([['2026-10-01', { attempts: 3, accepted: 2 }], ['2026-10-05', { attempts: 3, accepted: 1 }]])],
    ['s2', new Map([['2026-10-02', { attempts: 12, accepted: 2 }]])],
    ['s3', new Map([['2026-09-01', { attempts: 1, accepted: 1 }]])],
  ]);
  const topics = new Map([['t1', { id: 't1', name: 'Arrays', parentId: null }], ['t2', { id: 't2', name: 'Graphs', parentId: null }], ['t3', { id: 't3', name: 'Dynamic Programming', parentId: null }]]);
  const rows = buildStudentRows({ students, facts: { byStudent, days }, problems, now: new Date('2026-10-10T00:00:00Z') });
  attachStoredScores(rows, storedFromCoding(rows), { features: { coding: true } });
  return { rows, topics };
}

const pick = (rows, tree, rank) => applyRankCuts(rows.filter((row) => evaluateFilterTree(normalizeFilterTree(tree, ALL_MODULES), row)), normalizeRankCuts(rank, ALL_MODULES)).map((row) => row.name);

test('rows carry solves by difficulty, accuracy, recency, practice status and an individual Prep Score', () => {
  const { rows } = cohort();
  const asha = rows.find((row) => row.name === 'Asha');
  const bilal = rows.find((row) => row.name === 'Bilal');
  const chen = rows.find((row) => row.name === 'Chen');
  const dev = rows.find((row) => row.name === 'Dev');
  assert.deepEqual(asha.coding.solved, { Easy: 1, Medium: 1, Hard: 1, total: 3 });
  assert.equal(asha.coding.accuracy, 50);
  assert.equal(asha.coding.daysSinceActive, 5);
  assert.ok(asha.coding.prepScore > bilal.coding.prepScore, 'hard and medium work outranks easy volume');
  assert.equal(asha.coding.prepScore, scoreFromLevelCounts({ coding: { Easy: 1, Medium: 1, Hard: 1 } }, { coding: true }).features.coding.score, 'the score depends on the student alone');
  assert.equal(asha.coding.practiceStatus, 'active');
  assert.equal(chen.coding.practiceStatus, 'inactive', 'no practice for 39 days');
  assert.equal(dev.coding.practiceStatus, 'never');
  assert.equal(dev.coding.daysSinceActive, null);
  assert.equal(dev.coding.prepScore, 0);
  assert.equal(rows[0].coding.rank, undefined, 'no cohort-wide rank is stored');
});

test('qualified metrics narrow by topic, language, difficulty and company', () => {
  const { rows } = cohort();
  const asha = rows.find((row) => row.name === 'Asha');
  assert.equal(qualifiedCodingMetric(asha, 'solved', { topics: ['graphs'] }), 2, 'topic match ignores case');
  assert.equal(qualifiedCodingMetric(asha, 'solved', { topics: ['Graphs'], difficulties: ['Hard'] }), 1);
  assert.equal(qualifiedCodingMetric(asha, 'solved', { languages: ['python'] }), 0);
  assert.equal(qualifiedCodingMetric(asha, 'submissions', { companies: ['Amazon'] }), 2);
  assert.equal(qualifiedCodingMetric(asha, 'accuracy', { topics: ['Graphs'] }), 40);
});

test('nested AND / OR / NOT groups across student and coding fields', () => {
  const { rows } = cohort();
  // Semester 5 AND (solved Graphs in C++ OR used Python)
  const tree = {
    join: 'and',
    children: [
      { field: 'student.semester', operator: 'is', value: 5 },
      { type: 'group', join: 'or', children: [
        { field: 'coding.solved', operator: 'gte', value: 1, qualifiers: { topics: ['Graphs'], languages: ['cpp'] } },
        { field: 'coding.languages', operator: 'anyOf', value: ['python'] },
      ] },
    ],
  };
  assert.deepEqual(pick(rows, tree).sort(), ['Asha', 'Bilal']);
  // NOT (branch is CSE)
  assert.deepEqual(pick(rows, { children: [{ type: 'group', join: 'and', negate: true, children: [{ field: 'student.branch', operator: 'is', value: 'cse' }] }] }), ['Bilal']);
  // Coordinator set: all of C1 and C2
  assert.deepEqual(pick(rows, { children: [{ field: 'student.coordinator', operator: 'allOf', value: ['C1', 'C2'] }] }), ['Chen']);
  // Numbers: never-active students only match "not equal"
  assert.deepEqual(pick(rows, { children: [{ field: 'coding.daysSinceActive', operator: 'lte', value: 30 }] }).sort(), ['Asha', 'Bilal']);
  assert.ok(pick(rows, { children: [{ field: 'coding.daysSinceActive', operator: 'neq', value: 5 }] }).includes('Dev'));
  // Text search across name, email and ID
  assert.deepEqual(pick(rows, { children: [{ field: 'student.search', operator: 'contains', value: 'C3' }] }), ['Chen']);
  // Plain-language fields
  assert.deepEqual(pick(rows, { children: [{ field: 'coding.practiceStatus', operator: 'anyOf', value: ['inactive', 'never'] }] }).sort(), ['Chen', 'Dev']);
  assert.deepEqual(pick(rows, { children: [{ field: 'coding.solvedHard', operator: 'gte', value: 1 }] }), ['Asha']);
  // An empty filter keeps everyone.
  assert.equal(pick(rows, undefined).length, 4);
});

test('rank cuts: top/bottom by count or percent, joined with AND / OR, applied after the tree', () => {
  const { rows } = cohort();
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'coding.prepScore', direction: 'top', unit: 'count', value: 1 }] }), ['Asha']);
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'coding.prepScore', direction: 'top', unit: 'percent', value: 50 }] }), ['Asha', 'Bilal']);
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'coding.submissions', direction: 'bottom', unit: 'count', value: 1 }] }), ['Dev']);
  // Semester 5 first, then top 1 of semester 5 by submissions -> Bilal (12), not the cohort's overall leader.
  assert.deepEqual(pick(rows, { children: [{ field: 'student.semester', operator: 'is', value: 5 }] }, { cuts: [{ metric: 'coding.submissions', direction: 'top', unit: 'count', value: 1 }] }), ['Bilal']);
  const both = { cuts: [
    { metric: 'coding.prepScore', direction: 'top', unit: 'count', value: 2 },
    { metric: 'coding.accuracy', direction: 'top', unit: 'count', value: 2 },
  ] };
  assert.deepEqual(pick(rows, null, { ...both, join: 'and' }), ['Asha']);
  assert.deepEqual(pick(rows, null, { ...both, join: 'or' }).sort(), ['Asha', 'Bilal', 'Chen']);
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'coding.solved', qualifiers: { topics: ['Graphs'] }, direction: 'top', unit: 'count', value: 1 }] }), ['Asha']);
});

test('validation rejects bad trees, deep nesting, wrong operators and unlicensed modules', () => {
  assert.throws(() => normalizeFilterTree({ children: [{ field: 'nope', operator: 'is', value: 1 }] }, ALL_MODULES), /Unknown filter field/);
  assert.throws(() => normalizeFilterTree({ children: [{ field: 'student.branch', operator: 'gte', value: 1 }] }, ALL_MODULES), /does not support/);
  assert.throws(() => normalizeFilterTree({ children: [{ field: 'coding.solved', operator: 'between', value: [5, 1] }] }, ALL_MODULES), /smaller number first/);
  assert.throws(() => normalizeFilterTree({ children: [{ field: 'student.branch', operator: 'is', value: 'CSE', qualifiers: { topics: ['x'] } }] }, ALL_MODULES), /cannot be narrowed/);
  assert.throws(() => normalizeFilterTree({ children: [{ field: 'coding.solved', operator: 'gte', value: 1, qualifiers: { languages: ['cobol'] } }] }, ALL_MODULES), /Unknown language/);
  const deep = (level) => (level === 0 ? { field: 'student.semester', operator: 'is', value: 1 } : { type: 'group', join: 'and', children: [deep(level - 1)] });
  assert.doesNotThrow(() => normalizeFilterTree({ children: [deep(3)] }, ALL_MODULES), 'four levels are allowed');
  assert.throws(() => normalizeFilterTree({ children: [deep(4)] }, ALL_MODULES), /nest up to 4/);
  const studentsOnly = { allowedModules: new Set(['student']) };
  assert.throws(() => normalizeFilterTree({ children: [{ field: 'coding.solved', operator: 'gte', value: 1 }] }, studentsOnly), (error) => error.status === 403 || error.statusCode === 403);
  assert.throws(() => normalizeRankCuts({ cuts: [{ metric: 'student.branch', value: 3 }] }, ALL_MODULES), /cannot be ranked/);
  assert.throws(() => normalizeRankCuts({ cuts: [{ metric: 'coding.prepScore', unit: 'percent', value: 150 }] }, ALL_MODULES), /between 0 and 100/);
});

test('a university without the questions module gets no Prep Coding or Quick Prep fields, charts or queries', () => {
  const catalog = publicFieldCatalog({ questions: false, learning: true });
  assert.deepEqual(catalog.modules.map((module) => module.key), ['student', 'learning']);
  assert.deepEqual(catalog.areas.map((area) => area.key), ['learning'], 'one area only, so no "All"');
  assert.ok(catalog.fields.every((field) => field.module === 'student' || field.module === 'learning'));
  assert.deepEqual(Object.keys(catalog.qualifiers), ['learning']);
  assert.deepEqual(publicFieldCatalog(undefined).areas.map((area) => area.key), ['all', 'coding', 'quickprep', 'learning', 'interview', 'assessment', 'prepmock'], 'Quick Prep and PrepMock are their own areas');
  assert.deepEqual(publicFieldCatalog({ events: true }).areas.map((area) => area.key), ['interview'], 'mock interviews alone turn on Prep Interview');
  assert.deepEqual(publicFieldCatalog({ interviews: true, assessments: true }).areas.map((area) => area.key), ['all', 'interview', 'assessment']);
  assert.deepEqual(publicFieldCatalog({ prepmock: true }).areas.map((area) => area.key), ['prepmock']);
  assert.ok(publicFieldCatalog(undefined).fields.filter((field) => field.key.startsWith('quickprep.')).every((field) => field.module === 'quickprep'));
  assert.throws(() => validatePrepAnalysisQuery({ module: 'quickprep' }, { questions: false, learning: true }), /not enabled/, 'Quick Prep is licensed with coding');
  assert.throws(() => validatePrepAnalysisQuery({ module: 'coding' }, { questions: false, learning: true }), /not enabled/);
  const codingCharts = validatePrepAnalysisQuery({ module: 'coding' }, undefined).charts;
  assert.ok(codingCharts.every((chart) => !chart.id.startsWith('quickprep-')), 'Prep Coding no longer carries the Quick Prep charts');
  const quickprepCharts = validatePrepAnalysisQuery({ module: 'quickprep' }, { questions: true }).charts;
  assert.ok(quickprepCharts.length >= 10 && quickprepCharts.every((chart) => chart.id.startsWith('quickprep-')), 'Quick Prep has its own charts');
  assert.ok(validatePrepAnalysisQuery({ module: 'quickprep', charts: [{ id: 'top-students' }, { id: 'quickprep-sheets' }] }, undefined).charts.map((chart) => chart.id).join() === 'quickprep-sheets', 'a coding chart never lands on the Quick Prep page');
  const all = validatePrepAnalysisQuery({ module: 'all' }, { questions: false, learning: true });
  assert.ok(all.charts.every((chart) => chart.id.startsWith('learning-')), '"All" drops charts of unlicensed areas');
  assert.ok(catalog.fields.every((field) => !('get' in field)), 'server getters never leave the API');
  assert.throws(() => validatePrepAnalysisQuery({ module: 'coding' }, { questions: false }), /not enabled/);
  const query = validatePrepAnalysisQuery({}, undefined);
  assert.equal(query.module, 'coding');
  assert.ok(query.charts.length >= 10, 'the default layout is used');
  // Settings saved in a browser by an older version never blank the page.
  const saved = validatePrepAnalysisQuery({ charts: [
    { id: 'not-a-chart' },
    { id: 'topic-strength', options: { limit: 250 } },
    { id: 'top-students', options: { limit: 'lots', studentId: 'nope', groupBy: 'planet' } },
    { id: 'tough-problems', filter: { type: 'group', join: 'and', children: [{ type: 'rule', field: 'no.such.field', operator: 'is', value: 1 }] } },
  ] }, undefined);
  assert.deepEqual(saved.charts.map((chart) => chart.id), ['topic-strength', 'top-students', 'tough-problems'], 'a chart that no longer exists is skipped');
  assert.equal(saved.charts[0].options.limit, 100, 'a limit above 100 shows 100');
  assert.equal(saved.charts[1].options.limit, 10, 'a limit that is not a number keeps the default');
  assert.ok(saved.charts[2].filterError, 'a chart filter on a field that changed is dropped and reported');
  assert.equal(saved.charts[2].filter.children.length, 0);
  assert.equal(validatePrepAnalysisQuery({ charts: Array.from({ length: 40 }, () => ({ id: 'top-students' })) }, undefined).charts.length, 24, 'extra charts are skipped');
  assert.throws(() => validatePrepAnalysisQuery({ range: { preset: 'custom', from: '2026-10-10', to: '2026-01-01' } }, undefined), /before the end/);
});

function learningAndQuickPrep() {
  const curriculum = [
    { id: 'sem3', name: 'Semester 3', number: 3, topics: 6, subjects: [{ id: 'dsa3', name: 'DSA', topics: 4 }, { id: 'db3', name: 'DBMS', topics: 2 }] },
    { id: 'sem5', name: 'Semester 5', number: 5, topics: 4, subjects: [{ id: 'os5', name: 'Operating Systems', topics: 4 }] },
  ];
  const learning = {
    curriculum,
    byStudent: new Map([
      // Asha (sem 5) can open 10 topics: finished DSA (4) and 1 OS topic.
      ['s1', { subjects: [{ semesterId: 'sem3', subjectId: 'dsa3', completed: 4, started: 4, videoSeconds: 1800 }, { semesterId: 'sem5', subjectId: 'os5', completed: 1, started: 2, videoSeconds: 600 }], days: new Map([['2026-10-08', 2]]), lastAccessedAt: new Date('2026-10-09T00:00:00Z') }],
      // Chen (sem 3) can open 6 topics; semester-5 progress does not count for them.
      ['s3', { subjects: [{ semesterId: 'sem3', subjectId: 'db3', completed: 1, started: 1, videoSeconds: 0 }, { semesterId: 'sem5', subjectId: 'os5', completed: 3, started: 3, videoSeconds: 0 }], days: new Map(), lastAccessedAt: new Date('2026-08-01T00:00:00Z') }],
    ]),
  };
  // Question level: q1 has 10 questions (4 Easy, 4 Medium, 2 Hard), q2 has 4 Hard.
  const question = (sheet, index, difficulty) => ({ key: `coding:local:${sheet}-${index}`, title: `${sheet} question ${index}`, difficulty });
  const q1Questions = Array.from({ length: 10 }, (_, index) => question('q1', index + 1, index < 4 ? 'Easy' : index < 8 ? 'Medium' : 'Hard'));
  const q2Questions = Array.from({ length: 4 }, (_, index) => question('q2', index + 1, 'Hard'));
  const sheets = new Map([
    ['q1', { id: 'q1', title: 'Placement essentials', semesters: [], published: true, items: 10, questions: q1Questions }],
    ['q2', { id: 'q2', title: 'Graphs sprint', semesters: [5], published: true, items: 4, questions: q2Questions }],
  ]);
  const quickprep = {
    sheets,
    byStudent: new Map([
      ['s1', [
        { sheetId: 'q1', solved: 10, total: 10, solvedKeys: q1Questions.map((entry) => entry.key), finished: true, startedAt: new Date('2026-09-28T00:00:00Z'), completedAt: new Date('2026-10-08T00:00:00Z'), lastViewedAt: new Date('2026-10-09T00:00:00Z') },
        { sheetId: 'q2', solved: 1, total: 4, solvedKeys: [q2Questions[0].key], finished: false, startedAt: new Date('2026-10-08T00:00:00Z'), completedAt: null, lastViewedAt: new Date('2026-10-09T00:00:00Z') },
      ]],
      ['s2', [{ sheetId: 'q1', solved: 2, total: 10, solvedKeys: [q1Questions[0].key, q1Questions[1].key], finished: false, startedAt: new Date('2026-08-20T00:00:00Z'), completedAt: null, lastViewedAt: new Date('2026-09-01T00:00:00Z') }]],
    ]),
  };
  const base = cohort();
  const students = base.rows.map((row) => ({ _id: row.id, name: row.name, email: row.email, studentId: row.studentId, semester: row.student.semester }));
  const rows = buildStudentRows({ students, facts: { byStudent: new Map(), days: new Map() }, problems: new Map(), learning, quickprep, now: new Date('2026-10-10T00:00:00Z') });
  return { rows, sheets };
}

test('Learning: completed topics of the topics a student can open, by subject, with status', () => {
  const { rows } = learningAndQuickPrep();
  const asha = rows.find((row) => row.name === 'Asha');
  const chen = rows.find((row) => row.name === 'Chen');
  const dev = rows.find((row) => row.name === 'Dev');
  assert.equal(asha.learning.availableTopics, 10);
  assert.equal(asha.learning.completedTopics, 5);
  assert.equal(asha.learning.progress, 50);
  assert.equal(asha.learning.videoMinutes, 40);
  assert.deepEqual(asha.learning.subjectsFinished, ['DSA']);
  assert.equal(asha.learning.status, 'active');
  assert.equal(chen.learning.availableTopics, 6, 'semester 3 cannot open semester 5');
  assert.equal(chen.learning.completedTopics, 1, 'progress in a later semester is not counted');
  assert.equal(chen.learning.status, 'inactive');
  assert.equal(dev.learning.status, 'never');
  assert.deepEqual(pick(rows, { children: [{ field: 'learning.progress', operator: 'gte', value: 50 }] }), ['Asha']);
  assert.deepEqual(pick(rows, { children: [{ field: 'learning.completedTopics', operator: 'gte', value: 1, qualifiers: { subjects: ['dbms'] } }] }), ['Chen']);
  assert.deepEqual(pick(rows, { children: [{ field: 'learning.subjectsFinished', operator: 'anyOf', value: ['DSA'] }] }), ['Asha']);
});

test('Quick Prep: sheets started and finished, progress, and sheet-level narrowing', () => {
  const { rows, sheets } = learningAndQuickPrep();
  const asha = rows.find((row) => row.name === 'Asha');
  const bilal = rows.find((row) => row.name === 'Bilal');
  assert.deepEqual([asha.quickprep.started, asha.quickprep.finished, asha.quickprep.solved, asha.quickprep.progress], [2, 1, 11, 78.6]);
  assert.equal(asha.quickprep.status, 'finished');
  assert.equal(bilal.quickprep.status, 'inProgress');
  assert.equal(rows.find((row) => row.name === 'Dev').quickprep.status, 'none');
  assert.deepEqual(pick(rows, { children: [{ field: 'quickprep.progress', operator: 'lte', value: 30, qualifiers: { sheets: ['q1'] } }] }).sort(), ['Bilal', 'Chen', 'Dev']);
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'quickprep.finished', direction: 'top', unit: 'count', value: 1 }] }), ['Asha']);
  const sheetChart = CHARTS.find((chart) => chart.id === 'quickprep-sheets').build({ rows, options: {}, range: {}, sheets });
  const graphs = sheetChart.groups.find((group) => group.label === 'Graphs sprint');
  assert.deepEqual(graphs.values, { Finished: 0, 'In progress': 1, 'Not started': 1 }, 'only semester-5 students can see this sheet');
  const matrix = CHARTS.find((chart) => chart.id === 'quickprep-matrix').build({ rows, options: { limit: 20 }, range: {}, sheets });
  assert.deepEqual(matrix.students, ['Asha', 'Bilal']);
  assert.equal(matrix.cells.find((cell) => cell[1] === 0 && matrix.columns[cell[0]] === 'Placement essentials')[2], 100);
  const groups = buildKpiGroups('all', new Set(['student', 'coding', 'quickprep', 'learning']), rows);
  const kpis = Object.fromEntries(groups.map((group) => [group.key, Object.fromEntries(group.kpis.map((kpi) => [kpi.id, kpi.value]))]));
  assert.deepEqual(groups.map((group) => group.label), ['Prep Coding', 'Quick Prep', 'Prep Learning'], '"All" shows each feature side by side');
  assert.deepEqual(buildKpiGroups('coding', new Set(['student', 'coding', 'quickprep']), rows).map((group) => group.key), ['coding'], 'the Prep Coding page has only its own numbers');
  assert.deepEqual(buildKpiGroups('quickprep', new Set(['student', 'coding', 'quickprep']), rows).map((group) => group.key), ['quickprep']);
  assert.equal(kpis.learning.halfway, 1, 'only Asha is halfway through the course');
  assert.ok(groups.every((group) => group.kpis.length === 5), 'five numbers per feature, one row');
  assert.ok(!('sheetFinished' in kpis.coding), 'Quick Prep numbers are no longer among the Prep Coding numbers');
  assert.equal(kpis.quickprep.sheetFinished, 1);
  assert.equal(kpis.quickprep.sheetStarted, 2);
  assert.equal(kpis.quickprep.never, rows.length - 2);
});

test('downloads: CSV, Excel and PDF carry the filters and the ticked columns for every matching student', async () => {
  const { rows } = learningAndQuickPrep();
  rows[0].name = '=HYPERLINK("http://x")';
  const query = { module: 'coding', range: { preset: '90d' } };
  const options = validateExportOptions({ format: 'csv', columns: ['position', 'name', 'prepScore', 'sheetProgress', 'learningProgress'], summary: ['Semester is 5', 'Show: Top 10 by Prep Score'] }, undefined, 'coding');
  const report = buildReport({ rows, columns: options.columns, summary: options.summary, query, cohortSize: 10, positionOf: (row) => row.coding.prepScore });
  assert.deepEqual(report.columns.map((column) => column.label), ['#', 'Student name', 'Prep Score', 'Sheet progress %', 'Course completed %']);
  assert.equal(report.rows.length, rows.length, 'every matching student, not just one page');
  assert.deepEqual(report.details.find(([label]) => label === 'Period'), ['Period', 'Last 90 days']);

  const csv = renderCsv(report).toString('utf8');
  assert.ok(csv.startsWith('﻿Prep Analysis · Prep Coding'), 'title first, with a BOM for Excel');
  assert.match(csv, /Filters,Semester is 5/);
  assert.match(csv, /,Show: Top 10 by Prep Score/);
  assert.match(csv, /#,Student name,Prep Score,Sheet progress %,Course completed %/);
  assert.match(csv, /"'=HYPERLINK\(""http:\/\/x""\)"/, 'formula-looking text is neutralised');

  const xlsx = await renderXlsx(report);
  assert.equal(xlsx.subarray(0, 2).toString(), 'PK', 'a real .xlsx (zip) file');
  const pdf = await renderPdf(report);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', 'a real PDF');

  assert.throws(() => validateExportOptions({ format: 'doc' }, undefined, 'coding'), /PDF, Excel or CSV/);
  assert.throws(() => validateExportOptions({ format: 'csv', columns: ['nope'] }, undefined, 'coding'), /Unknown column/);
  assert.throws(() => validateExportOptions({ format: 'csv', columns: ['learningProgress'] }, { questions: true, learning: false }, 'coding'), (error) => error.status === 403 || error.statusCode === 403);
  assert.throws(() => validateExportOptions({ format: 'pdf', columns: EXPORT_COLUMNS.slice(0, 13).map((column) => column.key) }, undefined, 'coding'), /fits up to 12 columns/);
  assert.deepEqual(validateExportOptions({ format: 'xlsx' }, undefined, 'learning').columns.map((column) => column.key), DEFAULT_EXPORT_COLUMNS.learning, 'defaults follow the area');
  for (const area of Object.keys(DEFAULT_EXPORT_COLUMNS)) {
    assert.doesNotThrow(() => validateExportOptions({ format: 'pdf' }, undefined, area), `the ${area} defaults fit a PDF page`);
  }
});

test('every chart builds from the cohort and from an empty selection', () => {
  const { rows, topics } = cohort();
  const extra = learningAndQuickPrep();
  for (const chart of CHARTS) {
    for (const selection of [rows, extra.rows, []]) {
      const data = chart.build({ rows: selection, options: chart.options || {}, range: { preset: 'all' }, topics, sheets: extra.sheets });
      assert.ok(data && typeof data === 'object', `${chart.id} returns data`);
      assert.doesNotThrow(() => JSON.stringify(data), `${chart.id} is serializable`);
    }
  }
  const byId = Object.fromEntries(CHARTS.map((chart) => [chart.id, chart.build({ rows, options: chart.options || {}, range: { preset: 'all', to: new Date('2026-10-10') }, topics })]));
  assert.equal(byId['top-students'].items[0].name, 'Asha');
  assert.equal(byId['top-students'].items[0].position, 1);
  assert.deepEqual(byId['top-students'].items[0].student, {
    studentId: 'A1', email: 'asha@x.edu', course: 'B.Tech',
    branch: 'CSE', college: 'GEHU', semester: 5, section: '', group: 'G1',
  });
  assert.deepEqual(byId['practice-funnel'].stages.map((stage) => stage.value), [4, 3, 3, 1, 1]);
  assert.deepEqual(byId['difficulty-split'].items.map((item) => [item.name, item.value]), [['Easy', 4], ['Medium', 1], ['Hard', 1]]);
  assert.equal(byId['score-spread'].bins.reduce((sum, bin) => sum + bin.count, 0), 3);
  const attention = byId['needs-attention'];
  assert.deepEqual(attention.items.map((item) => [item.name, item.value]), [['Chen', 39]], 'bars: students who stopped, by days away');
  assert.deepEqual(attention.chips.map((chip) => [chip.key, chip.value]), [['listed', 1], ['never', 1]], 'never-started students are a chip, never zero bars');
  const profile = byId['student-profile'];
  assert.equal(profile.mode, 'cohort', 'with no student picked the profile covers every student in view');
  assert.equal(profile.student, null);
  assert.equal(profile.cohort, rows.length);
  assert.ok(profile.topics.every((topic) => topic.pct === Math.round((topic.students / rows.length) * 1000) / 10), 'share of the students in view');
  assert.ok(profile.indicators.every((indicator) => indicator.max === 100));
  assert.equal(byId['topic-strength'].items.find((item) => item.name === 'Graphs').value, 1);
  assert.deepEqual(byId['tough-problems'].items.slice(0, 2).map((item) => [item.name, item.value]), [['Climbing Stairs', 4], ['Course Schedule', 4]], 'most failed attempts first, ties A–Z');
  const profileChart = CHARTS.find((chart) => chart.id === 'student-profile');
  const chosen = profileChart.build({ rows, options: { studentId: 's3' }, range: {}, topics });
  assert.equal(chosen.student.name, 'Chen', 'an admin can pick the student');
  assert.equal(chosen.average.length, chosen.values.length, 'the picked student is compared with the average');
  const outside = profileChart.build({ rows: rows.filter((row) => row.id !== 's3'), options: { studentId: 's3' }, range: {}, topics });
  assert.equal(outside.missing, true, 'a picked student outside the filter is reported, never swapped for another');
  assert.equal(outside.student, null);
  const kpis = Object.fromEntries(buildKpis(rows).map((kpi) => [kpi.id, kpi.value]));
  assert.equal(kpis.active, 2);
  assert.equal(kpis.hard, 1, 'students who solved a Hard problem, not a total of solves');
  assert.equal(kpis.stopped, 2);
  assert.equal(kpis.submissions, rows.reduce((sum, row) => sum + row.coding.submissions, 0), 'submission card uses the actual cohort total');
  const submissions = buildKpis(rows).find((kpi) => kpi.id === 'submissions');
  assert.equal(submissions.accepted, rows.reduce((sum, row) => sum + row.coding.accepted, 0));
  assert.equal(submissions.format, 'ratio');
  assert.deepEqual(buildKpis(rows).map((kpi) => kpi.label), ['Active Users', 'Hard Problem Solvers', 'Inactive Students', 'Flagged Students', 'Accepted / Total Submissions']);
  assert.equal(buildKpis(rows).find((kpi) => kpi.id === 'stopped').hint, '50% of 4 students');
  assert.ok(!('prepScore' in kpis), 'no cohort-average Prep Score');
  assert.equal(attention.items[0].daysSinceActive, 39, 'attention lists carry recency for the chart summary');
});

test('Prep Coding headline trend lines follow each card\'s own rule and end on the card\'s number', () => {
  const day = (iso, attempts, accepted) => [iso, { attempts, accepted }];
  const rows = [
    { days: new Map([day('2026-11-01', 2, 1), day('2026-11-10', 1, 1)]), coding: { firstHardAt: '2026-11-10T05:00:00.000Z', firstFlaggedAt: null } },
    { days: new Map([day('2026-10-05', 4, 0)]), coding: { firstHardAt: null, firstFlaggedAt: '2026-10-05T09:00:00.000Z' } },
    { days: new Map(), coding: { firstHardAt: null, firstFlaggedAt: null } },
  ];
  const range = { preset: 'custom', from: new Date('2026-10-01T00:00:00Z'), to: new Date('2026-11-14T23:59:59Z') };
  const points = seriesPoints(rows, range);
  assert.equal(points.length, 7, 'a 44-day period is drawn weekly');
  assert.equal(points.at(-1), range.to.getTime(), 'the last point is the period end');
  const series = codingKpiSeries(rows, range, range.to);
  const last = (id) => series.get(id).at(-1).value;
  const first = (id) => series.get(id)[0].value;
  assert.equal(last('active'), 1, 'practised in the 14 days up to the end');
  assert.equal(last('stopped'), 2, 'everyone else in view');
  assert.equal(last('hard'), 1);
  assert.equal(last('review'), 1, 'first flagged on 5 Oct');
  assert.equal(last('submissions'), 28.6, '2 accepted of 7 submissions');
  assert.deepEqual([first('active'), first('stopped'), first('hard'), first('review'), first('submissions')], [0, 3, 0, 0, 0], 'nothing had happened by the first point');
  assert.ok(series.get('hard').every((point, index, list) => !index || point.value >= list[index - 1].value), 'cumulative lines never fall');
  // Without a range (the previous-period comparison) the cards carry no line.
  const noLine = buildKpis([{ ...rows[0], coding: { practiceStatus: 'active', solved: { Hard: 1 }, review: { tracked: 0, flagged: 0 }, submissions: 3, accepted: 2 } }]);
  assert.ok(noLine.every((kpi) => !('series' in kpi)));
  const withLine = buildKpis([{ ...rows[0], coding: { ...rows[0].coding, practiceStatus: 'active', solved: { Hard: 1 }, review: { tracked: 0, flagged: 0 }, submissions: 3, accepted: 2 } }], range, range.to);
  for (const kpi of withLine) {
    assert.equal(kpi.series.at(-1).value, kpi.format === 'ratio' ? kpi.rate : kpi.value, `${kpi.id} line ends on the card's number`);
  }
});

test('"Trend of submissions till today": a donut of accepted vs not, each part opens its students', () => {
  const day = (iso, attempts, accepted) => [iso, { attempts, accepted }];
  const person = (id) => ({ id, name: id, email: '', studentId: id, student: {}, scores: { total: 0, features: {} } });
  const rows = [
    { ...person('a'), days: new Map([day('2026-11-02', 3, 1), day('2026-11-05', 2, 2)]), coding: { submissions: 5, accepted: 3, accuracy: 60, daysSinceActive: 1 } },
    { ...person('b'), days: new Map([day('2026-11-05', 4, 0)]), coding: { submissions: 4, accepted: 0, accuracy: 0, daysSinceActive: 1 } },
    { ...person('c'), days: new Map(), coding: { submissions: 0, accepted: 0, accuracy: 0, daysSinceActive: null } },
  ];
  const chart = CHARTS.find((entry) => entry.id === 'submission-trend');
  assert.equal(chart.type, 'donut');
  const data = submissionSplit(rows);
  assert.equal(data.centerLabel, 'submissions');
  assert.deepEqual(data.items.map((item) => [item.key, item.value, item.students]), [['Accepted', 3, 1], ['Not accepted', 6, 2]]);
  const accepted = drillStudents(chart, rows, 'Accepted', {});
  assert.deepEqual(accepted.items.map((item) => [item.row.id, item.values.submissionsHere]), [['a', 3]]);
  const notAccepted = drillStudents(chart, rows, 'Not accepted', {});
  assert.deepEqual(notAccepted.items.map((item) => [item.row.id, item.values.submissionsHere]).sort(), [['a', 2], ['b', 4]]);
  // Links saved while this chart was a day/week line still answer.
  const onDay = drillStudents(chart, rows, '2026-11-05', {});
  assert.deepEqual(onDay.items.map((item) => [item.row.id, item.values.submissionsHere, item.values.acceptedHere, item.values.notAcceptedHere]).sort(), [['a', 2, 2, 0], ['b', 4, 0, 4]]);
  const week = drillStudents(chart, rows, 'week:2026-11-02', {});
  assert.deepEqual(week.items.map((item) => [item.row.id, item.values.submissionsHere]).sort(), [['a', 5], ['b', 4]]);
  assert.deepEqual(submissionSplit([rows[2]]).items, [], 'no submissions: an honest empty chart');
});

test('every feature: five headline cards, each with a line measured like the card at every point', () => {
  const range = { preset: 'custom', from: new Date('2026-11-01T00:00:00Z'), to: new Date('2026-11-10T23:00:00Z') };
  const now = range.to;
  const modules = new Set(['student', 'coding', 'quickprep', 'learning', 'interview', 'assessment']);
  const cards = (area, rows) => Object.fromEntries(buildKpiGroups(area, modules, rows, range, now)[0].kpis.map((kpi) => [kpi.id, kpi]));
  const at = (kpi, day) => kpi.series.find((point) => point.at.startsWith(day)).value;
  const lineEndsOnCard = (kpis) => Object.values(kpis).forEach((kpi) => {
    assert.ok(kpi.series?.length > 1, `${kpi.id} has a line`);
    assert.equal(kpi.series.at(-1).value, kpi.format === 'ratio' ? kpi.rate : kpi.value, `${kpi.id} ends on its card's number`);
  });

  // Learning: Asha completed 1 topic on Nov 2 and 3 more on Nov 9 (4 of 8); Ben never started.
  const learning = cards('learning', [
    { learning: { completedTopics: 4, availableTopics: 8, progress: 50, status: 'active', days: new Map([['2026-11-02', 1], ['2026-11-09', 3]]) } },
    { learning: { completedTopics: 0, availableTopics: 8, progress: 0, status: 'never', days: new Map() } },
  ]);
  assert.deepEqual(Object.keys(learning), ['active', 'topicDone', 'halfway', 'stopped', 'topics']);
  assert.deepEqual([learning.active.value, learning.topicDone.value, learning.halfway.value, learning.stopped.value, learning.topics.rate], [1, 1, 1, 1, 25]);
  lineEndsOnCard(learning);
  assert.deepEqual([at(learning.topicDone, '2026-11-01'), at(learning.topicDone, '2026-11-05')], [0, 1], 'a topic counts from the day it was completed');
  assert.equal(at(learning.halfway, '2026-11-05'), 0, '1 of 8 topics by Nov 5 is not halfway');
  assert.equal(at(learning.topics, '2026-11-05'), 6.3, '1 of 16 topics completed by Nov 5');
  assert.deepEqual([at(learning.active, '2026-11-01'), at(learning.stopped, '2026-11-01')], [0, 2]);

  // Interview: Asha had mocks on Nov 3 (50%) and Nov 8 (90%).
  const interview = cards('interview', [
    { interview: { done: 2, mockDone: 2, mockScore: 70, status: 'active', aiDates: [], days: new Map([['2026-11-03', 1], ['2026-11-08', 1]]), mocks: [{ at: '2026-11-03T10:00:00Z', score: 50 }, { at: '2026-11-08T10:00:00Z', score: 90 }] } },
    { interview: { done: 0, mockDone: 0, mockScore: 0, status: 'never', aiDates: [], days: new Map(), mocks: [] } },
  ]);
  assert.deepEqual(Object.keys(interview), ['students', 'active', 'strong', 'never', 'avgMock']);
  assert.deepEqual([interview.students.value, interview.strong.value, interview.never.value, interview.avgMock.value], [1, 1, 1, 70]);
  lineEndsOnCard(interview);
  assert.deepEqual([at(interview.students, '2026-11-01'), at(interview.never, '2026-11-01')], [0, 2]);
  assert.deepEqual([at(interview.strong, '2026-11-05'), at(interview.avgMock, '2026-11-05')], [0, 50], 'only the 50% mock had happened by Nov 5');

  // Assessment: Asha failed a test on Nov 2, missed one that closed Nov 4, passed one on Nov 7.
  const assessment = cards('assessment', [
    { assessment: { taken: 2, passed: 1, missed: 1, status: 'active', missedDates: ['2026-11-04T00:00:00Z'], days: new Map([['2026-11-02', 1], ['2026-11-07', 1]]),
      byTest: new Map([['t1', { at: '2026-11-02T10:00:00Z', percent: 5 }], ['t2', { at: '2026-11-07T10:00:00Z', percent: 95 }]]) } },
    { assessment: { taken: 0, passed: 0, missed: 0, status: 'never', missedDates: [], days: new Map(), byTest: new Map() } },
  ]);
  assert.deepEqual(Object.keys(assessment), ['students', 'passedStudents', 'missed', 'never', 'passRate']);
  assert.deepEqual([assessment.students.value, assessment.passedStudents.value, assessment.missed.value, assessment.never.value, assessment.passRate.rate], [1, 1, 1, 1, 50]);
  lineEndsOnCard(assessment);
  assert.deepEqual([at(assessment.missed, '2026-11-03'), at(assessment.missed, '2026-11-05')], [0, 1], 'missed from when the test closed');
  assert.deepEqual([at(assessment.passedStudents, '2026-11-05'), at(assessment.passRate, '2026-11-05')], [0, 0]);

  // Quick Prep: Asha started a sheet Nov 2, a solve was flagged Nov 5, she finished Nov 6.
  const quickprep = cards('quickprep', [
    { quickprep: { started: 1, finished: 1, activity: 'active', status: 'finished', days: new Map([['2026-11-02', [1, 0]], ['2026-11-06', [0, 1]]]),
      bySheet: new Map([['s1', { startedAt: '2026-11-02T10:00:00Z', completedAt: '2026-11-06T10:00:00Z', lastViewedAt: '2026-11-09T10:00:00Z', finished: true }]]),
      review: { tracked: 1, flagged: 1, items: [{ at: '2026-11-05T10:00:00Z', review: { reasons: ['fast'] } }] } } },
    { quickprep: { started: 0, finished: 0, activity: 'never', status: 'none', days: new Map(), bySheet: new Map(), review: { tracked: 0, flagged: 0, items: [] } } },
  ]);
  assert.deepEqual(Object.keys(quickprep), ['sheetStarted', 'sheetActive', 'sheetFinished', 'never', 'review']);
  lineEndsOnCard(quickprep);
  assert.deepEqual([at(quickprep.sheetStarted, '2026-11-01'), at(quickprep.never, '2026-11-01')], [0, 2]);
  assert.deepEqual([at(quickprep.review, '2026-11-04'), at(quickprep.review, '2026-11-05'), at(quickprep.sheetFinished, '2026-11-05')], [0, 1, 0]);
});

test('a retired chart is not offered and every layout gets its replacement', async () => {
  const { getPrepAnalysisCatalog } = await import('../src/modules/prepAnalysis/prepAnalysis.controller.js');
  let body;
  const res = { set: () => res, json: (value) => { body = value; return res; } };
  await getPrepAnalysisCatalog({ platformPermissions: undefined }, res);
  assert.ok(!body.charts.some((chart) => chart.id === 'difficulty-split'), 'not in the add-chart list');
  assert.ok(body.charts.some((chart) => chart.id === 'submission-trend'));
  assert.deepEqual(body.replacedCharts, { 'difficulty-split': 'submission-trend' });
  assert.ok(!body.defaultLayout.coding.includes('difficulty-split'));
  assert.ok(body.defaultLayout.coding.includes('submission-trend'), 'the new chart is on the default page');
});

test('Prep Coding default layout: heat map first, then rows that each fill the 12 columns', async () => {
  const { getPrepAnalysisCatalog } = await import('../src/modules/prepAnalysis/prepAnalysis.controller.js');
  let body;
  const res = { set: () => res, json: (value) => { body = value; return res; } };
  await getPrepAnalysisCatalog({ platformPermissions: undefined }, res);
  const coding = body.defaultLayout.coding;
  // Top students runs full width; the skill profile left the page and the submissions donut took
  // its place in the row of three.
  assert.deepEqual(coding.slice(0, 10), ['activity-calendar', 'top-students', 'practice-trend', 'practice-funnel', 'topic-strength',
    'needs-attention', 'tough-problems', 'submission-trend', 'failure-reasons', 'language-usage']);
  assert.ok(!coding.includes('student-profile'));
  assert.equal(body.defaultSizes.coding['top-students'], 'full');
  assert.ok(body.defaultLayoutVersion.coding >= 3, 'saved layouts move to the new default once');
});

test('every feature page: heat map first, and every row of every block fills the 12 columns', async () => {
  const { getPrepAnalysisCatalog } = await import('../src/modules/prepAnalysis/prepAnalysis.controller.js');
  let body;
  const res = { set: () => res, json: (value) => { body = value; return res; } };
  await getPrepAnalysisCatalog({ platformPermissions: undefined }, res);
  const span = { sm: 4, md: 6, lg: 8, full: 12 };
  const chartOf = (id) => body.charts.find((chart) => chart.id === id);
  for (const [area, ids] of Object.entries(body.defaultLayout)) {
    assert.ok(ids.length, `${area} has charts`);
    if (area !== 'all') assert.equal(chartOf(ids[0]).type, 'calendar', `${area}: the heat map leads (above the headline cards)`);
    // The page draws one block per section; leading heat maps sit above the cards, apart.
    const blocks = new Map();
    for (const id of ids) {
      const chart = chartOf(id);
      assert.ok(chart, `${area}: ${id} is offered`);
      if (!blocks.has(chart.section)) blocks.set(chart.section, []);
      blocks.get(chart.section).push(chart);
    }
    for (const [section, charts] of blocks) {
      let filled = 0;
      for (const chart of charts.slice(charts.findIndex((entry) => entry.type !== 'calendar'))) {
        filled += span[body.defaultSizes[area]?.[chart.id] || chart.size];
        assert.ok(filled <= 12, `${area}/${section}: ${chart.id} overflows its row`);
        if (filled === 12) filled = 0;
      }
      assert.equal(filled, 0, `${area}/${section}: the last row is full too`);
    }
    assert.ok(body.defaultLayoutVersion[area] >= (area === 'prepmock' ? 1 : 2), `${area}: saved layouts move to the new default once`);
  }
});

test('topic bubbles: priority by students compared with the most-solved topic', () => {
  // Few different counts (9, 8, 2, 1): one group each, spread over the size/colour levels.
  const few = topicTiers([9, 8, 2, 1, 1, 1, 2]);
  assert.deepEqual(few.map((tier) => [tier.key, tier.label]), [['t0', '9 students'], ['t2', '8 students'], ['t5', '2 students'], ['t7', '1 student']]);
  assert.deepEqual([9, 8, 2, 1].map((students) => topicTier(few, students)), ['t0', 't2', 't5', 't7']);
  assert.deepEqual(topicTierRanges(few, [{ tier: 't7' }, { tier: 't7' }, { tier: 't0' }]).map((tier) => tier.topics), [1, 0, 0, 2]);
  // Many different counts: eight runs, every count in exactly one group.
  const many = topicTiers(Array.from({ length: 40 }, (_, index) => index + 1));
  assert.equal(many.length, 8);
  assert.deepEqual(many.map((tier) => tier.key), ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);
  assert.deepEqual([many[0].high, many[0].low, many[7].high, many[7].low], [40, 36, 5, 1]);
  assert.equal(many[0].label, '36–40 students');
  assert.deepEqual(topicTiers([5]).map((tier) => tier.key), ['t0'], 'a single count is the top group');
  assert.deepEqual(topicTiers([]), []);
  const chart = CHARTS.find((entry) => entry.id === 'topic-strength');
  assert.equal(chart.type, 'bubble');
  assert.equal(chart.options, undefined, 'no top-N limit: every topic someone solves is a bubble');
});

test('"How far students get": exact drops between steps, and each drop lists exactly those students', () => {
  const coding = (submissions, solved) => ({ submissions, solved: { total: solved.E + solved.M + solved.H, Easy: solved.E, Medium: solved.M, Hard: solved.H }, accepted: 0, daysSinceActive: 2 });
  const person = (id) => ({ id, name: id, email: '', studentId: id, student: {}, days: new Map(), scores: { total: 0, features: {} } });
  const rows = [
    { ...person('never'), coding: coding(0, { E: 0, M: 0, H: 0 }) },
    { ...person('tried'), coding: coding(3, { E: 0, M: 0, H: 0 }) },
    { ...person('easy'), coding: coding(4, { E: 2, M: 0, H: 0 }) },
    { ...person('hardOnly'), coding: coding(5, { E: 0, M: 0, H: 1 }) },
    { ...person('all'), coding: coding(9, { E: 1, M: 2, H: 1 }) },
  ];
  const chart = CHARTS.find((entry) => entry.id === 'practice-funnel');
  const data = chart.build({ rows, options: {}, range: {} });
  assert.deepEqual(data.stages.map((stage) => stage.value), [5, 4, 3, 1, 2]);
  assert.deepEqual(data.drops.map((drop) => [drop.key, drop.students]), [['lost:1', 1], ['lost:2', 1], ['lost:3', 2], ['lost:4', 0]],
    'Medium → Hard counts who solved a Medium but not a Hard, not 1 − 2');
  for (const drop of data.drops) {
    const listed = drillStudents(chart, rows, drop.key, {});
    assert.equal(listed.items.length, drop.students, `${drop.key}: the list matches the count`);
  }
  assert.deepEqual(drillStudents(chart, rows, 'lost:1', {}).items.map((item) => item.row.id), ['never']);
  assert.deepEqual(drillStudents(chart, rows, 'lost:3', {}).items.map((item) => item.row.id).sort(), ['easy', 'hardOnly']);
  assert.equal(drillStudents(chart, rows, 'lost:9', {}).items.length, 5, 'an unknown drop falls back to everyone, never an error');
});

test('scatter and box-plot charts: one dot per student, honest quartiles, and a box opens exactly its students', () => {
  assert.deepEqual(boxStats([1, 2, 3, 4, 5]), { count: 5, min: 1, q1: 2, median: 3, q3: 4, max: 5, mean: 3 });
  assert.deepEqual(boxStats([10, 20]), { count: 2, min: 10, q1: 12.5, median: 15, q3: 17.5, max: 20, mean: 15 }, 'quartiles interpolate between neighbours');
  assert.deepEqual(boxStats([]), { count: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0 }, 'no values is zeros, never NaN');
  assert.equal(boxStats([4, Number.NaN, 8]).count, 2, 'non-numbers are ignored');

  const { rows, topics } = cohort();
  const chartOf = (id) => CHARTS.find((chart) => chart.id === id);
  const build = (id) => chartOf(id).build({ rows, options: chartOf(id).options || {}, range: { preset: 'all', to: new Date('2026-10-10') }, topics });
  const practised = practising(rows);

  const map = build('student-map');
  assert.equal(map.items.length, practised.length, 'a dot for every student who practised, none for those who never did');
  assert.equal(map.total, practised.length);
  assert.ok(map.items.every((item) => item.id && item.name && Number.isFinite(item.x) && Number.isFinite(item.y) && ['Practising', 'Stopped'].includes(item.group)));
  assert.equal(map.items[0].y, Math.max(...map.items.map((item) => item.y)), 'highest score first, so a cap keeps the best-scoring dots');

  const spread = build('class-spread');
  assert.equal(spread.groups.reduce((sum, group) => sum + group.students, 0), practised.length, 'every student who practised is in exactly one box');
  for (const group of spread.groups) {
    assert.ok(group.min <= group.q1 && group.q1 <= group.median && group.median <= group.q3 && group.q3 <= group.max, `${group.label}: quartiles are in order`);
    const behind = drillStudents(chartOf('class-spread'), rows, group.label, chartOf('class-spread').options).items;
    assert.equal(behind.length, group.students, `${group.label}: the box opens exactly its students`);
  }
  assert.equal(chartSummary('class-spread', rows, spread).students, practised.length);
  assert.ok(CHARTS.filter((chart) => ['scatter', 'boxplot'].includes(chart.type)).every((chart) => JSON.stringify(chart.build({ rows: [], options: chart.options || {}, range: {}, topics }))), 'both build from nobody');
});

test('a chart\'s full page pages through every item; a card shows its limit', () => {
  const list = Array.from({ length: 250 }, (_, index) => index);
  assert.equal(pageItems(list, { limit: 12 }, { fallback: 10, max: 100 }).items.length, 12);
  assert.equal(pageItems(list, {}, { fallback: 10, max: 100 }).pagination, null);
  const second = pageItems(list, { full: true, page: 2 }, { fallback: 10, max: 100 });
  assert.deepEqual(second.pagination, { page: 2, pages: 3, total: 250, pageSize: 100, offset: 100 });
  assert.equal(second.items[0], 100);
  assert.equal(pageItems(list, { full: true, page: 99 }, { fallback: 10, max: 100 }).pagination.page, 3, 'a page past the end shows the last page');
  assert.equal(pageItems(list, { full: true }, { fallback: 12, max: 100, pageSize: 2000 }).items.length, 250, 'every topic fits on one page');
  assert.equal(pageItems(list, { everything: true }, { fallback: 10, max: 100 }).items.length, 250, 'downloads take every item');
});

test('the students behind each part of a chart add up to what the chart shows', () => {
  const { rows, topics } = cohort();
  const chartOf = (id) => CHARTS.find((chart) => chart.id === id);
  const build = (id, options = {}) => chartOf(id).build({ rows, options: { ...(chartOf(id).options || {}), ...options }, range: { preset: 'all', to: new Date('2026-10-10') }, topics });
  const behind = (id, key) => drillStudents(chartOf(id), rows, key, chartOf(id).options || {}).items;

  for (const item of build('difficulty-split').items) assert.equal(behind('difficulty-split', item.key).length, item.students, `${item.key}: students who solved one`);
  for (const item of build('failure-reasons').items) assert.equal(behind('failure-reasons', item.key).length, item.students, `${item.key}: students with that result`);
  for (const item of build('language-usage').items) assert.equal(behind('language-usage', item.key).length, item.value, `${item.key}: students using it`);
  for (const item of build('topic-strength', { full: true }).items) assert.equal(behind('topic-strength', item.key).length, item.value, `${item.key}: students solving it`);
  for (const bin of build('score-spread').bins) assert.equal(behind('score-spread', bin.key).length, bin.count, `band ${bin.label}`);
  build('practice-funnel').stages.forEach((stage, index) => assert.equal(behind('practice-funnel', String(index)).length, stage.value, stage.name));
  for (const item of build('tough-problems').items) assert.equal(behind('tough-problems', item.key).length, item.students, item.name);
  const trend = build('practice-trend');
  trend.labels.forEach((week, index) => assert.equal(behind('practice-trend', week).length, trend.series[2].values[index], `week ${week}`));
  assert.equal(behind('top-students').length, rows.filter((row) => row.coding.submissions > 0).length, 'everyone who practised, ranked');

  const easy = drillStudents(chartOf('difficulty-split'), rows, 'Easy', {});
  assert.deepEqual(easy.columns.slice(0, 7).map((column) => column.key), ['name', 'studentId', 'semester', 'branch', 'section', 'group', 'prepScore'], 'student details come first');
  assert.ok(easy.items.every((item) => item.values.solvedHere > 0));
  const detail = drillDetail(chartOf('difficulty-split'), rows, 'Easy', {});
  assert.ok(detail.items.length > 0 && detail.items.every((item) => item.values.difficulty === 'Easy'), 'one row per student and Easy problem');
  assert.ok(drillStudents(chartOf('topic-strength'), rows, '', {}).items.length === rows.length, 'the whole chart lists every student in view');

  const summary = chartSummary('difficulty-split', rows, build('difficulty-split'));
  assert.equal(summary.cohort, rows.length);
  assert.equal(summary.students, rows.filter((row) => row.coding.solved.total > 0).length);
  assert.equal(summary.total, 6);
  assert.equal(summary.pct, Math.round((summary.students / rows.length) * 1000) / 10);
});

// The parts a chart shows and how many students each stands for (undefined: the chart counts
// something else there, such as solves or ratings, so only the drill running is checked).
test('Quick Prep rows: activity, open sheets started, and dated starts and finishes for the trend and calendar', () => {
  const { rows, sheets } = learningAndQuickPrep();
  const asha = rows.find((row) => row.name === 'Asha');
  const bilal = rows.find((row) => row.name === 'Bilal');
  assert.equal(asha.quickprep.activity, 'active', 'opened a sheet yesterday');
  assert.equal(bilal.quickprep.activity, 'inactive', 'last opened 39 days ago');
  assert.equal(rows.find((row) => row.name === 'Dev').quickprep.activity, 'never');
  assert.equal(asha.quickprep.coverage, 100, 'semester 5: both sheets open, both started');
  assert.deepEqual([...asha.quickprep.days].sort(), [['2026-09-28', [1, 0]], ['2026-10-08', [1, 1]]]);
  assert.deepEqual(pick(rows, { children: [{ field: 'quickprep.activity', operator: 'anyOf', value: ['inactive'] }] }), ['Bilal']);

  const chartOf = (id) => CHARTS.find((chart) => chart.id === id);
  const trend = chartOf('quickprep-trend').build({ rows, options: {}, range: {}, sheets });
  const sum = (name) => trend.series.find((series) => series.name === name).values.reduce((total, value) => total + value, 0);
  assert.equal(sum('Sheets started'), 3);
  assert.equal(sum('Sheets finished'), 1);
  const byClass = chartOf('quickprep-by-class').build({ rows, options: { groupBy: 'semester' }, range: {}, sheets });
  const counted = byClass.groups.reduce((total, group) => total + Object.values(group.values).reduce((a, b) => a + b, 0), 0);
  assert.equal(counted, rows.length, 'every student sits in exactly one status');

  // A period starting 2026-10-01 keeps only that window's starts and finishes.
  const recent = buildStudentRows({
    students: [{ _id: 's1', name: 'Asha', semester: 5 }], facts: { byStudent: new Map(), days: new Map() }, problems: new Map(),
    quickprep: { sheets, byStudent: new Map([['s1', [{ sheetId: 'q1', solved: 10, total: 10, finished: true, startedAt: new Date('2026-09-28T00:00:00Z'), completedAt: new Date('2026-10-08T00:00:00Z'), lastViewedAt: new Date('2026-10-09T00:00:00Z') }]]]) },
    range: { from: new Date('2026-10-01T00:00:00Z'), to: null }, now: new Date('2026-10-10T00:00:00Z'),
  });
  assert.deepEqual([...recent[0].quickprep.days], [['2026-10-08', [0, 1]]]);
});

test('Quick Prep question-level charts: sheet health, solve rate by difficulty, where students get stuck, pace', async () => {
  const { rows, sheets } = learningAndQuickPrep();
  const build = (id) => CHARTS.find((chart) => chart.id === id).build({ rows, options: { limit: 10 }, range: {}, sheets });

  const health = build('quickprep-sheet-health');
  const essentials = health.categories.findIndex((category) => category.label === 'Placement essentials');
  assert.equal(health.categories[essentials].students, 2, 'Asha and Bilal started it');
  assert.deepEqual(health.bars.map((bar) => bar.values[essentials]), [1, 1], 'one finished, one in progress');
  assert.equal(health.lines[0].values[essentials], 60, 'average progress of the two starters: (100% + 20%) / 2');

  const mix = build('quickprep-difficulty-mix');
  const at = (level) => mix.categories.findIndex((category) => category.key === level);
  // Asha: q1 all 10 + q2 1 of 4 Hard; Bilal: q1 Easy 1 and 2.
  assert.deepEqual([mix.bars[0].values[at('Easy')], mix.bars[1].values[at('Easy')]], [6, 2], 'Easy: Asha 4 + Bilal 2 solved, Bilal has 2 open');
  assert.deepEqual([mix.bars[0].values[at('Hard')], mix.bars[1].values[at('Hard')]], [3, 5], 'Hard: Asha 2 + 1, open: Bilal 2 + Asha 3');
  assert.equal(mix.lines[0].values[at('Hard')], 37.5);

  const stuck = build('quickprep-hardest-questions');
  // q2's questions 2-4: only Asha started q2 and she has not solved them: 0% solved, 1 student stuck.
  assert.deepEqual([stuck.items[0].value, stuck.items[0].students], [0, 1], 'unsolved questions come first, with who is stuck');
  const q1Third = stuck.items.find((item) => item.name === 'q1 question 3');
  assert.deepEqual([q1Third.value, q1Third.students], [50, 1], 'Asha solved it, Bilal (who started q1) did not');

  const pace = build('quickprep-pace');
  assert.equal(pace.bins.reduce((sum, bin) => sum + bin.count, 0), 1, 'only Asha finished a sheet');
  assert.equal(pace.bins[3].count, 1, '28 Sep to 8 Oct: 10 days, the 1–2 weeks band');
  const { FEATURE_DRILLS } = await import('../src/modules/prepAnalysis/featureDrills.js');

  // The rings carry the same solve rates as the old difficulty bars.
  const rings = build('quickprep-difficulty-rings');
  const hard = rings.items.find((item) => item.key === 'Hard');
  assert.deepEqual([hard.value, hard.solved, hard.total], [37.5, 3, 8]);
  assert.deepEqual(rings.items.find((item) => item.key === 'Easy').solved, 6);

  // Sheet bubbles: one per started sheet, sized/grouped by starters, with finish details.
  const bubbles = build('quickprep-sheet-bubbles');
  const placement = bubbles.items.find((item) => item.name === 'Placement essentials');
  assert.equal(placement.value, 2);
  assert.match(placement.detail, /^1 finished · 50% finish rate$/);
  assert.equal(bubbles.tiers[0].key, 't0');
  assert.match(bubbles.tiers[0].label, /started$/);

  // The Sheet journey has plain gap names, and each gap lists exactly its students.
  const journey = build('quickprep-funnel');
  assert.deepEqual(journey.stages.map((stage) => stage.name), ['All students', 'Opened a sheet', 'Solved a question', 'Half of a sheet', 'Finished a sheet']);
  for (const drop of journey.drops) {
    const listed = FEATURE_DRILLS['quickprep-funnel'].students(rows, drop.key, {}, { sheets }).items.length;
    assert.equal(listed, drop.students, `${drop.key}: the list matches the count`);
  }
  assert.equal(FEATURE_DRILLS['quickprep-funnel'].label(journey.drops[0].key), 'Never opened a sheet');
});

test('Quick Prep "only these sheets": every figure is rebuilt from the chosen sheets', async () => {
  const { narrowToSheets, normalizeSheetIds } = await import('../src/modules/prepAnalysis/quickPrepScope.js');
  const { rows, sheets } = learningAndQuickPrep();
  const context = { rows, sheets };
  const onlyGraphs = narrowToSheets(context, ['q2'], { preset: 'all' });
  const asha = onlyGraphs.rows.find((row) => row.name === 'Asha');
  assert.deepEqual([asha.quickprep.started, asha.quickprep.finished, asha.quickprep.solved, asha.quickprep.status], [1, 0, 1, 'inProgress'], 'only Graphs sprint: 1 of 4 solved, not finished');
  assert.equal(onlyGraphs.rows.find((row) => row.name === 'Bilal').quickprep.status, 'none', 'Bilal never started Graphs sprint');
  assert.deepEqual([...onlyGraphs.sheets.keys()], ['q2']);
  assert.equal(narrowToSheets(context, ['q2'], { preset: 'all' }), onlyGraphs, 'the same choice reuses one narrowed copy');
  assert.equal(narrowToSheets(context, ['nope'], { preset: 'all' }), context, 'unknown sheets change nothing');
  assert.equal(rows.find((row) => row.name === 'Asha').quickprep.started, 2, 'the cached cohort rows are untouched');

  const health = CHARTS.find((chart) => chart.id === 'quickprep-sheet-health').build({ rows: onlyGraphs.rows, options: {}, range: {}, sheets: onlyGraphs.sheets });
  assert.deepEqual(health.categories.map((category) => category.label), ['Graphs sprint'], 'charts show only the chosen sheets');

  assert.deepEqual(normalizeSheetIds(['6acc859bcef81f03ebecbe3f', 'bad', '6acc859bcef81f03ebecbe3f']), ['6acc859bcef81f03ebecbe3f']);
  assert.deepEqual(validatePrepAnalysisQuery({ module: 'coding', sheets: ['6acc859bcef81f03ebecbe3f'] }, undefined).sheets, [], 'only the Quick Prep page is limited by sheets');
  assert.deepEqual(validatePrepAnalysisQuery({ module: 'quickprep', sheets: ['6acc859bcef81f03ebecbe3f'] }, undefined).sheets, ['6acc859bcef81f03ebecbe3f']);
});

const STUDENT_STACKS = new Set(['learning-subjects', 'quickprep-sheets', 'quickprep-by-class', 'assessment-tests', 'assessment-scores']);
function partsOf(chart, data) {
  const right = (index) => data.series?.find((series) => series.axis === 'right')?.values?.[index];
  switch (chart.type) {
    case 'donut': return (data.items || []).filter((item) => item.value > 0).map((item) => ({ key: item.key, expected: item.students ?? (data.centerLabel === 'students' ? item.value : undefined) }));
    case 'barList': return [
      ...(data.items || []).filter((item) => item.key).map((item) => ({ key: item.key, expected: item.students ?? (data.valueLabel === 'students solving' ? item.value : undefined) })),
      ...(data.chips || []).map((chip) => ({ key: chip.key, expected: chip.value })),
      { key: '__all__', expected: undefined },
    ];
    case 'histogram': return (data.bins || []).map((bin, index) => ({ key: bin.key ?? String(index), expected: bin.count }));
    case 'funnel': return (data.stages || []).map((stage, index) => ({ key: String(index), expected: stage.value }));
    case 'trend': return (data.labels || []).map((week, index) => ({ key: week, expected: right(index) }));
    case 'combo': return (data.categories || []).flatMap((category, index) => [
      { key: category.key, expected: category.students },
      ...(data.bars || []).map((bar) => ({ key: `${category.key}|${bar.name}`, expected: bar.students ? bar.values[index] : undefined })),
    ]);
    case 'stackedBar': return (data.groups || []).flatMap((group) => [
      { key: group.label, expected: group.students },
      ...(data.series || []).map((series) => ({ key: `${group.label}|${series}`, expected: STUDENT_STACKS.has(chart.id) ? group.values[series] : undefined })),
    ]);
    case 'radar': return (data.topics || []).map((topic) => ({ key: topic.name, expected: topic.students }));
    case 'calendar': return (data.days || []).map(([day]) => ({ key: day }));
    case 'heatmap': return (data.columns || []).map((column) => ({ key: column }));
    case 'rankedStackedBar': return (data.items || []).flatMap((item) => ['Easy', 'Medium', 'Hard'].map((level) => ({ key: `${item.id}|${level}`, expected: item.solved[level] > 0 ? 1 : 0 })));
    default: return [];
  }
}

test('every part of every chart opens exactly the students the chart counts there', () => {
  const coding = cohort();
  const learning = learningAndQuickPrep();
  const tested = interviewsAndTests();
  const fixtures = [
    { rows: coding.rows, context: { topics: coding.topics } },
    { rows: learning.rows, context: { sheets: learning.sheets } },
    { rows: tested.rows, context: { tests: tested.tests } },
  ];
  let checked = 0;
  for (const chart of CHARTS) {
    for (const { rows, context } of fixtures) {
      const data = chart.build({ rows, options: chart.options || {}, range: { preset: 'all', to: new Date('2026-10-10') }, ...context });
      for (const part of partsOf(chart, data)) {
        const students = drillStudents(chart, rows, part.key, chart.options || {}, [], context);
        if (part.expected !== undefined) {
          assert.equal(students.items.length, part.expected, `${chart.id} · ${part.key}`);
          checked += 1;
        }
        assert.doesNotThrow(() => drillDetail(chart, rows, part.key, chart.options || {}, context), `${chart.id} · ${part.key} detail`);
      }
    }
  }
  assert.ok(checked > 60, `checked ${checked} parts with an exact count`);
});

test('KPI changes compare with the previous period of the same length', () => {
  const now = new Date('2026-10-31T00:00:00Z');
  const range = { preset: '30d', from: new Date('2026-10-01T00:00:00Z'), to: null };
  const previous = previousRange(range, now);
  assert.equal(previous.to.getTime(), range.from.getTime() - 1, 'ends just before the period starts');
  assert.equal(range.from.getTime() - previous.from.getTime(), now.getTime() - range.from.getTime(), 'same length');
  assert.equal(previous.label, 'vs the previous 30 days');
  assert.equal(previousRange({ preset: 'all', from: null, to: null }, now), null, 'all time has nothing before it');

  const groups = [{ key: 'coding', kpis: [{ id: 'active', value: 12 }, { id: 'accuracy', value: 61.5, format: 'percent' }, { id: 'new', value: 3 }] }];
  const before = [{ key: 'coding', kpis: [{ id: 'active', value: 8 }, { id: 'accuracy', value: 64, format: 'percent' }, { id: 'new', value: 0 }] }];
  const [coding] = withDeltas(groups, before, 'vs the previous 30 days');
  assert.deepEqual(coding.kpis[0].delta, { previous: 8, change: 4, pct: 50, label: 'vs the previous 30 days' });
  assert.equal(coding.kpis[1].delta.change, -2.5, 'percent KPIs change in points');
  assert.equal(coding.kpis[2].delta.pct, null, 'no % change from zero');
});

test('compare builds every chart and KPI once per group, from that group\'s students only', () => {
  const { rows, topics } = cohort();
  const branch = (value) => ({ type: 'group', join: 'and', children: [{ type: 'rule', field: 'student.branch', operator: 'anyOf', value: [value] }] });
  const query = validatePrepAnalysisQuery({ module: 'coding', charts: [{ id: 'difficulty-split' }, { id: 'top-students' }], compare: [{ label: 'CSE', filter: branch('CSE') }, { label: 'ECE', filter: branch('ECE') }] });
  assert.equal(query.group, null);
  assert.throws(() => validatePrepAnalysisQuery({ module: 'coding', compare: [{ label: 'only one' }] }), /exactly two/);
  const [cse, ece] = compareGroups(query, rows, { topics });
  assert.deepEqual([cse.label, cse.matched, ece.label, ece.matched], ['CSE', 3, 'ECE', 1]);
  const split = (side) => side.charts.find((chart) => chart.id === 'difficulty-split');
  const total = (side) => split(side).data.items.reduce((sum, item) => sum + item.value, 0);
  const all = CHARTS.find((chart) => chart.id === 'difficulty-split').build({ rows, options: {}, range: {} }).items.reduce((sum, item) => sum + item.value, 0);
  assert.equal(total(cse) + total(ece), all, 'the two branches add up to everyone (every student has one of them)');
  assert.equal(split(ece).summary.cohort, 1);
  assert.ok(cse.kpiGroups.length && ece.kpiGroups.length, 'each group has its own headline numbers');
  assert.equal(validatePrepAnalysisQuery({ module: 'coding', compare: query.compare, group: 1 }).group, 1, 'a drill can be about one side');
});

test('"only these students" narrows the page to the students behind one part', () => {
  const { rows, topics } = cohort();
  const query = validatePrepAnalysisQuery({ module: 'coding', focus: { chartId: 'difficulty-split', key: 'Hard', label: 'Hard' } });
  assert.equal(query.focus.chartId, 'difficulty-split');
  assert.throws(() => validatePrepAnalysisQuery({ module: 'coding', focus: { chartId: 'nope', key: 'x' } }), /Unknown chart/);
  const chart = CHARTS.find((entry) => entry.id === 'difficulty-split');
  const hard = drillStudents(chart, rows, 'Hard', {}, [], { topics }).items.map((item) => item.row.name);
  assert.deepEqual(hard, ['Asha'], 'the fixture has one Hard solver');
});

test('a student\'s full report lists every topic, problem and day, as Excel and PDF', async () => {
  const { rows } = cohort();
  const row = rows.find((entry) => entry.name === 'Bilal');
  const range = { preset: 'all', from: null, to: null };
  const profile = buildStudentProfile(row, { range, modules: new Set(['coding']) });
  const times = new Map([['p1', { firstAt: new Date('2026-10-01'), firstAcceptedAt: new Date('2026-10-02'), lastAt: new Date('2026-10-02') }]]);
  const report = buildStudentReport({ row, profile, times, range });
  assert.deepEqual(report.sections.map((section) => section.title), ['Profile', 'Prep Score', 'Prep Coding', 'Topics', 'Problems', 'Daily practice']);
  const problems = report.sections.find((section) => section.title === 'Problems');
  assert.equal(problems.rows.length, 3, 'every problem the student tried');
  assert.equal(problems.rows[0][0], 'Course Schedule', 'unsolved problems come first');
  const twoSum = problems.rows.find((values) => values[0] === 'Two Sum');
  assert.deepEqual(twoSum.slice(-3), ['2026-10-01', '2026-10-02', '2026-10-02'], 'first try, first solve, last try');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderStudentReportXlsx(report));
  assert.equal(workbook.worksheets.length, report.sections.length);
  const pdf = await renderStudentReportPdf(report);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
});

test('a chart download has a summary, the chart\'s numbers, its students and the per-problem detail', async () => {
  const { rows, topics } = cohort();
  const chart = CHARTS.find((entry) => entry.id === 'difficulty-split');
  const data = chart.build({ rows, options: { everything: true }, range: {}, topics });
  const students = drillStudents(chart, rows, 'Easy', {});
  const book = buildChartBook({
    chart, partLabel: 'Easy problems', data, summary: chartSummary(chart.id, rows, data), students, detail: drillDetail(chart, rows, 'Easy', {}),
    query: { module: 'coding', range: { preset: 'all' } }, filters: ['Branch is CSE'], cohortSize: 10,
  });
  assert.equal(book.students.rows.length, students.items.length);
  assert.ok(book.figures.some(([label]) => label.startsWith('Students who solved')));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await renderChartXlsx(book));
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ['Summary', 'Chart data', 'Students', 'Detail']);
  assert.equal(workbook.getWorksheet('Chart data').rowCount, 1 + data.items.length);
  const csv = renderChartCsv(book).toString('utf8');
  assert.match(csv, /Branch is CSE/);
  assert.match(csv, /Easy solved/);
  // PDF: the same students, as a real PDF document.
  const pdf = await renderChartPdf(book);
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
  assert.ok(pdf.length > 1500);
  assert.deepEqual(validateChartExportOptions({ format: 'pdf' }).format, 'pdf');
});

function interviewsAndTests() {
  const tests = new Map([
    ['t1', { id: 't1', title: 'Mid term', type: 'mixed', visible: true, ended: true, startTime: new Date('2026-09-01'), forEveryone: true, assigned: new Set() }],
    ['t2', { id: 't2', title: 'Quiz 2', type: 'mcq', visible: true, ended: true, startTime: new Date('2026-09-15'), forEveryone: false, assigned: new Set(['s1', 's2']) }],
    ['t3', { id: 't3', title: 'Finals', type: 'mixed', visible: true, ended: false, startTime: new Date('2026-11-01'), forEveryone: true, assigned: new Set() }],
  ]);
  const attempt = (testId, percent, at, status = 'submitted') => ({ testId, status, percent, score: percent / 2, maxMarks: 50, minutes: 20, at: new Date(at) });
  const assessment = {
    tests,
    byStudent: new Map([
      ['s1', [attempt('t1', 80, '2026-10-01'), attempt('t2', 30, '2026-10-05')]],
      // An expired attempt counts in the admin's test lists but not in the Prep Score (the student's dashboard ignores it too).
      ['s2', [attempt('t1', 35, '2026-09-20', 'expired')]],
    ]),
  };
  const ratings = (value) => ({ communication: value, problemSolving: value, preparedness: value, attitude: value, integrity: value });
  const interview = {
    byStudent: new Map([
      ['s1', { received: [{ score: 80, at: new Date('2026-10-02'), ratings: ratings(4) }, { score: 60, at: new Date('2026-10-06'), ratings: ratings(3) }], given: 1, scheduled: 1, aiStarted: 2, aiCompleted: 1, aiDays: [new Date('2026-10-07')] }],
      ['s2', { received: [], given: 2, scheduled: 0, aiStarted: 1, aiCompleted: 0, aiDays: [] }],
    ]),
  };
  const base = cohort();
  const students = base.rows.map((row) => ({ _id: row.id, name: row.name, email: row.email, studentId: row.studentId, semester: row.student.semester }));
  const rows = buildStudentRows({ students, facts: { byStudent: new Map(), days: new Map() }, problems: new Map(), assessment, interview, now: new Date('2026-10-10T00:00:00Z') });
  return { rows, tests };
}

test('Prep Assessment: each student\'s own tests, scores, passes and missed tests', () => {
  const { rows, tests } = interviewsAndTests();
  const byName = (name) => rows.find((row) => row.name === name);
  assert.deepEqual(
    ['taken', 'passed', 'failed', 'missed', 'averageScore', 'bestScore', 'lastScore', 'passRate'].map((key) => byName('Asha').assessment[key]),
    [2, 1, 1, 0, 55, 80, 30, 50],
  );
  assert.deepEqual(byName('Bilal').assessment.missedIds, ['t2'], 'an assigned test that is over and not taken is missed');
  assert.deepEqual(byName('Bilal').assessment.assignedIds.sort(), ['t1', 't2', 't3'], 'assigned tests include active tests and tests not yet attempted');
  assert.deepEqual(byName('Chen').assessment.missedIds, ['t1'], 'tests for everyone count, unfinished tests do not');
  assert.equal(byName('Chen').assessment.status, 'never');
  assert.deepEqual(pick(rows, { children: [{ field: 'assessment.missed', operator: 'gte', value: 1 }] }).sort(), ['Bilal', 'Chen', 'Dev']);
  assert.deepEqual(pick(rows, { children: [{ field: 'assessment.averageScore', operator: 'gte', value: 50, qualifiers: { tests: ['t1'] } }] }), ['Asha'], 'narrowed to one test');
  assert.deepEqual(pick(rows, { children: [{ field: 'assessment.passedTests', operator: 'anyOf', value: ['t1'] }] }), ['Asha']);
  assert.deepEqual(pick(rows, { children: [{ field: 'assessment.assignedTests', operator: 'anyOf', value: ['t2'] }] }).sort(), ['Asha', 'Bilal']);
  const results = CHARTS.find((chart) => chart.id === 'assessment-tests').build({ rows, options: {}, range: {}, tests });
  assert.deepEqual(results.groups.find((group) => group.label === 'Mid term').values, { Passed: 1, Failed: 1, Missed: 2 });
  const scores = CHARTS.find((chart) => chart.id === 'assessment-scores').build({ rows, options: {}, range: {}, tests });
  assert.deepEqual(scores.groups.map((group) => group.label), ['Quiz 2', 'Mid term'], 'every conducted test, newest first');
  assert.deepEqual(scores.groups[1].values, { 'Below 40%': 1, '40–60%': 0, '60–80%': 0, '80–100%': 1, Missed: 2 });
  const byClass = CHARTS.find((chart) => chart.id === 'assessment-by-class').build({ rows, options: { groupBy: 'semester' }, range: {} });
  assert.deepEqual(byClass.groups.find((group) => group.label === 'Sem 5').values, { Passed: 1, Failed: 2, Missed: 1 });
  const kpis = Object.fromEntries(buildKpiGroups('assessment', new Set(['student', 'assessment']), rows)[0].kpis.map((kpi) => [kpi.id, kpi.value]));
  assert.deepEqual([kpis.students, kpis.passedStudents, kpis.missed, kpis.never], [2, 1, 3, 2], 'counts of students the admin can act on');
});

test('Prep Interview: mock interviews out of 100, ratings, interviewer turns and AI interviews', () => {
  assert.equal(mockScore({ marks: 20, totalMarks: 20 }), 80, 'detailed feedback is out of 25');
  assert.equal(mockScore({ marks: 75 }), 75, 'older feedback is already out of 100');
  assert.equal(mockScore({ marks: 20, communication: 4, problemSolving: 4, preparedness: 4, attitude: 4, integrity: 4 }), 80);
  const { rows } = interviewsAndTests();
  const asha = rows.find((row) => row.name === 'Asha');
  assert.deepEqual(['done', 'mockDone', 'mockScore', 'bestMockScore', 'lastMockScore', 'given', 'scheduled', 'aiCompleted'].map((key) => asha.interview[key]), [3, 2, 70, 80, 60, 1, 1, 1]);
  assert.equal(asha.interview.ratings.communication, 3.5);
  assert.equal(rows.find((row) => row.name === 'Bilal').interview.status, 'never', 'only interviewing others is not being interviewed');
  assert.deepEqual(pick(rows, { children: [{ field: 'interview.communication', operator: 'gte', value: 3 }] }), ['Asha']);
  assert.deepEqual(pick(rows, null, { cuts: [{ metric: 'interview.given', direction: 'top', unit: 'count', value: 1 }] }), ['Bilal']);
  const skills = CHARTS.find((chart) => chart.id === 'interview-ratings').build({ rows, options: {}, range: {} });
  assert.deepEqual(skills.groups[0].values, { 'Rated 1': 0, 'Rated 2': 0, 'Rated 3': 1, 'Rated 4': 1, 'Rated 5': 0 });
  const trend = CHARTS.find((chart) => chart.id === 'interview-trend').build({ rows, options: {}, range: {} });
  assert.deepEqual(trend.series.slice(0, 2).map((series) => series.values.reduce((sum, value) => sum + value, 0)), [2, 1], 'mock and AI interviews counted apart');
  const range = { preset: 'all', from: null, to: new Date('2026-10-10T00:00:00Z') };
  const profile = buildStudentProfile(asha, { range, modules: new Set(['student', 'interview', 'assessment']), tests: interviewsAndTests().tests });
  assert.deepEqual(profile.assessment.tests.map((test) => [test.title, test.percent, test.passed]), [['Quiz 2', 30, false], ['Mid term', 80, true]]);
  assert.deepEqual(profile.interview.mocks.map((mock) => mock.score), [60, 80], 'latest first');
  assert.equal(profile.coding, null, 'no coding without the licence');
});

test('stored module scores drive Prep Score filters and rank cuts on analysis rows', () => {
  const { rows } = interviewsAndTests();
  const stored = new Map([[rows.find((row) => row.name === 'Asha').id, {
    total: 2.71,
    modules: { coding: { score: 2.71, counts: { Easy: 0, Medium: 1, Hard: 0 } }, interview: { score: 4.39, counts: { Easy: 0, Medium: 3, Hard: 0 } }, assessment: { score: 3.73, counts: { Easy: 0, Medium: 2, Hard: 0 } }, learning: { score: 1, counts: {} } },
  }]]);
  attachStoredScores(rows, stored, { features: { coding: true, interview: true, assessment: true, learning: false } });
  const asha = rows.find((row) => row.name === 'Asha');
  assert.equal(asha.scores.features.interview.score, 4.39);
  assert.equal(asha.scores.features.learning, undefined, 'a module that is not licensed is not shown');
  assert.equal(asha.scores.total, 2.71, 'Prep Score is the stored coding score, exactly what the student sees');
  assert.equal(asha.scores.total, asha.coding.prepScore);
  const { rows: codingRows } = cohort();
  const coder = codingRows.find((row) => row.name === 'Asha');
  assert.equal(coder.scores.features.coding.score, coder.coding.prepScore, 'Prep Coding uses the same formula on both sides');
  assert.ok(codingRows.every((row) => row.scores.total >= 0), 'never negative');
  assert.deepEqual(pick(codingRows, null, { cuts: [{ metric: 'student.prepScore', direction: 'top', unit: 'count', value: 1 }] }), ['Asha']);
  assert.deepEqual(pick(rows, { children: [{ field: 'interview.prepScore', operator: 'gte', value: 4 }] }), ['Asha']);
});

test('a student profile shows only that student\'s own work, per licensed area', () => {
  const { rows } = cohort();
  const range = { preset: 'all', from: null, to: new Date('2026-10-10T00:00:00Z') };
  const asha = buildStudentProfile(rows.find((row) => row.name === 'Asha'), { range, modules: new Set(['student', 'coding']) });
  assert.equal(asha.student.name, 'Asha');
  assert.equal(asha.student.coordinators, undefined, 'internal ids stay on the server');
  assert.deepEqual(asha.coding.solved, { Easy: 1, Medium: 1, Hard: 1, total: 3 });
  assert.deepEqual(asha.coding.points, { Easy: 1, Medium: 2, Hard: 4 }, 'one solve of each difficulty at the configured points');
  assert.deepEqual(asha.coding.topics.map((topic) => [topic.name, topic.solved, topic.attempted]), [['Graphs', 2, 2], ['Arrays', 1, 1]]);
  assert.deepEqual(asha.coding.verdicts.map((verdict) => [verdict.name, verdict.value]), [['Accepted', 3], ['Wrong answer', 3]]);
  assert.deepEqual(asha.coding.calendar.days, [['2026-10-01', 3], ['2026-10-05', 3]]);
  assert.equal(asha.learning, null, 'no learning section without the licence');
  assert.ok(!('average' in asha.coding) && !('position' in asha.coding), 'never compared with other students');

  const bilal = buildStudentProfile(rows.find((row) => row.name === 'Bilal'), { range, modules: new Set(['student', 'coding']) });
  assert.deepEqual(bilal.coding.unsolved, [{ title: 'Course Schedule', difficulty: 'Medium', attempts: 3 }], 'tried but not solved yet');
  assert.equal(bilal.coding.languages[0].language, 'python');

  const extra = learningAndQuickPrep();
  const withAreas = buildStudentProfile(extra.rows.find((row) => row.name === 'Asha'), { range, modules: new Set(['student', 'coding', 'quickprep', 'learning']), sheets: extra.sheets });
  assert.deepEqual(withAreas.quickprep.sheets.map((sheet) => [sheet.title, sheet.progress, sheet.finished]), [['Placement essentials', 100, true], ['Graphs sprint', 25, false]]);
  assert.deepEqual(withAreas.quickprep.notStarted, []);
  assert.deepEqual(withAreas.learning.subjects.map((subject) => [subject.name, subject.completed, subject.total]), [['DSA', 4, 4], ['Operating Systems', 1, 4], ['DBMS', 0, 2]]);
  const bilalSheets = buildStudentProfile(extra.rows.find((row) => row.name === 'Bilal'), { range, modules: new Set(['student', 'coding', 'quickprep']), sheets: extra.sheets });
  assert.equal(buildStudentProfile(extra.rows.find((row) => row.name === 'Bilal'), { range, modules: new Set(['student', 'coding']), sheets: extra.sheets }).quickprep, null, 'no Quick Prep module, no Quick Prep section');
  assert.deepEqual(bilalSheets.quickprep.notStarted, ['Graphs sprint'], 'sheets open to the student but not started');
});

test('every heat map says how many students did anything on the days it shows', () => {
  const data = { from: '2026-01-01', to: '2026-12-31' };
  const rows = [
    { quickprep: { days: new Map([['2026-03-01', [1, 0]]]) }, learning: { days: new Map([['2025-06-01', 2]]) } },
    { quickprep: { days: new Map([['2026-04-01', [0, 0]]]) }, learning: { days: new Map([['2026-05-01', 1]]) } },
    { quickprep: null, learning: null },
  ];
  assert.deepEqual([chartSummary('quickprep-calendar', rows, data).students, chartSummary('quickprep-calendar', rows, data).cohort], [1, 3]);
  assert.equal(chartSummary('learning-calendar', rows, data).students, 1, 'days outside the map do not count');
  assert.equal(chartSummary('assessment-calendar', rows, data).students, 0);
});
