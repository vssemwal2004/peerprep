// The figures under each chart's insight line: how many of the students in view the chart is
// about (n of N), and where it makes sense a total and an average. Averages are always "per
// student in view" (N) unless the label says otherwise, so two charts never use different
// denominators silently.

import { percentOne, practising, topicSolved } from './charts.js';

const round = (value, places = 1) => Math.round(value * 10 ** places) / 10 ** places;
const mean = (values) => (values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 2) : 0);
const perStudent = (total, cohort) => (cohort ? round(total / cohort, 2) : 0);

function summary(cohort, students, studentsLabel, extra = {}) {
  return { cohort, students, studentsLabel, pct: percentOne(students, cohort), ...extra };
}

const SUMMARIES = {
  'top-students': (rows) => {
    const active = practising(rows);
    return summary(rows.length, active.length, 'practised', { average: mean(active.map((row) => row.coding.prepScore)), averageLabel: 'average Prep Score of those who practised' });
  },
  'difficulty-split': (rows, data) => {
    const total = (data.items || []).reduce((sum, item) => sum + item.value, 0);
    return summary(rows.length, rows.filter((row) => row.coding.solved.total > 0).length, 'solved a problem', { total, totalLabel: 'problems solved', average: perStudent(total, rows.length), averageLabel: 'solved per student' });
  },
  'practice-trend': (rows) => {
    const total = rows.reduce((sum, row) => sum + row.coding.submissions, 0);
    return summary(rows.length, practising(rows).length, 'practised', { total, totalLabel: 'submissions', average: perStudent(total, rows.length), averageLabel: 'submissions per student' });
  },
  'practice-funnel': (rows) => summary(rows.length, practising(rows).length, 'started practising'),
  'topic-strength': (rows, data) => {
    const solvers = rows.filter((row) => topicSolved(row).size > 0);
    return summary(rows.length, solvers.length, 'solved in a topic', {
      total: data.pagination?.total ?? data.items?.length ?? 0, totalLabel: 'topics with a solver',
      average: perStudent(rows.reduce((sum, row) => sum + topicSolved(row).size, 0), rows.length), averageLabel: 'topics solved per student',
    });
  },
  'student-profile': (rows, data) => (data.mode === 'student' && data.student
    ? summary(rows.length, 1, 'student picked')
    : summary(rows.length, rows.filter((row) => topicSolved(row).size > 0).length, 'solved in a topic', {
      average: perStudent(rows.reduce((sum, row) => sum + topicSolved(row).size, 0), rows.length), averageLabel: 'topics solved per student',
    })),
  'failure-reasons': (rows, data) => {
    const total = (data.items || []).reduce((sum, item) => sum + item.value, 0);
    const accepted = (data.items || []).find((item) => item.key === 'AC')?.value || 0;
    return summary(rows.length, practising(rows).length, 'submitted code', { total, totalLabel: 'submissions', average: percentOne(total - accepted, total), averageLabel: '% of submissions failed' });
  },
  'language-usage': (rows, data) => summary(rows.length, practising(rows).length, 'submitted code', { total: data.items?.length || 0, totalLabel: 'languages' }),
  'score-spread': (rows) => {
    const active = practising(rows);
    return summary(rows.length, active.length, 'practised', { average: mean(active.map((row) => row.coding.prepScore)), averageLabel: 'average Prep Score of those who practised' });
  },
  'tough-problems': (rows, data) => {
    const strugglers = rows.filter((row) => row.entries.some((entry) => entry.attempts > entry.accepted));
    const failed = rows.reduce((sum, row) => sum + row.entries.reduce((inner, entry) => inner + entry.attempts - entry.accepted, 0), 0);
    return summary(rows.length, strugglers.length, 'had a failed attempt', { total: failed, totalLabel: 'failed attempts', average: perStudent(failed, rows.length), averageLabel: 'failed attempts per student', problems: data.pagination?.total ?? data.items?.length ?? 0 });
  },
  'needs-attention': (rows) => summary(rows.length, rows.filter((row) => row.coding.daysSinceActive === null || row.coding.daysSinceActive > 14).length, 'not practised in 14 days'),
  'activity-calendar': (rows) => summary(rows.length, practising(rows).length, 'practised', { average: perStudent(rows.reduce((sum, row) => sum + row.coding.activeDays, 0), rows.length), averageLabel: 'days practised per student' }),
  'group-breakdown': (rows) => {
    const total = rows.reduce((sum, row) => sum + row.coding.solved.total, 0);
    return summary(rows.length, rows.filter((row) => row.coding.solved.total > 0).length, 'solved a problem', { total, totalLabel: 'problems solved', average: perStudent(total, rows.length), averageLabel: 'solved per student' });
  },
};

/** n of N (and a total and an average where they mean something) for one chart. */
export function chartSummary(chartId, rows, data) {
  const build = SUMMARIES[chartId];
  return build ? build(rows, data || {}) : summary(rows.length, rows.length, 'in view');
}
