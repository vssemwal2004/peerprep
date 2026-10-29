// Gemini transport for ANVI: the Live WebSocket for the spoken conversation, and REST generateContent for
// per-answer transcription and question generation. The API key only ever travels in the Live URL and the
// x-goog-api-key header; never log either. Wire format follows the Phase 0 spike (live_led.mjs, stt.mjs).
import { createHash } from "node:crypto";
import { anviConfig } from "./anviInterview.config.js";
import { parseWav } from "./anviInterview.wav.js";
import { readBounded } from "../../services/avatarProviders.js";

const REST_BASE = "https://generativelanguage.googleapis.com/v1beta";
const LIVE_BASE = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
const MODEL_ID = /^[a-zA-Z0-9._-]{1,100}$/;
const WS_OPEN = 1;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
// Inline requests are capped at 20 MB; 4 minutes of 16 kHz PCM is ~7.7 MB (~10 MB as base64).
const TRANSCRIBE_CHUNK_BYTES = 16000 * 2 * 60 * 4;
const MIN_TRANSCRIBE_BYTES = 3200;
const MAX_TRANSCRIPT_CHARS = 20000;
const TRANSCRIBE_PROMPT = "Transcribe verbatim in the language spoken; keep technical terms in English.";
const SCRIPT_HINTS = {
  // Faithful, never translated: Hindi stays visible (in Devanagari) so an off-language answer can be flagged.
  English: "The speaker is an Indian university student in an English interview and may speak Hindi or mix in Hindi words. Write English in Latin script and any Hindi exactly as spoken in Devanagari; never translate it into English.",
  Hinglish: "The speaker mixes Hindi and English (Hinglish); write the Hindi words in Roman script.",
  Hindi: "The speaker uses Hindi; write Hindi in Devanagari and English technical terms in Latin script.",
};
const NO_SPEECH = /^\W*(?:no speech|silence|\(?inaudible\)?|no audio)\W*$/i;
const PCM_BYTES_PER_SECOND = 16000 * 2;
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;
const JSON_CACHE_ENTRIES = 100;
// Bumped whenever TRANSCRIBE_PROMPT or SCRIPT_HINTS change; callers key transcript caches by it.
export const TRANSCRIBE_PROMPT_VERSION = "t1";
const JSON_KINDS = new Set(["generate", "evaluate", "decision"]);
// TTS: 24 kHz s16le mono comes back inline as base64. 8 MB of PCM is ~175 s of speech.
const MAX_TTS_PCM_BYTES = 8 * 1024 * 1024;
const MAX_TTS_RESPONSE_BYTES = Math.ceil((MAX_TTS_PCM_BYTES * 4) / 3) + 256 * 1024;
const MAX_TTS_TEXT_CHARS = 2000;
const TTS_SAMPLE_RATE = 24000;
const TTS_MODEL = /(?:^|[-_.])tts(?:$|[-_.])/i;
const VOICE_ID = /^[A-Za-z]{2,40}$/;
const LANGUAGE_CODE = /^[a-z]{2}-[A-Z]{2}$/;

export class GeminiError extends Error {
  constructor(code, message, { status = null, retryable = false } = {}) {
    super(message);
    this.name = "GeminiError";
    Object.assign(this, { code, status, retryable });
  }
}

// Contains the API key: pass it straight to the WebSocket constructor and never log it.
export function liveUrl(apiKey) {
  return `${LIVE_BASE}?key=${encodeURIComponent(apiKey)}`;
}

export function pcmToWav(pcm, sampleRate = 16000) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const toBuffer = (value) => {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return Buffer.alloc(0);
};

async function frameText(data) {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return toBuffer(data).toString("utf8");
  if (typeof data?.arrayBuffer === "function") return Buffer.from(await data.arrayBuffer()).toString("utf8");
  return "";
}

