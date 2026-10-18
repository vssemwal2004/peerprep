// Every filterable field of Prep Analysis, named for people who are not
// programmers. A field belongs to one module; a university that has not licensed
// the module never sees its fields, charts or data. `get(row, qualifiers)` reads
// the value from a per-student row built by studentRows.js and stays on the
// server (publicFieldCatalog strips it).

import { SUPPORTED_LANGUAGES } from '../../models/Problem.js';
import { DIFFICULTIES } from './prepScore.js';
import { PASS_PERCENT } from './assessmentFacts.js';
import { RATINGS } from './interviewFacts.js';
import {
  INACTIVE_AFTER_DAYS, qualifiedAssessmentMetric, qualifiedCodingMetric, qualifiedLearningMetric, qualifiedQuickPrepMetric,
} from './studentRows.js';

// Module -> university policy permission key. 'student' is always available.
// Every module except 'student' is also an analysis area the admin can pick.
// Quick Prep sheets are part of Prep Coding (same licence, same area).
// A module with several permission keys is on when any of them is on (Prep
// Interview covers mock interviews, licensed as "events", and AI interviews).
export const MODULES = Object.freeze({
  student: { label: 'Student details', permission: null },
  coding: { label: 'Prep Coding', permission: 'questions' },
  learning: { label: 'Prep Learning', permission: 'learning' },
  interview: { label: 'Prep Interview', permission: ['events', 'interviews'] },
  assessment: { label: 'Prep Assessment', permission: 'assessments' },
});

// Which module each "Only count" set belongs to.
const QUALIFIER_MODULE = Object.freeze({ coding: 'coding', quickprep: 'coding', learning: 'learning', assessment: 'assessment' });

export const KIND_OPERATORS = Object.freeze({
  enum: ['anyOf', 'noneOf', 'is', 'isNot'],
  set: ['anyOf', 'allOf', 'noneOf'],
  text: ['contains', 'notContains', 'equals', 'startsWith'],
  number: ['gte', 'lte', 'eq', 'between', 'gt', 'lt', 'neq'],
  percent: ['gte', 'lte', 'between', 'eq', 'gt', 'lt', 'neq'],
});

// "Only count" options: narrow a coding count to matching problems/submissions,
// e.g. "problems solved, only counting Graphs in C++".
export const CODING_QUALIFIERS = Object.freeze({
  difficulties: { label: 'Difficulty', options: 'difficulties' },
  topics: { label: 'Topic', options: 'topics' },
  languages: { label: 'Language', options: 'languages' },
  companies: { label: 'Company', options: 'companies' },
  tags: { label: 'Tag', options: 'tags' },
});

// field.qualifiers names one of these sets.
export const QUALIFIER_SETS = Object.freeze({
  coding: CODING_QUALIFIERS,
  learning: { subjects: { label: 'Subject', options: 'subjects' } },
  quickprep: { sheets: { label: 'Sheet', options: 'sheets' } },
  assessment: { tests: { label: 'Test', options: 'tests' } },
});

const codingMetric = (metric, fixed) => (row, qualifiers) => qualifiedCodingMetric(row, metric, fixed ? { ...(qualifiers || {}), ...fixed } : qualifiers);
const learningMetric = (metric) => (row, qualifiers) => qualifiedLearningMetric(row, metric, qualifiers);
const quickPrepMetric = (metric) => (row, qualifiers) => qualifiedQuickPrepMetric(row, metric, qualifiers);
const assessmentMetric = (metric) => (row, qualifiers) => qualifiedAssessmentMetric(row, metric, qualifiers);
const interviewRating = (key) => (row) => (row.interview?.ratings[key] || null);

