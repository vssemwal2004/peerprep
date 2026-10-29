import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createTranscripts, shouldEscalate, transcriptKey, transcriptScopeHash } from "../src/modules/anviInterview/anviInterview.transcripts.js";

const CONFIG = anviConfig({});
const PCM = Buffer.alloc(64000, 1);
const HASH = createHash("sha256").update(PCM).digest("hex");
const SECRET = "my secret answer about hash maps";

function fakeValkey() {
  const store = new Map();
  const state = { down: false, sets: [] };
  return {
    store,
    state,
    async sendCommand([command, ...args]) {
      await Promise.resolve();
      if (state.down) throw new Error("Cache temporarily unavailable");
      if (command === "GET") return store.get(args[0]) ?? null;
      if (command === "SET") { store.set(args[0], args[1]); state.sets.push(args); return "OK"; }
      if (command === "DEL") { let n = 0; for (const key of args) n += store.delete(key) ? 1 : 0; return n; }
      throw new Error(`unexpected ${command}`);
    },
  };
}

// A fake Gemini: `script[kind]` is a list of results (or Errors) used in turn; the last one repeats.
function fakeGemini(script = {}) {
  const calls = [];
  return {
    calls,
    async transcribeAudio(options) {
      calls.push({ kind: options.kind, model: options.model || null });
      await new Promise((resolve) => setImmediate(resolve));
      const list = script[options.kind] || [{ text: SECRET }];
      const next = list[Math.min(calls.filter((call) => call.kind === options.kind).length - 1, list.length - 1)];
      if (next instanceof Error) throw next;
      return { model: options.kind === "transcribe" ? "flash-lite" : "accurate", attempts: 1, audioSeconds: 2, tokens: { input: 10, output: 5 }, invalid: false, ...next };
    },
  };
}

const request = (fields = {}) => ({ tenantKey: "t1", attemptId: "a1", studentId: "s1", qid: "q1", audioHash: HASH, pcm: PCM, voicedSeconds: 2, language: "English", ...fields });
const silentLog = { warn() {}, error() {}, info() {}, log() {} };

test("AC5: the same audio (same or a different segmentId) is transcribed once", async () => {
  const gemini = fakeGemini();
  const valkey = fakeValkey();
  const transcripts = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  const [a, b] = await Promise.all([transcripts.transcribe(request()), transcripts.transcribe(request())]);
  const c = await transcripts.transcribe(request());
  assert.equal(gemini.calls.length, 1);
  assert.equal(a.text, SECRET);
  assert.equal(b.source, "inflight");
  assert.equal(c.source, "valkey");
  assert.equal(c.cached, true);
  // Another instance shares Valkey.
  const other = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  assert.equal((await other.transcribe(request())).source, "valkey");
  assert.equal(gemini.calls.length, 1);
  assert.equal(valkey.state.sets[0][2], "EX");
  assert.equal(valkey.state.sets[0][3], String(CONFIG.transcriptCacheSeconds));
});

test("AC5 with Valkey down: the local LRU, then the live-doc record, still dedupe", async () => {
  const gemini = fakeGemini();
  const valkey = fakeValkey();
  valkey.state.down = true;
  const transcripts = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  await transcripts.transcribe(request());
  const again = await transcripts.transcribe(request());
  assert.equal(again.source, "lru");
  assert.equal(gemini.calls.length, 1);
  // A new instance (rejoin elsewhere) with no shared cache uses the record on the live doc.
  const fresh = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  const record = { text: SECRET, model: "flash-lite", attempts: 1, escalated: false, lowConfidence: false, audioSeconds: 2 };
  const fromRecord = await fresh.transcribe(request({ record }));
  assert.equal(fromRecord.source, "record");
  assert.equal(fromRecord.text, SECRET);
  assert.equal(gemini.calls.length, 1);
});

test("AC6: a different student or attempt gets a different key and no hit", async () => {
  const gemini = fakeGemini();
  const transcripts = createTranscripts({ gemini, valkey: fakeValkey(), config: CONFIG, log: silentLog });
  const first = await transcripts.transcribe(request());
  const student = await transcripts.transcribe(request({ studentId: "s2" }));
  const attempt = await transcripts.transcribe(request({ attemptId: "a2" }));
  const tenant = await transcripts.transcribe(request({ tenantKey: "t2" }));
  assert.equal(new Set([first.key, student.key, attempt.key, tenant.key]).size, 4);
  assert.equal(gemini.calls.length, 4);
  assert.equal(student.source, "model");
});

