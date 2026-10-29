import mongoose from "mongoose";
import AIInterview from "../../models/AIInterview.js";
import User from "../../models/User.js";
import { HttpError } from "../../utils/errors.js";
import { anviConfig } from "./anviInterview.config.js";
import { AnviAttempt } from "./anviInterview.models.js";
import { cohortForAttempt, evaluateAttemptSoon, itemInsightFields, reportOverall, reportSkills } from "./anviInterview.evaluation.js";
import { anviPricing } from "./anviInterview.pricing.js";
import { studentQuestionText } from "./anviInterview.prompts.js";
import { USAGE_RETENTION_DAYS, summarizeUsage } from "./anviInterview.usage.js";

// Admin reports over ANVI attempts. An admin sees only attempts of interviews they own (the same
// ownerId scoping as the authoring routes); unlike the student view, the authored answer is included.
const STATUSES = new Set(["in_progress", "completed", "evaluating", "ready", "failed", "abandoned", "expired"]);
const HISTORY_LIMIT = 5;
const MAX_OWNED_INTERVIEWS = 500;
const ROW_FIELDS = "studentId interviewId assignmentId mode title status partial endReason startedAt endedAt totalQuestions overall proctoring.violations proctoring.endedForViolations";
// Cohort reports read at most this many targets and attempts (the cohort cap is 2000 students).
const COHORT_LIMIT = 5000;
const OUTCOMES = ["pending", "booked", "in_progress", "completed", "no_show", "missed", "cancelled"];
const BANDS = ["Excellent", "Good", "Fair", "Needs work"];
const WEAK_POINTS = 10;
const DAY_MS = 24 * 60 * 60_000;
const USAGE_DEFAULT_DAYS = 30;
// Usage rows expire after the retention period, so a longer range would only look incomplete.
const USAGE_MAX_DAYS = USAGE_RETENTION_DAYS;
const COHORT_ATTEMPT_FIELDS ="studentId status partial startedAt endedAt overall byCompetency items.n items.questionText items.competency items.expectedKeyPoints items.matched items.partial items.missed proctoring.violations proctoring.endedForViolations";

// Loaded on first use; tests pass `models` instead.
let schedulingModels;
const loadSchedulingModels = () => (schedulingModels ||= import("./anviInterview.scheduling.models.js"));

const IST = { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" };
const istTime = (value) => (value ? `${new Date(value).toLocaleString("en-IN", IST)} IST` : "");
const csvCell = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // A leading = + - @ (or a tab or carriage return before one) would run as a formula in spreadsheet
  // apps; the same prefixes as the roster export.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
const average = (values) => (values.length ? Math.round(values.reduce((total, value) => total + value, 0) / values.length) : null);
const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
};
const normalizedPoint = (point) => String(point || "").replace(/\s+/g, " ").trim().toLowerCase();
// The question as the candidate's own report shows it: the stored text is already ANVI's captured wording
// when there is one, else a topic item's plan instruction, which is rewritten the same way as for students.
// The raw plan text stays available to admins as `planText` only when it differs.
const questionFieldsOf = (item) => {
  const raw = String(item?.questionText || "");
  const questionText = studentQuestionText(raw);
  return questionText === raw ? { questionText } : { questionText, planText: raw };
};

const fail = (status, code, message) => { throw new HttpError(status, message, { code }); };
const objectId = (value, label) => {
  if (!mongoose.isValidObjectId(value) || !/^[a-f0-9]{24}$/i.test(String(value))) fail(400, "INVALID_IDENTIFIER", `Invalid ${label}.`);
  return new mongoose.Types.ObjectId(String(value));
};
// A YYYY-MM-DD value is an IST calendar day: `from` is its start and `to` the start of the next day.
const dateBound = (value, edge) => {
  const text = String(value).trim();
  const day = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const at = new Date(day ? `${text}T00:00:00+05:30` : text);
  if (text.length > 40 || Number.isNaN(at.getTime())) fail(400, "INVALID_DATE", `Invalid \`${edge}\` date.`);
  return day && edge === "to" ? new Date(at.getTime() + DAY_MS) : at;
};
const pageOf = (query = {}) => ({
  page: Math.max(1, Math.min(10000, Number.parseInt(query.page, 10) || 1)),
  limit: [25, 50, 100].includes(Number(query.limit)) ? Number(query.limit) : 25,
});
const studentOf = (user) => ({ id: user ? String(user._id) : null, name: user?.name || "Unknown student", email: user?.email || "", studentId: user?.studentId || "" });
const overallOf = (overall) => (overall ? {
  score: overall.score ?? 0, max: overall.max ?? 0, percent: overall.percent ?? 0, band: overall.band || "", partial: Boolean(overall.partial),
  answered: overall.answered ?? 0, total: overall.total ?? 0,
} : null);

