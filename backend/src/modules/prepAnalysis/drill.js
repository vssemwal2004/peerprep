// "Who is behind this part of the chart?" For a chart and one of its parts (a difficulty, a
// topic, a verdict, a week…) this lists the students that make up that part, with the figures
// that explain it. With no part chosen it lists every student behind the whole chart. Where it
// helps there is also a detail table with one row per student and problem (or topic, language,
// week). The drill panel, the popover downloads and the chart's Excel file all read from here,
// on the same filtered rows the chart was drawn from, so the counts always agree with the chart.

import {
  ATTENTION_GROUPS, byScore, entryTopics, GROUP_BY, percentOne, practising, SCORE_BANDS, scoreBandOf, topicSolved, VERDICT_LABELS, weekStart,
} from './charts.js';
import { FEATURE_DETAIL_LABELS, FEATURE_DRILLS } from './featureDrills.js';
import { DIFFICULTIES } from './ranking.js';

export const LANGUAGE_NAMES = Object.freeze({
  python: 'Python', javascript: 'JavaScript', java: 'Java', cpp: 'C++', c: 'C', typescript: 'TypeScript',
  csharp: 'C#', php: 'PHP', go: 'Go', rust: 'Rust', kotlin: 'Kotlin', ruby: 'Ruby', swift: 'Swift', r: 'R', sql: 'SQL',
});
const languageName = (key) => LANGUAGE_NAMES[key] || key;
const VERDICTS = Object.keys(VERDICT_LABELS);

const text = (key, label, width = 16) => ({ key, label, kind: 'text', width });
const count = (key, label, width = 11) => ({ key, label, kind: 'number', width });
const decimal = (key, label, width = 11) => ({ key, label, kind: 'decimal', width });
const percent = (key, label, width = 11) => ({ key, label, kind: 'percent', width });
const sum = (list, read) => list.reduce((total, item) => total + (read(item) || 0), 0);
const yes = (value) => (value ? 'Yes' : 'No');

/** One student's submissions per problem, every language together (cached on the row). */
export function problemsOf(row) {
  if (row.problemCache) return row.problemCache;
  const problems = new Map();
  for (const entry of row.entries) {
    const problem = problems.get(entry.problemId) || {
      problemId: entry.problemId, title: entry.meta.title, difficulty: entry.meta.difficulty || '', topics: entryTopics(entry),
      attempts: 0, accepted: 0, verdicts: Object.fromEntries(VERDICTS.map((key) => [key, 0])), languages: new Set(),
    };
    problem.attempts += entry.attempts;
    problem.accepted += entry.accepted;
    for (const key of VERDICTS) problem.verdicts[key] += entry.verdicts?.[key] || 0;
    problem.languages.add(entry.language);
    problems.set(entry.problemId, problem);
  }
  row.problemCache = [...problems.values()].map((problem) => ({ ...problem, languages: [...problem.languages], solved: problem.accepted > 0 }));
  return row.problemCache;
}

// The columns every per-problem detail table shares.
const PROBLEM_COLUMNS = [
  text('problem', 'Problem', 30), text('difficulty', 'Difficulty', 10), text('topics', 'Topics', 30),
  count('attempts', 'Submissions'), count('accepted', 'Accepted'),
  ...VERDICTS.filter((key) => key !== 'AC').map((key) => count(`verdict_${key}`, VERDICT_LABELS[key])),
  text('languages', 'Languages', 14), text('solved', 'Solved', 8),
];
const problemValues = (problem) => ({
  problem: problem.title, difficulty: problem.difficulty, topics: problem.topics.join(', '),
  attempts: problem.attempts, accepted: problem.accepted,
  ...Object.fromEntries(VERDICTS.filter((key) => key !== 'AC').map((key) => [`verdict_${key}`, problem.verdicts[key]])),
  languages: problem.languages.map(languageName).join(', '), solved: yes(problem.solved),
});
function problemDetail(rows, test, title) {
  const items = [];
  for (const row of rows) for (const problem of problemsOf(row)) if (test(problem, row)) items.push({ row, values: problemValues(problem) });
  return { title, columns: PROBLEM_COLUMNS, items };
}

/** Problems a student touched in a topic: { solved, attempted, attempts, accepted }. */
function topicFigures(row, topic) {
  const problems = problemsOf(row).filter((problem) => problem.topics.includes(topic));
  return {
    solved: topicSolved(row).get(topic) || 0, attempted: problems.length,
    attempts: sum(problems, (problem) => problem.attempts), accepted: sum(problems, (problem) => problem.accepted),
  };
}

