import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartTheme } from '../src/admin/prepAnalysis/charts/chartTheme.js';
import {
  activityCalendarOption, cumulativeSolvesOption, growthOption, practiceTrendOption, rhythmOption, skillRadarOption, testTimeOption, weeklyAccuracyOption, ratingsRadarOption, testOutcomeOption, testTrendOption, timeBuckets, topicMapOption, topicTreemapOption,
  verdictOption, weekdayOption,
} from '../src/student/insights/insightCharts.js';
import {
  changeText, filterTopics, hourLabel, normalizeInsights, preparationLevel, sectionFromParam, sectionPath, stateCounts, strengthsAndGaps, targetProgress, visibleSections, weeklyAccuracy,
} from '../src/student/insights/insightModel.js';

const topics = [
  { key: 'array', name: 'Array', total: 200, solved: 10, target: 15, accuracy: 70, state: 'building', core: true, lastAt: '2026-11-01T00:00:00Z' },
  { key: 'graph', name: 'Graph', total: 40, solved: 0, target: 4, accuracy: null, state: 'notStarted', core: true, lastAt: null },
  { key: 'dp', name: 'Dynamic Programming', total: 120, solved: 2, target: 12, accuracy: 30, state: 'needsWork', core: true, lastAt: '2026-11-05T00:00:00Z' },
  { key: 'shell', name: 'Shell', total: 4, solved: 4, target: 3, accuracy: 100, state: 'strong', core: false, lastAt: '2026-10-01T00:00:00Z' },
];

test('only the pages the student may open are listed, in tab order (v2: score, readiness, coins, features)', () => {
  const insights = { coverage: {}, sections: { coding: {}, assessment: {} }, access: { coding: true, company: false, quickprep: true, prepmock: false } };
  assert.deepEqual(visibleSections(insights).map((section) => section.id), ['overview', 'readiness', 'coding', 'assessment']);
  assert.deepEqual(visibleSections(insights, { score: true, coins: true }).map((section) => section.id), ['overview', 'score', 'readiness', 'coins', 'coding', 'assessment']);
  assert.deepEqual(visibleSections({ coverage: null, sections: { interview: {} }, access: { prepmock: true } }).map((section) => section.id), ['overview', 'mock', 'interview']);
  // Removed pages (Quick Prep, Learning, Badges, Activity) and old addresses open their new home.
  assert.equal(sectionFromParam('dsa'), 'coding');
  assert.equal(sectionFromParam('topics'), 'coding');
  assert.equal(sectionFromParam('prep-readiness'), 'readiness');
  assert.equal(sectionFromParam('companies'), 'readiness');
  assert.equal(sectionFromParam('tests'), 'assessment');
  assert.equal(sectionFromParam('interviews'), 'interview');
  assert.equal(sectionFromParam('quickprep'), 'overview');
  assert.equal(sectionFromParam('badges'), 'overview');
  assert.equal(sectionFromParam('nonsense'), 'overview');
  assert.equal(sectionPath('overview'), '/student/analysis');
  assert.equal(sectionPath('score'), '/student/analysis/score');
});

test('an older answer without the newer fields is filled with empty values', () => {
  const old = normalizeInsights({ sections: { coding: { solved: { total: 7 } }, assessment: {} }, activity: { streak: { current: 2 } } });
  assert.deepEqual(old.records, []);
  assert.deepEqual(old.coach, []);
  assert.deepEqual(old.sections.coding.milestones, { total: 7, reached: [], next: null });
  assert.deepEqual(old.sections.coding.retry, { count: 0, items: [] });
  assert.deepEqual(old.sections.coding.breakdown, { languages: [], difficulties: [] });
  assert.equal(old.sections.coding.growth.length, 0);
  assert.equal(old.sections.coding.rhythm, null);
  assert.deepEqual(old.sections.assessment.upcoming, []);
  assert.deepEqual(old.activity.streak, { current: 2, best: 0 });
  assert.equal(old.activity.weekdays.length, 7);
  // Sections the student has no access to stay absent.
  assert.equal(normalizeInsights({ sections: {} }).sections.coding, undefined);
  // A full answer keeps its values.
  assert.deepEqual(normalizeInsights({ records: [{ id: 'r' }], sections: {} }).records, [{ id: 'r' }]);
});

test('strengths, gaps and weekly accuracy', () => {
  const { strengths, gaps } = strengthsAndGaps(topics);
  assert.deepEqual(strengths.map((topic) => topic.key), ['shell', 'array']);
  assert.deepEqual(gaps.map((topic) => topic.key), ['dp']);
  const weeks = weeklyAccuracy([{ date: '2026-11-02', attempts: 4, accepted: 1 }, { date: '2026-11-03', attempts: 6, accepted: 4 }, { date: '2026-11-04', attempts: 0, accepted: 0 }, { date: '2026-11-05', attempts: 2, accepted: 2 }]);
  // 2 Nov 2026 is a Monday; 5 Nov is in the same week.
  assert.deepEqual(weeks, [{ week: '2026-11-02', submissions: 12, accuracy: 58.3 }]);
  assert.equal(hourLabel(21), '9 pm');
});

