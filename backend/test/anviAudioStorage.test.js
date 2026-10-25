import assert from "node:assert/strict";
import { test } from "node:test";
import { createAvatarStorage } from "../src/services/avatarStorage.js";
import { audioStorageKey, createAudioStorage, MAX_AUDIO_BYTES } from "../src/modules/anviInterview/anviInterview.audioStorage.js";

// Fake credentials only.
const ENV = Object.freeze({ R2_ACCOUNT_ID: "acct123", R2_ACCESS_KEY_ID: "AKIDEXAMPLE", R2_SECRET_ACCESS_KEY: "secretexample", R2_BUCKET_NAME: "peerprep-test" });
const KEY = "anvi-audio/platform/_templates/v1/abc123.wav";
const NOW = new Date("2026-10-23T10:00:00Z");
const GOLDEN = "https://acct123.r2.cloudflarestorage.com/peerprep-test/anvi-audio/platform/_templates/v1/abc123.wav"
  + "?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIDEXAMPLE%2F20261023%2Fauto%2Fs3%2Faws4_request"
  + "&X-Amz-Date=20261023T100000Z&X-Amz-Expires=600&X-Amz-SignedHeaders=host"
  + "&X-Amz-Signature=8a336fd85bf4314744c41e3c1bc2394a198233ef997b07ef075dfad4301f3b27";

function recorder(respond = () => new Response(null, { status: 200 })) {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url: new URL(url), init }); return respond(url, init); };
  return { calls, fetcher };
}

test("the SigV4 presigner matches the golden URL and the avatar presigner byte for byte", () => {
  const storage = createAudioStorage({ env: ENV, fetcher: async () => new Response(null) });
  assert.equal(storage.ready, true);
  assert.equal(storage.signedGet(KEY, { expires: 600, now: NOW }), GOLDEN);
  const avatar = createAvatarStorage(ENV, async () => new Response(null));
  assert.equal(storage.signedUrl(KEY, "PUT", 300, NOW), avatar.signedUrl(KEY, "PUT", 300, NOW));
  // signedGet clamps its lifetime to 60..3600 s.
  assert.match(storage.signedGet(KEY, { expires: 5, now: NOW }), /X-Amz-Expires=60&/);
  assert.match(storage.signedGet(KEY, { expires: 99999, now: NOW }), /X-Amz-Expires=3600&/);
});

test("ANVI_AUDIO_R2_BUCKET overrides the shared bucket; missing config is not ready", () => {
  const own = createAudioStorage({ env: { ...ENV, ANVI_AUDIO_R2_BUCKET: "anvi-audio-bucket" }, fetcher: async () => new Response(null) });
  assert.match(own.signedGet(KEY, { now: NOW }), /\/anvi-audio-bucket\/anvi-audio\//);
  const missing = createAudioStorage({ env: { R2_BUCKET_NAME: "peerprep-test" }, fetcher: async () => new Response(null) });
  assert.equal(missing.ready, false);
  assert.throws(() => missing.signedGet(KEY), { code: "ANVI_AUDIO_UNAVAILABLE" });
  const insecure = createAudioStorage({ env: { ...ENV, R2_ENDPOINT: "http://r2.example" }, fetcher: async () => new Response(null) });
  assert.throws(() => insecure.signedGet(KEY), { code: "ANVI_AUDIO_INVALID_CONFIG" });
});

test("keys are validated and built per scope", () => {
  const storage = createAudioStorage({ env: ENV, fetcher: async () => new Response(null) });
  for (const bad of ["avatars/x.wav", "anvi-audio/../x.wav", "anvi-audio/a/b.mp3", "anvi-audio/a b/c.wav", ""]) {
    assert.throws(() => storage.signedGet(bad), { code: "ANVI_AUDIO_INVALID_KEY" }, bad);
  }
  assert.equal(audioStorageKey({ scope: "revision", tenantKey: "t1", interviewId: "64b000000000000000000001", revision: 3, hash: "h" }), "anvi-audio/t1/64b000000000000000000001/3/h.wav");
  assert.equal(audioStorageKey({ scope: "template", tenantKey: "t1", schemaVersion: 2, hash: "h" }), "anvi-audio/t1/_templates/v2/h.wav");
  assert.equal(audioStorageKey({ scope: "attempt", tenantKey: "t1", attemptId: "64b000000000000000000002", hash: "h" }), "anvi-audio-attempt/t1/64b000000000000000000002/h.wav");
  assert.throws(() => audioStorageKey({ scope: "revision", tenantKey: "t/1", interviewId: "x", revision: 1, hash: "h" }), { code: "ANVI_AUDIO_INVALID_KEY" });
});

test("put stores audio/wav up to 8 MB and maps failures to ANVI_AUDIO_* codes", async () => {
  const ok = recorder();
  const storage = createAudioStorage({ env: ENV, fetcher: ok.fetcher });
  await storage.put(KEY, Buffer.from("RIFFdata"));
  assert.equal(ok.calls[0].init.method, "PUT");
  assert.equal(ok.calls[0].init.headers["Content-Type"], "audio/wav");
  assert.equal(ok.calls[0].init.redirect, "error");
  await assert.rejects(storage.put(KEY, Buffer.from("x"), { mimeType: "audio/mpeg" }), { code: "ANVI_AUDIO_INVALID_TYPE" });
  await assert.rejects(storage.put(KEY, Buffer.alloc(MAX_AUDIO_BYTES + 1)), { code: "ANVI_AUDIO_TOO_LARGE" });
  await assert.rejects(storage.put(KEY, Buffer.alloc(0)), { code: "ANVI_AUDIO_TOO_LARGE" });
  assert.equal(ok.calls.length, 1);
  const failing = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response("no", { status: 500 })).fetcher });
  await assert.rejects(failing.put(KEY, Buffer.from("x")), { code: "ANVI_AUDIO_WRITE_FAILED" });
});