function weeksOf(row) {
  const weeks = new Map();
  for (const [day, value] of row.days) {
    const key = weekStart(day);
    const week = weeks.get(key) || { days: 0, submissions: 0, accepted: 0 };
    week.days += 1;
    week.submissions += value.attempts;
    week.accepted += value.accepted;
    weeks.set(key, week);
  }
  return weeks;
}

const FUNNEL_STAGES = [
  { name: 'Students', test: () => true },
  { name: 'Started practising', test: (row) => row.coding.submissions > 0 },
  { name: 'Solved a problem', test: (row) => row.coding.solved.total > 0 },
  { name: 'Solved a Medium', test: (row) => row.coding.solved.Medium > 0 },
  { name: 'Solved a Hard', test: (row) => row.coding.solved.Hard > 0 },
];
const furthestStage = (row) => FUNNEL_STAGES[FUNNEL_STAGES.findLastIndex((stage) => stage.test(row))].name;
const lastPracticeText = (row) => (row.coding.daysSinceActive === null ? 'Never' : row.coding.daysSinceActive === 0 ? 'Today' : `${row.coding.daysSinceActive} days ago`);

const solvedColumns = [count('easy', 'Easy solved'), count('medium', 'Medium solved'), count('hard', 'Hard solved'), count('solvedTotal', 'Problems solved')];
const solvedValues = (row) => ({ easy: row.coding.solved.Easy, medium: row.coding.solved.Medium, hard: row.coding.solved.Hard, solvedTotal: row.coding.solved.total });

const topicDrill = {
  label: (key) => (key ? `Topic: ${key}` : 'Every topic'),
  students(rows, key) {
    if (key) {
      return {
        sort: 'solvedHere',
        columns: [count('solvedHere', `Solved in ${key}`), count('attemptedHere', `Attempted in ${key}`), count('submissionsHere', 'Submissions in this topic'), percent('accuracyHere', 'Accuracy in this topic %'), count('solvedTotal', 'Problems solved (all topics)')],
        items: rows.filter((row) => topicSolved(row).has(key)).map((row) => {
          const figures = topicFigures(row, key);
          return { row, values: { solvedHere: figures.solved, attemptedHere: figures.attempted, submissionsHere: figures.attempts, accuracyHere: percentOne(figures.accepted, figures.attempts), solvedTotal: row.coding.solved.total } };
        }),
      };
    }
    return {
      sort: 'topicsSolved',
      columns: [count('topicsSolved', 'Topics solved in'), count('topicsAttempted', 'Topics attempted'), count('solvedTotal', 'Problems solved'), text('topicList', 'Topics solved', 50)],
      items: rows.map((row) => {
        const solved = topicSolved(row);
        const attempted = new Set(problemsOf(row).flatMap((problem) => problem.topics));
        return { row, values: { topicsSolved: solved.size, topicsAttempted: attempted.size, solvedTotal: row.coding.solved.total, topicList: [...solved.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => `${name} (${value})`).join(', ') } };
      }),
    };
  },
  detail(rows, key) {
    if (key) return problemDetail(rows, (problem) => problem.topics.includes(key), `Problems in ${key}`);
    const items = [];
    for (const row of rows) {
      const names = new Set(problemsOf(row).flatMap((problem) => problem.topics));
      for (const name of names) {
        const figures = topicFigures(row, name);
        items.push({ row, values: { topic: name, solved: figures.solved, attempted: figures.attempted, attempts: figures.attempts, accuracy: percentOne(figures.accepted, figures.attempts) } });
      }
    }
    return { title: 'Student × topic', columns: [text('topic', 'Topic', 26), count('solved', 'Problems solved'), count('attempted', 'Problems attempted'), count('attempts', 'Submissions'), percent('accuracy', 'Accuracy %')], items };
  },
};

/** "who|series" part keys of bar segments: who is a student id, a group label or "*" (all). */
export function splitKey(key) {
  const text = String(key || '');
  const at = text.lastIndexOf('|');
  return at < 0 ? [text, ''] : [text.slice(0, at), text.slice(at + 1)];
}

