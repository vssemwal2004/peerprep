// WP4: hybrid extensions of the Gemini client (decision/evaluate chains, transcribeAudio, TTS, Live
// cumulative usage). The original client tests in anviGemini.test.js stay unchanged.
import assert from "node:assert/strict";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createGeminiClient, TRANSCRIBE_PROMPT_VERSION, usageDelta } from "../src/modules/anviInterview/anviInterview.gemini.js";

const KEY = "test-key-hybrid";
const config = anviConfig({
  GEMINI_API_KEY: KEY,
  ANVI_GENERATE_MODEL: "gemini-3.5-flash-lite",
  ANVI_TRANSCRIBE_MODEL: "gemini-3.5-flash-lite",
  ANVI_FALLBACK_MODELS: "fallback-b",
  ANVI_TTS_FALLBACK_MODEL: "gemini-3.8-flash-lite-tts",
});
const tick = () => new Promise((resolve) => setImmediate(resolve));

const USAGE = { promptTokenCount: 20, candidatesTokenCount: 10, totalTokenCount: 30 };
const reply = (parts, status = 200, usageMetadata = USAGE) => new Response(
  JSON.stringify(status === 200 ? { candidates: [{ content: { parts } }], usageMetadata } : { error: { message: "nope" } }), { status });
const audioReply = (pcm, { mimeType = "audio/L16;codec=pcm;rate=24000", usageMetadata } = {}) => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ inlineData: { mimeType, data: pcm.toString("base64") } }] } }],
  usageMetadata: usageMetadata || { promptTokenCount: 12, candidatesTokenCount: 300, totalTokenCount: 312, candidatesTokensDetails: [{ modality: "AUDIO", tokenCount: 300 }] },
}));

function scriptedFetcher(script) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, model: url.match(/models\/([^:]+):/)[1], body: JSON.parse(init.body), init });
    const next = script.shift();
    if (!next) throw new Error("unexpected call");
    return typeof next === "function" ? next(init) : next;
  };
  return { fetcher, calls };
}
const restClient = (script, overrides = {}, onUsage = null) => {
  const scripted = scriptedFetcher(script);
  return { ...scripted, client: createGeminiClient({ config: { ...config, ...overrides }, fetcher: scripted.fetcher, sleep: async () => {}, onUsage }) };
};

test("TTS requests never carry thinkingConfig; decision uses its configured thinking level", async () => {
  const pcm = Buffer.alloc(4800, 1);
  const { client, calls } = restClient([audioReply(pcm), reply([{ text: "{\"action\":\"next\"}" }])]);
  await client.synthesizeSpeech({ text: "Question three." });
  assert.equal(calls[0].body.generationConfig.thinkingConfig, undefined);
  assert.deepEqual(calls[0].body.generationConfig, {
    responseModalities: ["AUDIO"],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Aoede" } }, languageCode: "en-IN" },
  });
  assert.deepEqual(calls[0].body.contents, [{ role: "user", parts: [{ text: "Question three." }] }]);

  await client.generateJson({ usageKind: "decision", parts: "x", temperature: 0 });
  assert.deepEqual(calls[1].body.generationConfig.thinkingConfig, { thinkingLevel: config.thinkingByKind.decision });
  assert.equal(config.thinkingByKind.decision, "minimal");
  // Output is capped at decisionMaxOutputTokens (120 by default).
  assert.equal(calls[1].body.generationConfig.maxOutputTokens, 120);

  const custom = restClient([reply([{ text: "{}" }])], { thinkingByKind: { ...config.thinkingByKind, decision: "none" } });
  await custom.client.generateJson({ usageKind: "decision", parts: "x" });
  assert.equal(custom.calls[0].body.generationConfig.thinkingConfig, undefined, "level none sends nothing");
});

