// Drills for the Prep Learning, Quick Prep, Prep Assessment and Prep Interview charts: the
// students behind one part (a funnel step, a score band, a week, a sheet's "Finished"…). Each
// test mirrors the chart's own counting in charts.js, so a part's students always add up to
// the number the chart shows. `context` carries the sheet and test catalogues.

import { PASS_PERCENT } from './assessmentFacts.js';
import { ATTENTION_GROUPS, GROUP_BY, weekStart } from './charts.js';
import { RATINGS } from './interviewFacts.js';

const text = (key, label, width = 16) => ({ key, label, kind: 'text', width });
const count = (key, label, width = 11) => ({ key, label, kind: 'number', width });
const percent = (key, label, width = 11) => ({ key, label, kind: 'percent', width });
const dayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const daysAgo = (days) => (days === null || days === undefined ? 'Never' : days === 0 ? 'Today' : `${days} days ago`);

/** "who|series" keys of stacked bars, as in drill.js. */
function splitKey(key) {
  const value = String(key || '');
  const at = value.lastIndexOf('|');
  return at < 0 ? [value, ''] : [value.slice(0, at), value.slice(at + 1)];
}

// ---------------------------------------------------------------- each feature's columns and detail

const LEARNING = {
  columns: [percent('progress', 'Course completed %'), count('topicsDone', 'Topics completed'), count('topicsAll', 'Topics available'), count('video', 'Video minutes'), text('lastLesson', 'Last lesson', 12)],
  values: (row) => ({ progress: row.learning.progress, topicsDone: row.learning.completedTopics, topicsAll: row.learning.availableTopics, video: row.learning.videoMinutes, lastLesson: daysAgo(row.learning.daysSinceActive) }),
  detail(rows, test = () => true) {
    const items = [];
    for (const row of rows) {
      for (const [name, subject] of row.learning.bySubject) {
        if (!subject.total || !test(row, name, subject)) continue;
        const done = Math.min(subject.completed, subject.total);
        items.push({ row, values: { subject: name, done, total: subject.total, progress: Math.round((done / subject.total) * 100), status: subjectStatus(subject) } });
      }
    }
    return { title: 'Student × subject', columns: [text('subject', 'Subject', 26), count('done', 'Topics completed'), count('total', 'Topics'), percent('progress', 'Progress %'), text('status', 'Status', 12)], items };
  },
};
const subjectStatus = (subject) => (subject.completed >= subject.total ? 'Finished' : subject.started > 0 || subject.completed > 0 ? 'In progress' : 'Not started');

const QUICKPREP = {
  columns: [count('started', 'Sheets started'), count('finished', 'Sheets finished'), count('solved', 'Questions solved'), percent('progress', 'Progress in started sheets %'), text('lastOpened', 'Last opened', 12)],
  values: (row) => ({ started: row.quickprep.started, finished: row.quickprep.finished, solved: row.quickprep.solved, progress: row.quickprep.progress, lastOpened: daysAgo(row.quickprep.daysSinceActive) }),
  detail(rows, context, test = () => true) {
    const items = [];
    for (const row of rows) {
      for (const [sheetId, entry] of row.quickprep.bySheet) {
        if (!test(row, sheetId, entry)) continue;
        items.push({ row, values: { sheet: context.sheets?.get(sheetId)?.title || 'Sheet', solved: entry.solved, total: entry.total, progress: entry.total ? Math.round((entry.solved / entry.total) * 100) : 0, finished: entry.finished ? 'Yes' : 'No', lastOpened: dayOf(entry.lastViewedAt) } });
      }
    }
    return { title: 'Student × sheet', columns: [text('sheet', 'Sheet', 26), count('solved', 'Solved'), count('total', 'Questions'), percent('progress', 'Progress %'), text('finished', 'Finished', 9), text('lastOpened', 'Last opened', 12)], items };
  },
};