// Listener failures are reported as "error" instead of escaping into the socket callbacks.
function createEmitter() {
  const listeners = new Map();
  const emit = (event, ...args) => {
    for (const listener of [...(listeners.get(event) || [])]) {
      try {
        listener(...args);
      } catch (error) {
        if (event !== "error") emit("error", error);
      }
    }
  };
  return {
    on(event, listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(listener);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
    emit,
  };
}

function responseText(result) {
  if (result?.promptFeedback?.blockReason) return null;
  const parts = result?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  // gemini-3.5-transcribe answers in parts[].audioTranscription.text instead of parts[].text (WP0).
  return parts.filter((part) => !part?.thought).map((part) => part?.text || part?.audioTranscription?.text || "").join("");
}

const tooLarge = () => new GeminiError("GEMINI_RESPONSE_TOO_LARGE", "Gemini returned more audio than allowed.");
const isTooLarge = (error) => error?.code === "GEMINI_RESPONSE_TOO_LARGE" || error?.code === "PROVIDER_RESPONSE_TOO_LARGE";
const sampleRateOf = (mimeType) => {
  const rate = Number((String(mimeType || "").match(/rate=(\d+)/i) || [])[1]);
  return Number.isFinite(rate) && rate >= 8000 && rate <= 48000 ? rate : TTS_SAMPLE_RATE;
};
const isPcmMime = (mimeType) => !mimeType || /^audio\/(?:l16|pcm)\b/i.test(String(mimeType));
const isWavMime = (mimeType) => /^audio\/(?:x-)?(?:wav|wave)\b/i.test(String(mimeType || ""));

// The inline L16 audio of a TTS response, or null when there is none. Oversize audio is rejected
// before it is decoded.
function inlineAudio(result) {
  if (result?.promptFeedback?.blockReason) return null;
  const parts = result?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const audio = parts.filter((part) => typeof part?.inlineData?.data === "string" && part.inlineData.data);
  if (!audio.length) return null;
  const mimeType = String(audio[0].inlineData.mimeType || "");
  const wav = isWavMime(mimeType);
  if (!wav && !isPcmMime(mimeType)) throw new Error("unsupported audio format");
  const encoded = audio.reduce((sum, part) => sum + part.inlineData.data.length, 0);
  if (Math.floor((encoded * 3) / 4) > MAX_TTS_PCM_BYTES + 3) throw tooLarge();
  if (wav) {
    // Non-streaming TTS now answers with a RIFF/WAVE file (WP0 re-run): one WAV per part, mono 16-bit PCM.
    const files = audio.map((part) => parseWav(Buffer.from(part.inlineData.data, "base64"), { sampleRate: null }));
    const sampleRate = files[0].sampleRate;
    if (files.some((file) => file.sampleRate !== sampleRate)) throw new Error("mixed audio sample rates");
    const pcm = Buffer.concat(files.map((file) => file.pcm));
    if (pcm.length > MAX_TTS_PCM_BYTES) throw tooLarge();
    if (!pcm.length) return null;
    return { pcm, mimeType: `audio/L16;rate=${sampleRate}`, sampleRate };
  }
  const pcm = Buffer.concat(audio.map((part) => Buffer.from(part.inlineData.data, "base64")));
  if (pcm.length > MAX_TTS_PCM_BYTES) throw tooLarge();
  const usable = pcm.subarray(0, pcm.length - (pcm.length % 2));
  if (!usable.length) return null;
  return { pcm: usable, mimeType: mimeType || `audio/L16;rate=${TTS_SAMPLE_RATE}`, sampleRate: sampleRateOf(mimeType) };
}

// TTS bills its output as audio; when the response has no modality breakdown, all output is audio.
const ttsTokens = (tokens) => (tokens.outputByModality ? tokens
  : { ...tokens, outputByModality: { AUDIO: Math.max(0, tokens.output - (tokens.thoughts || 0)) } });

// Tokens for TTS audio that arrived without a usage block: about 4 characters per text token and
// 25 audio tokens per second (Gemini's audio rate).
const estimatedTtsTokens = (text, seconds) => {
  const input = Math.max(1, Math.ceil(String(text || "").length / 4));
  const output = Math.max(1, Math.round(seconds * 25));
  return { input, output, total: input + output, cached: 0, thoughts: 0, inputByModality: { TEXT: input }, outputByModality: { AUDIO: output }, estimated: true };
};

const TOKEN_FIELDS = ["input", "output", "total", "cached", "thoughts"];
function addTokens(sum, tokens) {
  if (!tokens) return sum;
  if (!sum) return structuredClone(tokens);
  for (const field of TOKEN_FIELDS) sum[field] = (sum[field] || 0) + (tokens[field] || 0);
  for (const map of ["inputByModality", "outputByModality"]) {
    if (!tokens[map]) continue;
    sum[map] ||= {};
    for (const [key, value] of Object.entries(tokens[map])) sum[map][key] = (sum[map][key] || 0) + value;
  }
  return sum;
}

/**
 * Turns cumulative usage blocks into per-message deltas against a running high-water mark (mutated).
 * Null when nothing new was billed.
 */
export function usageDelta(seen, tokens) {
  const delta = {};
  let any = false;
  for (const field of TOKEN_FIELDS) {
    const value = tokens[field] || 0;
    delta[field] = Math.max(0, value - (seen[field] || 0));
    seen[field] = Math.max(seen[field] || 0, value);
    if (delta[field]) any = true;
  }
  for (const map of ["inputByModality", "outputByModality"]) {
    if (!tokens[map]) continue;
    seen[map] ||= {};
    const out = {};
    for (const [key, value] of Object.entries(tokens[map])) {
      const step = Math.max(0, value - (seen[map][key] || 0));
      seen[map][key] = Math.max(seen[map][key] || 0, value);
      if (step) out[key] = step;
    }
    if (Object.keys(out).length) delta[map] = out;
  }
  return any ? delta : null;
}

// Server-sent events from a streamGenerateContent?alt=sse body: yields each event's data payload.
async function* sseEvents(body, maxBytes) {
  if (!body) return;
  const decoder = new TextDecoder();
  let buffer = "";
  let bytes = 0;
  const payload = (event) => event.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
  for await (const chunk of body) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw tooLarge();
    buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
    let index;
    while ((index = buffer.indexOf("\n\n")) >= 0) {
      const data = payload(buffer.slice(0, index));
      buffer = buffer.slice(index + 2);
      if (data) yield data;
    }
  }
  const rest = payload((buffer + decoder.decode()).replace(/\r\n/g, "\n"));
  if (rest) yield rest;
}

const unique = (models) => [...new Set(models.filter((model) => MODEL_ID.test(String(model || ""))))];
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const tokenCount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
};
const byModality = (details) => {
  if (!Array.isArray(details)) return undefined;
  const out = {};
  for (const row of details) {
    const key = String(row?.modality || "").toUpperCase();
    if (/^[A-Z_]{1,24}$/.test(key)) out[key] = (out[key] || 0) + tokenCount(row?.tokenCount);
  }
  return Object.keys(out).length ? out : undefined;
};

