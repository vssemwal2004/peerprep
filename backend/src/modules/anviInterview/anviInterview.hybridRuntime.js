// Pure answer and outcome rules for the hybrid (turn-based) ANVI runtime. The Live conductor is not
// touched: these mirror its rules so a hybrid attempt stores the same answer and item shapes, and
// buildItems() returns exactly what service.itemsFromLive() would build from the same live doc.
import { skipRequestOf } from "./anviInterview.conductor.js";
import { isOffLanguage } from "./anviInterview.language.js";

// Same limits as the conductor and service.itemsFromLive.
export const SKIP_CONTENT_WORDS = 4;
export const SKIP_MAX_WORDS = 12;
const EXPECTED_ANSWER_LIMIT = 4000;
const FOLLOW_UP_TEXT_LIMIT = 600;
const SPOKEN_QUESTION_LIMIT = 1200;
const MAX_TURNS = 40;
// Copied from the conductor (not exported there).
const INJECTION_ATTEMPT = /\b(ignore (all |any |the |your )?(previous |earlier )?(instructions|rules)|reveal (the )?(answer|key points)|(give|award) me (full|perfect|10|ten|100)|change (my )?(score|marks)|system prompt)\b/i;

const words = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;
const count = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/** A candidate turn that only asks to skip (few content words besides the request), as in the conductor. */
export function isSkipTurn(text) {
  const { requested, content } = skipRequestOf(text);
  return requested && content <= SKIP_CONTENT_WORDS;
}

/** The answer text of a question: its candidate turns' texts in order, joined by single spaces. */
export function joinTurnText(turns) {
  return (Array.isArray(turns) ? turns : [])
    .map((turn) => String((typeof turn === "string" ? turn : turn?.text) || "").trim())
    .filter(Boolean)
    .join(" ");
}

const skipAllowedFor = (item, { voiceCommands = true } = {}) => voiceCommands !== false && item?.skippable !== false;

// Transcript bookkeeping summed over every transcription of the question, also empty ones (they cost too).
function transcriptMeta(previous, transcript) {
  if (!transcript || typeof transcript !== "object") return {};
  const tokens = transcript.tokens || transcript.tokenUsage || {};
  const before = previous.transcriptTokenUsage || {};
  return {
    transcriptModel: transcript.model ? String(transcript.model) : previous.transcriptModel || "",
    transcriptAttempts: count(previous.transcriptAttempts) + Math.max(1, count(transcript.attempts) || 1),
    transcriptEscalated: Boolean(previous.transcriptEscalated) || Boolean(transcript.escalated),
    transcriptAudioSeconds: Math.round((count(previous.transcriptAudioSeconds) + count(transcript.audioSeconds)) * 10) / 10,
    transcriptTokenUsage: {
      input: count(before.input) + count(tokens.input),
      output: count(before.output) + count(tokens.output),
    },
    transcriptLowConfidence: Boolean(previous.transcriptLowConfidence) || Boolean(transcript.lowConfidence),
  };
}

/**
 * The live-doc answer record after one candidate turn, in the Live shape (text, source, seconds,
 * followUpsAsked, candidateTurns, skipRequested, substantiveWords, silent, flags, asked) plus `turns`
 * and the transcript* fields. Pure: `previous` is not changed.
 * `turn`: { kind ("answer" | "follow_up" | "clarify" ...), text, seconds, transcript: { model, attempts,
 * escalated, audioSeconds, tokens: { input, output }, lowConfidence } }. An empty transcript adds its cost
 * bookkeeping only, never a candidate turn.
 * `options`: { item, voiceCommands, language, flagOtherLanguage }.
 */
export function answerRecord(previous = {}, turn = {}, { item, voiceCommands = true, language = "English", flagOtherLanguage = true } = {}) {
  const base = previous && typeof previous === "object" ? previous : {};
  const text = String(turn?.text || "").trim();
  const turns = Array.isArray(base.turns) ? base.turns.map((entry) => ({ kind: entry.kind, text: entry.text })) : [];
  const flags = new Set(Array.isArray(base.flags) ? base.flags : []);
  let { skipRequested = false, substantiveWords = 0, candidateTurns = 0 } = base;
  skipRequested = Boolean(skipRequested);
  substantiveWords = count(substantiveWords);
  candidateTurns = count(candidateTurns);
  if (text) {
    if (turns.length < MAX_TURNS) turns.push({ kind: String(turn.kind || "answer"), text });
    else turns[turns.length - 1] = { ...turns[turns.length - 1], text: `${turns[turns.length - 1].text} ${text}` };
    candidateTurns += 1;
    // "Skipped" means the last thing the candidate did on this question was ask to skip it.
    skipRequested = skipAllowedFor(item, { voiceCommands }) && isSkipTurn(text);
    if (!skipRequested) substantiveWords += words(text);
    if (INJECTION_ATTEMPT.test(text)) flags.add("prompt_injection");
    if (flagOtherLanguage && isOffLanguage(text, language)) flags.add("other_language");
  }
  return {
    ...base,
    text: joinTurnText(turns),
    source: "transcribe",
    seconds: Math.round((count(base.seconds) + count(turn?.seconds)) * 10) / 10,
    followUpsAsked: Array.isArray(base.followUpsAsked) ? [...base.followUpsAsked] : [],
    candidateTurns,
    skipRequested,
    substantiveWords,
    silent: text ? false : Boolean(base.silent),
    flags: [...flags],
    asked: true,
    turns,
    ...transcriptMeta(base, turn?.transcript),
  };
}

/**
 * The record with the question marked as presented. `spoken` is the line ANVI actually says for it
 * (hybridConductor.spokenTextOf); it is kept as `spokenQuestion`, as the Live conductor does, so the report
 * shows what the candidate heard.
 */
