import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { anviConfig } from "../src/modules/anviInterview/anviInterview.config.js";
import { createTranscripts } from "../src/modules/anviInterview/anviInterview.transcripts.js";

const CONFIG = anviConfig({});
const silentLog = { warn() {}, error() {}, info() {}, log() {} };
const pcmOf = (fill) => Buffer.alloc(32000, fill);
const hashOf = (pcm) => createHash("sha256").update(pcm).digest("hex");

function fakeValkey() {
  const store = new Map();
  return {
    store,
    async sendCommand([command, ...args]) {
      if (command === "GET") return store.get(args[0]) ?? null;
      if (command === "SET") { store.set(args[0], args[1]); return "OK"; }
      if (command === "DEL") { let n = 0; for (const key of args) n += store.delete(key) ? 1 : 0; return n; }
      throw new Error(`unexpected ${command}`);
    },
  };
}

const gemini = { async transcribeAudio() { return { text: "an answer", model: "flash-lite", attempts: 1, audioSeconds: 1, tokens: null }; } };
const request = (pcm, fields = {}) => ({ tenantKey: "t1", attemptId: "a1", studentId: "s1", qid: "q1", audioHash: hashOf(pcm), pcm, voicedSeconds: 1, language: "English", ...fields });

test("forgetAttempt with the live-doc segment records deletes keys another instance wrote", async () => {
  const valkey = fakeValkey();
  const first = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  const second = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  const [a, b, c] = [pcmOf(1), pcmOf(2), pcmOf(3)];
  await first.transcribe(request(a));
  await first.transcribe(request(b, { qid: "q2" }));
  await second.transcribe(request(c, { qid: "q3" }));
  // Another student's key in the same store must survive.
  await second.transcribe(request(a, { attemptId: "a2", studentId: "s2" }));
  assert.equal(valkey.store.size, 4);

  const segments = [
    { qid: "q1", audioHash: hashOf(a) },
    { qid: "q2", audioHash: hashOf(b) },
    { qid: "q3", audioHash: hashOf(c) },
    { qid: "q4", audioHash: "not-a-hash" },
  ];
  await second.forgetAttempt("a1", { segments, tenantKey: "t1", studentId: "s1", language: "English" });
  assert.equal(valkey.store.size, 1);
  assert.ok([...valkey.store.keys()][0].includes(":a2:"));
});

test("forgetAttempt without options keeps the tracked-keys behaviour", async () => {
  const valkey = fakeValkey();
  const transcripts = createTranscripts({ gemini, valkey, config: CONFIG, log: silentLog });
  await transcripts.transcribe(request(pcmOf(5)));
  assert.equal(await transcripts.forgetAttempt("a1"), 1);
  assert.equal(valkey.store.size, 0);
});
