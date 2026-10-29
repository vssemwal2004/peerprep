// ANVI hybrid mode: cuts the student's 100 ms capture frames ({ pcm, rms }, 16 kHz s16le) into answer
// segments. Pure and synchronous: no timers, no Web Audio, no network. It only receives frames that
// already passed the echo, mute and pause gates; the caller streams and commits what it returns.
//
// VAD: an adaptive (EMA) noise floor; onset after `onsetFrames` frames above max(onsetMinRms,
// onsetFloorFactor x floor) with `preRollMs` of audio kept from before; release below 2 x floor; the
// segment closes after `hangoverMs` of release-level audio (optionally a speculative close earlier),
// with the trailing silence trimmed. Shorter than `minSpeechMs` of voiced audio is dropped (a cough).
// A segment longer than `maxSegmentSeconds` is split into parts of the same turn. PTT bypasses onset
// and hangover: the held span is the segment.

import { LIMITS, VAD_DEFAULTS } from "./anviHybridProtocol";

export const SEGMENTER_DEFAULTS = Object.freeze({
  ...VAD_DEFAULTS,
  frameMs: LIMITS.frameMs,
  sampleRate: LIMITS.captureSampleRate,
  hangoverMs: 2000,
  speculativeEndMs: null,
  releaseFloorFactor: 2,
  // A floor of near-digital-silence would put the release level under the hiss of any microphone.
  releaseMinRms: 0.012,
  initialFloor: 0.004,
  // The first frames of a session set the floor directly; afterwards it falls fast and rises slowly.
  calibrationFrames: 3,
  floorRise: 0.05,
  floorFall: 0.3,
  // `noisy()`: a floor this high, or this many short (dropped) onsets in a row, suggests push-to-talk.
  noisyFloor: 0.05,
  noisyDiscards: 3,
  maxParts: LIMITS.maxPartsPerTurn,
});

const INPUT_MODES = new Set(["vad", "ptt"]);

const bytesOf = (pcm) => {
  if (pcm instanceof Uint8Array) return pcm;
  if (ArrayBuffer.isView(pcm)) return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  if (pcm instanceof ArrayBuffer) return new Uint8Array(pcm);
  return null;
};

/** RMS of s16le bytes, in [0, 1]. */
export function rmsOfPcm(bytes) {
  const samples = bytes.length >> 1;
  if (!samples) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples * 2);
  let sum = 0;
  for (let i = 0; i < samples; i += 1) {
    const value = view.getInt16(i * 2, true) / 0x8000;
    sum += value * value;
  }
  return Math.sqrt(sum / samples);
}

const concat = (frames) => {
  const out = new Uint8Array(frames.reduce((sum, frame) => sum + frame.bytes.length, 0));
  let offset = 0;
  for (const frame of frames) { out.set(frame.bytes, offset); offset += frame.bytes.length; }
  return out;
};

/**
 * `createAnviSegmenter(options)`; options default to SEGMENTER_DEFAULTS, and the server's join ack
 * (`hybrid.vad`) can be passed as is. Methods that consume audio return the events they caused:
 * - `{ type: "onset", part, resumed }`: speech started (`resumed` when an earlier part of the turn exists).
 * - `{ type: "segment", part, final, speculative, pcm, durationMs, speechMs }`: a part to stream and commit.
 *   `final: false` means the answer continues in the next part (a max-length split).
 * - `{ type: "discard", reason: "short" | "cancel" }`: an open segment was dropped.
 * `onEvent(event)` also receives every event.
 */
