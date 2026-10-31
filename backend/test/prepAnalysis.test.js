import assert from 'node:assert/strict';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { buildKpiGroups, buildKpis, CHARTS, pageItems } from '../src/modules/prepAnalysis/charts.js';
import { drillDetail, drillStudents } from '../src/modules/prepAnalysis/drill.js';
import { chartSummary } from '../src/modules/prepAnalysis/summaries.js';
import { buildChartBook, renderChartCsv, renderChartXlsx } from '../src/modules/prepAnalysis/prepAnalysis.export.js';
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

const ALL_MODULES = { allowedModules: new Set(['student', 'coding', 'learning', 'interview', 'assessment']) };

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
  assert.equal(rows[0].coding.prepScore, 8.09);
  assert.deepEqual(rows[0].coding.points, { Easy: 1, Medium: 6, Hard: 8 }, 'work split by configured points');
  assert.equal(rows[0].scores.total, 9.5);
  assert.equal(rows[0].scores.features.learning, undefined, 'an unlicensed module is not shown');
  assert.deepEqual(rows[1].scores, { total: 0, features: {} }, 'no stored row yet means 0');
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
  assert.deepEqual(publicFieldCatalog(undefined).areas.map((area) => area.key), ['all', 'coding', 'learning', 'interview', 'assessment'], 'Quick Prep lives inside Prep Coding');
  assert.deepEqual(publicFieldCatalog({ events: true }).areas.map((area) => area.key), ['interview'], 'mock interviews alone turn on Prep Interview');
  assert.deepEqual(publicFieldCatalog({ interviews: true, assessments: true }).areas.map((area) => area.key), ['all', 'interview', 'assessment']);
  assert.ok(publicFieldCatalog(undefined).fields.filter((field) => field.key.startsWith('quickprep.')).every((field) => field.module === 'coding' && field.group === 'Quick Prep sheets'));
  assert.throws(() => validatePrepAnalysisQuery({ module: 'quickprep' }, undefined), /Unknown analysis area/);
  assert.throws(() => validatePrepAnalysisQuery({ module: 'coding' }, { questions: false, learning: true }), /not enabled/);
  assert.ok(validatePrepAnalysisQuery({ module: 'coding' }, undefined).charts.some((chart) => chart.id === 'quickprep-sheets'), 'Prep Coding includes the Quick Prep sheet charts');
  const all = validatePrepAnalysisQuery({ module: 'all' }, { questions: false, learning: true });
  assert.ok(all.charts.every((chart) => chart.id.startsWith('learning-')), '"All" drops charts of unlicensed areas');
  assert.ok(catalog.fields.every((field) => !('get' in field)), 'server getters never leave the API');
  assert.throws(() => validatePrepAnalysisQuery({ module: 'coding' }, { questions: false }), /not enabled/);
  const query = validatePrepAnalysisQuery({}, undefined);
  assert.equal(query.module, 'coding');
  assert.ok(query.charts.length >= 10, 'the default layout is used');
  assert.throws(() => validatePrepAnalysisQuery({ charts: [{ id: 'not-a-chart' }] }, undefined), /Unknown chart/);
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
  const sheets = new Map([
    ['q1', { id: 'q1', title: 'Placement essentials', semesters: [], published: true, items: 10 }],
    ['q2', { id: 'q2', title: 'Graphs sprint', semesters: [5], published: true, items: 4 }],
  ]);
  const quickprep = {
    sheets,
    byStudent: new Map([
      ['s1', [{ sheetId: 'q1', solved: 10, total: 10, finished: true, lastViewedAt: new Date('2026-10-09T00:00:00Z') }, { sheetId: 'q2', solved: 1, total: 4, finished: false, lastViewedAt: new Date('2026-10-09T00:00:00Z') }]],
      ['s2', [{ sheetId: 'q1', solved: 2, total: 10, finished: false, lastViewedAt: new Date('2026-09-01T00:00:00Z') }]],
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
  const groups = buildKpiGroups('all', new Set(['student', 'coding', 'learning']), rows);
  const kpis = Object.fromEntries(groups.map((group) => [group.key, Object.fromEntries(group.kpis.map((kpi) => [kpi.id, kpi.value]))]));
  assert.deepEqual(groups.map((group) => group.label), ['Prep Coding', 'Prep Learning'], '"All" shows each feature side by side');
  assert.deepEqual(buildKpiGroups('coding', new Set(['student', 'coding']), rows).map((group) => group.key), ['coding'], 'Quick Prep is part of Prep Coding, not its own section');
  assert.equal(kpis.learning.subjectDone, 1, 'only Asha finished a subject');
  assert.ok(groups.every((group) => group.kpis.length <= 5), 'a few useful numbers per feature, one row');
  assert.equal(kpis.coding.sheetFinished, 1, 'Quick Prep numbers sit among the Prep Coding numbers');
  assert.equal(kpis.coding.sheetStarted, 2);
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
  assert.equal(buildKpis(rows).find((kpi) => kpi.id === 'stopped').hint, '50% of 4 students');
  assert.ok(!('prepScore' in kpis), 'no cohort-average Prep Score');
  assert.equal(attention.items[0].daysSinceActive, 39, 'attention lists carry recency for the chart summary');
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
  assert.deepEqual(easy.columns.slice(0, 6).map((column) => column.key), ['name', 'studentId', 'semester', 'branch', 'group', 'prepScore'], 'student details come first');
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
const STUDENT_STACKS = new Set(['learning-subjects', 'quickprep-sheets', 'assessment-tests', 'assessment-scores']);
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
    modules: { interview: { score: 4.39, counts: { Easy: 0, Medium: 3, Hard: 0 } }, assessment: { score: 3.73, counts: { Easy: 0, Medium: 2, Hard: 0 } }, learning: { score: 1, counts: {} } },
  }]]);
  attachStoredScores(rows, stored, { features: { coding: true, interview: true, assessment: true, learning: false } });
  const asha = rows.find((row) => row.name === 'Asha');
  assert.equal(asha.scores.features.interview.score, 4.39);
  assert.equal(asha.scores.features.learning, undefined, 'a module that is not licensed is not shown');
  assert.equal(asha.scores.total, 2.71, 'the overall score is the stored one, exactly what the student sees');
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
  const withAreas = buildStudentProfile(extra.rows.find((row) => row.name === 'Asha'), { range, modules: new Set(['student', 'coding', 'learning']), sheets: extra.sheets });
  assert.deepEqual(withAreas.quickprep.sheets.map((sheet) => [sheet.title, sheet.progress, sheet.finished]), [['Placement essentials', 100, true], ['Graphs sprint', 25, false]]);
  assert.deepEqual(withAreas.quickprep.notStarted, []);
  assert.deepEqual(withAreas.learning.subjects.map((subject) => [subject.name, subject.completed, subject.total]), [['DSA', 4, 4], ['Operating Systems', 1, 4], ['DBMS', 0, 2]]);
  const bilalSheets = buildStudentProfile(extra.rows.find((row) => row.name === 'Bilal'), { range, modules: new Set(['student', 'coding']), sheets: extra.sheets });
  assert.deepEqual(bilalSheets.quickprep.notStarted, ['Graphs sprint'], 'sheets open to the student but not started');
});
