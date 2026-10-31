import { useCallback, useEffect, useRef, useState } from "react";
import { MIC_CONSTRAINTS, micError } from "../useAnviLiveSession";

const HEARD_RMS = 0.03;
export const METER_BARS = 40;
// A real microphone always carries some hiss; a peak under this for SILENT_AFTER_MS is a muted one
// (a laptop's mic-mute key, Windows input volume at 0, a privacy switch), which sends pure silence.
const SILENT_PEAK = 2e-4;
const SILENT_AFTER_MS = 4000;
// A meter whose AudioContext is still not running after this long needs a click to start.
const SUSPENDED_AFTER_MS = 1200;

// The read-aloud check: one of these is shown at random and the student reads it; the microphone passes
// once it carried about as much clear voice as the sentence takes to say. Checked on this device only.
export const READ_SENTENCES = Object.freeze([
  "I am ready to begin my interview with ANVI today.",
  "Good communication helps a team solve problems faster and better.",
  "I enjoy learning new skills and using them in real projects.",
  "Practice every day and you will see steady progress over time.",
  "A clear plan makes any difficult task much easier to finish.",
  "My microphone is working and my voice sounds clear and steady.",
]);
const READ_VOICE_RMS = 0.015;
// Voiced time needed per word of the sentence (people read about 2.5 words a second, ~60% voiced).
const READ_MS_PER_WORD = 140;
// The reading is over after this much quiet following the voice; it fails with no voice by NONE_MS.
const READ_END_QUIET_MS = 1500;
const READ_NONE_MS = 8000;
const READ_MAX_MS = 15000;

/**
 * The read-aloud verdict so far: "pass", "short" (some voice, too little for the sentence), "none" (no
 * voice at all) or null while the student may still be reading.
 */
export function readingVerdict({ words, voicedMs, elapsedMs, quietMs }) {
  const need = Math.max(1, words) * READ_MS_PER_WORD;
  if (voicedMs <= 0) return elapsedMs >= READ_NONE_MS ? "none" : null;
  if (quietMs >= READ_END_QUIET_MS || elapsedMs >= READ_MAX_MS) return voicedMs >= need ? "pass" : "short";
  return null;
}

const wordsOf = (sentence) => String(sentence).trim().split(/\s+/).filter(Boolean).length;
const pickSentence = (previous = "") => {
  const choices = READ_SENTENCES.filter((sentence) => sentence !== previous);
  return choices[Math.floor(Math.random() * choices.length)] || READ_SENTENCES[0];
};

export const MIC_SILENT_HELP ="Your microphone is on but sends no sound, so it is probably muted. Press your laptop's mic-mute key, check Windows Settings › System › Sound › Input (volume above 0), or choose another microphone.";

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const constraintsFor = (deviceId) => (deviceId
  ? { audio: { ...MIC_CONSTRAINTS.audio, deviceId: { exact: deviceId } } }
  : MIC_CONSTRAINTS);

/**
 * The microphone check of the lobby and the pre-start System check: asks for the microphone, then draws
 * a live level (bars in `barsRef`, a `--lvl` CSS variable on `levelRef`) straight to the DOM, so speaking
 * never re-renders React. The stream is kept for the room; `handOver()` gives it away, and an unused
 * stream is stopped on unmount. Also follows the browser's online state.
 * `signal`: "checking", "flowing" (sound arrives), "silent" (the microphone sends nothing: muted) or
 * "suspended" (the browser holds the audio until a click). `devices` lists the microphones to pick from.
 * `readAloud`: the student must read a random sentence aloud (`read`, `startReading`, `newSentence`)
 * before the microphone counts as `verified`.
 */
