import mongoose from "mongoose";
import { tenantModel } from "../../platform/tenantContext.js";
// Registered here too so every tenant connection (and ensureTenantIndexes) includes the asset store.
import { AnviAudioAsset } from "./anviInterview.audio.models.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

export { AnviAudioAsset };
export const RUNTIME_MODES = Object.freeze(["live", "hybrid"]);
// live.hybrid.segments keeps at most this many receipts (the hybrid conductor trims oldest first).
export const HYBRID_SEGMENT_LIMIT = 200;

/** An attempt's runtime mode; anything other than "hybrid" (including an absent value) means Live. */
export const runtimeModeOf = (attempt) => (attempt?.runtimeMode === "hybrid" ? "hybrid" : "live");

// One planned main question (plus its follow-up budget). Key points never reach the browser.
const planItemSchema = new Schema({
  qid: { type: String, required: true },
  n: { type: Number, required: true },
  sectionId: String,
  sectionName: String,
  topic: String,
  competency: String,
  text: { type: String, required: true },
  context: String,
  keyPoints: [String],
  authoredFollowUps: [String],
  followUpBudget: { type: Number, default: 0 },
  responseSeconds: { type: Number, default: null },
  source: { type: String, enum: ["manual", "annu", "resume"], default: "manual" },
  kind: String,
  // Scoring inputs copied onto the attempt items at the end.
  marks: { type: Number, default: 10 },
  weight: { type: Number, default: 1 },
  skippable: { type: Boolean, default: true },
  expectedAnswer: { type: String, default: "" },
  // Hybrid only (absent on Live plans): {language: text} to speak when it differs from `text`, the
  // time-low priority, the normalized-text hash and the resolved AnviAudioAsset id.
  spoken: { type: Schema.Types.Mixed, default: undefined },
  priority: { type: Schema.Types.Mixed, default: undefined },
  textHash: { type: String, default: undefined },
  audioAssetId: { type: String, default: undefined },
}, { _id: false });

const tokenUsageSchema = new Schema({ input: Number, output: Number }, { _id: false });
// One candidate turn of a hybrid answer: the main answer or a follow-up reply.
const answerTurnSchema = new Schema({ kind: String, text: String }, { _id: false });

// What the durable record keeps per question: text only. Student audio is never stored anywhere; only
// question TTS goes to R2 (see anviInterview.audio.models.js).
const itemSchema = new Schema({
  qid: { type: String, required: true },
  n: Number,
  sectionId: String,
  sectionName: String,
  topic: String,
  competency: String,
  questionText: String,
  followUpsAsked: [String],
  answerText: { type: String, default: "" },
  answerSource: { type: String, enum: ["transcribe", "live", "none"], default: "none" },
  answerSeconds: { type: Number, default: 0 },
  candidateTurns: { type: Number, default: 0 },
  status: { type: String, enum: ["answered", "skipped", "not_attempted"], default: "not_attempted" },
  // false for a planned question ANVI never reached; students are never shown its text.
  asked: { type: Boolean, default: undefined },
  // The authored answer stays server side (admins only); students see the key points.
  expectedAnswer: { type: String, default: "" },
  expectedKeyPoints: [String],
  weight: { type: Number, default: 1 },
  maxMarks: { type: Number, default: 10 },
  // Filled by evaluation.
  matched: [String],
  partial: [String],
  missed: [String],
  marks: Number,
  percentCorrect: Number,
  feedback: String,
  strengths: { type: [String], default: undefined },
  improvements: { type: [String], default: undefined },
  rubric: { type: [Schema.Types.Mixed], default: undefined },
  metrics: { type: Schema.Types.Mixed, default: undefined },
  // Report v2 (prompt anvi-eval-v3+; absent on older items): {knowledge, articulation, fluency, confidence,
  // professionalism} each 0-100 or null (null for an unanswered item), plus functional / nonFunctional 0-100.
  dimensions: { type: Schema.Types.Mixed, default: undefined },
  functional: { type: Number, default: undefined },
  nonFunctional: { type: Number, default: undefined },
  flags: [String],
  // Hybrid transcription meta (absent on Live items).
  transcriptModel: { type: String, default: undefined },
  transcriptAttempts: { type: Number, default: undefined },
  transcriptEscalated: { type: Boolean, default: undefined },
  transcriptAudioSeconds: { type: Number, default: undefined },
  transcriptTokenUsage: { type: tokenUsageSchema, default: undefined },
  transcriptLowConfidence: { type: Boolean, default: undefined },
  turns: { type: [answerTurnSchema], default: undefined },
}, { _id: false });

