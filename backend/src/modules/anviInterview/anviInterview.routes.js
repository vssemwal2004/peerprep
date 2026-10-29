import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAuth, requireFullStudent, requireStudent } from "../../middleware/auth.js";
import { requireCoins } from "../../middleware/requireCoins.js";
import { aiInterviewStarted } from "../../services/coinEntitlements.js";
import { asyncRoute } from "../../routes/aiInterviews.js";
import { HttpError } from "../../utils/errors.js";
import { createAnviService, validAnviId } from "./anviInterview.service.js";
import { RESUME_UPLOAD_BYTES, createAnviResumeService } from "./anviInterview.resume.js";
import { MAX_AUDIO_BYTES } from "./anviInterview.audioStorage.js";

// Upper bound on one streamed question clip (the storage read is capped at the same size).
const MAX_CLIP_BYTES = MAX_AUDIO_BYTES;

// Rejects malformed ids before any Prep Coin charge is attempted.
const validId = (req, _res, next) =>
  validAnviId(req.params.id) ? next() : next(new HttpError(400, "Invalid identifier.", { code: "INVALID_IDENTIFIER" }));
const validAssignment = (req, _res, next) =>
  validAnviId(req.params.aid) ? next() : next(new HttpError(400, "Invalid identifier.", { code: "INVALID_IDENTIFIER" }));
// What a start request says about the terms, the saved resume and the interview language the student chose
// (optional; the service refuses one the interview does not allow with 400 LANGUAGE_NOT_ALLOWED).
const startOptions = (req) => ({
  resumeConsent: req.body?.resumeConsent === true,
  termsAccepted: req.body?.termsAccepted === true,
  language: req.body?.language,
  signal: req.abortSignal || null,
});

// A resume is one file in memory (field "file"), never written to disk.
const resumeUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: RESUME_UPLOAD_BYTES, files: 1, fields: 2, fieldSize: 100, parts: 4 } }).single("file");
const acceptResume = (req, res, next) => resumeUpload(req, res, (error) => {
  if (!error) return next();
  if (error instanceof multer.MulterError) {
    return next(error.code === "LIMIT_FILE_SIZE"
      ? new HttpError(413, "Upload a resume of 5 MB or less.", { code: "RESUME_TOO_LARGE" })
      : new HttpError(400, "Upload one resume file in the \"file\" field.", { code: "RESUME_UPLOAD_INVALID" }));
  }
  return next(error);
});

