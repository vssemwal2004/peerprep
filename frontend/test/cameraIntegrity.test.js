import assert from 'node:assert/strict';
import { after, before, test, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let server;
let EVENTS;
let getActiveRules;
let ProctoringManager;
let integrity;

before(async () => {
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  const load = (path) => server.ssrLoadModule(`/src/features/assessment/proctoring/${path}`);
  ({ AI_PROCTORING_EVENTS: EVENTS } = await load('constants/proctoringEvents.js'));
  ({ getActiveRules } = await load('rules/violationRules.js'));
  ({ ProctoringManager } = await load('ProctoringManager.js'));
  integrity = await load('utils/cameraIntegrity.js');
});

after(async () => {
  await server?.close();
});

const PIXELS = 32 * 18;

// A canvas whose "frame" the test controls: fill(value | fn(pixelIndex)) sets the next thumbnail.
function fakeSurface() {
  let frame = new Uint8ClampedArray(PIXELS * 4);
  const context = {
    drawImage() {},
    getImageData: () => ({ data: frame }),
  };
  return {
    createCanvas: () => ({ width: 0, height: 0, getContext: () => context }),
    fill(valueOrFn) {
      frame = new Uint8ClampedArray(PIXELS * 4);
      for (let p = 0; p < PIXELS; p += 1) {
        const value = typeof valueOrFn === 'function' ? valueOrFn(p) : valueOrFn;
        frame.set([value, value, value, 255], p * 4);
      }
    },
  };
}

function fakeVideo() {
  const video = { frames: 0, getVideoPlaybackQuality: () => ({ totalVideoFrames: video.frames }) };
  return video;
}

const streamOf = (label) => ({ getVideoTracks: () => [{ label, readyState: 'live', muted: false }] });

test('virtual-camera tools are matched by label; real and phone-relay webcams are not', () => {
  const { matchVirtualCameraLabel } = integrity;
  ['OBS Virtual Camera', 'ManyCam Virtual Webcam', 'Snap Camera', 'XSplit VCam', 'Streamlabs Virtual Camera', 'v4l2loopback', 'Virtual Camera']
    .forEach((label) => assert.ok(matchVirtualCameraLabel(label), `${label} is virtual`));
  ['Integrated Camera', 'HD Webcam C920', 'USB2.0 HD UVC WebCam', 'DroidCam Video', 'Iriun Webcam', 'NVIDIA Broadcast', '', null]
    .forEach((label) => assert.equal(matchVirtualCameraLabel(label), null, `${label} is not flagged`));
});

test('a virtual device label is suspected on the first sample, without waiting for frames', () => {
  const monitor = new integrity.CameraIntegrityMonitor({ createCanvas: () => null });
  const result = monitor.evaluate(streamOf('OBS Virtual Camera'), fakeVideo());
  assert.deepEqual(
    { fresh: result.fresh, suspected: result.suspected, reason: result.reason, label: result.label },
    { fresh: true, suspected: true, reason: 'virtual_device_label', label: 'OBS Virtual Camera' },
  );
});

test('a feed whose pixels never change is suspected only after the full window of new frames', () => {
  const surface = fakeSurface();
  const monitor = new integrity.CameraIntegrityMonitor({ createCanvas: surface.createCanvas, window: 5 });
  const video = fakeVideo();
  const stream = streamOf('Integrated Camera');
  surface.fill(120);

  const results = [];
  for (let i = 0; i < 8; i += 1) {
    video.frames += 1;
    results.push(monitor.evaluate(stream, video));
  }
  assert.equal(results[0].fresh, false, 'the first thumbnail has nothing to compare with');
  assert.deepEqual(results.map((r) => r.suspected), [false, false, false, false, false, true, true, true], 'five static comparisons in a row');
  assert.equal(results[5].reason, 'static_feed');
  assert.equal(results[5].diff, 0);
});

test('a live sensor (noise on every frame) is never suspected', () => {
  const surface = fakeSurface();
  const monitor = new integrity.CameraIntegrityMonitor({ createCanvas: surface.createCanvas, window: 5 });
  const video = fakeVideo();
  const stream = streamOf('Integrated Camera');
  let seed = 1;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed % 4; };

  for (let i = 0; i < 60; i += 1) {
    surface.fill(() => 100 + noise());
    video.frames += 1;
    assert.equal(monitor.evaluate(stream, video).suspected, false, `frame ${i}`);
  }
});