const DRILLS = {
  'top-students': {
    // A bar segment is one student's work at one difficulty ("<id>|Hard"); a legend chip is that
    // difficulty for everyone ("*|Hard"). With no key: every student who practised, ranked.
    label: (key, rows) => {
      const [who, level] = splitKey(key);
      if (!DIFFICULTIES.includes(level)) return 'Every student who practised, by Prep Score';
      const student = who !== '*' ? rows.find((row) => row.id === who) : null;
      return student ? `${student.name} · ${level} problems` : `${level} problems`;
    },
    students(rows, key) {
      const [who, level] = splitKey(key);
      if (DIFFICULTIES.includes(level)) return DRILLS['difficulty-split'].students(who && who !== '*' ? rows.filter((row) => row.id === who) : rows, level);
      return DRILLS['top-students'].ranked(rows);
    },
    detail(rows, key) {
      const [who, level] = splitKey(key);
      const scope = who && who !== '*' ? rows.filter((row) => row.id === who) : practising(rows);
      return problemDetail(scope, (problem) => !DIFFICULTIES.includes(level) || problem.difficulty === level, DIFFICULTIES.includes(level) ? `${level} problems` : 'Problems per student');
    },
    ranked(rows) {
      const ranked = practising(rows).sort(byScore);
      return {
        sort: 'rank', direction: 'asc',
        columns: [count('rank', 'Rank', 7), count('allEasy', 'Easy solved (all time)'), count('allMedium', 'Medium solved (all time)'), count('allHard', 'Hard solved (all time)'),
          percent('shareEasy', 'Score from Easy %'), percent('shareMedium', 'Score from Medium %'), percent('shareHard', 'Score from Hard %'),
          ...solvedColumns.map((column) => ({ ...column, label: `${column.label} (period)` })), percent('accuracy', 'Accuracy %'), text('lastPractice', 'Last practice', 12)],
        items: ranked.map((row, index) => {
          const points = sum(DIFFICULTIES, (level) => row.coding.points[level]);
          const share = (level) => percentOne(row.coding.points[level], points);
          const counts = row.coding.scoredCounts || {};
          return { row, values: { rank: index + 1, allEasy: counts.Easy || 0, allMedium: counts.Medium || 0, allHard: counts.Hard || 0, shareEasy: share('Easy'), shareMedium: share('Medium'), shareHard: share('Hard'), ...solvedValues(row), accuracy: row.coding.accuracy, lastPractice: lastPracticeText(row) } };
        }),
      };
    },
  },
  'difficulty-split': {
    label: (key) => (key ? `${key} problems` : 'Every difficulty'),
    students(rows, key) {
      if (DIFFICULTIES.includes(key)) {
        return {
          sort: 'solvedHere',
          columns: [count('solvedHere', `${key} solved`), count('attemptedHere', `${key} attempted`), percent('accuracyHere', `${key} accuracy %`), count('solvedTotal', 'Problems solved (all levels)')],
          items: rows.filter((row) => row.coding.solved[key] > 0).map((row) => {
            const problems = problemsOf(row).filter((problem) => problem.difficulty === key);
            return { row, values: { solvedHere: row.coding.solved[key], attemptedHere: problems.length, accuracyHere: percentOne(sum(problems, (problem) => problem.accepted), sum(problems, (problem) => problem.attempts)), solvedTotal: row.coding.solved.total } };
          }),
        };
      }
      return { sort: 'solvedTotal', columns: [...solvedColumns, percent('accuracy', 'Accuracy %')], items: rows.map((row) => ({ row, values: { ...solvedValues(row), accuracy: row.coding.accuracy } })) };
    },
    detail: (rows, key) => problemDetail(rows, (problem) => !DIFFICULTIES.includes(key) || problem.difficulty === key, DIFFICULTIES.includes(key) ? `${key} problems per student` : 'Problems per student'),
  },
  'topic-strength': topicDrill,
  'student-profile': topicDrill,
  'topic-heatmap': topicDrill,
  'failure-reasons': {
    label: (key) => (VERDICT_LABELS[key] ? `Submissions: ${VERDICT_LABELS[key]}` : 'Every result'),
    students(rows, key) {
      if (VERDICT_LABELS[key]) {
        return {
          sort: 'countHere',
          columns: [count('countHere', `${VERDICT_LABELS[key]} (submissions)`), percent('shareHere', 'Share of their submissions %'), count('problemsHere', 'Problems affected'), count('submissions', 'All submissions')],
          items: rows.map((row) => {
            const problems = problemsOf(row).filter((problem) => problem.verdicts[key] > 0);
            const here = sum(problems, (problem) => problem.verdicts[key]);
            return here ? { row, values: { countHere: here, shareHere: percentOne(here, row.coding.submissions), problemsHere: problems.length, submissions: row.coding.submissions } } : null;
          }).filter(Boolean),
        };
      }
      return {
        sort: 'submissions',
        columns: [count('submissions', 'Submissions'), ...VERDICTS.map((verdict) => count(`verdict_${verdict}`, VERDICT_LABELS[verdict])), percent('accuracy', 'Accuracy %')],
        items: practising(rows).map((row) => ({ row, values: { submissions: row.coding.submissions, ...Object.fromEntries(VERDICTS.map((verdict) => [`verdict_${verdict}`, sum(problemsOf(row), (problem) => problem.verdicts[verdict])])), accuracy: row.coding.accuracy } })),
      };
    },
    detail: (rows, key) => problemDetail(rows, (problem) => !VERDICT_LABELS[key] || problem.verdicts[key] > 0, VERDICT_LABELS[key] ? `Problems with “${VERDICT_LABELS[key]}”` : 'Problems per student'),
  },
  'language-usage': {
    detailLabel: 'Languages',
    label: (key) => (key ? `Language: ${languageName(key)}` : 'Every language'),
    students(rows, key) {
      if (key) {
        return {
          sort: 'submissionsHere',
          columns: [count('submissionsHere', `Submissions in ${languageName(key)}`), count('attemptedHere', 'Problems attempted'), count('solvedHere', 'Problems solved'), percent('accuracyHere', 'Accuracy %'), text('languages', 'All languages used', 18)],
          items: rows.filter((row) => row.coding.languages.includes(key)).map((row) => {
            const entries = row.entries.filter((entry) => entry.language === key);
            const submissions = sum(entries, (entry) => entry.attempts);
            const accepted = sum(entries, (entry) => entry.accepted);
            return { row, values: { submissionsHere: submissions, attemptedHere: new Set(entries.map((entry) => entry.problemId)).size, solvedHere: new Set(entries.filter((entry) => entry.accepted > 0).map((entry) => entry.problemId)).size, accuracyHere: percentOne(accepted, submissions), languages: row.coding.languages.map(languageName).join(', ') } };
          }),
        };
      }
      return {
        sort: 'languageCount',
        columns: [count('languageCount', 'Languages used'), text('languages', 'Languages', 22), count('submissions', 'Submissions')],
        items: practising(rows).map((row) => ({ row, values: { languageCount: row.coding.languages.length, languages: row.coding.languages.map(languageName).join(', '), submissions: row.coding.submissions } })),
      };
    },
    detail(rows, key) {
      const items = [];
      for (const row of rows) {
        const byLanguage = new Map();
        for (const entry of row.entries) {
          if (key && entry.language !== key) continue;
          const language = byLanguage.get(entry.language) || { submissions: 0, accepted: 0, problems: new Set(), solved: new Set() };
          language.submissions += entry.attempts;
          language.accepted += entry.accepted;
          language.problems.add(entry.problemId);
          if (entry.accepted > 0) language.solved.add(entry.problemId);
          byLanguage.set(entry.language, language);
        }
        for (const [language, figures] of byLanguage) {
          items.push({ row, values: { language: languageName(language), submissions: figures.submissions, attempted: figures.problems.size, solved: figures.solved.size, accuracy: percentOne(figures.accepted, figures.submissions) } });
        }
      }
      return { title: 'Student × language', columns: [text('language', 'Language', 12), count('submissions', 'Submissions'), count('attempted', 'Problems attempted'), count('solved', 'Problems solved'), percent('accuracy', 'Accuracy %')], items };
    },
  },
  'score-spread': {
    label: (key) => {
      const index = Number(key);
      return Number.isInteger(index) && SCORE_BANDS[index] !== undefined ? `Prep Score ${index === SCORE_BANDS.length - 1 ? `${SCORE_BANDS[index]}+` : `${SCORE_BANDS[index]}–${SCORE_BANDS[index + 1]}`}` : 'Every score band';
    },
    students(rows, key) {
      const index = key === null || key === '' ? null : Number(key);
      const band = (row) => {
        const at = scoreBandOf(row.coding.prepScore);
        return at === SCORE_BANDS.length - 1 ? `${SCORE_BANDS[at]}+` : `${SCORE_BANDS[at]}–${SCORE_BANDS[at + 1]}`;
      };
      return {
        sort: 'score',
        columns: [decimal('score', 'Prep Score'), text('band', 'Score band', 10), ...solvedColumns, percent('accuracy', 'Accuracy %')],
        items: practising(rows).filter((row) => index === null || scoreBandOf(row.coding.prepScore) === index)
          .map((row) => ({ row, values: { score: row.coding.prepScore, band: band(row), ...solvedValues(row), accuracy: row.coding.accuracy } })),
      };
    },
  },
  'tough-problems': {
    label: (key, rows) => {
      if (!key) return 'Every problem with failed attempts';
      for (const row of rows) for (const entry of row.entries) if (entry.problemId === key) return `Problem: ${entry.meta.title}`;
      return 'Problem';
    },
    students(rows, key) {
      if (key) {
        return {
          sort: 'failed',
          columns: [count('attempts', 'Submissions'), count('failed', 'Failed attempts'), ...VERDICTS.filter((verdict) => verdict !== 'AC').map((verdict) => count(`verdict_${verdict}`, VERDICT_LABELS[verdict])), text('solved', 'Solved', 8), text('languages', 'Languages', 14)],
          items: rows.map((row) => {
            const problem = problemsOf(row).find((entry) => entry.problemId === key);
            return problem ? { row, values: { attempts: problem.attempts, failed: problem.attempts - problem.accepted, ...Object.fromEntries(VERDICTS.filter((verdict) => verdict !== 'AC').map((verdict) => [`verdict_${verdict}`, problem.verdicts[verdict]])), solved: yes(problem.solved), languages: problem.languages.map(languageName).join(', ') } } : null;
          }).filter(Boolean),
        };
      }
      return {
        sort: 'failed',
        columns: [count('failed', 'Failed attempts'), count('problemsFailed', 'Problems with a failed attempt'), count('neverSolved', 'Of those, never solved'), count('submissions', 'All submissions')],
        items: rows.map((row) => {
          const problems = problemsOf(row).filter((problem) => problem.attempts > problem.accepted);
          return problems.length ? { row, values: { failed: sum(problems, (problem) => problem.attempts - problem.accepted), problemsFailed: problems.length, neverSolved: problems.filter((problem) => !problem.solved).length, submissions: row.coding.submissions } } : null;
        }).filter(Boolean),
      };
    },
    detail: (rows, key) => problemDetail(rows, (problem) => (key ? problem.problemId === key : problem.attempts > problem.accepted), key ? 'Submissions on this problem' : 'Problems with failed attempts'),
  },
  'practice-trend': {
    detailLabel: 'Weeks',
    label: (key) => (key ? `Week of ${key}` : 'Every week'),
    students(rows, key) {
      if (key) {
        return {
          sort: 'submissionsHere',
          columns: [count('daysHere', 'Days practised that week'), count('submissionsHere', 'Submissions that week'), count('acceptedHere', 'Accepted that week')],
          items: rows.map((row) => {
            const week = weeksOf(row).get(key);
            return week ? { row, values: { daysHere: week.days, submissionsHere: week.submissions, acceptedHere: week.accepted } } : null;
          }).filter(Boolean),
        };
      }
      return {
        sort: 'submissions',
        columns: [count('weeks', 'Weeks practised'), count('activeDays', 'Days practised'), count('submissions', 'Submissions'), text('lastPractice', 'Last practice', 12)],
        items: practising(rows).map((row) => ({ row, values: { weeks: weeksOf(row).size, activeDays: row.coding.activeDays, submissions: row.coding.submissions, lastPractice: lastPracticeText(row) } })),
      };
    },
    detail(rows, key) {
      const items = [];
      for (const row of rows) {
        for (const [week, figures] of weeksOf(row)) if (!key || week === key) items.push({ row, values: { week, days: figures.days, submissions: figures.submissions, accepted: figures.accepted } });
      }
      return { title: 'Student × week', columns: [text('week', 'Week of', 12), count('days', 'Days practised'), count('submissions', 'Submissions'), count('accepted', 'Accepted')], items };
    },
  },
  'activity-calendar': {
    label: (key) => (key ? `Day: ${key}` : 'Every day'),
    students(rows, key) {
      if (key) {
        return {
          sort: 'submissionsHere',
          columns: [count('submissionsHere', 'Submissions that day'), count('acceptedHere', 'Accepted that day')],
          items: rows.map((row) => {
            const day = row.days.get(key);
            return day ? { row, values: { submissionsHere: day.attempts, acceptedHere: day.accepted } } : null;
          }).filter(Boolean),
        };
      }
      return {
        sort: 'activeDays',
        columns: [count('activeDays', 'Days practised'), count('submissions', 'Submissions'), text('lastPractice', 'Last practice', 12)],
        items: practising(rows).map((row) => ({ row, values: { activeDays: row.coding.activeDays, submissions: row.coding.submissions, lastPractice: lastPracticeText(row) } })),
      };
    },
  },
  'practice-funnel': {
    label: (key) => FUNNEL_STAGES[Number(key)]?.name || 'Every step',
    students(rows, key) {
      const stage = FUNNEL_STAGES[Number(key)];
      return {
        sort: 'solvedTotal',
        columns: [text('furthest', 'Furthest step', 18), count('submissions', 'Submissions'), ...solvedColumns],
        items: rows.filter((row) => !stage || stage.test(row)).map((row) => ({ row, values: { furthest: furthestStage(row), submissions: row.coding.submissions, ...solvedValues(row) } })),
      };
    },
  },
  'needs-attention': {
    // "listed": stopped practising (longest away first); "never": never practised.
    label: (key) => (key === 'never' ? 'Never practised' : key === 'listed' ? 'Stopped practising' : 'Stopped or never practised'),
    students(rows, key) {
      const { listed, never } = ATTENTION_GROUPS['needs-attention'];
      const test = key === 'never' ? never : key === 'listed' ? listed : (row) => listed(row) || never(row);
      return {
        sort: 'daysAway', direction: 'desc',
        columns: [count('daysAway', 'Days since last practice'), text('lastPractice', 'Last practice', 12), decimal('score', 'Prep Score'), count('submissions', 'Submissions'), count('solvedTotal', 'Problems solved')],
        items: rows.filter(test).map((row) => ({ row, values: { daysAway: row.coding.daysSinceActive, lastPractice: lastPracticeText(row), score: row.coding.prepScore, submissions: row.coding.submissions, solvedTotal: row.coding.solved.total } })),
      };
    },
  },
  'group-breakdown': {
    // "<group>|<difficulty>" is one segment, "*|Hard" a legend chip, "<group>" a whole bar.
    label: (key) => {
      const [group, level] = splitKey(key);
      return [group && group !== '*' ? group : '', level ? `${level} solved` : ''].filter(Boolean).join(' · ') || 'Every group';
    },
    students(rows, key, options) {
      const getter = (GROUP_BY[options.groupBy] || GROUP_BY.semester).get;
      const [group, level] = splitKey(key);
      return {
        sort: DIFFICULTIES.includes(level) ? level.toLowerCase() : 'solvedTotal',
        columns: [text('groupLabel', (GROUP_BY[options.groupBy] || GROUP_BY.semester).label, 14), ...solvedColumns],
        items: rows
          .filter((row) => !group || group === '*' || (getter(row) || 'Not set') === group)
          .filter((row) => !DIFFICULTIES.includes(level) || row.coding.solved[level] > 0)
          .map((row) => ({ row, values: { groupLabel: getter(row) || 'Not set', ...solvedValues(row) } })),
      };
    },
    detail(rows, key, options) {
      const getter = (GROUP_BY[options.groupBy] || GROUP_BY.semester).get;
      const [group, level] = splitKey(key);
      const scope = rows.filter((row) => !group || group === '*' || (getter(row) || 'Not set') === group);
      return problemDetail(scope, (problem) => !DIFFICULTIES.includes(level) || (problem.difficulty === level && problem.solved), level ? `${level} problems solved` : 'Problems per student');
    },
  },
};

