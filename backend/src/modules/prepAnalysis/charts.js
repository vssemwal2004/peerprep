// Prep Analysis charts. Each chart answers one plain question for a coordinator
// and is computed from the students that passed the page filter AND the chart's
// own filter. Nothing here averages the whole cohort: charts show individual
// students, counts and spreads. Builders return plain data; the browser turns it
// into an ECharts option, so the API stays renderer-neutral.

import { PASS_PERCENT } from './assessmentFacts.js';
import { RATINGS } from './interviewFacts.js';
import { DIFFICULTIES } from './prepScore.js';
import { INACTIVE_AFTER_DAYS } from './studentRows.js';

export const GROUP_BY = Object.freeze({
  semester: { label: 'Semester', get: (row) => (row.student.semester ? `Sem ${row.student.semester}` : '') },
  branch: { label: 'Branch', get: (row) => row.student.branch },
  course: { label: 'Course', get: (row) => row.student.course },
  college: { label: 'College / University', get: (row) => row.student.college },
  group: { label: 'Group / Section', get: (row) => row.student.group },
});

const NOT_SET = 'Not set';
<<<<<<< Updated upstream
const practising = (rows) => rows.filter((row) => row.coding.submissions > 0);
const byScore = (left, right) => right.coding.prepScore - left.coding.prepScore || left.name.localeCompare(right.name);
// Lower edges of the Prep Score bands in "How Prep Scores are spread".
const SCORE_BANDS = [0, 25, 50, 100, 250, 500, 1000, 2500];
=======
const round1 = (value) => Math.round(value * 10) / 10;
const practising = (rows) => rows.filter((row) => row.coding.submissions > 0);
const byScore = (left, right) => right.coding.prepScore - left.coding.prepScore || left.name.localeCompare(right.name);
>>>>>>> Stashed changes
const clampLimit = (value, fallback, max) => Math.min(max, Math.max(1, Number.parseInt(value, 10) || fallback));

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

/** Distinct solved problems per topic for one student (cached on the row). */
function topicSolved(row) {
  if (row.topicSolvedCache) return row.topicSolvedCache;
  const counts = new Map();
  const seen = new Set();
  for (const entry of row.entries) {
    if (entry.accepted <= 0 || seen.has(entry.problemId)) continue;
    seen.add(entry.problemId);
    for (const name of entry.meta.topics.length ? entry.meta.topics : entry.meta.tags) counts.set(name, (counts.get(name) || 0) + 1);
  }
  row.topicSolvedCache = counts;
  return counts;
}

function weekStart(day) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
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

const lastPractice = (row) => (row.coding.daysSinceActive === null ? 'Never practised'
  : row.coding.daysSinceActive === 0 ? 'Practised today' : `Last practice ${row.coding.daysSinceActive} day${row.coding.daysSinceActive === 1 ? '' : 's'} ago`);