const ASSESSMENT = {
  columns: [count('taken', 'Tests taken'), count('passed', `Passed (${PASS_PERCENT}%+)`), count('failed', 'Failed'), count('missed', 'Missed'), percent('average', 'Average score %'), percent('best', 'Best score %')],
  values: (row) => ({ taken: row.assessment.taken, passed: row.assessment.passed, failed: row.assessment.failed, missed: row.assessment.missed, average: row.assessment.taken ? row.assessment.averageScore : null, best: row.assessment.taken ? row.assessment.bestScore : null }),
  detail(rows, context, test = () => true) {
    const items = [];
    for (const row of rows) {
      for (const [testId, attempt] of row.assessment.byTest) {
        if (!test(row, testId, attempt)) continue;
        items.push({ row, values: { test: context.tests?.get(testId)?.title || 'Test', score: attempt.percent, marks: attempt.score, outOf: attempt.maxMarks, result: attempt.percent >= PASS_PERCENT ? 'Passed' : 'Failed', on: dayOf(attempt.at) } });
      }
      for (const testId of row.assessment.missedIds) {
        if (test(row, testId, null)) items.push({ row, values: { test: context.tests?.get(testId)?.title || 'Test', score: null, marks: null, outOf: null, result: 'Missed', on: null } });
      }
    }
    return { title: 'Student × test', columns: [text('test', 'Test', 26), percent('score', 'Score %'), count('marks', 'Marks'), count('outOf', 'Out of'), text('result', 'Result', 9), text('on', 'Taken on', 12)], items };
  },
};

const INTERVIEW = {
  columns: [count('done', 'Interviews done'), count('mocks', 'Mock interviews'), percent('mockScore', 'Average mock score %'), percent('best', 'Best mock score %'), count('ai', 'AI interviews'), text('last', 'Last interview', 12)],
  values: (row) => ({ done: row.interview.done, mocks: row.interview.mockDone, mockScore: row.interview.mockDone ? row.interview.mockScore : null, best: row.interview.mockDone ? row.interview.bestMockScore : null, ai: row.interview.aiCompleted, last: daysAgo(row.interview.daysSinceActive) }),
  detail(rows, test = () => true) {
    const items = [];
    for (const row of rows) {
      for (const mock of row.interview.mocks) {
        if (!test(row, mock)) continue;
        items.push({ row, values: { on: dayOf(mock.at), score: mock.score, ...Object.fromEntries(RATINGS.map(({ key }) => [`rating_${key}`, mock.ratings?.[key] ?? null])) } });
      }
    }
    return { title: 'Student × mock interview', columns: [text('on', 'Date', 12), percent('score', 'Score %'), ...RATINGS.map(({ key, label }) => ({ key: `rating_${key}`, label: `${label} (1-5)`, kind: 'decimal', width: 11 }))], items };
  },
};

// ---------------------------------------------------------------- shared shapes

/** Funnel steps: the students at step `key` (an index). */
function funnelDrill(feature, has, stages) {
  return {
    label: (key) => stages[Number(key)]?.name || 'Every step',
    students(rows, key) {
      const stage = stages[Number(key)];
      return { sort: feature.columns[0].key, columns: feature.columns, items: rows.filter((row) => has(row) && (!stage || stage.test(row))).map((row) => ({ row, values: feature.values(row) })) };
    },
  };
}

/** Ten-percent bands of a 0–100 measure: the students in band `key` (an index). */
function bandDrill(feature, eligible, read, label) {
  return {
    label: (key) => (key === '' || key === null ? `Every ${label} band` : `${label} ${Number(key) * 10}–${Number(key) * 10 + 10}%`),
    students(rows, key) {
      const index = key === '' || key === null ? null : Number(key);
      return {
        sort: feature.columns[0].key, columns: feature.columns,
        items: rows.filter((row) => eligible(row) && (index === null || Math.min(9, Math.floor(read(row) / 10)) === index)).map((row) => ({ row, values: feature.values(row) })),
      };
    },
  };
}

/** Weeks or days: the students active in week (or on day) `key`, with their count then. */
function timeDrill(feature, has, dates, unit, byWeek) {
  const bucket = (day) => (byWeek ? weekStart(day) : day);
  const countIn = (row, key) => dates(row).reduce((sum, [day, value]) => sum + (bucket(day) === key ? value : 0), 0);
  return {
    label: (key) => (key ? `${byWeek ? 'Week of' : 'Day:'} ${key}` : `Every ${byWeek ? 'week' : 'day'}`),
    students(rows, key) {
      const columns = key ? [count('inPeriod', `${unit} ${byWeek ? 'that week' : 'that day'}`), ...feature.columns] : feature.columns;
      return {
        sort: key ? 'inPeriod' : feature.columns[0].key, columns,
        items: rows.filter((row) => has(row) && (!key || dates(row).some(([day]) => bucket(day) === key)))
          .map((row) => ({ row, values: { ...(key ? { inPeriod: countIn(row, key) } : {}), ...feature.values(row) } })),
      };
    },
  };
}