Object.assign(DRILLS, FEATURE_DRILLS);

/** The part key for "every student the chart covers", whatever their activity. */
export const ALL_STUDENTS = '__all__';

/** The drill for a chart, or null when the chart lists every student generically. */
export const drillFor = (chartId) => DRILLS[chartId] || null;

/** What one row of a chart's detail table is (the popup's second tab), or null without one. */
export function detailLabel(chartId, key) {
  const drill = key === ALL_STUDENTS ? null : drillFor(chartId);
  if (!drill?.detail || (drill.hasDetail && !drill.hasDetail(key))) return null;
  if (drill === topicDrill) return key ? 'Problems' : 'Topics';
  return FEATURE_DETAIL_LABELS[chartId] || drill.detailLabel || 'Problems';
}
export const DRILL_CHART_IDS = Object.freeze(Object.keys(DRILLS));

// ---------------------------------------------------------------- tables

const MODULE_SCORE = {
  coding: { label: 'Prep Score', get: (row) => row.coding.prepScore },
  learning: { label: 'Prep Learning score', get: (row) => row.scores?.features.learning?.score ?? 0 },
  interview: { label: 'Prep Interview score', get: (row) => row.scores?.features.interview?.score ?? 0 },
  assessment: { label: 'Prep Assessment score', get: (row) => row.scores?.features.assessment?.score ?? 0 },
};
const STUDENT_COLUMNS = [
  { ...text('name', 'Student name', 24), get: (row) => row.name },
  { ...text('studentId', 'Student ID', 14), get: (row) => row.studentId },
  { ...count('semester', 'Semester', 9), get: (row) => row.student.semester },
  { ...text('branch', 'Branch', 14), get: (row) => row.student.branch },
  { ...text('group', 'Group / Section', 12), get: (row) => row.student.group },
];
const DETAIL_STUDENT_COLUMNS = STUDENT_COLUMNS.slice(0, 2);
const plain = ({ get, ...column }) => column;

