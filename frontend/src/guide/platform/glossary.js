// Words people meet across PeerPrep, each with one plain definition. Tour text gets a dotted
// underline on them (first use per line) with the definition on hover. A guide module can add
// its own words with `terms`. Keep definitions short, true for every role, and free of numbers
// that an admin can change in settings.

import { makeGlossary } from "../engine/glossaryEngine.js";

export const PLATFORM_GLOSSARY = Object.freeze([
  { key: "prepScore", term: "Prep Score", aliases: ["Prep Scores"], text: "A student's effort score. New solves add points (Hard most), only a few solves per topic count each day, and re-solving adds nothing. Daily challenges, sheets and badges add a little more." },
  { key: "prepReadiness", term: "Prep Readiness", aliases: ["readiness", "Service-Based readiness", "Product-Based readiness"], text: "Two scores from 0 to 100: how ready a student's practice is for service-based and for product-based companies. New solves across many topics raise it; each topic stops adding once it reaches its target." },
  { key: "prepCoins", term: "Prep Coins", aliases: ["Prep Coin", "coins"], text: "PeerPrep's reward points. Students earn them from daily login, the daily challenge, finished sheets and badges (solving a question gives Prep Score, not coins); admins can also issue them. Every change is in the wallet history." },
  { key: "prepCoding", term: "Prep Coding", aliases: [], text: "The coding practice area: problems by topic and difficulty, solved in the built-in code editor." },
  { key: "quickPrep", term: "Quick Prep", aliases: [], text: "Short, curated practice sheets (sets of questions on one goal or topic) that students work through at their own pace." },
  { key: "sheet", term: "sheet", aliases: ["sheets"], text: "A Quick Prep sheet: a curated list of questions. Opening it starts it; solving every question finishes it." },
  { key: "prepMates", term: "Prep Mates", aliases: ["Prep Mate"], text: "Classmates you connected with (request and accept). You can see each other's progress and compare." },
  { key: "streak", term: "streak", aliases: ["streaks"], text: "How many days in a row you practised. A day with no practice starts it again." },
  { key: "badge", term: "badge", aliases: ["badges"], text: "A monthly achievement for practice milestones. Higher levels are harder to reach and give more Prep Coins." },
  { key: "accepted", term: "accepted", aliases: ["Accepted"], text: "A submission is accepted when it passes every test case of the problem." },
  { key: "submission", term: "submission", aliases: ["submissions", "submit"], text: "Sending your code to be checked against all of the problem's test cases. Running code only checks your sample or custom input." },
  { key: "testCase", term: "test case", aliases: ["test cases", "testcases"], text: "One input with its expected output. Your code must print the expected output for each one." },
  { key: "customCase", term: "custom test case", aliases: ["custom input", "custom test cases"], text: "Your own input to try on Run. The expected output comes from the problem's reference solution." },
  { key: "assessment", term: "assessment", aliases: ["assessments", "Prep Assessment"], text: "A timed test set by the university: MCQs and/or coding questions, with a start and end window." },
  { key: "proctoring", term: "proctoring", aliases: ["proctored"], text: "Exam monitoring during a test (for example tab switches and camera checks). Rules are set per assessment." },
  { key: "aiInterview", term: "AI interview", aliases: ["AI interviews", "AI Interviews"], text: "A practice interview with an AI interviewer that asks questions by voice and gives a written report afterwards." },
  { key: "peerInterview", term: "mock interview", aliases: ["mock interviews", "one-to-one interview", "One-to-One Interviews", "peer interview"], text: "A practice interview between two students (or with a mentor), followed by feedback from both sides." },
  { key: "ranking", term: "ranking", aliases: ["leaderboard", "rank"], text: "Where a student stands by Prep Score among students of the same university (and, where shown, the whole platform)." },
  { key: "coordinator", term: "coordinator", aliases: ["coordinators", "Coordinator"], text: "A faculty or staff member who helps run PeerPrep for some students. An admin decides which features each coordinator can use." },
  { key: "batch", term: "batch", aliases: ["batches", "cohort"], text: "A group of students who study together, usually by passing-out year, course and section." },
  { key: "semester", term: "semester", aliases: ["semesters"], text: "The student's current term. Learning content and promotions follow it." },
  { key: "library", term: "question library", aliases: ["Library", "library"], text: "The bank of MCQ and coding questions that assessments and Quick Prep sheets are built from." },
  { key: "masterData", term: "master data", aliases: ["Master Data"], text: "The lists the rest of the platform picks from: courses, branches, sections, years, companies and similar." },
  { key: "bulkUpload", term: "bulk upload", aliases: ["Bulk upload", "bulk uploads"], text: "Adding or updating many records at once from a spreadsheet (CSV or Excel) instead of one by one." },
  { key: "announcement", term: "announcement", aliases: ["announcements"], text: "A message from the university shown to students, optionally as a popup after they sign in." },
  { key: "emailQueue", term: "email queue", aliases: ["Email queue"], text: "Emails waiting to be sent or already sent by the platform, with their status and any errors." },
]);

const SHARED = makeGlossary(PLATFORM_GLOSSARY);
const cache = new WeakMap();

/** The glossary for one guide module: the platform's words plus the module's own `terms`. */
export function glossaryFor(module) {
  if (!module?.terms?.length) return SHARED;
  if (!cache.has(module)) {
    const own = module.terms.map((entry, index) => ({ key: `own:${index}`, aliases: [], ...entry }));
    const ownWords = new Set(own.flatMap((entry) => [entry.term, ...entry.aliases]));
    cache.set(module, makeGlossary([...own, ...PLATFORM_GLOSSARY.filter((entry) => !ownWords.has(entry.term))]));
  }
  return cache.get(module);
}
