import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { adminAuthoringOnly, asyncRoute } from "../../routes/aiInterviews.js";
import { createAnviReports } from "./anviInterview.reports.js";

// Admin ANVI reports, mounted at /api/ai-interviews/reports ahead of the authoring router's /:id routes.
export function createAnviAdminReportRouter(authenticate = requireAuth, deps = {}) {
  const reports = deps.reports || createAnviReports(deps);
  const router = Router();
  router.use(asyncRoute(authenticate), adminAuthoringOnly);
  router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  router.get("/attempts", asyncRoute(async (req, res) => res.json(await reports.listAttempts(req.user, req.query))));
  router.get("/attempts/:attemptId", asyncRoute(async (req, res) => res.json(await reports.getAttempt(req.user, req.params.attemptId))));
  // Gemini usage and estimated cost of the admin's interviews (?from=&to=&interviewId=).
  router.get("/usage", asyncRoute(async (req, res) => res.json(await reports.usageReport(req.user, req.query))));
  router.post("/attempts/:attemptId/re-evaluate",asyncRoute(async (req, res) => res.json(await reports.reEvaluate(req.user, req.params.attemptId))));
  // Cohort report of one scheduled assignment.
  router.get("/assignments/:aid/summary", asyncRoute(async (req, res) => res.json(await reports.assignmentSummary(req.user, req.params.aid))));
  router.get("/assignments/:aid/export.csv", asyncRoute(async (req, res) => {
    const { filename, content } = await reports.assignmentExport(req.user, req.params.aid);
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  }));
  router.use((err, _req, res, next) => {
    if (res.headersSent || !err?.status || err.status >= 500) return next(err);
    return res.status(err.status).json({ code: err.details?.code || err.code || "REQUEST_FAILED", error: err.message });
  });
  return router;
}

export default createAnviAdminReportRouter();
