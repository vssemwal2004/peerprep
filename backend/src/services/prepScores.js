// Prep Score: a 0-100 score per feature from the student's own work, and an
// overall Prep Score that is the plain average of the features the university
// licenses. Every score is bounded (it never grows into thousands), rewards
// quality and a capped amount of practice, and uses no other student's data.
//
//   Prep Coding     = 0.85 x progress + 0.15 x accuracy x confidence
//                     progress: Easy/Medium/Hard solves against targets 50/40/20, weighted 1:2:4
//                     accuracy: accepted / submissions; confidence: min(1, submissions / 10)
//   Prep Learning   = topics completed / topics open to the student x 100
//   Prep Interview  = 0.6 x average mock interview score + 0.4 x practice
//                     practice: min(1, (mock + AI interviews) / 5) x 100
//   Prep Assessment = 0.8 x average test score + 0.2 x practice
//                     practice: min(1, tests taken / 5) x 100
//   Overall         = average of the licensed features' scores
//
// The coding part is the same function admin Prep Analysis uses, so both agree.

import { prepScore as codingPrepScore, SOLVE_TARGETS } from '../modules/prepAnalysis/prepScore.js';

export const PREP_SCORE_RULES = Object.freeze({
  interview: { qualityShare: 0.6, practiceShare: 0.4, practiceTarget: 5 },
  assessment: { qualityShare: 0.8, practiceShare: 0.2, practiceTarget: 5 },
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
const blend = ({ qualityShare, practiceShare, practiceTarget }, quality, done) => {
  const practice = Math.min(1, count(done) / practiceTarget) * 100;
  const exact = qualityShare * percent(quality) + practiceShare * practice;
  return { score: round1(exact), exact, practice: round1(practice) };
};

/**
 * Scores for one student.
 * metrics: { easySolved, mediumSolved, hardSolved, submissions, acceptedSubmissions,
 *            completedTopics, totalTopics, mockInterviews, mockAverage, aiInterviews,
 *            testsTaken, testAverage }
 * Returns { total, features: { coding: { score, parts: [{ key, label, value }] }, … } }.
 */
export function prepScores(metrics = {}, features = scoreFeatures(null)) {
  const result = {};
  if (features.coding) {
    const solved = { Easy: count(metrics.easySolved), Medium: count(metrics.mediumSolved), Hard: count(metrics.hardSolved) };
    const submissions = count(metrics.submissions);
    const coding = codingPrepScore({ solved, accepted: Math.min(submissions, count(metrics.acceptedSubmissions)), attempts: submissions });
    result.coding = {
      score: coding.score,
      exact: coding.exact,
      parts: [
        { key: 'easy', label: 'Easy solved', value: `${solved.Easy} of ${SOLVE_TARGETS.Easy}` },
        { key: 'medium', label: 'Medium solved', value: `${solved.Medium} of ${SOLVE_TARGETS.Medium}` },
        { key: 'hard', label: 'Hard solved', value: `${solved.Hard} of ${SOLVE_TARGETS.Hard}` },
        { key: 'accuracy', label: 'Accuracy', value: submissions ? `${coding.accuracy}% of ${submissions} submissions` : 'No submissions yet' },
      ],
    };
  }
  if (features.learning) {
    const total = count(metrics.totalTopics);
    const completed = Math.min(total, count(metrics.completedTopics));
    const exact = total ? (completed / total) * 100 : 0;
    result.learning = {
      score: round1(exact),
      exact,
      parts: [{ key: 'topics', label: 'Topics completed', value: `${completed} of ${total}` }],
    };
  }
  if (features.interview) {
    const mocks = count(metrics.mockInterviews);
    const ai = count(metrics.aiInterviews);
    const quality = mocks ? metrics.mockAverage : 0;
    const { score, exact, practice } = blend(PREP_SCORE_RULES.interview, quality, mocks + ai);
    result.interview = {
      score,
      exact,
      parts: [
        { key: 'quality', label: 'Average mock interview score', value: mocks ? `${round1(percent(quality))}% over ${mocks}` : 'No mock interview yet' },
        { key: 'practice', label: 'Interviews done', value: `${mocks + ai} of ${PREP_SCORE_RULES.interview.practiceTarget} (${practice}%)` },
      ],
    };
  }
  if (features.assessment) {
    const taken = count(metrics.testsTaken);
    const quality = taken && metrics.testAverage !== null && metrics.testAverage !== undefined ? metrics.testAverage : 0;
    const { score, exact, practice } = blend(PREP_SCORE_RULES.assessment, quality, taken);
    result.assessment = {
      score,
      exact,
      parts: [
        { key: 'quality', label: 'Average test score', value: taken ? `${round1(percent(quality))}% over ${taken}` : 'No test yet' },
        { key: 'practice', label: 'Tests taken', value: `${taken} of ${PREP_SCORE_RULES.assessment.practiceTarget} (${practice}%)` },
      ],
    };
  }
  // Averaged from unrounded feature scores and kept to 2 decimals, so small real differences still rank apart.
  const exacts = Object.values(result).map((feature) => feature.exact);
  for (const feature of Object.values(result)) delete feature.exact;
  return { total: exacts.length ? round2(exacts.reduce((sum, value) => sum + value, 0) / exacts.length) : 0, features: result };
}

/** The formula in words, for students and admins (only the features that count). */
export function prepScoreMethodology(features = scoreFeatures(null)) {
  const lines = ['Prep Score is out of 100: each feature is scored from 0 to 100, and your Prep Score is their average.'];
  if (features.coding) lines.push(`Prep Coding: progress towards ${SOLVE_TARGETS.Easy} Easy, ${SOLVE_TARGETS.Medium} Medium and ${SOLVE_TARGETS.Hard} Hard solves (Hard counts 4x, Medium 2x) for 85, plus accuracy of your submissions for 15.`);
  if (features.learning) lines.push('Prep Learning: the share of topics open to you that you have completed.');
  if (features.interview) lines.push(`Prep Interview: your average mock interview score for 60, and interviews done (up to ${PREP_SCORE_RULES.interview.practiceTarget}) for 40.`);
  if (features.assessment) lines.push(`Prep Assessment: your average test score for 80, and tests taken (up to ${PREP_SCORE_RULES.assessment.practiceTarget}) for 20.`);
  lines.push('A better Prep Score means a better rank; equal scores share a rank.');
  return lines.join(' ');
}