// Cost of one attempt at finalize (budget summary). Unknown prices stay null, never 0.
const costSchema = new Schema({
  estimatedUsd: { type: Number, default: null },
  estimatedInr: { type: Number, default: null },
  liveSeconds: { type: Number, default: 0 },
  // Budget mode at the end and the strictest mode reached.
  mode: { type: String, default: null },
  peakMode: { type: String, default: null },
  pricingRevision: { type: String, default: null },
  complete: { type: Boolean, default: false },
  at: { type: Date, default: null },
}, { _id: false });

const attemptSchema = new Schema({
  studentId: { type: ObjectId, ref: "User", required: true },
  interviewId: { type: ObjectId, ref: "AIInterview", required: true },
  snapshotRevision: { type: Number, required: true },
  mode: { type: String, enum: ["practice", "adaptive", "mock"], default: "practice" },
  assignmentId: { type: ObjectId, default: null },
  bookingId: { type: ObjectId, default: null },
  title: String,
  role: String,
  companyName: String,
  language: { type: String, enum: ["English", "Hindi", "Hinglish"], default: "English" },
  // in_progress -> completed (awaiting evaluation) -> evaluating -> ready | failed; abandoned / expired keep partial items.
  status: {
    type: String,
    enum: ["in_progress", "completed", "evaluating", "ready", "failed", "abandoned", "expired"],
    default: "in_progress",
  },
  endReason: { type: String, default: null },
  startedAt: { type: Date, default: Date.now },
  endedAt: { type: Date, default: null },
  hardDeadline: { type: Date, required: true },
  // Chosen once at start and never changed. Rows written before hybrid existed have no value: Live.
  runtimeMode: { type: String, enum: RUNTIME_MODES, default: "live" },
  durationMinutes: { type: Number, default: undefined },
  liveCapSeconds: { type: Number, default: undefined },
  cost: { type: costSchema, default: undefined },
  totalQuestions: { type: Number, default: 0 },
  items: { type: [itemSchema], default: [] },
  // The published rubric at start ([{id, name, weight, description}]), so later edits never change a report.
  rubricSnapshot: { type: [Schema.Types.Mixed], default: [] },
  // An abandoned or expired attempt is still scored; this keeps that fact once its status moves on.
  partial: { type: Boolean, default: false },
  overall: { type: Schema.Types.Mixed, default: undefined },
  bySection: { type: [Schema.Types.Mixed], default: undefined },
  byCompetency: { type: [Schema.Types.Mixed], default: undefined },
  byRubric: { type: [Schema.Types.Mixed], default: undefined },
  actionItems: { type: [String], default: undefined },
  // Report v2, kept beside `overall` (whose shape is unchanged): {functional, nonFunctional, dimensions,
  // summary, summarySource: "model"|"code"}; responses merge it into `overall`. Skills: [{name, score, stars, note}].
  insights: { type: Schema.Types.Mixed, default: undefined },
  skills: { type: [Schema.Types.Mixed], default: undefined },
  flags: { type: [String], default: [] },
  resumeConsent: { type: Boolean, default: false },
  // Where the resume used for questions came from: "builder" (saved Resume Builder) or "upload" (redacted text).
  resumeSource: { type: String, enum: ["builder", "upload"], default: null },
  // The terms the student accepted before starting, as they read them, and when.
  termsText: { type: String, default: undefined },
  termsAcceptedAt: { type: Date, default: null },
  // The unscored warm-up conversation before Question 1 (admin report only).
  warmup: { type: String, default: "" },
  // Proctored attempts only: {settings, events: [{type, at, questionN}] (at most 200), counts, violations,
  // endedForViolations}. Admins see all of it, students the counts; it never changes a score.
  proctoring: { type: Schema.Types.Mixed, default: undefined },
  eval:{ type: Schema.Types.Mixed, default: undefined },
  // Evaluation outbox: {status: pending|processing|failed|done, attempts, nextAttemptAt, leaseToken, leaseUntil, lastError,
  // judged: {qid: judgement} kept between batches so a retry re-judges only the missing qids}.
  pendingWork: { type: Schema.Types.Mixed, default: undefined },
  visibleToStudentAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

attemptSchema.index({ studentId: 1, interviewId: 1, startedAt: -1 });
// At most one in-progress attempt per student and interview: a second start resumes it.
attemptSchema.index({ studentId: 1, interviewId: 1 },
  { unique: true, partialFilterExpression: { status: "in_progress" }, name: "anvi_one_active_attempt" });
attemptSchema.index({ status: 1, hardDeadline: 1 });
attemptSchema.index({ "pendingWork.status": 1, "pendingWork.nextAttemptAt": 1 }, { name: "anvi_pending_work" });
// Admin reports list attempts per interview, newest first.
attemptSchema.index({ interviewId: 1, startedAt: -1 });
// Cohort reports, the assignment filter and assigned-attempt lookups read attempts by assignment. Same
// name and options as migrations/create-anvi-indexes.js, so autoIndex and the migration agree.
attemptSchema.index({ assignmentId: 1, studentId: 1 },
  { name: "anvi_attempt_assignment", partialFilterExpression: { assignmentId: { $type: "objectId" } } });

// Temporary runtime state for resume after a reload or network drop. Deleted when the interview ends;
// the TTL index removes anything left behind.
const liveSessionSchema = new Schema({
  attemptId: { type: ObjectId, required: true, unique: true },
  studentId: { type: ObjectId, required: true },
  plan: { type: [planItemSchema], default: [] },
  persona: { type: Schema.Types.Mixed, default: {} },
  rules: { type: Schema.Types.Mixed, default: {} },
  // intro -> asking -> closing -> done
  phase: { type: String, default: "intro" },
  cursor: { type: Number, default: 0 },
  followUpsUsed: { type: Number, default: 0 },
  candidateTurnsOnQuestion: { type: Number, default: 0 },
  nudgesOnQuestion: { type: Number, default: 0 },
  answers: { type: Schema.Types.Mixed, default: {} },
  // The warm-up conversation so far ("Candidate: ..." / "ANVI: ..." lines), copied to the attempt at the end.
  warmupTranscript: { type: String, default: "" },
  // Proctoring log so far (see anviInterview.proctoring.js), copied to the attempt at the end; the settings
  // are rules.proctoring.
  proctoring: { type: Schema.Types.Mixed, default: undefined },
  leaseToken: { type: String, default: null },
  // The page holding (or last holding) the lease: { clientId, releasedAt } (releasedAt null while held, or when
  // its process went away). Lets any instance tell the same page reconnecting from a refresh.
  holder: { type: Schema.Types.Mixed, default: undefined },
  // Set while the holder waits for transcripts before finalising; joins are refused meanwhile.
  finalizingAt: { type: Date, default: null },
  // Live seconds charged so far (hybrid escalation ticks), the budget mirror ({usd, inr, liveSeconds, mode,
  // revision}, raised with $max) and the hybrid turn loop: {turn: {turnId, qid, kind, assetIds, status,
  // issuedAt}, turnState, inputMode, segments (at most HYBRID_SEGMENT_LIMIT: {segmentId, turnId, audioHash,
  // qid, seconds}), summary, followUpsByQ, clarifiesByQ, repeatsByQ, emptyStreak, lastDecision}.
  liveSecondsUsed: { type: Number, default: 0 },
  budget: { type: Schema.Types.Mixed, default: undefined },
  hybrid: { type: Schema.Types.Mixed, default: undefined },
  lastActivityAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { timestamps: true, minimize: false });

liveSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "anvi_live_ttl" });

// A student's resume for one interview (practice) or one assignment (scheduled), as redacted plain text only:
// uploaded files are never stored, and the TTL index removes the text after `expiresAt`.
const resumeContextSchema = new Schema({
  studentId: { type: ObjectId, required: true },
  interviewId: { type: ObjectId, required: true },
  // null for practice; a scheduled interview keeps its own resume per assignment.
  assignmentId: { type: ObjectId, default: null },
  source: { type: String, enum: ["builder", "upload"], required: true },
  text: { type: String, required: true, maxlength: 12000 },
  // The compact structured profile extracted once per (contentHash, prompt version, model); it expires
  // with the text.
  contentHash: { type: String, default: undefined },
  profile: { type: Schema.Types.Mixed, default: undefined },
  profilePromptVersion: { type: String, default: undefined },
  profileModel: { type: String, default: undefined },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

resumeContextSchema.index({ studentId: 1, interviewId: 1, assignmentId: 1 }, { unique: true, name: "anvi_resume_owner" });
resumeContextSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "anvi_resume_ttl" });

export const AnviAttempt = tenantModel(mongoose.model("AnviAttempt", attemptSchema));
export const AnviLiveSession = tenantModel(mongoose.model("AnviLiveSession", liveSessionSchema));
export const AnviResumeContext = tenantModel(mongoose.model("AnviResumeContext", resumeContextSchema));
export const ANVI_MODELS = [AnviAttempt, AnviLiveSession];
// Kept separate so the index migration names the resume store explicitly (its TTL deletes student data).
export const ANVI_RESUME_MODELS = [AnviResumeContext];
