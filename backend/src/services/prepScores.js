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
//     Quality (interview, assessment) = (average score - 40) / 60, where the average
//     counts 2 starter attempts at 50% (epsilon), so one great or bad attempt cannot dominate;
//     an average at or below the 40% pass mark earns no points.
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
  // Interview and assessment quality.
  passMark: 40,
  starterAttempts: 2,
  starterScore: 50,
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

/** Interview/assessment quality: the smoothed average's distance above the pass mark, 0-1. */
function markQuality(attempts, average) {
  const { passMark, starterAttempts, starterScore } = PREP_SCORE_RULES;
  const smoothed = (attempts * percent(average) + starterAttempts * starterScore) / (attempts + starterAttempts);
  return { smoothed, quality: Math.max(0, smoothed - passMark) / (100 - passMark) };
}

function markQualityStep(attempts, average, noun) {
  const { passMark, starterAttempts, starterScore } = PREP_SCORE_RULES;
  const { smoothed, quality } = markQuality(attempts, average);
  return {
    quality,
    step: {
      label: 'Quality',
      value: attempts ? round1(quality * 100) : 0,
      detail: attempts
        ? `Your average ${num(percent(average))}% counts as ${num(smoothed)}% with ${starterAttempts} starter ${noun}s at ${starterScore}%; only marks above the ${passMark}% pass mark count`
        : `No ${noun} yet`,
      math: attempts ? `(${num(smoothed)} − ${passMark}) ÷ ${100 - passMark}` : '',
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
    const mocks = count(metrics.mockInterviews);
    const ai = count(metrics.aiInterviews);
    const { perMock, perAiInterview } = PREP_SCORE_RULES.interview;
    const { quality, step } = markQualityStep(mocks, mocks ? metrics.mockAverage : 0, 'mock interview');
    const exact = mocks * perMock * quality + ai * perAiInterview;
    exacts.push(exact);
    result.interview = {
      score: round1(exact),
      rule: `${perMock} points per mock interview × quality, plus ${perAiInterview} per AI interview`,
      work: { label: 'Work points', value: mocks * perMock, detail: `${plural(mocks, 'mock interview')} × ${perMock}` },
      quality: step,
      extra: { label: 'AI interviews', value: ai * perAiInterview, detail: `${plural(ai, 'AI interview')} × ${perAiInterview}` },
    };
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