const CODING_CHARTS = [
  {
    id: 'top-students', type: 'rankedStackedBar', size: 'lg',
    title: 'Top students',
    question: 'Who leads on Prep Score, and how much comes from Easy, Medium and Hard problems?',
    options: { limit: 10 },
    build: ({ rows, options }) => ({
      items: practising(rows).sort(byScore).slice(0, clampLimit(options.limit, 10, 50)).map((row, index) => ({
        id: row.id, name: row.name, position: index + 1, score: row.coding.prepScore,
<<<<<<< Updated upstream
        segments: { Easy: row.coding.points.Easy, Medium: row.coding.points.Medium, Hard: row.coding.points.Hard },
=======
        segments: { Easy: row.coding.points.Easy, Medium: row.coding.points.Medium, Hard: row.coding.points.Hard, Accuracy: row.coding.points.accuracy },
>>>>>>> Stashed changes
        solved: row.coding.solved,
      })),
    }),
  },
  {
    id: 'difficulty-split', type: 'donut', size: 'sm',
    title: 'Solved problems by difficulty',
    question: 'Are students solving only Easy problems, or Medium and Hard too?',
    build: ({ rows }) => ({
      centerLabel: 'problems solved',
      items: DIFFICULTIES.map((difficulty) => ({ key: difficulty, name: difficulty, value: rows.reduce((sum, row) => sum + row.coding.solved[difficulty], 0) })).filter((item) => item.value > 0),
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
      const topics = new Map();
      for (const row of rows) {
        const solvedHere = topicSolved(row);
        const touched = new Set();
        for (const entry of row.entries) {
          for (const name of entry.meta.topics.length ? entry.meta.topics : entry.meta.tags) {
            const topic = topics.get(name) || { students: 0, attempts: 0, accepted: 0 };
            topic.attempts += entry.attempts;
            topic.accepted += entry.accepted;
            if (!touched.has(name) && solvedHere.has(name)) { topic.students += 1; touched.add(name); }
            topics.set(name, topic);
          }
        }
      }
      return {
        valueLabel: 'students solving',
        items: [...topics.entries()].filter(([, topic]) => topic.students > 0)
          .sort((left, right) => right[1].students - left[1].students).slice(0, clampLimit(options.limit, 12, 40))
          .map(([name, topic]) => ({ name, value: topic.students, note: `${topic.attempts ? Math.round((topic.accepted / topic.attempts) * 100) : 0}% accurate` })),
      };
    },
  },
  {
    id: 'needs-attention', type: 'barList', size: 'md',
    title: 'Students who need attention',
    question: 'Who has the lowest Prep Score, and when did they last practise?',
    options: { limit: 10 },
    build: ({ rows, options }) => ({
      valueLabel: 'Prep Score',
      tone: 'warning',
      items: [...rows].sort((left, right) => left.coding.prepScore - right.coding.prepScore || (right.coding.daysSinceActive ?? 1e9) - (left.coding.daysSinceActive ?? 1e9) || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.coding.prepScore, note: lastPractice(row), daysSinceActive: row.coding.daysSinceActive })),
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
    question: 'For one student: which topics are strong and which are missing?',
    options: { studentId: '' },
    build: ({ rows, options }) => {
      const student = rows.find((row) => row.id === options.studentId) || practising(rows).sort(byScore)[0];
      if (!student) return { student: null, indicators: [], values: [] };
      const attempted = new Map();
      for (const entry of student.entries) {
        for (const name of entry.meta.topics.length ? entry.meta.topics : entry.meta.tags) attempted.set(name, (attempted.get(name) || 0) + entry.attempts);
      }
      const names = [...attempted.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8).map(([name]) => name);
      const solved = topicSolved(student);
      const values = names.map((name) => solved.get(name) || 0);
      const max = Math.max(1, ...values);
      return {
        student: { id: student.id, name: student.name, score: student.coding.prepScore, solved: student.coding.solved },
        indicators: names.map((name) => ({ name, max })),
        values,
      };
    },
  },
  {
    id: 'failure-reasons', type: 'donut', size: 'sm',
    title: 'Why submissions fail',
    question: 'Wrong answers, too slow, crashes or code that does not compile?',
    build: ({ rows }) => {
      const totals = { AC: 0, WA: 0, TLE: 0, RE: 0, CE: 0 };
      for (const row of rows) for (const entry of row.entries) for (const key of Object.keys(totals)) totals[key] += entry.verdicts?.[key] || 0;
      const labels = { AC: 'Accepted', WA: 'Wrong answer', TLE: 'Too slow', RE: 'Crashed', CE: 'Did not compile' };
      return { centerLabel: 'submissions', items: Object.entries(totals).filter(([, value]) => value > 0).map(([key, value]) => ({ key, name: labels[key], value })) };
    },
  },
  {
    id: 'language-usage', type: 'donut', size: 'sm',
    title: 'Programming languages used',
    question: 'Which languages do students write their solutions in?',
    build: ({ rows }) => {
      const students = new Map();
      for (const row of rows) for (const language of row.coding.languages) students.set(language, (students.get(language) || 0) + 1);
      return { centerLabel: 'students', items: [...students.entries()].sort((left, right) => right[1] - left[1]).map(([key, value]) => ({ key, name: key, value })) };
    },
  },
  {
    id: 'score-spread', type: 'histogram', size: 'md',
    title: 'How Prep Scores are spread',
    question: 'How many students are in each score band?',
    build: ({ rows }) => {
<<<<<<< Updated upstream
      // Prep Score has no ceiling, so the bands widen as scores grow.
      const bins = SCORE_BANDS.map((from, index) => ({
        label: index === SCORE_BANDS.length - 1 ? `${from.toLocaleString('en-US')}+` : `${from.toLocaleString('en-US')}–${SCORE_BANDS[index + 1].toLocaleString('en-US')}`, count: 0,
      }));
      practising(rows).forEach((row) => { bins[SCORE_BANDS.findLastIndex((from) => row.coding.prepScore >= from)].count += 1; });
=======
      const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}`, count: 0 }));
      practising(rows).forEach((row) => { bins[Math.min(9, Math.floor(row.coding.prepScore / 10))].count += 1; });
>>>>>>> Stashed changes
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
      return {
        valueLabel: 'failed attempts',
        tone: 'danger',
        items: [...problems.values()].filter((problem) => problem.failed > 0).sort((left, right) => right.failed - left.failed)
          .slice(0, clampLimit(options.limit, 10, 40))
          .map((problem) => ({ name: problem.title, value: problem.failed, difficulty: problem.difficulty, note: `${problem.solvers.size} of ${problem.students.size} students solved it` })),
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
const byLearning = (left, right) => right.learning.progress - left.learning.progress || right.learning.completedTopics - left.learning.completedTopics || left.name.localeCompare(right.name);
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
    build: ({ rows, options }) => ({
      valueLabel: '% of course completed',
      tone: 'warning',
      unit: '%',
      items: rows.filter((row) => row.learning).sort((left, right) => left.learning.progress - right.learning.progress || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.learning.progress, note: lastLesson(row), daysSinceActive: row.learning.daysSinceActive })),
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
    build: ({ rows, options }) => ({
      valueLabel: '% of started sheets solved',
      tone: 'warning',
      unit: '%',
      items: sheetStarters(rows).sort((left, right) => left.quickprep.progress - right.quickprep.progress || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.quickprep.progress, note: lastSheetVisit(row), daysSinceActive: row.quickprep.daysSinceActive })),
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
<<<<<<< Updated upstream
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
=======
>>>>>>> Stashed changes
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
    build: ({ rows, options }) => ({
      valueLabel: 'their average test score',
      tone: 'warning',
      unit: '%',
      items: rows.filter((row) => row.assessment && (row.assessment.taken > 0 || row.assessment.missed > 0))
        .sort((left, right) => right.assessment.missed - left.assessment.missed || left.assessment.averageScore - right.assessment.averageScore || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.assessment.averageScore, note: `${row.assessment.missed} missed · ${lastTest(row)}`, daysSinceActive: row.assessment.daysSinceActive })),
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
    build: ({ rows, options }) => ({
      valueLabel: 'interviews done',
      tone: 'warning',
      items: rows.filter((row) => row.interview)
        .sort((left, right) => left.interview.done - right.interview.done || left.interview.mockScore - right.interview.mockScore || left.name.localeCompare(right.name))
        .slice(0, clampLimit(options.limit, 10, 50))
        .map((row) => ({ id: row.id, name: row.name, value: row.interview.done, note: lastInterview(row), daysSinceActive: row.interview.daysSinceActive })),
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
<<<<<<< Updated upstream
  assessment: ['assessment-tests', 'assessment-funnel', 'assessment-scores', 'assessment-by-class', 'assessment-leaders', 'assessment-needs-attention', 'assessment-trend', 'assessment-spread', 'assessment-calendar'],
=======
  assessment: ['assessment-tests', 'assessment-funnel', 'assessment-trend', 'assessment-leaders', 'assessment-needs-attention', 'assessment-spread', 'assessment-calendar'],
>>>>>>> Stashed changes
  // "All": a short view of each feature, side by side.
  all: ['top-students', 'practice-funnel', 'quickprep-sheets', 'learning-subjects', 'learning-funnel', 'interview-funnel', 'interview-trend', 'assessment-tests', 'assessment-funnel'],
});

/** The charts an area offers: its own, or every licensed area's for "All". */
export const chartsForArea = (area, modules) => CHARTS.filter((chart) => modules.has(chart.module) && (area === 'all' || chart.module === area));

<<<<<<< Updated upstream
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
=======
const learningKpis = (rows) => {
  const withData = rows.filter((row) => row.learning);
  return [
    { id: 'students', label: 'Students', value: withData.length, format: 'count' },
    { id: 'active', label: 'Learning now', value: withData.filter((row) => row.learning.status === 'active').length, format: 'count', hint: `in the last ${INACTIVE_AFTER_DAYS} days` },
    { id: 'topics', label: 'Topics completed', value: withData.reduce((sum, row) => sum + row.learning.completedTopics, 0), format: 'count', hint: 'across all students' },
    { id: 'halfway', label: 'Halfway or more', value: withData.filter((row) => row.learning.progress >= 50).length, format: 'count', hint: 'students past 50% of course' },
    { id: 'video', label: 'Video watched', value: Math.round(withData.reduce((sum, row) => sum + row.learning.videoMinutes, 0) / 60), format: 'count', hint: 'hours, all students' },
    { id: 'stopped', label: 'Not learning', value: withData.filter((row) => row.learning.status !== 'active').length, format: 'count', hint: 'stopped or never started', tone: 'warning' },
>>>>>>> Stashed changes
  ];
};

const interviewKpis = (rows) => {
  const withData = rows.filter((row) => row.interview);
  return [
<<<<<<< Updated upstream
    studentKpi('students', 'Interviewed', withData, (row) => row.interview.done > 0),
    studentKpi('strong', 'Mock score 60%+', withData, (row) => row.interview.mockDone > 0 && row.interview.mockScore >= 60),
    studentKpi('scheduled', 'Mock interview coming up', withData, (row) => row.interview.scheduled > 0),
    studentKpi('never', 'Never interviewed', withData, (row) => row.interview.status === 'never', { tone: 'warning' }),
=======
    { id: 'students', label: 'Interviewed', value: interviewees(withData).length, format: 'count', hint: 'students with an interview' },
    { id: 'mocks', label: 'Mock interviews', value: withData.reduce((sum, row) => sum + row.interview.mockDone, 0), format: 'count', hint: 'done' },
    { id: 'ai', label: 'AI interviews', value: withData.reduce((sum, row) => sum + row.interview.aiCompleted, 0), format: 'count', hint: 'completed' },
    { id: 'strong', label: 'Scored 60%+', value: withData.filter((row) => row.interview.mockDone > 0 && row.interview.mockScore >= 60).length, format: 'count', hint: 'students, own mock average' },
    { id: 'scheduled', label: 'Scheduled', value: withData.filter((row) => row.interview.scheduled > 0).length, format: 'count', hint: 'students with a mock coming up' },
    { id: 'never', label: 'Never interviewed', value: withData.filter((row) => row.interview.status === 'never').length, format: 'count', tone: 'warning' },
>>>>>>> Stashed changes
  ];
};

const assessmentKpis = (rows) => {
  const withData = rows.filter((row) => row.assessment);
<<<<<<< Updated upstream
  return [
    studentKpi('students', 'Took a test', withData, (row) => row.assessment.taken > 0),
    studentKpi('passedStudents', `Passed a test (${PASS_PERCENT}%+)`, withData, (row) => row.assessment.passed > 0),
    studentKpi('missed', 'Missed a test', withData, (row) => row.assessment.missed > 0, { tone: 'warning' }),
    studentKpi('never', 'Never took a test', withData, (row) => row.assessment.status === 'never', { tone: 'warning' }),
=======
  const taken = withData.reduce((sum, row) => sum + row.assessment.taken, 0);
  const passed = withData.reduce((sum, row) => sum + row.assessment.passed, 0);
  return [
    { id: 'students', label: 'Took a test', value: testTakers(withData).length, format: 'count', hint: 'students' },
    { id: 'taken', label: 'Tests taken', value: taken, format: 'count', hint: 'across all students' },
    { id: 'passed', label: 'Tests passed', value: passed, format: 'count', hint: `${PASS_PERCENT}% or more` },
    { id: 'passRate', label: 'Passed', value: taken ? round1((passed / taken) * 100) : 0, format: 'percent', hint: `${passed} of ${taken} tests taken` },
    { id: 'missed', label: 'Tests missed', value: withData.reduce((sum, row) => sum + row.assessment.missed, 0), format: 'count', hint: 'assigned, over, not taken', tone: 'warning' },
    { id: 'never', label: 'Never took a test', value: withData.filter((row) => row.assessment.status === 'never').length, format: 'count', tone: 'warning' },
>>>>>>> Stashed changes
  ];
};

/** Headline counts per feature for the students in view (never cohort averages). */
export function buildKpiGroups(area, modules, rows) {
  const builders = { coding: buildKpis, learning: learningKpis, interview: interviewKpis, assessment: assessmentKpis };
  return Object.entries(SECTIONS)
    .filter(([, section]) => modules.has(section.module) && (area === 'all' || section.module === area))
    .map(([key, section]) => ({ key, module: section.module, label: section.label, kpis: builders[key](rows) }));
}

<<<<<<< Updated upstream
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
=======
/** Headline counts for Prep Coding, Quick Prep sheets included (no cohort averages). */
export function buildKpis(rows) {
  const active = practising(rows);
  const totals = active.reduce((sum, row) => ({
    submissions: sum.submissions + row.coding.submissions,
    accepted: sum.accepted + row.coding.accepted,
    hard: sum.hard + row.coding.solved.Hard,
  }), { submissions: 0, accepted: 0, hard: 0 });
  const distinctSolved = new Set(active.flatMap((row) => row.entries.filter((entry) => entry.accepted > 0).map((entry) => entry.problemId)));
  const stopped = rows.filter((row) => row.coding.practiceStatus !== 'active').length;
  return [
    { id: 'students', label: 'Students', value: rows.length, format: 'count' },
    { id: 'active', label: 'Practising now', value: rows.filter((row) => row.coding.practiceStatus === 'active').length, format: 'count', hint: `in the last ${INACTIVE_AFTER_DAYS} days` },
    { id: 'solved', label: 'Problems solved', value: distinctSolved.size, format: 'count', hint: 'different problems' },
    { id: 'hard', label: 'Hard solves', value: totals.hard, format: 'count', hint: 'across all students' },
    { id: 'accuracy', label: 'Accepted submissions', value: totals.submissions ? round1((totals.accepted / totals.submissions) * 100) : 0, format: 'percent', hint: `${totals.accepted} of ${totals.submissions}` },
    ...(rows.some((row) => row.quickprep) ? [
      { id: 'sheetStarted', label: 'Started a sheet', value: rows.filter((row) => row.quickprep?.started > 0).length, format: 'count', hint: 'Quick Prep, students' },
      { id: 'sheetFinished', label: 'Finished a sheet', value: rows.filter((row) => row.quickprep?.finished > 0).length, format: 'count', hint: 'Quick Prep, students' },
    ] : []),
    { id: 'stopped', label: 'Not practising', value: stopped, format: 'count', hint: 'stopped or never started', tone: 'warning' },
>>>>>>> Stashed changes
  ];
}