/**
 * The students behind a chart, or behind one part of it (`key`): { label, sort, direction,
 * columns, items: [{ id, row, values }] }. `generic` (the chart's area columns from the
 * download catalogue) covers charts without their own drill; `context` holds the sheet and
 * test catalogues ({ sheets, tests }).
 */
export function drillStudents(chart, rows, key, options = {}, generic = null, context = {}) {
  const score = MODULE_SCORE[chart.module] || MODULE_SCORE.coding;
  const base = [...STUDENT_COLUMNS, { ...decimal('prepScore', score.label), get: score.get }];
  // ALL_STUDENTS lists everyone the chart covers, even with no activity (an empty chart's list).
  const drill = key === ALL_STUDENTS ? null : drillFor(chart.id);
  const part = drill
    ? drill.students(rows, key || null, options, context)
    : { sort: 'prepScore', columns: (generic || []).map(plain), items: rows.map((row) => ({ row, values: Object.fromEntries((generic || []).map((column) => [column.key, column.get(row, { positions: new Map() }) ?? null])) })) };
  return {
    label: drill ? drill.label(key || null, rows, context) : 'Every student in view',
    sort: part.sort || 'prepScore',
    direction: part.direction || 'desc',
    columns: [...base.map(plain), ...part.columns],
    items: part.items.map(({ row, values }) => ({ id: row.id, row, values: { ...Object.fromEntries(base.map((column) => [column.key, column.get(row) ?? null])), ...values } })),
  };
}

