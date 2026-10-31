// Prep Analysis charts. Each chart answers one plain question for a coordinator
// and is computed from the students that passed the page filter AND the chart's
// own filter. Nothing here averages the whole cohort: charts show individual
// students, counts and spreads. Builders return plain data; the browser turns it
// into an ECharts option, so the API stays renderer-neutral.

import { PASS_PERCENT } from './assessmentFacts.js';
import { RATINGS } from './interviewFacts.js';
import { DIFFICULTIES } from './ranking.js';

export const GROUP_BY = Object.freeze({
  semester: { label: 'Semester', get: (row) => (row.student.semester ? `Sem ${row.student.semester}` : '') },
  branch: { label: 'Branch', get: (row) => row.student.branch },
  course: { label: 'Course', get: (row) => row.student.course },
  college: { label: 'College / University', get: (row) => row.student.college },
  group: { label: 'Group / Section', get: (row) => row.student.group },
});

const NOT_SET = 'Not set';
export const practising = (rows) => rows.filter((row) => row.coding.submissions > 0);
export const byScore = (left, right) => right.coding.prepScore - left.coding.prepScore || left.name.localeCompare(right.name);
// Lower edges of the Prep Score bands in "How Prep Scores are spread".
// Prep Score bands for the default values (a steady student is around 10–40); the score has no ceiling.
export const SCORE_BANDS = [0, 2.5, 5, 10, 20, 40, 80, 160];
export const VERDICT_LABELS = Object.freeze({ AC: 'Accepted', WA: 'Wrong answer', TLE: 'Too slow', RE: 'Crashed', CE: 'Did not compile' });
export const scoreBandOf = (score) => SCORE_BANDS.findLastIndex((from) => score >= from);
const clampLimit = (value, fallback, max) => Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));

/**
 * A card shows the first `limit` items. The chart's full page (`options.full`) shows every item,
 * `pageSize` at a time, with { page, pages, total, offset } so it can page through them. A
 * download (`options.everything`, set by the server only) takes every item at once.
 */
export function pageItems(list, options, { fallback, max, pageSize = 100 }) {
  if (options.everything) return { items: list, pagination: null };
  if (!options.full) return { items: list.slice(0, clampLimit(options.limit, fallback, max)), pagination: null };
  const pages = Math.max(1, Math.ceil(list.length / pageSize));
  const page = Math.min(pages, Math.max(1, Number.parseInt(options.page, 10) || 1));
  const offset = (page - 1) * pageSize;
  return { items: list.slice(offset, offset + pageSize), pagination: { page, pages, total: list.length, pageSize, offset } };
}

function groupRows(rows, groupBy, maxGroups = 12) {
  const getter = (GROUP_BY[groupBy] || GROUP_BY.semester).get;
  const groups = new Map();
  for (const row of rows) {
    const label = getter(row) || NOT_SET;
    groups.set(label, [...(groups.get(label) || []), row]);
  }
  return [...groups.entries()]
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], undefined, { numeric: true }))
    .slice(0, maxGroups)
    .sort((left, right) => left[0].localeCompare(right[0], undefined, { numeric: true }));
}

/** A problem's topics, or its tags when it has no topics. */
export const entryTopics = (entry) => (entry.meta.topics.length ? entry.meta.topics : entry.meta.tags);
/** part / whole as a percentage with one decimal. */
export const percentOne = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** Distinct solved problems per topic for one student (cached on the row). */
export function topicSolved(row) {
  if (row.topicSolvedCache) return row.topicSolvedCache;
  const counts = new Map();
  const seen = new Set();
  for (const entry of row.entries) {
    if (entry.accepted <= 0 || seen.has(entry.problemId)) continue;
    seen.add(entry.problemId);
    for (const name of entryTopics(entry)) counts.set(name, (counts.get(name) || 0) + 1);
  }
  row.topicSolvedCache = counts;
  return counts;
}

/**
 * Per topic across students: Map(name -> { students, solved, attempted, attempts, accepted }).
 * `students` solved at least one problem in it, `attempted` tried one, `solved` adds every
 * student's distinct solves.
 */
export function topicStats(rows) {
  const topics = new Map();
  for (const row of rows) {
    const solvedHere = topicSolved(row);
    const touched = new Set();
    for (const entry of row.entries) {
      for (const name of entryTopics(entry)) {
        const topic = topics.get(name) || { students: 0, solved: 0, attempted: 0, attempts: 0, accepted: 0 };
        topic.attempts += entry.attempts;
        topic.accepted += entry.accepted;
        if (!touched.has(name)) {
          touched.add(name);
          topic.attempted += 1;
          if (solvedHere.has(name)) { topic.students += 1; topic.solved += solvedHere.get(name); }
        }
        topics.set(name, topic);
      }
    }
  }
  return topics;
}

// A large cohort has hundreds of thousands of practice days but only a few hundred distinct ones.
const weekStarts = new Map();
export function weekStart(day) {
  let week = weekStarts.get(day);
  if (!week) {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    week = date.toISOString().slice(0, 10);
    if (weekStarts.size > 5000) weekStarts.clear();
    weekStarts.set(day, week);
  }
  return week;
}