/**
 * Token counts from a usageMetadata block: REST uses candidatesTokenCount, Live uses responseTokenCount.
 * Thinking tokens are billed as output, so they are included in `output` (and kept apart in `thoughts`).
 * Null when the block is missing or empty.
 */
export function usageTokens(meta) {
  if (!meta || typeof meta !== "object") return null;
  const thoughts = tokenCount(meta.thoughtsTokenCount);
  const input = tokenCount(meta.promptTokenCount) + tokenCount(meta.toolUsePromptTokenCount);
  const output = tokenCount(meta.candidatesTokenCount ?? meta.responseTokenCount) + thoughts;
  const total = tokenCount(meta.totalTokenCount) || input + output;
  if (!input && !output && !total) return null;
  const inputByModality = byModality(meta.promptTokensDetails);
  const outputByModality = byModality(meta.candidatesTokensDetails ?? meta.responseTokensDetails);
  return {
    input, output, total, cached: tokenCount(meta.cachedContentTokenCount), thoughts,
    ...(inputByModality ? { inputByModality } : {}),
    ...(outputByModality ? { outputByModality } : {}),
  };
}

// Node's global fetch already pools keep-alive connections. When the undici package is installed, its
// own fetch with a longer-lived Agent is used instead (a matched pair, so no cross-version dispatcher).
let keepAliveFetch;
const loadKeepAliveFetch = () => (keepAliveFetch ||= import("undici")
  .then(({ Agent, fetch: undiciFetch }) => {
    if (typeof Agent !== "function" || typeof undiciFetch !== "function") return null;
    const dispatcher = new Agent({ keepAliveTimeout: 30_000, keepAliveMaxTimeout: 120_000, connections: 32 });
    return (url, init) => undiciFetch(url, { ...init, dispatcher });
  })
  .catch(() => null));

/**
 * `onUsage({kind, model, tokens, audioSeconds?})` is called for every billed Gemini response, from the
 * client option and from the per-call `onUsage` option. Metering never fails a call: handler errors
 * (and rejected promises) are swallowed.
 */
