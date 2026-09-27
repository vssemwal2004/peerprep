import { Router } from "express";
import { requireAuth, requireFullStudent, requireStudent } from "../middleware/auth.js";
import { forwardInterviewRequest, forwardInterviewMedia } from "../services/interviewServiceClient.js";

const router = Router();
router.use(requireAuth, requireFullStudent, requireStudent);
router.get("/", forwardInterviewRequest);
router.post("/:id/start", forwardInterviewRequest);
router.get("/sessions/:id", forwardInterviewRequest);
router.get("/sessions/:id/question-audio", forwardInterviewMedia);
router.post("/sessions/:id/transcribe", forwardInterviewMedia);
router.post("/sessions/:id/answer", forwardInterviewRequest);
export default router;