export default function useMicCheck({ support, readAloud = false }) {
  const [mic, setMic] = useState({ state: "idle", label: "", error: "" });
  const [heard, setHeard] = useState(false);
  const [signal, setSignal] = useState("checking");
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState("");
  const [meterOn, setMeterOn] = useState(false);
  const [read, setRead] = useState(() => ({ state: "idle", sentence: pickSentence(), reason: "" }));
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const streamRef = useRef(null);
  const meterRef = useRef(null);
  // The reading in progress: { sentence, words, startedAt, lastAt, lastVoiceAt, voicedMs, floor }.
  const readingRef = useRef(null);
  const handedOverRef = useRef(false);
  const barsRef = useRef(null);
  const levelRef = useRef(null);

  const stopMeter = useCallback(() => {
    const meter = meterRef.current;
    meterRef.current = null;
    if (readingRef.current) {
      readingRef.current = null;
      setRead((current) => (current.state === "listening" ? { ...current, state: "idle", reason: "" } : current));
    }
    if (!meter) return;
    window.cancelAnimationFrame?.(meter.frame);
    try { meter.source.disconnect(); } catch { /* Already disconnected. */ }
    void meter.context.close?.()?.catch?.(() => {});
    levelRef.current?.style.setProperty("--lvl", "0");
    barsRef.current?.querySelectorAll("span").forEach((bar) => { bar.dataset.on = "0"; });
  }, []);

  useEffect(() => () => {
    stopMeter();
    if (!handedOverRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [stopMeter]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  // The level meter is a nicety: if Web Audio cannot build it, the microphone still counts as ready.
  const startMeter = useCallback((stream) => {
    stopMeter();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const raf = window.requestAnimationFrame?.bind(window);
    if (!AudioContextClass || !raf) return;
    try {
      const context = new AudioContextClass();
      void context.resume?.()?.catch?.(() => {});
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const meter = { context, source, frame: 0 };
      const track = stream.getAudioTracks?.()[0] || null;
      let smooth = 0;
      let runningSince = 0;
      let peak = 0;
      let reported = "";
      const startedAt = now();
      setSignal("checking");
      const report = (next) => { if (next !== reported) { reported = next; setSignal(next); } };
      const draw = () => {
        const at = now();
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        let framePeak = 0;
        for (let i = 0; i < samples.length; i += 1) {
          sum += samples[i] * samples[i];
          const magnitude = Math.abs(samples[i]);
          if (magnitude > framePeak) framePeak = magnitude;
        }
        const rms = Math.sqrt(sum / samples.length);
        // Sound only counts once the context runs; a suspended one reads as silence.
        if (context.state === "running") {
          if (!runningSince) { runningSince = at; peak = 0; }
          peak = Math.max(peak, framePeak);
          if (peak >= SILENT_PEAK && !track?.muted) report("flowing");
          else if (track?.muted || at - runningSince >= SILENT_AFTER_MS) report("silent");
        } else if (context.state === "suspended") {
          runningSince = 0;
          if (at - startedAt >= SUSPENDED_AFTER_MS) report("suspended");
        }
        const reading = readingRef.current;
        if (reading && context.state === "running") {
          const step = reading.lastAt ? Math.min(100, at - reading.lastAt) : 0;
          reading.lastAt = at;
          if (rms >= Math.max(READ_VOICE_RMS, reading.floor * 3)) { reading.voicedMs += step; reading.lastVoiceAt = at; }
          else reading.floor += (rms - reading.floor) * 0.05;
          const verdict = readingVerdict({
            words: reading.words, voicedMs: reading.voicedMs, elapsedMs: at - reading.startedAt, quietMs: reading.lastVoiceAt ? at - reading.lastVoiceAt : 0,
          });
          if (verdict) {
            readingRef.current = null;
            setRead({ state: verdict === "pass" ? "passed" : "failed", sentence: reading.sentence, reason: verdict === "pass" ? "" : verdict });
          }
        }
        smooth += (rms - smooth) * (rms > smooth ? 0.5 : 0.12);
        if (rms > HEARD_RMS) setHeard(true);
        const level = Math.min(1, smooth * 9);
        const lit = Math.round(level * METER_BARS);
        barsRef.current?.querySelectorAll("span").forEach((bar, index) => { bar.dataset.on = index < lit ? "1" : "0"; });
        levelRef.current?.style.setProperty("--lvl", level.toFixed(3));
        meter.frame = raf(draw);
      };
      meter.frame = raf(draw);
      meterRef.current = meter;
      meter.smooth = () => smooth;
      setMeterOn(true);
    } catch { /* No meter; the stream itself is fine. */ }
  }, [stopMeter]);

  /**
   * Starts the read-aloud check of the sentence on screen (in this click, which also lets a suspended
   * meter run). Needs the level meter; without Web Audio there is nothing to measure and no check.
   */
  const startReading = useCallback(() => {
    const meter = meterRef.current;
    if (!meter || readingRef.current) return false;
    void meter.context.resume?.()?.catch?.(() => {});
    const sentence = read.sentence;
    readingRef.current = { sentence, words: wordsOf(sentence), startedAt: now(), lastAt: 0, lastVoiceAt: 0, voicedMs: 0, floor: Math.min(READ_VOICE_RMS, meter.smooth?.() || 0) };
    setRead({ state: "listening", sentence, reason: "" });
    return true;
  }, [read.sentence]);

  /** Another sentence, for a fresh try. */
  const newSentence = useCallback(() => {
    readingRef.current = null;
    setRead((current) => ({ state: "idle", sentence: pickSentence(current.sentence), reason: "" }));
  }, []);

  // The microphones to choose from (their names only show once the browser has granted access).
  const listDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices?.enumerateDevices?.();
      const inputs = (all || []).filter((device) => device.kind === "audioinput" && device.deviceId && device.deviceId !== "communications");
      setDevices(inputs.map((device, index) => ({ id: device.deviceId, label: device.label || `Microphone ${index + 1}` })));
    } catch { setDevices([]); }
  }, []);

  const open = useCallback(async (id) => {
    const stream = await navigator.mediaDevices.getUserMedia(constraintsFor(id));
    streamRef.current = stream;
    startMeter(stream);
    const track = stream.getAudioTracks?.()[0];
    setDeviceId(track?.getSettings?.().deviceId || id || "");
    setMic({ state: "on", label: track?.label || "Microphone", error: "" });
    void listDevices();
  }, [listDevices, startMeter]);

  const test = useCallback(async () => {
    if (!support?.ok || mic.state === "requesting") return;
    if (mic.state === "on" && meterRef.current) {
      // A meter the browser held until a click: this click lets it run.
      void meterRef.current.context.resume?.()?.catch?.(() => {});
      return;
    }
    setMic((current) => (current.state === "on" ? current : { state: "requesting", label: "", error: "" }));
    try {
      if (streamRef.current?.active) {
        startMeter(streamRef.current);
        setMic({ state: "on", label: streamRef.current.getAudioTracks?.()[0]?.label || "Microphone", error: "" });
      } else await open(deviceId);
    } catch (cause) {
      setMic({ state: "error", label: "", error: micError(cause, "test again") });
    }
  }, [support?.ok, mic.state, startMeter, open, deviceId]);

  /** Switches to another microphone: the old one is released and the check starts again on the new one. */
  const selectDevice = useCallback(async (id) => {
    if (!id || id === deviceId || !support?.ok) return;
    stopMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setHeard(false);
    // A new microphone has to pass the read-aloud check again.
    setRead((current) => ({ ...current, state: "idle", reason: "" }));
    setMic({ state: "requesting", label: "", error: "" });
    try { await open(id); } catch (cause) { setMic({ state: "error", label: "", error: micError(cause, "test again") }); }
  }, [deviceId, open, stopMeter, support?.ok]);

  /** The tested stream for the room (or null); after this the room owns it. */
  const handOver = useCallback(() => {
    const stream = streamRef.current?.active ? streamRef.current : null;
    handedOverRef.current = Boolean(stream);
    return stream;
  }, []);
  /** Undo `handOver` when the start did not happen, so the stream is still stopped on unmount. */
  const takeBack = useCallback(() => { handedOverRef.current = false; }, []);
  const stopStream = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; }, []);

  const silent = mic.state === "on" && signal === "silent" && !heard;
  // With `readAloud` (the pre-start System check), once the level meter runs the read-aloud check is
  // required; without a meter there is nothing to measure, so the open microphone is enough.
  const readRequired = readAloud && meterOn;
  const verified = mic.state === "on" && !silent && (!readRequired || read.state === "passed");
  const check = mic.state === "on"
    ? (silent ? { state: "bad", detail: MIC_SILENT_HELP }
      : !readRequired ? (heard ? { state: "ok", detail: `We can hear you${mic.label ? ` on ${mic.label}` : ""}.` } : { state: "ok", detail: `Microphone on${mic.label ? `: ${mic.label}` : ""}. Say a few words to check the level.` })
      : verified ? { state: "ok", detail: `We can hear you${mic.label ? ` on ${mic.label}` : ""}.` }
        : read.state === "failed" ? { state: "bad", detail: read.reason === "none" ? "We couldn't hear you read the sentence. Check that your microphone isn't muted, then try again." : "That was too short. Read the whole sentence aloud, then pause." }
          : read.state === "listening" ? { state: "busy", detail: "Listening… read the sentence aloud." }
            : { state: "busy", detail: `Microphone on${mic.label ? `: ${mic.label}` : ""}. Read the sentence aloud to confirm ANVI can hear you.` })
    : mic.state === "error" ? { state: "bad", detail: mic.error }
      : mic.state === "requesting" ? { state: "busy", detail: "Waiting for microphone permission…" }
        : { state: "idle", detail: "Not tested yet. Test it before you join." };

  return {
    mic, heard, online, check, ready: mic.state === "on" && !silent, silent, signal, devices, deviceId, selectDevice,
    read, readAloud, readRequired, verified, startReading, newSentence,
    test, stopMeter, startMeter, handOver, takeBack, stopStream, streamRef, barsRef, levelRef,
  };
}
