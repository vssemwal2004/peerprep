import { useCallback, useEffect, useRef, useState } from "react";
import { MIC_CONSTRAINTS, micError } from "../useAnviLiveSession";

const HEARD_RMS = 0.03;
export const METER_BARS = 40;

/**
 * The microphone check of the lobby and the pre-start System check: asks for the microphone, then draws
 * a live level (bars in `barsRef`, a `--lvl` CSS variable on `levelRef`) straight to the DOM, so speaking
 * never re-renders React. The stream is kept for the room; `handOver()` gives it away, and an unused
 * stream is stopped on unmount. Also follows the browser's online state.
 */
export default function useMicCheck({ support }) {
  const [mic, setMic] = useState({ state: "idle", label: "", error: "" });
  const [heard, setHeard] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const streamRef = useRef(null);
  const meterRef = useRef(null);
  const handedOverRef = useRef(false);
  const barsRef = useRef(null);
  const levelRef = useRef(null);

  const stopMeter = useCallback(() => {
    const meter = meterRef.current;
    meterRef.current = null;
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
      void context.resume?.();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const meter = { context, source, frame: 0 };
      let smooth = 0;
      const draw = () => {
        analyser.getFloatTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
        const rms = Math.sqrt(sum / samples.length);
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
    } catch { /* No meter; the stream itself is fine. */ }
  }, [stopMeter]);

  const test = useCallback(async () => {
    if (!support?.ok || mic.state === "requesting") return;
    if (mic.state === "on" && meterRef.current) return;
    setMic((current) => (current.state === "on" ? current : { state: "requesting", label: "", error: "" }));
    try {
      const stream = streamRef.current?.active ? streamRef.current : await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      streamRef.current = stream;
      startMeter(stream);
      setMic({ state: "on", label: stream.getAudioTracks?.()[0]?.label || "Microphone", error: "" });
    } catch (cause) {
      setMic({ state: "error", label: "", error: micError(cause, "test again") });
    }
  }, [support?.ok, mic.state, startMeter]);

  /** The tested stream for the room (or null); after this the room owns it. */
  const handOver = useCallback(() => {
    const stream = streamRef.current?.active ? streamRef.current : null;
    handedOverRef.current = Boolean(stream);
    return stream;
  }, []);
  /** Undo `handOver` when the start did not happen, so the stream is still stopped on unmount. */
  const takeBack = useCallback(() => { handedOverRef.current = false; }, []);
  const stopStream = useCallback(() => { streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; }, []);

  const check = mic.state === "on"
    ? (heard ? { state: "ok", detail: `We can hear you${mic.label ? ` on ${mic.label}` : ""}.` } : { state: "ok", detail: `Microphone on${mic.label ? `: ${mic.label}` : ""}. Say a few words to check the level.` })
    : mic.state === "error" ? { state: "bad", detail: mic.error }
      : mic.state === "requesting" ? { state: "busy", detail: "Waiting for microphone permission…" }
        : { state: "idle", detail: "Not tested yet. Test it before you join." };

  return { mic, heard, online, check, ready: mic.state === "on", test, stopMeter, startMeter, handOver, takeBack, stopStream, streamRef, barsRef, levelRef };
}
