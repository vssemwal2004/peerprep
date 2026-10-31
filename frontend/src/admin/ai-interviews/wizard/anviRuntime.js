// What every ANVI interview says and costs, mirrored from the backend (anviInterview.templates.js and
// anviInterview.config.js SAFE_BUDGET_INR) so the Review page shows what students actually hear.

export const INTRO_LINE =
  "Hello, and welcome. I am ANVI, and I will be your interviewer today. I will ask you a few questions, one at a time. Take your time, and answer in your own words.";
export const SMALL_TALK_LINE = "Before we begin, how are you feeling today, and how has your preparation been going?";
export const ABOUT_YOURSELF_LINE = "Thank you for sharing. To start, could you tell me a little about yourself?";
export const READY_LINE = "Thank you for the introduction, that was nice to hear. Shall we start the interview?";
export const BEGIN_LINE = "Alright, let's begin with the first question.";
export const CLOSING_LINE =
  "That brings us to the end of the interview. Thank you for your time. Your detailed report will be ready shortly. All the best.";

// The per-student AI budget (INR, Gemini only) by interview length: the bucket at or below the length.
export const BUDGET_CAP_INR = Object.freeze({ 10: 10, 15: 12, 30: 18, 45: 22, 60: 25 });
const BUCKETS = Object.keys(BUDGET_CAP_INR).map(Number);
export function budgetCapInr(minutes) {
  const value = Number(minutes);
  const bucket = BUCKETS.reduce((picked, b) => (Number.isFinite(value) && value >= b ? b : picked), BUCKETS[0]);
  return BUDGET_CAP_INR[bucket];
}
