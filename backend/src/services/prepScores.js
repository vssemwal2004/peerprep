// Prep Score: one score per feature from the student's own work, and an overall
// Prep Score that is the average of the features the university licenses. There
// is no ceiling (more real work keeps adding), but every feature multiplies the
// work done by an averaged quality, so volume alone cannot inflate it.
//
//   Feature score = Work points x Quality (+ AI interview points)
//   Prep Coding     = (1 x Easy + 2 x Medium + 4 x Hard) x min(1, (3 x solved + 10) / (submissions + 10))
//   Prep Learning   = 14 x topics completed
//   Prep Interview  = 250 x mock interviews x Quality + 5 x AI interviews
//   Prep Assessment = 100 x tests taken x Quality
//     Quality (interview, assessment) = (average score - 40) / 60: only marks above the 40%
//     pass mark earn points, so a failing attempt never adds to the score (it can only lower
//     the average). The points are 250 or 100 x the sum of (mark - 40) / 60 over the attempts.
//   Prep Score      = average of the licensed features' scores
//
// Points per unit are set so a well-prepared student earns about the same in
// every feature, so the average is fair across universities with different
// licences. The coding part is the same function admin Prep Analysis uses.

import {
  DIFFICULTY_POINTS, FAIR_TRIES_PER_SOLVE, prepScore as codingPrepScore, STARTER_SUBMISSIONS,
} from '../modules/prepAnalysis/prepScore.js';

export const PREP_SCORE_RULES = Object.freeze({
  coding: { points: DIFFICULTY_POINTS, fairTriesPerSolve: FAIR_TRIES_PER_SOLVE, starterSubmissions: STARTER_SUBMISSIONS },
  learning: { perTopic: 14 },
  interview: { perMock: 250, perAiInterview: 5 },
  assessment: { perTest: 100 },
  // Interview and assessment marks count only above this.
  passMark: 40,
});
export const PREP_SCORE_FEATURES = Object.freeze([
  { key: 'coding', label: 'Prep Coding' },
  { key: 'learning', label: 'Prep Learning' },
  { key: 'interview', label: 'Prep Interview' },
  { key: 'assessment', label: 'Prep Assessment' },
]);

/** Which features count under a university's permissions (null = every feature). */
export function scoreFeatures(permissions) {
  const allowed = (key) => !permissions || permissions[key] === true;
  return {
    coding: allowed('questions'),
    learning: allowed('learning'),
    interview: allowed('events') || allowed('interviews'),
    assessment: allowed('assessments'),
    // Which parts of Prep Interview exist: mock interviews ("events") and AI interviews.
    mock: allowed('events'),
    ai: allowed('interviews'),
  };
}

const count = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};
const percent = (value) => Math.min(100, count(value));
const round1 = (value) => Math.round(value * 10) / 10;
const round2 = (value) => Math.round(value * 100) / 100;
const num = (value) => round1(value).toLocaleString('en-US');
const plural = (amount, word) => `${num(amount)} ${word}${amount === 1 ? '' : 's'}`;

/** Interview/assessment quality: how far the average mark is above the pass mark, as a share of the marks above it (0-1). */
function markQualityStep(attempts, average, noun) {
  const { passMark } = PREP_SCORE_RULES;
  const mark = attempts ? percent(average) : 0;
  const quality = attempts ? Math.max(0, mark - passMark) / (100 - passMark) : 0;
  return {
    quality,
    step: {
      label: 'Quality',
      value: round1(quality * 100),
      detail: attempts
        ? `Your average is ${num(mark)}%; only marks above the ${passMark}% pass mark earn points`
        : `No ${noun} yet`,
      math: attempts ? `(${num(mark)} − ${passMark}) ÷ ${100 - passMark}` : '',
    },
  };
}

/**
 * Scores for one student.
 * metrics: { easySolved, mediumSolved, hardSolved, submissions, acceptedSubmissions,
 *            completedTopics, totalTopics, mockInterviews, mockAverage, aiInterviews,
 *            testsTaken, testAverage }
 * Returns { total, features: { coding: { score, rule, work, quality, extra }, … } } where
 * score = work.value x quality.value% + extra.value, and total = average of the feature scores.
 */
