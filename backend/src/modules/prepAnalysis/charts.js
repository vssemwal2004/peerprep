// Prep Analysis charts. Each chart answers one plain question for a coordinator
// and is computed from the students that passed the page filter AND the chart's
// own filter. Nothing here averages the whole cohort: charts show individual
// students, counts and spreads. Builders return plain data; the browser turns it
// into an ECharts option, so the API stays renderer-neutral.

import { PASS_PERCENT } from './assessmentFacts.js';
import { RATINGS } from './interviewFacts.js';
import { DIFFICULTIES } from './ranking.js';
import { INACTIVE_AFTER_DAYS } from './studentRows.js';

export const GROUP_BY = Object.freeze({
  semester: { label: 'Semester', get: (row) => (row.student.semester ? `Sem ${row.student.semester}` : '') },
  branch: { label: 'Branch', get: (row) => row.student.branch },
  course: { label: 'Course', get: (row) => row.student.course },
  college: { label: 'Campus', get: (row) => row.student.college },
  section: { label: 'Section', get: (row) => row.student.section },
  group: { label: 'Group', get: (row) => row.student.group },
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

/** Value at fraction `at` (0–1) of an ascending list, interpolating between neighbours. */
function quantile(sorted, at) {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * at;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/** Five-number summary (and the mean) of a list of numbers, for a box plot. */
export function boxStats(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const round = (value) => Math.round(value * 100) / 100;
  if (!sorted.length) return { count: 0, min: 0, q1: 0, median: 0, q3: 0, max: 0, mean: 0 };
  return {
    count: sorted.length, min: round(sorted[0]), q1: round(quantile(sorted, 0.25)), median: round(quantile(sorted, 0.5)), q3: round(quantile(sorted, 0.75)),
    max: round(sorted[sorted.length - 1]), mean: round(sorted.reduce((sum, value) => sum + value, 0) / sorted.length),
  };
}

/** A scatter chart shows at most this many dots; the rest are counted in `total`. */
const MAX_DOTS = 600;

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

// Topic bubbles: priority by how many students solve a topic compared with the most-solved one.
export const TOPIC_BUBBLE_LIMIT = 300;
// Up to eight groups, each its own bubble size and colour, built from the student counts actually
// present (2026-11-19: shares of the top topic left most topics in one colour when counts are
// small). Eight or fewer different counts: one group per count. More: the different counts are
// split into eight runs of about equal length. `level` 0 (most students) … 7 (fewest) picks the
// size and colour; with fewer groups the levels spread over the whole range.
export const TOPIC_TIER_LEVELS = 8;
const studentsText = (low, high) => (low === high ? `${low.toLocaleString('en-US')} student${low === 1 ? '' : 's'}` : `${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')} students`);

/** Groups for these per-topic student counts: [{ key, level, low, high, label }], most students first. */
export function topicTiers(values) {
  const distinct = [...new Set(values.filter((value) => Number.isFinite(value)))].sort((a, b) => b - a);
  if (!distinct.length) return [];
  const runs = distinct.length <= TOPIC_TIER_LEVELS
    ? distinct.map((value) => [value])
    : Array.from({ length: TOPIC_TIER_LEVELS }, (_, index) => distinct.slice(Math.floor((index * distinct.length) / TOPIC_TIER_LEVELS), Math.floor(((index + 1) * distinct.length) / TOPIC_TIER_LEVELS)));
  return runs.map((run, index) => {
    const level = runs.length === 1 ? 0 : Math.round((index * (TOPIC_TIER_LEVELS - 1)) / (runs.length - 1));
    const high = run[0];
    const low = run.at(-1);
    return { key: `t${level}`, level, low, high, label: studentsText(low, high) };
  });
}
/** The group a count belongs to (its key). */
export const topicTier = (tiers, students) => (tiers.find((tier) => students >= tier.low && students <= tier.high) || tiers.at(-1))?.key || 't7';
/** The groups with how many topics each holds. */
export const topicTierRanges = (tiers, items) => tiers.map((tier) => ({ ...tier, topics: items.filter((item) => item.tier === tier.key).length }));

/**
 * The steps of the "Practice journey" funnel, shared by the chart and its student lists (drill.js).
 * `gap`: who stopped just before this step (reached the step above, not this one), in plain words;
 * `furthest`: how a student whose furthest step is this one is described in lists.
 */
export const CODING_FUNNEL_STAGES = Object.freeze([
  { name: 'All students', furthest: 'Not started', test: () => true },
  { name: 'Tried a problem', gap: 'Never tried a problem', furthest: 'Tried a problem', test: (row) => row.coding.submissions > 0 },
  { name: 'Solved a problem', gap: 'Tried, but nothing solved yet', furthest: 'Solved a problem', test: (row) => row.coding.solved.total > 0 },
  { name: 'Solved a Medium', gap: 'Solved, but no Medium yet', furthest: 'Solved a Medium', test: (row) => row.coding.solved.Medium > 0 },
  { name: 'Solved a Hard', gap: 'Solved Medium, but no Hard yet', furthest: 'Solved a Hard', test: (row) => row.coding.solved.Hard > 0 },
]);

/** The submission outcomes the "Trend of submissions till today" donut is split into. */
export const SUBMISSION_PARTS = Object.freeze({
  Accepted: (row) => row.coding.accepted,
  'Not accepted': (row) => row.coding.submissions - row.coding.accepted,
});

/**
 * Every submission in the selected period (up to today), accepted vs not: { centerLabel, items }.
 * `students`: how many students made at least one submission of that kind.
 */
export function submissionSplit(rows) {
  const items = Object.entries(SUBMISSION_PARTS).map(([key, of]) => ({
    key, name: key,
    value: rows.reduce((sum, row) => sum + Math.max(0, of(row) || 0), 0),
    students: rows.filter((row) => of(row) > 0).length,
  })).filter((item) => item.value > 0);
  return { centerLabel: 'submissions', items };
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
    question: 'Who leads on the Prep Coding score, and how much does each difficulty contribute?',
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
          student: {
            studentId: row.studentId, email: row.email, course: row.student.course,
            branch: row.student.branch, college: row.student.college, semester: row.student.semester,
            section: row.student.section, group: row.student.group,
          },
        })),
      };
    },
  },
  {
    // Retired from the Prep Coding page (2026-11-18): replaced by "Trend of submissions till
    // today". Kept so old links, saved filters and drills still answer; not offered any more, and
    // any saved layout shows the new chart in its place (catalog `replacedCharts`).
    id: 'difficulty-split', type: 'donut', size: 'sm', retiredBy: 'submission-trend',
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
    // A donut (user choice 2026-11-18: "the circle one is much better" than the day-by-day line):
    // every submission in the period up to today, accepted vs not. The week-by-week picture is in
    // "Practice week by week". Old day/week drill keys from the line still answer (drill.js).
    id: 'submission-trend', type: 'donut', size: 'sm',
    title: 'Trend of submissions till today',
    question: 'How many submissions have students made up to today, and how many were accepted?',
    build: ({ rows }) => submissionSplit(rows),
  },
  {
    id: 'practice-trend', type: 'trend', size: 'full',
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
    id: 'practice-funnel', type: 'funnel', size: 'md',
    title: 'Practice journey',
    question: 'How many students reach each step, from trying a first problem to solving a Hard one, and where do they stop?',
    build: ({ rows }) => ({
      stages: CODING_FUNNEL_STAGES.map((stage) => ({ name: stage.name, value: rows.filter(stage.test).length })),
      // Between each two steps: the students who reached the first but not the second, counted
      // exactly (the steps are not strictly nested: a Hard can be solved without a Medium).
      // A click on a drop lists them (drill key "lost:<index of the second step>").
      drops: CODING_FUNNEL_STAGES.slice(1).map((stage, offset) => {
        const before = CODING_FUNNEL_STAGES[offset];
        return { key: `lost:${offset + 1}`, from: before.name, to: stage.name, label: stage.gap, students: rows.filter((row) => before.test(row) && !stage.test(row)).length };
      }),
    }),
  },
  {
    // Bubbles: every topic at least one student solves (not a top-N), sized by how many students
    // solve in it and coloured by priority, so the thin topics that need a push stand out.
    id: 'topic-strength', type: 'bubble', size: 'md',
    title: 'Topics students are solving',
    question: 'Which topics are students solving, and which need a push?',
    build: ({ rows }) => {
      const sorted = [...topicStats(rows).entries()].filter(([, topic]) => topic.students > 0)
        .sort((left, right) => right[1].students - left[1].students || left[0].localeCompare(right[0]));
      const items = sorted.slice(0, TOPIC_BUBBLE_LIMIT);
      const tiers = topicTiers(items.map(([, topic]) => topic.students));
      const bubbles = items.map(([name, topic]) => ({
        key: name, name, value: topic.students, pct: percentOne(topic.students, rows.length),
        attempted: topic.attempted, solved: topic.solved, accuracy: percentOne(topic.accepted, topic.attempts),
        tier: topicTier(tiers, topic.students),
        note: `${percentOne(topic.students, rows.length)}% of students · ${percentOne(topic.accepted, topic.attempts)}% accurate`,
      }));
      return {
        valueLabel: 'students solving',
        itemLabel: 'Topic',
        cohort: rows.length,
        // More topics than can be drawn as bubbles (very rare): the table and download still list all.
        hidden: Math.max(0, sorted.length - items.length),
        tiers: topicTierRanges(tiers, bubbles),
        items: bubbles,
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
    question: 'How many Easy, Medium and Hard problems has each semester, branch, section, group or campus solved?',
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
  {
    id: 'student-map', type: 'scatter', size: 'full',
    title: 'Effort versus result',
    question: 'Do students who submit more also score higher, and who practises a lot without results?',
    // One dot per student who practised: how much they submitted against their Prep Score.
    build: ({ rows }) => {
      const active = practising(rows).sort(byScore);
      const items = active.slice(0, MAX_DOTS).map((row) => ({
        id: row.id, name: row.name, x: row.coding.submissions, y: row.coding.prepScore, size: row.coding.solved.total,
        accuracy: row.coding.accuracy, group: row.coding.practiceStatus === 'active' ? 'Practising' : 'Stopped',
        note: `${row.coding.solved.total} solved · ${row.coding.accuracy}% accurate`,
      }));
      return {
        xLabel: 'Submissions', yLabel: 'Prep Score', sizeLabel: 'problems solved', groups: ['Practising', 'Stopped'],
        total: active.length, shown: items.length,
        medianX: boxStats(active.map((row) => row.coding.submissions)).median, medianY: boxStats(active.map((row) => row.coding.prepScore)).median,
        items,
      };
    },
  },
  {
    id: 'class-spread', type: 'boxplot', size: 'md',
    title: 'Prep Score by class',
    question: 'How do Prep Scores differ between semesters, branches or sections, and how wide is the spread in each?',
    options: { groupBy: 'semester' },
    build: ({ rows, options }) => ({
      groupBy: options.groupBy || 'semester', label: 'Prep Score', unit: '',
      groups: groupRows(practising(rows), options.groupBy).map(([label, members]) => ({ label, students: members.length, ...boxStats(members.map((row) => row.coding.prepScore)) })),
    }),
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
// ---- Question-level Quick Prep helpers, shared with featureDrills.js so parts and drills count alike.
const round1q = (value) => Math.round(value * 10) / 10;
export const openSheets = (sheets) => [...(sheets?.values() || [])].filter((sheet) => sheet.published);
export const sheetOpenTo = (row, sheet) => Boolean(row.quickprep) && (!sheet.semesters.length || sheet.semesters.includes(Number(row.student.semester)));
export const QP_LEVELS = ['Easy', 'Medium', 'Hard', 'Other'];
export const levelOf = (difficulty) => (['Easy', 'Medium', 'Hard'].includes(difficulty) ? difficulty : 'Other');

/** Each question in the sheets a student started: Map(key -> { solved, difficulty, title, sheets[] }). */
export function startedQuestions(row, sheets) {
  const questions = new Map();
  if (!row.quickprep) return questions;
  for (const entry of row.quickprep.bySheet.values()) {
    const sheet = sheets?.get(entry.sheetId);
    if (!sheet?.questions) continue;
    const solved = new Set(entry.solvedKeys || []);
    for (const question of sheet.questions) {
      const current = questions.get(question.key) || { solved: false, difficulty: question.difficulty, title: question.title, sheets: [] };
      current.solved = current.solved || solved.has(question.key);
      current.sheets.push(sheet.title);
      questions.set(question.key, current);
    }
  }
  return questions;
}

// Time from starting a sheet to finishing it, averaged over the sheets a student finished.
export const QP_PACE_BANDS = Object.freeze([
  { label: 'Same day', max: 0 }, { label: '1–3 days', max: 3 }, { label: '4–7 days', max: 7 },
  { label: '1–2 weeks', max: 14 }, { label: '2–4 weeks', max: 30 }, { label: 'Over a month', max: Infinity },
]);
export function paceDaysOf(row) {
  const spans = [...(row.quickprep?.bySheet.values() || [])]
    .filter((entry) => entry.finished && entry.startedAt && entry.completedAt && new Date(entry.completedAt) >= new Date(entry.startedAt))
    .map((entry) => (new Date(entry.completedAt) - new Date(entry.startedAt)) / 86400000);
  return spans.length ? spans.reduce((sum, days) => sum + days, 0) / spans.length : null;
}
export const paceBandOf = (days) => QP_PACE_BANDS.findIndex((band) => Math.floor(days) <= band.max);

// How each first solve of a sheet question was done (services/solveEffort.js).
export const OWN_WORK_KINDS = Object.freeze([
  { key: 'ok', name: 'Solved on their own' }, { key: 'fast', name: 'Very fast' }, { key: 'pasted', name: 'Mostly pasted' }, { key: 'untracked', name: 'Not timed yet' },
]);
export const ownWorkKind = (item) => (!item.review ? 'untracked' : item.review.reasons.includes('pasted') ? 'pasted' : item.review.reasons.includes('fast') ? 'fast' : 'ok');

// Each student's Quick Prep status as a chart series (one series per student).
export const QUICKPREP_STATUS_SERIES = Object.freeze(['Finished a sheet', 'Started, none finished', 'Not started']);
export const quickPrepStatusLabel = (row) => ({ finished: QUICKPREP_STATUS_SERIES[0], inProgress: QUICKPREP_STATUS_SERIES[1] })[row.quickprep?.status] || QUICKPREP_STATUS_SERIES[2];
const lastSheetVisit = (row) => (row.quickprep.daysSinceActive === null ? 'Not opened yet'
  : row.quickprep.daysSinceActive === 0 ? 'Opened today' : `Last opened ${row.quickprep.daysSinceActive} day${row.quickprep.daysSinceActive === 1 ? '' : 's'} ago`);

/**
 * The steps of the Quick Prep "Sheet journey", shared by the chart and its student lists
 * (featureDrills.js). `gap`: who stopped just before this step, in plain words.
 */
export const QUICKPREP_FUNNEL_STAGES = Object.freeze([
  { name: 'All students', test: () => true },
  { name: 'Opened a sheet', gap: 'Never opened a sheet', test: (row) => row.quickprep.started > 0 },
  { name: 'Solved a question', gap: 'Opened, but nothing solved yet', test: (row) => row.quickprep.solved > 0 },
  { name: 'Half of a sheet', gap: 'Solving, but under half of any sheet', test: (row) => [...row.quickprep.bySheet.values()].some((entry) => entry.total && entry.solved / entry.total >= 0.5) },
  { name: 'Finished a sheet', gap: 'Past half, but no sheet finished', test: (row) => row.quickprep.finished > 0 },
]);

const QUICKPREP_CHARTS = [
  {
    // Every sheet students have started, as a bubble sized by how many started it and grouped
    // (size + colour) by that count, like the coding topic bubbles. A bubble lists its starters.
    id: 'quickprep-sheet-bubbles', type: 'bubble', size: 'md',
    title: 'Sheets students are working on',
    question: 'Which Quick Prep sheets do the most students work on, and how many finish them?',
    build: ({ rows, sheets }) => {
      const list = openSheets(sheets).map((sheet) => {
        const open = rows.filter((row) => sheetOpenTo(row, sheet)).length;
        const starters = rows.filter((row) => row.quickprep?.bySheet.has(sheet.id));
        const finished = starters.filter((row) => row.quickprep.bySheet.get(sheet.id).finished).length;
        return { sheet, open, starters: starters.length, finished };
      }).filter((entry) => entry.starters > 0)
        .sort((left, right) => right.starters - left.starters || left.sheet.title.localeCompare(right.sheet.title))
        .slice(0, TOPIC_BUBBLE_LIMIT);
      const tiers = topicTiers(list.map((entry) => entry.starters));
      const items = list.map((entry) => ({
        key: entry.sheet.id, name: entry.sheet.title, value: entry.starters,
        pct: entry.open ? round1q((entry.starters / entry.open) * 100) : 0,
        tier: topicTier(tiers, entry.starters),
        detail: `${entry.finished} finished · ${entry.starters ? Math.round((entry.finished / entry.starters) * 100) : 0}% finish rate`,
      }));
      return {
        valueLabel: 'students started', itemLabel: 'Sheet', cohort: rows.length, pctLabel: 'of the students it is open to',
        tiers: topicTierRanges(tiers, items).map((tier) => ({ ...tier, label: tier.label.replace('students', 'started').replace('student', 'started') })),
        items,
      };
    },
  },
  {
    // Easy / Medium / Hard as three progress rings: the share of started questions solved.
    id: 'quickprep-difficulty-rings', type: 'rings', size: 'sm',
    title: 'Solve rate by difficulty',
    question: 'Across the sheets students started, what share of Easy, Medium and Hard questions are solved?',
    build: ({ rows, sheets }) => {
      const levels = new Map(QP_LEVELS.map((level) => [level, { solved: 0, open: 0, students: new Set() }]));
      for (const row of rows) {
        for (const question of startedQuestions(row, sheets).values()) {
          const level = levels.get(levelOf(question.difficulty));
          if (question.solved) { level.solved += 1; level.students.add(row.id); } else level.open += 1;
        }
      }
      const items = QP_LEVELS.filter((level) => levels.get(level).solved + levels.get(level).open > 0).map((level) => {
        const entry = levels.get(level);
        const total = entry.solved + entry.open;
        return { key: level, label: level, value: round1q((entry.solved / total) * 100), solved: entry.solved, total, students: entry.students.size };
      });
      return { unit: '%', valueLabel: 'of started questions solved', items };
    },
  },
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
        .map((row) => ({
          id: row.id, name: row.name, value: row.quickprep.finished,
          note: `${row.quickprep.solved} questions solved · ${row.quickprep.progress}% of started sheets${row.quickprep.review?.flagged ? ` · ${row.quickprep.review.flagged} flagged` : ''}`,
          toReview: row.quickprep.review?.flagged || 0,
        })),
    }),
  },
  {
    id: 'quickprep-funnel', type: 'funnel', size: 'sm',
    title: 'Sheet journey',
    question: 'How many students reach each step, from opening a sheet to finishing one, and where do they stop?',
    build: ({ rows }) => {
      const withData = rows.filter((row) => row.quickprep);
      return {
        stages: QUICKPREP_FUNNEL_STAGES.map((stage) => ({ name: stage.name, value: withData.filter(stage.test).length })),
        // Between two steps: who reached the first but not the second (drill key "lost:<step>").
        drops: QUICKPREP_FUNNEL_STAGES.slice(1).map((stage, offset) => {
          const before = QUICKPREP_FUNNEL_STAGES[offset];
          return { key: `lost:${offset + 1}`, from: before.name, to: stage.name, label: stage.gap, students: withData.filter((row) => before.test(row) && !stage.test(row)).length };
        }),
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
  {
    id: 'quickprep-sheet-health', type: 'combo', size: 'full',
    title: 'Sheet health',
    question: 'For each sheet: how many students started and finished it, how far starters get on average, and what share of the students it is open to have started?',
    build: ({ rows, sheets }) => {
      const list = openSheets(sheets).map((sheet) => {
        const open = rows.filter((row) => sheetOpenTo(row, sheet));
        const starters = rows.filter((row) => row.quickprep?.bySheet.has(sheet.id));
        const finished = starters.filter((row) => row.quickprep.bySheet.get(sheet.id).finished).length;
        const progress = starters.map((row) => { const entry = row.quickprep.bySheet.get(sheet.id); return entry.total ? (entry.solved / entry.total) * 100 : 0; });
        return {
          key: sheet.id, label: sheet.title, students: starters.length, open: open.length, finished, inProgress: starters.length - finished,
          progress: progress.length ? round1q(progress.reduce((sum, value) => sum + value, 0) / progress.length) : 0,
          reach: open.length ? round1q((starters.length / open.length) * 100) : 0,
        };
      }).filter((sheet) => sheet.open > 0 || sheet.students > 0)
        .sort((left, right) => right.students - left.students || left.label.localeCompare(right.label)).slice(0, 12);
      return {
        barLabel: 'students',
        categories: list.map(({ key, label, students, open }) => ({ key, label, students, note: `${students} of ${open} students it is open to` })),
        bars: [
          { name: 'Finished', values: list.map((sheet) => sheet.finished), stack: 'students', students: true },
          { name: 'In progress', values: list.map((sheet) => sheet.inProgress), stack: 'students', students: true },
        ],
        lines: [
          { name: 'Average progress', values: list.map((sheet) => sheet.progress), unit: '%' },
          // Share of the students the sheet is open to who started it (the tooltip note says "x of y").
          { name: 'Start rate', values: list.map((sheet) => sheet.reach), unit: '%' },
        ],
      };
    },
  },
  {
    id: 'quickprep-difficulty-mix', type: 'combo', size: 'md',
    title: 'Solve rate by difficulty',
    question: 'Across the sheets students started: how many Easy, Medium and Hard questions are solved, and what share of them?',
    build: ({ rows, sheets }) => {
      const levels = new Map(QP_LEVELS.map((level) => [level, { solved: 0, open: 0, students: new Set() }]));
      for (const row of rows) {
        for (const question of startedQuestions(row, sheets).values()) {
          const level = levels.get(levelOf(question.difficulty));
          if (question.solved) { level.solved += 1; level.students.add(row.id); } else level.open += 1;
        }
      }
      const used = QP_LEVELS.filter((level) => levels.get(level).solved + levels.get(level).open > 0);
      return {
        barLabel: 'questions',
        categories: used.map((level) => ({ key: level, label: level, students: levels.get(level).students.size, note: `${levels.get(level).students.size} students solved one` })),
        bars: [
          { name: 'Solved', values: used.map((level) => levels.get(level).solved), stack: 'questions' },
          { name: 'Not solved yet', values: used.map((level) => levels.get(level).open), stack: 'questions' },
        ],
        lines: [{ name: 'Solve rate', unit: '%', values: used.map((level) => { const entry = levels.get(level); return round1q((entry.solved / (entry.solved + entry.open)) * 100); }) }],
      };
    },
  },
  {
    id: 'quickprep-hardest-questions', type: 'barList', size: 'md',
    title: 'Where students get stuck',
    question: 'Which sheet questions have the lowest solve rate among the students who started their sheet?',
    options: { limit: 10 },
    build: ({ rows, sheets, options }) => {
      const questions = new Map();
      for (const row of rows) {
        for (const [key, question] of startedQuestions(row, sheets)) {
          const entry = questions.get(key) || { ...question, starters: 0, solved: 0, sheets: new Set() };
          entry.starters += 1;
          if (question.solved) entry.solved += 1;
          question.sheets.forEach((title) => entry.sheets.add(title));
          questions.set(key, entry);
        }
      }
      const items = [...questions.entries()].map(([key, entry]) => ({ key, ...entry, rate: round1q((entry.solved / entry.starters) * 100) }))
        .sort((left, right) => left.rate - right.rate || right.starters - left.starters || left.title.localeCompare(right.title))
        .slice(0, clampLimit(options.limit, 10, 50));
      return {
        valueLabel: '% of starters solved', unit: '%',
        items: items.map((entry) => ({
          key: entry.key, name: entry.title, value: entry.rate, difficulty: ['Easy', 'Medium', 'Hard'].includes(entry.difficulty) ? entry.difficulty : undefined,
          students: entry.starters - entry.solved,
          note: `${entry.solved} of ${entry.starters} solved · ${entry.starters - entry.solved} stuck · ${[...entry.sheets].join(', ')}`,
        })),
      };
    },
  },
  {
    id: 'quickprep-pace', type: 'histogram', size: 'md',
    title: 'Time to finish a sheet',
    question: 'How long do students take from starting a sheet to finishing it (their average over finished sheets)?',
    build: ({ rows }) => {
      const bins = QP_PACE_BANDS.map((band, index) => ({ key: String(index), label: band.label, count: 0 }));
      for (const row of rows) { const days = paceDaysOf(row); if (days !== null) bins[paceBandOf(days)].count += 1; }
      return { label: 'Time to finish', bins };
    },
  },
  {
    id: 'quickprep-own-work', type: 'donut', size: 'sm',
    title: 'Own work in sheets',
    question: 'Of the sheet questions students solved (first solves), how many were solved on their own, very fast, or mostly pasted?',
    build: ({ rows }) => {
      const kinds = new Map(OWN_WORK_KINDS.map((kind) => [kind.key, { value: 0, students: new Set() }]));
      for (const row of rows) {
        for (const item of row.quickprep?.review?.items || []) {
          const kind = kinds.get(ownWorkKind(item));
          kind.value += 1;
          kind.students.add(row.id);
        }
      }
      return { centerLabel: 'sheet solves', items: OWN_WORK_KINDS.map((kind) => ({ key: kind.key, name: kind.name, value: kinds.get(kind.key).value, students: kinds.get(kind.key).students.size })) };
    },
  },
  {
    id: 'quickprep-trend', type: 'trend', size: 'lg',
    title: 'Sheets started and finished week by week',
    question: 'Is Quick Prep use picking up or slowing down?',
    build: ({ rows }) => weeklySeries(rows.filter((row) => row.quickprep), (row) => [...row.quickprep.days], ['Sheets started', 'Sheets finished']),
  },
  {
    id: 'quickprep-by-class', type: 'stackedBar', size: 'md',
    title: 'Quick Prep by class',
    question: 'In each semester, branch, section, group or campus, how many students finished a sheet, are working on one, or have not started?',
    options: { groupBy: 'semester' },
    build: ({ rows, options }) => ({
      groupBy: options.groupBy || 'semester',
      series: QUICKPREP_STATUS_SERIES,
      groups: groupRows(rows.filter((row) => row.quickprep), options.groupBy).map(([label, members]) => ({
        label, students: members.length,
        values: Object.fromEntries(QUICKPREP_STATUS_SERIES.map((name) => [name, members.filter((row) => quickPrepStatusLabel(row) === name).length])),
      })),
    }),
  },
  {
    id: 'quickprep-class-spread', type: 'boxplot', size: 'md',
    title: 'Sheet progress by class',
    question: 'Among students who started a sheet, how does progress differ between classes, and how wide is the spread?',
    options: { groupBy: 'semester' },
    build: ({ rows, options }) => ({
      groupBy: options.groupBy || 'semester', label: 'Sheet progress', unit: '%',
      groups: groupRows(sheetStarters(rows), options.groupBy).map(([label, members]) => ({ label, students: members.length, ...boxStats(members.map((row) => row.quickprep.progress)) })),
    }),
  },
  {
    id: 'quickprep-coverage', type: 'histogram', size: 'md',
    title: 'How many open sheets students have started',
    question: 'Of the sheets open to each student, what share have they started?',
    build: ({ rows }) => {
      const bins = Array.from({ length: 10 }, (_, index) => ({ label: `${index * 10}–${index * 10 + 10}%`, count: 0 }));
      rows.filter((row) => row.quickprep?.visibleSheets > 0).forEach((row) => { bins[Math.min(9, Math.floor(row.quickprep.coverage / 10))].count += 1; });
      return { label: 'Open sheets started', bins };
    },
  },
  {
    id: 'quickprep-calendar', type: 'calendar', size: 'full',
    title: 'Daily Quick Prep',
    question: 'On which days do students start or finish sheets?',
    build: ({ rows, range }) => {
      const totals = new Map();
      for (const row of rows) if (row.quickprep) for (const [day, [started, finished]] of row.quickprep.days) totals.set(day, (totals.get(day) || 0) + started + finished);
      return calendarPayload(totals, range, 'sheets started or finished');
    },
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
    question: 'How many tests did each semester, branch, section, group or campus pass, fail or miss?',
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
    id: 'assessment-score-time', type: 'scatter', size: 'lg',
    title: 'Score versus time taken',
    question: 'Who finished fast with a low score, and who took long but did well?',
    // One dot per graded attempt (a student's latest on each test).
    build: ({ rows, tests }) => {
      const dots = [];
      let total = 0;
      for (const row of rows) {
        if (!row.assessment) continue;
        for (const attempt of row.assessment.byTest.values()) {
          total += 1;
          if (dots.length >= MAX_DOTS) continue;
          const title = tests?.get(attempt.testId)?.title || 'Test';
          dots.push({
            id: row.id, name: row.name, x: attempt.minutes, y: attempt.percent, group: attempt.percent >= PASS_PERCENT ? 'Passed' : 'Failed',
            note: `${title} · ${attempt.score}/${attempt.maxMarks} marks`,
          });
        }
      }
      return {
        xLabel: 'Minutes taken', yLabel: 'Score (%)', groups: ['Passed', 'Failed'], total, shown: dots.length, yMax: 100, referenceY: { value: PASS_PERCENT, label: `Pass mark ${PASS_PERCENT}%` },
        medianX: boxStats(dots.map((dot) => dot.x)).median, medianY: boxStats(dots.map((dot) => dot.y)).median, items: dots,
      };
    },
  },
  {
    id: 'assessment-class-spread', type: 'boxplot', size: 'md',
    title: 'Test scores by class',
    question: 'How do average test scores differ between semesters, branches or sections?',
    options: { groupBy: 'semester' },
    build: ({ rows, options }) => ({
      groupBy: options.groupBy || 'semester', label: 'Average test score', unit: '%', passMark: PASS_PERCENT,
      groups: groupRows(testTakers(rows), options.groupBy).map(([label, members]) => ({ label, students: members.length, ...boxStats(members.map((row) => row.assessment.averageScore)) })),
    }),
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

// One section per feature. Quick Prep has its own section, separate from Prep Coding.
export const SECTIONS = Object.freeze({
  coding: { label: 'Prep Coding', module: 'coding' },
  quickprep: { label: 'Quick Prep', module: 'quickprep' },
  learning: { label: 'Prep Learning', module: 'learning' },
  interview: { label: 'Prep Interview', module: 'interview' },
  assessment: { label: 'Prep Assessment', module: 'assessment' },
});

export const CHARTS = [
  ...CODING_CHARTS.map((chart) => ({ module: 'coding', section: 'coding', ...chart })),
  ...QUICKPREP_CHARTS.map((chart) => ({ module: 'quickprep', section: 'quickprep', ...chart })),
  ...LEARNING_CHARTS.map((chart) => ({ module: 'learning', section: 'learning', ...chart })),
  ...INTERVIEW_CHARTS.map((chart) => ({ module: 'interview', section: 'interview', ...chart })),
  ...ASSESSMENT_CHARTS.map((chart) => ({ module: 'assessment', section: 'assessment', ...chart })),
];

export const CHART_BY_ID = new Map(CHARTS.map((chart) => [chart.id, chart]));

// What a fresh page shows per area; admins add, move, resize or hide charts from there.
// Every page follows the Prep Coding pattern (agreed 2026-11-18), on 12-column rows with no gaps:
// the daily heat map first (shown above the headline cards), the leaders list wide beside a small
// chart, the week-by-week trend full width, then pairs of halves and a row of three smalls, and
// the big tables last. "id:size" sets the card's width on that page (sm 4, md 6, lg 8, full 12);
// a bare id keeps the chart's own `size`. The "all" page is one block per feature, each row full.
const LAYOUTS = {
  // 2026-11-19: "Student skill profile" left the default page; "Trend of submissions till today"
  // took its place in the row of three, so "Top students" runs the full width.
  coding: ['activity-calendar', 'top-students:full', 'practice-trend', 'practice-funnel', 'topic-strength', 'needs-attention', 'tough-problems',
    'submission-trend', 'failure-reasons', 'language-usage', 'score-spread', 'class-spread', 'student-map'],
  // 2026-11-19 redesign: activity (heat map, weekly lines + own-work donut), then sheets (bubbles +
  // journey funnel, sheet health), students (leaders + stuck), difficulty rings with two
  // histograms, questions and classes, and the student × sheet grid last.
  quickprep: ['quickprep-calendar', 'quickprep-trend:lg', 'quickprep-own-work:sm', 'quickprep-sheet-bubbles:md', 'quickprep-funnel:md',
    'quickprep-sheet-health:full', 'quickprep-leaders:md', 'quickprep-needs-attention:md',
    'quickprep-difficulty-rings:sm', 'quickprep-pace:sm', 'quickprep-spread:sm', 'quickprep-hardest-questions:md', 'quickprep-by-class:md',
    'quickprep-class-spread:md', 'quickprep-coverage:md', 'quickprep-matrix:full'],
  learning: ['learning-calendar', 'learning-leaders:lg', 'learning-funnel', 'learning-trend:full', 'learning-subjects:full', 'learning-needs-attention', 'learning-spread'],
  interview: ['interview-calendar', 'interview-leaders:lg', 'interview-mix', 'interview-trend:full', 'interview-ratings', 'interview-funnel',
    'interview-needs-attention', 'interview-spread'],
  assessment: ['assessment-calendar', 'assessment-tests', 'assessment-funnel', 'assessment-trend:full', 'assessment-leaders', 'assessment-needs-attention',
    'assessment-by-class', 'assessment-class-spread', 'assessment-score-time', 'assessment-spread:sm', 'assessment-scores'],
  all: ['top-students', 'practice-funnel:sm', 'quickprep-sheet-health', 'learning-subjects', 'learning-funnel', 'interview-trend', 'interview-funnel', 'assessment-tests', 'assessment-funnel'],
};
const layoutEntry = (entry) => { const [id, size] = entry.split(':'); return { id, size }; };
const perArea = (pick) => Object.freeze(Object.fromEntries(Object.entries(LAYOUTS).map(([area, list]) => [area, pick(list.map(layoutEntry))])));
/** Chart ids per area, in page order. */
export const DEFAULT_LAYOUT = perArea((entries) => Object.freeze(entries.map((entry) => entry.id)));
/** Card widths per area where the page differs from the chart's own size: { area: { id: size } }. */
export const DEFAULT_SIZES = perArea((entries) => Object.freeze(Object.fromEntries(entries.filter((entry) => entry.size).map((entry) => [entry.id, entry.size]))));

// Raise an area's number when its default layout is redesigned: a layout this browser saved
// under an older number is replaced by the new default once; changes made after that stay.
export const DEFAULT_LAYOUT_VERSION = Object.freeze({ coding: 3, quickprep: 3, learning: 2, interview: 2, assessment: 2, all: 2 });

// Headline numbers: a few actionable student counts per feature. Prep Coding also
// includes accepted / total submissions because it is the clearest cohort-level
// health check and does not pretend that a submission is a student.
const share = (count, total) => (total ? `${Math.round((count / total) * 100)}% of ${total.toLocaleString()} students` : '');
const studentKpi = (id, label, rows, test, extra = {}) => {
  const value = rows.filter(test).length;
  return { id, label, value, format: 'count', hint: share(value, rows.length), ...extra };
};

/**
 * A "part / whole" card (e.g. accepted / total submissions); its trend line is the rate. `value`
 * (what the previous-period badge compares, named by `valueLabel`) is the whole unless `compare`
 * is 'part' (e.g. topics completed, not topics available).
 */
const ratioKpi = (id, label, part, whole, { hint, rateLabel, valueLabel, compare = 'whole' }) => {
  const rate = whole ? Math.round((part / whole) * 1000) / 10 : 0;
  return { id, label, value: compare === 'part' ? part : whole, accepted: part, total: whole, rate, format: 'ratio', hint: `${rate}% ${hint}`, rateLabel, valueLabel };
};

const submissionKpi = (rows) => ratioKpi('submissions', 'Accepted / Total Submissions',
  rows.reduce((sum, row) => sum + row.coding.accepted, 0), rows.reduce((sum, row) => sum + row.coding.submissions, 0),
  { hint: 'acceptance rate', rateLabel: 'Acceptance rate', valueLabel: 'submissions' });

// ---- Trend-line helpers shared by every feature's headline cards.
const SERIES_DAY_MS = 24 * 60 * 60 * 1000;
const SERIES_MAX_POINTS = 26;
const dayKeyOf = (time) => new Date(time).toISOString().slice(0, 10);
const timeOf = (date) => { const time = date ? new Date(date).getTime() : NaN; return Number.isFinite(time) ? time : null; };
const firstTimeOf = (dates) => dates.reduce((first, date) => { const time = timeOf(date); return time !== null && (first === null || time < first) ? time : first; }, null);
const percentOf1 = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const average1 = (values) => (values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : 0);
/** True when one of these sorted day keys falls in the 14 days up to `time` ("active" everywhere). */
const activeAt = (dayKeys, time) => {
  const last = dayKeyOf(time);
  const first = dayKeyOf(time - INACTIVE_AFTER_DAYS * SERIES_DAY_MS);
  return dayKeys.some((day) => day >= first && day <= last);
};
/** Builds { kpiId: [{ at, value }] } by measuring each card at every point. */
const measureSeries = (points, measures) => new Map(Object.entries(measures).map(([id, measure]) => [id, points.map((time) => ({ at: new Date(time).toISOString(), value: measure(time) }))]));
const countAt = (list, test) => (time) => list.filter((item) => test(item, time)).length;

/**
 * Prep Learning: who is learning, who has completed a topic, who is halfway, who has stopped, and
 * how much of the course the students in view have completed. Topic completions are dated, so the
 * lines replay them: at each point a student's completed topics are those completed by then.
 */
function learningKpis(rows, range, now) {
  const withData = rows.filter((row) => row.learning);
  const learning = (row) => row.learning;
  const kpis = [
    studentKpi('active', 'Active Learners', withData, (row) => learning(row).status === 'active'),
    studentKpi('topicDone', 'Completed a Topic', withData, (row) => learning(row).completedTopics > 0),
    studentKpi('halfway', 'Halfway Through the Course', withData, (row) => learning(row).progress >= 50),
    studentKpi('stopped', 'Not Learning', withData, (row) => learning(row).status !== 'active', { tone: 'warning' }),
    ratioKpi('topics', 'Completed / Available Topics', withData.reduce((sum, row) => sum + learning(row).completedTopics, 0),
      withData.reduce((sum, row) => sum + learning(row).availableTopics, 0), { hint: 'of the course completed', rateLabel: 'Course completed', valueLabel: 'topics completed', compare: 'part' }),
  ];
  if (!range) return kpis;
  const students = withData.map((row) => ({ ...learning(row), dayKeys: [...(learning(row).days?.keys?.() || [])].sort() }));
  // Topics completed by `time`: everything completed, less what was completed after that day.
  const doneBy = (student, time) => {
    const day = dayKeyOf(time);
    let later = 0;
    for (const [key, count] of student.days || []) if (key > day) later += count;
    return Math.max(0, student.completedTopics - later);
  };
  const available = students.reduce((sum, student) => sum + student.availableTopics, 0);
  const active = countAt(students, (student, time) => activeAt(student.dayKeys, time));
  return withSeries(kpis, measureSeries(seriesPoints(withData, range, now, (row) => learning(row).days), {
    active,
    topicDone: countAt(students, (student, time) => doneBy(student, time) > 0),
    halfway: countAt(students, (student, time) => student.availableTopics > 0 && (doneBy(student, time) / student.availableTopics) * 100 >= 50),
    stopped: (time) => students.length - active(time),
    topics: (time) => percentOf1(students.reduce((sum, student) => sum + doneBy(student, time), 0), available),
  }));
}

/**
 * Prep Interview: who has been interviewed, who is interviewing now, who scores 60%+, who never
 * has, and the average mock score. Every mock and AI interview is dated.
 */
function interviewKpis(rows, range, now) {
  const withData = rows.filter((row) => row.interview);
  const mockScores = withData.flatMap((row) => row.interview.mocks.map((mock) => mock.score));
  const kpis = [
    studentKpi('students', 'Interviewed', withData, (row) => row.interview.done > 0),
    studentKpi('active', 'Active Interviewees', withData, (row) => row.interview.status === 'active'),
    studentKpi('strong', 'Mock Score 60%+', withData, (row) => row.interview.mockDone > 0 && row.interview.mockScore >= 60),
    studentKpi('never', 'Never Interviewed', withData, (row) => row.interview.status === 'never', { tone: 'warning' }),
    { id: 'avgMock', label: 'Average Mock Score', value: average1(mockScores), format: 'percent', hint: `across ${mockScores.length.toLocaleString()} mock interview${mockScores.length === 1 ? '' : 's'}` },
  ];
  if (!range) return kpis;
  const students = withData.map((row) => ({
    first: firstTimeOf([...row.interview.mocks.map((mock) => mock.at), ...row.interview.aiDates]),
    dayKeys: [...(row.interview.days?.keys?.() || [])].sort(),
    mocks: row.interview.mocks.map((mock) => ({ time: timeOf(mock.at), score: mock.score })).filter((mock) => mock.time !== null),
  }));
  const interviewed = countAt(students, (student, time) => student.first !== null && student.first <= time);
  const scoresBy = (student, time) => student.mocks.filter((mock) => mock.time <= time).map((mock) => mock.score);
  return withSeries(kpis, measureSeries(seriesPoints(withData, range, now, (row) => row.interview.days), {
    students: interviewed,
    active: countAt(students, (student, time) => activeAt(student.dayKeys, time)),
    strong: countAt(students, (student, time) => { const scores = scoresBy(student, time); return scores.length > 0 && average1(scores) >= 60; }),
    never: (time) => students.length - interviewed(time),
    avgMock: (time) => average1(students.flatMap((student) => scoresBy(student, time))),
  }));
}

/**
 * Prep Assessment: who took a test, who passed one, who missed one, who never took one, and
 * passed / taken tests. Attempts are dated, and a missed test dates from when it closed.
 */
function assessmentKpis(rows, range, now) {
  const withData = rows.filter((row) => row.assessment);
  const kpis = [
    studentKpi('students', 'Took a Test', withData, (row) => row.assessment.taken > 0),
    studentKpi('passedStudents', `Passed a Test (${PASS_PERCENT}%+)`, withData, (row) => row.assessment.passed > 0),
    studentKpi('missed', 'Missed a Test', withData, (row) => row.assessment.missed > 0, { tone: 'warning' }),
    studentKpi('never', 'Never Took a Test', withData, (row) => row.assessment.status === 'never', { tone: 'warning' }),
    ratioKpi('passRate', 'Passed / Taken Tests', withData.reduce((sum, row) => sum + row.assessment.passed, 0),
      withData.reduce((sum, row) => sum + row.assessment.taken, 0), { hint: 'pass rate', rateLabel: 'Pass rate', valueLabel: 'tests taken' }),
  ];
  if (!range) return kpis;
  const students = withData.map((row) => {
    const attempts = [...(row.assessment.byTest?.values?.() || [])].map((attempt) => ({ time: timeOf(attempt.at), passed: attempt.percent >= PASS_PERCENT })).filter((attempt) => attempt.time !== null);
    return {
      attempts,
      firstTaken: attempts.length ? Math.min(...attempts.map((attempt) => attempt.time)) : null,
      firstPassed: firstTimeOf(attempts.filter((attempt) => attempt.passed).map((attempt) => attempt.time)),
      firstMissed: firstTimeOf(row.assessment.missedDates || []),
    };
  });
  const took = countAt(students, (student, time) => student.firstTaken !== null && student.firstTaken <= time);
  return withSeries(kpis, measureSeries(seriesPoints(withData, range, now, (row) => row.assessment.days), {
    students: took,
    passedStudents: countAt(students, (student, time) => student.firstPassed !== null && student.firstPassed <= time),
    missed: countAt(students, (student, time) => student.firstMissed !== null && student.firstMissed <= time),
    never: (time) => students.length - took(time),
    passRate: (time) => {
      const taken = students.flatMap((student) => student.attempts.filter((attempt) => attempt.time <= time));
      return percentOf1(taken.filter((attempt) => attempt.passed).length, taken.length);
    },
  }));
}

/**
 * Quick Prep sheets: who started, who used sheets recently, who finished, who never opened one,
 * and flagged own work. Sheet starts, finishes, last visits and timed solves are dated.
 */
function quickPrepKpis(rows, range, now) {
  const withData = rows.filter((row) => row.quickprep);
  const tracked = withData.some((row) => row.quickprep.review?.tracked);
  const kpis = [
    studentKpi('sheetStarted', 'Started a Sheet', withData, (row) => row.quickprep.started > 0),
    studentKpi('sheetActive', 'Active Sheet Users', withData, (row) => row.quickprep.activity === 'active'),
    studentKpi('sheetFinished', 'Finished a Sheet', withData, (row) => row.quickprep.finished > 0),
    studentKpi('never', 'Never Opened a Sheet', withData, (row) => row.quickprep.status === 'none', { tone: 'warning' }),
    // Always the fifth card (same five every time); says so when no solve has been timed yet.
    studentKpi('review', 'Flagged Students', withData, (row) => row.quickprep.review?.flagged > 0, { tone: 'warning', ...(tracked ? {} : { hint: 'No timed solves tracked yet' }) }),
  ];
  if (!range) return kpis;
  const students = withData.map((row) => {
    const sheets = [...(row.quickprep.bySheet?.values?.() || [])];
    const visits = sheets.flatMap((sheet) => [sheet.startedAt, sheet.completedAt, sheet.lastViewedAt]).map(timeOf).filter((time) => time !== null);
    return {
      firstStarted: firstTimeOf(sheets.map((sheet) => sheet.startedAt)),
      firstFinished: firstTimeOf(sheets.filter((sheet) => sheet.finished).map((sheet) => sheet.completedAt)),
      firstFlagged: firstTimeOf((row.quickprep.review?.items || []).filter((item) => item.review?.reasons?.length).map((item) => item.at)),
      visitDays: [...new Set(visits.map(dayKeyOf))].sort(),
    };
  });
  const started = countAt(students, (student, time) => student.firstStarted !== null && student.firstStarted <= time);
  return withSeries(kpis, measureSeries(seriesPoints(withData, range, now, (row) => row.quickprep.days), {
    sheetStarted: started,
    sheetActive: countAt(students, (student, time) => activeAt(student.visitDays, time)),
    sheetFinished: countAt(students, (student, time) => student.firstFinished !== null && student.firstFinished <= time),
    never: (time) => students.length - started(time),
    review: countAt(students, (student, time) => student.firstFlagged !== null && student.firstFlagged <= time),
  }));
}

/**
 * Headline counts per feature for the students in view (never cohort averages): five cards per
 * feature. With `range`, every card carries a trend line over the period.
 */
export function buildKpiGroups(area, modules, rows, range = null, now = new Date()) {
  const builders = {
    coding: (list) => buildKpis(list, range, now),
    quickprep: (list) => quickPrepKpis(list, range, now),
    learning: (list) => learningKpis(list, range, now),
    interview: (list) => interviewKpis(list, range, now),
    assessment: (list) => assessmentKpis(list, range, now),
  };
  return Object.entries(SECTIONS)
    .filter(([, section]) => modules.has(section.module) && (area === 'all' || section.module === area))
    .map(([key, section]) => ({ key, module: section.module, label: section.label, kpis: builders[key](rows) }));
}

/**
 * Points (oldest first) for the headline trend lines: daily for up to a month, weekly up to four
 * months, else evenly spread (at most 26). "All time" uses the span the data covers (each
 * feature's own activity days, `daysOf(row)`), capped at six months so the line stays readable.
 * The last point is the period end.
 */
export function seriesPoints(rows, range, now = new Date(), daysOf = (row) => row.days) {
  const end = (range?.to ? new Date(range.to) : now).getTime();
  let start = range?.from ? new Date(range.from).getTime() : null;
  if (start === null) {
    const firstDay = rows.flatMap((row) => [...(daysOf(row)?.keys?.() || [])]).sort()[0];
    start = firstDay ? Math.max(Date.parse(`${firstDay}T00:00:00Z`), end - 180 * SERIES_DAY_MS) : end - 30 * SERIES_DAY_MS;
  }
  const span = Math.max(SERIES_DAY_MS, end - start);
  const step = span <= 31 * SERIES_DAY_MS ? SERIES_DAY_MS : span <= 120 * SERIES_DAY_MS ? 7 * SERIES_DAY_MS : Math.ceil(span / SERIES_MAX_POINTS);
  const points = [];
  for (let time = end; time > start && points.length < SERIES_MAX_POINTS; time -= step) points.unshift(time);
  return points.length > 1 ? points : [end - SERIES_DAY_MS, end];
}

/**
 * Trend lines for the Prep Coding headline cards, each measured exactly like its card at every
 * point, so the last point equals the card's number:
 *   active   students who practised in the 14 days up to that point (Active Users)
 *   stopped  students in view minus active (Inactive Students)
 *   hard     students whose first Hard solve in the period was on or before that point
 *   review   students whose first flagged solve in the period was on or before that point
 *   submissions  acceptance rate of all submissions in the period up to that point
 * Returns Map(kpiId -> [{ at, value }]).
 */
export function codingKpiSeries(rows, range, now = new Date()) {
  const points = seriesPoints(rows, range, now);
  const inactiveWindow = INACTIVE_AFTER_DAYS * SERIES_DAY_MS;
  // Per student: sorted active day keys; per day: submission totals (for the acceptance line).
  const studentDays = rows.map((row) => [...(row.days?.keys?.() || [])].sort());
  const dayTotals = new Map();
  for (const row of rows) {
    for (const [day, figures] of row.days || []) {
      const total = dayTotals.get(day) || { attempts: 0, accepted: 0 };
      total.attempts += figures.attempts || 0;
      total.accepted += figures.accepted || 0;
      dayTotals.set(day, total);
    }
  }
  const sortedDays = [...dayTotals.keys()].sort();
  const firstHard = rows.map((row) => (row.coding.firstHardAt ? Date.parse(row.coding.firstHardAt) : null));
  const firstFlagged = rows.map((row) => (row.coding.firstFlaggedAt ? Date.parse(row.coding.firstFlaggedAt) : null));
  const series = { active: [], stopped: [], hard: [], review: [], submissions: [] };
  let dayIndex = 0;
  let attempts = 0;
  let accepted = 0;
  for (const time of points) {
    const at = new Date(time).toISOString();
    const lastKey = dayKeyOf(time);
    const firstKey = dayKeyOf(time - inactiveWindow);
    const active = studentDays.filter((days) => days.some((day) => day >= firstKey && day <= lastKey)).length;
    while (dayIndex < sortedDays.length && sortedDays[dayIndex] <= lastKey) {
      const figures = dayTotals.get(sortedDays[dayIndex]);
      attempts += figures.attempts;
      accepted += figures.accepted;
      dayIndex += 1;
    }
    series.active.push({ at, value: active });
    series.stopped.push({ at, value: rows.length - active });
    series.hard.push({ at, value: firstHard.filter((first) => first !== null && first <= time).length });
    series.review.push({ at, value: firstFlagged.filter((first) => first !== null && first <= time).length });
    series.submissions.push({ at, value: attempts ? Math.round((accepted / attempts) * 1000) / 10 : 0 });
  }
  return new Map(Object.entries(series));
}

/** Pins each series' last point to the card's own number (the card is the source of truth). */
function withSeries(kpis, series) {
  return kpis.map((kpi) => {
    const points = series.get(kpi.id);
    if (!points?.length) return kpi;
    const last = kpi.format === 'ratio' ? kpi.rate : kpi.value;
    return { ...kpi, series: [...points.slice(0, -1), { ...points.at(-1), value: last }] };
  });
}

/** Headline counts for Prep Coding (Quick Prep has its own). With `range`, each card carries a trend line. */
export function buildKpis(rows, range = null, now = new Date()) {
  const kpis = codingKpiCards(rows);
  return range ? withSeries(kpis, codingKpiSeries(rows, range, now)) : kpis;
}

function codingKpiCards(rows) {
  const reviewTracked = rows.some((row) => row.coding.review?.tracked);
  return [
    studentKpi('active', 'Active Users', rows, (row) => row.coding.practiceStatus === 'active'),
    studentKpi('hard', 'Hard Problem Solvers', rows, (row) => row.coding.solved.Hard > 0),
    studentKpi('stopped', 'Inactive Students', rows, (row) => row.coding.practiceStatus !== 'active', { tone: 'warning' }),
    // Very fast or mostly pasted first solves. Keep the card visible so this row
    // always has the same five metrics; be explicit when tracking has no evidence.
    studentKpi('review', 'Flagged Students', rows, (row) => row.coding.review?.flagged > 0, {
      tone: 'warning',
      ...(reviewTracked ? {} : { hint: 'No timed solves tracked yet' }),
    }),
    submissionKpi(rows),
  ];
}