test("the key has the documented shape and no text", () => {
  const scopeHash = transcriptScopeHash({ studentId: "s1", model: "m", languageMode: "English", promptVersion: "t1" });
  assert.match(scopeHash, /^[a-f0-9]{16}$/);
  const key = transcriptKey({ tenantKey: "t1", attemptId: "a1", qid: "q1", audioHash: HASH, scopeHash });
  assert.equal(key, `peerprep:anvi:transcript:v1:t1:a1:q1:${HASH}:${scopeHash}`);
  // Unsafe parts are hashed, never embedded.
  const odd = transcriptKey({ tenantKey: "t1", attemptId: "a1", qid: SECRET, audioHash: HASH, scopeHash });
  assert.equal(odd.includes("secret"), false);
  assert.equal(odd.split(":").length, 9);
  assert.throws(() => transcriptKey({ tenantKey: "t1", attemptId: "a1", qid: "q1", audioHash: "nope", scopeHash }));
});

test("cached values live under keys without text, and nothing is logged", async () => {
  const lines = [];
  const spy = { warn: (...args) => lines.push(args.join(" ")), error: (...args) => lines.push(args.join(" ")) };
  const valkey = fakeValkey();
  const transcripts = createTranscripts({ gemini: fakeGemini(), valkey, config: CONFIG, log: spy });
  await transcripts.transcribe(request());
  valkey.state.down = true;
  await transcripts.transcribe(request({ qid: "q2" }));
  for (const key of valkey.store.keys()) assert.equal(key.includes("secret"), false);
  assert.ok(lines.length <= 1);
  assert.ok(lines.every((line) => !line.includes(SECRET) && !line.includes(HASH)));
});

test("shouldEscalate: the escalation matrix", () => {
  const cases = [
    [{ text: "" }, { voicedSeconds: 2 }, "empty"],
    [{ text: "" }, { voicedSeconds: 1 }, null],
    [{ text: "" , invalid: true }, { voicedSeconds: 0.5 }, null],
    [{ text: "one two" }, { voicedSeconds: 10 }, "too_short"],
    [{ text: "one two three four five six seven" }, { voicedSeconds: 10 }, null],
    [{ text: "a b" }, { voicedSeconds: 3 }, null],
    [{ text: "I used [inaudible] and then [inaudible] for this" }, { voicedSeconds: 3 }, "inaudible"],
    [{ text: "hash map [inaudible] lookup" }, { voicedSeconds: 2 }, "inaudible"],
    [{ text: "a hash map gives constant time lookup on average [inaudible] mostly" }, { voicedSeconds: 4 }, null],
    [{ text: "मैंने hash map use किया" }, { voicedSeconds: 3, language: "Hinglish" }, "language"],
    [{ text: "maine hash map use kiya kyunki fast hai" }, { voicedSeconds: 3, language: "Hinglish" }, null],
    [{ text: "maine hash map use kiya kyunki fast hai" }, { voicedSeconds: 3, language: "Hindi" }, "language"],
    [{ text: "मैंने hash map use किया" }, { voicedSeconds: 3, language: "English" }, null],
    [{ text: "fine answer here" }, { voicedSeconds: 2, forceAccurate: true }, "forced"],
    [{ notText: true }, { voicedSeconds: 2 }, "invalid"],
    [{ text: "", malformed: true }, { voicedSeconds: 0 }, "invalid"],
  ];
  for (const [transcript, options, reason] of cases) {
    assert.deepEqual(shouldEscalate(transcript, options), { escalate: Boolean(reason), reason }, JSON.stringify([transcript, options]));
  }
});

test("an unusable cheap transcript is escalated once when the budget allows", async () => {
  const gemini = fakeGemini({ transcribe: [{ text: "" }], transcribe_accurate: [{ text: SECRET }] });
  const metrics = [];
  const onUsage = () => {};
  onUsage.metric = (name) => metrics.push(name);
  const asked = [];
  const budget = { allow: (kind, extra) => { asked.push([kind, extra]); return true; } };
  const transcripts = createTranscripts({ gemini, valkey: null, config: CONFIG, log: silentLog });
  const result = await transcripts.transcribe(request({ budget, onUsage }));
  assert.deepEqual(gemini.calls.map((call) => call.kind), ["transcribe", "transcribe_accurate"]);
  assert.equal(gemini.calls[1].model, CONFIG.transcribeAccurateModel);
  assert.equal(result.text, SECRET);
  assert.equal(result.escalated, true);
  assert.equal(result.lowConfidence, false);
  assert.equal(result.attempts, 2);
  assert.deepEqual(result.tokens, { input: 20, output: 10 });
  assert.equal(result.escalationReason, "empty");
  assert.deepEqual(asked.at(-1), ["transcribe_accurate", { unusable: true }]);
  assert.ok(metrics.includes("accurateTranscriptionEscalation"));
  assert.ok(metrics.includes("transcriptCacheMiss"));
});

