import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import * as controller from "../controllers/aiInterviewController.js";

export const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve()
    .then(() => fn(req, res, next))
    .catch(next);
export const adminAuthoringOnly = (req, res, next) =>
  req.user?.role === "admin"
    ? next()
    : res
        .status(403)
        .json({
          code: "FORBIDDEN",
          error: "AI interview authoring is available to administrators only.",
        });
export function createAuthoringRouter(authenticate = requireAuth) {
  const router = Router();
  router.use(asyncRoute(authenticate), adminAuthoringOnly);
  router.get("/capabilities", controller.capabilities);
  router.get("/resources/:kind", asyncRoute(controller.listResources));
  router.post("/resources/:kind", asyncRoute(controller.saveResource));
  router.put("/resources/:kind/:id", asyncRoute(controller.saveResource));
  router.get("/library", asyncRoute(controller.library));
  router.get("/", asyncRoute(controller.listInterviews));
  router.post("/", asyncRoute(controller.createInterview));
  router.get("/:id", asyncRoute(controller.getInterview));
  router.put("/:id", asyncRoute(controller.saveInterview));
  router.post("/:id/validate", asyncRoute(controller.validateInterview));
  router.post("/:id/duplicate", asyncRoute(controller.duplicateInterview));
  router.post("/:id/:action", asyncRoute(controller.lifecycleInterview));
  router.delete("/:id", asyncRoute(controller.deleteInterview));
  router.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err.code === 11000)
      return res
        .status(409)
        .json({
          code: "DUPLICATE_NAME",
          error: "This name already exists. Refresh and select it.",
        });
    if (err.status && err.status < 500)
      return res
        .status(err.status)
        .json({
          code: err.code || "REQUEST_FAILED",
          error: err.message,
          ...err.details,
        });
    return next(err);
  });
  return router;
}
export default createAuthoringRouter();
