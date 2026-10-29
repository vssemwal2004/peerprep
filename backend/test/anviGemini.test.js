import assert from "node:assert/strict";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createGeminiClient, liveUrl, pcmToWav, usageTokens } from "../src/modules/anviInterview/anviInterview.gemini.js";

const KEY = "test-key/with+chars";
const config = anviConfig({ GEMINI_API_KEY: KEY, ANVI_GENERATE_MODEL: "gemini-3.5-flash-lite", ANVI_TRANSCRIBE_MODEL: "gemini-3.5-flash-lite", ANVI_FALLBACK_MODELS: "fallback-b" });
const tick = () => new Promise((resolve) => setImmediate(resolve));

class FakeSocket {
  static last = null;
  constructor(url) {
    Object.assign(this, { url, readyState: 0, sent: [], listeners: {} });
    FakeSocket.last = this;
  }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); }
  open() { this.readyState = 1; this.dispatch("open"); }
  send(data) {
    if (this.readyState !== 1) throw new Error("socket is not open");
    this.sent.push(JSON.parse(data));
  }
  receive(payload) { this.dispatch("message", { data: typeof payload === "string" || payload instanceof Blob || payload instanceof ArrayBuffer ? payload : JSON.stringify(payload) }); }
  close(code = 1000, reason = "") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    setImmediate(() => this.dispatch("close", { code, reason }));
  }
  drop(code, reason) { this.readyState = 3; this.dispatch("close", { code, reason }); }
}

async function connect(options = {}) {
  const client = createGeminiClient({ config, WebSocketImpl: FakeSocket, fetcher: async () => assert.fail("no REST") });
  const pending = client.openLive({ systemText: "You are ANVI.", ...options });
  const socket = FakeSocket.last;
  socket.open();
  socket.receive({ setupComplete: {} });
  return { live: await pending, socket };
}

test("liveUrl encodes the key and pcmToWav writes a mono 16-bit header", () => {
  assert.equal(liveUrl(KEY), "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=test-key%2Fwith%2Bchars");
  const wav = pcmToWav(Buffer.alloc(8, 1), 24000);
  assert.equal(wav.length, 52);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(4), 44);
  assert.equal(wav.toString("ascii", 8, 12), "WAVE");
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(28), 48000);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 8);
});

test("openLive sends the verified setup and resolves only after setupComplete", async () => {
  const client = createGeminiClient({ config, WebSocketImpl: FakeSocket });
  let resolved = false;
  const pending = client.openLive({ systemText: "SYSTEM", voice: "Kore", silenceMs: 1800 }).then((live) => { resolved = true; return live; });
  const socket = FakeSocket.last;
  assert.equal(socket.url, liveUrl(KEY));
  socket.open();
  assert.deepEqual(socket.sent[0], { setup: {
    model: `models/${config.liveModel}`,
    generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } } },
    systemInstruction: { parts: [{ text: "SYSTEM" }] },
    realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 1800 } },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    // Compression starts early (ANVI_LIVE_CONTEXT_TRIGGER_TOKENS / _TARGET_TOKENS defaults) to cap re-billed context.
    contextWindowCompression: { triggerTokens: 25000, slidingWindow: { targetTokens: 8000 } },
  } });
  socket.receive({ serverContent: { outputTranscription: { text: "early" } } });
  await tick();
  assert.equal(resolved, false);
  socket.receive({ setupComplete: {} });
  const live = await pending;
  assert.equal(live.open, true);

  assert.equal(live.sendAudio(Buffer.from([1, 2, 3, 4])), true);
  assert.deepEqual(socket.sent[1], { realtimeInput: { audio: { data: "AQIDBA==", mimeType: "audio/pcm;rate=16000" } } });
  assert.equal(live.sendAudio(Buffer.alloc(0)), false);
  assert.equal(live.sendText("[server] Begin."), true);
  assert.deepEqual(socket.sent[2], { clientContent: { turns: [{ role: "user", parts: [{ text: "[server] Begin." }] }], turnComplete: true } });
  assert.equal(live.sendText("context only", { turnComplete: false }), true);
  assert.equal(socket.sent[3].clientContent.turnComplete, false);
  live.close();
});

