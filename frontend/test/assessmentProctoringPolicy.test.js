import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
let EVENTS;
let ViolationBuffer;
let getActiveRules;
let AI_PROCTORING_RULES;
let ProctoringManager;
let getStatusFromBuffer;
let getCameraActive;
let isBoxOutOfFrame;
let normalizeCocoSsdPredictions;
let logAiProctoringViolation;
let api;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const load = (path) => server.ssrLoadModule(`/src/features/assessment/proctoring/${path}`);
  ({ AI_PROCTORING_EVENTS: EVENTS } = await load('constants/proctoringEvents.js'));
  ({ ViolationBuffer } = await load('services/violationBuffer.js'));
  ({ getActiveRules, AI_PROCTORING_RULES } = await load('rules/violationRules.js'));
  ({ ProctoringManager, getStatusFromBuffer, getCameraActive } = await load('ProctoringManager.js'));
  ({ isBoxOutOfFrame } = await load('adapters/mediapipeAdapter.js'));
  ({ normalizeCocoSsdPredictions } = await load('adapters/cocoSsdAdapter.js'));
  ({ logAiProctoringViolation } = await load('services/proctoringApi.js'));
  ({ api } = await server.ssrLoadModule('/src/utils/api.js'));
});

after(async () => {
  await server?.close();
});

const ruleOf = (type, settings = {}) => getActiveRules({ detectLookingAway: false, ...settings }).find((rule) => rule.type === type);

// Feeds one fresh sample per [time, present] pair; returns the emissions with their times.
function feed(buffer, rule, samples) {
  const emitted = [];
  samples.forEach(([time, present]) => {
    const confirmed = buffer.observe(rule.type, present, time, rule);
    if (confirmed) emitted.push({ time, ...confirmed });
  });
  return emitted;
}

const series = (from, to, step, present) => {
  const samples = [];
  for (let time = from; time <= to; time += step) samples.push([time, present]);
  return samples;
};

function createManager(settings = {}) {
  const violations = [];
  const manager = new ProctoringManager({
    settings: { enabled: true, ...settings },
    onViolationConfirmed: (event) => violations.push(event),
  });
  manager.faceDetectorAvailable = true;
  manager.objectDetectorAvailable = true;
  return { manager, violations };
}

const faceSample = (timestamp, overrides = {}) => ({
  timestamp,
  cameraActive: true,
  facePresent: true,
  faceCount: 1,
  faceOutOfFrame: false,
  lookingAway: false,
  mobileDetected: false,
  objectPersonCount: 0,
  fresh: { face: true, object: false },
  confidence: { face: 0.9, mobile: 0, person: 0, lookingAway: 0 },
  ...overrides,
});

test('a stale (reused) object result never confirms a phone; two fresh positives >= 700 ms apart do', async () => {
  let clock = 0;
  mock.method(Date, 'now', () => clock);
  try {
    const { manager, violations } = createManager({ detectNoFace: false, detectFaceOutOfFrame: false, detectMultiplePersons: false });
    let detectCalls = 0;
    manager.objectDetector = {
      backend: 'webgl',
      lastInferenceMs: 40,
      detect: async () => {
        detectCalls += 1;
        return { mobileDetected: true, personCount: 1, confidence: { mobile: 0.9, person: 0.9 }, metadata: { source: 'test' } };
      },
    };
    manager.stream = { getVideoTracks: () => [{ readyState: 'live', muted: false }] };
    manager.videoElement = { paused: false, ended: false, readyState: 4, videoWidth: 640, videoHeight: 480 };
    manager.status = { ...manager.status, running: true };

    const base = 100000;
    clock = base;
    await manager.runDetectionTick();
    clock = base + 500;
    await manager.runDetectionTick();
    assert.equal(detectCalls, 1, 'the second tick reuses the cached object result');
    assert.equal(violations.length, 0, 'one frame, seen twice, is not a phone');
    assert.equal(manager.violationBuffer.isPending(EVENTS.MOBILE_DETECTED), true);
    assert.equal(manager.getStatus().mobile, 'ok', 'nothing shows before confirmation');

    clock = base + 1000;
    await manager.runDetectionTick();
    assert.equal(detectCalls, 2, 'a pending phone is re-sampled quickly');
    assert.equal(violations.length, 1, 'a second fresh positive >= 700 ms later confirms');
    assert.equal(violations[0].type, EVENTS.MOBILE_DETECTED);
    assert.equal(violations[0].severity, 'critical');
    assert.equal(violations[0].metadata.firstSeenAt, base);
    assert.equal(violations[0].metadata.durationMs, 1000);
    assert.equal(manager.getStatus().mobile, 'detected');

    clock = base + 1500;
    await manager.runDetectionTick();
    assert.equal(violations.length, 1, 'the same continuous phone does not warn again');
    manager.stop();
  } finally {
    mock.restoreAll();
  }
});