export function createGeminiClient({ config = anviConfig(), fetcher = null, WebSocketImpl = globalThis.WebSocket, sleep = defaultSleep, onUsage = null } = {}) {
  const scrub = (text) => (config.apiKey ? String(text).split(config.apiKey).join("[redacted]") : String(text));
  const send = async (url, init) => (fetcher || (await loadKeepAliveFetch()) || globalThis.fetch)(url, init);
  const report = (callUsage, usage) => {
    for (const handler of [onUsage, callUsage]) {
      if (typeof handler !== "function") continue;
      try {
        const result = handler(usage);
        if (typeof result?.catch === "function") result.catch(() => {});
      } catch { /* metering never breaks a call */ }
    }
  };
  const ceilingFor = (kind) => {
    if (kind === "decision") return Number(config.decisionMaxOutputTokens) || 120;
    if (kind === "transcribe_accurate") return Number(config.maxOutputTokens?.transcribe) || DEFAULT_MAX_OUTPUT_TOKENS;
    return Number(config.maxOutputTokens?.[kind]) || DEFAULT_MAX_OUTPUT_TOKENS;
  };
  // Thinking per call. An explicit `thinkingKind` uses config.thinkingByKind (where "none" sends nothing);
  // without one, existing callers keep the legacy "low" for gemini-3 models. TTS models reject any
  // thinkingConfig (WP0), so they never get one.
  const thinkingFor = (model, thinkingKind) => {
    if (TTS_MODEL.test(model) || thinkingKind === "tts" || !/^gemini-3/.test(model)) return {};
    if (!thinkingKind) return { thinkingConfig: { thinkingLevel: "low" } };
    const level = config.thinkingByKind?.[thinkingKind];
    return level && level !== "none" ? { thinkingConfig: { thinkingLevel: level } } : {};
  };
  // Small LRU of in-flight or recent deterministic generateJson results: key -> { at, promise }.
  const jsonCache = new Map();
  function cachedJson(key, ttlMs, work) {
    const now = Date.now();
    const hit = jsonCache.get(key);
    jsonCache.delete(key);
    if (hit && now - hit.at < ttlMs) {
      jsonCache.set(key, hit);
      return hit.promise.then((value) => structuredClone(value));
    }
    const promise = work();
    jsonCache.set(key, { at: now, promise });
    while (jsonCache.size > JSON_CACHE_ENTRIES) jsonCache.delete(jsonCache.keys().next().value);
    // Failures are never cached.
    promise.catch(() => { if (jsonCache.get(key)?.promise === promise) jsonCache.delete(key); });
    return promise.then((value) => structuredClone(value));
  }

  // `resumeHandle` continues an earlier session with its conversation context (session resumption).
  // Resumption and sliding-window compression are on unless config.liveResumption is false; neither was
  // verified in the Phase 0 spike, so ANVI_LIVE_RESUMPTION=false turns both off.
  // `languageCode` (e.g. "en-IN") steers the Live voice's accent; Gemini accepted en-IN and hi-IN in the
  // 2026-10-22 voice comparison.
  // Live servers attach usageMetadata to some messages (model-dependent); each one is reported as it
  // arrives, and a session that never sends one is simply not metered in tokens. With
  // config.liveUsageSemantics "cumulative" each block is converted to a delta against this session's
  // high-water mark; the default "delta" reports blocks as they come (WP0 measured per-turn counts).
  function openLive({ systemText = "", voice = config.liveVoice, silenceMs = config.silenceMs, model = config.liveModel, setupTimeoutMs = 15000, resumeHandle = null, languageCode = null, onUsage: callUsage = null } = {}) {
    if (!config.apiKey) return Promise.reject(new GeminiError("GEMINI_UNAVAILABLE", "GEMINI_API_KEY is not configured."));
    if (!MODEL_ID.test(String(model || ""))) return Promise.reject(new GeminiError("GEMINI_UNAVAILABLE", "The ANVI Live model id is invalid."));
    if (typeof WebSocketImpl !== "function") return Promise.reject(new GeminiError("GEMINI_UNAVAILABLE", "WebSocket is not available in this runtime."));

    return new Promise((resolve, reject) => {
      const events = createEmitter();
      let ws;
      let ready = false, settled = false, closing = false, ended = false;
      let queue = Promise.resolve();
      const cumulative = config.liveUsageSemantics === "cumulative";
      const usageSeen = {};
      const live = () => ready && !closing && !ended;
      const emit = (event, ...args) => {
        if (live()) events.emit(event, ...args);
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        closing = true;
        clearTimeout(timer);
        try { ws?.close(); } catch { /* already closed */ }
        reject(error);
      };
      const send = (payload) => {
        if (closing || ended || ws.readyState !== WS_OPEN) return false;
        try {
          ws.send(JSON.stringify(payload));
          return true;
        } catch {
          return false;
        }
      };

      const session = {
        on(event, listener) { events.on(event, listener); return session; },
        off(event, listener) { events.off(event, listener); return session; },
        get open() { return live(); },
        sendAudio(pcm) {
          const audio = toBuffer(pcm);
          if (!audio.length || !ready) return false;
          return send({ realtimeInput: { audio: { data: audio.toString("base64"), mimeType: "audio/pcm;rate=16000" } } });
        },
        // turnComplete: false adds context without asking the model to reply.
        sendText(text, { turnComplete = true } = {}) {
          const value = String(text ?? "").trim();
          if (!value || !ready) return false;
          return send({ clientContent: { turns: [{ role: "user", parts: [{ text: value }] }], turnComplete } });
        },
        // `closed` still fires once the socket closes, with byClient: true.
        close() {
          if (closing || ended) return;
          closing = true;
          try { ws.close(1000, "done"); } catch { /* already closed */ }
        },
      };

      const timer = setTimeout(() => fail(new GeminiError("GEMINI_TIMEOUT", "Gemini Live did not finish setup in time.", { retryable: true })), setupTimeoutMs);

      async function handle(data) {
        if (closing || ended) return;
        let message;
        try {
          message = JSON.parse(await frameText(data));
        } catch {
          return;
        }
        if (closing || ended || !message || typeof message !== "object") return;
        if (message.setupComplete && !ready) {
          ready = true;
          settled = true;
          clearTimeout(timer);
          resolve(session);
          return;
        }
        if (message.error) {
          const error = new GeminiError("LIVE_ERROR", scrub(message.error.message || "Gemini Live reported an error.").slice(0, 300), { status: message.error.code ?? null });
          if (!ready) fail(error);
          else emit("error", error);
          return;
        }
        if (!ready) return;
        const usage = usageTokens(message.usageMetadata);
        const tokens = usage && cumulative ? usageDelta(usageSeen, usage) : usage;
        if (tokens) report(callUsage, { kind: "live", model, tokens });
        if (message.goAway) emit("goAway", { timeLeft: message.goAway.timeLeft ?? null });
        const update = message.sessionResumptionUpdate;
        if (update && typeof update.newHandle === "string" && update.newHandle && update.resumable !== false) emit("resumption", { handle: update.newHandle });
        const content = message.serverContent;
        if (!content) return;
        if (content.inputTranscription?.text) emit("inputText", content.inputTranscription.text);
        if (content.outputTranscription?.text) emit("outputText", content.outputTranscription.text);
        for (const part of content.modelTurn?.parts || []) {
          if (part?.inlineData?.data) emit("audio", Buffer.from(part.inlineData.data, "base64"));
        }
        if (content.interrupted) emit("interrupted");
        if (content.turnComplete) emit("turnComplete");
      }

      try {
        ws = new WebSocketImpl(liveUrl(config.apiKey));
      } catch {
        clearTimeout(timer);
        reject(new GeminiError("GEMINI_UNAVAILABLE", "Could not open the Gemini Live connection.", { retryable: true }));
        return;
      }
      try { ws.binaryType = "arraybuffer"; } catch { /* Blob frames are handled too */ }

      ws.addEventListener("open", () => {
        send({
          setup: {
            model: `models/${model}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                ...(/^[a-z]{2}-[A-Z]{2}$/.test(String(languageCode || "")) ? { languageCode } : {}),
              },
            },
            systemInstruction: { parts: [{ text: systemText }] },
            realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: silenceMs } },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            ...(config.liveResumption === false ? {} : {
              sessionResumption: resumeHandle ? { handle: String(resumeHandle) } : {},
              contextWindowCompression: {
                triggerTokens: config.liveContextTriggerTokens,
                slidingWindow: { targetTokens: Math.min(config.liveContextTargetTokens, config.liveContextTriggerTokens) },
              },
            }),
          },
        });
      });
      // Blob frames decode asynchronously; the queue keeps audio and transcript chunks in arrival order.
      ws.addEventListener("message", (event) => {
        queue = queue.then(() => handle(event.data)).catch(() => {});
      });
      ws.addEventListener("error", () => {
        if (!ready) fail(new GeminiError("GEMINI_UNAVAILABLE", "Gemini Live connection failed.", { retryable: true }));
        else emit("error", new GeminiError("LIVE_ERROR", "Gemini Live connection error.", { retryable: true }));
      });
      ws.addEventListener("close", (event) => {
        const code = event?.code ?? 1006;
        const reason = scrub(event?.reason || "").slice(0, 200);
        if (!ready) {
          fail(new GeminiError("GEMINI_UNAVAILABLE", `Gemini Live closed during setup (${code}${reason ? `: ${reason}` : ""}).`, { status: code, retryable: true }));
          return;
        }
        if (ended) return;
        const byClient = closing;
        ended = true;
        events.emit("closed", { code, reason, byClient });
      });
    });
  }

  // One REST call through the model chain: retry once on 429/5xx/network, skip a 404 (retired) model,
  // and fail fast on other 4xx. `parse` rejecting a response moves on to the next model.
  // A response that was billed is metered even when `parse` then rejects it.
  // `extract` picks the payload from the parsed response (text by default; null = unusable), and
  // `usageExtras(result, tokens, extracted)` may override the metered tokens/audioSeconds. With
  // `oversizeFatal` an oversized response fails the call instead of trying the next model.
  // Resolves to { value, model, tokens, attempts }; `request` below resolves to the value only.
  async function requestMeta({ models, systemText, parts, generationConfig, timeoutMs, parse = (text) => text, extract = responseText, kind = "generate", thinkingKind = null, onUsage: callUsage = null, audioSeconds = 0, usageExtras = null, maxResponseBytes = MAX_RESPONSE_BYTES, oversizeFatal = false }) {
    if (!config.apiKey) throw new GeminiError("GEMINI_UNAVAILABLE", "GEMINI_API_KEY is not configured.");
    const chain = unique(models);
    const deadline = Date.now() + timeoutMs;
    const timeout = () => new GeminiError("GEMINI_TIMEOUT", "Gemini did not respond in time.", { retryable: true });
    let lastError = new GeminiError("GEMINI_UNAVAILABLE", "No valid Gemini model is configured.");
    let attempts = 0;
    for (const model of chain) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw timeout();
        const thinking = thinkingFor(model, thinkingKind);
        attempts += 1;
        let response;
        try {
          response = await send(`${REST_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
            body: JSON.stringify({
              ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
              contents: [{ role: "user", parts }],
              generationConfig: { ...generationConfig, ...thinking },
            }),
            signal: AbortSignal.timeout(remaining),
            redirect: "error",
          });
        } catch (error) {
          if (error?.name === "TimeoutError" || error?.name === "AbortError") throw timeout();
          lastError = new GeminiError("GEMINI_UNAVAILABLE", "Gemini could not be reached.", { retryable: true });
          if (attempt === 0) { await sleep(Math.min(500, Math.max(0, deadline - Date.now()))); continue; }
          break;
        }
        const { status } = response;
        if (status === 404) {
          await response.body?.cancel?.();
          lastError = new GeminiError("GEMINI_UNAVAILABLE", `Gemini model ${model} is not available.`, { status });
          break;
        }
        if (status === 429 || status >= 500) {
          await response.body?.cancel?.();
          lastError = new GeminiError("GEMINI_UNAVAILABLE", `Gemini is busy (${status}).`, { status, retryable: true });
          if (attempt === 0) { await sleep(Math.min(800, Math.max(0, deadline - Date.now()))); continue; }
          break;
        }
        if (!response.ok) {
          await response.body?.cancel?.();
          throw new GeminiError("GEMINI_UNAVAILABLE", `Gemini rejected the request (${status}).`, { status });
        }
        try {
          const result = JSON.parse((await readBounded(response, maxResponseBytes)).toString("utf8"));
          let tokens = usageTokens(result?.usageMetadata);
          let extracted = null;
          let extractError = null;
          try { extracted = extract(result); } catch (error) { extractError = error; }
          // `usageExtras` may also supply tokens for a billed response that carried no usage block (TTS audio).
          let extras = null;
          if (typeof usageExtras === "function") {
            try { extras = usageExtras(result, tokens, extracted); } catch { /* metering never breaks a call */ }
          }
          if (extras?.tokens) tokens = extras.tokens;
          if (tokens) {
            const seconds = Number(extras?.audioSeconds ?? audioSeconds) || 0;
            report(callUsage, { kind, model, tokens, ...(seconds > 0 ? { audioSeconds: seconds } : {}) });
          }
          if (extractError) throw extractError;
          if (extracted === null || extracted === undefined) throw new Error("empty candidate");
          return { value: parse(extracted), model, tokens, attempts };
        } catch (error) {
          if (error?.name === "TimeoutError" || error?.name === "AbortError") throw timeout();
          if (oversizeFatal && isTooLarge(error)) throw tooLarge();
          lastError = new GeminiError("GEMINI_INVALID_RESPONSE", `Gemini model ${model} returned an unusable response.`);
          break;
        }
      }
    }
    throw lastError;
  }
  const request = (options) => requestMeta(options).then((meta) => meta.value);

  // `usageKind` labels the metered call ("generate", "evaluate" or "decision") and picks its output ceiling.
  // Temperature-0 calls are deterministic, so an identical one within config.jsonCacheSeconds reuses the
  // first answer (also while it is still in flight); `cache: false` opts out.
  // Model chain: `models` replaces it outright; otherwise [model, ...fallbackModels] plus, unless
  // `includeDefaultFallback` is false, config.generateModel and config.fallbackModels (today's chain).
  // A decision call defaults to [decisionModel, ...decisionFallbackModels] with no default fallback,
  // its own thinking level, and is never cached (the cache key has no tenant).
  // `thinkingKind` opts a call into config.thinkingByKind; `withMeta` resolves to { value, model, tokens }
  // with the model that actually answered.
  function generateJson({ model, models = null, fallbackModels = null, includeDefaultFallback, systemText = "", parts = [], schema, temperature = 0.2, timeoutMs = 30000, maxOutputTokens = DEFAULT_MAX_OUTPUT_TOKENS, usageKind = "generate", thinkingKind = null, onUsage: callUsage = null, cache = true, withMeta = false } = {}) {
    const kind = JSON_KINDS.has(usageKind) ? usageKind : "generate";
    const decision = kind === "decision";
    const withDefaults = includeDefaultFallback ?? !decision;
    const chain = Array.isArray(models) ? models : [
      model ?? (decision ? config.decisionModel : undefined),
      ...(Array.isArray(fallbackModels) ? fallbackModels : decision ? (config.decisionFallbackModels || []) : []),
      ...(withDefaults ? [config.generateModel, ...(config.fallbackModels || [])] : []),
    ];
    const finish = (promise) => promise.then((meta) => (withMeta ? { value: meta.value, model: meta.model, tokens: meta.tokens } : meta.value));
    const options = {
      models: chain,
      thinkingKind: decision ? "decision" : thinkingKind,
      systemText,
      parts: typeof parts === "string" ? [{ text: parts }] : parts,
      generationConfig: {
        temperature,
        maxOutputTokens: Math.max(1, Math.min(Number(maxOutputTokens) || DEFAULT_MAX_OUTPUT_TOKENS, ceilingFor(kind))),
        responseMimeType: "application/json",
        ...(schema ? { responseSchema: schema } : {}),
      },
      timeoutMs,
      kind,
      onUsage: callUsage,
      parse: (text) => {
        const value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
        if (!value || typeof value !== "object") throw new Error("not an object");
        return value;
      },
    };
    const ttlMs = Number(config.jsonCacheSeconds ?? 60) * 1000;
    if (decision || temperature !== 0 || cache === false || !(ttlMs > 0) || !config.apiKey) return finish(requestMeta(options));
    const key = createHash("sha256")
      .update(JSON.stringify([kind, unique(options.models), systemText, options.parts, options.generationConfig, ...(options.thinkingKind ? [options.thinkingKind] : [])]))
      .digest("hex");
    return finish(cachedJson(key, ttlMs, () => requestMeta(options)));
  }

  // Audio stays in memory: it is wrapped as WAV per request and nothing is written or logged.
  // `legacy` keeps transcribePcm's chain ([transcribeModel, ...fallbackModels]) and thinking unchanged.
  // The prompt is fixed, so a caller's `promptVersion` is not used; the result reports the version
  // that was actually sent.
  async function transcribe({ pcm, language = "English", model = null, kind = "transcribe", timeoutMs = 90000, fallbackModels = null, onUsage: callUsage = null } = {}, legacy = false) {
    const accurate = !legacy && kind === "transcribe_accurate";
    const usageKind = accurate ? "transcribe_accurate" : "transcribe";
    const primary = model || (accurate ? config.transcribeAccurateModel : config.transcribeModel);
    const chain = legacy ? [config.transcribeModel, ...(config.fallbackModels || [])]
      : accurate ? [primary]
        : [primary, ...(Array.isArray(fallbackModels) ? fallbackModels : (config.fallbackModels || []))];
    const result = { text: "", model: null, attempts: 0, audioSeconds: 0, tokens: null, invalid: false, promptVersion: TRANSCRIBE_PROMPT_VERSION };
    const audio = toBuffer(pcm);
    const usable = audio.subarray(0, audio.length - (audio.length % 2));
    if (usable.length < MIN_TRANSCRIBE_BYTES) return result;
    const prompt = `${TRANSCRIBE_PROMPT} ${SCRIPT_HINTS[language] || SCRIPT_HINTS.English} Output only the transcript, with no labels, timestamps or commentary. If there is no speech, output nothing.`;
    const pieces = [];
    for (let offset = 0; offset < usable.length; offset += TRANSCRIBE_CHUNK_BYTES) {
      const chunk = usable.subarray(offset, offset + TRANSCRIBE_CHUNK_BYTES);
      if (chunk.length < MIN_TRANSCRIBE_BYTES) break;
      const seconds = Math.round((chunk.length / PCM_BYTES_PER_SECOND) * 100) / 100;
      const meta = await requestMeta({
        models: chain,
        parts: [{ inlineData: { mimeType: "audio/wav", data: pcmToWav(chunk, 16000).toString("base64") } }, { text: prompt }],
        generationConfig: { temperature: 0, maxOutputTokens: ceilingFor(usageKind) },
        timeoutMs,
        kind: usageKind,
        thinkingKind: legacy ? null : usageKind,
        onUsage: callUsage,
        audioSeconds: seconds,
      });
      result.model = meta.model;
      result.attempts += meta.attempts;
      result.audioSeconds = Math.round((result.audioSeconds + seconds) * 100) / 100;
      result.tokens = addTokens(result.tokens, meta.tokens);
      const clean = meta.value.replace(/\s+/g, " ").trim();
      if (clean && !NO_SPEECH.test(clean)) pieces.push(clean);
    }
    result.text = pieces.join(" ").slice(0, MAX_TRANSCRIPT_CHARS);
    // Audio was sent but nothing usable came back (no speech, or an empty accurate transcript).
    result.invalid = result.attempts > 0 && !result.text;
    return result;
  }

  // Kept for the Live path: resolves to the transcript text only.
  async function transcribePcm(options = {}) {
    return (await transcribe(options, true)).text;
  }

  /**
   * Hybrid transcription with metadata: { text, model, attempts, audioSeconds, tokens, invalid, promptVersion }.
   * kind "transcribe" uses [model || transcribeModel, ...fallbackModels (default config.fallbackModels)];
   * kind "transcribe_accurate" uses [model || transcribeAccurateModel] only, metered as transcribe_accurate.
   */
  function transcribeAudio(options = {}) {
    return transcribe(options, false);
  }

  // Shared request pieces for synthesizeSpeech and streamSpeech. The text is NFC-normalised with
  // whitespace collapsed (the same normalisation as the asset textHash). Never logged.
  function ttsSpec({ text, voice = null, languageCode = null, style = null, model = null, fallbackModel, timeoutMs = null, onUsage: callUsage = null } = {}) {
    const line = String(text ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
    if (!line || line.length > MAX_TTS_TEXT_CHARS) throw new GeminiError("GEMINI_INVALID_REQUEST", "The text to speak is empty or too long.");
    const voiceName = [voice, config.ttsVoice, config.liveVoice, "Aoede"].find((value) => VOICE_ID.test(String(value || "")));
    const code = [languageCode, config.ttsLanguageCode].find((value) => LANGUAGE_CODE.test(String(value || "")));
    const directive = String(style ?? config.ttsStyleByLanguage?.English ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
    const fallback = fallbackModel === undefined ? config.ttsFallbackModel : fallbackModel;
    return {
      models: [model || config.ttsModel, ...(fallback ? [fallback] : [])],
      parts: [{ text: directive ? `${directive}:\n"${line}"` : line }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } }, ...(code ? { languageCode: code } : {}) },
      },
      timeoutMs: Number(timeoutMs) > 0 ? Number(timeoutMs) : (Number(config.ttsTimeoutMs) || 20000),
      onUsage: callUsage,
    };
  }

  /**
   * One TTS call: { pcm (s16le mono), sampleRate, mimeType, durationMs, audioSeconds, model, tokens, attempts }.
   * The chain is [model || ttsModel, ttsFallbackModel] (the fallback is used on 404, 429 or 5xx); no
   * thinkingConfig is ever sent. Metered as kind "tts" with outputByModality.AUDIO and the audio seconds.
   */
  async function synthesizeSpeech(options = {}) {
    const spec = ttsSpec(options);
    const meta = await requestMeta({
      ...spec,
      kind: "tts",
      thinkingKind: "tts",
      extract: inlineAudio,
      maxResponseBytes: MAX_TTS_RESPONSE_BYTES,
      oversizeFatal: true,
      usageExtras: (result, tokens, audio) => {
        const audioSeconds = audio ? Math.round((audio.pcm.length / (audio.sampleRate * 2)) * 100) / 100 : 0;
        // Audio without a usage block was still billed: metered from its length.
        if (!tokens) return audioSeconds > 0 ? { tokens: estimatedTtsTokens(spec.parts[0]?.text, audioSeconds), audioSeconds } : null;
        return { tokens: ttsTokens(tokens), audioSeconds };
      },
    });
    const { pcm, sampleRate, mimeType } = meta.value;
    const audioSeconds = Math.round((pcm.length / (sampleRate * 2)) * 100) / 100;
    return {
      pcm, sampleRate, mimeType, audioSeconds,
      durationMs: Math.round((pcm.length / (sampleRate * 2)) * 1000),
      model: meta.model, tokens: meta.tokens ? ttsTokens(meta.tokens) : null, attempts: meta.attempts,
    };
  }

  /**
   * Streaming TTS (streamGenerateContent?alt=sse; WP0 confirmed it works). Yields
   * { pcm, sampleRate, part, final: false, model } per audio chunk, then one
   * { pcm: <empty>, final: true, model, tokens, audioSeconds, durationMs }. Usage is reported once, also
   * when the consumer stops early. A model is only swapped for the fallback before its first chunk;
   * a failure after audio has been yielded throws. With config.ttsStreaming false it wraps
   * synthesizeSpeech (one chunk).
   */
  async function* streamSpeech(options = {}) {
    if (config.ttsStreaming === false) {
      const clip = await synthesizeSpeech(options);
      yield { pcm: clip.pcm, sampleRate: clip.sampleRate, part: 0, final: false, model: clip.model };
      yield { pcm: Buffer.alloc(0), sampleRate: clip.sampleRate, part: 1, final: true, model: clip.model, tokens: clip.tokens, audioSeconds: clip.audioSeconds, durationMs: clip.durationMs };
      return;
    }
    const spec = ttsSpec(options);
    if (!config.apiKey) throw new GeminiError("GEMINI_UNAVAILABLE", "GEMINI_API_KEY is not configured.");
    const chain = unique(spec.models);
    const deadline = Date.now() + spec.timeoutMs;
    const timeout = () => new GeminiError("GEMINI_TIMEOUT", "Gemini did not respond in time.", { retryable: true });
    const aborted = (error) => error?.name === "TimeoutError" || error?.name === "AbortError";
    let lastError = new GeminiError("GEMINI_UNAVAILABLE", "No valid Gemini model is configured.");
    for (const model of chain) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw timeout();
        let response;
        try {
          response = await send(`${REST_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": config.apiKey },
            body: JSON.stringify({ contents: [{ role: "user", parts: spec.parts }], generationConfig: spec.generationConfig }),
            signal: AbortSignal.timeout(remaining),
            redirect: "error",
          });
        } catch (error) {
          if (aborted(error)) throw timeout();
          lastError = new GeminiError("GEMINI_UNAVAILABLE", "Gemini could not be reached.", { retryable: true });
          if (attempt === 0) { await sleep(Math.min(500, Math.max(0, deadline - Date.now()))); continue; }
          break;
        }
        const { status } = response;
        if (status === 404) {
          await response.body?.cancel?.();
          lastError = new GeminiError("GEMINI_UNAVAILABLE", `Gemini model ${model} is not available.`, { status });
          break;
        }
        if (status === 429 || status >= 500) {
          await response.body?.cancel?.();
          lastError = new GeminiError("GEMINI_UNAVAILABLE", `Gemini is busy (${status}).`, { status, retryable: true });
          if (attempt === 0) { await sleep(Math.min(800, Math.max(0, deadline - Date.now()))); continue; }
          break;
        }
        if (!response.ok) {
          await response.body?.cancel?.();
          throw new GeminiError("GEMINI_UNAVAILABLE", `Gemini rejected the request (${status}).`, { status });
        }

        let usage = null, reported = false, yielded = false, part = 0, bytes = 0, sampleRate = TTS_SAMPLE_RATE;
        let carry = Buffer.alloc(0);
        let metered = null;
        const seconds = () => Math.round((bytes / (sampleRate * 2)) * 100) / 100;
        const meter = () => {
          if (reported) return;
          // No usage block before the stream stopped (consumer stopped early, or a cut-off): the audio
          // already received was billed, so it is metered from its length instead of not at all.
          metered = usage ? ttsTokens(usage) : bytes > 0 ? estimatedTtsTokens(spec.parts[0]?.text, seconds()) : null;
          if (!metered) return;
          reported = true;
          report(spec.onUsage, { kind: "tts", model, tokens: metered, ...(bytes > 0 ? { audioSeconds: seconds() } : {}) });
        };
        try {
          for await (const event of sseEvents(response.body, MAX_TTS_RESPONSE_BYTES)) {
            let data;
            try { data = JSON.parse(event); } catch { continue; }
            // Stream usage blocks are running totals; the last one is the call's usage.
            const tokens = usageTokens(data?.usageMetadata);
            if (tokens) usage = tokens;
            if (data?.error) throw new Error("stream error");
            for (const piece of data?.candidates?.[0]?.content?.parts || []) {
              if (typeof piece?.inlineData?.data !== "string" || !piece.inlineData.data) continue;
              if (!isPcmMime(piece.inlineData.mimeType)) throw new Error("unsupported audio format");
              if (piece.inlineData.mimeType) sampleRate = sampleRateOf(piece.inlineData.mimeType);
              const joined = Buffer.concat([carry, Buffer.from(piece.inlineData.data, "base64")]);
              const even = joined.length - (joined.length % 2);
              carry = joined.subarray(even);
              const pcm = joined.subarray(0, even);
              if (!pcm.length) continue;
              bytes += pcm.length;
              if (bytes > MAX_TTS_PCM_BYTES) throw tooLarge();
              yielded = true;
              yield { pcm, sampleRate, part: part++, final: false, model };
            }
          }
        } catch (error) {
          meter();
          if (aborted(error)) throw timeout();
          if (isTooLarge(error)) throw tooLarge();
          if (yielded) throw new GeminiError("GEMINI_INVALID_RESPONSE", `Gemini model ${model} stopped mid-stream.`);
          lastError = new GeminiError("GEMINI_INVALID_RESPONSE", `Gemini model ${model} returned an unusable response.`);
          break;
        } finally {
          meter();
        }
        if (!yielded) {
          lastError = new GeminiError("GEMINI_INVALID_RESPONSE", `Gemini model ${model} returned no audio.`);
          break;
        }
        yield {
          pcm: Buffer.alloc(0), sampleRate, part, final: true, model,
          tokens: metered, audioSeconds: seconds(), durationMs: Math.round((bytes / (sampleRate * 2)) * 1000),
        };
        return;
      }
    }
    throw lastError;
  }

  return { configured: Boolean(config.apiKey), openLive, generateJson, transcribePcm, transcribeAudio, synthesizeSpeech, streamSpeech };
}