test("openLive resumes with a handle, reports new handles, and can turn resumption off", async () => {
  const resumed = createGeminiClient({ config, WebSocketImpl: FakeSocket });
  const pending = resumed.openLive({ systemText: "S", resumeHandle: "handle-1" });
  const socket = FakeSocket.last;
  socket.open();
  assert.deepEqual(socket.sent[0].setup.sessionResumption, { handle: "handle-1" });
  socket.receive({ setupComplete: {} });
  const live = await pending;
  const handles = [];
  live.on("resumption", (update) => handles.push(update.handle));
  socket.receive({ sessionResumptionUpdate: { newHandle: "handle-2", resumable: true } });
  socket.receive({ sessionResumptionUpdate: { newHandle: "handle-3", resumable: false } });
  await tick();
  assert.deepEqual(handles, ["handle-2"]);
  live.close();

  const plain = createGeminiClient({ config: { ...config, liveResumption: false }, WebSocketImpl: FakeSocket });
  const off = plain.openLive({ systemText: "S" });
  FakeSocket.last.open();
  assert.equal("sessionResumption" in FakeSocket.last.sent[0].setup, false);
  assert.equal("contextWindowCompression" in FakeSocket.last.sent[0].setup, false);
  FakeSocket.last.receive({ setupComplete: {} });
  (await off).close();
});

test("live events decode string, ArrayBuffer and Blob frames in arrival order", async () => {
  const { live, socket } = await connect();
  const seen = [];
  for (const event of ["inputText", "outputText", "turnComplete", "interrupted", "goAway", "error"])
    live.on(event, (value) => seen.push([event, value instanceof Error ? value.code : value]));
  live.on("audio", (pcm) => seen.push(["audio", [...pcm]]));
  socket.receive(new Blob([JSON.stringify({ serverContent: { inputTranscription: { text: "I think " } } })]));
  socket.receive(new TextEncoder().encode(JSON.stringify({ serverContent: { inputTranscription: { text: "it diffs." } } })).buffer);
  socket.receive({ serverContent: { outputTranscription: { text: "Question 2:" }, modelTurn: { parts: [{ inlineData: { data: Buffer.from([9, 8]).toString("base64") } }, { text: "x" }] } } });
  socket.receive({ serverContent: { interrupted: true } });
  socket.receive({ serverContent: { turnComplete: true } });
  socket.receive({ goAway: { timeLeft: "10s" } });
  socket.receive({ error: { code: 500, message: `bad thing for key ${KEY}` } });
  socket.receive("not json");
  await tick();
  assert.deepEqual(seen, [
    ["inputText", "I think "],
    ["inputText", "it diffs."],
    ["outputText", "Question 2:"],
    ["audio", [9, 8]],
    ["interrupted", undefined],
    ["turnComplete", undefined],
    ["goAway", { timeLeft: "10s" }],
    ["error", "LIVE_ERROR"],
  ]);
  live.close();
});

test("close is idempotent, later sends and frames are ignored, and closed reports who closed", async () => {
  const { live, socket } = await connect();
  const closed = [];
  const text = [];
  live.on("closed", (info) => closed.push(info));
  live.on("outputText", (chunk) => text.push(chunk));
  live.close();
  live.close();
  assert.equal(live.open, false);
  assert.equal(live.sendAudio(Buffer.alloc(4)), false);
  assert.equal(live.sendText("hello"), false);
  socket.receive({ serverContent: { outputTranscription: { text: "late" } } });
  await tick();
  await tick();
  assert.deepEqual(text, []);
  assert.deepEqual(closed, [{ code: 1000, reason: "done", byClient: true }]);

  const second = await connect();
  const dropped = [];
  second.live.on("closed", (info) => dropped.push(info));
  second.socket.drop(1011, "Internal error");
  second.socket.drop(1011, "again");
  assert.deepEqual(dropped, [{ code: 1011, reason: "Internal error", byClient: false }]);
  assert.doesNotThrow(() => second.live.sendText("after close"));
});