/** One row per student and problem (or topic, language, week) behind a chart, or null. */
export function drillDetail(chart, rows, key, options = {}, context = {}) {
  const drill = key === ALL_STUDENTS ? null : drillFor(chart.id);
  if (!drill?.detail || (drill.hasDetail && !drill.hasDetail(key || null))) return null;
  const detail = drill.detail(rows, key || null, options, context);
  if (!detail) return null;
  return {
    title: detail.title,
    columns: [...DETAIL_STUDENT_COLUMNS.map(plain), ...detail.columns],
    items: detail.items.map(({ row, values }) => ({ id: row.id, values: { ...Object.fromEntries(DETAIL_STUDENT_COLUMNS.map((column) => [column.key, column.get(row) ?? null])), ...values } })),
  };
}

/** Sorts in place by a column; text sorts A–Z, numbers by value, empty cells always last. */
export function sortItems(items, columns, sortKey, direction = 'desc') {
  const column = columns.find((entry) => entry.key === sortKey) || columns[0];
  const factor = direction === 'asc' ? 1 : -1;
  const numeric = column.kind !== 'text';
  return items.sort((left, right) => {
    const a = left.values[column.key];
    const b = right.values[column.key];
    if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
    if (b === null || b === undefined || b === '') return -1;
    const order = numeric ? (Number(a) - Number(b)) : String(a).localeCompare(String(b), undefined, { numeric: true });
    return factor * order || String(left.values.name || '').localeCompare(String(right.values.name || ''));
  });
}