export function createAnviStudentRouter(authenticate = requireAuth, deps = {}) {
  const service = deps.service || createAnviService(deps);
  const resumes = deps.resumes || createAnviResumeService(deps);
  const started = (req) => aiInterviewStarted(req.user, req.params.id);
  // requireCoins settles an aborted or timed-out start at once; waiting for the handler first means the
  // charge is refunded only if no attempt was created (startAttempt stops before creating one on abort).
  const startedAfterHandler = async (req) => {
    await req.anviStartWork?.catch(() => {});
    return started(req);
  };
  // A blocked practice start, missing terms acceptance or a missing required resume is refused before any
  // Prep Coin charge.
  const practiceOpen = asyncRoute(async (req, _res, next) => {
    await service.assertPracticeAllowed?.(req.params.id);
    await service.assertPracticeStartReady?.(req.user, req.params.id, startOptions(req));
    next();
  });
  // A scheduled start that the server does not allow right now is refused before requireCoins, so it is
  // never charged and the student sees the real reason (not yet open, no booking, attempts used).
  const assignedGate = asyncRoute(async (req, _res, next) => {
    const gate = await service.assignedStartGate(req.user, req.params.aid);
    if (!gate.ok) throw new HttpError(gate.status, gate.message, { code: gate.code });
    req.anviAssignedGate = gate;
    next();
  });
  // Uploads are read with Gemini: a few per student every 10 minutes.
  const resumeLimit = rateLimit({
    windowMs: 10 * 60 * 1000, limit: Number(deps.resumeLimit) || 10, keyGenerator: (req) => String(req.user._id),
    standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "Too many resume uploads. Wait a few minutes and try again.", { code: "RATE_LIMITED" })),
  });
  // Clip fallback reads: generous for one interview (a few per question), bounded per student.
  const audioLimit = rateLimit({
    windowMs: 60 * 1000, limit: Number(deps.audioLimit) || 120, keyGenerator: (req) => String(req.user._id),
    standardHeaders: true, legacyHeaders: false,
    handler: (_req, _res, next) => next(new HttpError(429, "Too many audio requests. Wait a moment and try again.", { code: "RATE_LIMITED" })),
  });
  const saveResume = (ref) => async (req, res) => {
    res.status(201).json(await resumes.saveResume(req.user, ref(req), { source: req.body?.source, file: req.file || null }));
  };
  const practiceRef = (req) => ({ interviewId: req.params.id });
  const assignedRef = (req) => ({ assignmentId: req.params.aid });
  const router = Router();
  router.use(asyncRoute(authenticate), requireFullStudent, requireStudent);
  router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  router.get("/", asyncRoute(async (req, res) => res.json(await service.listStudentInterviews(req.user))));
  // An interview the student's institution scheduled is free; startAssignedAttempt re-checks the gate.
  router.post("/assignments/:aid/start", validAssignment, assignedGate, requireCoins("ai_interview.start", {
    resourceKey: (req) => String(req.anviAssignedGate?.assignment?.interviewId || req.anviAssignedGate?.resume?.interviewId || req.params.aid),
    exempt: (req) => req.anviAssignedGate?.ok === true,
  }), asyncRoute(async (req, res) => {
    res.status(201).json(await service.startAssignedAttempt(req.user, req.params.aid, startOptions(req)));
  }));
  // The resume for a scheduled interview (also at booking time): {source:"builder"} or a multipart "file".
  router.post("/assignments/:aid/resume", validAssignment, resumeLimit, acceptResume, asyncRoute(saveResume(assignedRef)));
  router.get("/assignments/:aid/resume", validAssignment, asyncRoute(async (req, res) => res.json(await resumes.getResume(req.user, assignedRef(req)))));
  router.delete("/assignments/:aid/resume", validAssignment, asyncRoute(async (req, res) => res.json(await resumes.deleteResume(req.user, assignedRef(req)))));
  // Starting a new AI interview can cost Prep Coins; resuming one already started never does.
  router.post("/:id/start", validId, practiceOpen, requireCoins("ai_interview.start", {
    resourceKey: (req) => req.params.id,
    alreadyEntitled: started,
    verify: startedAfterHandler,
  }), asyncRoute(async (req, res) => {
    req.anviStartWork = service.startAttempt(req.user, req.params.id, startOptions(req));
    res.status(201).json(await req.anviStartWork);
  }));
  router.post("/:id/resume", validId, resumeLimit, acceptResume, asyncRoute(saveResume(practiceRef)));
  router.get("/:id/resume", validId, asyncRoute(async (req, res) => res.json(await resumes.getResume(req.user, practiceRef(req)))));
  router.delete("/:id/resume", validId, asyncRoute(async (req, res) => res.json(await resumes.deleteResume(req.user, practiceRef(req)))));
  router.get("/attempts/:id", validId, asyncRoute(async (req, res) => res.json(await service.getAttemptForStudent(req.user, req.params.id))));
  router.post("/attempts/:id/end", validId, asyncRoute(async (req, res) => res.json(await service.endAttemptRest(req.user, req.params.id))));
  // One question clip of the student's running hybrid attempt (fallback for the socket's anvi:clip). Anything
  // not theirs, not running, or not authorized for the attempt is a plain 404; there is no listing route.
  router.get("/attempts/:id/audio/:assetId", validId, audioLimit, asyncRoute(async (req, res) => {
    const clip = validAnviId(req.params.assetId) ? await service.attemptAudio?.(req.user, req.params.id, req.params.assetId) : null;
    if (!clip?.wav || clip.wav.length > MAX_CLIP_BYTES) throw new HttpError(404, "Audio not found.", { code: "NOT_FOUND" });
    res.set({ "Content-Type": "audio/wav", "Content-Length": String(clip.wav.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.end(clip.wav);
  }));
  return router;
}