const FIELD_LIST = [
  // ---- Student details
  { key: 'student.semester', module: 'student', group: 'Class', label: 'Semester', kind: 'enum', valueType: 'number', options: 'semesters', quick: true, get: (row) => row.student.semester },
  { key: 'student.course', module: 'student', group: 'Class', label: 'Course', kind: 'enum', options: 'courses', quick: true, get: (row) => row.student.course },
  { key: 'student.branch', module: 'student', group: 'Class', label: 'Branch', kind: 'enum', options: 'branches', quick: true, get: (row) => row.student.branch },
  { key: 'student.college', module: 'student', group: 'Class', label: 'College / University', kind: 'enum', options: 'colleges', quick: true, get: (row) => row.student.college },
  { key: 'student.group', module: 'student', group: 'Class', label: 'Group / Section', kind: 'enum', options: 'groups', quick: true, get: (row) => row.student.group },
  { key: 'student.coordinator', module: 'student', group: 'Mentors and lists', label: 'Coordinator', kind: 'set', options: 'coordinators', quick: true, get: (row) => row.student.coordinators },
  { key: 'student.batch', module: 'student', group: 'Mentors and lists', label: 'Uploaded student list', kind: 'set', options: 'batches', quick: true, get: (row) => row.student.batches },
  { key: 'student.status', module: 'student', group: 'Account', label: 'Account', kind: 'enum', options: 'statuses', get: (row) => row.student.status },
  { key: 'student.search', module: 'student', group: 'Account', label: 'Name, email or student ID', kind: 'text', get: (row) => `${row.name} ${row.email} ${row.studentId}` },

  // ---- Prep Score (0-100, same formula the student sees; the overall score averages the licensed features).
  // Prep Coding's score is coding.prepScore and Prep Learning's is learning.progress.
  { key: 'student.prepScore', module: 'student', group: 'Prep Score', label: 'Prep Score (overall)', kind: 'number', unit: '/ 100', rankable: true, get: (row) => row.scores?.total ?? 0 },
  { key: 'interview.prepScore', module: 'interview', group: 'Prep Score', label: 'Prep Interview score', kind: 'number', unit: '/ 100', rankable: true, get: (row) => row.scores?.features.interview?.score ?? 0 },
  { key: 'assessment.prepScore', module: 'assessment', group: 'Prep Score', label: 'Prep Assessment score', kind: 'number', unit: '/ 100', rankable: true, get: (row) => row.scores?.features.assessment?.score ?? 0 },

  // ---- Prep Coding: activity
  { key: 'coding.practiceStatus', module: 'coding', group: 'Practice', label: 'Practice status', kind: 'enum', options: 'practiceStatuses', quick: true, get: (row) => row.coding.practiceStatus },
  { key: 'coding.languages', module: 'coding', group: 'Practice', label: 'Programming language used', kind: 'set', options: 'languages', quick: true, get: (row) => row.coding.languages },
  { key: 'coding.solvedTopics', module: 'coding', group: 'Practice', label: 'Topic solved', kind: 'set', options: 'topics', quick: true, get: (row) => row.coding.solvedTopics },
  { key: 'coding.solvedTags', module: 'coding', group: 'Practice', label: 'Tag solved', kind: 'set', options: 'tags', get: (row) => row.coding.solvedTags },
  { key: 'coding.daysSinceActive', module: 'coding', group: 'Practice', label: 'Days since last practice', kind: 'number', unit: 'days', get: (row) => row.coding.daysSinceActive },
  { key: 'coding.activeDays', module: 'coding', group: 'Practice', label: 'Days practised', kind: 'number', unit: 'days', rankable: true, get: (row) => row.coding.activeDays },

  // ---- Prep Coding: results
  { key: 'coding.prepScore', module: 'coding', group: 'Results', label: 'Prep Score', kind: 'number', unit: '/ 100', rankable: true, get: (row) => row.coding.prepScore },
  { key: 'coding.solved', module: 'coding', group: 'Results', label: 'Problems solved', kind: 'number', qualifiers: 'coding', rankable: true, get: codingMetric('solved') },
  { key: 'coding.solvedEasy', module: 'coding', group: 'Results', label: 'Easy problems solved', kind: 'number', qualifiers: 'coding', rankable: true, get: codingMetric('solved', { difficulties: ['Easy'] }) },
  { key: 'coding.solvedMedium', module: 'coding', group: 'Results', label: 'Medium problems solved', kind: 'number', qualifiers: 'coding', rankable: true, get: codingMetric('solved', { difficulties: ['Medium'] }) },
  { key: 'coding.solvedHard', module: 'coding', group: 'Results', label: 'Hard problems solved', kind: 'number', qualifiers: 'coding', rankable: true, get: codingMetric('solved', { difficulties: ['Hard'] }) },
  { key: 'coding.accuracy', module: 'coding', group: 'Results', label: 'Accuracy', kind: 'percent', qualifiers: 'coding', rankable: true, get: codingMetric('accuracy') },
  { key: 'coding.attempted', module: 'coding', group: 'Results', label: 'Problems attempted', kind: 'number', qualifiers: 'coding', rankable: true, get: codingMetric('attempted') },
  { key: 'coding.submissions', module: 'coding', group: 'Results', label: 'Code submissions', kind: 'number', qualifiers: 'coding', rankable: true, get: codingMetric('submissions') },

  // ---- Prep Learning
  { key: 'learning.status', module: 'learning', group: 'Learning', label: 'Learning status', kind: 'enum', options: 'learningStatuses', quick: true, get: (row) => row.learning?.status },
  { key: 'learning.subjects', module: 'learning', group: 'Learning', label: 'Subject studied', kind: 'set', options: 'subjects', quick: true, get: (row) => row.learning?.subjects || [] },
  { key: 'learning.subjectsFinished', module: 'learning', group: 'Learning', label: 'Subject finished', kind: 'set', options: 'subjects', get: (row) => row.learning?.subjectsFinished || [] },
  { key: 'learning.progress', module: 'learning', group: 'Learning', label: 'Course completed', kind: 'percent', qualifiers: 'learning', rankable: true, get: learningMetric('progress') },
  { key: 'learning.completedTopics', module: 'learning', group: 'Learning', label: 'Topics completed', kind: 'number', qualifiers: 'learning', rankable: true, get: learningMetric('completedTopics') },
  { key: 'learning.videoMinutes', module: 'learning', group: 'Learning', label: 'Video minutes watched', kind: 'number', unit: 'min', rankable: true, get: (row) => row.learning?.videoMinutes ?? 0 },
  { key: 'learning.daysSinceActive', module: 'learning', group: 'Learning', label: 'Days since last lesson', kind: 'number', unit: 'days', get: (row) => row.learning?.daysSinceActive ?? null },

  // ---- Quick Prep
  { key: 'quickprep.status', module: 'coding', group: 'Quick Prep sheets', label: 'Quick Prep status', kind: 'enum', options: 'quickprepStatuses', quick: true, get: (row) => row.quickprep?.status },
  { key: 'quickprep.sheets', module: 'coding', group: 'Quick Prep sheets', label: 'Sheet started', kind: 'set', options: 'sheets', quick: true, get: (row) => row.quickprep?.sheets || [] },
  { key: 'quickprep.sheetsFinished', module: 'coding', group: 'Quick Prep sheets', label: 'Sheet finished', kind: 'set', options: 'sheets', get: (row) => row.quickprep?.sheetsFinished || [] },
  { key: 'quickprep.progress', module: 'coding', group: 'Quick Prep sheets', label: 'Sheet progress', kind: 'percent', qualifiers: 'quickprep', rankable: true, get: quickPrepMetric('progress') },
  { key: 'quickprep.solved', module: 'coding', group: 'Quick Prep sheets', label: 'Sheet questions solved', kind: 'number', qualifiers: 'quickprep', rankable: true, get: quickPrepMetric('solved') },
  { key: 'quickprep.finished', module: 'coding', group: 'Quick Prep sheets', label: 'Sheets finished', kind: 'number', rankable: true, get: (row) => row.quickprep?.finished ?? 0 },
  { key: 'quickprep.daysSinceActive', module: 'coding', group: 'Quick Prep sheets', label: 'Days since last sheet activity', kind: 'number', unit: 'days', get: (row) => row.quickprep?.daysSinceActive ?? null },

  // ---- Prep Interview (mock interviews and AI interviews)
  { key: 'interview.status', module: 'interview', group: 'Activity', label: 'Interview status', kind: 'enum', options: 'interviewStatuses', quick: true, get: (row) => row.interview?.status },
  { key: 'interview.done', module: 'interview', group: 'Activity', label: 'Interviews done (mock + AI)', kind: 'number', rankable: true, get: (row) => row.interview?.done ?? 0 },
  { key: 'interview.mockDone', module: 'interview', group: 'Mock interviews', label: 'Mock interviews done', kind: 'number', rankable: true, get: (row) => row.interview?.mockDone ?? 0 },
  { key: 'interview.mockScore', module: 'interview', group: 'Mock interviews', label: 'Mock interview score (their average)', kind: 'percent', rankable: true, get: (row) => row.interview?.mockScore ?? 0 },
  { key: 'interview.bestMockScore', module: 'interview', group: 'Mock interviews', label: 'Best mock interview score', kind: 'percent', rankable: true, get: (row) => row.interview?.bestMockScore ?? 0 },
  { key: 'interview.lastMockScore', module: 'interview', group: 'Mock interviews', label: 'Latest mock interview score', kind: 'percent', rankable: true, get: (row) => row.interview?.lastMockScore ?? 0 },
  ...RATINGS.map(({ key, label }) => ({ key: `interview.${key}`, module: 'interview', group: 'Mock interview ratings (1-5)', label: `${label} rating`, kind: 'number', unit: '/ 5', rankable: true, get: interviewRating(key) })),
  { key: 'interview.given', module: 'interview', group: 'Mock interviews', label: 'Interviews taken as interviewer', kind: 'number', rankable: true, get: (row) => row.interview?.given ?? 0 },
  { key: 'interview.scheduled', module: 'interview', group: 'Mock interviews', label: 'Mock interviews scheduled', kind: 'number', get: (row) => row.interview?.scheduled ?? 0 },
  { key: 'interview.aiCompleted', module: 'interview', group: 'AI interviews', label: 'AI interviews completed', kind: 'number', rankable: true, get: (row) => row.interview?.aiCompleted ?? 0 },
  { key: 'interview.aiStarted', module: 'interview', group: 'AI interviews', label: 'AI interviews started', kind: 'number', get: (row) => row.interview?.aiStarted ?? 0 },
  { key: 'interview.daysSinceActive', module: 'interview', group: 'Activity', label: 'Days since last interview', kind: 'number', unit: 'days', get: (row) => row.interview?.daysSinceActive ?? null },

  // ---- Prep Assessment
  { key: 'assessment.status', module: 'assessment', group: 'Activity', label: 'Test status', kind: 'enum', options: 'assessmentStatuses', quick: true, get: (row) => row.assessment?.status },
  { key: 'assessment.assignedTests', module: 'assessment', group: 'Tests', label: 'Assigned test', kind: 'set', options: 'tests', get: (row) => row.assessment?.assignedIds || [] },
  { key: 'assessment.takenTests', module: 'assessment', group: 'Tests', label: 'Test taken', kind: 'set', options: 'tests', get: (row) => row.assessment?.takenIds || [] },
  { key: 'assessment.passedTests', module: 'assessment', group: 'Tests', label: `Test passed (${PASS_PERCENT}%+)`, kind: 'set', options: 'tests', get: (row) => row.assessment?.passedIds || [] },
  { key: 'assessment.missedTests', module: 'assessment', group: 'Tests', label: 'Test missed', kind: 'set', options: 'tests', get: (row) => row.assessment?.missedIds || [] },
  { key: 'assessment.averageScore', module: 'assessment', group: 'Scores', label: 'Test score (their average)', kind: 'percent', qualifiers: 'assessment', rankable: true, get: assessmentMetric('averageScore') },
  { key: 'assessment.bestScore', module: 'assessment', group: 'Scores', label: 'Best test score', kind: 'percent', rankable: true, get: (row) => row.assessment?.bestScore ?? 0 },
  { key: 'assessment.lastScore', module: 'assessment', group: 'Scores', label: 'Latest test score', kind: 'percent', rankable: true, get: (row) => row.assessment?.lastScore ?? 0 },
  { key: 'assessment.taken', module: 'assessment', group: 'Tests', label: 'Tests taken', kind: 'number', qualifiers: 'assessment', rankable: true, get: assessmentMetric('taken') },
  { key: 'assessment.passed', module: 'assessment', group: 'Tests', label: `Tests passed (${PASS_PERCENT}%+)`, kind: 'number', qualifiers: 'assessment', rankable: true, get: assessmentMetric('passed') },
  { key: 'assessment.passRate', module: 'assessment', group: 'Scores', label: 'Pass rate (of their tests)', kind: 'percent', rankable: true, get: (row) => row.assessment?.passRate ?? 0 },
  { key: 'assessment.missed', module: 'assessment', group: 'Tests', label: 'Tests missed', kind: 'number', rankable: true, get: (row) => row.assessment?.missed ?? 0 },
  { key: 'assessment.daysSinceActive', module: 'assessment', group: 'Activity', label: 'Days since last test', kind: 'number', unit: 'days', get: (row) => row.assessment?.daysSinceActive ?? null },
];

