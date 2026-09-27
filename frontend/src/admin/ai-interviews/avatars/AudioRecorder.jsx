import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { secondaryClass } from "../ui";

export default function AudioRecorder({
  disabled,
  maxSeconds = 60,
  onRecorded,
  onRecordingChange,
}) {
  const [recording, setRecording] = useState(false),
    [requesting, setRequesting] = useState(false),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState("");
  const recorder = useRef(null),
    stream = useRef(null),
    interval = useRef(null),
    timeout = useRef(null),
    alive = useRef(true);
  const callback = useRef({ onRecorded, onRecordingChange });
  callback.current = { onRecorded, onRecordingChange };
  const supported =
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const release = () => {
    clearInterval(interval.current);
    clearTimeout(timeout.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  };
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (recorder.current?.state === "recording") recorder.current.stop();
      release();
      callback.current.onRecordingChange?.(false);
    };
  }, []);
  const start = async () => {
    if (!supported || disabled || requesting) return;
    setRequesting(true);
    setError("");
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => window.MediaRecorder.isTypeSupported(type));
      const recordingDevice = new window.MediaRecorder(
        input,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = recordingDevice;
      const chunks = [];
      let failed = false;
      recordingDevice.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recordingDevice.onerror = () => {
        failed = true;
        if (alive.current) {
          setError("Recording failed. Try uploading an audio file instead.");
          setRecording(false);
          callback.current.onRecordingChange?.(false);
        }
        if (recordingDevice.state === "recording") recordingDevice.stop();
        release();
      };
      recordingDevice.onstop = () => {
        release();
        if (!alive.current) return;
        setRecording(false);
        callback.current.onRecordingChange?.(false);
        if (failed) return;
        if (!chunks.length) {
          setError("No audio was captured. Please try again.");
          return;
        }
        const type = recordingDevice.mimeType || mime || "audio/webm";
        const extension = type.includes("mp4")
          ? "m4a"
          : type.includes("ogg")
            ? "ogg"
            : "webm";
        callback.current.onRecorded(
          new File(chunks, `avatar-introduction.${extension}`, { type }),
        );
      };
      recordingDevice.start();
      setSeconds(0);
      setRecording(true);
      callback.current.onRecordingChange?.(true);
      interval.current = setInterval(
        () => setSeconds((value) => value + 1),
        1000,
      );
      timeout.current = setTimeout(() => {
        if (recordingDevice.state === "recording") recordingDevice.stop();
      }, maxSeconds * 1000);
    } catch (err) {
      release();
      if (alive.current)
        setError(
          err.name === "NotAllowedError"
            ? "Microphone permission was denied. Upload audio or allow microphone access."
            : "Unable to start recording. Upload an audio file instead.",
        );
    } finally {
      if (alive.current) setRequesting(false);
    }
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        className={secondaryClass}
        disabled={!supported || (!recording && (disabled || requesting))}
        onClick={recording ? () => recorder.current?.stop() : start}
      >
        {recording ? (
          <Square size={14} className="text-rose-500" />
        ) : (
          <Mic size={14} />
        )}
        {recording
          ? `Stop recording · ${seconds}s`
          : requesting
            ? "Allow microphone…"
            : "Record audio"}
      </button>
      {!supported && (
        <p className="text-xs text-slate-500">
          Recording is unavailable in this browser. You can upload audio
          instead.
        </p>
      )}
      {recording && (
        <p role="status" className="text-xs text-rose-600">
          Recording microphone audio. Stops automatically after {maxSeconds}{" "}
          seconds.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  );
}