test("the decision chain excludes generateModel and the default fallbacks, and is never cached", async () => {
  const { client, calls } = restClient([reply([], 429), reply([], 429), reply([{ text: "{\"a\":1}" }]), reply([{ text: "{\"a\":2}" }])]);
  await assert.rejects(client.generateJson({ usageKind: "decision", parts: "x", temperature: 0 }), (error) => error.code === "GEMINI_UNAVAILABLE");
  assert.deepEqual(calls.map((call) => call.model), [config.decisionModel, config.decisionModel]);
  // Identical temperature-0 decision calls each go to Gemini (no tenant in the cache key).
  assert.deepEqual(await client.generateJson({ usageKind: "decision", parts: "y", temperature: 0 }), { a: 1 });
  assert.deepEqual(await client.generateJson({ usageKind: "decision", parts: "y", temperature: 0 }), { a: 2 });
  assert.equal(calls.length, 4);

  const explicit = restClient([reply([], 404), reply([{ text: "{\"ok\":1}" }])]);
  const result = await explicit.client.generateJson({ usageKind: "evaluate", model: "gemini-3.6-flash", fallbackModels: ["gemini-3.5-flash-lite"], includeDefaultFallback: false, parts: "z", withMeta: true });
  assert.deepEqual(explicit.calls.map((call) => call.model), ["gemini-3.6-flash", "gemini-3.5-flash-lite"]);
  assert.deepEqual(result, { value: { ok: 1 }, model: "gemini-3.5-flash-lite", tokens: { input: 20, output: 10, total: 30, cached: 0, thoughts: 0 } });

  const replaced = restClient([reply([], 503), reply([], 503)]);
  await assert.rejects(replaced.client.generateJson({ models: ["only-model"], parts: "q" }));
  assert.deepEqual(replaced.calls.map((call) => call.model), ["only-model", "only-model"]);
});

test("withMeta reports the fallback model that answered; plain calls still resolve to the value", async () => {
  const seen = [];
  const { client, calls } = restClient([reply([], 429), reply([], 503), reply([{ text: "{\"ok\":true}" }])], {}, (usage) => seen.push(usage));
  const meta = await client.generateJson({ parts: "x", withMeta: true });
  assert.deepEqual(calls.map((call) => call.model), ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "fallback-b"]);
  assert.equal(meta.model, "fallback-b");
  assert.deepEqual(meta.value, { ok: true });
  assert.deepEqual(seen.map((usage) => [usage.kind, usage.model]), [["generate", "fallback-b"]]);

  // A cached temperature-0 call returns the same meta without a second request.
  const cached = restClient([reply([{ text: "{\"n\":1}" }])]);
  const first = await cached.client.generateJson({ parts: "c", temperature: 0, withMeta: true });
  const second = await cached.client.generateJson({ parts: "c", temperature: 0 });
  assert.equal(first.model, "gemini-3.5-flash-lite");
  assert.deepEqual(second, { n: 1 });
  assert.equal(cached.calls.length, 1);

  // An explicit thinkingKind opts a generate call into thinkingByKind.
  const thinking = restClient([reply([{ text: "{}" }])], { thinkingByKind: { ...config.thinkingByKind, evaluate: "medium" } });
  await thinking.client.generateJson({ usageKind: "evaluate", thinkingKind: "evaluate", parts: "e" });
  assert.deepEqual(thinking.calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: "medium" });
});