test("a throwing listener is reported as an error event instead of escaping", async () => {
  const { live, socket } = await connect();
  const errors = [];
  live.on("outputText", () => { throw new Error("listener bug"); });
  live.on("error", (error) => errors.push(error.message));
  socket.receive({ serverContent: { outputTranscription: { text: "hi" } } });
  await tick();
  assert.deepEqual(errors, ["listener bug"]);
  live.close();
});

test("openLive rejects on setup timeout, setup close and missing configuration without leaking the key", async () => {
  const client = createGeminiClient({ config, WebSocketImpl: FakeSocket });
  const timedOut = client.openLive({ setupTimeoutMs: 20 });
  FakeSocket.last.open();
  await assert.rejects(timedOut, (error) => error.code === "GEMINI_TIMEOUT");

  const closing = client.openLive();
  FakeSocket.last.open();
  FakeSocket.last.drop(1008, `models/x is not found for ${KEY}`);
  await assert.rejects(closing, (error) => error.code === "GEMINI_UNAVAILABLE" && error.message.includes("1008") && !error.message.includes(KEY));

  const failing = client.openLive();
  FakeSocket.last.open();
  FakeSocket.last.receive({ error: { code: 400, message: "Invalid setup" } });
  await assert.rejects(failing, (error) => error.code === "LIVE_ERROR" && error.status === 400);

  const keyless = createGeminiClient({ config: anviConfig({}), WebSocketImpl: FakeSocket });
  await assert.rejects(keyless.openLive(), (error) => error.code === "GEMINI_UNAVAILABLE");
  await assert.rejects(keyless.generateJson({ parts: "x" }), (error) => error.code === "GEMINI_UNAVAILABLE");
});

const reply = (parts, status = 200) => new Response(JSON.stringify(status === 200 ? { candidates: [{ content: { parts } }] } : { error: { message: "nope" } }), { status });
function scriptedFetcher(script) {
  const calls = [];
  const fetcher = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, model: url.match(/models\/([^:]+):/)[1], headers: init.headers, body, init });
    const next = script.shift();
    if (!next) throw new Error("unexpected call");
    return typeof next === "function" ? next(init) : next;
  };
  return { fetcher, calls };
}
const restClient = (script) => {
  const scripted = scriptedFetcher(script);
  return { ...scripted, client: createGeminiClient({ config, fetcher: scripted.fetcher, WebSocketImpl: FakeSocket, sleep: async () => {} }) };
};