// `models` ({ AnviAssignment, AnviAssignmentTarget, AnviBooking }) replaces the scheduling models in tests;
// `config` replaces the env configuration (usage prices) and `pricing` the env modality-aware pricing.
export function createAnviReports({ evaluateSoon = evaluateAttemptSoon, clock = Date, models, config, pricing } = {}) {
  const now = () => new Date(clock.now());
  const scheduling = async () => models || loadSchedulingModels();

  // The attempt, only when its interview belongs to this admin; anything else is a 404.
  async function ownedAttempt(admin, attemptId) {
    const attempt = await AnviAttempt.findById(objectId(attemptId, "attempt")).lean();
    if (!attempt) fail(404, "ATTEMPT_NOT_FOUND", "Interview attempt not found.");
    const interview = await AIInterview.findOne({ _id: attempt.interviewId, ownerId: admin._id }).select("title companyName").lean();
    if (!interview) fail(404, "ATTEMPT_NOT_FOUND", "Interview attempt not found.");
    return { attempt, interview };
  }

  async function listAttempts(admin, query = {}) {
    const { page, limit } = pageOf(query);
    const status = String(query.status || "");
    if (status && !STATUSES.has(status)) fail(400, "INVALID_STATUS", "Unknown attempt status.");
    // The filter list shows the most recent interviews; the attempt filter covers every owned interview.
    const interviews = await AIInterview.find({ ownerId: admin._id }).select("title").sort({ updatedAt: -1, _id: -1 })
      .limit(MAX_OWNED_INTERVIEWS).maxTimeMS(8000).lean();
    let ids;
    if (query.interviewId) {
      const wanted = objectId(query.interviewId, "interview");
      if (!interviews.some((row) => row._id.equals(wanted))) {
        if (!(await AIInterview.exists({ _id: wanted, ownerId: admin._id }))) fail(404, "INTERVIEW_NOT_FOUND", "Interview not found.");
      }
      ids = [wanted];
    } else {
      ids = interviews.length < MAX_OWNED_INTERVIEWS
        ? interviews.map((row) => row._id)
        : await AIInterview.distinct("_id", { ownerId: admin._id }).maxTimeMS(8000);
    }
    // An assignment filter can only narrow the admin's own interviews, so another admin's id lists nothing.
    const assignmentId = query.assignmentId ? objectId(query.assignmentId, "assignment") : null;
    const filter = { interviewId: { $in: ids }, ...(status ? { status } : {}), ...(assignmentId ? { assignmentId } : {}) };
    const [total, rows] = await Promise.all([
      AnviAttempt.countDocuments(filter).maxTimeMS(8000),
      AnviAttempt.find(filter).select(ROW_FIELDS).sort({ startedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).maxTimeMS(8000).lean(),
    ]);
    const users = rows.length
      ? await User.find({ _id: { $in: [...new Set(rows.map((row) => String(row.studentId)))] } }).select("name email studentId").lean()
      : [];
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const titleById = new Map(interviews.map((row) => [String(row._id), row.title]));
    return {
      attempts: rows.map((row) => ({
        attemptId: String(row._id),
        student: studentOf(userById.get(String(row.studentId))),
        interviewId: String(row.interviewId),
        interviewTitle: titleById.get(String(row.interviewId)) || row.title || "AI interview",
        assignmentId: row.assignmentId ? String(row.assignmentId) : null,
        mode: row.mode || "practice",
        status: row.status,
        partial: Boolean(row.partial),
        endReason: row.endReason || null,
        startedAt: row.startedAt,
        endedAt: row.endedAt,
        totalQuestions: row.totalQuestions || 0,
        overall: overallOf(row.overall),
        // null for an attempt that was not proctored.
        violations: row.proctoring ? Number(row.proctoring.violations) || 0 : null,
      })),
      interviews: interviews.map((row) => ({ id: String(row._id), title: row.title || "Untitled interview" })),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async function getAttempt(admin, attemptId) {
    const { attempt, interview } = await ownedAttempt(admin, attemptId);
    const [user, cohort] = await Promise.all([
      User.findById(attempt.studentId).select("name email studentId").lean(),
      attempt.status === "ready" ? cohortForAttempt(attempt) : null,
    ]);
    const history = Array.isArray(attempt.eval?.history) ? attempt.eval.history : [];
    return {
      attemptId: String(attempt._id),
      student: studentOf(user),
      interviewId: String(attempt.interviewId),
      interviewTitle: interview.title || attempt.title || "AI interview",
      title: attempt.title || interview.title || "",
      role: attempt.role || "",
      // The company as the attempt started (older attempts: the interview's current one).
      companyName: attempt.companyName || interview.companyName || "",
      language: attempt.language,
      mode: attempt.mode,
      assignmentId: attempt.assignmentId ? String(attempt.assignmentId) : null,
      status: attempt.status,
      partial: Boolean(attempt.partial),
      endReason: attempt.endReason || null,
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      totalQuestions: attempt.totalQuestions || 0,
      snapshotRevision: attempt.snapshotRevision,
      rubricSnapshot: attempt.rubricSnapshot || [],
      // Report v2 fields (functional, nonFunctional, dimensions, summary) are merged in when present.
      overall: reportOverall(attempt),
      skills: reportSkills(attempt),
      // The same aggregate the student sees: other students only, null under five.
      cohort,
      bySection: attempt.bySection || [],
      byCompetency: attempt.byCompetency || [],
      byRubric: attempt.byRubric || [],
      actionItems: attempt.actionItems || [],
      flags: attempt.flags || [],
      // The unscored warm-up conversation, the accepted terms and where the resume came from.
      warmup: attempt.warmup || "",
      termsAcceptedAt: attempt.termsAcceptedAt || null,
      resumeSource: attempt.resumeSource || null,
      // Proctored attempts: settings, the event log, counts and violations (flags only, never in the score).
      proctoring: attempt.proctoring || null,
      eval: attempt.eval ? {
        modelId: attempt.eval.modelId || "", promptVersion: attempt.eval.promptVersion || "", rubricVersion: attempt.eval.rubricVersion || "",
        scoredAt: attempt.eval.scoredAt || null, attempts: attempt.eval.attempts || 0, calls: attempt.eval.calls || 0,
        history: history.map((entry) => ({ scoredAt: entry.scoredAt || null, replacedAt: entry.replacedAt || null, promptVersion: entry.promptVersion || "", overall: overallOf(entry.overall) })),
      } : null,
      pendingWork: attempt.pendingWork ? {
        status: attempt.pendingWork.status, attempts: attempt.pendingWork.attempts || 0,
        nextAttemptAt: attempt.pendingWork.nextAttemptAt || null, lastError: attempt.pendingWork.lastError || "",
      } : null,
      items: (attempt.items || []).map((item) => ({
        qid: item.qid,
        n: item.n,
        sectionName: item.sectionName || "",
        competency: item.competency || "",
        ...questionFieldsOf(item),
        followUpsAsked: item.followUpsAsked || [],
        answerText: item.answerText || "",
        answerSource: item.answerSource,
        answerSeconds: item.answerSeconds || 0,
        status: item.status,
        expectedAnswer: item.expectedAnswer || "",
        expectedKeyPoints: item.expectedKeyPoints || [],
        matched: item.matched || [],
        partial: item.partial || [],
        missed: item.missed || [],
        marks: item.marks ?? null,
        maxMarks: item.maxMarks ?? 10,
        percentCorrect: item.percentCorrect ?? null,
        feedback: item.feedback || "",
        strengths: item.strengths || [],
        improvements: item.improvements || [],
        rubric: item.rubric || [],
        metrics: item.metrics || null,
        flags: item.flags || [],
        ...itemInsightFields(item),
      })),
    };
  }

  // Queues a fresh evaluation and keeps the previous one (last five) in eval.history.
  async function reEvaluate(admin, attemptId) {
    const { attempt } = await ownedAttempt(admin, attemptId);
    const at = now();
    if (attempt.status === "in_progress") fail(409, "ATTEMPT_IN_PROGRESS", "This interview is still in progress.");
    const work = attempt.pendingWork || {};
    if (["pending", "processing"].includes(work.status) && !(work.status === "processing" && new Date(work.leaseUntil) <= at)) {
      fail(409, "EVALUATION_RUNNING", "This attempt is already being evaluated.");
    }
    const history = Array.isArray(attempt.eval?.history) ? [...attempt.eval.history] : [];
    if (attempt.overall) {
      history.push({
        scoredAt: attempt.eval?.scoredAt || null,
        replacedAt: at,
        replacedBy: admin._id,
        modelId: attempt.eval?.modelId || "",
        promptVersion: attempt.eval?.promptVersion || "",
        rubricVersion: attempt.eval?.rubricVersion || "",
        overall: attempt.overall,
        bySection: attempt.bySection || [],
        byCompetency: attempt.byCompetency || [],
        actionItems: attempt.actionItems || [],
        items: (attempt.items || []).map((item) => ({
          qid: item.qid, marks: item.marks, maxMarks: item.maxMarks, percentCorrect: item.percentCorrect, feedback: item.feedback,
          matched: item.matched, partial: item.partial, missed: item.missed,
        })),
      });
    }
    // Matching updatedAt makes two admins (or an admin and a finishing worker) unable to both win.
    const result = await AnviAttempt.updateOne({ _id: attempt._id, updatedAt: attempt.updatedAt }, {
      $set: {
        status: "evaluating",
        partial: Boolean(attempt.partial) || ["abandoned", "expired"].includes(attempt.status),
        pendingWork: { status: "pending", attempts: 0, nextAttemptAt: at },
        "eval.history": history.slice(-HISTORY_LIMIT),
        "eval.revision": (Number(attempt.eval?.revision) || 0) + 1,
      },
    });
    if (!result.modifiedCount) fail(409, "ATTEMPT_CHANGED", "This attempt changed. Refresh and try again.");
    evaluateSoon?.(attempt._id);
    return getAttempt(admin, attemptId);
  }

  // The assignment, only when its interview belongs to this admin; anything else is a 404.
  async function ownedAssignment(admin, assignmentId) {
    const { AnviAssignment } = await scheduling();
    const assignment = await AnviAssignment.findById(objectId(assignmentId, "assignment"))
      .select("interviewId title role mode status window reportVisibility releasedAt").lean();
    if (!assignment) fail(404, "ASSIGNMENT_NOT_FOUND", "Schedule not found.");
    const interview = await AIInterview.findOne({ _id: assignment.interviewId, ownerId: admin._id }).select("title").lean();
    if (!interview) fail(404, "ASSIGNMENT_NOT_FOUND", "Schedule not found.");
    return { assignment, interview };
  }

  // Current cohort (removed students are left out) and, per student, the latest scored attempt.
  async function cohortOf(admin, assignmentId) {
    const { assignment, interview } = await ownedAssignment(admin, assignmentId);
    const { AnviAssignmentTarget } = await scheduling();
    const [targets, attempts] = await Promise.all([
      AnviAssignmentTarget.find({ assignmentId: assignment._id, status: "assigned" })
        .select("studentId outcome attemptsUsed lastAttemptId").sort({ _id: 1 }).limit(COHORT_LIMIT).maxTimeMS(8000).lean(),
      AnviAttempt.find({ assignmentId: assignment._id }).select(COHORT_ATTEMPT_FIELDS)
        .sort({ startedAt: -1, _id: -1 }).limit(COHORT_LIMIT).maxTimeMS(8000).lean(),
    ]);
    const cohort = new Set(targets.map((target) => String(target.studentId)));
    const latest = new Map();
    const scored = new Map();
    for (const attempt of attempts) {
      const key = String(attempt.studentId);
      if (!cohort.has(key)) continue;
      if (!latest.has(key)) latest.set(key, attempt);
      if (!scored.has(key) && attempt.status === "ready" && attempt.overall) scored.set(key, attempt);
    }
    return { assignment, interview, targets, latest, scored };
  }

  async function assignmentSummary(admin, assignmentId) {
    const { assignment, interview, targets, latest, scored } = await cohortOf(admin, assignmentId);
    const outcomes = Object.fromEntries(OUTCOMES.map((outcome) => [outcome, 0]));
    for (const target of targets) if (target.outcome in outcomes) outcomes[target.outcome] += 1;
    const rows = [...scored.values()];
    const percents = rows.map((attempt) => Number(attempt.overall.percent) || 0);
    const distribution = Array.from({ length: 10 }, (_, index) => ({
      label: index === 9 ? "90–100" : `${index * 10}–${index * 10 + 9}`, from: index * 10, to: index === 9 ? 100 : index * 10 + 9, count: 0,
    }));
    for (const percent of percents) distribution[Math.min(9, Math.max(0, Math.floor(percent / 10)))].count += 1;
    const bands = BANDS.map((band) => ({ band, count: rows.filter((attempt) => attempt.overall.band === band).length }));
    const competencies = new Map();
    for (const attempt of rows) {
      for (const entry of attempt.byCompetency || []) {
        if (!entry?.name || !Number.isFinite(Number(entry.percent))) continue;
        const values = competencies.get(entry.name) || [];
        values.push(Number(entry.percent));
        competencies.set(entry.name, values);
      }
    }
    // A key point counts once per student (its best verdict when two questions share it): missed is no
    // credit, partial half, matched full. `seen` is therefore a number of students.
    const RANK = { missed: 0, partial: 1, matched: 2 };
    const points = new Map();
    for (const attempt of rows) {
      const best = new Map();
      for (const item of attempt.items || []) {
        const verdictOf = (point) => {
          const key = normalizedPoint(point);
          if ((item.matched || []).some((entry) => normalizedPoint(entry) === key)) return "matched";
          if ((item.partial || []).some((entry) => normalizedPoint(entry) === key)) return "partial";
          return "missed";
        };
        for (const point of item.expectedKeyPoints || []) {
          const key = normalizedPoint(point);
          if (!key) continue;
          const verdict = verdictOf(point);
          if (!best.has(key) || RANK[verdict] > RANK[best.get(key).verdict]) best.set(key, { verdict, point, item });
        }
      }
      for (const [key, { verdict, point, item }] of best) {
        const row = points.get(key) || { point: String(point).trim(), questionText: studentQuestionText(item.questionText), competency: item.competency || "", seen: 0, matched: 0, partial: 0, missed: 0 };
        row.seen += 1;
        row[verdict] += 1;
        points.set(key, row);
      }
    }
    const weakestKeyPoints = [...points.values()]
      .map((row) => ({ ...row, missRate: Math.round((100 * (row.missed + row.partial / 2)) / row.seen) }))
      .filter((row) => row.missRate > 0)
      .sort((a, b) => b.missRate - a.missRate || b.seen - a.seen || a.point.localeCompare(b.point))
      .slice(0, WEAK_POINTS);
    return {
      assignment: {
        id: String(assignment._id),
        title: assignment.title || interview.title || "AI interview",
        interviewId: String(assignment.interviewId),
        interviewTitle: interview.title || "",
        mode: assignment.mode || "mock",
        status: assignment.status,
        window: assignment.window || null,
        reportVisibility: assignment.reportVisibility || "after_close",
        releasedAt: assignment.releasedAt || null,
      },
      kpis: {
        assigned: targets.length,
        outcomes,
        started: latest.size,
        scored: rows.length,
        averagePercent: average(percents),
        medianPercent: median(percents),
        completionRate: targets.length ? Math.round((100 * outcomes.completed) / targets.length) : 0,
      },
      distribution,
      bands,
      competencies: [...competencies].map(([name, values]) => ({ name, percent: average(values), students: values.length }))
        .sort((a, b) => a.percent - b.percent || a.name.localeCompare(b.name)),
      weakestKeyPoints,
      // Students whose latest attempt has proctoring violations, and those whose attempt ended for them.
      proctoring: {
        flagged: [...latest.values()].filter((attempt) => Number(attempt.proctoring?.violations) > 0).length,
        endedForViolations: [...latest.values()].filter((attempt) => attempt.proctoring?.endedForViolations === true).length,
      },
      generatedAt: now(),
    };
  }

  /** One row per assigned student: outcome, booking and the latest (scored) attempt, times in IST. */
  async function assignmentExport(admin, assignmentId) {
    const { assignment, targets, latest, scored } = await cohortOf(admin, assignmentId);
    const { AnviBooking } = await scheduling();
    const studentIds = targets.map((target) => target.studentId);
    const [users, bookings] = await Promise.all([
      studentIds.length ? User.find({ _id: { $in: studentIds } }).select("name email studentId").maxTimeMS(8000).lean() : [],
      AnviBooking.find({ assignmentId: assignment._id }).select("studentId startsAt status active updatedAt")
        .sort({ active: -1, updatedAt: -1, _id: -1 }).limit(COHORT_LIMIT).maxTimeMS(8000).lean(),
    ]);
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const bookingByStudent = new Map();
    for (const booking of bookings) if (!bookingByStudent.has(String(booking.studentId))) bookingByStudent.set(String(booking.studentId), booking);
    const header = ["Name", "Email", "Student ID", "Outcome", "Attempts used", "Slot (IST)", "Booking status", "Attempt status", "Partial", "Score", "Max", "Percent", "Band", "Started (IST)", "Ended (IST)", "Proctoring violations"];
    const lines = [header];
    for (const target of targets) {
      const key = String(target.studentId);
      const student = studentOf(userById.get(key));
      const booking = bookingByStudent.get(key);
      const attempt = scored.get(key) || latest.get(key);
      const overall = scored.get(key)?.overall;
      lines.push([
        student.name, student.email, student.studentId, target.outcome || "", target.attemptsUsed ?? 0,
        istTime(booking?.startsAt), booking?.status || "", attempt?.status || "", attempt ? (attempt.partial ? "yes" : "no") : "",
        overall?.score ?? "", overall?.max ?? "", overall?.percent ?? "", overall?.band || "", istTime(attempt?.startedAt), istTime(attempt?.endedAt),
        // Blank when the attempt was not proctored.
        attempt?.proctoring ? Number(attempt.proctoring.violations) || 0 : "",
      ]);
    }
    const title = String(assignment.title || "schedule").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "schedule";
    return {
      filename: `anvi-${title}-${assignment._id}.csv`,
      content: Buffer.from(`﻿${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}\r\n`, "utf8"),
    };
  }

  // Gemini usage and estimated cost of the admin's interviews (one, or all they own) in [from, to).
  // A YYYY-MM-DD bound is a whole IST day (`to` inclusive); the default is the last 30 days.
  async function usageReport(admin, query = {}) {
    const to = query.to ? dateBound(query.to, "to") : now();
    const from = query.from ? dateBound(query.from, "from") : new Date(to.getTime() - USAGE_DEFAULT_DAYS * DAY_MS);
    if (from >= to) fail(400, "INVALID_RANGE", "`from` must be before `to`.");
    if (to.getTime() - from.getTime() > USAGE_MAX_DAYS * DAY_MS) fail(400, "INVALID_RANGE", `Choose a range of at most ${USAGE_MAX_DAYS} days.`);
    let ids;
    if (query.interviewId) {
      const wanted = objectId(query.interviewId, "interview");
      if (!(await AIInterview.exists({ _id: wanted, ownerId: admin._id }))) fail(404, "INTERVIEW_NOT_FOUND", "Interview not found.");
      ids = [wanted];
    } else {
      ids = await AIInterview.distinct("_id", { ownerId: admin._id }).maxTimeMS(8000);
    }
    const settings = config || anviConfig();
    // Status, runtime and duration of the attempts in the range (per-attempt figures and percentiles);
    // limited to the admin's interviews like the usage rows themselves.
    const attemptInfo = async (attemptIds) => {
      const rows = await AnviAttempt.find({ _id: { $in: attemptIds.filter((value) => /^[a-f0-9]{24}$/i.test(value)) }, interviewId: { $in: ids } })
        .select("status runtimeMode durationMinutes").maxTimeMS(8000).lean();
      return new Map(rows.map((row) => [String(row._id), { status: row.status, runtimeMode: row.runtimeMode, durationMinutes: row.durationMinutes }]));
    };
    const summary = await summarizeUsage({ interviewId: { $in: ids }, at: { $gte: from, $lt: to } }, {
      prices: settings.prices, currency: settings.priceCurrency, pricing: pricing || anviPricing(), attemptInfo, now,
    });
    const titled = summary.byInterview.length
      ? await AIInterview.find({ _id: { $in: summary.byInterview.map((row) => row.interviewId) } }).select("title").maxTimeMS(8000).lean()
      : [];
    const titles = new Map(titled.map((row) => [String(row._id), row.title || ""]));
    const byInterview = summary.byInterview.map((row) => ({ ...row, title: titles.get(row.interviewId) || "" }));
    return { range: { from, to }, interviewId: query.interviewId ? String(query.interviewId) : null, ...summary, byInterview };
  }

  return { listAttempts, getAttempt, reEvaluate, assignmentSummary, assignmentExport, usageReport };
}
