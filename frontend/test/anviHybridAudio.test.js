import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// ANVI hybrid audio primitives: the answer segmenter, the segment outbox, cached clip playback and
// the audio API helpers. Pure modules, loaded through Vite's SSR loader for the extensionless imports.
let server, segmenterModule, outboxModule, playerModule, apiModule;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom", optimizeDeps: { noDiscovery: true, include: [] },
  });
  segmenterModule = await server.ssrLoadModule("/src/student/anvi/anviSegmenter.js");
  outboxModule = await server.ssrLoadModule("/src/student/anvi/anviSegmentOutbox.js");
  playerModule = await server.ssrLoadModule("/src/student/anvi/anviAudioPlayer.js");
  apiModule = await server.ssrLoadModule("/src/utils/api.js");
});

after(async () => { await server?.close(); });

// ---- Segmenter ----

const FRAME_SAMPLES = 1600; // 100 ms at 16 kHz
const FRAME_BYTES = FRAME_SAMPLES * 2;
const frame = (rms) => ({ pcm: new Int16Array(FRAME_SAMPLES).fill(Math.round(rms * 0x7fff)).buffer, rms });
const feed = (segmenter, rms, count) => {
  const events = [];
  for (let i = 0; i < count; i += 1) events.push(...segmenter.push(frame(rms)));
  return events;
};
const QUIET = 0.003;
const SPEECH = 0.2;
const segmentsOf = (events) => events.filter((event) => event.type === "segment");

const vad = (options = {}) => {
  const segmenter = segmenterModule.createAnviSegmenter({ hangoverMs: 2000, ...options });
  feed(segmenter, QUIET, 10); // calibration and a settled floor
  return segmenter;
};

test("a cough shorter than 400 ms is dropped, never sent", () => {
  const segmenter = vad();
  const events = [...feed(segmenter, SPEECH, 3), ...feed(segmenter, QUIET, 25)];
  assert.deepEqual(events.map((event) => event.type), ["onset", "discard"]);
  assert.equal(events[1].reason, "short");
  assert.equal(segmenter.part(), 0);
});

test("a 1.5 s pause mid-answer stays in one segment; trailing silence is trimmed", () => {
  const segmenter = vad();
  const events = [...feed(segmenter, SPEECH, 10), ...feed(segmenter, QUIET, 15), ...feed(segmenter, SPEECH, 10), ...feed(segmenter, QUIET, 25)];
  const segments = segmentsOf(events);
  assert.equal(segments.length, 1);
  const [segment] = segments;
  assert.equal(segment.final, true);
  assert.equal(segment.part, 0);
  assert.equal(segment.speechMs, 2000);
  // 300 ms pre-roll + 1 s + 1.5 s pause + 1 s + one 100 ms frame of tail; the 2 s hangover is trimmed.
  assert.equal(segment.durationMs, 3900);
  assert.equal(segment.pcm.length, 39 * FRAME_BYTES);
  assert.ok(segment.pcm instanceof Uint8Array);
});

test("a pause longer than the hangover splits the answer into parts of the same turn", () => {
  const segmenter = vad();
  const events = [...feed(segmenter, SPEECH, 10), ...feed(segmenter, QUIET, 25), ...feed(segmenter, SPEECH, 10), ...feed(segmenter, QUIET, 25)];
  const segments = segmentsOf(events);
  assert.deepEqual(segments.map((segment) => [segment.part, segment.final]), [[0, true], [1, true]]);
  assert.deepEqual(events.filter((event) => event.type === "onset").map((event) => event.resumed), [false, true]);
  segmenter.reset();
  assert.equal(segmenter.part(), 0);
});

test("a speculative close ends the part early; resumed speech becomes the next part", () => {
  const segmenter = vad({ speculativeEndMs: 800 });
  const events = [...feed(segmenter, SPEECH, 10), ...feed(segmenter, QUIET, 8)];
  assert.equal(segmentsOf(events)[0].speculative, true);
  const more = [...feed(segmenter, SPEECH, 6), ...feed(segmenter, QUIET, 25)];
  assert.deepEqual(segmentsOf(more).map((segment) => segment.part), [1]);
});