test("generateJson posts a JSON-schema request, filters thoughts and parses the result", async () => {
  const { client, calls } = restClient([reply([{ text: "thinking...", thought: true }, { text: "{\"questions\":" }, { text: "[]}" }])]);
  const schema = { type: "OBJECT", properties: { questions: { type: "ARRAY" } } };
  assert.deepEqual(await client.generateJson({ systemText: "SYS", parts: [{ text: "hi" }], schema }), { questions: [] });
  const [call] = calls;
  assert.equal(call.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
  assert.equal(call.headers["x-goog-api-key"], KEY);
  assert.equal(call.init.redirect, "error");
  assert.ok(!call.url.includes(KEY));
  assert.deepEqual(call.body.systemInstruction, { parts: [{ text: "SYS" }] });
  assert.deepEqual(call.body.contents, [{ role: "user", parts: [{ text: "hi" }] }]);
  assert.deepEqual(call.body.generationConfig, { temperature: 0.2, maxOutputTokens: 8192, responseMimeType: "application/json", responseSchema: schema, thinkingConfig: { thinkingLevel: "low" } });
});

test("generateJson retries 429/5xx once, then falls back; 404 skips straight to the next model", async () => {
  const retried = restClient([reply([], 503), reply([{ text: "{\"ok\":1}" }])]);
  assert.deepEqual(await retried.client.generateJson({ parts: "x" }), { ok: 1 });
  assert.deepEqual(retried.calls.map((call) => call.model), ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite"]);

  const fallback = restClient([reply([], 429), reply([], 500), reply([{ text: "{\"ok\":2}" }])]);
  assert.deepEqual(await fallback.client.generateJson({ parts: "x" }), { ok: 2 });
  assert.deepEqual(fallback.calls.map((call) => call.model), ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "fallback-b"]);
  // Thinking config is only sent to gemini-3.x models.
  assert.equal(fallback.calls[2].body.generationConfig.thinkingConfig, undefined);

  const retired = restClient([reply([], 404), reply([{ text: "{\"ok\":3}" }])]);
  assert.deepEqual(await retired.client.generateJson({ model: "old-model", parts: "x" }), { ok: 3 });
  assert.deepEqual(retired.calls.map((call) => call.model), ["old-model", "gemini-3.5-flash-lite"]);
});

test("generateJson reports unavailable, invalid and timeout failures with codes", async () => {
  const rejected = restClient([reply([], 400)]);
  await assert.rejects(rejected.client.generateJson({ parts: "x" }), (error) => error.code === "GEMINI_UNAVAILABLE" && error.status === 400);
  assert.equal(rejected.calls.length, 1);

  const exhausted = restClient([reply([], 503), reply([], 503), reply([], 503), reply([], 503)]);
  await assert.rejects(exhausted.client.generateJson({ parts: "x" }), (error) => error.code === "GEMINI_UNAVAILABLE" && error.retryable);
  assert.equal(exhausted.calls.length, 4);

  const network = restClient([() => { throw new TypeError("fetch failed"); }, () => { throw new TypeError("fetch failed"); }, reply([{ text: "{\"ok\":true}" }])]);
  assert.deepEqual(await network.client.generateJson({ parts: "x" }), { ok: true });

  const invalid = restClient([reply([{ text: "not json" }]), new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }))]);
  await assert.rejects(invalid.client.generateJson({ parts: "x" }), (error) => error.code === "GEMINI_INVALID_RESPONSE");
  assert.equal(invalid.calls.length, 2);

  const fenced = restClient([reply([{ text: "```json\n{\"a\":1}\n```" }])]);
  assert.deepEqual(await fenced.client.generateJson({ parts: "x" }), { a: 1 });

  const hanging = (init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const slow = restClient([hanging]);
  // AbortSignal.timeout timers are unref'd; keep the loop alive until the abort fires.
  const keepAlive = setTimeout(() => {}, 5000);
  await assert.rejects(slow.client.generateJson({ parts: "x", timeoutMs: 30 }), (error) => error.code === "GEMINI_TIMEOUT");
  clearTimeout(keepAlive);
});