test('no face confirms at ~2 s, not before, and one missed frame does not reset it', () => {
  const rule = ruleOf(EVENTS.NO_FACE);
  const buffer = new ViolationBuffer({ cooldownMs: 20000 });
  assert.deepEqual(feed(buffer, rule, series(0, 1500, 500, true)), [], 'nothing before 2 s');
  const emitted = feed(buffer, rule, [[2000, true]]);
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].durationMs, 2000);

  const flicker = new ViolationBuffer({ cooldownMs: 20000 });
  const flickerEmits = feed(flicker, rule, [[0, true], [500, true], [1000, false], [1500, true], [2000, true]]);
  assert.deepEqual(flickerEmits.map((item) => item.time), [2000], 'a single face frame inside the gap tolerance keeps the timer');

  const recovered = new ViolationBuffer({ cooldownMs: 20000 });
  assert.deepEqual(feed(recovered, rule, [[0, true], [500, true], [1000, false], [1500, false], [2000, true], [2500, true]]), [],
    'a face seen for longer than the gap tolerance resets the timer');
});

test('face out of frame confirms at the 8 s grace despite a 500 ms in-frame flicker, and resets after a > 1000 ms gap', () => {
  const rule = ruleOf(EVENTS.FACE_OUT_OF_FRAME);
  assert.equal(rule.confirmAfterMs, 8000, 'default grace is 8 s');
  assert.equal(ruleOf(EVENTS.FACE_OUT_OF_FRAME, { faceOutOfFrameGraceSec: 15 }).confirmAfterMs, 15000, 'stored values are respected');
  assert.equal(ruleOf(EVENTS.FACE_OUT_OF_FRAME, { faceOutOfFrameGraceSec: 1 }).confirmAfterMs, 3000, 'range stays [3, 60]');

  const buffer = new ViolationBuffer({ cooldownMs: 20000 });
  const samples = [...series(0, 2500, 500, true), [3000, false], [3500, false], ...series(4000, 9000, 500, true)];
  const emitted = feed(buffer, rule, samples);
  assert.deepEqual(emitted.map((item) => item.time), [8000]);

  const reset = new ViolationBuffer({ cooldownMs: 20000 });
  const resetSamples = [...series(0, 2000, 500, true), ...series(2500, 4000, 500, false), ...series(4500, 13000, 500, true)];
  assert.deepEqual(feed(reset, rule, resetSamples).map((item) => item.time), [12500], 'the timer restarts after the long in-frame gap');
});

test('one continuous episode emits once and re-emits only after 60 s; re-entry within cooldown is silent', () => {
  const rule = ruleOf(EVENTS.MOBILE_DETECTED);
  const buffer = new ViolationBuffer({ cooldownMs: 20000 });
  const continuous = feed(buffer, rule, series(0, 62000, 1000, true));
  assert.deepEqual(continuous.map((item) => [item.time, item.reason]), [[1000, 'episode_start'], [61000, 'still_present']]);

  assert.deepEqual(feed(buffer, rule, [[63000, false], [64000, false], [65000, false]]), []);
  assert.equal(buffer.isActive(EVENTS.MOBILE_DETECTED), false, 'two misses over >= 2 s clear the episode');
  assert.deepEqual(feed(buffer, rule, series(70000, 80000, 1000, true)), [], 'coming back within the cooldown is the same episode');
  assert.equal(buffer.isActive(EVENTS.MOBILE_DETECTED), true);

  assert.deepEqual(feed(buffer, rule, [[81000, false], [83000, false]]), []);
  const later = feed(buffer, rule, series(110000, 112000, 1000, true));
  assert.deepEqual(later.map((item) => item.reason), ['episode_start'], 'after the cooldown a new episode warns again');
});

