import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../middleware/auth.js";
import { adminAuthoringOnly, asyncRoute } from "./aiInterviews.js";
import { createAvatarController } from "../controllers/avatarController.js";
import { AVATAR_LIMITS } from "../services/avatarDefinition.js";

export function createAvatarRouter(authenticate = requireAuth, dependencies = {}) {
  const router = Router(), controller = createAvatarController(dependencies);
  router.use(asyncRoute(authenticate), adminAuthoringOnly);
  router.use((_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  const costly = rateLimit({ windowMs: 60 * 1000, limit: 10, keyGenerator: (req) => String(req.user._id), standardHeaders: true, legacyHeaders: false, message: { code: "RATE_LIMITED", error: "Too many avatar media requests. Wait a minute before trying again." } });
  // Busboy raises partsLimit when the count reaches its boundary; allow the
  // closing boundary while files/fields still strictly cap the three inputs.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: AVATAR_LIMITS.maxUploadMB * 1024 * 1024, files: 1, fields: 2, fieldSize: 100, parts: 4 } });
  router.get("/capabilities", asyncRoute(controller.capabilities));
  router.get("/", asyncRoute(controller.list));
  router.post("/", asyncRoute(controller.create));
  router.get("/:id", asyncRoute(controller.get));
  router.put("/:id", asyncRoute(controller.save));
  router.post("/:id/uploads", costly, upload.single("file"), asyncRoute(controller.upload));
  router.post("/:id/render", costly, asyncRoute(controller.render));
  router.get("/:id/render", asyncRoute(controller.refresh));
  router.post("/:id/transcribe", costly, asyncRoute(controller.transcribe));
  router.post("/:id/assist", costly, asyncRoute(controller.assist));
  router.post("/:id/archive", asyncRoute(controller.archive));
  router.use((error, _req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 422).json({ code: error.code, error: `Upload one supported file up to ${AVATAR_LIMITS.maxUploadMB} MB, with kind and revision fields.` });
    if (error.status && error.status < 500) return res.status(error.status).json({ code: error.code || "REQUEST_FAILED", error: error.message });
    if (error.status === 502 || error.status === 503) return res.status(error.status).json({ code: error.code, error: error.message });
    return res.status(500).json({ code: "AVATAR_REQUEST_FAILED", error: "The avatar operation could not be completed. Your previously saved data is unchanged." });
  });
  return router;
}
export default createAvatarRouter();