test("transcribePcm sends WAV audio with the verbatim prompt, chunks long answers and drops no-speech output", async () => {
  const empty = restClient([]);
  assert.equal(await empty.client.transcribePcm({ pcm: Buffer.alloc(100) }), "");
  assert.equal(empty.calls.length, 0);

  const short = restClient([reply([{ text: "  Virtual DOM is an\nin-memory tree. " }])]);
  const pcm = Buffer.alloc(16000 * 2, 7);
  assert.equal(await short.client.transcribePcm({ pcm, language: "Hinglish" }), "Virtual DOM is an in-memory tree.");
  const [call] = short.calls;
  assert.equal(call.model, config.transcribeModel);
  const [audio, prompt] = call.body.contents[0].parts;
  assert.equal(audio.inlineData.mimeType, "audio/wav");
  const wav = Buffer.from(audio.inlineData.data, "base64");
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.length, 44 + pcm.length);
  assert.match(prompt.text, /^Transcribe verbatim in the language spoken; keep technical terms in English\./);
  assert.match(prompt.text, /Roman script/);
  assert.equal(call.body.generationConfig.temperature, 0);

  const long = restClient([reply([{ text: "first part" }]), reply([{ text: "(no speech)" }])]);
  const fiveMinutes = Buffer.alloc(16000 * 2 * 60 * 5);
  assert.equal(await long.client.transcribePcm({ pcm: fiveMinutes }), "first part");
  assert.equal(long.calls.length, 2);
  assert.equal(Buffer.from(long.calls[0].body.contents[0].parts[0].inlineData.data, "base64").length, 44 + 16000 * 2 * 60 * 4);

  const failing = restClient([reply([], 400)]);
  await assert.rejects(failing.client.transcribePcm({ pcm }), (error) => error.code === "GEMINI_UNAVAILABLE");
});

// --- Usage metering and cost hygiene ----------------------------------------------------------------

const USAGE = {
  promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 10, totalTokenCount: 160, cachedContentTokenCount: 5,
  promptTokensDetails: [{ modality: "AUDIO", tokenCount: 100 }, { modality: "TEXT", tokenCount: 20 }],
  candidatesTokensDetails: [{ modality: "TEXT", tokenCount: 30 }],
};
const metered = (parts, usageMetadata = USAGE) => new Response(JSON.stringify({ candidates: [{ content: { parts } }], usageMetadata }));

test("usageTokens reads REST and Live usage blocks and ignores missing ones", () => {
  assert.deepEqual(usageTokens(USAGE), {
    input: 120, output: 40, total: 160, cached: 5, thoughts: 10,
    inputByModality: { AUDIO: 100, TEXT: 20 }, outputByModality: { TEXT: 30 },
  });
  // Live names the output count responseTokenCount.
  assert.deepEqual(usageTokens({ promptTokenCount: 50, responseTokenCount: 70, responseTokensDetails: [{ modality: "AUDIO", tokenCount: 70 }] }),
    { input: 50, output: 70, total: 120, cached: 0, thoughts: 0, outputByModality: { AUDIO: 70 } });
  assert.equal(usageTokens(undefined), null);
  assert.equal(usageTokens({}), null);
  assert.equal(usageTokens({ promptTokenCount: "x", candidatesTokenCount: -4 }), null);
});

test("REST calls report usage to the client and per-call handlers, even for a rejected response", async () => {
  const seen = [];
  const scripted = scriptedFetcher([metered([{ text: "{\"ok\":1}" }]), metered([{ text: "not json" }]), reply([{ text: "{\"ok\":2}" }]), metered([{ text: "spoken words" }])]);
  const client = createGeminiClient({ config, fetcher: scripted.fetcher, sleep: async () => {}, onUsage: (usage) => seen.push(["client", usage]) });
  const perCall = (usage) => seen.push(["call", usage]);

  assert.deepEqual(await client.generateJson({ parts: "x", onUsage: perCall, usageKind: "evaluate" }), { ok: 1 });
  assert.deepEqual(seen.map(([who, usage]) => [who, usage.kind, usage.model, usage.tokens.total]), [
    ["client", "evaluate", "gemini-3.5-flash-lite", 160], ["call", "evaluate", "gemini-3.5-flash-lite", 160],
  ]);
  // The unusable reply was still billed; the fallback reply had no usage block.
  seen.length = 0;
  assert.deepEqual(await client.generateJson({ parts: "y" }), { ok: 2 });
  assert.deepEqual(seen.map(([who, usage]) => [who, usage.kind, usage.model]), [["client", "generate", "gemini-3.5-flash-lite"]]);

  seen.length = 0;
  const pcm = Buffer.alloc(16000 * 2 * 3, 7);
  assert.equal(await client.transcribePcm({ pcm, onUsage: perCall }), "spoken words");
  assert.deepEqual(seen.map(([who, usage]) => [who, usage.kind, usage.audioSeconds]), [["client", "transcribe", 3], ["call", "transcribe", 3]]);
});