test("network errors never leak the signed URL", async () => {
  const storage = createAudioStorage({ env: ENV, fetcher: async (url) => { throw new Error(`connect failed ${url}`); } });
  await assert.rejects(storage.get(KEY), (error) => {
    assert.equal(error.code, "ANVI_AUDIO_NETWORK");
    assert.doesNotMatch(error.message, /https?:|Signature|abc123/);
    return true;
  });
});

test("get enforces the byte cap, head describes, 404 is null", async () => {
  const body = Buffer.alloc(1000, 7);
  const storage = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response(body, { status: 200 })).fetcher });
  assert.deepEqual(await storage.get(KEY), body);
  await assert.rejects(storage.get(KEY, { maxBytes: 999 }), { code: "ANVI_AUDIO_TOO_LARGE" });
  const missing = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response(null, { status: 404 })).fetcher });
  assert.equal(await missing.get(KEY), null);
  assert.equal(await missing.head(KEY), null);
  const described = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response(null, { status: 200, headers: { "content-length": "44", "content-type": "audio/wav" } })).fetcher });
  assert.deepEqual(await described.head(KEY), { size: 44, contentType: "audio/wav" });
  const broken = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response("x", { status: 503 })).fetcher });
  await assert.rejects(broken.get(KEY), { code: "ANVI_AUDIO_READ_FAILED" });
});

test("copy signs x-amz-copy-source; remove treats 404 as success", async () => {
  const rec = recorder();
  const storage = createAudioStorage({ env: ENV, fetcher: rec.fetcher });
  const target = "anvi-audio/platform/64b000000000000000000001/2/def456.wav";
  const source = "anvi-audio/platform/64b000000000000000000001/1/abc123.wav";
  assert.equal(await storage.copy(source, target), true);
  const [{ url, init }] = rec.calls;
  assert.equal(init.method, "PUT");
  assert.equal(url.pathname, `/peerprep-test/${target}`);
  assert.equal(init.headers["x-amz-copy-source"], `peerprep-test/${source}`);
  assert.equal(url.searchParams.get("X-Amz-SignedHeaders"), "host;x-amz-copy-source");
  assert.equal(init.body, undefined);
  const failing = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response(null, { status: 403 })).fetcher });
  await assert.rejects(failing.copy(source, target), { code: "ANVI_AUDIO_COPY_FAILED" });

  const gone = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response(null, { status: 404 })).fetcher });
  assert.equal(await gone.remove(KEY), true);
  const refused = createAudioStorage({ env: ENV, fetcher: recorder(() => new Response(null, { status: 500 })).fetcher });
  await assert.rejects(refused.remove(KEY), { code: "ANVI_AUDIO_DELETE_FAILED" });
});