test("budget denial of the accurate model keeps the cheap text as lowConfidence", async () => {
  const gemini = fakeGemini({ transcribe: [{ text: "one two" }] });
  const budget = { allow: (kind) => kind !== "transcribe_accurate" };
  const transcripts = createTranscripts({ gemini, valkey: null, config: CONFIG, log: silentLog });
  const result = await transcripts.transcribe(request({ budget, voicedSeconds: 10 }));
  assert.equal(gemini.calls.length, 1);
  assert.equal(result.text, "one two");
  assert.equal(result.lowConfidence, true);
  assert.equal(result.escalated, false);
});

test("accurate: false (finalizing) skips escalation", async () => {
  const gemini = fakeGemini({ transcribe: [{ text: "" }] });
  const transcripts = createTranscripts({ gemini, valkey: null, config: CONFIG, log: silentLog });
  const result = await transcripts.transcribe(request({ accurate: false }));
  assert.equal(gemini.calls.length, 1);
  assert.equal(result.lowConfidence, true);
});

test("an accurate-model throw gives lowConfidence and never throws", async () => {
  const gemini = fakeGemini({ transcribe: [{ text: "x" }], transcribe_accurate: [new Error("boom")] });
  const transcripts = createTranscripts({ gemini, valkey: null, config: CONFIG, log: silentLog });
  const result = await transcripts.transcribe(request({ forceAccurate: true }));
  assert.equal(result.text, "x");
  assert.equal(result.lowConfidence, true);
  assert.equal(result.error, undefined);
});

test("a cheap-model throw escalates; when both fail the result has an error and is not cached", async () => {
  const both = fakeGemini({ transcribe: [new Error("down")], transcribe_accurate: [new Error("down")] });
  const transcripts = createTranscripts({ gemini: both, valkey: null, config: CONFIG, log: silentLog });
  const failed = await transcripts.transcribe(request());
  assert.equal(failed.error, "TRANSCRIBE_FAILED");
  assert.equal(failed.text, "");
  assert.equal(failed.lowConfidence, true);
  await transcripts.transcribe(request());
  assert.equal(both.calls.filter((call) => call.kind === "transcribe").length, 2);

  const rescue = fakeGemini({ transcribe: [new Error("down")], transcribe_accurate: [{ text: SECRET }] });
  const ok = await createTranscripts({ gemini: rescue, valkey: null, config: CONFIG, log: silentLog }).transcribe(request());
  assert.equal(ok.text, SECRET);
  assert.equal(ok.escalated, true);
  assert.equal(ok.error, undefined);
});

test("a budget that denies Flash-Lite (hard mode) makes no call and caches nothing", async () => {
  const gemini = fakeGemini();
  const transcripts = createTranscripts({ gemini, valkey: null, config: CONFIG, log: silentLog });
  const budget = { allow: () => false };
  const result = await transcripts.transcribe(request({ budget }));
  assert.equal(gemini.calls.length, 0);
  assert.equal(result.error, "BUDGET_DENIED");
  await transcripts.transcribe(request());
  assert.equal(gemini.calls.length, 1);
});

test("forgetAttempt deletes the tracked keys from Valkey and the LRU", async () => {
  const gemini = fakeGemini();
  const valkey = fakeValkey();
  const transcripts = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  await transcripts.transcribe(request());
  await transcripts.transcribe(request({ qid: "q2" }));
  const keys = transcripts.keysFor("a1");
  assert.equal(keys.length, 2);
  assert.equal(await transcripts.forgetAttempt(keys), 2);
  assert.equal(valkey.store.size, 0);
  await transcripts.transcribe(request());
  assert.equal(gemini.calls.length, 3);
  assert.equal(await transcripts.forgetAttempt("a1"), 2);
  assert.equal(valkey.store.size, 0);
});

test("a bad request resolves with an error instead of throwing", async () => {
  const transcripts = createTranscripts({ gemini: fakeGemini(), valkey: null, config: CONFIG, log: silentLog });
  const result = await transcripts.transcribe(request({ audioHash: "zz" }));
  assert.equal(result.error, "BAD_REQUEST");
});