test("speech longer than maxSegmentSeconds is split into max-length parts", () => {
  const segmenter = vad({ maxSegmentSeconds: 2 });
  const events = [...feed(segmenter, SPEECH, 48), ...feed(segmenter, QUIET, 25)];
  const segments = segmentsOf(events);
  assert.deepEqual(segments.map((segment) => [segment.part, segment.final]), [[0, false], [1, false], [2, true]]);
  assert.equal(segments[0].pcm.length, 2 * 16000 * 2);
  assert.equal(segments[1].pcm.length, 2 * 16000 * 2);
  for (const segment of segments) assert.ok(segment.pcm.length <= 2 * 16000 * 2);
});

test("a max-length split followed by silence reports the end of the answer", () => {
  const segmenter = vad({ maxSegmentSeconds: 2 });
  // 300 ms pre-roll + 17 speech frames fill the 2 s part exactly; then only silence follows.
  const events = [...feed(segmenter, SPEECH, 17), ...feed(segmenter, QUIET, 25)];
  assert.deepEqual(events.map((event) => event.type), ["onset", "segment", "end"]);
  assert.equal(events[1].final, false);
  assert.equal(events[2].part, 0);
});

test("push-to-talk bypasses onset and hangover: the held span is the segment", () => {
  const segmenter = vad();
  segmenter.setInputMode("ptt");
  const quiet = 0.01; // a quiet speaker, under the VAD onset level
  assert.deepEqual(feed(segmenter, quiet, 6), []);
  const down = segmenter.pttDown();
  assert.deepEqual(down.map((event) => event.type), ["onset"]);
  // Long silence while held never closes it.
  assert.deepEqual(feed(segmenter, quiet, 8), []);
  assert.deepEqual(feed(segmenter, QUIET, 30), []);
  const up = segmenter.pttUp();
  assert.equal(up.length, 1);
  assert.equal(up[0].type, "segment");
  assert.equal(up[0].final, true);
  // Pre-roll (5 frames) + 8 + 30 frames: nothing was above the release level, so nothing is trimmed.
  assert.equal(up[0].pcm.length, 43 * FRAME_BYTES);
  assert.deepEqual(segmenter.pttUp(), []);
  // A tap shorter than 400 ms is dropped.
  segmenter.pttDown();
  segmenter.pttUp();
  assert.equal(segmenter.part(), 1);
});

test("push-to-talk pressed during a VAD segment keeps the audio already captured", () => {
  const segmenter = vad();
  feed(segmenter, SPEECH, 5);
  assert.deepEqual(segmenter.pttDown(), []);
  assert.equal(segmenter.inputMode(), "ptt");
  feed(segmenter, SPEECH, 5);
  const [segment] = segmenter.pttUp();
  assert.equal(segment.speechMs, 1000);
});

test("steady fan noise causes no false onset; speech over it is still detected", () => {
  const segmenter = segmenterModule.createAnviSegmenter({ hangoverMs: 2000 });
  const fan = [];
  for (let i = 0; i < 120; i += 1) fan.push(...segmenter.push(frame(i % 2 ? 0.03 : 0.045)));
  assert.deepEqual(fan, []);
  assert.equal(segmenter.speaking(), false);
  assert.equal(segmenter.noisy(), false);
  const speech = feed(segmenter, 0.3, 10);
  assert.equal(speech[0]?.type, "onset");
  const loud = segmenterModule.createAnviSegmenter();
  feed(loud, 0.07, 20);
  assert.equal(loud.noisy(), true);
});

test("the join ack's hybrid.vad (onsetRms) configures the onset level as is", () => {
  const ack = { onsetRms: 0.25, onsetFrames: 2, preRollMs: 300, hangoverMs: 1500, speculativeEndMs: null, minSpeechMs: 400, maxSegmentSeconds: 90 };
  const strict = segmenterModule.createAnviSegmenter(ack);
  feed(strict, QUIET, 10);
  assert.deepEqual(feed(strict, SPEECH, 10), [], "0.2 RMS is under the server's 0.25 onset");
  assert.equal(feed(strict, 0.3, 3)[0]?.type, "onset");
  // An explicit onsetMinRms still wins.
  const explicit = segmenterModule.createAnviSegmenter({ ...ack, onsetMinRms: 0.025 });
  feed(explicit, QUIET, 10);
  assert.equal(feed(explicit, SPEECH, 3)[0]?.type, "onset");
});

