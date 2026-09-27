import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { forwardInterviewRequest, forwardInterviewMedia } from "../src/services/interviewServiceClient.js";

let runtimeServer, apiServer, base;
const previous = {
  url: process.env.INTERVIEW_SERVICE_URL,
  secret: process.env.INTERVIEW_SERVICE_SECRET,
};
const studentId = "507f1f77bcf86cd799439011";

before(async () => {
  process.env.INTERVIEW_SERVICE_SECRET = "handoff-test-secret-at-least-32-characters";
  const runtime = express();
  runtime.use(express.json());
  runtime.use("/internal/ai-interviews", (req, res, next) => {
    try {
      const token = req.get("authorization")?.replace(/^Bearer /, "");
      const claims = jwt.verify(token, process.env.INTERVIEW_SERVICE_SECRET, {
        algorithms: ["HS256"], audience: "peerprep-interview-runtime", issuer: "peerprep-api",
      });
      req.user = { _id: claims.sub };
      next();
    } catch { res.status(401).json({ error: "Invalid service token." }); }
  });
  runtime.get("/internal/ai-interviews", (req, res) => res.json({ studentId: req.user._id }));
  runtime.post("/internal/ai-interviews/:id/start", (req, res) =>
    res.status(201).json({ studentId: req.user._id, interviewId: req.params.id, consent: req.body.resumeConsent }));
  runtime.post("/internal/ai-interviews/sessions/:id/answer", (req, res) =>
    res.json({ studentId: req.user._id, sessionId: req.params.id, version: req.body.version }));
  runtime.post("/internal/ai-interviews/sessions/:id/transcribe", express.raw({ type: "audio/webm" }), (req, res) =>
    res.json({ studentId: req.user._id, version: req.get("X-Interview-Version"), bytes: req.body.length }));
  runtime.get("/internal/ai-interviews/sessions/:id/question-audio", (_req, res) =>
    res.type("audio/mpeg").send(Buffer.from([1, 2, 3])));
  runtimeServer = runtime.listen(0, "127.0.0.1");
  await new Promise((resolve) => runtimeServer.once("listening", resolve));
  process.env.INTERVIEW_SERVICE_URL = `http://127.0.0.1:${runtimeServer.address().port}`;

  const api = express();
  api.use(express.json());
  const gateway = express.Router();
  gateway.use((req, _res, next) => {
    req.user = { _id: req.get("X-Test-Student") || studentId };
    next();
  });
  gateway.get("/", forwardInterviewRequest);
  gateway.post("/:id/start", forwardInterviewRequest);
  gateway.post("/sessions/:id/answer", forwardInterviewRequest);
  gateway.post("/sessions/:id/transcribe", forwardInterviewMedia);
  gateway.get("/sessions/:id/question-audio", forwardInterviewMedia);
  api.use("/api/student/ai-interviews", gateway);
  apiServer = api.listen(0, "127.0.0.1");
  await new Promise((resolve) => apiServer.once("listening", resolve));
  base = `http://127.0.0.1:${apiServer.address().port}`;
});

after(async () => {
  await new Promise((resolve) => apiServer?.close(resolve) || resolve());
  await new Promise((resolve) => runtimeServer?.close(resolve) || resolve());
  for (const [key, value] of Object.entries({ INTERVIEW_SERVICE_URL: previous.url, INTERVIEW_SERVICE_SECRET: previous.secret })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("runtime rejects browser requests without a service token", async () => {
  const response = await fetch(`${process.env.INTERVIEW_SERVICE_URL}/internal/ai-interviews`);
  assert.equal(response.status, 401);
});

test("PeerPrep forwards identity, start consent, and answer version to the runtime", async () => {
  const listed = await fetch(`${base}/api/student/ai-interviews`);
  assert.deepEqual(await listed.json(), { studentId });
  const started = await fetch(`${base}/api/student/ai-interviews/abc/start`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeConsent: true }),
  });
  assert.equal(started.status, 201);
  assert.deepEqual(await started.json(), { studentId, interviewId: "abc", consent: true });
  const answer = await fetch(`${base}/api/student/ai-interviews/sessions/xyz/answer`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Test-Student": "507f191e810c19729de860ea" },
    body: JSON.stringify({ version: 4 }),
  });
  assert.deepEqual(await answer.json(), {
    studentId: "507f191e810c19729de860ea", sessionId: "xyz", version: 4,
  });
  const audio = await fetch(`${base}/api/student/ai-interviews/sessions/xyz/question-audio`, {
    headers: { "X-Interview-Version": "4" },
  });
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(new Uint8Array(await audio.arrayBuffer()), Uint8Array.from([1, 2, 3]));
  const transcribed = await fetch(`${base}/api/student/ai-interviews/sessions/xyz/transcribe`, {
    method: "POST", headers: { "Content-Type": "audio/webm", "X-Interview-Version": "4" },
    body: new Uint8Array(200),
  });
  assert.deepEqual(await transcribed.json(), { studentId, version: "4", bytes: 200 });
});

test("missing service configuration fails closed", async () => {
  delete process.env.INTERVIEW_SERVICE_URL;
  try {
    const response = await fetch(`${base}/api/student/ai-interviews`);
    assert.equal(response.status, 503);
  } finally {
    process.env.INTERVIEW_SERVICE_URL = `http://127.0.0.1:${runtimeServer.address().port}`;
  }
});
