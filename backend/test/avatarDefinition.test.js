import assert from "node:assert/strict";
import { test } from "node:test";
import { avatarFingerprint, avatarLimits, inspectUpload, normalizeAvatar } from "../src/services/avatarDefinition.js";
import { createAvatarStorage } from "../src/services/avatarStorage.js";
import { createAvatarProviders, readBounded } from "../src/services/avatarProviders.js";

test("avatar metadata is allowlisted, normalized and bounded", () => {
  const data = normalizeAvatar({ name: "<b>ANNU</b>", ownerId: "forged", consent: true });
  assert.equal(data.name, "ANNU");
  assert.equal(data.ownerId, undefined);
  assert.equal(data.language, "en");
  assert.throws(() => normalizeAvatar({ name: "x", language: "unknown" }), /language/);
  assert.throws(() => normalizeAvatar({ name: "x", consent: "true" }), /Consent/);
  assert.throws(() => normalizeAvatar({ name: "x", introduction: "x".repeat(2001) }), /2000/);
});

test("deployment limits can be tightened without bypassing safe hard ceilings", () => {
  assert.deepEqual(avatarLimits({ AVATAR_MAX_UPLOAD_MB: "5", AVATAR_MAX_INTRO_SECONDS: "30" }), { maxUploadMB: 5, maxIntroSeconds: 30, maxResultMB: 100 });
  assert.deepEqual(avatarLimits({ AVATAR_MAX_UPLOAD_MB: "1000", AVATAR_MAX_INTRO_SECONDS: "NaN" }), { maxUploadMB: 25, maxIntroSeconds: 60, maxResultMB: 100 });
  assert.equal(avatarLimits({ AVATAR_MAX_UPLOAD_MB: "0" }).maxUploadMB, 25);
});

test("magic signatures, upload kind and byte limits are enforced without trusting MIME or filename", () => {
  const image = Buffer.from([255, 216, 255, 224, 0, 16]);
  assert.equal(inspectUpload(image, "source", "fake.png").mime, "image/jpeg");
  assert.throws(() => inspectUpload(image, "audio"), /supported|Use JPEG/);
  assert.throws(() => inspectUpload(Buffer.from("<svg onload='bad'>"), "source"), /Use JPEG/);
  assert.throws(() => inspectUpload(Buffer.alloc(26 * 1024 * 1024), "source"), /25 MB/);
  assert.throws(() => inspectUpload(image, "preview"), /source/);
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from("ftypisom00000000")]);
  assert.equal(inspectUpload(mp4, "source").kind, "video");
});

test("preview fingerprint ignores labels and metadata revisions but binds actual rendering inputs", () => {
  const doc = { revision: 1, data: normalizeAvatar({ name: "ANNU", consent: true }), assets: { source: { key: "portrait" }, audio: { key: "speech" } } };
  const first = avatarFingerprint(doc);
  doc.revision++; doc.data.name = "Renamed"; doc.data.introduction = "Transcript only";
  assert.equal(avatarFingerprint(doc), first);
  doc.assets.audio.key = "new-speech";
  assert.notEqual(avatarFingerprint(doc), first);
  doc.assets.audio.key = "speech"; doc.data.consent = false;
  assert.notEqual(avatarFingerprint(doc), first);
});

test("R2 presigns use scoped SigV4 credentials without leaking secret keys", () => {
  const env = { R2_ENDPOINT: "https://example.r2.cloudflarestorage.com", R2_BUCKET_NAME: "private-avatars", R2_ACCESS_KEY_ID: "test-access", R2_SECRET_ACCESS_KEY: "test-secret" };
  const storage = createAvatarStorage(env);
  const value = storage.signedUrl("avatars/admin/portrait one.jpg", "GET", 900, new Date("2026-09-27T00:00:00Z"));
  const url = new URL(value);
  assert.equal(url.pathname, "/private-avatars/avatars/admin/portrait%20one.jpg");
  assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
  assert.equal(url.searchParams.get("X-Amz-Credential"), "test-access/20260927/auto/s3/aws4_request");
  assert.match(url.searchParams.get("X-Amz-Signature"), /^[a-f0-9]{64}$/);
  assert.ok(!value.includes("test-secret"));
  assert.notEqual(storage.signedUrl("a", "GET", 900), storage.signedUrl("a", "PUT", 900));
  assert.equal(createAvatarStorage({}).ready, false);
  assert.throws(() => createAvatarStorage({}).signedUrl("x"), /Configure/);
});

test("provider downloads are bounded and API keys are only sent in headers", async () => {
  await assert.rejects(() => readBounded(new Response("long response"), 2), /oversized/);
  let request;
  const providers = createAvatarProviders({ GEMINI_API_KEY: "test-key", GEMINI_MODEL: "configured-model" }, async (url, options) => {
    request = { url, options };
    return Response.json({ candidates: [{ content: { parts: [{ text: "Welcome to your mock interview." }] } }] });
  });
  assert.equal(await providers.assist({ introduction: "hello" }, "improve", "en"), "Welcome to your mock interview.");
  assert.ok(!request.url.includes("test-key"));
  assert.equal(request.options.headers["x-goog-api-key"], "test-key");
  assert.equal((await providers.health()), null);
});