test("cancel drops the open segment and the next answer starts clean", () => {
  const segmenter = vad();
  feed(segmenter, SPEECH, 6);
  assert.deepEqual(segmenter.cancel().map((event) => event.reason), ["cancel"]);
  assert.deepEqual(segmentsOf(feed(segmenter, QUIET, 30)), []);
  assert.equal(segmentsOf([...feed(segmenter, SPEECH, 6), ...segmenter.end()]).length, 1);
});

test("room noise lifted by auto gain after the answer still ends it after the pause", () => {
  // Quiet room, 3 s of speech, then the gain brings the room up to 0.015 RMS (over the 0.012 release floor).
  const segmenter = vad();
  const events = [...feed(segmenter, 0.08, 30), ...feed(segmenter, 0.015, 21)];
  const segments = segmentsOf(events);
  assert.equal(segments.length, 1, "the answer closes on its own, no Done press");
  assert.equal(segments[0].final, true);
  assert.equal(segments[0].speechMs, 3000);
});

test("steady noise just under a quiet speaker's level ends the answer by flatness", () => {
  // A quiet speaker (0.04) over a hum near 0.017: louder than a fifth of the voice, but flat for 2 s.
  const segmenter = vad();
  const events = [...feed(segmenter, 0.04, 20), ...feed(segmenter, 0.016, 10), ...feed(segmenter, 0.019, 10)];
  const [segment] = segmentsOf(events);
  assert.equal(segment?.final, true);
  // The steady stretch is trimmed off: pre-roll + 2 s of speech + one frame of tail.
  assert.ok(segment.durationMs <= 2400, `trimmed to ${segment.durationMs} ms`);
});

test("speech that rises and falls is never taken for steady noise", () => {
  const segmenter = vad();
  const talk = [];
  for (let i = 0; i < 60; i += 1) talk.push(...segmenter.push(frame(i % 3 === 0 ? 0.02 : 0.12)));
  assert.deepEqual(segmentsOf(talk), []);
  assert.equal(segmenter.speaking(), true);
  assert.equal(segmenter.pauseMs(), 0);
  feed(segmenter, QUIET, 10);
  assert.equal(segmenter.pauseMs(), 1000, "the room can show the pause filling up");
});

test("a student who starts talking at once does not become the noise floor", () => {
  const segmenter = segmenterModule.createAnviSegmenter({ hangoverMs: 2000 });
  const events = [...feed(segmenter, QUIET, 1), ...feed(segmenter, SPEECH, 12), ...feed(segmenter, QUIET, 25)];
  assert.equal(segmentsOf(events).length, 1);
});

test("repeated short noises flag the room as noisy", () => {
  const segmenter = vad();
  for (let i = 0; i < 3; i += 1) { feed(segmenter, SPEECH, 2); feed(segmenter, QUIET, 25); }
  assert.equal(segmenter.noisy(), true);
});

// ---- Outbox ----

const TURN = "AAAAAAAAAAAAAAAAAAAAAA";
const TURN_2 = "BBBBBBBBBBBBBBBBBBBBBB";
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function harness(options = {}) {
  const sent = [];
  let online = true;
  let n = 0;
  const outcomes = { committed: [], dropped: [] };
  const outbox = outboxModule.createAnviSegmentOutbox({
    emit: (event, payload, ack) => sent.push({ event, payload, ack }),
    connected: () => online,
    randomId: () => uuid(++n),
    onCommitted: (info) => outcomes.committed.push(info),
    onDrop: (info) => outcomes.dropped.push(info),
    ...options,
  });
  outbox.setTurn(TURN);
  return { outbox, sent, outcomes, setOnline: (value) => { online = value; } };
}

const of = (sent, event) => sent.filter((entry) => entry.event === event);

test("a segment goes out as ≤32 KB even chunks, then one commit with the totals", () => {
  const { outbox, sent } = harness();
  const id = outbox.send({ turnId: TURN, part: 0, final: true, pcm: new Uint8Array(70000), durationMs: 2187.5 });
  assert.equal(id, uuid(1));
  const chunks = of(sent, "anvi:seg-chunk");
  assert.deepEqual(chunks.map((entry) => entry.payload.pcm.length), [32768, 32768, 4464]);
  assert.deepEqual(chunks.map((entry) => entry.payload.index), [0, 1, 2]);
  assert.ok(chunks.every((entry) => entry.payload.segmentId === id && entry.payload.turnId === TURN));
  const [commit] = of(sent, "anvi:seg-commit");
  assert.deepEqual(commit.payload, { turnId: TURN, segmentId: id, part: 0, final: true, totalBytes: 70000, durationMs: 2188 });
  assert.equal(sent.at(-1).event, "anvi:seg-commit");
});