test('topic filters and sorts', () => {
  assert.deepEqual(filterTopics(topics).map((topic) => topic.key), ['array', 'dp', 'graph', 'shell']);
  assert.deepEqual(filterTopics(topics, { coreOnly: true, sort: 'accuracy' }).map((topic) => topic.key), ['dp', 'array', 'graph']);
  assert.deepEqual(filterTopics(topics, { state: 'needsWork' }).map((topic) => topic.key), ['dp']);
  assert.deepEqual(filterTopics(topics, { search: 'dyn' }).map((topic) => topic.key), ['dp']);
  assert.deepEqual(filterTopics(topics, { sort: 'recent' }).map((topic) => topic.key)[0], 'dp');
  assert.equal(targetProgress(topics[0]), 67);
  assert.equal(targetProgress(topics[3]), 100);
  assert.deepEqual(stateCounts(topics), { strong: 1, building: 1, needsWork: 1, notStarted: 1 });
});

test('changes read as points for percentages and are empty without a comparison', () => {
  assert.equal(changeText({ change: 4.25, unit: '%' }), '+4.3 pts');
  assert.equal(changeText({ change: -2, unit: '' }), '−2');
  assert.equal(changeText({ change: 0, unit: '' }), '±0');
  assert.equal(changeText({ change: null }), '');
  assert.equal(preparationLevel(85).label, 'Interview ready');
  assert.equal(preparationLevel(10).label, 'Getting started');
});

test('time buckets fill empty days and switch to weeks for long periods', () => {
  const daily = timeBuckets([{ date: '2026-11-05', attempts: 3 }], { from: '2026-11-01T00:00:00Z', to: '2026-11-07T00:00:00Z' }, ['attempts']);
  assert.equal(daily.labels.length, 7);
  assert.deepEqual(daily.series.attempts, [0, 0, 0, 0, 3, 0, 0]);
  const weekly = timeBuckets([{ date: '2026-01-02', attempts: 2 }, { date: '2026-01-03', attempts: 1 }], { from: '2026-01-01T00:00:00Z', to: '2026-11-07T00:00:00Z' }, ['attempts']);
  assert.equal(weekly.weekly, true);
  assert.equal(weekly.series.attempts[0], 3);
  assert.equal(weekly.series.attempts.reduce((sum, value) => sum + value, 0), 3);
});

test('every chart builds in light and dark themes', () => {
  for (const theme of [chartTheme(false), chartTheme(true)]) {
    const range = { from: '2026-10-08T00:00:00Z', to: '2026-11-07T00:00:00Z' };
    const options = [
      practiceTrendOption([{ date: '2026-11-01', attempts: 4, accepted: 2 }], range, theme),
      verdictOption([{ key: 'AC', name: 'Accepted', value: 2 }, { key: 'WA', name: 'Wrong answer', value: 2 }], theme),
      topicMapOption(topics, theme),
      topicTreemapOption(topics, theme),
      testTrendOption([{ title: 'Quiz', percent: 30, score: 3, maxMarks: 10, passed: false, at: '2026-11-01T00:00:00Z' }], 40, theme),
      testOutcomeOption({ passed: 1, failed: 1, missed: 0 }, theme),
      ratingsRadarOption([{ key: 'communication', label: 'Communication', value: 3 }], theme),
      activityCalendarOption({ from: '2025-11-08', to: '2026-11-07', days: [{ date: '2026-11-01', coding: 1, learning: 0, tests: 0, interviews: 0, total: 1 }] }, theme),
      weekdayOption([1, 0, 0, 0, 0, 0, 2], theme),
      growthOption([{ date: '2026-10-01', preparation: 20, Easy: 1, Medium: 0, Hard: 0 }, { date: '2026-10-08', preparation: 30, Easy: 2, Medium: 1, Hard: 0 }], theme),
      growthOption([{ date: '2026-10-01', preparation: 20 }], theme, { compact: true }),
      cumulativeSolvesOption([{ date: '2026-10-01', Easy: 1, Medium: 0, Hard: 0 }], theme),
      rhythmOption({ cells: [{ day: 0, hour: 21, count: 4, correct: 2 }], total: 4 }, theme),
      skillRadarOption(topics, theme),
      weeklyAccuracyOption([{ week: '2026-11-02', submissions: 12, accuracy: 58.3 }], theme),
      testTimeOption([{ title: 'Quiz', percent: 30, minutes: 20, passed: false }], 40, theme),
    ];
    for (const option of options) assert.ok(Array.isArray(option.series) && option.series.length > 0);
  }
  // Topics not started are left off the map (they have no accuracy yet) but stay in the treemap.
  assert.equal(topicMapOption(topics, chartTheme(false)).series[0].data.length, 3);
  assert.equal(topicTreemapOption(topics, chartTheme(false)).series[0].data.length, 4);
});
