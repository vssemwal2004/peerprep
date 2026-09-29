import { createInterviewServiceToken } from "./interviewServiceAuth.js";

export function interviewServiceConfigured() {
  if (!process.env.INTERVIEW_SERVICE_URL || !process.env.INTERVIEW_SERVICE_SECRET || process.env.INTERVIEW_SERVICE_SECRET.length < 32)
    return false;
  try {
    const base = new URL(process.env.INTERVIEW_SERVICE_URL);
    return ["http:", "https:"].includes(base.protocol)
      && (process.env.NODE_ENV !== "production" || base.protocol === "https:")
      && !base.username && !base.password && !base.search && !base.hash
      && (base.pathname === "/" || base.pathname === "");
  } catch { return false; }
}

export async function forwardInterviewRequest(req, res) {
  if (!interviewServiceConfigured())
    return res.status(503).json({ error: "Interview service is not configured. Please contact an administrator." });

  let destination;
  try {
    const base = new URL(process.env.INTERVIEW_SERVICE_URL);
    destination = new URL(`/internal/ai-interviews${req.path === "/" ? "" : req.path}`, base);
  } catch {
    return res.status(503).json({ error: "Interview service URL is invalid." });
  }

  try {
    const response = await fetch(destination, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${createInterviewServiceToken(req.user._id)}`,
        "Content-Type": "application/json",
      },
      ...(req.method === "POST" ? { body: JSON.stringify(req.body || {}) } : {}),
      signal: req.abortSignal || AbortSignal.timeout(65000),
    });
    const payload = await response.json();
    res.set("Cache-Control", "no-store");
    return res.status(response.status).json(payload);
  } catch {
    if (res.headersSent) return;
    return res.status(503).json({ error: "Interview service is unavailable. Please retry shortly." });
  }
}

export async function forwardInterviewMedia(req, res) {
  if (!interviewServiceConfigured())
    return res.status(503).json({ error: "Interview service is not configured." });
  const isUpload = req.method === "POST";
  const mime = String(req.get("Content-Type") || "").split(";")[0].toLowerCase();
  if (isUpload && !["audio/webm", "audio/mp4", "audio/wav", "audio/mpeg"].includes(mime))
    return res.status(415).json({ error: "Unsupported recording format." });
  if (isUpload && Number(req.get("Content-Length") || 0) > 8 * 1024 * 1024)
    return res.status(413).json({ error: "Recording is too large." });
  const destination = new URL(`/internal/ai-interviews${req.path}`, process.env.INTERVIEW_SERVICE_URL);
  try {
    const upstream = await fetch(destination, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${createInterviewServiceToken(req.user._id)}`,
        "X-Interview-Version": req.get("X-Interview-Version") || "",
        ...(isUpload ? { "Content-Type": mime } : {}),
      },
      ...(isUpload ? { body: req, duplex: "half" } : {}),
      signal: req.abortSignal || AbortSignal.timeout(90000),
    });
    res.set("Cache-Control", "private, no-store");
    if (upstream.ok && !isUpload) {
      const audio = Buffer.from(await upstream.arrayBuffer());
      res.set("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
      return res.status(upstream.status).send(audio);
    }
    const payload = await upstream.json();
    return res.status(upstream.status).json(payload);
  } catch {
    if (res.headersSent || res.writableEnded) return;
    return res.status(503).json({ error: "Interview audio service is unavailable. Please retry." });
  }
}