test("after a rejoin only unacknowledged chunks are resent, under the same segmentId", () => {
  const { outbox, sent, outcomes } = harness();
  const id = outbox.send({ turnId: TURN, pcm: new Uint8Array(70000), durationMs: 2000 });
  const chunks = of(sent, "anvi:seg-chunk");
  chunks[0].ack({ ok: true });
  chunks[1].ack({ ok: true });
  // The connection dropped before chunk 2 and the commit were answered.
  sent.length = 0;
  assert.equal(outbox.resend(), 1);
  assert.deepEqual(of(sent, "anvi:seg-chunk").map((entry) => entry.payload.index), [2]);
  assert.equal(of(sent, "anvi:seg-chunk")[0].payload.segmentId, id);
  const [commit] = of(sent, "anvi:seg-commit");
  assert.equal(commit.payload.segmentId, id);
  commit.ack({ ok: true, duplicate: true });
  assert.deepEqual(outcomes.committed, [{ segmentId: id, turnId: TURN, part: 0, final: true, duplicate: true }]);
  // Committed: never resent.
  sent.length = 0;
  assert.equal(outbox.resend(), 0);
  assert.deepEqual(sent, []);
  assert.deepEqual(outbox.pending(), []);
});

test("segments wait while offline and go out on resend; committed ones are not resent", () => {
  const { outbox, sent, setOnline } = harness();
  const first = outbox.send({ turnId: TURN, part: 0, final: false, pcm: new Uint8Array(1000) });
  of(sent, "anvi:seg-commit")[0].ack({ ok: true });
  setOnline(false);
  const second = outbox.send({ turnId: TURN, part: 1, pcm: new Uint8Array(1000) });
  assert.equal(of(sent, "anvi:seg-commit").length, 1);
  setOnline(true);
  sent.length = 0;
  outbox.resend();
  assert.deepEqual([...new Set(sent.map((entry) => entry.payload.segmentId))], [second]);
  assert.notEqual(first, second);
});

test("STALE_TURN drops the segment; a new turn drops the old turn's segments", () => {
  const { outbox, sent, outcomes } = harness();
  outbox.send({ turnId: TURN, pcm: new Uint8Array(1000) });
  of(sent, "anvi:seg-commit")[0].ack({ ok: false, code: "STALE_TURN" });
  assert.deepEqual(outcomes.dropped.map((entry) => entry.reason), ["STALE_TURN"]);
  outbox.send({ turnId: TURN, pcm: new Uint8Array(1000) });
  outbox.setTurn(TURN_2);
  assert.deepEqual(outbox.pending(), []);
  assert.equal(outbox.send({ turnId: TURN, pcm: new Uint8Array(1000) }), null);
  sent.length = 0;
  assert.equal(outbox.resend(), 0);
  assert.deepEqual(sent, []);
});

test("rate-limited and on-hold commits are kept for a resend", () => {
  const { outbox, sent } = harness();
  outbox.send({ turnId: TURN, pcm: new Uint8Array(1000) });
  of(sent, "anvi:seg-commit")[0].ack({ ok: false, code: "RATE_LIMITED" });
  assert.equal(outbox.pending().length, 1);
  assert.equal(outbox.resend(), 1);
});

test("at most two segments are held; the oldest gives way and the server is told", () => {
  const { outbox, sent, outcomes, setOnline } = harness();
  setOnline(false);
  const ids = [1, 2, 3].map((part) => outbox.send({ turnId: TURN, part, pcm: new Uint8Array(100) }));
  assert.deepEqual(outbox.pending().map((entry) => entry.segmentId), ids.slice(1));
  assert.deepEqual(outcomes.dropped.map((entry) => [entry.segmentId, entry.reason]), [[ids[0], "overflow"]]);
  assert.equal(sent.length, 0);
  assert.equal(outbox.send({ turnId: TURN, pcm: new Uint8Array(3) }), null);
});