/** Stacked bars: "<group>|<series>", "*|<series>" or "<group>"; `test(row, group, series)` decides. */
function groupDrill(feature, { groups, test, columns = [], values = () => ({}), detail }) {
  return {
    label: (key) => {
      const [group, series] = splitKey(key);
      return [group && group !== '*' ? group : '', series].filter(Boolean).join(' · ') || 'Every group';
    },
    students(rows, key, options, context) {
      const [group, series] = splitKey(key);
      const names = group && group !== '*' ? [group] : groups(rows, context, options);
      return {
        sort: columns[0]?.key || feature.columns[0].key,
        columns: [...columns, ...feature.columns],
        items: rows.filter((row) => names.some((name) => test(row, name, series || null, context, options)))
          .map((row) => ({ row, values: { ...values(row, group !== '*' ? group : null, context, options), ...feature.values(row) } })),
      };
    },
    detail: detail ? (rows, key, options, context) => {
      const [group, series] = splitKey(key);
      return detail(rows, group && group !== '*' ? group : null, series || null, context, options);
    } : undefined,
  };
}

/** "Needs attention" chips: "listed" (the bars' students) or "never" (never started), as in charts.js. */
function attentionDrill(feature, chartId, labels) {
  const { listed, never } = ATTENTION_GROUPS[chartId];
  return {
    label: (key) => (key === 'never' ? labels.never : key === 'listed' ? labels.listed : `${labels.listed} or ${labels.never.toLowerCase()}`),
    students(rows, key) {
      const test = key === 'never' ? never : key === 'listed' ? listed : (row) => listed(row) || never(row);
      return { sort: feature.columns[0].key, columns: feature.columns, items: rows.filter(test).map((row) => ({ row, values: feature.values(row) })) };
    },
  };
}

// ---------------------------------------------------------------- per chart

const hasLearning = (row) => Boolean(row.learning);
const hasQuickPrep = (row) => Boolean(row.quickprep);
const hasAssessment = (row) => Boolean(row.assessment);
const hasInterview = (row) => Boolean(row.interview);
const sheetByTitle = (context, title) => [...(context.sheets?.values() || [])].find((sheet) => sheet.published && sheet.title === title);
const testByTitle = (context, title) => [...(context.tests?.values() || [])].filter((test) => test.title === title);
const sheetFor = (row, sheet) => row.quickprep && (!sheet.semesters.length || sheet.semesters.includes(Number(row.student.semester)));
const sheetStatus = (row, sheet) => {
  const entry = row.quickprep.bySheet.get(sheet.id);
  return !entry ? 'Not started' : entry.finished ? 'Finished' : 'In progress';
};
const SCORE_SERIES = ['Below 40%', '40–60%', '60–80%', '80–100%', 'Missed'];
const scoreSeries = (percentValue) => SCORE_SERIES[percentValue < PASS_PERCENT ? 0 : percentValue < 60 ? 1 : percentValue < 80 ? 2 : 3];
const testResult = (row, test, banded) => {
  const attempt = row.assessment?.byTest.get(test.id);
  if (attempt) return banded ? scoreSeries(attempt.percent) : attempt.percent >= PASS_PERCENT ? 'Passed' : 'Failed';
  return row.assessment?.missedIds.includes(test.id) ? 'Missed' : null;
};
const testsDrill = (banded) => groupDrill(ASSESSMENT, {
  groups: (rows, context) => [...new Set([...(context.tests?.values() || [])].map((test) => test.title))],
  test: (row, title, series, context) => testByTitle(context, title).some((test) => {
    const result = testResult(row, test, banded);
    return result !== null && (!series || result === series);
  }),
  columns: [text('result', 'Result', 12)],
  values: (row, title, context) => ({ result: title ? testByTitle(context, title).map((test) => testResult(row, test, banded)).filter(Boolean).join(', ') : '' }),
  detail: (rows, title, series, context) => ASSESSMENT.detail(rows.filter(hasAssessment), context, (row, testId, attempt) => {
    const test = context.tests?.get(testId);
    if (!test || (title && test.title !== title)) return false;
    const result = attempt ? (banded ? scoreSeries(attempt.percent) : attempt.percent >= PASS_PERCENT ? 'Passed' : 'Failed') : 'Missed';
    return !series || result === series;
  }),
});
const ratingKey = (label) => RATINGS.find((rating) => rating.label === label)?.key;
const ratedAt = (mock, key, series) => {
  const value = Math.round(mock.ratings?.[key] || 0);
  return value >= 1 && value <= 5 && (!series || series === `Rated ${value}`);
};

