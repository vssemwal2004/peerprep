// One glossary for Prep Analysis: the words admins meet on the page, each with one plain
// definition. Text anywhere on the page (chart insights, headline cards, guide steps) can be
// split into parts so these words get a dotted underline and a hover card (GlossaryText.jsx).

import { makeGlossary } from "../../../guide/engine/glossaryEngine.js";

export const GLOSSARY = Object.freeze([
  { key: "prepScore", term: "Prep Score", aliases: ["Prep Scores"], text: "A student's overall score: the weighted average of their module scores (Prep Coding, Assessment, Interview, Learning) from verified work, harder work counting more. Coding solves count up to the daily topic limit." },
  { key: "solved", term: "solved", aliases: ["solve", "solves"], text: "A problem counts as solved the first time the student's submission is accepted. Solving it again does not count twice." },
  { key: "accepted", term: "accepted", aliases: ["acceptance rate"], text: "A submission is accepted when it passes every test case. The acceptance rate is accepted submissions out of all submissions." },
  { key: "submission", term: "submission", aliases: ["submissions"], text: "Each time a student submits code for a problem. Runs (testing without submitting) are not counted." },
  { key: "active", term: "active", aliases: ["Active Users", "Active Learners", "Active Interviewees"], text: "A student is active when they did that activity in the last 14 days." },
  { key: "inactive", term: "Inactive Students", aliases: ["stopped practising", "Stopped practising", "Not Learning"], text: "Students who started before but have done nothing in the last 14 days." },
  { key: "never", term: "never practised", aliases: ["Never practised", "Never Opened a Sheet", "Never Interviewed", "Never Took a Test"], text: "Students who have not started this feature at all yet." },
  { key: "flagged", term: "Flagged Students", aliases: ["flagged", "Flagged solves"], text: "Students with at least one solve worth a look: solved unusually fast or mostly pasted. A flag is a prompt to review, not proof of copying." },
  { key: "streak", term: "streak", aliases: ["streaks"], text: "How many days in a row the student practised (submitted code). A day without practice resets it." },
  { key: "median", term: "Middle student", aliases: ["middle student", "median"], text: "If every student were lined up from lowest to highest, this is where the one in the middle sits. Half the students are below, half above." },
  { key: "band", term: "band", aliases: ["bands"], text: "A range of values, like 20–30%. Each bar of a spread chart counts the students whose value falls in that range." },
  { key: "cohort", term: "students in view", aliases: ["in view"], text: "The students that match the page's current filters and period. Every number on the page is about them." },
  { key: "sheet", term: "Quick Prep sheet", aliases: ["sheet", "sheets"], text: "A curated list of practice questions (like 'Placement essentials'). A student starts a sheet by opening it and finishes it by solving every question." },
  { key: "topicLimit", term: "daily topic limit", aliases: ["topic limit"], text: "Only the first 3 solves per topic per day count towards the Prep Score, so a student cannot farm one topic." },
  { key: "mock", term: "mock interview", aliases: ["mock interviews", "Mock Score", "mock score"], text: "A practice interview with a peer or mentor, scored out of 100 from the interviewer's ratings." },
  { key: "passMark", term: "pass", aliases: ["Passed", "passed", "pass rate"], text: "A test counts as passed at 40% or more." },
  { key: "gap", term: "Spot the gap", aliases: ["gap"], text: "The students who reached one step of a journey but not the next: the exact list to follow up with." },
  { key: "drill", term: "student list", aliases: ["students behind"], text: "Click any bar, slice, bubble or row to open the exact students behind it, with download and email." },
]);

const ENGINE = makeGlossary(GLOSSARY);

/**
 * Splits text into plain strings and glossary words: [{ text }, { text, entry }]. Each glossary
 * entry is marked once per text (its first use), so a sentence is not underlined all over.
 */
export const glossaryParts = (text, options) => ENGINE.parts(text, options);