export function prepScores(metrics = {}, features = scoreFeatures(null)) {
  const result = {};
  const exacts = [];
  if (features.coding) {
    const solved = { Easy: count(metrics.easySolved), Medium: count(metrics.mediumSolved), Hard: count(metrics.hardSolved) };
    const solvedTotal = solved.Easy + solved.Medium + solved.Hard;
    const submissions = count(metrics.submissions);
    const coding = codingPrepScore({ solved, accepted: count(metrics.acceptedSubmissions), attempts: submissions });
    const { points, fairTriesPerSolve, starterSubmissions } = PREP_SCORE_RULES.coding;
    exacts.push(coding.exact);
    result.coding = {
      score: coding.score,
      rule: `Easy ${points.Easy} · Medium ${points.Medium} · Hard ${points.Hard} points per problem solved, × quality`,
      work: {
        label: 'Work points',
        value: coding.work,
        detail: solvedTotal ? Object.entries(solved).map(([key, amount]) => `${num(amount)} ${key} × ${points[key]}`).join(' + ') : 'No problem solved yet',
      },
      quality: {
        label: 'Quality',
        value: coding.quality,
        detail: submissions
          ? `${plural(submissions, 'submission')} for ${plural(solvedTotal, 'solved problem')}; up to ${fairTriesPerSolve} per solve is fair and the first ${starterSubmissions} are free`
          : 'No submission yet',
        math: submissions ? `(${fairTriesPerSolve} × ${num(solvedTotal)} + ${starterSubmissions}) ÷ (${num(submissions)} + ${starterSubmissions}), at most 100%` : '',
      },
      extra: null,
    };
  }
  if (features.learning) {
    const total = count(metrics.totalTopics);
    const completed = Math.min(total, count(metrics.completedTopics));
    const { perTopic } = PREP_SCORE_RULES.learning;
    const exact = completed * perTopic;
    exacts.push(exact);
    result.learning = {
      score: round1(exact),
      rule: `${perTopic} points per topic completed`,
      work: { label: 'Work points', value: exact, detail: `${plural(completed, 'topic')} completed (of ${num(total)} open to you) × ${perTopic}` },
      quality: null,
      extra: null,
    };
  }
  if (features.interview) {
    // A university may license only mock interviews or only AI interviews; show just the parts that exist.
    const showMock = features.mock !== false;
    const showAi = features.ai !== false;
    const mocks = showMock ? count(metrics.mockInterviews) : 0;
    const ai = showAi ? count(metrics.aiInterviews) : 0;
    const { perMock, perAiInterview } = PREP_SCORE_RULES.interview;
    const aiPoints = { label: 'AI interview points', value: ai * perAiInterview, detail: `${plural(ai, 'AI interview')} × ${perAiInterview}` };
    if (showMock) {
      const { quality, step } = markQualityStep(mocks, mocks ? metrics.mockAverage : 0, 'mock interview');
      const exact = mocks * perMock * quality + ai * perAiInterview;
      exacts.push(exact);
      result.interview = {
        score: round1(exact),
        rule: `${perMock} points per mock interview × quality${showAi ? `, plus ${perAiInterview} per AI interview` : ''}`,
        work: { label: 'Work points', value: mocks * perMock, detail: `${plural(mocks, 'mock interview')} × ${perMock}` },
        quality: step,
        extra: showAi ? aiPoints : null,
      };
    } else {
      const exact = ai * perAiInterview;
      exacts.push(exact);
      result.interview = {
        score: round1(exact),
        rule: `${perAiInterview} points per AI interview`,
        work: { label: 'Work points', value: exact, detail: aiPoints.detail },
        quality: null,
        extra: null,
      };
    }
  }
  if (features.assessment) {
    const taken = count(metrics.testsTaken);
    const hasAverage = taken && metrics.testAverage !== null && metrics.testAverage !== undefined;
    const { perTest } = PREP_SCORE_RULES.assessment;
    const { quality, step } = markQualityStep(taken, hasAverage ? metrics.testAverage : 0, 'test');
    const exact = taken * perTest * quality;
    exacts.push(exact);
    result.assessment = {
      score: round1(exact),
      rule: `${perTest} points per test taken × quality`,
      work: { label: 'Work points', value: taken * perTest, detail: `${plural(taken, 'test')} × ${perTest}` },
      quality: step,
      extra: null,
    };
  }
  // Averaged from unrounded feature scores and kept to 2 decimals, so small real differences still rank apart.
  return { total: exacts.length ? round2(exacts.reduce((sum, value) => sum + value, 0) / exacts.length) : 0, features: result };
}

/** The formula in one line, for screen readers and exports (the pages show it as a flow). */
export function prepScoreMethodology(features = scoreFeatures(null)) {
  const counted = PREP_SCORE_FEATURES.filter(({ key }) => features[key]).map(({ label }) => label);
  return `Each feature scores work points × quality from your own work; your Prep Score is the average of ${counted.join(', ') || 'your features'}. A better Prep Score means a better rank; equal scores share a rank.`;
}