test('two faces produce exactly one violation (multiple faces and persons are one group)', () => {
  const { manager, violations } = createManager();
  for (let time = 0; time <= 30000; time += 500) {
    manager.handleDetectionResult(faceSample(time, {
      faceCount: 2,
      objectPersonCount: 2,
      fresh: { face: true, object: time % 1000 === 0 },
      confidence: { face: 0.9, mobile: 0, person: 0.8, lookingAway: 0 },
    }));
  }
  assert.equal(violations.length, 1);
  assert.ok([EVENTS.MULTIPLE_FACES, EVENTS.MULTIPLE_PERSONS].includes(violations[0].type));
  assert.equal(manager.getStatus().person, 'multiple');
  assert.equal(AI_PROCTORING_RULES[EVENTS.MULTIPLE_PERSONS].group, AI_PROCTORING_RULES[EVENTS.MULTIPLE_FACES].group);
});

test('multiple persons come from the object detector only, not from the face count', () => {
  const rule = ruleOf(EVENTS.MULTIPLE_PERSONS);
  assert.equal(rule.present(faceSample(0, { faceCount: 2, objectPersonCount: 1, confidence: { face: 0.9, person: 0.9 } })), false);
  assert.equal(rule.present(faceSample(0, { faceCount: 1, objectPersonCount: 2, confidence: { face: 0.9, person: 0.9 } })), true);
});

test('status stays ok until the episode is active, and model or eye state never becomes an issue', () => {
  const { manager, violations } = createManager();
  for (let time = 0; time <= 1500; time += 500) {
    manager.handleDetectionResult(faceSample(time, { facePresent: false, faceCount: 0 }));
    assert.equal(manager.getStatus().face, 'ok', `face is ok at ${time} ms`);
  }
  manager.handleDetectionResult(faceSample(2000, { facePresent: false, faceCount: 0 }));
  assert.equal(manager.getStatus().face, 'missing');
  assert.equal(violations.length, 1);

  manager.handleDetectionResult(faceSample(2500, { lookingAway: true, confidence: { face: 0.9, lookingAway: 0.95 } }));
  assert.equal(manager.getStatus().eye, 'ok', 'eye movement is never flagged');
  assert.equal(getActiveRules({}).some((rule) => rule.type === EVENTS.LOOKING_AWAY), false, 'looking away needs an explicit opt-in');

  const outage = getStatusFromBuffer({ cameraActive: false }, manager.violationBuffer, manager.settings);
  assert.equal(outage.camera, 'error');
  manager.handleDetectionResult(faceSample(3000, { cameraActive: false, fresh: { face: false, object: false } }));
  assert.equal(manager.violationBuffer.isActive(EVENTS.NO_FACE), false, 'an outage ends face episodes silently');
});

test('paused managers detect but never emit, and resume with empty buffers', () => {
  const { manager, violations } = createManager();
  manager.setPaused(true);
  for (let time = 0; time <= 5000; time += 500) {
    manager.handleDetectionResult(faceSample(time, { facePresent: false, faceCount: 0 }));
  }
  assert.equal(violations.length, 0);
  assert.equal(manager.getStatus().face, 'ok');
  manager.setPaused(false);
  assert.equal(manager.violationBuffer.isPending(EVENTS.NO_FACE), false);
});

test('model errors never stop the camera, and a model that finishes loading after stop() is disposed', async () => {
  const { manager } = createManager({ detectMobile: false, detectMultiplePersons: false });
  manager.faceDetectorAvailable = false;
  manager.objectDetectorAvailable = false;
  manager.status = { ...manager.status, running: true, camera: 'ok' };
  manager.stream = { getVideoTracks: () => [{ readyState: 'live', muted: false }] };
  manager.handleModelError(new Error('CDN blocked'));
  assert.equal(manager.getStatus().running, true);
  assert.equal(manager.getStatus().camera, 'ok');
  assert.ok(manager.stream, 'the shared stream is kept');
  manager.clearModelRetry();

  let release;
  let disposed = 0;
  manager.faceDetector = {
    load: () => new Promise((resolve) => { release = resolve; }),
    dispose: () => { disposed += 1; },
  };
  const loading = manager.loadModels();
  manager.stop();
  release();
  await loading;
  assert.ok(disposed >= 1, 'the late detector is disposed');
  assert.equal(manager.faceDetectorAvailable, false);
  assert.equal(manager.faceDetector, null);
});