export const markAsked = (previous = {}, spoken = "") => {
  const line = String(spoken || "").replace(/\s+/g, " ").trim().slice(0, SPOKEN_QUESTION_LIMIT);
  return { ...previous, asked: true, ...(line ? { spokenQuestion: line } : {}) };
};

/** The record after the nudges ran out with no answer (shown as "silent" when no text arrives). */
export const markSilent = (previous = {}) => ({ ...previous, asked: true, silent: true });

/** The record after ANVI asked a follow-up on the question. */
export function noteFollowUp(previous = {}, question) {
  const asked = Array.isArray(previous.followUpsAsked) ? [...previous.followUpsAsked] : [];
  const text = String(question || "").trim();
  if (text) asked.push(text.slice(0, FOLLOW_UP_TEXT_LIMIT));
  return { ...previous, asked: true, followUpsAsked: asked };
}

/**
 * The conductor's skip rule: the candidate's last word on the question was a skip request, with little
 * said before it. A transcribed answer is read too.
 */
export function skippedOn(item, answer = {}, { voiceCommands = true } = {}) {
  if (!skipAllowedFor(item, { voiceCommands })) return false;
  const skipRequested = Boolean(answer?.skipRequested);
  if (answer?.source === "transcribe" && String(answer.text || "").trim()) {
    const transcript = skipRequestOf(answer.text);
    if (transcript.requested && transcript.content <= SKIP_MAX_WORDS) return true;
    return skipRequested && transcript.content <= SKIP_MAX_WORDS;
  }
  return skipRequested && count(answer?.substantiveWords) <= SKIP_MAX_WORDS;
}

const planOf = (live) => (Array.isArray(live?.plan) ? live.plan : []);
const answerOf = (live, item) => live?.answers?.[item.qid] || {};
const heardOn = (answer) => count(answer.candidateTurns) > 0 || Boolean(String(answer.text || "").trim());

/** Whether any question got a real (not skipped) answer. */
export function answeredAny(live, options) {
  return planOf(live).some((item) => {
    const answer = answerOf(live, item);
    return !skippedOn(item, answer, options) && (count(answer.substantiveWords) > 0 || Boolean(String(answer.text || "").trim()));
  });
}

/** The conductor's rule: questions remain until the last one was asked and heard, and something was answered. */
export function questionsRemain(live, options) {
  const plan = planOf(live);
  if (!plan.length) return false;
  if (!live?.phase || live.phase === "intro") return true;
  const last = answerOf(live, plan[plan.length - 1]);
  return !last.asked || !heardOn(last) || !answeredAny(live, options);
}

export function deadlineOutcome(live, options) {
  return { status: answeredAny(live, options) ? "completed" : "abandoned", endReason: "deadline" };
}

/** Outcome of an interview ANVI closed: the deadline outcome after the deadline, else completed or closed early. */
export function closingOutcome(live, { deadlineHit = false, ...options } = {}) {
  if (deadlineHit) return deadlineOutcome(live, options);
  return questionsRemain(live, options) ? { status: "abandoned", endReason: "closed_early" } : { status: "completed", endReason: "completed" };
}

// Hybrid-only item fields, copied only when the answer has them (Live answers never do).
const EXTRA_FIELDS = [
  "transcriptModel", "transcriptAttempts", "transcriptEscalated", "transcriptAudioSeconds",
  "transcriptTokenUsage", "transcriptLowConfidence",
];

/**
 * Durable per-question items from a live doc ({ plan, answers, phase, cursor }). The base fields equal
 * service.itemsFromLive() for the same doc (so a REST end or a sweep stores the same items); hybrid answers
 * add the transcript* fields and `turns`.
 */
export function buildItems(live) {
  const answers = live?.answers || {};
  const cursor = Number(live?.cursor) || 0;
  const started = Boolean(live?.phase) && live.phase !== "intro";
  return planOf(live).map((planned, index) => {
    const answer = answers[planned.qid] || {};
    const text = String(answer.text || "").trim();
    const skipped = Boolean(answer.skipRequested) && (Number(answer.substantiveWords) || 0) <= SKIP_MAX_WORDS;
    const item = {
      asked: Boolean(answer.asked) || Boolean(text) || (started && index <= cursor),
      qid: planned.qid,
      n: planned.n,
      sectionId: planned.sectionId,
      sectionName: planned.sectionName,
      topic: planned.topic,
      competency: planned.competency,
      // The line the candidate heard (Live captures it for topic items only; hybrid for every question).
      questionText: answer.spokenQuestion || planned.text,
      followUpsAsked: Array.isArray(answer.followUpsAsked) ? answer.followUpsAsked : [],
      answerText: text,
      answerSource: text ? (answer.source === "transcribe" ? "transcribe" : "live") : "none",
      answerSeconds: Number(answer.seconds) || 0,
      candidateTurns: Number(answer.candidateTurns) || 0,
      status: skipped ? "skipped" : text ? "answered" : "not_attempted",
      expectedKeyPoints: planned.keyPoints || [],
      expectedAnswer: String(planned.expectedAnswer || "").slice(0, EXPECTED_ANSWER_LIMIT),
      maxMarks: planned.marks ?? 10,
      weight: planned.weight ?? 1,
      flags: [...(Array.isArray(answer.flags) ? answer.flags : []), ...(answer.silent && !text ? ["silent"] : [])],
    };
    for (const field of EXTRA_FIELDS) if (answer[field] !== undefined) item[field] = answer[field];
    if (Array.isArray(answer.turns) && answer.turns.length) {
      item.turns = answer.turns.map((turn) => ({ kind: String(turn?.kind || "answer"), text: String(turn?.text || "") }));
    }
    return item;
  });
}