// ---- Player: cached clips ----

class FakeAudioContext {
  constructor() {
    this.now = 0;
    this.state = "running";
    this.destination = {};
    this.sources = [];
    this.buffersCreated = 0;
    this.decodeCalls = 0;
  }
  get currentTime() { return this.now; }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  createAnalyser() { return { fftSize: 256, connect() {}, disconnect() {}, getFloatTimeDomainData: (array) => array.fill(0) }; }
  createBuffer(channels, length, rate) {
    this.buffersCreated += 1;
    const data = new Float32Array(length);
    return { duration: length / rate, length, getChannelData: () => data };
  }
  createBufferSource() {
    const source = { connect() {}, disconnect() {}, start(at) { source.startedAt = at; }, stop(at) { source.stoppedAt = at; }, onended: null };
    this.sources.push(source);
    return source;
  }
  decodeAudioData() { this.decodeCalls += 1; throw new Error("not used"); }
  async close() { this.state = "closed"; }
}

const clipBytes = (seconds) => {
  const samples = new Int16Array(Math.round(seconds * 24000)).fill(0x2000);
  return new Uint8Array(samples.buffer);
};
const end = (sources) => sources.forEach((source) => source.onended?.());

test("a cached clip replays with no fetch and no second decode (AC3)", async () => {
  const context = new FakeAudioContext();
  const changes = [];
  const audio = playerModule.createAnviAudioPlayer({ context, onSpeakingChange: (value) => changes.push(value) });
  const realFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error("no network"); };
  try {
    const bytes = clipBytes(1);
    const loaded = audio.loadClipPcm("q1", [bytes.subarray(0, 1001), bytes.subarray(1001)], 24000);
    assert.equal(loaded.duration, 1);
    assert.equal(audio.hasClip("q1"), true);
    assert.equal(context.buffersCreated, 1);
    for (let i = 0; i < 2; i += 1) {
      const playing = audio.playClip("q1");
      assert.equal(audio.isSpeaking(), true);
      end(context.sources.slice(-1));
      assert.equal(await playing, "ended");
      assert.equal(audio.isSpeaking(), false);
    }
    assert.equal(context.sources.length, 2);
    assert.equal(context.sources[0].buffer, context.sources[1].buffer);
    assert.equal(context.buffersCreated, 1);
    assert.equal(context.decodeCalls, 0);
    assert.equal(fetches, 0);
    assert.deepEqual(changes, [true, false, true, false]);
    // The s16 samples were converted directly: 0x2000 / 0x8000.
    assert.equal(context.sources[0].buffer.getChannelData(0)[0], 0.25);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a clip sequence plays gaplessly with 150 ms gaps and never overlaps the stream", async () => {
  const context = new FakeAudioContext();
  const audio = playerModule.createAnviAudioPlayer({ context });
  audio.loadClipPcm("number-3", [clipBytes(0.5)]);
  audio.loadClipPcm("q3", [clipBytes(2)]);
  context.now = 1;
  audio.enqueue(new Uint8Array(4800));
  audio.enqueue(new Uint8Array(4800));
  const stream = context.sources.slice();
  assert.equal(audio.clipSeconds(["number-3", "q3"]), 2.65);
  const playing = audio.playSequence(["number-3", "q3"]);
  // The stream was flushed: its queued sources are stopped.
  assert.ok(stream.every((source) => Number.isFinite(source.stoppedAt)));
  const [number, question] = context.sources.slice(-2);
  assert.ok(number.startedAt >= 1);
  assert.equal(Number((question.startedAt - number.startedAt).toFixed(6)), 0.65);
  // Stream audio arriving now waits until the clip has finished.
  audio.enqueue(new Uint8Array(4800));
  assert.ok(context.sources.at(-1).startedAt >= question.startedAt + 2 - 1e-9);
  end([number]);
  assert.equal(audio.isPlayingClip(), true);
  end([question]);
  assert.equal(await playing, "ended");
  assert.equal(audio.isPlayingClip(), false);
});