export const FEATURE_DRILLS = {
  'learning-needs-attention': attentionDrill(LEARNING, 'learning-needs-attention', { listed: 'Started learning', never: 'Never started' }),
  'quickprep-needs-attention': attentionDrill(QUICKPREP, 'quickprep-needs-attention', { listed: 'Started a sheet', never: 'Never opened a sheet' }),
  'assessment-needs-attention': attentionDrill(ASSESSMENT, 'assessment-needs-attention', { listed: 'Took or missed a test', never: 'No tests yet' }),
  'interview-needs-attention': attentionDrill(INTERVIEW, 'interview-needs-attention', { listed: 'Interviewed', never: 'Never interviewed' }),
  'learning-funnel': funnelDrill(LEARNING, hasLearning, [
    { name: 'Students', test: () => true },
    { name: 'Started learning', test: (row) => row.learning.status !== 'never' },
    { name: 'Completed 25%+', test: (row) => row.learning.progress >= 25 },
    { name: 'Completed 50%+', test: (row) => row.learning.progress >= 50 },
    { name: 'Completed 75%+', test: (row) => row.learning.progress >= 75 },
  ]),
  'learning-subjects': groupDrill(LEARNING, {
    groups: (rows) => [...new Set(rows.filter(hasLearning).flatMap((row) => [...row.learning.bySubject.keys()]))],
    test: (row, name, series) => {
      const subject = row.learning?.bySubject.get(name);
      return Boolean(subject?.total) && (!series || subjectStatus(subject) === series);
    },
    columns: [text('subjectStatus', 'Subject status', 12)],
    values: (row, name) => ({ subjectStatus: name && row.learning.bySubject.get(name)?.total ? subjectStatus(row.learning.bySubject.get(name)) : '' }),
    detail: (rows, name, series) => LEARNING.detail(rows.filter(hasLearning), (row, subjectName, subject) => (!name || subjectName === name) && (!series || subjectStatus(subject) === series)),
  }),
  'learning-trend': timeDrill(LEARNING, hasLearning, (row) => [...row.learning.days], 'Topics completed', true),
  'learning-calendar': timeDrill(LEARNING, hasLearning, (row) => [...row.learning.days], 'Topics completed', false),
  'learning-spread': bandDrill(LEARNING, (row) => row.learning && row.learning.status !== 'never', (row) => row.learning.progress, 'Course completed'),

  'quickprep-sheets': groupDrill(QUICKPREP, {
    groups: (rows, context) => [...(context.sheets?.values() || [])].filter((sheet) => sheet.published).map((sheet) => sheet.title),
    test: (row, title, series, context) => {
      const sheet = sheetByTitle(context, title);
      return Boolean(sheet && sheetFor(row, sheet)) && (!series || sheetStatus(row, sheet) === series);
    },
    columns: [text('sheetStatus', 'Sheet status', 12)],
    values: (row, title, context) => {
      const sheet = title ? sheetByTitle(context, title) : null;
      return { sheetStatus: sheet ? sheetStatus(row, sheet) : '' };
    },
    detail: (rows, title, series, context) => QUICKPREP.detail(rows.filter(hasQuickPrep), context, (row, sheetId, entry) => {
      const sheet = context.sheets?.get(sheetId);
      return Boolean(sheet) && (!title || sheet.title === title) && (!series || (entry.finished ? 'Finished' : 'In progress') === series);
    }),
  }),
  'quickprep-matrix': groupDrill(QUICKPREP, {
    groups: (rows, context) => [...(context.sheets?.values() || [])].map((sheet) => sheet.title),
    test: (row, title, series, context) => {
      const sheet = [...(context.sheets?.values() || [])].find((entry) => entry.title === title);
      return Boolean(sheet && row.quickprep?.bySheet.has(sheet.id));
    },
    detail: (rows, title, series, context) => QUICKPREP.detail(rows.filter(hasQuickPrep), context, (row, sheetId) => !title || context.sheets?.get(sheetId)?.title === title),
  }),
  'quickprep-funnel': funnelDrill(QUICKPREP, hasQuickPrep, [
    { name: 'Students', test: () => true },
    { name: 'Started a sheet', test: (row) => row.quickprep.started > 0 },
    { name: 'Solved a question', test: (row) => row.quickprep.solved > 0 },
    { name: 'Half of a sheet', test: (row) => [...row.quickprep.bySheet.values()].some((entry) => entry.total && entry.solved / entry.total >= 0.5) },
    { name: 'Finished a sheet', test: (row) => row.quickprep.finished > 0 },
  ]),
  'quickprep-spread': bandDrill(QUICKPREP, (row) => row.quickprep?.started > 0, (row) => row.quickprep.progress, 'Sheet progress'),

  'assessment-tests': testsDrill(false),
  'assessment-scores': testsDrill(true),
  'assessment-by-class': groupDrill(ASSESSMENT, {
    groups: (rows, context, options) => [...new Set(rows.map((row) => (GROUP_BY[options.groupBy] || GROUP_BY.semester).get(row) || 'Not set'))],
    test: (row, label, series, context, options) => {
      if (!row.assessment || !(row.assessment.taken || row.assessment.missed)) return false;
      if (((GROUP_BY[options.groupBy] || GROUP_BY.semester).get(row) || 'Not set') !== label) return false;
      return !series || (row.assessment[series.toLowerCase()] || 0) > 0;
    },
  }),
  'assessment-funnel': funnelDrill(ASSESSMENT, hasAssessment, [
    { name: 'Students', test: () => true },
    { name: 'Took a test', test: (row) => row.assessment.taken > 0 },
    { name: 'Passed a test', test: (row) => row.assessment.passed > 0 },
    { name: 'Passed every test taken', test: (row) => row.assessment.taken > 0 && row.assessment.failed === 0 },
  ]),
  'assessment-spread': bandDrill(ASSESSMENT, (row) => row.assessment?.taken > 0, (row) => row.assessment.averageScore, 'Test score'),
  'assessment-trend': timeDrill(ASSESSMENT, hasAssessment, (row) => [...row.assessment.byTest.values()].map((attempt) => [dayOf(attempt.at), 1]), 'Tests taken', true),
  'assessment-calendar': timeDrill(ASSESSMENT, hasAssessment, (row) => [...row.assessment.days], 'Tests taken', false),

  'interview-funnel': funnelDrill(INTERVIEW, hasInterview, [
    { name: 'Students', test: () => true },
    { name: 'Did an interview', test: (row) => row.interview.done > 0 },
    { name: 'Did 3 or more', test: (row) => row.interview.done >= 3 },
    { name: 'Scored 60%+ in a mock', test: (row) => row.interview.bestMockScore >= 60 },
    { name: 'Scored 80%+ in a mock', test: (row) => row.interview.bestMockScore >= 80 },
  ]),
  'interview-ratings': groupDrill(INTERVIEW, {
    groups: () => RATINGS.map((rating) => rating.label),
    test: (row, label, series) => {
      const key = ratingKey(label);
      return Boolean(key && row.interview?.mocks.some((mock) => ratedAt(mock, key, series)));
    },
    columns: [count('ratings', 'Ratings here')],
    values: (row, label) => {
      const key = label ? ratingKey(label) : null;
      return { ratings: key ? row.interview.mocks.filter((mock) => ratedAt(mock, key, null)).length : null };
    },
    detail: (rows, label, series) => {
      const key = label ? ratingKey(label) : null;
      return INTERVIEW.detail(rows.filter(hasInterview), (row, mock) => !key || ratedAt(mock, key, series));
    },
  }),
  'interview-mix': {
    // AI interviews have no per-interview rows here, only counts.
    hasDetail: (key) => key !== 'AI',
    label: (key) => (key === 'Mock' ? 'Mock interviews' : key === 'AI' ? 'AI interviews' : 'Every interview'),
    students(rows, key) {
      const test = key === 'Mock' ? (row) => row.interview?.mockDone > 0 : key === 'AI' ? (row) => row.interview?.aiCompleted > 0 : (row) => row.interview?.done > 0;
      return { sort: 'done', columns: INTERVIEW.columns, items: rows.filter(test).map((row) => ({ row, values: INTERVIEW.values(row) })) };
    },
    detail: (rows, key) => (key === 'AI' ? null : INTERVIEW.detail(rows.filter(hasInterview))),
  },
  'interview-spread': bandDrill(INTERVIEW, (row) => row.interview?.mockDone > 0, (row) => row.interview.mockScore, 'Mock score'),
  'interview-trend': timeDrill(INTERVIEW, hasInterview, (row) => [
    ...row.interview.mocks.map((mock) => [dayOf(mock.at), 1]),
    ...row.interview.aiDates.map((date) => [dayOf(date), 1]),
  ], 'Interviews', true),
  'interview-calendar': timeDrill(INTERVIEW, hasInterview, (row) => [...row.interview.days], 'Interviews', false),
};

// Which detail table each feature drill's second tab shows.
export const FEATURE_DETAIL_LABELS = Object.freeze({
  'learning-subjects': 'Subjects', 'quickprep-sheets': 'Sheets', 'quickprep-matrix': 'Sheets', 'assessment-tests': 'Tests', 'assessment-scores': 'Tests',
  'interview-ratings': 'Mock interviews', 'interview-mix': 'Mock interviews',
});
