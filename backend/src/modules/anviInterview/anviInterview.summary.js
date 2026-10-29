// Deterministic rolling summary of a hybrid interview, given to the decision model as compact context.
// No model call: it is built from the plan item, the accepted answer and the decision's missing key points.
// It lives in the live doc only (live.hybrid.summary) and is never logged; the full transcript stays in
// the answers for the report.

export const SUMMARY_MAX_TOKENS = 400;
const RECENT_CONTEXT_WORDS = 60;
const LABEL_CHARS = 60;
const MAX_LIST = 12;
const STOP_WORDS = new Set([
  "the", "and", "for", "you", "your", "with", "this", "that", "have", "will", "from", "our", "are", "was", "all",
  "but", "not", "how", "what", "when", "why", "which", "into", "its", "it's", "can", "use", "uses", "used", "using",
  "about", "they", "them", "then", "than", "also", "such", "each", "other", "more", "most", "some", "any",
]);

/** A summary with nothing in it. */
export function emptySummary() {
  return { completedQuestions: [], strengths: [], missingConcepts: [], communication: "", difficultyAdjustment: "same", recentContext: "" };
}

/** Rough token count (characters / 4) of the summary as sent to the model. */
export const summaryTokens = (summary) => Math.ceil(JSON.stringify(summary || emptySummary()).length / 4);

const label = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, LABEL_CHARS);
const stem = (word) => (word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word);
const contentWords = (text) => (String(text || "").toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}']{3,}/gu) || [])
  .filter((word) => !STOP_WORDS.has(word))
  .map(stem);

// A key point counts as covered when at least half of its content words occur in the answer.
function covered(keyPoint, answerWords) {
  const wanted = [...new Set(contentWords(keyPoint))];
  if (!wanted.length) return false;
  return wanted.filter((word) => answerWords.has(word)).length * 2 >= wanted.length;
}

const pushUnique = (list, value) => {
  const text = label(value);
  if (!text) return list;
  const rest = list.filter((entry) => entry.toLowerCase() !== text.toLowerCase());
  return [...rest, text].slice(-MAX_LIST);
};

function normalized(summary) {
  const base = emptySummary();
  if (!summary || typeof summary !== "object") return base;
  return {
    completedQuestions: Array.isArray(summary.completedQuestions) ? summary.completedQuestions.map((entry) => ({ ...entry })) : [],
    strengths: Array.isArray(summary.strengths) ? [...summary.strengths] : [],
    missingConcepts: Array.isArray(summary.missingConcepts) ? [...summary.missingConcepts] : [],
    communication: String(summary.communication || ""),
    difficultyAdjustment: ["easier", "same", "harder"].includes(summary.difficultyAdjustment) ? summary.difficultyAdjustment : "same",
    recentContext: String(summary.recentContext || ""),
  };
}

function communicationOf(completed) {
  const answered = completed.filter((entry) => entry.words > 0);
  if (!answered.length) return "";
  const avgWords = Math.round(answered.reduce((sum, entry) => sum + entry.words, 0) / answered.length);
  const timed = answered.filter((entry) => entry.seconds > 0);
  const wpm = timed.length ? Math.round(timed.reduce((sum, entry) => sum + entry.words, 0) / (timed.reduce((sum, entry) => sum + entry.seconds, 0) / 60)) : 0;
  const length = avgWords < 25 ? "brief" : avgWords <= 120 ? "moderate" : "detailed";
  return `${length} answers, about ${avgWords} words each${wpm ? `, about ${wpm} words per minute` : ""}`;
}

function difficultyOf(completed) {
  const recent = completed.filter((entry) => typeof entry.coverage === "number").slice(-3);
  if (!recent.length) return "same";
  const average = recent.reduce((sum, entry) => sum + entry.coverage, 0) / recent.length;
  return average >= 0.7 ? "harder" : average <= 0.3 ? "easier" : "same";
}

/** The summary trimmed to `maxTokens`, dropping the oldest entries first. */
export function capSummary(summary, maxTokens = SUMMARY_MAX_TOKENS) {
  const next = normalized(summary);
  const limit = Math.max(50, Number(maxTokens) || SUMMARY_MAX_TOKENS);
  const lists = ["completedQuestions", "strengths", "missingConcepts"];
  while (summaryTokens(next) > limit) {
    const longest = lists.filter((name) => next[name].length).sort((a, b) => next[b].length - next[a].length)[0];
    if (longest && next[longest].length > 1) next[longest].shift();
    else if (next.recentContext) next.recentContext = next.recentContext.split(" ").slice(0, -10).join(" ");
    else if (longest) next[longest].shift();
    else break;
  }
  return next;
}

/**
 * The summary after one candidate turn. Only an accepted answer changes it: silence, a repeat or clarify
 * request, a retry or a skip returns it unchanged (same object).
 * `event`: { accepted, kind ("answer" | "silence" | "repeat" | "retry" | "skip" ...), item: { qid, n, topic,
 * competency, keyPoints }, text, seconds, missingKeyPoints? }.
 */
export function updateSummary(summary, event = {}, { maxTokens = SUMMARY_MAX_TOKENS } = {}) {
  const text = String(event.text || "").replace(/\s+/g, " ").trim();
  if (event.accepted !== true || (event.kind && event.kind !== "answer") || !text) return summary;
  const next = normalized(summary);
  const item = event.item || {};
  const keyPoints = (Array.isArray(item.keyPoints) ? item.keyPoints : []).map(label).filter(Boolean);
  const answerWords = new Set(contentWords(text));
  const hits = keyPoints.filter((point) => covered(point, answerWords));
  const missing = Array.isArray(event.missingKeyPoints) && event.missingKeyPoints.length
    ? event.missingKeyPoints.map(label).filter(Boolean)
    : keyPoints.filter((point) => !hits.includes(point));
  const words = text.split(" ").length;

  next.completedQuestions = next.completedQuestions.filter((entry) => entry.qid !== item.qid);
  next.completedQuestions.push({
    qid: String(item.qid || ""),
    n: Number(item.n) || next.completedQuestions.length + 1,
    topic: label(item.topic || item.competency),
    words,
    seconds: Math.round(Number(event.seconds) || 0),
    ...(keyPoints.length ? { coverage: Math.round((hits.length / keyPoints.length) * 100) / 100 } : {}),
  });
  for (const point of hits) {
    next.strengths = pushUnique(next.strengths, point);
    next.missingConcepts = next.missingConcepts.filter((entry) => entry.toLowerCase() !== point.toLowerCase());
  }
  const shown = new Set(next.strengths.map((entry) => entry.toLowerCase()));
  for (const point of missing) if (!shown.has(point.toLowerCase())) next.missingConcepts = pushUnique(next.missingConcepts, point);
  next.communication = communicationOf(next.completedQuestions);
  next.difficultyAdjustment = difficultyOf(next.completedQuestions);
  next.recentContext = text.split(" ").slice(-RECENT_CONTEXT_WORDS).join(" ");
  return capSummary(next, maxTokens);
}

export const update = updateSummary;

/** The summary as one compact JSON line for the decision prompt. */
export const summaryForPrompt = (summary) => JSON.stringify(normalized(summary));
