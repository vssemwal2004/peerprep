import { EventEmitter } from "node:events";
import * as defaultPrompts from "./anviInterview.prompts.js";
import { isOffLanguage } from "./anviInterview.language.js";

// Drives one ANVI interview over a Gemini Live session. The model leads the conversation from the
// plan in its system prompt. ANVI never speaks plan numbers, so this conductor tracks the cursor
// server-led (it tells her which internal item to ask next and takes her reply as that item), from a
// fixed question's wording, and from "Question <n>:" markers should one still be spoken. It enforces
// follow-up budgets, silence nudges and the deadline. Audio lives in memory only.
const PCM_BYTES_PER_SECOND = 16000 * 2;
const OUT_BYTES_PER_MS = 24000 * 2 / 1000;
// About 8 minutes of answer audio per question; anything longer keeps its Live transcript and is flagged.
const MAX_QUESTION_BYTES = 8 * 60 * PCM_BYTES_PER_SECOND;
// Process-wide ceiling for answer audio held in memory (open buffers plus audio awaiting transcription).
const PROCESS_AUDIO_CAP = Math.max(16, Number(process.env.ANVI_PROCESS_AUDIO_CAP_MB) || 512) * 1024 * 1024;
const audioMemory = { bytes: 0 };
/** Bytes of answer audio currently held by every conductor in this process. */
export const anviAudioMemoryBytes = () => audioMemory.bytes;
const DEFAULT_NUDGE_SECONDS = 45;
const MAX_NUDGES = 2;
const DEADLINE_GRACE_MS = 20_000;
const TRANSCRIBE_WAIT_MS = 20_000;
// No client frame at all for this long means the client is gone (left the room, audio suspended).
const INACTIVE_MS = 10_000;
// Live can miss the end of the candidate's speech and never take its turn (160 s in a real-Gemini run on
// 2026-10-22). This long after their last transcribed words (plus the silence setting), ANVI is asked once to reply.
const REPLY_WAIT_MS = 10_000;
const WAKE_RETRY_MS = 5_000;
const FINALIZE_RETRY_MS = [5_000, 15_000, 45_000];
// Audio held while a refreshed Live session opens (goAway); about 6 s of 16 kHz PCM.
const RELAY_MAX_BYTES = 6 * PCM_BYTES_PER_SECOND;
// Candidate turns in the intro before the model is told to ask Question 1 if it has not done so itself:
// the "ready" reply, one per warm-up question, and one spare.
const introTurnLimit = (warmup) => 1 + (Number(warmup?.questions) || 0) + 1;
// Client silence frames are not forwarded while ANVI speaks and for this long after; the Live VAD only needs
// continuous audio while the candidate may be speaking.
const SPEAKING_SILENCE_TAIL_MS = 300;
// The warm-up conversation kept for the admin report.
const WARMUP_TRANSCRIPT_LIMIT = 6000;
const ZERO = Buffer.alloc(16 * 1024);
// A candidate asking to finish the interview ("can we end the interview", "I want to stop", "bas karte hain").
const END_REQUEST = /\b(?:(?:end|finish|stop|close|wrap up|quit)\s+(?:the\s+|this\s+)?(?:interview|session|call|here|now|it)|i (?:want|would like|wanna|need) to (?:end|stop|finish|quit|leave)|(?:let's|lets|let us|can we|could we|please) (?:end|stop|finish|wrap up)|khatam kar|band kar|bas kar)/i;
// A reply that only checks whether the candidate is ready is not a warm-up question.
const READY_QUESTION = /\b(?:shall we (?:begin|start|get started)|are you ready|ready to (?:begin|start)|(?:can|should) we (?:begin|start))\b/i;
// "Tell me about yourself" carries no question mark but is a warm-up question.
const INTRODUCE_ASK = /\b(?:tell me (?:a (?:little|bit) )?about yourself|introduce yourself|apne baare mein)\b/i;
const SKIP_REQUEST = /\b(skip|next question|next one|pass(?: on)? this|move on|agla (?:question|sawal|sawaal))\b/i;
// Hedges and request wording that carry no answer content ("Honestly, I am not sure. Can we skip this question?").
const SKIP_FILLER = new RegExp(String.raw`\b(?:${[
  "i(?:'m| am) (?:really |quite )?not (?:really |very )?sure(?: about)?(?: (?:this|that|it)(?: one| question)?)?",
  "i (?:do not|don't|dont) (?:really )?know(?: (?:this|that|it)(?: one)?| the answer)?",
  "i (?:have|got) no idea", "no idea", "not sure",
  "i (?:can't|cannot|can not|won't be able to) (?:answer|do|attempt) (?:this|that|it)(?: one| question)?",
  "i (?:don't|do not) remember(?: (?:this|that|it))?",
  "(?:can|could|may|shall) (?:we|i|you)", "(?:let's|lets|let us)", "(?:i would|i'd|i want to|i will|i'll) (?:like to )?",
  "skip", "next question", "next one", "pass(?: on)?", "move on(?: to)?", "go (?:on )?to", "agla", "kar sakte hain", "kar do",
  "(?:this|that|the|it)(?: one| question)?", "about", "please", "to", "the next", "and", "so", "but", "then", "with",
  "honestly", "frankly", "actually", "basically", "really", "sorry", "okay", "ok", "well", "yeah", "yes", "no",
  "um+", "uh+", "hmm+", "erm", "ma'?am", "sir", "maybe", "for now", "if possible",
].join("|")})\b`, "gi");
// At most this many content words alongside a skip request still make the turn a skip, not an answer.
const SKIP_CONTENT_WORDS = 4;
// More than this many words before a skip request counts as an attempted answer.
const SKIP_MAX_WORDS = 12;
const INJECTION_ATTEMPT = /\b(ignore (all |any |the |your )?(previous |earlier )?(instructions|rules)|reveal (the )?(answer|key points)|(give|award) me (full|perfect|10|ten|100)|change (my )?(score|marks)|system prompt)\b/i;
const NATURAL_PHRASING = /^ask one question about:/i;
// An intro reply that asks something real (not "Shall we begin?") is taken as Question 1 when its marker was lost.
const INTRO_READY_CHECK = /\b(shall we|ready|begin|start|get started)\b/i;
const SAFE_QID = /^[A-Za-z0-9_-]+$/;
const LANGUAGES = new Set(["English", "Hindi", "Hinglish"]);
// Indian accent for the Live voice. Hinglish stays unset: in the voice comparison an explicit locale
// pulled Hinglish replies towards English.
const LIVE_LANGUAGE_CODES = { English: "en-IN", Hindi: "hi-IN" };

const words = (text) => String(text || "").trim().split(/\s+/).filter(Boolean).length;

/**
 * Reads a candidate utterance (or a whole answer transcript) for a skip request.
 * `requested`: the final sentence asks to skip; `content`: words that are neither hedges nor request wording.
 */
export function skipRequestOf(text) {
  const clean = String(text || "").replace(/[’`]/g, "'").trim();
  if (!clean || !SKIP_REQUEST.test(clean)) return { requested: false, content: words(clean) };
  const sentences = clean.split(/(?<=[.!?।])\s+/).filter((sentence) => /[\p{L}\p{N}]/u.test(sentence));
  const tail = sentences.slice(-2).join(" ");
  const content = words(clean.replace(SKIP_FILLER, " ").replace(/[^\p{L}\p{N}'\s-]/gu, " "));
  return { requested: SKIP_REQUEST.test(sentences.at(-1) || "") || (words(sentences.at(-1)) <= 3 && SKIP_REQUEST.test(tail)), content };
}
// Sign-offs ANVI uses when she closes; KEEP_GOING marks a turn that only encourages the candidate.
const CLOSING_CUE = /\b(all the best|best of luck|good luck|thank you (?:so much )?for your time|thanks for your time|thank you for (?:taking|attending|joining)|(?:your|the) (?:detailed )?(?:report|feedback) will be|that(?:'s| is) all (?:for today|from my side|the questions)|(?:end|close) of (?:the|our|this) interview|(?:we are|we're) (?:all )?done|that wraps up|goodbye|bye)\b/i;
const KEEP_GOING = /\b(continue|carry on|go ahead|take your time|go on|whenever you(?:'re| are) ready)\b/i;
// ANVI announced the next question ("Let us move on to the next one.") but did not ask it in that turn.
const MOVE_ON_CUE = /\b(move on|moving on|(?:on ?to|to) the next (?:one|question)|next question|aage badhte|agl[ae] (?:question|sawal|sawaal|prashn))\b/i;
const STOP_WORDS = new Set(["the", "and", "for", "you", "your", "with", "this", "that", "have", "will", "from", "our", "are", "was", "all", "but", "not"]);
const contentWords = (text) => String(text || "").toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}']{3,}/gu)?.filter((word) => !STOP_WORDS.has(word)) || [];
const isSkipTurn = (text) => {
  const { requested, content } = skipRequestOf(text);
  return requested && content <= SKIP_CONTENT_WORDS;
};
const sentencesOf = (text) => String(text || "").trim().split(/(?<=[.!?।])\s+/).filter(Boolean);
// The question part of a turn that asked a plan item without a marker: leading short acknowledgements and
// transitions ("Thank you.", "Let's move on to the next one.") are dropped.
function askedPart(text) {
  const sentences = sentencesOf(text);
  while (sentences.length > 1 && !sentences[0].includes("?") && (words(sentences[0]) <= 4 || MOVE_ON_CUE.test(sentences[0]))) sentences.shift();
  return sentences.join(" ").slice(0, 600);
}
const joinText = (...parts) => parts.map((part) => String(part || "").trim()).filter(Boolean).join(" ");
const isSilence = (buf) => buf.length <= ZERO.length && buf.equals(ZERO.subarray(0, buf.length));
const appendChunk = (text, chunk) => `${text}${text && !/\s$/.test(text) && !/^\s/.test(chunk) ? " " : ""}${chunk}`;

export function createConductor({
  attempt, live, gemini, config, persist, clock = Date, log = console,
  studentFirstName = "", timers = { setTimeout, clearTimeout }, prompts = defaultPrompts,
}) {
  const events = new EventEmitter();
  const plan = Array.isArray(live?.plan) ? live.plan : [];
  const persona = live?.persona || {};
  const rules = live?.rules || {};
  const mode = attempt?.mode || "practice";
  // The one interview language: the attempt's (validated at start), else the plan's. The interviewer profile's
  // language (persona.language) never overrides it.
  const language = [attempt?.language, rules.language].find((value) => LANGUAGES.has(value)) || "English";
  const languagePolicy = prompts.languagePolicyOf ? prompts.languagePolicyOf(rules.languagePolicy) : { strict: true, onOtherLanguage: "remind_and_flag" };
  // Strict interviews flag answers given in another language for the report (never for the score).
  const flagOtherLanguage = languagePolicy.strict && languagePolicy.onOtherLanguage === "remind_and_flag";
  const deadlineAt = attempt?.hardDeadline ? new Date(attempt.hardDeadline).getTime() : clock.now() + 45 * 60_000;
  // The interview's turn settings (stored by the service as live.rules.turns), else the server config.
  const turns = rules.turns || live?.turns || {};
  const setting = (value, min, max, fallback) => {
    const number = Number(value);
    return value === null || value === undefined || value === "" || !Number.isFinite(number) ? fallback : Math.min(max, Math.max(min, number));
  };
  const nudgeMs = setting(turns.nudgeSeconds, 15, 120, Number(config?.nudgeSeconds) || DEFAULT_NUDGE_SECONDS) * 1000;
  const maxNudges = Math.round(setting(turns.maxNudges, 0, 3, MAX_NUDGES));
  const silenceMs = Math.round(setting(turns.silenceSeconds, 1.5, 4, (Number(config?.silenceMs) || 2000) / 1000) * 1000);
  const silenceSeconds = Math.round(silenceMs / 100) / 10;
  const voiceCommands = turns.voiceCommands !== false;
  const acknowledgements = persona.acknowledgements !== false;
  // Warm-up and conduct rules stored with the plan; a live doc created before warm-ups existed has none.
  const warmupSettings = rules.warmup || null;
  const warmup = prompts.warmupShape ? prompts.warmupShape(warmupSettings) : { questions: 0, any: false };
  const conduct = prompts.conductRules ? prompts.conductRules(rules.conduct) : { endByVoice: false, finishAllQuestions: true };
  // The admin's voice and accent locale when set (validated on save), else the server voice and the
  // interview language's locale.
  const liveVoice = /^[A-Za-z]{2,30}$/.test(String(persona.voice || "")) ? persona.voice : config?.liveVoice;
  const liveLanguageCode = /^(en|hi)-IN$/.test(String(persona.voiceLanguageCode || "")) ? persona.voiceLanguageCode : LIVE_LANGUAGE_CODES[language] || null;
  const systemText = prompts.buildSystemPrompt({
    plan, persona, rules, studentFirstName, mode, silenceSeconds, voiceCommands, warmup: warmupSettings, conduct: rules.conduct,
    language, languagePolicy,
    minutes: Math.max(1, Math.round((deadlineAt - clock.now()) / 60_000)),
    interview: { role: attempt?.role, companyName: attempt?.companyName },
  });
  // Skip requests count only when spoken commands are on and the question allows skipping.
  const skipAllowed = (item) => voiceCommands && item?.skippable !== false;
  const closingWords = [...new Set(contentWords(String(persona.closing || "").replace(/\{[^}]*\}/g, " ")))];

  // Durable progress (mirrors the AnviLiveSession fields so a resume continues where it stopped).
  let phase = ["intro", "asking", "closing"].includes(live?.phase) ? live.phase : "intro";
  let cursor = Math.min(Math.max(0, Number(live?.cursor) || 0), Math.max(0, plan.length - 1));
  let followUpsUsed = Number(live?.followUpsUsed) || 0;
  let candidateTurnsOnQuestion = Number(live?.candidateTurnsOnQuestion) || 0;
  let nudgesOnQuestion = Number(live?.nudgesOnQuestion) || 0;
  const answers = { ...(live?.answers || {}) };
  const meta = new Map(plan.map((item, index) => {
    const saved = answers[item.qid] || {};
    const reached = phase !== "intro" && index <= cursor;
    return [item.qid, {
      candidateTurns: Number(saved.candidateTurns) || 0,
      followUpsAsked: Array.isArray(saved.followUpsAsked) ? [...saved.followUpsAsked] : [],
      spokenQuestion: saved.spokenQuestion || "",
      skipRequested: Boolean(saved.skipRequested),
      substantiveWords: Number(saved.substantiveWords) || 0,
      silent: Boolean(saved.silent),
      flags: new Set(Array.isArray(saved.flags) ? saved.flags : []),
      asked: Boolean(saved.asked) || reached,
    }];
  }));

  // Runtime state.
  let session = null;
  let generation = 0;
  let disposed = false;
  let finalizing = null;
  let finalizeRetries = 0;
  let speaking = false;
  let followUp = false;
  let deadlineHit = false;
  let introTurns = 0;
  let introMoveOnSent = false;
  // Warm-up questions ANVI has asked in the intro, and the warm-up conversation so far.
  let warmupAsked = 0;
  let firstQuestionCorrected = false;
  let warmupTranscript = String(live?.warmupTranscript || "");
  // The candidate's last finished utterance (an end request is read from it when transcription lags).
  let lastHeard = "";
  // Where ANVI was told to return to the interview language ("intro" or a qid): at most once each.
  const languageCorrected = new Set();
  // Silence frames are dropped until this time (ANVI's speech plus a short tail).
  let quietUntil = 0;
  let silenceDroppedBytes = 0;
  let turnSeq = 0;
  let closeAfterTurn = Infinity;
  let turn = null;
  // The candidate's current utterance and the question index that was current when it began (-1: none).
  let candidateText = "";
  let candidateSpoke = false;
  let candidateFor = -1;
  // Set after a moveOn instruction: the next reply is taken as that question even without a marker.
  let expected = null;
  // The first reply after a resume instruction re-asks the question; it is not a follow-up.
  let resumeTurnPending = false;
  let buffer = null;
  let lastFrameAt = clock.now();
  let paused = false;
  // Proctoring hold (the candidate left fullscreen or the tab): no mic audio, nudges or reply watchdog, and
  // ANVI waits silently. The deadline keeps running.
  let onHold = false;
  // During a hold: the server-led step a finished turn would have sent (ask the next question, ...), run when
  // the hold ends; and whether the Live session was opened fresh meanwhile, so it still needs its opening.
  let heldStep = null;
  let openingPending = false;
  let waking = false;
  let wakeAfter = 0;
  let lostEmitted = false;
  // Session resumption (goAway): the latest handle, and audio held while a refreshed session opens.
  let resumeHandle = null;
  let goAwayPending = false;
  let refreshing = false;
  let relay = null;
  const pending = new Set();
  const inflight = new Set();
  const timer = { nudge: null, deadline: null, grace: null, retry: null, reply: null };

  const emit = (event, payload) => {
    if (event === "error" && !events.listenerCount("error")) return;
    events.emit(event, payload);
  };
  const warn = (message, error) => log?.warn?.(`[ANVI] ${message}`, error?.message || error || "");
  const current = () => plan[cursor] || null;
  const metaOf = (item) => (item ? meta.get(item.qid) : null);
  const clearTimer = (name) => { if (timer[name]) timers.clearTimeout(timer[name]); timer[name] = null; };
  const schedule = (name, ms, fn) => { clearTimer(name); timer[name] = timers.setTimeout(fn, Math.max(0, ms)); };

  function questionText(item) {
    if (!item) return "";
    const spoken = metaOf(item)?.spokenQuestion;
    return NATURAL_PHRASING.test(item.text) ? spoken || "" : item.text;
  }

  function state() {
    const item = phase === "intro" ? null : current();
    return {
      phase,
      questionNumber: item ? item.n ?? cursor + 1 : 0,
      totalQuestions: plan.length,
      questionText: phase === "asking" ? questionText(item) : "",
      followUp: phase === "asking" && followUp,
      deadlineAt: new Date(deadlineAt).toISOString(),
      speaking,
    };
  }
  const emitState = () => emit("state", state());

  // A save that matches no live doc means another tab or instance holds the lease, or the attempt ended.
  function leaseLost() {
    if (lostEmitted || disposed) return;
    lostEmitted = true;
    emit("lost");
  }

  function save(patch) {
    if (disposed && !finalizing) return;
    const failed = (error) => warn("Could not save live progress", error);
    let task;
    try {
      task = Promise.resolve(persist.saveLive(patch)).then((result) => {
        if (result && result.matchedCount === 0 && !finalizing) leaseLost();
      }, failed);
    } catch (error) {
      failed(error);
      return;
    }
    inflight.add(task);
    task.finally(() => inflight.delete(task));
  }
  const saveProgress = () => save({ phase, cursor, followUpsUsed, candidateTurnsOnQuestion, nudgesOnQuestion });

  function answerRecord(item, extra = {}) {
    const info = metaOf(item);
    return {
      ...(answers[item.qid] || {}),
      candidateTurns: info.candidateTurns,
      followUpsAsked: info.followUpsAsked,
      spokenQuestion: info.spokenQuestion,
      skipRequested: info.skipRequested,
      substantiveWords: info.substantiveWords,
      silent: info.silent,
      flags: [...info.flags],
      asked: info.asked,
      ...extra,
    };
  }
  function saveAnswer(item, extra) {
    answers[item.qid] = answerRecord(item, extra);
    // Plan ids are [A-Za-z0-9_-]; anything else replaces the whole map instead of building a dotted path.
    save(SAFE_QID.test(item.qid) ? { [`answers.${item.qid}`]: answers[item.qid] } : { answers: { ...answers } });
  }

  // A transcript that finished after this conductor was disposed (refresh, takeover, leaving the room):
  // the socket layer hands it to the new holder or writes it if nobody changed that answer meanwhile.
  function lateAnswer(item, extra) {
    const expectedText = String(answers[item.qid]?.text || "");
    const record = answerRecord(item, extra);
    answers[item.qid] = record;
    if (typeof persist.saveLateAnswer !== "function") return;
    Promise.resolve()
      .then(() => persist.saveLateAnswer(item.qid, record, expectedText))
      .catch((error) => warn("Could not save a late transcript", error));
  }

  // --- Per-question capture -------------------------------------------------------------------

  function openBuffer(item) {
    const carried = answers[item.qid]?.text || "";
    buffer = { item, chunks: [], bytes: 0, truncated: false, liveText: "", carried, carriedSeconds: Number(answers[item.qid]?.seconds) || 0 };
  }

  function dropBuffer() {
    if (!buffer) return;
    audioMemory.bytes -= buffer.bytes;
    buffer.chunks = [];
    buffer = null;
  }

  // Hands the question's PCM to transcription and drops every reference to it here.
  function closeBuffer() {
    const closing = buffer;
    buffer = null;
    if (!closing) return;
    const { item } = closing;
    const info = metaOf(item);
    if (closing.truncated) info.flags.add("audio_truncated");
    const liveText = joinText(closing.carried, closing.liveText);
    const seconds = Math.round(closing.carriedSeconds + closing.bytes / PCM_BYTES_PER_SECOND);
    saveAnswer(item, { text: liveText, source: liveText ? "live" : "none", seconds });
    if (!closing.bytes) return;
    // The Live input transcript is already suitable for scoring in the common case. A second paid audio
    // transcription is reserved for interviews that explicitly enable it, and only repairs weak/missing text.
    if (!config?.accurateTranscription || words(liveText) >= 6) {
      closing.chunks = [];
      audioMemory.bytes -= closing.bytes;
      return;
    }
    const held = closing.bytes;
    let pcm = Buffer.concat(closing.chunks, closing.bytes);
    closing.chunks = [];
    const task = Promise.resolve()
      .then(() => gemini.transcribePcm({ pcm, language }))
      .then((text) => {
        const clean = String(text || "").trim();
        if (!clean) return;
        // The accurate transcript can show another language the Live transcription missed.
        if (flagOtherLanguage && isOffLanguage(clean, language)) info.flags.add("other_language");
        const extra = { text: joinText(closing.carried, clean), source: "transcribe", seconds };
        if (disposed && !finalizing) lateAnswer(item, extra);
        else saveAnswer(item, extra);
      })
      .catch((error) => warn("Transcription failed; keeping the live transcript", error))
      .finally(() => { pcm = null; audioMemory.bytes -= held; pending.delete(task); });
    pending.add(task);
  }

  // --- Cursor ---------------------------------------------------------------------------------

  function noteCandidateTurn(item, text) {
    const info = metaOf(item);
    if (!info) return;
    info.candidateTurns += 1;
    // "Skipped" means the last thing the candidate did on this question was ask to skip it.
    info.skipRequested = skipAllowed(item) && isSkipTurn(text);
    if (!info.skipRequested) info.substantiveWords += words(text);
    if (INJECTION_ATTEMPT.test(text)) info.flags.add("prompt_injection");
    if (flagOtherLanguage && isOffLanguage(text, language)) info.flags.add("other_language");
  }

  // ANVI's turn was clearly not in a strict interview's language: she is told once per question (and once
  // in the intro) to continue in it. Sent as context only, so she does not speak over the candidate.
  function guardLanguage(said) {
    if (!languagePolicy.strict || !said || (phase !== "intro" && phase !== "asking")) return;
    const key = phase === "intro" ? "intro" : current()?.qid;
    if (!key || languageCorrected.has(key) || !isOffLanguage(said, language)) return;
    languageCorrected.add(key);
    send(prompts.languageInstruction(language), { turnComplete: false });
  }

  function advanceTo(index) {
    expected = null;
    if (phase === "asking") closeBuffer();
    if (index >= plan.length) return beginClosing();
    phase = "asking";
    cursor = index;
    followUp = false;
    candidateTurnsOnQuestion = 0;
    nudgesOnQuestion = 0;
    const item = current();
    metaOf(item).asked = true;
    openBuffer(item);
    saveProgress();
    emitState();
  }

  function beginClosing() {
    expected = null;
    if (phase === "asking") closeBuffer();
    phase = "closing";
    followUp = false;
    closeAfterTurn = turn ? turnSeq + 1 : turnSeq;
    saveProgress();
    emitState();
  }

  function send(text, options) {
    try { session?.sendText(text, options); }
    catch (error) { warn("Could not send an instruction to Live", error); }
  }

  // Tells ANVI to ask plan[index]; the reply counts as that question even if its marker is not transcribed.
  function askNext(index) {
    const n = plan[index]?.n ?? index + 1;
    send(acknowledgements ? prompts.moveOnInstruction(n) : prompts.moveOnInstruction(n, { acknowledgements: false }));
    expected = { index, afterSeq: turnSeq };
  }

  // A server-led step after a finished turn; while on hold it waits for releaseHold (the student is away).
  function lead(step) {
    if (onHold) heldStep = step;
    else step();
  }

  function moveOn() {
    if (cursor + 1 >= plan.length) {
      beginClosing();
      send(prompts.closeInstruction());
    } else {
      askNext(cursor + 1);
    }
  }

  function markerTarget(text) {
    let target = -1;
    for (const { n } of prompts.findQuestionMarkers(text)) {
      const index = plan.findIndex((item) => Number(item.n) === n);
      const resolved = index >= 0 ? index : n > plan.length ? plan.length : -1;
      if (resolved > target) target = resolved;
    }
    if (target < 0) return -1;
    // After a warm-up the interview always opens with Question 1; a later marker is corrected at turn end.
    if (phase === "intro") return warmup.any && target > 0 && !firstQuestionCorrected ? -1 : target;
    return phase === "asking" && target > cursor ? target : -1;
  }

  // ANVI re-said the current question's own marker ("Now, Question 2: ..." while on Question 2): a re-ask.
  function reasksCurrent(text) {
    const item = phase === "asking" ? current() : null;
    if (!item) return false;
    const markers = prompts.findQuestionMarkers(text);
    return markers.some(({ n }) => n === Number(item.n ?? cursor + 1)) && !markers.some(({ n }) => n > Number(item.n ?? cursor + 1));
  }

  // A goodbye on the last question that lacks "That completes our interview." still ends it: a sign-off
  // phrase, or most of the admin's closing script, in a turn that asks nothing and is not an encouragement.
  function closesInterview(said, heard) {
    if (!heard || said.includes("?") || KEEP_GOING.test(said)) return false;
    if (CLOSING_CUE.test(said)) return true;
    if (closingWords.length < 3) return false;
    const spoken = new Set(contentWords(said));
    return closingWords.filter((word) => spoken.has(word)).length / closingWords.length >= 0.5;
  }

  // A fixed (non-topic) question recognised by its wording, since no number is spoken: every content word
  // of a short prompt, or three quarters of a longer one, appear in ANVI's turn.
  function asksByWording(text, item) {
    if (!item || NATURAL_PHRASING.test(String(item.text || ""))) return false;
    const wanted = [...new Set(contentWords(item.text))];
    if (wanted.length < 2) return false;
    const spoken = new Set(contentWords(text));
    const found = wanted.filter((word) => spoken.has(word)).length;
    return found / wanted.length >= (wanted.length <= 3 ? 1 : 0.75);
  }

  // A finished turn without a marker: the plan index it asks by wording (Question 1 from the intro, the next
  // question while asking), or `reask` when it repeats the current question.
  function wordingTarget(text) {
    if (phase === "intro") return { index: asksByWording(text, plan[0]) ? 0 : -1, reask: false };
    if (phase !== "asking") return { index: -1, reask: false };
    if (asksByWording(text, plan[cursor + 1])) return { index: cursor + 1, reask: false };
    return { index: -1, reask: asksByWording(text, current()) };
  }

  function spokenAfterMarker(text, item) {
    const found = prompts.findQuestionMarkers(text).find((marker) => marker.n === Number(item.n));
    return found ? text.slice(found.end).replace(/^\s*[:.,\-–—।]\s*/, "").trim().slice(0, 600) : "";
  }

  // --- Live events ----------------------------------------------------------------------------

  function beginTurn() {
    if (turn) return;
    clearTimer("nudge");
    clearTimer("reply");
    turn = { output: "", audioBytes: 0, audioStartedAt: 0, startIndex: cursor, startPhase: phase, answered: candidateSpoke, marker: false, closing: false };
  }

  // The last question is on the table (or there is none): ANVI's closing can no longer be premature.
  const lastQuestionReached = () => !plan.length || (phase === "asking" && cursor >= plan.length - 1);

  function onAudio(pcm) {
    if (finalizing) return;
    beginTurn();
    if (!turn.audioStartedAt) turn.audioStartedAt = clock.now();
    turn.audioBytes += pcm.length;
    if (!speaking) { speaking = true; emitState(); }
    emit("audio", pcm);
  }

  function onOutputText(chunk) {
    beginTurn();
    turn.output += chunk;
    emit("caption", { role: "anvi", text: turn.output.trim(), final: false });
    if (phase !== "closing" && prompts.CLOSING_PHRASE.test(turn.output)) {
      if (lastQuestionReached()) {
        turn.closing = true;
        beginClosing();
        return;
      }
      // Too early: whether it stands is decided when the turn ends, once the candidate's words are in.
      turn.closingPhrase = true;
    }
    if (phase === "closing") {
      if (prompts.CLOSING_PHRASE.test(turn.output)) turn.closing = true;
      return;
    }
    const target = markerTarget(turn.output);
    if (target >= 0) {
      turn.marker = true;
      advanceTo(target);
    }
  }

  // Words that arrive after the cursor moved on still belong to the question the utterance began on.
  function appendLate(item, chunk) {
    const record = answers[item.qid] || {};
    if (record.source === "transcribe") return;
    saveAnswer(item, { text: appendChunk(String(record.text || ""), chunk), source: "live" });
  }

  function onInputText(chunk) {
    if (!chunk) return;
    clearTimer("nudge");
    // Input transcription can lag behind ANVI's reply: words that start arriving during her closing turn
    // still belong to the question that turn began on (for example a skip request on the last question).
    if (!candidateText) candidateFor = phase === "asking" ? cursor : phase === "closing" && turn?.startPhase === "asking" ? turn.startIndex : -1;
    const late = candidateFor >= 0 && !(phase === "asking" && candidateFor === cursor);
    if (late) appendLate(plan[candidateFor], chunk);
    // Separate consecutive candidate turns in the running transcript.
    else if (buffer) buffer.liveText += (!candidateText && buffer.liveText && !/^\s/.test(chunk) ? " " : "") + chunk;
    candidateText += chunk;
    if (chunk.trim()) candidateSpoke = true;
    // Words that arrive while ANVI is replying are transcription lag, not a turn still waiting for her.
    if (chunk.trim() && !turn && !speaking && !onHold) schedule("reply", silenceMs + REPLY_WAIT_MS, onNoReply);
    emit("caption", { role: "candidate", text: candidateText.trim(), final: false });
  }

  // The candidate spoke and Live never took its turn: ANVI is asked once to reply, and the silence nudges
  // take over if she still does not.
  function onNoReply() {
    timer.reply = null;
    if (onHold) return;
    // No client frames at all: the client is gone, not waiting for a reply (the nudge timer handles that).
    if (disposed || finalizing || !session || turn || phase === "closing" || clock.now() - lastFrameAt > INACTIVE_MS) return;
    if (prompts.replyInstruction) send(prompts.replyInstruction());
    armNudge(0);
  }

  // Barge-in: ANVI stops, and the candidate's words stay pending for the next model turn.
  function onInterrupted() {
    const active = turn;
    turn = null;
    emit("interrupted");
    if (!active) return;
    turnSeq += 1;
    const said = active.output.trim();
    if (said) emit("caption", { role: "anvi", text: said, final: true });
    // The candidate is talking over ANVI: their audio flows again at once.
    quietUntil = 0;
    if (speaking) { speaking = false; emitState(); }
  }

  function resetCandidate() {
    candidateText = "";
    candidateSpoke = false;
    candidateFor = -1;
  }

  // Keeps the warm-up conversation (everything before Question 1) for the admin report; it is never scored.
  function recordWarmup(heard, said) {
    const marker = prompts.findQuestionMarkers(said)[0];
    const lines = [heard && `Candidate: ${heard}`, (marker ? said.slice(0, marker.index) : said).trim() && `ANVI: ${(marker ? said.slice(0, marker.index) : said).trim()}`].filter(Boolean);
    if (!lines.length || warmupTranscript.length >= WARMUP_TRANSCRIPT_LIMIT) return;
    warmupTranscript = [warmupTranscript, ...lines].filter(Boolean).join("\n").slice(0, WARMUP_TRANSCRIPT_LIMIT);
    save({ warmupTranscript });
  }

  // ANVI closed before the interview was over and the conduct rules keep it going: a candidate who asked to
  // finish stays on their question and is pointed to the End interview button; otherwise ANVI moves on.
  function keepGoing(endAsked) {
    const index = phase === "intro" ? 0 : endAsked ? cursor : Math.min(cursor + 1, plan.length - 1);
    send(prompts.continueInstruction(plan[index]?.n ?? index + 1, { endRequested: endAsked && !conduct.endByVoice }));
    expected = { index, afterSeq: turnSeq };
  }

  function finishTurn() {
    const active = turn || { output: "", audioBytes: 0, startIndex: cursor, startPhase: phase, answered: false, marker: false, closing: false };
    turn = null;
    turnSeq += 1;
    const wasSpeaking = speaking;
    speaking = false;
    // ANVI's audio is still playing on the client; its silence frames stay unforwarded until it ends.
    if (active.audioStartedAt) quietUntil = Math.max(clock.now(), active.audioStartedAt + active.audioBytes / OUT_BYTES_PER_MS) + SPEAKING_SILENCE_TAIL_MS;
    const said = active.output.trim();
    const heard = candidateText.trim();
    const answered = Boolean(active.answered || candidateSpoke);
    const answerIndex = answered ? candidateFor : -1;
    if (said) emit("caption", { role: "anvi", text: said, final: true });
    if (heard) emit("caption", { role: "candidate", text: heard, final: true });
    resetCandidate();
    // Input transcription can lag: with no words yet in this turn, the previous utterance is read instead.
    const endAsked = END_REQUEST.test(heard || lastHeard);
    if (heard) lastHeard = heard;
    const resumeTurn = resumeTurnPending && Boolean(said);
    if (resumeTurn) resumeTurnPending = false;

    // ANVI's fixed refusal line means the candidate tried to steer her; flag the question for review.
    // Her wellbeing reply (the reschedule line) is flagged for the report too. Flags never change a score.
    if (said && active.startPhase === "asking") {
      const flags = metaOf(plan[active.startIndex])?.flags;
      if (flags && prompts.REFUSAL_PHRASE?.test(said)) { flags.add("prompt_injection"); flags.add("off_topic_request"); }
      if (flags && prompts.WELLBEING_PHRASE?.test(said)) flags.add("wellbeing_concern");
    }

    // After a warm-up ANVI jumped past Question 1 (say, the introduction covered its topic).
    // Corrected once; a second jump is accepted rather than looping.
    const skippedAhead = phase === "intro" && warmup.any && !firstQuestionCorrected && !active.marker && !active.closingPhrase && Boolean(said)
      && (prompts.findQuestionMarkers(`${said} .`).some(({ n }) => n > Number(plan[0]?.n ?? 1))
        || (!asksByWording(said, plan[0]) && plan.slice(1).some((item) => asksByWording(said, item))));
    if (phase === "intro" || phase === "asking") {
      // A turn that ends on its marker ("...Question 3") had no terminator to confirm it while streaming.
      if (!active.marker && said) {
        const target = markerTarget(`${said} .`);
        if (target >= 0) { active.marker = true; advanceTo(target); }
        else if (reasksCurrent(`${said} .`)) active.reask = true;
      }
      const worded = said && !active.marker && !active.reask && !active.closingPhrase && !skippedAhead ? wordingTarget(said) : { index: -1, reask: false };
      if (active.marker) {
        expected = null;
      } else if (skippedAhead) {
        // Corrected below: ANVI is told to ask Question 1 first.
      } else if (active.reask) {
        // The current question again: neither a follow-up nor the next question.
        followUp = false;
      } else if (said && expected && turnSeq > expected.afterSeq && !active.closingPhrase) {
        // Server-led numbering: ANVI was told to ask this question, and her reply carried no readable marker.
        const { index } = expected;
        expected = null;
        if (phase === "intro" || index > cursor) { active.marker = true; advanceTo(index); }
      } else if (worded.index >= 0) {
        // ANVI asked Question 1, or moved on by herself to the next question, in its plan wording.
        active.marker = true;
        advanceTo(worded.index);
      } else if (worded.reask) {
        // She repeated the current question: neither a follow-up nor the next question.
        active.reask = true;
        followUp = false;
      } else if (said && phase === "intro" && answered && !active.closingPhrase && warmupAsked < warmup.questions
        && !READY_QUESTION.test(said) && (said.includes("?") || INTRODUCE_ASK.test(said))) {
        // An icebreaker or "tell me about yourself" during the warm-up, not a Question 1 whose marker was lost.
        warmupAsked += 1;
      } else if (said && phase === "intro" && answered && !active.closingPhrase && said.includes("?") && words(said) >= 6 && !INTRO_READY_CHECK.test(askedPart(said))) {
        // The intro is over and ANVI asked a real question: Question 1, whose marker was lost.
        active.marker = true;
        advanceTo(0);
      } else if (said && phase === "asking" && cursor === plan.length - 1 && closesInterview(said, answered || metaOf(current()).candidateTurns > 0)) {
        // ANVI closed after the last question without the fixed phrase (a custom closing script, say).
        active.closing = true;
        beginClosing();
      }
    }

    if (warmup.any && active.startPhase === "intro") recordWarmup(heard, said);
    // Before any instruction below asks for a reply, so that reply is already in the interview language.
    if (prompts.languageInstruction) guardLanguage(said);

    // "That completes our interview" before the last question: it stands only when the conduct rules allow
    // it (a candidate's end request needs endByVoice; ANVI's own early close needs finishAllQuestions off).
    let continueAfter = null;
    if (active.closingPhrase && !active.marker && (phase === "intro" || phase === "asking")) {
      const allowed = lastQuestionReached() || (endAsked ? conduct.endByVoice : !conduct.finishAllQuestions);
      if (allowed) {
        active.closing = true;
        beginClosing();
      } else {
        continueAfter = { endAsked };
      }
    }

    // Words for a question the interview has since moved past (a new marker, or closing) belong to it.
    if (answered && answerIndex >= 0 && plan[answerIndex] && !(phase === "asking" && answerIndex === cursor)) {
      noteCandidateTurn(plan[answerIndex], heard);
    }
    // Topic questions are phrased by ANVI; keep her wording (also when she re-asks after a resume).
    const asked = phase === "asking" ? current() : null;
    if (asked && said && NATURAL_PHRASING.test(asked.text) && !metaOf(asked).spokenQuestion) {
      // Without a marker, the turn that moved to this item is the one that asked it.
      const askedNow = active.marker && (active.startPhase !== "asking" || active.startIndex !== cursor) && !prompts.findQuestionMarkers(said).length;
      const spoken = spokenAfterMarker(said, asked) || (askedNow ? askedPart(said) : "");
      if (spoken) {
        metaOf(asked).spokenQuestion = spoken;
        saveAnswer(asked);
        emitState();
      }
    }

    if (phase === "closing" && (active.closing || turnSeq > closeAfterTurn)) {
      void finalize(closingOutcome()).catch(() => {});
      return;
    }

    if (resumeTurn) {
      // The re-ask after a reconnect: neither a follow-up nor a candidate turn.
      emitState();
    } else if (answered && phase === "intro" && !active.marker) {
      // Warm-up turns end here too: the client must see that ANVI stopped speaking.
      if (wasSpeaking) emitState();
      introTurns += 1;
      if (!continueAfter && !skippedAhead && introTurns > introTurnLimit(warmup) && !introMoveOnSent) {
        introMoveOnSent = true;
        lead(() => askNext(0));
      }
    } else if (answered && phase === "asking" && answerIndex === cursor) {
      const item = current();
      noteCandidateTurn(item, heard);
      candidateTurnsOnQuestion += 1;
      if (!active.marker && !active.reask && !continueAfter) {
        // A reply without a new marker is a follow-up when it asks something, else a wait or repeat.
        followUp = said.includes("?");
        if (followUp) {
          followUpsUsed += 1;
          metaOf(item).followUpsAsked.push(said.slice(0, 600));
        }
      }
      if (buffer) saveAnswer(item, { text: joinText(buffer.carried, buffer.liveText), source: "live" });
      saveProgress();
      emitState();
      // A transition without the next question would leave the candidate waiting; the server asks for it now.
      const announcedOnly = !active.marker && !active.reask && !followUp && !expected && cursor + 1 < plan.length
        && MOVE_ON_CUE.test(said) && !KEEP_GOING.test(said);
      // After an early close, keepGoing below asks for the question instead.
      if (!continueAfter && (announcedOnly || (!active.marker && candidateTurnsOnQuestion > (Number(item.followUpBudget) || 0) + 2))) lead(moveOn);
    } else if (wasSpeaking) {
      emitState();
    }
    if (continueAfter) lead(() => keepGoing(continueAfter.endAsked));
    if (skippedAhead && phase === "intro") {
      firstQuestionCorrected = true;
      lead(() => {
        send(prompts.firstQuestionInstruction(plan[0]?.n ?? 1));
        expected = { index: 0, afterSeq: turnSeq };
      });
    }
    armNudge(active.audioBytes || 0);
    if (goAwayPending && resumeHandle && phase !== "closing") void refresh();
  }

  // Starts after ANVI's audio would have finished playing on the client.
  function armNudge(audioBytes) {
    if (phase === "closing" || finalizing || onHold) return;
    schedule("nudge", nudgeMs + audioBytes / OUT_BYTES_PER_MS, onSilence);
  }

  function onSilence() {
    timer.nudge = null;
    if (disposed || finalizing || !session || phase === "closing" || onHold) return;
    // Nobody is sending audio at all: pause instead of talking to an empty room.
    if (clock.now() - lastFrameAt > INACTIVE_MS) { pause(); return; }
    if (nudgesOnQuestion < maxNudges) {
      nudgesOnQuestion += 1;
      saveProgress();
      send(prompts.nudgeInstruction());
      return;
    }
    if (phase === "intro") {
      if (!introMoveOnSent) { introMoveOnSent = true; askNext(0); }
      return;
    }
    metaOf(current()).silent = true;
    saveAnswer(current());
    moveOn();
  }

  // Words the candidate said before a drop count once; the reconnect starts them afresh.
  function settleCandidate() {
    if (candidateSpoke && candidateFor >= 0 && plan[candidateFor]) {
      noteCandidateTurn(plan[candidateFor], candidateText.trim());
      if (phase === "asking" && candidateFor === cursor) candidateTurnsOnQuestion += 1;
    }
    resetCandidate();
    followUp = false;
  }

  function onClosed(mine) {
    if (mine !== generation || disposed || finalizing) return;
    session = null;
    speaking = false;
    turn = null;
    relay = null;
    refreshing = false;
    clearTimer("nudge");
    clearTimer("reply");
    settleCandidate();
    if (buffer) saveAnswer(buffer.item, { text: joinText(buffer.carried, buffer.liveText), source: "live" });
    saveProgress();
    emit("error",{ code: "LIVE_DISCONNECTED", message: "The connection to ANVI dropped. Reconnecting…", retryable: true });
  }

  function attach(live, mine) {
    const guard = (fn) => (...args) => {
      if (mine !== generation || disposed) return;
      try { fn(...args); }
      catch (error) { warn("Live event handling failed", error); }
    };
    live.on("audio", guard(onAudio));
    live.on("outputText", guard(onOutputText));
    live.on("inputText", guard(onInputText));
    live.on("turnComplete", guard(() => finishTurn()));
    live.on("interrupted", guard(onInterrupted));
    // The upstream closes soon: switch to a resumed session at the next turn boundary.
    live.on("goAway", guard(() => { goAwayPending = true; }));
    live.on("resumption", guard((update) => { if (update?.handle) resumeHandle = String(update.handle); }));
    live.on("error", guard((error) => warn("Live session error", error)));
    live.on("closed", () => onClosed(mine));
  }

  // Opens a resumed session before the old one is cut off. Candidate audio is held meanwhile and
  // replayed into the new session, so nothing said during the switch is lost.
  async function refresh() {
    if (refreshing || !resumeHandle || disposed || finalizing || !session) return;
    const mine = generation;
    refreshing = true;
    relay = { frames: [], bytes: 0 };
    let next = null;
    try {
      next = await gemini.openLive({ systemText, voice: liveVoice, silenceMs, resumeHandle, languageCode: liveLanguageCode });
    } catch (error) {
      warn("Could not refresh the Live session before it ended", error);
    }
    const held = relay;
    refreshing = false;
    relay = null;
    if (mine !== generation || disposed || finalizing || !session) {
      try { next?.close(); } catch { /* stale */ }
      return;
    }
    const target = next || session;
    if (next) {
      const old = session;
      const id = ++generation;
      session = next;
      goAwayPending = false;
      attach(next, id);
      try { old.close(); } catch { /* already closed */ }
    }
    for (const frame of held?.frames || []) {
      try { target.sendAudio(frame); } catch { /* the new session closed */ }
    }
  }

  // The client stopped sending audio: close Live (the live doc stays) until frames arrive again.
  function pause() {
    if (paused || !session) return;
    paused = true;
    const closing = session;
    session = null;
    generation += 1;
    turn = null;
    speaking = false;
    relay = null;
    refreshing = false;
    clearTimer("nudge");
    clearTimer("reply");
    settleCandidate();
    if (buffer) saveAnswer(buffer.item, { text: joinText(buffer.carried, buffer.liveText), source: "live" });
    saveProgress();
    try { closing.close(); } catch { /* already closed */ }
  }

  function wake() {
    if (!paused || waking || disposed || finalizing || clock.now() < wakeAfter) return;
    waking = true;
    start({ resumed: true })
      .catch((error) => {
        wakeAfter = clock.now() + WAKE_RETRY_MS;
        if (error?.code === "LIVE_UNAVAILABLE") emit("error", { code: "LIVE_UNAVAILABLE", message: "ANVI could not reconnect. Press Try again.", retryable: true });
      })
      .finally(() => { waking = false; });
  }

  // --- Deadline and finalisation --------------------------------------------------------------

  function onDeadline() {
    timer.deadline = null;
    if (disposed || finalizing) return;
    deadlineHit = true;
    if (phase !== "closing") beginClosing();
    send(prompts.closeInstruction());
    schedule("grace", DEADLINE_GRACE_MS, () => {
      timer.grace = null;
      void finalize(deadlineOutcome()).catch(() => {});
    });
  }

  function textFor(item) {
    const stored = String(answers[item.qid]?.text || "").trim();
    return stored || (buffer?.item === item ? buffer.liveText.trim() : "");
  }

  // Evidence of speech only: candidate turns or transcribed words, never raw mic bytes (room noise).
  function heardOn(item) {
    return metaOf(item).candidateTurns > 0 || Boolean(textFor(item));
  }

  // Skipped: the candidate's last word on the question was a skip request, with little said before it.
  // The accurate transcript, when there is one, is read too: Live input transcription can miss or garble it.
  function skippedOn(item) {
    if (!skipAllowed(item)) return false;
    const info = metaOf(item);
    const answer = answers[item.qid] || {};
    if (answer.source === "transcribe" && String(answer.text || "").trim()) {
      const transcript = skipRequestOf(answer.text);
      if (transcript.requested && transcript.content <= SKIP_MAX_WORDS) return true;
      return info.skipRequested && transcript.content <= SKIP_MAX_WORDS;
    }
    return info.skipRequested && info.substantiveWords <= SKIP_MAX_WORDS;
  }

  function answeredAny() {
    return plan.some((item) => !skippedOn(item) && (metaOf(item).substantiveWords > 0 || Boolean(textFor(item))));
  }

  function questionsRemain() {
    if (!plan.length) return false;
    if (phase === "intro") return true;
    const last = plan[plan.length - 1];
    return !metaOf(last).asked || !heardOn(last) || !answeredAny();
  }

  function deadlineOutcome() {
    return { status: answeredAny() ? "completed" : "abandoned", endReason: "deadline" };
  }

  function closingOutcome() {
    if (deadlineHit) return deadlineOutcome();
    return questionsRemain() ? { status: "abandoned", endReason: "closed_early" } : { status: "completed", endReason: "completed" };
  }

  function waitForTranscripts() {
    if (!pending.size) return Promise.resolve();
    return new Promise((resolve) => {
      const cap = timers.setTimeout(resolve, TRANSCRIBE_WAIT_MS);
      Promise.allSettled([...pending]).then(() => { timers.clearTimeout(cap); resolve(); });
    });
  }

  function buildItems() {
    return plan.map((item) => {
      const info = metaOf(item);
      const answer = answers[item.qid] || {};
      const text = String(answer.text || "").trim();
      const skipped = skippedOn(item);
      const status = skipped ? "skipped" : text ? "answered" : "not_attempted";
      return {
        qid: item.qid,
        n: item.n,
        sectionId: item.sectionId,
        sectionName: item.sectionName,
        topic: item.topic,
        competency: item.competency,
        maxMarks: item.marks ?? 10,
        weight: item.weight ?? 1,
        expectedAnswer: item.expectedAnswer || "",
        questionText: questionText(item) || item.text,
        followUpsAsked: info.followUpsAsked,
        answerText: status === "answered" ? text : skipped ? text : "",
        answerSource: text ? answer.source === "transcribe" ? "transcribe" : "live" : "none",
        answerSeconds: Number(answer.seconds) || 0,
        candidateTurns: info.candidateTurns,
        status,
        asked: Boolean(info.asked) || Boolean(text),
        expectedKeyPoints: Array.isArray(item.keyPoints) ? item.keyPoints : [],
        flags: [...info.flags, ...(info.silent && !text ? ["silent"] : [])],
      };
    });
  }

  function scheduleFinalizeRetry(outcome) {
    const delay = FINALIZE_RETRY_MS[finalizeRetries];
    if (delay === undefined || disposed) return;
    finalizeRetries += 1;
    schedule("retry", delay, () => {
      timer.retry = null;
      void finalize(outcome).catch(() => {});
    });
  }

  function finalize({ status, endReason }) {
    if (finalizing) return finalizing;
    finalizing = (async () => {
      // The deadline and grace timers stay armed until the result is saved, so a failed save still ends.
      clearTimer("nudge");
      clearTimer("retry");
      if (phase === "asking") closeBuffer();
      dropBuffer();
      phase = "done";
      try { await persist.markFinalizing?.(); }
      catch (error) { warn("Could not mark the interview as finishing", error); }
      await waitForTranscripts();
      const items = buildItems();
      let result;
      try {
        // `warmup`: the unscored warm-up conversation, kept on the attempt for the admin report.
        result = await persist.finalize({ status, endReason, items, warmup: warmupTranscript });
      } catch (error) {
        warn("Could not save the finished interview", error);
        finalizing = null;
        phase = "closing";
        scheduleFinalizeRetry({ status, endReason });
        emit("error", { code: "FINALIZE_FAILED", message: "Your answers could not be saved yet. Please try ending again.", retryable: true });
        throw error;
      }
      for (const name of Object.keys(timer)) clearTimer(name);
      const ending = session;
      session = null;
      generation += 1;
      try { ending?.close(); } catch { /* already closed */ }
      if (result?.lost) {
        // Another holder owns the attempt now; it ends the interview, not this one.
        leaseLost();
        return { status, endReason, lost: true };
      }
      // Something else ended the attempt first: report what is actually stored.
      const outcome = result && result.applied === false
        ? { status: result.status || status, endReason: result.endReason ?? endReason }
        : { status, endReason };
      emit("ended", outcome);
      return outcome;
    })();
    return finalizing;
  }

  // --- Public API -----------------------------------------------------------------------------

  // What a fresh Live session is told first: the introduction, or where a resumed interview stands.
  function sendOpening(intro) {
    if (intro) {
      const minutes = Math.max(1, Math.round((deadlineAt - clock.now()) / 60_000));
      send(prompts.introInstruction({ studentFirstName, total: plan.length, minutes, silenceSeconds, voiceCommands, warmup: warmupSettings }));
      return;
    }
    const item = current();
    const answered = candidateTurnsOnQuestion > 0 || Boolean(buffer?.liveText.trim() || buffer?.carried);
    send(prompts.resumeInstruction({ n: item?.n ?? cursor + 1, total: plan.length, answered, followUps: metaOf(item)?.followUpsAsked || [] }));
    resumeTurnPending = true;
  }

  async function start({ resumed = false } = {}) {
    if (disposed) throw Object.assign(new Error("This interview session has ended."), { code: "SESSION_DISPOSED" });
    if (finalizing) throw Object.assign(new Error("This interview is finishing."), { code: "SESSION_FINALIZING" });
    const mine = ++generation;
    try { session?.close(); } catch { /* replaced */ }
    session = null;
    turn = null;
    speaking = false;
    relay = null;
    refreshing = false;
    const stale = () => mine !== generation || disposed || finalizing;
    const open = (handle) => gemini.openLive({ systemText, voice: liveVoice, silenceMs, languageCode: liveLanguageCode, ...(handle ? { resumeHandle: handle } : {}) });
    let opened = null;
    let continued = false;
    if (resumed && resumeHandle) {
      try {
        opened = await open(resumeHandle);
        continued = true;
      } catch (error) {
        warn("Could not continue the earlier Live session; starting a fresh one", error);
        resumeHandle = null;
      }
    }
    if (!opened && !stale()) {
      try {
        opened = await open(null);
      } catch (error) {
        warn("Could not open the Live session", error);
        throw Object.assign(new Error("ANVI could not connect. Please try again."), { code: "LIVE_UNAVAILABLE", retryable: true });
      }
    }
    if (stale()) {
      try { opened?.close(); } catch { /* stale */ }
      throw Object.assign(new Error("This interview session was replaced."), { code: "SESSION_REPLACED" });
    }
    session = opened;
    paused = false;
    goAwayPending = false;
    lastFrameAt = clock.now();
    attach(opened, mine);
    if (phase === "asking" && !buffer) openBuffer(current());
    resumeTurnPending = false;
    // A continued session that resumed one opened fresh during a hold never had its opening either.
    const fresh = !continued || openingPending;
    if (onHold && phase !== "closing" && prompts.holdInstruction) {
      // Started or reconnected during a proctoring hold: ANVI waits. releaseHold asks her to repeat the
      // question, or gives a fresh session its opening (the introduction, or where the interview stands).
      openingPending = fresh;
      send(prompts.holdInstruction(), { turnComplete: false });
    } else {
      openingPending = false;
      if (resumed && phase === "closing") {
        closeAfterTurn = turnSeq;
        send(prompts.closeInstruction());
      } else if (!fresh) {
        // The resumed session kept the conversation; it only needs to know the line dropped.
        send(prompts.reconnectedInstruction());
        resumeTurnPending = phase === "asking";
      } else {
        sendOpening(!resumed || phase === "intro");
      }
    }
    if (!timer.deadline && !deadlineHit) schedule("deadline", deadlineAt - clock.now(), onDeadline);
    const snapshot = state();
    emit("state", snapshot);
    return snapshot;
  }

  function pushAudio(pcm) {
    if (disposed || finalizing || !Buffer.isBuffer(pcm) || !pcm.length) return;
    lastFrameAt = clock.now();
    // On hold the microphone is dropped: nothing reaches ANVI or the answer.
    if (onHold) return;
    if (paused) wake();
    // While ANVI speaks (and until her audio has played out) client silence frames carry nothing the Live
    // VAD needs; after that silence is forwarded again so the end of the candidate's speech is detected.
    if ((speaking || clock.now() < quietUntil) && isSilence(pcm)) {
      silenceDroppedBytes += pcm.length;
      return;
    }
    if (relay) {
      if (relay.bytes + pcm.length <= RELAY_MAX_BYTES) { relay.frames.push(Buffer.from(pcm)); relay.bytes += pcm.length; }
    } else {
      try { session?.sendAudio(pcm); }
      catch (error) { warn("Could not forward audio to Live", error); }
    }
    // Intro and closing audio is not part of any answer; client silence frames carry no speech.
    if (!buffer || phase !== "asking" || isSilence(pcm)) return;
    if (buffer.bytes + pcm.length > MAX_QUESTION_BYTES || audioMemory.bytes + pcm.length > PROCESS_AUDIO_CAP) { buffer.truncated = true; return; }
    buffer.chunks.push(Buffer.from(pcm));
    buffer.bytes += pcm.length;
    audioMemory.bytes += pcm.length;
  }

  // Proctoring pause: returns true when the hold starts. What the candidate already said is kept; ANVI is told
  // (as context only, so she does not reply) to wait silently.
  function hold() {
    if (onHold || disposed || finalizing) return false;
    onHold = true;
    clearTimer("nudge");
    clearTimer("reply");
    if (buffer) saveAnswer(buffer.item, { text: joinText(buffer.carried, buffer.liveText), source: "live" });
    if (session && phase !== "closing" && prompts.holdInstruction) send(prompts.holdInstruction(), { turnComplete: false });
    return true;
  }

  // The hold is over: ANVI briefly repeats the current question (that reply is a re-ask, not a follow-up).
  // A step a turn finished during the hold would have sent (the next question, say) is sent instead, and a
  // session opened fresh during the hold gets its opening. A Live session closed meanwhile (idle) resumes on
  // the next audio frame with its own resume instruction.
  function releaseHold() {
    if (!onHold) return false;
    onHold = false;
    const step = heldStep;
    heldStep = null;
    if (disposed || finalizing) return true;
    if (session && (phase === "intro" || phase === "asking")) {
      // Without a session the next start gives the opening (openingPending stays for it).
      const opening = openingPending;
      openingPending = false;
      if (step) {
        step();
      } else if (opening) {
        sendOpening(phase === "intro");
      } else if (prompts.holdOverInstruction) {
        const item = phase === "asking" ? current() : null;
        send(prompts.holdOverInstruction({ n: item?.n ?? cursor + 1, intro: phase === "intro" }));
        resumeTurnPending = phase === "asking";
      }
    }
    armNudge(0);
    return true;
  }

  // `endReason`: "ended_by_student", or "proctoring_limit" when the server ends it for violations (no closing
  // from ANVI: finalize closes the Live session). Both keep what was answered, as a partial attempt if questions remain.
  function end(endReason = "ended_by_student") {
    if (finalizing) return finalizing;
    if (disposed) return Promise.reject(Object.assign(new Error("This interview session has ended."), { code: "SESSION_DISPOSED" }));
    return finalize({ status: questionsRemain() ? "abandoned" : "completed", endReason: endReason === "proctoring_limit" ? endReason : "ended_by_student" });
  }

  // Detaches this conductor (refresh, takeover, leaving the room). What was said on the current question
  // is still transcribed; pending transcripts are handed on through persist.saveLateAnswer.
  function dispose() {
    if (disposed) return;
    if (!finalizing && phase === "asking" && buffer) closeBuffer();
    disposed = true;
    generation += 1;
    for (const name of Object.keys(timer)) clearTimer(name);
    dropBuffer();
    relay = null;
    const closing = session;
    session = null;
    try { closing?.close(); } catch { /* already closed */ }
    events.removeAllListeners();
  }

  // A newer holder of the same attempt accepts a transcript the old holder finished late, as long as the
  // answer still holds the text the old holder last saved.
  function adoptAnswer(qid, record, expectedText) {
    const item = plan.find((entry) => entry.qid === qid);
    if (!item || disposed || !record?.text) return false;
    if (String(answers[qid]?.text || "") !== String(expectedText || "")) return false;
    if (buffer?.item === item) buffer.carried = record.text;
    saveAnswer(item, { text: record.text, source: record.source || "transcribe", seconds: Number(record.seconds) || Number(answers[qid]?.seconds) || 0 });
    return true;
  }

  // Resolves once every progress write issued so far has settled (the socket waits before rotating the lease).
  function flushed() {
    return Promise.allSettled([...inflight]).then(() => undefined);
  }

  function stats() {
    return { bufferedBytes: buffer?.bytes || 0, pendingTranscriptions: pending.size, cursor, phase, silenceDroppedBytes, languageCorrections: languageCorrected.size };
  }

  return {
    start, pushAudio, end, dispose, stats, state, adoptAnswer, flushed, hold, releaseHold,
    isFinalizing: () => Boolean(finalizing),
    isOnHold: () => onHold,
    isPaused: () => paused,
    on: (event, fn) => { events.on(event, fn); return () => events.off(event, fn); },
    off: (event, fn) => events.off(event, fn),
  };
}
