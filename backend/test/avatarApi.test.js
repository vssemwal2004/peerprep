import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import AIAvatar from "../src/models/AIAvatar.js";
import { createAvatarRouter } from "../src/routes/avatars.js";

// Dedicated ephemeral test DB and mocks: no .env, real storage, models or LLM calls.
let mongo, server, base, onResult;
const files = new Map(), jobs = new Map();
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypisom000000000000")]);
const storage = {
  ready: true, reason: "", signedUrl: (key) => `https://private.test/${key}?signed=short-lived`,
  async write(key, bytes) { files.set(key, bytes); },
  async remove(key) { files.delete(key); },
};
const providers = {
  configured: true, tts: true, stt: true, gemini: true,
  async health() { return { capabilities: { render: true, tts: true, stt: true } }; },
  async submit(manifest) { if (!jobs.has(manifest.jobId)) jobs.set(manifest.jobId, { manifest, status: "queued", stage: "queued" }); return jobs.get(manifest.jobId); },
  async status(id) { return jobs.get(id) || null; },
  async result(id) { if (onResult) await onResult(id); return mp4; },
  async transcribe() { return "Spoken introduction."; },
  async assist() { return "Suggested introduction."; },
};
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: "avatar_api_test" });
  await AIAvatar.init();
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use("/api/ai-interviews/avatars", createAvatarRouter((req, _res, next) => {
    req.user = { _id: req.get("X-Test-Owner"), role: req.get("X-Test-Role") || "admin" }; next();
  }, { storage, providers }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}/api/ai-interviews/avatars`;
});
after(async () => { await new Promise((resolve) => server ? server.close(resolve) : resolve()); await mongoose.disconnect(); await mongo?.stop(); });
function client(owner = new mongoose.Types.ObjectId().toString()) {
  const call = async (path = "", method = "GET", body, headers = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "X-Test-Owner": owner, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...headers }, ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const create = async (patch = {}) => (await call("", "POST", { data: { name: "ANNU", consent: true, introduction: "Welcome", ...patch } })).body;
  const upload = async (doc, kind, bytes = kind === "source" ? Buffer.from([255, 216, 255, 224]) : Buffer.from("RIFF0000WAVEtest")) => {
    const form = new FormData(); form.append("kind", kind); form.append("revision", String(doc.revision)); form.append("file", new Blob([bytes]), "upload.bin");
    return call(`/${doc._id}/uploads`, "POST", form);
  };
  const ready = async (patch) => {
    let doc = await create(patch);
    const source = await upload(doc, "source");
    assert.equal(source.status, 200, JSON.stringify(source.body));
    doc = source.body;
    if (doc.data.speechMode === "upload") doc = (await upload(doc, "audio")).body;
    return doc;
  };
  return { owner, call, create, upload, ready };
}
test("authoring is admin-only, owner-scoped and returns honest capabilities", async () => {
  const a = client(), b = client();
  assert.equal((await a.call("/capabilities", "GET", undefined, { "X-Test-Role": "student" })).status, 403);
  const cap = (await a.call("/capabilities")).body;
  assert.equal(cap.limits.maxIntroSeconds, 60); assert.equal(cap.renderer.available, true);
  assert.deepEqual(cap.voices, [{ value: "default", label: "Default configured voice" }]);
  const doc = await a.create();
  assert.equal((await b.call(`/${doc._id}`)).status, 404);
  assert.equal((await b.call()).body.pagination.total, 0);
  assert.equal((await a.call()).body.items[0].data.name, "ANNU");
});
test("metadata saves compare revisions, strip ownership and archive reversibly", async () => {
  const a = client(); let doc = await a.create();
  const old = doc.revision;
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: old, data: { ...doc.data, name: "Updated", ownerId: "forged" } })).body;
  assert.equal(doc.data.ownerId, undefined);
  assert.equal((await a.call(`/${doc._id}`, "PUT", { revision: old, data: doc.data })).status, 409);
  doc = (await a.call(`/${doc._id}/archive`, "POST", { revision: doc.revision, active: false })).body;
  assert.equal(doc.active, false);
  assert.equal((await a.call("?active=false")).body.pagination.total, 1);
  assert.equal((await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: doc.data })).status, 409);
  doc = (await a.call(`/${doc._id}/archive`, "POST", { revision: doc.revision, active: true })).body;
  assert.equal(doc.active, true);
});
test("uploads require consent and validate real media bytes", async () => {
  const a = client(); let doc = await a.create({ consent: false });
  assert.equal((await a.upload(doc, "source")).status, 422);
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, consent: true } })).body;
  assert.equal((await a.upload(doc, "source", Buffer.from("<svg/>"))).status, 422);
  const result = await a.upload(doc, "source");
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.assets.source.mime, "image/jpeg");
  assert.match(result.body.assets.source.url, /signed=short-lived/);
  assert.equal((await a.upload(doc, "source")).status, 409);
});
test("render completion imports private MP4 once and preserves a current preview for label changes", async () => {
  const a = client(); let doc = await a.ready();
  let response = await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision });
  assert.equal(response.status, 202); doc = response.body;
  assert.equal(doc.render.status, "queued");
  assert.equal(doc.render.input, undefined);
  const record = jobs.get(doc.render.jobId); record.status = "ready"; record.stage = "complete";
  doc = (await a.call(`/${doc._id}/render`)).body;
  assert.equal(doc.render.status, "ready"); assert.equal(doc.previewStale, false);
  assert.equal(files.get(doc.assets.preview.key).equals(mp4), true);
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, name: "Renamed" } })).body;
  assert.equal(doc.previewStale, false);
  assert.equal((await AIAvatar.findById(doc._id).lean()).activeRenderOwner, undefined);
  const cached = await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision });
  assert.equal(cached.status, 200);
  assert.equal(cached.body.render.jobId, doc.render.jobId);
  assert.equal(cached.body.revision, doc.revision);
});
test("one active render per owner is enforced atomically across avatars", async () => {
  const a = client(); const first = await a.ready(), second = await a.ready();
  const results = await Promise.all([first, second].map((doc) => a.call(`/${doc._id}/render`, "POST", { revision: doc.revision })));
  assert.deepEqual(results.map((r) => r.status).sort(), [202, 409]);
  assert.equal(results.find((r) => r.status === 409).body.code, "RENDER_ALREADY_ACTIVE");
  const doc = results.find((r) => r.status === 202).body;
  assert.equal((await a.call(`/${doc._id}/archive`, "POST", { revision: doc.revision, active: false })).status, 409);
});
test("changed input cannot publish a stale job result", async () => {
  const a = client(); let doc = await a.ready();
  doc = (await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision })).body;
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, language: "hi" } })).body;
  jobs.get(doc.render.jobId).status = "ready";
  doc = (await a.call(`/${doc._id}/render`)).body;
  assert.equal(doc.render.status, "failed"); assert.equal(doc.previewStale, true);
  assert.equal(doc.assets.preview, undefined);
});
test("editing during result transfer is caught by the final fingerprint check", async () => {
  const a = client(); let doc = await a.ready();
  doc = (await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision })).body;
  jobs.get(doc.render.jobId).status = "ready";
  onResult = async () => {
    const latest = (await a.call(`/${doc._id}`)).body;
    const saved = await a.call(`/${doc._id}`, "PUT", { revision: latest.revision, data: { ...latest.data, language: "hi" } });
    assert.equal(saved.status, 200);
  };
  try {
    const result = (await a.call(`/${doc._id}/render`)).body;
    assert.equal(result.render.status, "failed"); assert.equal(result.assets.preview, undefined);
  } finally { onResult = null; }
});
test("speech transcription and Gemini return suggestions without automatic edits", async () => {
  const a = client(); const doc = await a.ready();
  const transcript = await a.call(`/${doc._id}/transcribe`, "POST", { revision: doc.revision });
  assert.equal(transcript.status, 200); assert.equal(transcript.body.text, "Spoken introduction.");
  const suggestion = await a.call(`/${doc._id}/assist`, "POST", { revision: doc.revision, action: "translate", language: "hi" });
  assert.equal(suggestion.body.text, "Suggested introduction.");
  const stored = (await a.call(`/${doc._id}`)).body;
  assert.equal(stored.revision, doc.revision); assert.equal(stored.data.introduction, "Welcome");
});
test("TTS explicitly rejects experimental Hinglish rather than pretending it is supported", async () => {
  const a = client(); const doc = await a.ready({ speechMode: "tts", language: "hinglish" });
  const result = await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision });
  assert.equal(result.status, 422); assert.equal(result.body.code, "TTS_LANGUAGE_UNAVAILABLE");
});

test("language previews survive subsequent renders, have signed URLs, and become stale after source replacement", async () => {
  const a = client(), b = client();
  let doc = await a.ready({ speechMode: "tts" });
  const render = async () => {
    const response = await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision });
    assert.equal(response.status, 202, JSON.stringify(response.body));
    doc = response.body;
    jobs.get(doc.render.jobId).status = "ready";
    doc = (await a.call(`/${doc._id}/render`)).body;
  };
  await render();
  const englishKey = doc.languagePreviews.en.key;
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, language: "hi", introduction: "नमस्ते, आपका स्वागत है।" } })).body;
  await render();
  assert.equal(doc.languagePreviews.en.key, englishKey);
  assert.equal(doc.languagePreviews.en.introduction, "Welcome");
  assert.equal(doc.languagePreviews.hi.introduction, "नमस्ते, आपका स्वागत है।");
  assert.equal(doc.assets.preview.language, "hi");
  assert.equal(doc.languagePreviews.en.stale, false);
  assert.match(doc.languagePreviews.hi.url, /signed=short-lived/);
  assert.equal((await b.call(`/${doc._id}`)).status, 404);
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, language: "en", introduction: "Welcome" } })).body;
  const jobCount = jobs.size;
  const restored = await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision });
  assert.equal(restored.status, 200);
  doc = restored.body;
  assert.equal(doc.assets.preview.key, englishKey);
  assert.equal(doc.previewStale, false);
  assert.equal(jobs.size, jobCount);
  doc = (await a.upload(doc, "source")).body;
  assert.equal(doc.languagePreviews.en.stale, true);
  assert.equal(doc.languagePreviews.hi.stale, true);
});

test("changing language cannot relabel an English recording as Hindi speech", async () => {
  const a = client();
  let doc = await a.ready();
  assert.equal(doc.assets.audio.language, "en");
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, language: "hi" } })).body;
  const rejected = await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision });
  assert.equal(rejected.status, 422);
  assert.equal(rejected.body.code, "AUDIO_LANGUAGE_MISMATCH");
  doc = (await a.upload(doc, "audio")).body;
  assert.equal(doc.assets.audio.language, "hi");
  assert.equal((await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision })).status, 202);
});

test("avatars created before multilingual previews retain their existing clip", async () => {
  const a = client();
  let doc = await a.ready({ speechMode: "tts" });
  doc = (await a.call(`/${doc._id}/render`, "POST", { revision: doc.revision })).body;
  jobs.get(doc.render.jobId).status = "ready";
  doc = (await a.call(`/${doc._id}/render`)).body;
  const originalKey = doc.assets.preview.key;
  await AIAvatar.updateOne({ _id: doc._id }, { $unset: { languagePreviews: 1, "assets.preview.language": 1, "assets.preview.sourceKey": 1, "assets.preview.introduction": 1 } });
  doc = (await a.call(`/${doc._id}`)).body;
  assert.equal(doc.languagePreviews.en.stale, false);
  doc = (await a.call(`/${doc._id}`, "PUT", { revision: doc.revision, data: { ...doc.data, language: "hi", introduction: "नमस्ते" } })).body;
  assert.equal(doc.languagePreviews.en.key, originalKey);
  assert.equal(doc.languagePreviews.en.introduction, "Welcome");
  assert.equal(doc.languagePreviews.hi, undefined);
});