export function createAnviSegmenter(options = {}) {
  const settings = { ...SEGMENTER_DEFAULTS };
  const onEvent = typeof options.onEvent === "function" ? options.onEvent : () => {};

  let floor = settings.initialFloor;
  let calibrating = [];
  let mode = "vad";
  let preRoll = [];
  // The open segment: { frames, voicedFrames, lastVoiced, bytes } or null.
  let open = null;
  let onsetRun = 0;
  let silentFrames = 0;
  let part = 0;
  let discardsInRow = 0;
  let pttHeld = false;

  const frameBytes = () => Math.round((settings.sampleRate * settings.frameMs) / 1000) * 2;
  const framesFor = (ms) => Math.max(1, Math.ceil(ms / settings.frameMs));
  const maxSegmentBytes = () => Math.min(LIMITS.maxSegmentBytes, Math.round(settings.maxSegmentSeconds * settings.sampleRate) * 2);
  const onsetLevel = () => Math.max(settings.onsetMinRms, settings.onsetFloorFactor * floor);
  const releaseLevel = () => Math.min(onsetLevel(), Math.max(settings.releaseMinRms, settings.releaseFloorFactor * floor));

  const configure = (next = {}) => {
    for (const key of Object.keys(SEGMENTER_DEFAULTS)) {
      // The join ack (`hybrid.vad`) names the onset floor `onsetRms`.
      const value = key === "onsetMinRms" && next.onsetMinRms === undefined ? next.onsetRms : next[key];
      if (key === "speculativeEndMs") {
        if (value === null || (Number.isFinite(value) && value > 0)) settings[key] = value;
      } else if (Number.isFinite(value) && value >= 0) settings[key] = value;
    }
    if (INPUT_MODES.has(next.inputMode)) mode = next.inputMode;
  };
  configure(options);

  const emit = (events, event) => { events.push(event); onEvent(event); return events; };

  const updateFloor = (rms) => {
    if (calibrating) {
      calibrating.push(rms);
      if (calibrating.length >= settings.calibrationFrames) {
        floor = Math.max(settings.initialFloor / 4, calibrating.reduce((sum, value) => sum + value, 0) / calibrating.length);
        calibrating = null;
      }
      return;
    }
    floor += (rms - floor) * (rms < floor ? settings.floorFall : settings.floorRise);
  };

  const pushPreRoll = (frame) => {
    preRoll.push(frame);
    const keep = framesFor(settings.preRollMs) + Math.max(1, settings.onsetFrames);
    if (preRoll.length > keep) preRoll.splice(0, preRoll.length - keep);
  };

  const newSegment = ({ ptt = false, continuation = false } = {}) => ({ frames: [], voicedFrames: 0, lastVoiced: -1, bytes: 0, ptt, continuation });

  const startSegment = (frames, events, ptt = false) => {
    open = newSegment({ ptt });
    for (const frame of frames) {
      open.frames.push(frame);
      open.bytes += frame.bytes.length;
      if (frame.voiced) { open.voicedFrames += 1; open.lastVoiced = open.frames.length - 1; }
    }
    preRoll = [];
    silentFrames = 0;
    onsetRun = 0;
    emit(events, { type: "onset", part, resumed: part > 0 });
  };

  // Closes the open segment: trims trailing silence (one frame of tail is kept), drops it when too
  // short, otherwise emits it. A PTT segment is measured by its length (a quiet speaker may stay under
  // the release level); a VAD segment by its voiced time. A continuation part (after a max-length
  // split) that holds no speech emits `end`, so the caller knows the previous part closed the answer.
  const closeSegment = (events, { final, speculative = false, trim = true } = {}) => {
    const segment = open;
    open = null;
    silentFrames = 0;
    if (!segment) return events;
    let frames = segment.frames;
    if (trim && segment.lastVoiced >= 0) frames = frames.slice(0, segment.lastVoiced + 2);
    const speechMs = segment.voicedFrames * settings.frameMs;
    const durationMs = Math.round((frames.reduce((sum, frame) => sum + frame.bytes.length, 0) / 2 / settings.sampleRate) * 1000);
    const short = segment.continuation
      ? !frames.length || (!segment.ptt && segment.voicedFrames === 0)
      : !frames.length || (segment.ptt ? durationMs : speechMs) < settings.minSpeechMs;
    if (short) {
      if (segment.continuation) return emit(events, { type: "end", part: part - 1 });
      discardsInRow += 1;
      return emit(events, { type: "discard", reason: "short" });
    }
    discardsInRow = 0;
    const event = { type: "segment", part, final, speculative, pcm: concat(frames), durationMs, speechMs };
    part += 1;
    return emit(events, event);
  };

  const appendFrame = (frame, events) => {
    open.frames.push(frame);
    open.bytes += frame.bytes.length;
    if (frame.voiced) { open.voicedFrames += 1; open.lastVoiced = open.frames.length - 1; }
    if (open.bytes >= maxSegmentBytes()) {
      // Max length reached in a VAD pause: the part closes as if the hangover had passed; speech that
      // resumes is a new part through a normal onset.
      if (!frame.voiced && !open.ptt) {
        closeSegment(events, { final: true });
        return;
      }
      // Max length mid-speech: this part ends here untrimmed and the answer continues in the next part, no pre-roll.
      const { ptt } = open;
      closeSegment(events, { final: false, trim: false });
      if (part < settings.maxParts) open = newSegment({ ptt, continuation: true });
      else {
        pttHeld = false;
        emit(events, { type: "end", part: part - 1 });
      }
    }
  };

  /** Feeds one capture frame `{ pcm, rms? }`. Returns the events it caused. */
  const push = (frame) => {
    const events = [];
    const bytes = bytesOf(frame?.pcm);
    if (!bytes?.length) return events;
    const rms = Number.isFinite(frame.rms) ? frame.rms : rmsOfPcm(bytes);
    const entry = { bytes: bytes.slice(), rms, voiced: rms >= releaseLevel() };

    if (mode === "ptt") {
      if (open) appendFrame(entry, events);
      else { updateFloor(rms); pushPreRoll(entry); }
      return events;
    }

    if (open) {
      appendFrame(entry, events);
      if (!open) return events;
      if (entry.voiced) { silentFrames = 0; return events; }
      updateFloor(rms);
      silentFrames += 1;
      const silentMs = silentFrames * settings.frameMs;
      if (silentMs >= settings.hangoverMs) closeSegment(events, { final: true });
      else if (settings.speculativeEndMs && settings.speculativeEndMs < settings.hangoverMs && silentMs >= settings.speculativeEndMs) {
        closeSegment(events, { final: true, speculative: true });
      }
      return events;
    }

    if (part >= settings.maxParts) { updateFloor(rms); return events; }
    const loud = !calibrating && rms > onsetLevel();
    entry.voiced = loud || entry.voiced;
    pushPreRoll(entry);
    if (loud) {
      onsetRun += 1;
      if (onsetRun >= settings.onsetFrames) startSegment(preRoll, events);
    } else {
      onsetRun = 0;
      updateFloor(rms);
    }
    return events;
  };

  /**
   * Push-to-talk pressed: switches to PTT and opens the segment now, with the pre-roll, whatever the
   * level. A VAD segment already open is kept and continues as the held one.
   */
  const pttDown = () => {
    const events = [];
    if (pttHeld || part >= settings.maxParts) return events;
    mode = "ptt";
    pttHeld = true;
    onsetRun = 0;
    if (open) { open.ptt = true; return events; }
    startSegment(preRoll, events, true);
    return events;
  };

  /** Push-to-talk released: the held span is one final segment. */
  const pttUp = () => {
    const events = [];
    if (!pttHeld) return events;
    pttHeld = false;
    return closeSegment(events, { final: true });
  };

  /** "Done answering": closes the open segment now as the final part. */
  const end = () => {
    const events = [];
    if (pttHeld) return pttUp();
    if (open) closeSegment(events, { final: true });
    return events;
  };

  /** Drops the open segment (mute, hold, pause, a new prompt). The noise floor is kept. */
  const cancel = () => {
    const events = [];
    const had = Boolean(open);
    open = null;
    pttHeld = false;
    silentFrames = 0;
    onsetRun = 0;
    preRoll = [];
    if (had) emit(events, { type: "discard", reason: "cancel" });
    return events;
  };

  /** A new turn: cancels anything open and restarts part numbering. */
  const reset = () => {
    const events = cancel();
    part = 0;
    discardsInRow = 0;
    return events;
  };

  const setInputMode = (next) => {
    if (!INPUT_MODES.has(next) || next === mode) return [];
    const events = cancel();
    mode = next;
    return events;
  };

  return {
    push,
    pttDown,
    pttUp,
    end,
    cancel,
    reset,
    configure,
    setInputMode,
    inputMode: () => mode,
    // True when the room is noisy enough that push-to-talk would serve the student better.
    noisy: () => floor >= settings.noisyFloor || discardsInRow >= settings.noisyDiscards,
    speaking: () => Boolean(open),
    part: () => part,
    floor: () => floor,
    frameBytes,
  };
}