test('a muted camera track is an outage, not a missing face', () => {
  const { manager, violations } = createManager();
  const muted = { getVideoTracks: () => [{ readyState: 'live', muted: true }] };
  assert.equal(getCameraActive(muted), false);
  assert.equal(getCameraActive({ getVideoTracks: () => [{ readyState: 'live', muted: false }] }), true);
  for (let time = 0; time <= 10000; time += 500) {
    manager.handleDetectionResult(faceSample(time, { cameraActive: getCameraActive(muted), facePresent: false, faceCount: 0, fresh: { face: false, object: false } }));
  }
  assert.equal(violations.length, 0);
  assert.equal(manager.getStatus().camera, 'error');
});

test('face geometry: an edge-touching chin is in frame, a face centred at x=0.95 is out', () => {
  assert.equal(isBoxOutOfFrame({ minX: 0.3, maxX: 0.7, minY: 0.35, maxY: 1.02 }), false, 'chin clipped at the bottom edge');
  assert.equal(isBoxOutOfFrame({ minX: 0.35, maxX: 0.65, minY: 0.2, maxY: 0.8 }), false, 'centred face');
  assert.equal(isBoxOutOfFrame({ minX: 0.9, maxX: 1.0, minY: 0.3, maxY: 0.6 }), true, 'centre x = 0.95');
  assert.equal(isBoxOutOfFrame({ minX: -0.25, maxX: 0.35, minY: 0.2, maxY: 0.8 }), true, 'less than 65% of the face visible');
});

test('person boxes: small and overlapping boxes do not make a second person', () => {
  const frame = { frameWidth: 640, frameHeight: 480 };
  const split = normalizeCocoSsdPredictions([
    { class: 'person', score: 0.9, bbox: [200, 100, 240, 380] },
    { class: 'person', score: 0.7, bbox: [220, 250, 200, 220] },
  ], frame);
  assert.equal(split.personCount, 1, 'a body split into two boxes is one person');
  const tiny = normalizeCocoSsdPredictions([
    { class: 'person', score: 0.9, bbox: [200, 100, 240, 380] },
    { class: 'person', score: 0.9, bbox: [10, 10, 40, 60] },
  ], frame);
  assert.equal(tiny.personCount, 1, 'a box under 4% of the frame is ignored');
  const two = normalizeCocoSsdPredictions([
    { class: 'person', score: 0.9, bbox: [20, 80, 220, 380] },
    { class: 'person', score: 0.8, bbox: [400, 80, 220, 380] },
  ], frame);
  assert.equal(two.personCount, 2);
});

test('AI violation logging sends sessionId, attemptGeneration and an eventId', async () => {
  const calls = [];
  const original = api.logStudentAssessmentViolation;
  api.logStudentAssessmentViolation = async (id, body) => { calls.push({ id, body }); return { ok: true }; };
  try {
    await logAiProctoringViolation({
      assessmentId: 'a1',
      submissionId: 's1',
      sessionId: 'session-1',
      attemptGeneration: 2,
      violation: { type: EVENTS.NO_FACE, message: 'No face', severity: 'high', confidence: 0.9, metadata: { durationMs: 2000 } },
    });
    await logAiProctoringViolation({
      assessmentId: 'a1',
      eventId: 'evt-7',
      violation: { type: EVENTS.MOBILE_DETECTED },
    });
  } finally {
    api.logStudentAssessmentViolation = original;
  }
  assert.equal(calls[0].id, 'a1');
  assert.equal(calls[0].body.sessionId, 'session-1');
  assert.equal(calls[0].body.attemptGeneration, 2);
  assert.equal(calls[0].body.submissionId, 's1');
  assert.equal(typeof calls[0].body.eventId, 'string');
  assert.ok(calls[0].body.eventId.length > 0);
  assert.equal(calls[1].body.eventId, 'evt-7');
  assert.equal('sessionId' in calls[1].body, false);
});
