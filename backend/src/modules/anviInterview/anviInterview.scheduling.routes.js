import { Router } from "express";
import { requireAuth, requireFullStudent, requireStudent } from "../../middleware/auth.js";
import { adminAuthoringOnly, asyncRoute } from "../../routes/aiInterviews.js";
import { anviScheduling } from "./anviInterview.scheduling.service.js";

const noStore = (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); };
const errorMapper = (err, _req, res, next) => {
  if (res.headersSent || !err?.status || err.status >= 500) return next(err);
  const { code, ...details } = err.details || {};
  return res.status(err.status).json({ ...details, code: code || err.code || "REQUEST_FAILED", error: err.message });
};

// Admin scheduling, mounted at /api/ai-interviews/schedules ahead of the authoring router's /:id routes.
export function createAnviSchedulingAdminRouter(authenticate = requireAuth, deps = {}) {
  const service = deps.service || anviScheduling();
  const router = Router();
  router.use(asyncRoute(authenticate), adminAuthoringOnly, noStore);
  router.post("/bookings/:bid/move", asyncRoute(async (req, res) => res.json(await service.adminMoveBooking(req.user, req.params.bid, req.body?.slotId))));
  router.post("/bookings/:bid/cancel", asyncRoute(async (req, res) => res.json(await service.adminCancelBooking(req.user, req.params.bid, req.body || {}))));
  router.get("/", asyncRoute(async (req, res) => res.json(await service.listAssignments(req.user, req.query))));
  // Students across every schedule of one interview (the interview's "View assigned students").
  router.get("/by-interview/:interviewId/targets", asyncRoute(async (req, res) => res.json(await service.listInterviewTargets(req.user, req.params.interviewId, req.query))));
  router.post("/", asyncRoute(async (req, res) => {
    const result = await service.createAssignment(req.user, req.body || {}, { creationKey: req.get("Idempotency-Key") || null });
    res.status(result.created ? 201 : 200).json(result);
  }));
  router.get("/:id", asyncRoute(async (req, res) => res.json(await service.getAssignmentDetail(req.user, req.params.id, req.query))));
  router.patch("/:id", asyncRoute(async (req, res) => {
    const { revision, ...patch } = req.body || {};
    res.json(await service.updateAssignment(req.user, req.params.id, patch, revision));
  }));
  router.get("/:id/slots", asyncRoute(async (req, res) => res.json(await service.listAdminSlots(req.user, req.params.id))));
  router.get("/:id/roster.csv", asyncRoute(async (req, res) => {
    const { filename, content } = await service.rosterCsv(req.user, req.params.id);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  }));
  router.get("/:id/targets", asyncRoute(async (req, res) => res.json(await service.listTargets(req.user, req.params.id, req.query))));
  router.post("/:id/targets", asyncRoute(async (req, res) => res.json(await service.addTargets(req.user, req.params.id, req.body || {}))));
  router.post("/:id/targets/remove", asyncRoute(async (req, res) => res.json(await service.removeTargets(req.user, req.params.id, req.body?.studentIds))));
  router.post("/:id/targets/:studentId/reset", asyncRoute(async (req, res) => res.json(await service.resetTarget(req.user, req.params.id, req.params.studentId))));
  router.post("/:id/targets/notify", asyncRoute(async (req, res) => res.json(await service.notifyTargets(req.user, req.params.id, req.body?.studentIds))));
  router.delete("/:id/targets/:studentId", asyncRoute(async (req, res) => res.json(await service.removeTargets(req.user, req.params.id, [req.params.studentId]))));
  router.post("/:id/:action(pause|resume|close|cancel|archive|release)", asyncRoute(async (req, res) =>
    res.json(await service.transitionAssignment(req.user, req.params.id, req.params.action))));
  router.use(errorMapper);
  return router;
}

/**
 * Student scheduling, mounted at /api/student/ai-interviews ahead of the ANVI student router. Guards run
 * per route, so any other path (including POST /assignments/:aid/start, owned by that router) passes
 * through untouched and is authenticated only once.
 */
export function createAnviSchedulingStudentRouter(authenticate = requireAuth, deps = {}) {
  const service = deps.service || anviScheduling();
  const guard = [asyncRoute(authenticate), requireFullStudent, requireStudent, noStore];
  const router = Router();
  router.get("/assignments", guard, asyncRoute(async (req, res) => res.json(await service.listStudentAssignments(req.user))));
  router.get("/assignments/:aid/slots", guard, asyncRoute(async (req, res) => res.json(await service.listOpenSlots(req.user, req.params.aid))));
  router.post("/assignments/:aid/book", guard, asyncRoute(async (req, res) => res.status(201).json(await service.bookSlot(req.user, req.params.aid, req.body?.slotId))));
  router.post("/bookings/:bid/reschedule", guard, asyncRoute(async (req, res) => res.json(await service.rescheduleBooking(req.user, req.params.bid, req.body?.slotId))));
  router.delete("/bookings/:bid", guard, asyncRoute(async (req, res) => res.json(await service.cancelBooking(req.user, req.params.bid))));
  router.get("/bookings/:bid/calendar.ics", guard, asyncRoute(async (req, res) => {
    const { filename, content } = await service.bookingCalendarIcs(req.user, req.params.bid);
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  }));
  router.use(errorMapper);
  return router;
}