test("a throwing or rejecting usage handler never breaks a call", async () => {
  const scripted = scriptedFetcher([metered([{ text: "{\"ok\":1}" }])]);
  const client = createGeminiClient({ config, fetcher: scripted.fetcher, onUsage: () => { throw new Error("ledger bug"); } });
  assert.deepEqual(await client.generateJson({ parts: "x", onUsage: async () => { throw new Error("async bug"); } }), { ok: 1 });
});

test("Live usageMetadata is reported per message; sessions without it report nothing", async () => {
  const seen = [];
  const client = createGeminiClient({ config, WebSocketImpl: FakeSocket, onUsage: (usage) => seen.push(usage) });
  const pending = client.openLive({ systemText: "S", onUsage: (usage) => seen.push({ perCall: true, ...usage }) });
  const socket = FakeSocket.last;
  socket.open();
  socket.receive({ setupComplete: {} });
  const live = await pending;
  const text = [];
  live.on("outputText", (chunk) => text.push(chunk));
  socket.receive({ serverContent: { outputTranscription: { text: "Hello" } }, usageMetadata: { promptTokenCount: 40, responseTokenCount: 25, totalTokenCount: 65 } });
  socket.receive({ serverContent: { turnComplete: true } });
  await tick();
  assert.deepEqual(text, ["Hello"], "content in the same message is still handled");
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[0], { kind: "live", model: config.liveModel, tokens: { input: 40, output: 25, total: 65, cached: 0, thoughts: 0 } });
  assert.equal(seen[1].perCall, true);
  live.close();
});

test("maxOutputTokens is capped per call kind", async () => {
  const capped = anviConfig({ GEMINI_API_KEY: KEY, ANVI_MAX_OUTPUT_TOKENS_GENERATE: "1024", ANVI_MAX_OUTPUT_TOKENS_EVALUATE: "2048", ANVI_MAX_OUTPUT_TOKENS_TRANSCRIBE: "999999" });
  const scripted = scriptedFetcher([reply([{ text: "{}" }]), reply([{ text: "{}" }]), reply([{ text: "{}" }]), reply([{ text: "words" }])]);
  const client = createGeminiClient({ config: capped, fetcher: scripted.fetcher });
  await client.generateJson({ parts: "a" });
  await client.generateJson({ parts: "b", maxOutputTokens: 512 });
  await client.generateJson({ parts: "c", usageKind: "evaluate", maxOutputTokens: 100000 });
  await client.transcribePcm({ pcm: Buffer.alloc(32000, 7) });
  assert.deepEqual(scripted.calls.map((call) => call.body.generationConfig.maxOutputTokens), [1024, 512, 2048, 32768]);
  // Defaults: transcription 4096, generation and evaluation 8192.
  assert.deepEqual(config.maxOutputTokens, { transcribe: 4096, generate: 8192, evaluate: 8192 });
});