test('one real change resets the static run', () => {
  const surface = fakeSurface();
  const monitor = new integrity.CameraIntegrityMonitor({ createCanvas: surface.createCanvas, window: 4 });
  const video = fakeVideo();
  const stream = streamOf('Integrated Camera');
  const step = (value) => { surface.fill(value); video.frames += 1; return monitor.evaluate(stream, video); };

  [100, 100, 100, 100].forEach(step);
  assert.equal(step(100).suspected, true);
  assert.equal(step(140).suspected, false, 'movement ends the episode');
  assert.equal(step(140).suspected, false, 'and the run restarts from zero');
});

test('a frozen element (no new frames) is not a sample and never counts as static', () => {
  const surface = fakeSurface();
  const monitor = new integrity.CameraIntegrityMonitor({ createCanvas: surface.createCanvas, window: 3 });
  const video = fakeVideo();
  const stream = streamOf('Integrated Camera');
  surface.fill(90);
  video.frames = 10;
  monitor.evaluate(stream, video);

  for (let i = 0; i < 10; i += 1) {
    const result = monitor.evaluate(stream, video);
    assert.equal(result.fresh, false);
    assert.equal(result.suspected, false);
  }
});

test('an unreadable canvas degrades to "no opinion" instead of throwing', () => {
  const monitor = new integrity.CameraIntegrityMonitor({
    createCanvas: () => ({ getContext: () => ({ drawImage() { throw new Error('tainted'); }, getImageData() {} }) }),
  });
  const video = fakeVideo();
  video.frames = 1;
  assert.deepEqual(
    (({ fresh, suspected }) => ({ fresh, suspected }))(monitor.evaluate(streamOf('Integrated Camera'), video)),
    { fresh: false, suspected: false },
  );
});

test('the rule is on by default and switched off by detectVirtualCamera: false', () => {
  const types = (settings) => getActiveRules({ detectLookingAway: false, ...settings }).map((rule) => rule.type);
  assert.ok(types({}).includes(EVENTS.CAMERA_SPOOF_SUSPECTED));
  assert.equal(types({ detectVirtualCamera: false }).includes(EVENTS.CAMERA_SPOOF_SUSPECTED), false);
});

function managerWithStream(label, settings = {}) {
  const violations = [];
  const manager = new ProctoringManager({
    settings: { enabled: true, detectNoFace: false, detectFaceOutOfFrame: false, detectMultiplePersons: false, detectMobile: false, ...settings },
    onViolationConfirmed: (event) => violations.push(event),
  });
  manager.stream = streamOf(label);
  manager.videoElement = { paused: false, ended: false, readyState: 4, videoWidth: 640, videoHeight: 480 };
  manager.status = { ...manager.status, running: true };
  return { manager, violations };
}

test('a virtual camera raises one warning with the reason and device label for the admin report', async () => {
  let clock = 100000;
  mock.method(Date, 'now', () => clock);
  try {
    const { manager, violations } = managerWithStream('OBS Virtual Camera');
    await manager.runDetectionTick();
    clock += 500;
    await manager.runDetectionTick();

    assert.equal(violations.length, 1, 'one warning per episode, not one per tick');
    const [event] = violations;
    assert.equal(event.type, EVENTS.CAMERA_SPOOF_SUSPECTED);
    assert.equal(event.severity, 'high');
    assert.equal(event.metadata.reason, 'virtual_device_label');
    assert.equal(event.metadata.deviceLabel, 'OBS Virtual Camera');
    assert.equal(event.metadata.source, 'ai_proctoring', 'detector metadata cannot overwrite the fixed fields');
    manager.stop();
  } finally {
    mock.restoreAll();
  }
});

test('a physical webcam raises nothing, and detectVirtualCamera: false silences the check', async () => {
  const real = managerWithStream('Integrated Camera');
  await real.manager.runDetectionTick();
  assert.equal(real.violations.length, 0);
  real.manager.stop();

  const off = managerWithStream('OBS Virtual Camera', { detectVirtualCamera: false });
  await off.manager.runDetectionTick();
  assert.equal(off.violations.length, 0);
  off.manager.stop();
});

test('switching to a physical camera ends the episode and resets the monitor', async () => {
  let clock = 200000;
  mock.method(Date, 'now', () => clock);
  try {
    const { manager, violations } = managerWithStream('OBS Virtual Camera');
    await manager.runDetectionTick();
    assert.equal(manager.violationBuffer.isActive(EVENTS.CAMERA_SPOOF_SUSPECTED), true);

    await manager.replaceStream(streamOf('Integrated Camera'));
    for (let i = 0; i < 4; i += 1) {
      clock += 500;
      await manager.runDetectionTick();
    }
    assert.equal(manager.violationBuffer.isActive(EVENTS.CAMERA_SPOOF_SUSPECTED), false);
    assert.equal(violations.length, 1);
    manager.stop();
  } finally {
    mock.restoreAll();
  }
});
