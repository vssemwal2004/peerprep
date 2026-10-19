import { Router } from "express";
import { requireAuth, requireFullStudent, requireStudent } from "../middleware/auth.js";
import { requireCoins } from "../middleware/requireCoins.js";
import { forwardInterviewRequest, forwardInterviewMedia } from "../services/interviewServiceClient.js";
import { aiInterviewStarted } from "../services/coinEntitlements.js";

const router = Router();
router.use(requireAuth, requireFullStudent, requireStudent);
router.get("/", forwardInterviewRequest);
// Starting a new AI interview can cost Prep Coins; resuming one already started never does.
router.post("/:id/start", requireCoins("ai_interview.start", {
  resourceKey: (req) => req.params.id,
  alreadyEntitled: (req) => aiInterviewStarted(req.user, req.params.id),
  verify: (req) => aiInterviewStarted(req.user, req.params.id),
}), forwardInterviewRequest);
router.get("/sessions/:id", forwardInterviewRequest);
router.get("/sessions/:id/question-audio", forwardInterviewMedia);
router.post("/sessions/:id/transcribe", forwardInterviewMedia);
router.post("/sessions/:id/answer", forwardInterviewRequest);
export default router;