/** One year of daily totals ending at the period end: { from, to, unit, days: [[day, value]], max }. */
export function calendarPayload(totals, range, unit) {
  const end = (range?.to || new Date()).toISOString().slice(0, 10);
  const startDate = new Date(`${end}T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 364);
  const start = startDate.toISOString().slice(0, 10);
  const days = [...totals.entries()].filter(([day, value]) => day >= start && day <= end && value > 0).sort(([left], [right]) => left.localeCompare(right));
  return { from: start, to: end, unit, days, max: Math.max(1, ...days.map(([, value]) => value)) };
}

/**
 * A Prep Score split by difficulty. The score grows slower than the points behind it, so the bar is
 * the score itself and each difficulty gets its share of the points: the parts always add up to the
 * score and longer bars always mean higher scores.
 */
export function scoreSegments(score, points) {
  const total = DIFFICULTIES.reduce((sum, level) => sum + (points?.[level] || 0), 0);
  if (!(score > 0) || !(total > 0)) return Object.fromEntries(DIFFICULTIES.map((level) => [level, 0]));
  const round = (value) => Math.round(value * 100) / 100;
  const segments = Object.fromEntries(DIFFICULTIES.map((level) => [level, round((score * (points[level] || 0)) / total)]));
  // Rounding leftovers go to the largest part so the parts still add up to the score.
  const largest = DIFFICULTIES.reduce((best, level) => ((points[level] || 0) > (points[best] || 0) ? level : best));
  segments[largest] = round(segments[largest] + score - DIFFICULTIES.reduce((sum, level) => sum + segments[level], 0));
  return segments;
}

/**
 * A "needs attention" list: bars for the `listed` students (in `order`), and two chips (how
 * many are listed, how many `never` started), each a part with its own student list. Students
 * who never started are often most of a cohort and all at zero, so they are never bars.
 */
export function attentionList(rows, { options, valueLabel, listed, never, order, item, chips, unit }) {
  const shown = rows.filter(listed).sort((left, right) => order(left, right) || left.name.localeCompare(right.name));
  const { items, pagination } = pageItems(shown, options, { fallback: 10, max: 100 });
  const neverCount = rows.filter(never).length;
  return {
    valueLabel, tone: 'warning', ...(unit ? { unit } : {}), pagination, listedCount: shown.length, neverCount,
    chips: [
      { key: 'listed', label: chips.listed, value: shown.length, tone: 'warning' },
      { key: 'never', label: chips.never, value: neverCount, tone: 'muted' },
    ],
    items: items.map((row) => ({ id: row.id, name: row.name, ...item(row) })),
  };
}

/** The students behind an attention chart's chip: "listed" or "never" (same tests as the chart). */
export const ATTENTION_GROUPS = {
  'needs-attention': { listed: (row) => row.coding.practiceStatus === 'inactive', never: (row) => row.coding.practiceStatus === 'never' },
  'learning-needs-attention': { listed: (row) => Boolean(row.learning) && row.learning.status !== 'never', never: (row) => row.learning?.status === 'never' },
  'quickprep-needs-attention': { listed: (row) => row.quickprep?.started > 0, never: (row) => Boolean(row.quickprep) && !(row.quickprep.started > 0) },
  'assessment-needs-attention': { listed: (row) => row.assessment?.taken > 0 || row.assessment?.missed > 0, never: (row) => Boolean(row.assessment) && !row.assessment.taken && !row.assessment.missed },
  'interview-needs-attention': { listed: (row) => row.interview?.done > 0, never: (row) => Boolean(row.interview) && !(row.interview.done > 0) },
};


const CODING_CHARTS = [
  {
    id: 'top-students', type: 'rankedStackedBar', size: 'lg',
    title: 'Top students',
    question: 'Who leads on Prep Score, and how much comes from Easy, Medium and Hard problems?',
    options: { limit: 10 },
    build: ({ rows, options }) => {
      const { items, pagination } = pageItems(practising(rows).sort(byScore), options, { fallback: 10, max: 100 });
      return {
        pagination,
        items: items.map((row, index) => ({
          id: row.id, name: row.name, position: (pagination?.offset || 0) + index + 1, score: row.coding.prepScore,
          segments: scoreSegments(row.coding.prepScore, row.coding.points),
          // `counts` are the all-time solves behind the stored score; `solved` is the selected period.
          counts: row.coding.scoredCounts,
          solved: row.coding.solved,
        })),
      };
    },
  },
  {
    id: 'difficulty-split', type: 'donut', size: 'sm',
    title: 'Solved problems by difficulty',
    question: 'Are students solving only Easy problems, or Medium and Hard too?',
    build: ({ rows }) => ({
      centerLabel: 'problems solved',
      // `students`: how many solved at least one problem of that difficulty.
      items: DIFFICULTIES.map((difficulty) => ({
        key: difficulty, name: difficulty,
        value: rows.reduce((sum, row) => sum + row.coding.solved[difficulty], 0),
        students: rows.filter((row) => row.coding.solved[difficulty] > 0).length,
      })).filter((item) => item.value > 0),
    }),
  },
  {
    id: 'practice-trend', type: 'trend', size: 'lg',
    title: 'Practice week by week',
    question: 'Is practice growing, and how many students practise each week?',
    build: ({ rows }) => {
      const weeks = new Map();
      for (const row of rows) {
        for (const [day, value] of row.days) {
          const key = weekStart(day);
          const week = weeks.get(key) || { submissions: 0, accepted: 0, students: new Set() };
          week.submissions += value.attempts;
          week.accepted += value.accepted;
          week.students.add(row.id);
          weeks.set(key, week);
        }
      }
      const ordered = [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-26);
      return {
        labels: ordered.map(([week]) => week),
        series: [
          { name: 'Submissions', values: ordered.map(([, week]) => week.submissions) },
          { name: 'Accepted', values: ordered.map(([, week]) => week.accepted) },
          { name: 'Students practising', values: ordered.map(([, week]) => week.students.size), axis: 'right' },
        ],
      };
    },
  },
  {
    id: 'practice-funnel', type: 'funnel', size: 'sm',
    title: 'How far students get',
    question: 'From signing up to solving Hard problems, where do students stop?',
    build: ({ rows }) => ({
      stages: [
        { name: 'Students', value: rows.length },
        { name: 'Started practising', value: rows.filter((row) => row.coding.submissions > 0).length },
        { name: 'Solved a problem', value: rows.filter((row) => row.coding.solved.total > 0).length },
        { name: 'Solved a Medium', value: rows.filter((row) => row.coding.solved.Medium > 0).length },
        { name: 'Solved a Hard', value: rows.filter((row) => row.coding.solved.Hard > 0).length },
      ],
    }),
  },
  {
    id: 'topic-strength', type: 'barList', size: 'md',
    title: 'Topics students are solving',
    question: 'Which topics have the most students solving problems, and how accurately?',
    options: { limit: 12 },
    build: ({ rows, options }) => {
      const sorted = [...topicStats(rows).entries()].filter(([, topic]) => topic.students > 0)
        .sort((left, right) => right[1].students - left[1].students || left[0].localeCompare(right[0]));
      // Every topic fits on the full page at once.
      const { items, pagination } = pageItems(sorted, options, { fallback: 12, max: 100, pageSize: 2000 });
      return {
        valueLabel: 'students solving',
        cohort: rows.length,
        pagination,
        items: items.map(([name, topic]) => ({
          key: name, name, value: topic.students, pct: percentOne(topic.students, rows.length),
          attempted: topic.attempted, solved: topic.solved, accuracy: percentOne(topic.accepted, topic.attempts),
          note: `${percentOne(topic.students, rows.length)}% of students · ${percentOne(topic.accepted, topic.attempts)}% accurate`,
        })),
      };
    },
  },
  {
    id: 'needs-attention', type: 'barList', size: 'md',
    title: 'Students who need attention',
    question: 'Who stopped practising, and for how long?',
    options: { limit: 10 },
    // Bars: students who practised and then stopped, longest away first. Students who never
    // started are a chip (often most of a cohort, and all at zero, so never bars).
    build: ({ rows, options }) => attentionList(rows, {
      options, valueLabel: 'days since last practice', ...ATTENTION_GROUPS['needs-attention'],
      order: (left, right) => right.coding.daysSinceActive - left.coding.daysSinceActive || left.coding.prepScore - right.coding.prepScore,
      item: (row) => ({ value: row.coding.daysSinceActive, note: `Prep Score ${row.coding.prepScore} · ${row.coding.solved.total} solved`, daysSinceActive: row.coding.daysSinceActive }),
      chips: { listed: 'Stopped practising', never: 'Never practised' },
    }),
  },
  {
    id: 'activity-calendar', type: 'calendar', size: 'full',
    title: 'Daily practice',
    question: 'On which days do students practise, and where are the gaps?',
    build: ({ rows, range }) => {
      const totals = new Map();
      for (const row of rows) for (const [day, value] of row.days) totals.set(day, (totals.get(day) || 0) + value.attempts);
      return calendarPayload(totals, range, 'submissions');
    },
  },
  {
    id: 'student-profile', type: 'radar', size: 'sm',
    title: 'Student skill profile',
    question: 'Which topics have students covered, and how does one student compare?',
    options: { studentId: '', limit: 8 },
    // No student picked: the filtered students as a whole (share who solved in each topic).
    // A picked student: their solves per topic next to the filtered students' average.
    build: ({ rows, options }) => {
      const limit = Math.max(3, clampLimit(options.limit, 8, 12));
      const stats = topicStats(rows);
      const cohort = rows.length;
      const describe = (name) => {
        const topic = stats.get(name) || { students: 0, solved: 0, attempts: 0, accepted: 0 };
        return {
          name, students: topic.students, pct: percentOne(topic.students, cohort),
          avgSolved: cohort ? Math.round((topic.solved / cohort) * 100) / 100 : 0,
          accuracy: percentOne(topic.accepted, topic.attempts),
        };
      };
      if (!options.studentId) {
        const topics = [...stats.entries()].filter(([, topic]) => topic.students > 0)
          .sort((left, right) => right[1].students - left[1].students || left[0].localeCompare(right[0])).slice(0, limit)
          .map(([name]) => describe(name));
        return {
          mode: 'cohort', cohort, student: null, unit: '%',
          indicators: topics.map((topic) => ({ name: topic.name, max: 100 })),
          values: topics.map((topic) => topic.pct),
          topics,
        };
      }
      const student = rows.find((row) => row.id === options.studentId);
      if (!student) return { mode: 'student', cohort, student: null, missing: true, unit: 'solved', indicators: [], values: [], topics: [] };
      const attempted = new Map();
      for (const entry of student.entries) {
        for (const name of entryTopics(entry)) attempted.set(name, (attempted.get(name) || 0) + entry.attempts);
      }
      const solved = topicSolved(student);
      const topics = [...attempted.entries()].sort((left, right) => right[1] - left[1]).slice(0, limit)
        .map(([name]) => ({ ...describe(name), studentSolved: solved.get(name) || 0 }));
      const max = Math.max(1, ...topics.flatMap((topic) => [topic.studentSolved, topic.avgSolved]));
      return {
        mode: 'student', cohort, unit: 'solved',
        student: { id: student.id, name: student.name, score: student.coding.prepScore, solved: student.coding.solved },
        indicators: topics.map((topic) => ({ name: topic.name, max })),
        values: topics.map((topic) => topic.studentSolved),
        average: topics.map((topic) => topic.avgSolved),
        topics,
      };
    },
  },
  {
    id: 'failure-reasons', type: 'donut', size: 'sm',
    title: 'Why submissions fail',
    question: 'Wrong answers, too slow, crashes or code that does not compile?',
    build: ({ rows }) => {
      const totals = Object.fromEntries(Object.keys(VERDICT_LABELS).map((key) => [key, { value: 0, students: 0 }]));
      for (const row of rows) {
        const seen = new Set();
        for (const entry of row.entries) {
          for (const key of Object.keys(totals)) {
            const count = entry.verdicts?.[key] || 0;
            totals[key].value += count;
            if (count && !seen.has(key)) { seen.add(key); totals[key].students += 1; }
          }
        }
      }
      return {
        centerLabel: 'submissions',
        items: Object.entries(totals).filter(([, total]) => total.value > 0).map(([key, total]) => ({ key, name: VERDICT_LABELS[key], value: total.value, students: total.students })),
      };
    },
  },
  {
    id: 'language-usage', type: 'donut', size: 'sm',
    title: 'Programming languages used',
    question: 'Which languages do students write their solutions in?',
    build: ({ rows }) => {
      const students = new Map();
      for (const row of rows) for (const language of row.coding.languages) students.set(language, (students.get(language) || 0) + 1);
      // A student can use several languages, so the shares are of the students who practised.
      const practised = practising(rows).length;
      return {
        centerLabel: 'students', shareOf: practised,
        items: [...students.entries()].sort((left, right) => right[1] - left[1]).map(([key, value]) => ({ key, name: key, value, students: value, pct: percentOne(value, practised) })),
      };
    },
  },
  {
    id: 'score-spread', type: 'histogram', size: 'md',
    title: 'How Prep Scores are spread',
    question: 'How many students are in each score band?',
    build: ({ rows }) => {
      // Prep Score has no ceiling, so the bands widen as scores grow.
      const bins = SCORE_BANDS.map((from, index) => ({
        key: String(index), label: index === SCORE_BANDS.length - 1 ? `${from}+` : `${from}–${SCORE_BANDS[index + 1]}`, count: 0,
      }));
      practising(rows).forEach((row) => { bins[scoreBandOf(row.coding.prepScore)].count += 1; });
      return { label: 'Prep Score', bins };
    },
  },
  {
    id: 'tough-problems', type: 'barList', size: 'md',
    title: 'Problems students struggle with',
    question: 'Which problems have the most failed attempts?',
    options: { limit: 10 },
    build: ({ rows, options }) => {
      const problems = new Map();
      for (const row of rows) {
        for (const entry of row.entries) {
          const problem = problems.get(entry.problemId) || { title: entry.meta.title, difficulty: entry.meta.difficulty, failed: 0, students: new Set(), solvers: new Set() };
          problem.failed += entry.attempts - entry.accepted;
          problem.students.add(row.id);
          if (entry.accepted > 0) problem.solvers.add(row.id);
          problems.set(entry.problemId, problem);
        }
      }
      const sorted = [...problems.entries()].filter(([, problem]) => problem.failed > 0).sort((left, right) => right[1].failed - left[1].failed || left[1].title.localeCompare(right[1].title));
      const { items, pagination } = pageItems(sorted, options, { fallback: 10, max: 100, pageSize: 200 });
      return {
        valueLabel: 'failed attempts',
        tone: 'danger',
        pagination,
        items: items.map(([problemId, problem]) => ({
          key: problemId, name: problem.title, value: problem.failed, difficulty: problem.difficulty,
          students: problem.students.size, solvers: problem.solvers.size,
          note: `${problem.solvers.size} of ${problem.students.size} students solved it`,
        })),
      };
    },
  },
  {
    id: 'group-breakdown', type: 'stackedBar', size: 'md',
    title: 'Solved problems by class',
    question: 'How many Easy, Medium and Hard problems has each semester, branch or group solved?',
    options: { groupBy: 'semester' },
    build: ({ rows, options }) => ({
      groupBy: options.groupBy || 'semester',
      series: DIFFICULTIES,
      groups: groupRows(rows, options.groupBy).map(([label, members]) => ({
        label, students: members.length,
        values: Object.fromEntries(DIFFICULTIES.map((difficulty) => [difficulty, members.reduce((sum, row) => sum + row.coding.solved[difficulty], 0)])),
      })),
    }),
  },
  {
    id: 'topic-heatmap', type: 'heatmap', size: 'full',
    title: 'Topic coverage per student',
    question: 'For the top students: how many problems has each solved in each topic?',
    options: { limit: 15 },
    build: ({ rows, options }) => {
      const students = practising(rows).sort(byScore).slice(0, clampLimit(options.limit, 15, 60));
      const totals = new Map();
      for (const row of students) for (const [name, count] of topicSolved(row)) totals.set(name, (totals.get(name) || 0) + count);
      const names = [...totals.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([name]) => name);
      return {
        unit: 'solved',
        students: students.map((row) => row.name),
        columns: names,
        cells: students.flatMap((row, y) => names.map((name, x) => [x, y, topicSolved(row).get(name) || 0])),
      };
    },
  },
];

// ---------------------------------------------------------------- Prep Learning

const learners = (rows) => rows.filter((row) => row.learning && row.learning.status !== 'never');
const lastLesson = (row) => (row.learning.daysSinceActive === null ? 'Never started'
  : row.learning.daysSinceActive === 0 ? 'Studied today' : `Last lesson ${row.learning.daysSinceActive} day${row.learning.daysSinceActive === 1 ? '' : 's'} ago`);

const LEARNING_CHARTS = [
  {
    id: 'learning-leaders', type: 'barList', size: 'md',
    title: 'Most topics completed',
    question: 'Which students have completed the most topics?',
    options: { limit: 10 },
    build: ({ rows, options }) => ({
      valueLabel: 'topics completed',
      items: learners(rows).sort((left, right) => right.learning.completedTopics - left.learning.completedTopics || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.learning.completedTopics, note: `${row.learning.progress}% of their course` })),
    }),
  },
  {
    id: 'learning-funnel', type: 'funnel', size: 'sm',
    title: 'How far through the course',
    question: 'How many students have started, and how far have they got?',
    build: ({ rows }) => {
      const withData = rows.filter((row) => row.learning);
      return {
        stages: [
          { name: 'Students', value: withData.length },
          { name: 'Started learning', value: learners(withData).length },
          { name: 'Completed 25%+', value: withData.filter((row) => row.learning.progress >= 25).length },
          { name: 'Completed 50%+', value: withData.filter((row) => row.learning.progress >= 50).length },
          { name: 'Completed 75%+', value: withData.filter((row) => row.learning.progress >= 75).length },
        ],
      };
    },
  },
  {
    id: 'learning-subjects', type: 'stackedBar', size: 'lg',
    title: 'Progress by subject',
    question: 'In each subject, how many students have finished, are studying, or have not started?',
    build: ({ rows }) => {
      const subjects = new Map();
      for (const row of rows) {
        if (!row.learning) continue;
        for (const [name, subject] of row.learning.bySubject) {
          if (!subject.total) continue;
          const entry = subjects.get(name) || { Finished: 0, 'In progress': 0, 'Not started': 0 };
          if (subject.completed >= subject.total) entry.Finished += 1;
          else if (subject.started > 0 || subject.completed > 0) entry['In progress'] += 1;
          else entry['Not started'] += 1;
          subjects.set(name, entry);
        }
      }
      return {
        series: ['Finished', 'In progress', 'Not started'],
        horizontal: true,
        groups: [...subjects.entries()].sort((left, right) => (right[1].Finished + right[1]['In progress']) - (left[1].Finished + left[1]['In progress']))
          .slice(0, 14).map(([label, values]) => ({ label, students: values.Finished + values['In progress'] + values['Not started'], values })),
      };
    },
  },
  {
    id: 'learning-trend', type: 'trend', size: 'lg',
    title: 'Topics completed week by week',
    question: 'Is learning picking up or slowing down?',
    build: ({ rows }) => {
      const weeks = new Map();
      for (const row of rows) {
        if (!row.learning) continue;
        for (const [day, completed] of row.learning.days) {
          const key = weekStart(day);
          const week = weeks.get(key) || { completed: 0, students: new Set() };
          week.completed += completed;
          week.students.add(row.id);
          weeks.set(key, week);
        }
      }
      const ordered = [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-26);
      return {
        labels: ordered.map(([week]) => week),
        series: [
          { name: 'Topics completed', values: ordered.map(([, week]) => week.completed) },
          { name: 'Students learning', values: ordered.map(([, week]) => week.students.size), axis: 'right' },
        ],
      };
    },
  },
  {
    id: 'learning-spread', type: 'histogram', size: 'md',
    title: 'How much of the course students have done',
    question: 'How many students are in each completion band?',
    build: ({ rows }) => {
      const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}%`, count: 0 }));
      learners(rows).forEach((row) => { bins[Math.min(9, Math.floor(row.learning.progress / 10))].count += 1; });
      return { label: 'Course completed', bins };
    },
  },
  {
    id: 'learning-needs-attention', type: 'barList', size: 'md',
    title: 'Students behind in learning',
    question: 'Who has completed the least of their course, and when did they last study?',
    options: { limit: 10 },
    build: ({ rows, options }) => attentionList(rows, {
      options, valueLabel: '% of course completed', unit: '%', ...ATTENTION_GROUPS['learning-needs-attention'],
      order: (left, right) => left.learning.progress - right.learning.progress,
      item: (row) => ({ value: row.learning.progress, note: lastLesson(row), daysSinceActive: row.learning.daysSinceActive }),
      chips: { listed: 'Started learning', never: 'Never started' },
    }),
  },
  {
    id: 'learning-calendar', type: 'calendar', size: 'full',
    title: 'Daily learning',
    question: 'On which days do students complete topics?',
    build: ({ rows, range }) => {
      const totals = new Map();
      for (const row of rows) if (row.learning) for (const [day, completed] of row.learning.days) totals.set(day, (totals.get(day) || 0) + completed);
      return calendarPayload(totals, range, 'topics completed');
    },
  },
];