test("synthesizeSpeech parses inlineData, meters tts with audio modality and seconds, and falls back on 429", async () => {
  const seen = [];
  const pcm = Buffer.alloc(24000 * 2 * 2, 3); // 2 s at 24 kHz
  const { client, calls } = restClient([reply([], 429), reply([], 429), audioReply(pcm, { usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 50, totalTokenCount: 62 } })], {}, (usage) => seen.push(usage));
  const clip = await client.synthesizeSpeech({ text: "  Tell me   about\nyour project. ", voice: "Kore", style: "Say warmly" });
  assert.deepEqual(calls.map((call) => call.model), ["gemini-3.8-flash-tts", "gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]);
  assert.equal(calls[0].body.contents[0].parts[0].text, "Say warmly:\n\"Tell me about your project.\"");
  assert.equal(calls[0].body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore");
  assert.equal(calls.every((call) => call.body.generationConfig.thinkingConfig === undefined), true);
  assert.equal(clip.model, "gemini-3.8-flash-lite-tts");
  assert.equal(clip.sampleRate, 24000);
  assert.equal(clip.pcm.length, pcm.length);
  assert.equal(clip.durationMs, 2000);
  assert.equal(clip.audioSeconds, 2);
  assert.equal(clip.attempts, 3);
  assert.deepEqual(seen, [{
    kind: "tts", model: "gemini-3.8-flash-lite-tts", audioSeconds: 2,
    tokens: { input: 12, output: 50, total: 62, cached: 0, thoughts: 0, outputByModality: { AUDIO: 50 } },
  }]);

  // Without a fallback model configured the chain is the TTS model only.
  const single = restClient([reply([], 503), reply([], 503)], { ttsFallbackModel: "" });
  await assert.rejects(single.client.synthesizeSpeech({ text: "Hello." }), (error) => error.code === "GEMINI_UNAVAILABLE");
  assert.deepEqual(single.calls.map((call) => call.model), ["gemini-3.8-flash-tts", "gemini-3.8-flash-tts"]);

  // A text-only reply is unusable audio; an empty line is refused before any call.
  const textOnly = restClient([reply([{ text: "hi" }]), reply([{ text: "hi" }])]);
  await assert.rejects(textOnly.client.synthesizeSpeech({ text: "Hello." }), (error) => error.code === "GEMINI_INVALID_RESPONSE");
  const none = restClient([]);
  await assert.rejects(none.client.synthesizeSpeech({ text: "   " }), (error) => error.code === "GEMINI_INVALID_REQUEST");
  assert.equal(none.calls.length, 0);
});

test("an oversize TTS response is rejected without trying the fallback model", async () => {
  const big = Buffer.alloc(8 * 1024 * 1024 + 4096, 1);
  const { client, calls } = restClient([audioReply(big)]);
  await assert.rejects(client.synthesizeSpeech({ text: "Too long." }), (error) => error.code === "GEMINI_RESPONSE_TOO_LARGE");
  assert.equal(calls.length, 1);
});

test("transcribeAudio returns its meta; the accurate chain has no fallback and reads audioTranscription", async () => {
  const pcm = Buffer.alloc(16000 * 2 * 3, 7);
  const cheap = restClient([reply([{ text: " Hash maps use buckets. " }])]);
  const meta = await cheap.client.transcribeAudio({ pcm, language: "English" });
  assert.deepEqual(meta, {
    text: "Hash maps use buckets.", model: "gemini-3.5-flash-lite", attempts: 1, audioSeconds: 3,
    tokens: { input: 20, output: 10, total: 30, cached: 0, thoughts: 0 }, invalid: false, promptVersion: TRANSCRIBE_PROMPT_VERSION,
  });
  assert.deepEqual(cheap.calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: config.thinkingByKind.transcribe });

  const seen = [];
  const accurate = restClient([reply([], 429), reply([], 429)], {}, (usage) => seen.push(usage));
  await assert.rejects(accurate.client.transcribeAudio({ pcm, kind: "transcribe_accurate" }), (error) => error.code === "GEMINI_UNAVAILABLE");
  assert.deepEqual(accurate.calls.map((call) => call.model), ["gemini-3.5-transcribe", "gemini-3.5-transcribe"]);
  assert.equal(accurate.calls[0].body.generationConfig.thinkingConfig, undefined, "gemini-3.5-transcribe rejects every thinking level");

  const shaped = restClient([reply([{ audioTranscription: { text: "Consistent hashing spreads keys." } }])], {}, (usage) => seen.push(usage));
  const exact = await shaped.client.transcribeAudio({ pcm, kind: "transcribe_accurate" });
  assert.equal(exact.text, "Consistent hashing spreads keys.");
  assert.equal(exact.model, "gemini-3.5-transcribe");
  assert.equal(exact.invalid, false);
  assert.deepEqual(seen.map((usage) => [usage.kind, usage.model, usage.audioSeconds]), [["transcribe_accurate", "gemini-3.5-transcribe", 3]]);

  // Billed but empty: invalid, so the caller can treat it as unusable.
  const empty = restClient([reply([{ audioTranscription: { text: "" } }])]);
  const blank = await empty.client.transcribeAudio({ pcm, kind: "transcribe_accurate" });
  assert.equal(blank.text, "");
  assert.equal(blank.invalid, true);

  const quiet = restClient([]);
  assert.deepEqual(await quiet.client.transcribeAudio({ pcm: Buffer.alloc(100) }), {
    text: "", model: null, attempts: 0, audioSeconds: 0, tokens: null, invalid: false, promptVersion: TRANSCRIBE_PROMPT_VERSION,
  });
  assert.equal(quiet.calls.length, 0);

  // transcribePcm keeps its legacy chain and thinking.
  const legacy = restClient([reply([], 503), reply([], 503), reply([{ text: "words" }])]);
  assert.equal(await legacy.client.transcribePcm({ pcm }), "words");
  assert.deepEqual(legacy.calls.map((call) => call.model), ["gemini-3.5-flash-lite", "gemini-3.5-flash-lite", "fallback-b"]);
  assert.deepEqual(legacy.calls[0].body.generationConfig.thinkingConfig, { thinkingLevel: "low" });
});

const sse = (events, chunkSize = 0) => {
  const text = events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join("");
  if (!chunkSize) return new Response(text, { headers: { "Content-Type": "text/event-stream" } });
  const bytes = new TextEncoder().encode(text);
  return new Response(new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      controller.close();
    },
  }));
};
const audioEvent = (pcm, usageMetadata) => ({
  candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm.toString("base64") } }] } }],
  ...(usageMetadata ? { usageMetadata } : {}),
});