test("flush, a newer sequence or close interrupts the clip; a missing clip plays nothing", async () => {
  const context = new FakeAudioContext();
  const audio = playerModule.createAnviAudioPlayer({ context });
  audio.loadClipPcm("a", [clipBytes(1)]);
  audio.loadClipPcm("b", [clipBytes(1)]);
  const first = audio.playClip("a");
  audio.flush();
  assert.equal(await first, "interrupted");
  assert.equal(audio.isSpeaking(), false);
  const second = audio.playClip("a");
  const third = audio.playClip("b");
  assert.equal(await second, "interrupted");
  const before = context.sources.length;
  assert.equal(await audio.playSequence(["b", "missing"]), "missing");
  assert.equal(context.sources.length, before);
  await audio.close();
  assert.equal(await third, "interrupted");
  assert.equal(audio.hasClip("a"), false);
  assert.equal(audio.clipCacheBytes(), 0);
});

test("the decoded-clip LRU stays within its byte budget and keeps recently used clips", () => {
  const context = new FakeAudioContext();
  const oneSecond = 24000 * 4;
  const audio = playerModule.createAnviAudioPlayer({ context, clipCacheBytes: 3 * oneSecond });
  audio.loadClipPcm("c1", [clipBytes(1)]);
  audio.loadClipPcm("c2", [clipBytes(1)]);
  audio.loadClipPcm("c3", [clipBytes(1)]);
  audio.playClip("c1"); // touched: now the most recent
  audio.loadClipPcm("c4", [clipBytes(1)]);
  audio.loadClipPcm("c5", [clipBytes(1)]);
  assert.ok(audio.clipCacheBytes() <= 3 * oneSecond);
  assert.deepEqual(audio.clipIds(), ["c1", "c4", "c5"]);
  for (let i = 0; i < 40; i += 1) audio.loadClipPcm(`x${i}`, [clipBytes(0.4)]);
  assert.ok(audio.clipCacheBytes() <= 3 * oneSecond);
  assert.equal(playerModule.CLIP_CACHE_BYTES, 12 * 1024 * 1024);
  assert.equal(audio.loadClipPcm("empty", []), null);
});

// ---- API helpers ----

const wav = (pcm, sampleRate = 24000) => {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const text = (offset, value) => [...value].forEach((char, i) => { out[offset + i] = char.charCodeAt(0); });
  text(0, "RIFF"); view.setUint32(4, 36 + pcm.length, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
};

test("getAnviAudio fetches through the authenticated proxy and returns the WAV's samples", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (String(url).includes("/audio/missing")) return new Response(JSON.stringify({ error: "Audio not found" }), { status: 404, headers: { "content-type": "application/json" } });
    return new Response(wav(pcm), { status: 200, headers: { "content-type": "audio/wav" } });
  };
  try {
    const clip = await apiModule.api.getAnviAudio("attempt 1", "asset_1");
    assert.deepEqual([...clip.pcm], [...pcm]);
    assert.equal(clip.sampleRate, 24000);
    assert.match(String(calls[0].url), /\/student\/ai-interviews\/attempts\/attempt%201\/audio\/asset_1$/);
    assert.equal(calls[0].options.credentials, "include");
    await assert.rejects(apiModule.api.getAnviAudio("a1", "missing"), (err) => {
      assert.equal(err.response.status, 404);
      assert.doesNotMatch(err.message, /http|\/audio\//);
      return true;
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("anviClipFromBytes reads raw PCM and rejects unsupported WAV layouts", () => {
  const raw = apiModule.anviClipFromBytes(new Uint8Array([1, 2, 3]), "application/octet-stream");
  assert.deepEqual([...raw.pcm], [1, 2]);
  const stereo = wav(new Uint8Array(8));
  new DataView(stereo.buffer).setUint16(22, 2, true);
  assert.throws(() => apiModule.anviClipFromBytes(stereo, "audio/wav"), /unsupported/);
  assert.throws(() => apiModule.anviClipFromBytes(new Uint8Array(20), "audio/wav"));
});

test("interview audio admin helpers call the regenerate and status routes", async () => {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), method: options.method });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await apiModule.api.regenerateInterviewAudio("int1");
    await apiModule.api.getInterviewAudioStatus("int1");
    assert.match(calls[0].url, /\/ai-interviews\/int1\/audio\/regenerate$/);
    assert.equal(calls[0].method, "POST");
    assert.match(calls[1].url, /\/ai-interviews\/int1\/audio\/status$/);
    assert.equal(calls[1].method, "GET");
  } finally {
    globalThis.fetch = realFetch;
  }
});