// The measure "Who to show: Top / Bottom N" ranks by in each area.
export const DEFAULT_RANK_METRIC = Object.freeze({
  coding: 'coding.prepScore', learning: 'learning.progress', interview: 'interview.prepScore', assessment: 'assessment.prepScore', all: 'student.prepScore',
});

export const FIELDS = new Map(FIELD_LIST.map((field) => [field.key, field]));

const LANGUAGE_LABELS = {
  python: 'Python', javascript: 'JavaScript', java: 'Java', cpp: 'C++', c: 'C', typescript: 'TypeScript',
  csharp: 'C#', php: 'PHP', go: 'Go', rust: 'Rust', kotlin: 'Kotlin', ruby: 'Ruby', swift: 'Swift', r: 'R', sql: 'SQL',
};

export const STATIC_OPTIONS = Object.freeze({
  semesters: Array.from({ length: 8 }, (_, index) => ({ value: index + 1, label: `Semester ${index + 1}` })),
  statuses: [{ value: 'active', label: 'Active account' }, { value: 'inactive', label: 'Disabled account' }],
  practiceStatuses: [
    { value: 'active', label: `Practising (last ${INACTIVE_AFTER_DAYS} days)` },
    { value: 'inactive', label: `Stopped (no practice for ${INACTIVE_AFTER_DAYS}+ days)` },
    { value: 'never', label: 'Never practised' },
  ],
  learningStatuses: [
    { value: 'active', label: `Learning (last ${INACTIVE_AFTER_DAYS} days)` },
    { value: 'inactive', label: `Stopped (no lessons for ${INACTIVE_AFTER_DAYS}+ days)` },
    { value: 'never', label: 'Never started' },
  ],
  interviewStatuses: [
    { value: 'active', label: `Interviewed (last ${INACTIVE_AFTER_DAYS} days)` },
    { value: 'inactive', label: `No interview for ${INACTIVE_AFTER_DAYS}+ days` },
    { value: 'never', label: 'Never interviewed' },
  ],
  assessmentStatuses: [
    { value: 'active', label: `Took a test (last ${INACTIVE_AFTER_DAYS} days)` },
    { value: 'inactive', label: `No test for ${INACTIVE_AFTER_DAYS}+ days` },
    { value: 'never', label: 'Never took a test' },
  ],
  quickprepStatuses: [
    { value: 'finished', label: 'Finished a sheet' },
    { value: 'inProgress', label: 'Started, none finished' },
    { value: 'none', label: 'Not started' },
  ],
  difficulties: DIFFICULTIES.map((value) => ({ value, label: value })),
  languages: SUPPORTED_LANGUAGES.map((value) => ({ value, label: LANGUAGE_LABELS[value] || value })),
});