// ---------------------------------------------------------------- Quick Prep

const sheetStarters = (rows) => rows.filter((row) => row.quickprep?.started > 0);
const lastSheetVisit = (row) => (row.quickprep.daysSinceActive === null ? 'Not opened yet'
  : row.quickprep.daysSinceActive === 0 ? 'Opened today' : `Last opened ${row.quickprep.daysSinceActive} day${row.quickprep.daysSinceActive === 1 ? '' : 's'} ago`);

const QUICKPREP_CHARTS = [
  {
    id: 'quickprep-sheets', type: 'stackedBar', size: 'lg',
    title: 'Progress by sheet',
    question: 'In each sheet, how many students have finished, are working on it, or have not started?',
    build: ({ rows, sheets }) => {
      const groups = [...(sheets?.values() || [])].filter((sheet) => sheet.published).map((sheet) => {
        const values = { Finished: 0, 'In progress': 0, 'Not started': 0 };
        for (const row of rows) {
          if (!row.quickprep || !(!sheet.semesters.length || sheet.semesters.includes(Number(row.student.semester)))) continue;
          const entry = row.quickprep.bySheet.get(sheet.id);
          if (!entry) values['Not started'] += 1;
          else if (entry.finished) values.Finished += 1;
          else values['In progress'] += 1;
        }
        return { label: sheet.title, students: values.Finished + values['In progress'] + values['Not started'], values };
      }).filter((group) => group.students > 0);
      return {
        series: ['Finished', 'In progress', 'Not started'],
        horizontal: true,
        groups: groups.sort((left, right) => (right.values.Finished + right.values['In progress']) - (left.values.Finished + left.values['In progress'])).slice(0, 14),
      };
    },
  },
  {
    id: 'quickprep-matrix', type: 'heatmap', size: 'full',
    title: 'Who is ahead in each sheet',
    question: 'For each student and sheet: how much of the sheet is solved?',
    options: { limit: 20 },
    build: ({ rows, options, sheets }) => {
      const students = sheetStarters(rows).sort((left, right) => right.quickprep.progress - left.quickprep.progress || right.quickprep.solved - left.quickprep.solved || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 20, 60));
      const counts = new Map();
      for (const row of students) for (const sheetId of row.quickprep.sheets) counts.set(sheetId, (counts.get(sheetId) || 0) + 1);
      const sheetIds = [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([id]) => id);
      return {
        unit: '% solved',
        max: 100,
        students: students.map((row) => row.name),
        columns: sheetIds.map((id) => sheets?.get(id)?.title || 'Sheet'),
        cells: students.flatMap((row, y) => sheetIds.map((id, x) => {
          const entry = row.quickprep.bySheet.get(id);
          return [x, y, entry && entry.total ? Math.round((entry.solved / entry.total) * 100) : 0];
        })),
      };
    },
  },
  {
    id: 'quickprep-leaders', type: 'barList', size: 'md',
    title: 'Most sheets finished',
    question: 'Which students have finished the most Quick Prep sheets?',
    options: { limit: 10 },
    build: ({ rows, options }) => ({
      valueLabel: 'sheets finished',
      items: sheetStarters(rows).sort((left, right) => right.quickprep.finished - left.quickprep.finished || right.quickprep.solved - left.quickprep.solved || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.quickprep.finished, note: `${row.quickprep.solved} questions solved · ${row.quickprep.progress}% of started sheets` })),
    }),
  },
  {
    id: 'quickprep-funnel', type: 'funnel', size: 'sm',
    title: 'How far students get in sheets',
    question: 'From opening a sheet to finishing one, where do students stop?',
    build: ({ rows }) => {
      const withData = rows.filter((row) => row.quickprep);
      return {
        stages: [
          { name: 'Students', value: withData.length },
          { name: 'Started a sheet', value: sheetStarters(withData).length },
          { name: 'Solved a question', value: withData.filter((row) => row.quickprep.solved > 0).length },
          { name: 'Half of a sheet', value: withData.filter((row) => [...row.quickprep.bySheet.values()].some((entry) => entry.total && entry.solved / entry.total >= 0.5)).length },
          { name: 'Finished a sheet', value: withData.filter((row) => row.quickprep.finished > 0).length },
        ],
      };
    },
  },
  {
    id: 'quickprep-spread', type: 'histogram', size: 'md',
    title: 'How much of their sheets students have solved',
    question: 'How many students are in each progress band?',
    build: ({ rows }) => {
      const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}%`, count: 0 }));
      sheetStarters(rows).forEach((row) => { bins[Math.min(9, Math.floor(row.quickprep.progress / 10))].count += 1; });
      return { label: 'Sheet progress', bins };
    },
  },
  {
    id: 'quickprep-needs-attention', type: 'barList', size: 'md',
    title: 'Students stuck in sheets',
    question: 'Who started sheets but has solved the least of them?',
    options: { limit: 10 },
    build: ({ rows, options }) => attentionList(rows, {
      options, valueLabel: '% of started sheets solved', unit: '%', ...ATTENTION_GROUPS['quickprep-needs-attention'],
      order: (left, right) => left.quickprep.progress - right.quickprep.progress,
      item: (row) => ({ value: row.quickprep.progress, note: lastSheetVisit(row), daysSinceActive: row.quickprep.daysSinceActive }),
      chips: { listed: 'Started a sheet', never: 'Never opened a sheet' },
    }),
  },
];

// ---------------------------------------------------------------- Prep Assessment

const testTakers = (rows) => rows.filter((row) => row.assessment?.taken > 0);
const lastTest = (row) => (row.assessment.daysSinceActive === null ? 'Never took a test'
  : row.assessment.daysSinceActive === 0 ? 'Test today' : `Last test ${row.assessment.daysSinceActive} day${row.assessment.daysSinceActive === 1 ? '' : 's'} ago`);

function weeklySeries(rows, read, names) {
  const weeks = new Map();
  for (const row of rows) {
    for (const [day, values] of read(row)) {
      const key = weekStart(day);
      const week = weeks.get(key) || { values: names.map(() => 0), students: new Set() };
      values.forEach((value, index) => { week.values[index] += value; });
      week.students.add(row.id);
      weeks.set(key, week);
    }
  }
  const ordered = [...weeks.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-26);
  return {
    labels: ordered.map(([week]) => week),
    series: [
      ...names.map((name, index) => ({ name, values: ordered.map(([, week]) => week.values[index]) })),
      { name: 'Students', values: ordered.map(([, week]) => week.students.size), axis: 'right' },
    ],
  };
}

const ASSESSMENT_CHARTS = [
  {
    id: 'assessment-tests', type: 'stackedBar', size: 'lg',
    title: 'Results by test',
    question: 'In each test, how many students passed, failed or missed it?',
    build: ({ rows, tests }) => {
      const groups = [...(tests?.values() || [])].map((test) => {
        const values = { Passed: 0, Failed: 0, Missed: 0 };
        for (const row of rows) {
          if (!row.assessment) continue;
          const attempt = row.assessment.byTest.get(test.id);
          if (attempt) values[attempt.percent >= PASS_PERCENT ? 'Passed' : 'Failed'] += 1;
          else if (row.assessment.missedIds.includes(test.id)) values.Missed += 1;
        }
        return { label: test.title, students: values.Passed + values.Failed + values.Missed, values, startTime: test.startTime };
      }).filter((group) => group.students > 0);
      return {
        series: ['Passed', 'Failed', 'Missed'],
        horizontal: true,
        groups: groups.sort((left, right) => new Date(right.startTime || 0) - new Date(left.startTime || 0)).slice(0, 14)
          .map(({ label, students, values }) => ({ label, students, values })),
      };
    },
  },
  {
    id: 'assessment-scores', type: 'stackedBar', size: 'full',
    title: 'Scores by test',
    question: 'For every test conducted: how many students scored in each band, and how many missed it?',
    build: ({ rows, tests }) => {
      const series = ['Below 40%', '40–60%', '60–80%', '80–100%', 'Missed'];
      const band = (percent) => (percent < PASS_PERCENT ? 0 : percent < 60 ? 1 : percent < 80 ? 2 : 3);
      const groups = [...(tests?.values() || [])].map((test) => {
        const values = Object.fromEntries(series.map((name) => [name, 0]));
        for (const row of rows) {
          if (!row.assessment) continue;
          const attempt = row.assessment.byTest.get(test.id);
          if (attempt) values[series[band(attempt.percent)]] += 1;
          else if (row.assessment.missedIds.includes(test.id)) values.Missed += 1;
        }
        return { label: test.title, students: Object.values(values).reduce((sum, value) => sum + value, 0), values, startTime: test.startTime };
      }).filter((group) => group.students > 0);
      return {
        series,
        horizontal: true,
        groups: groups.sort((left, right) => new Date(right.startTime || 0) - new Date(left.startTime || 0)).slice(0, 20)
          .map(({ label, students, values }) => ({ label, students, values })),
      };
    },
  },
  {
    id: 'assessment-by-class', type: 'stackedBar', size: 'md',
    title: 'Test results by class',
    question: 'How many tests did each semester, branch or section pass, fail or miss?',
    options: { groupBy: 'semester' },
    build: ({ rows, options }) => ({
      groupBy: options.groupBy || 'semester',
      series: ['Passed', 'Failed', 'Missed'],
      groups: groupRows(rows.filter((row) => row.assessment && (row.assessment.taken || row.assessment.missed)), options.groupBy).map(([label, members]) => ({
        label, students: members.length,
        values: {
          Passed: members.reduce((sum, row) => sum + row.assessment.passed, 0),
          Failed: members.reduce((sum, row) => sum + row.assessment.failed, 0),
          Missed: members.reduce((sum, row) => sum + row.assessment.missed, 0),
        },
      })),
    }),
  },
  {
    id: 'assessment-funnel', type: 'funnel', size: 'sm',
    title: 'How far students get in tests',
    question: 'From taking a test to passing every test they took, where do students stop?',
    build: ({ rows }) => {
      const withData = rows.filter((row) => row.assessment);
      return {
        stages: [
          { name: 'Students', value: withData.length },
          { name: 'Took a test', value: testTakers(withData).length },
          { name: 'Passed a test', value: withData.filter((row) => row.assessment.passed > 0).length },
          { name: 'Passed every test taken', value: withData.filter((row) => row.assessment.taken > 0 && row.assessment.failed === 0).length },
        ],
      };
    },
  },
  {
    id: 'assessment-leaders', type: 'barList', size: 'md',
    title: 'Top test scorers',
    question: 'Which students score highest across the tests they took?',
    options: { limit: 10 },
    build: ({ rows, options }) => ({
      valueLabel: 'their average test score',
      unit: '%',
      items: testTakers(rows).sort((left, right) => right.assessment.averageScore - left.assessment.averageScore || right.assessment.taken - left.assessment.taken || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.assessment.averageScore, note: `${row.assessment.taken} test${row.assessment.taken === 1 ? '' : 's'} · best ${row.assessment.bestScore}%` })),
    }),
  },
  {
    id: 'assessment-spread', type: 'histogram', size: 'md',
    title: 'How test scores are spread',
    question: 'How many students are in each score band (their own average)?',
    build: ({ rows }) => {
      const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}%`, count: 0 }));
      testTakers(rows).forEach((row) => { bins[Math.min(9, Math.floor(row.assessment.averageScore / 10))].count += 1; });
      return { label: 'Test score', bins };
    },
  },
  {
    id: 'assessment-needs-attention', type: 'barList', size: 'md',
    title: 'Students who need help in tests',
    question: 'Who misses tests or scores lowest, and when was their last test?',
    options: { limit: 10 },
    build: ({ rows, options }) => attentionList(rows, {
      options, valueLabel: 'their average test score', unit: '%', ...ATTENTION_GROUPS['assessment-needs-attention'],
      order: (left, right) => right.assessment.missed - left.assessment.missed || left.assessment.averageScore - right.assessment.averageScore,
      item: (row) => ({ value: row.assessment.averageScore, note: `${row.assessment.missed} missed · ${lastTest(row)}`, daysSinceActive: row.assessment.daysSinceActive }),
      chips: { listed: 'Took or missed a test', never: 'No tests yet' },
    }),
  },
  {
    id: 'assessment-trend', type: 'trend', size: 'lg',
    title: 'Tests week by week',
    question: 'How many tests are taken and passed each week?',
    build: ({ rows }) => weeklySeries(rows.filter((row) => row.assessment), (row) => [...row.assessment.byTest.values()].map((attempt) => [new Date(attempt.at).toISOString().slice(0, 10), [1, attempt.percent >= PASS_PERCENT ? 1 : 0]]), ['Tests taken', 'Passed']),
  },
  {
    id: 'assessment-calendar', type: 'calendar', size: 'full',
    title: 'Daily tests',
    question: 'On which days do students take tests?',
    build: ({ rows, range }) => {
      const totals = new Map();
      for (const row of rows) if (row.assessment) for (const [day, count] of row.assessment.days) totals.set(day, (totals.get(day) || 0) + count);
      return calendarPayload(totals, range, 'tests taken');
    },
  },
];