test("identical temperature-0 generateJson calls share one request for an hour", async (t) => {
  let now = Date.UTC(2026, 9, 22, 10, 0, 0);
  t.mock.method(Date, "now", () => now);
  const seen = [];
  const answer = () => metered([{ text: "{\"items\":[1]}" }]);
  const scripted = scriptedFetcher([answer(), answer(), answer(), reply([], 400), answer(), answer(), answer()]);
  const client = createGeminiClient({ config, fetcher: scripted.fetcher, onUsage: (usage) => seen.push(usage) });
  const deterministic = { systemText: "S", parts: "same", temperature: 0 };

  // Parallel identical calls share the in-flight request; each caller gets its own copy.
  const [one, two] = await Promise.all([client.generateJson(deterministic), client.generateJson(deterministic)]);
  assert.deepEqual(one, { items: [1] });
  one.items.push(99);
  assert.deepEqual(two, { items: [1] });
  assert.deepEqual(await client.generateJson(deterministic), { items: [1] });
  assert.equal(scripted.calls.length, 1);
  assert.equal(seen.length, 1, "a cache hit is not billed again");

  // Different input, a non-zero temperature or cache:false always go to Gemini.
  await client.generateJson({ ...deterministic, parts: "other" });
  await client.generateJson({ ...deterministic, temperature: 0.2 });
  assert.equal(scripted.calls.length, 3);
  await assert.rejects(client.generateJson({ ...deterministic, parts: "fails", cache: false }));
  assert.equal(scripted.calls.length, 4);
  // Failures are not cached.
  assert.deepEqual(await client.generateJson({ ...deterministic, parts: "fails" }), { items: [1] });
  assert.equal(scripted.calls.length, 5);

  now += 3_599_000;
  await client.generateJson(deterministic);
  assert.equal(scripted.calls.length, 5, "still cached just before the hour (ANVI_JSON_CACHE_SECONDS default 3600)");
  now += 2_000;
  await client.generateJson(deterministic);
  assert.equal(scripted.calls.length, 6, "the entry expires after an hour");

  const off = scriptedFetcher([answer(), answer()]);
  const uncached = createGeminiClient({ config: { ...config, jsonCacheSeconds: 0 }, fetcher: off.fetcher });
  await uncached.generateJson(deterministic);
  await uncached.generateJson(deterministic);
  assert.equal(off.calls.length, 2, "ANVI_JSON_CACHE_SECONDS=0 turns the cache off");
});

test("the answer cache keeps at most 100 entries, least recently used first out", async () => {
  const scripted = { calls: 0 };
  const fetcher = async () => { scripted.calls += 1; return reply([{ text: "{\"ok\":true}" }]); };
  const client = createGeminiClient({ config, fetcher });
  const call = (n) => client.generateJson({ parts: `prompt ${n}`, temperature: 0 });
  for (let n = 0; n < 100; n += 1) await call(n);
  await call(0);
  assert.equal(scripted.calls, 100, "prompt 0 is still cached and now most recent");
  await call(100);
  await call(0);
  assert.equal(scripted.calls, 101, "adding one more evicted prompt 1, not prompt 0");
  await call(1);
  assert.equal(scripted.calls, 102);
});

test("anviConfig clamps the capacity, cache and price settings", () => {
  const defaults = anviConfig({});
  assert.equal(defaults.maxLiveSessions, 25);
  assert.equal(defaults.maxLiveSessionsPerTenant, 15);
  assert.equal(defaults.capacityRetrySeconds, 120);
  assert.equal(defaults.jsonCacheSeconds, 3600);
  assert.deepEqual(defaults.prices.live, { input: 0, output: 0 });
  assert.equal(defaults.priceCurrency, "USD");
  const custom = anviConfig({
    ANVI_MAX_LIVE_SESSIONS: "0", ANVI_MAX_LIVE_SESSIONS_PER_TENANT: "5000", ANVI_JSON_CACHE_SECONDS: "abc",
    ANVI_PRICE_LIVE_INPUT: "3.5", ANVI_PRICE_LIVE_OUTPUT: "-2", ANVI_PRICE_EVALUATE_OUTPUT: "1e9", ANVI_PRICE_CURRENCY: "inr",
  });
  assert.equal(custom.maxLiveSessions, 1);
  assert.equal(custom.maxLiveSessionsPerTenant, 1000);
  assert.equal(custom.jsonCacheSeconds, 3600);
  assert.deepEqual(custom.prices.live, { input: 3.5, output: 0 });
  assert.equal(custom.prices.evaluate.output, 10000);
  assert.equal(custom.priceCurrency, "USD");
});