/** Modules a request may use under the university policy (null permissions = standalone: all). */
export function allowedModules(permissions) {
  return Object.entries(MODULES)
    .filter(([, module]) => !module.permission || !permissions || [].concat(module.permission).some((key) => permissions[key] === true))
    .map(([key]) => key);
}

/** The catalogue sent to the browser: no getters, only licensed modules. */
export function publicFieldCatalog(permissions) {
  const modules = new Set(allowedModules(permissions));
  const areaKeys = [...modules].filter((key) => key !== 'student');
  return {
    modules: [...modules].map((key) => ({ key, label: MODULES[key].label })),
    // Layer 1 of the page: what to analyse. "All" appears when more than one area is licensed.
    areas: [...(areaKeys.length > 1 ? [{ key: 'all', label: 'All features' }] : []), ...areaKeys.map((key) => ({ key, label: MODULES[key].label }))],
    rankMetric: Object.fromEntries(Object.entries(DEFAULT_RANK_METRIC).filter(([area]) => area === 'all' || modules.has(area))),
    operators: KIND_OPERATORS,
    qualifiers: Object.fromEntries(Object.entries(QUALIFIER_SETS).filter(([key]) => modules.has(QUALIFIER_MODULE[key]))),
    fields: FIELD_LIST.filter((field) => modules.has(field.module)).map(({ get, ...field }) => field),
    staticOptions: STATIC_OPTIONS,
  };
}