// ---------------------------------------------------------------- Prep Interview

const interviewees = (rows) => rows.filter((row) => row.interview?.done > 0);
const lastInterview = (row) => (row.interview.daysSinceActive === null ? 'Never interviewed'
  : row.interview.daysSinceActive === 0 ? 'Interviewed today' : `Last interview ${row.interview.daysSinceActive} day${row.interview.daysSinceActive === 1 ? '' : 's'} ago`);

const INTERVIEW_CHARTS = [
  {
    id: 'interview-funnel', type: 'funnel', size: 'sm',
    title: 'How far students get in interviews',
    question: 'From the first interview to strong mock scores, where do students stop?',
    build: ({ rows }) => {
      const withData = rows.filter((row) => row.interview);
      return {
        stages: [
          { name: 'Students', value: withData.length },
          { name: 'Did an interview', value: interviewees(withData).length },
          { name: 'Did 3 or more', value: withData.filter((row) => row.interview.done >= 3).length },
          { name: 'Scored 60%+ in a mock', value: withData.filter((row) => row.interview.bestMockScore >= 60).length },
          { name: 'Scored 80%+ in a mock', value: withData.filter((row) => row.interview.bestMockScore >= 80).length },
        ],
      };
    },
  },
  {
    id: 'interview-ratings', type: 'stackedBar', size: 'lg',
    title: 'Mock interview ratings',
    question: 'For each skill, how many ratings of 1 to 5 did students receive?',
    build: ({ rows }) => {
      const series = ['Rated 1', 'Rated 2', 'Rated 3', 'Rated 4', 'Rated 5'];
      const groups = RATINGS.map(({ key, label }) => {
        const values = Object.fromEntries(series.map((name) => [name, 0]));
        let students = 0;
        for (const row of rows) {
          if (!row.interview?.mocks.length) continue;
          let rated = false;
          for (const mock of row.interview.mocks) {
            const value = Math.round(mock.ratings[key] || 0);
            if (value >= 1 && value <= 5) { values[series[value - 1]] += 1; rated = true; }
          }
          if (rated) students += 1;
        }
        return { label, students, values };
      });
      return { series, horizontal: true, groups };
    },
  },
  {
    id: 'interview-leaders', type: 'barList', size: 'md',
    title: 'Top mock interview scores',
    question: 'Which students score highest in their mock interviews?',
    options: { limit: 10 },
    build: ({ rows, options }) => ({
      valueLabel: 'their average mock score',
      unit: '%',
      items: rows.filter((row) => row.interview?.mockDone > 0)
        .sort((left, right) => right.interview.mockScore - left.interview.mockScore || right.interview.mockDone - left.interview.mockDone || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.interview.mockScore, note: `${row.interview.mockDone} mock · ${row.interview.aiCompleted} AI interview${row.interview.aiCompleted === 1 ? '' : 's'}` })),
    }),
  },
  {
    id: 'interview-mix', type: 'donut', size: 'sm',
    title: 'Mock and AI interviews',
    question: 'How many interviews were mock interviews and how many were AI interviews?',
    build: ({ rows }) => ({
      centerLabel: 'interviews done',
      items: [
        { key: 'Mock', name: 'Mock interviews', value: rows.reduce((sum, row) => sum + (row.interview?.mockDone || 0), 0) },
        { key: 'AI', name: 'AI interviews', value: rows.reduce((sum, row) => sum + (row.interview?.aiCompleted || 0), 0) },
      ].filter((item) => item.value > 0),
    }),
  },
  {
    id: 'interview-spread', type: 'histogram', size: 'md',
    title: 'How mock scores are spread',
    question: 'How many students are in each mock score band (their own average)?',
    build: ({ rows }) => {
      const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}%`, count: 0 }));
      rows.filter((row) => row.interview?.mockDone > 0).forEach((row) => { bins[Math.min(9, Math.floor(row.interview.mockScore / 10))].count += 1; });
      return { label: 'Mock score', bins };
    },
  },
  {
    id: 'interview-needs-attention', type: 'barList', size: 'md',
    title: 'Students who need more interviews',
    question: 'Who has done the fewest interviews, and when was their last one?',
    options: { limit: 10 },
    build: ({ rows, options }) => attentionList(rows, {
      options, valueLabel: 'interviews done', ...ATTENTION_GROUPS['interview-needs-attention'],
      order: (left, right) => left.interview.done - right.interview.done || left.interview.mockScore - right.interview.mockScore,
      item: (row) => ({ value: row.interview.done, note: lastInterview(row), daysSinceActive: row.interview.daysSinceActive }),
      chips: { listed: 'Interviewed', never: 'Never interviewed' },
    }),
  },
  {
    id: 'interview-trend', type: 'trend', size: 'lg',
    title: 'Interviews week by week',
    question: 'How many mock and AI interviews happen each week?',
    build: ({ rows }) => weeklySeries(rows.filter((row) => row.interview), (row) => [
      ...row.interview.mocks.map((mock) => [new Date(mock.at).toISOString().slice(0, 10), [1, 0]]),
      ...row.interview.aiDates.map((date) => [new Date(date).toISOString().slice(0, 10), [0, 1]]),
    ], ['Mock interviews', 'AI interviews']),
  },
  {
    id: 'interview-calendar', type: 'calendar', size: 'full',
    title: 'Daily interviews',
    question: 'On which days do students do interviews?',
    build: ({ rows, range }) => {
      const totals = new Map();
      for (const row of rows) if (row.interview) for (const [day, count] of row.interview.days) totals.set(day, (totals.get(day) || 0) + count);
      return calendarPayload(totals, range, 'interviews');
    },
  },
];

// One section per feature. Quick Prep sheets are part of Prep Coding.
export const SECTIONS = Object.freeze({
  coding: { label: 'Prep Coding', module: 'coding' },
  learning: { label: 'Prep Learning', module: 'learning' },
  interview: { label: 'Prep Interview', module: 'interview' },
  assessment: { label: 'Prep Assessment', module: 'assessment' },
});

export const CHARTS = [
  ...CODING_CHARTS.map((chart) => ({ module: 'coding', section: 'coding', ...chart })),
  ...QUICKPREP_CHARTS.map((chart) => ({ module: 'coding', section: 'coding', ...chart })),
  ...LEARNING_CHARTS.map((chart) => ({ module: 'learning', section: 'learning', ...chart })),
  ...INTERVIEW_CHARTS.map((chart) => ({ module: 'interview', section: 'interview', ...chart })),
  ...ASSESSMENT_CHARTS.map((chart) => ({ module: 'assessment', section: 'assessment', ...chart })),
];

export const CHART_BY_ID = new Map(CHARTS.map((chart) => [chart.id, chart]));

// What a fresh page shows per area; admins add or remove charts from that area's catalogue.
export const DEFAULT_LAYOUT = Object.freeze({
  coding: ['top-students', 'difficulty-split', 'practice-trend', 'practice-funnel', 'topic-strength', 'needs-attention',
    'activity-calendar', 'student-profile', 'failure-reasons', 'language-usage', 'score-spread', 'tough-problems',
    'quickprep-sheets', 'quickprep-funnel', 'quickprep-matrix', 'quickprep-leaders', 'quickprep-needs-attention'],
  learning: ['learning-subjects', 'learning-funnel', 'learning-trend', 'learning-leaders', 'learning-needs-attention', 'learning-spread', 'learning-calendar'],
  interview: ['interview-trend', 'interview-funnel', 'interview-ratings', 'interview-mix', 'interview-leaders', 'interview-needs-attention', 'interview-spread', 'interview-calendar'],
  assessment: ['assessment-tests', 'assessment-funnel', 'assessment-scores', 'assessment-by-class', 'assessment-leaders', 'assessment-needs-attention', 'assessment-trend', 'assessment-spread', 'assessment-calendar'],
  // "All": a short view of each feature, side by side.
  all: ['top-students', 'practice-funnel', 'quickprep-sheets', 'learning-subjects', 'learning-funnel', 'interview-funnel', 'interview-trend', 'assessment-tests', 'assessment-funnel'],
});

// Headline numbers: only a few per feature, each a count of students the admin can
// act on (click one to list those students). No totals of submissions or averages.
const share = (count, total) => (total ? `${Math.round((count / total) * 100)}% of ${total.toLocaleString()} students` : '');
const studentKpi = (id, label, rows, test, extra = {}) => {
  const value = rows.filter(test).length;
  return { id, label, value, format: 'count', hint: share(value, rows.length), ...extra };
};

const learningKpis = (rows) => {
  const withData = rows.filter((row) => row.learning);
  return [
    studentKpi('active', 'Learning now', withData, (row) => row.learning.status === 'active'),
    studentKpi('halfway', 'Halfway through the course', withData, (row) => row.learning.progress >= 50),
    studentKpi('subjectDone', 'Finished a subject', withData, (row) => row.learning.subjectsFinished.length > 0),
    studentKpi('stopped', 'Not learning', withData, (row) => row.learning.status !== 'active', { tone: 'warning' }),
  ];
};

const interviewKpis = (rows) => {
  const withData = rows.filter((row) => row.interview);
  return [
    studentKpi('students', 'Interviewed', withData, (row) => row.interview.done > 0),
    studentKpi('strong', 'Mock score 60%+', withData, (row) => row.interview.mockDone > 0 && row.interview.mockScore >= 60),
    studentKpi('scheduled', 'Mock interview coming up', withData, (row) => row.interview.scheduled > 0),
    studentKpi('never', 'Never interviewed', withData, (row) => row.interview.status === 'never', { tone: 'warning' }),
  ];
};

const assessmentKpis = (rows) => {
  const withData = rows.filter((row) => row.assessment);
  return [
    studentKpi('students', 'Took a test', withData, (row) => row.assessment.taken > 0),
    studentKpi('passedStudents', `Passed a test (${PASS_PERCENT}%+)`, withData, (row) => row.assessment.passed > 0),
    studentKpi('missed', 'Missed a test', withData, (row) => row.assessment.missed > 0, { tone: 'warning' }),
    studentKpi('never', 'Never took a test', withData, (row) => row.assessment.status === 'never', { tone: 'warning' }),
  ];
};

/** Headline counts per feature for the students in view (never cohort averages). */
export function buildKpiGroups(area, modules, rows) {
  const builders = { coding: buildKpis, learning: learningKpis, interview: interviewKpis, assessment: assessmentKpis };
  return Object.entries(SECTIONS)
    .filter(([, section]) => modules.has(section.module) && (area === 'all' || section.module === area))
    .map(([key, section]) => ({ key, module: section.module, label: section.label, kpis: builders[key](rows) }));
}

/** Headline counts for Prep Coding, Quick Prep sheets included. */
export function buildKpis(rows) {
  return [
    studentKpi('active', 'Practising now', rows, (row) => row.coding.practiceStatus === 'active'),
    studentKpi('hard', 'Solved a Hard problem', rows, (row) => row.coding.solved.Hard > 0),
    ...(rows.some((row) => row.quickprep) ? [
      studentKpi('sheetStarted', 'Using Quick Prep sheets', rows, (row) => row.quickprep?.started > 0),
      studentKpi('sheetFinished', 'Finished a sheet', rows, (row) => row.quickprep?.finished > 0),
    ] : []),
    studentKpi('stopped', 'Not practising', rows, (row) => row.coding.practiceStatus !== 'active', { tone: 'warning' }),
  ];
}