test("streamSpeech yields PCM chunks, a final summary, and reports usage once", async () => {
  const seen = [];
  const { client, calls } = restClient([
    reply([], 404),
    sse([audioEvent(Buffer.alloc(4800, 1)), audioEvent(Buffer.alloc(4801, 2), { candidatesTokenCount: 10 }), audioEvent(Buffer.alloc(4799, 3), { promptTokenCount: 8, candidatesTokenCount: 40, totalTokenCount: 48 })], 37),
  ], { ttsModel: "gemini-old-tts", ttsFallbackModel: "gemini-3.8-flash-tts" }, (usage) => seen.push(usage));
  const chunks = [];
  for await (const chunk of client.streamSpeech({ text: "One quick follow-up on that." })) chunks.push(chunk);
  assert.match(calls[1].url, /models\/gemini-3\.8-flash-tts:streamGenerateContent\?alt=sse$/);
  assert.equal(calls[1].body.generationConfig.thinkingConfig, undefined);
  assert.deepEqual(chunks.map((chunk) => [chunk.part, chunk.final, chunk.pcm.length]), [[0, false, 4800], [1, false, 4800], [2, false, 4800], [3, true, 0]]);
  const last = chunks.at(-1);
  assert.equal(last.model, "gemini-3.8-flash-tts");
  assert.equal(last.durationMs, 300);
  assert.deepEqual(seen, [{ kind: "tts", model: "gemini-3.8-flash-tts", audioSeconds: 0.3, tokens: { input: 8, output: 40, total: 48, cached: 0, thoughts: 0, outputByModality: { AUDIO: 40 } } }]);

  // Stopping early still meters once.
  const early = [];
  const stopped = restClient([sse([audioEvent(Buffer.alloc(4800, 1), USAGE), audioEvent(Buffer.alloc(4800, 1), USAGE)])], {}, (usage) => early.push(usage));
  for await (const chunk of stopped.client.streamSpeech({ text: "Okay." })) { assert.equal(chunk.part, 0); break; }
  await tick();
  assert.equal(early.length, 1);

  // With streaming off it wraps synthesizeSpeech.
  const off = restClient([audioReply(Buffer.alloc(9600, 1))], { ttsStreaming: false });
  const parts = [];
  for await (const chunk of off.client.streamSpeech({ text: "Right." })) parts.push([chunk.part, chunk.final, chunk.pcm.length]);
  assert.deepEqual(parts, [[0, false, 9600], [1, true, 0]]);
  assert.match(off.calls[0].url, /:generateContent$/);
});

test("Live cumulative usage is converted to deltas; the default delta setting is unchanged", async () => {
  class FakeSocket {
    static last = null;
    constructor() { Object.assign(this, { readyState: 0, listeners: {} }); FakeSocket.last = this; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatch(type, event = {}) { for (const listener of this.listeners[type] || []) listener(event); }
    send() {}
    close() { this.readyState = 3; }
    receive(payload) { this.dispatch("message", { data: JSON.stringify(payload) }); }
  }
  const run = async (semantics) => {
    const seen = [];
    const client = createGeminiClient({ config: { ...config, liveUsageSemantics: semantics }, WebSocketImpl: FakeSocket, onUsage: (usage) => seen.push(usage.tokens.output) });
    const pending = client.openLive({ systemText: "S" });
    const socket = FakeSocket.last;
    socket.readyState = 1;
    socket.dispatch("open");
    socket.receive({ setupComplete: {} });
    const live = await pending;
    for (const count of [100, 150, 150, 230]) socket.receive({ usageMetadata: { responseTokenCount: count } });
    await tick();
    live.close();
    return seen;
  };
  assert.deepEqual(await run("cumulative"), [100, 50, 80], "a repeated total bills nothing");
  assert.deepEqual(await run("delta"), [100, 150, 150, 230]);

  const seen = {};
  assert.deepEqual(usageDelta(seen, { input: 10, output: 5, total: 15, cached: 0, thoughts: 0, outputByModality: { AUDIO: 5 } }),
    { input: 10, output: 5, total: 15, cached: 0, thoughts: 0, outputByModality: { AUDIO: 5 } });
  assert.deepEqual(usageDelta(seen, { input: 12, output: 9, total: 21, cached: 0, thoughts: 0, outputByModality: { AUDIO: 9 } }),
    { input: 2, output: 4, total: 6, cached: 0, thoughts: 0, outputByModality: { AUDIO: 4 } });
});
