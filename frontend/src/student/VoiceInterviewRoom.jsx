import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mic, Square, Volume2, RotateCcw } from "lucide-react";
import { api } from "../utils/api";
import AnnuAvatar from "./AnnuAvatar";

const MAX_RECORDING_MS = 3 * 60 * 1000;
const FORMATS = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export default function VoiceInterviewRoom({ sessionId }) {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [transcriptId, setTranscriptId] = useState(null);
  const [recording, setRecording] = useState(false);
  const [working, setWorking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [mouthLevel, setMouthLevel] = useState(0);
  const [error, setError] = useState("");
  const audioRef = useRef(null);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const discardRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      discardRef.current = true;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSession(null); setTranscript(""); setTranscriptId(null); setError("");
    api.getStudentAIInterviewSession(sessionId).then((value) => {
      if (active) { setSession(value); setTranscript(value.pendingTranscript || ""); setTranscriptId(value.pendingTranscriptId || null); }
    }).catch((cause) => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [sessionId]);

  useEffect(() => {
    if (!session?.question || session.status !== "active") return undefined;
    let cancelled = false;
    let audio;
    let objectUrl;
    let context;
    let animationFrame;
    setAudioReady(false); setAudioLoading(true); setAudioError("");
    setSpeaking(false); setMouthLevel(0);
    api.getStudentAIQuestionAudio(session.id, session.version).then(async (blob) => {
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      audio = new Audio(objectUrl);
      audioRef.current = audio;
      let analyser;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          context = new AudioContextClass();
          const source = context.createMediaElementSource(audio);
          analyser = context.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyser.connect(context.destination);
        }
      } catch { /* Question audio still plays if analysis is unavailable. */ }
      const samples = analyser ? new Uint8Array(analyser.fftSize) : null;
      let lastSample = 0;
      const sampleVolume = (time) => {
        if (!analyser || audio.paused) return;
        if (time - lastSample >= 45) {
          analyser.getByteTimeDomainData(samples);
          let sum = 0;
          for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
          setMouthLevel(Math.sqrt(sum / samples.length));
          lastSample = time;
        }
        animationFrame = requestAnimationFrame(sampleVolume);
      };
      audio.onplay = () => { setSpeaking(true); void context?.resume(); animationFrame = requestAnimationFrame(sampleVolume); };
      const stopAnimation = () => { setSpeaking(false); setMouthLevel(0); cancelAnimationFrame(animationFrame); };
      audio.onpause = stopAnimation;
      audio.onended = stopAnimation;
      setAudioReady(true); setAudioLoading(false);
      try { await audio.play(); } catch { /* Autoplay may require the Play button. */ }
    }).catch((cause) => {
      if (!cancelled) { setAudioLoading(false); setAudioError(cause.message); }
    });
    return () => {
      cancelled = true;
      audio?.pause();
      if (audioRef.current === audio) audioRef.current = null;
      cancelAnimationFrame(animationFrame);
      void context?.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [session?.id, session?.version, session?.question, session?.status]);

  const playOrPause = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    setAudioError("");
    try { if (audio.ended) audio.currentTime = 0; await audio.play(); }
    catch { setAudioError("Playback was blocked. Check your browser audio settings and try again."); }
  };

  const startRecording = async () => {
    if (!session || working || recording) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Microphone recording needs a recent browser on HTTPS. Allow microphone access and try again.");
      return;
    }
    setError(""); setTranscript(""); setTranscriptId(null);
    audioRef.current?.pause();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!aliveRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const mimeType = FORMATS.find((value) => MediaRecorder.isTypeSupported(value));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      if (!/^audio\/(?:webm|mp4|wav|mpeg)(?:;|$)/i.test(recorder.mimeType))
        throw new Error("This browser's recording format is not supported. Try Chrome or Safari.");
      const chunks = [];
      recorderRef.current = recorder;
      discardRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => setError("The microphone stopped unexpectedly. Please record again.");
      recorder.onstop = async () => {
        clearTimeout(timerRef.current);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!aliveRef.current || discardRef.current) return;
        setRecording(false); setWorking(true);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const result = await api.transcribeStudentAIAnswer(session.id, blob, session.version);
          if (aliveRef.current) { setTranscript(result.transcript); setTranscriptId(result.transcriptId); }
        } catch (cause) { if (aliveRef.current) setError(cause.message); }
        finally { if (aliveRef.current) setWorking(false); }
      };
      recorder.start();
      setRecording(true);
      timerRef.current = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_RECORDING_MS);
    } catch (cause) {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setError(cause.message || "Microphone access was denied. Allow it and try again.");
    }
  };

  const confirmAnswer = async () => {
    if (!session || !transcript || !transcriptId || working) return;
    setWorking(true); setError("");
    try {
      const next = await api.answerStudentAIInterview(session.id, session.version, transcriptId);
      setSession(next); setTranscript(""); setTranscriptId(null);
    } catch (cause) {
      setError(cause.message);
      if (cause.response?.status === 409) {
        try {
          const fresh = await api.getStudentAIInterviewSession(session.id);
          setSession(fresh); setTranscript(fresh.pendingTranscript || ""); setTranscriptId(fresh.pendingTranscriptId || null);
        } catch { /* Keep the room visible. */ }
      }
    } finally { setWorking(false); }
  };

  const phase = speaking ? "speaking" : recording ? "listening" : working || audioLoading ? "thinking" : "idle";
  return <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-white"><div className="mx-auto max-w-3xl space-y-5">
    <header><Link to="/student/ai-interviews" className="text-sm font-semibold text-indigo-600">← All AI interviews</Link><h1 className="mt-2 text-2xl font-bold">Interview with ANNU</h1><p className="text-sm text-slate-500">ANNU uses an AI-generated voice. Your recording is transcribed; the audio is not saved by this app.</p></header>
    {error && <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {!session ? <p>Loading interview…</p> : <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <AnnuAvatar phase={phase} level={mouthLevel} />
      {session.turns?.length > 0 && <details className="mt-5 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer text-sm font-semibold">Conversation transcript ({session.turns.length} answers)</summary><div className="mt-3 max-h-64 space-y-3 overflow-y-auto text-sm">{session.turns.map((turn, index) => <div key={index}><p className="font-semibold text-indigo-600">ANNU: {turn.question}</p><p className="whitespace-pre-wrap">You: {turn.answer}</p></div>)}</div></details>}
      {session.status === "completed" ? <div className="mt-6 text-center"><h2 className="text-xl font-semibold">Interview complete</h2><p className="mt-2 text-sm text-slate-500">Your conversation has been saved.</p><button className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => navigate("/student/ai-interviews")}>Back to interviews</button></div> : <>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-indigo-600">Question {session.questionNumber} of {session.totalQuestions}{session.followUpNumber ? ` · Follow-up ${session.followUpNumber}` : ""}</p>
        <p className="mt-1 text-sm text-slate-500">{session.section} · {session.topic}</p>
        <h2 className="mt-3 whitespace-pre-wrap text-lg font-semibold">{session.question}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={playOrPause} disabled={!audioReady || recording} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50"><Volume2 size={17}/>{speaking ? "Pause question" : "Play question"}</button>{audioLoading && <span className="text-sm text-slate-500">Preparing ANNU’s voice…</span>}{audioError && <span role="alert" className="text-sm text-rose-600">{audioError}</span>}</div>
        <div className="mt-6 rounded-xl bg-slate-50 p-4 dark:bg-slate-950">
          {recording ? <button type="button" onClick={() => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); }} className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white"><Square size={16}/>Stop recording</button> : !transcript && <button type="button" onClick={startRecording} disabled={working || audioLoading || speaking} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><Mic size={18}/>Record answer</button>}
          <p aria-live="polite" className="mt-2 text-sm text-slate-500">{recording ? "Listening… speak your answer, then stop recording. Maximum 3 minutes." : working ? "Preparing your answer or next question…" : "Use your microphone to answer. Review the transcript before continuing."}</p>
          {transcript && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><p className="text-xs font-bold uppercase text-slate-500">Your recorded answer</p><p className="mt-2 whitespace-pre-wrap text-sm">{transcript}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={confirmAnswer} disabled={working || recording} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Use this answer</button><button type="button" onClick={startRecording} disabled={working || recording} className="inline-flex items-center gap-1 rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"><RotateCcw size={15}/>Record again</button></div></div>}
        </div>
      </>}
    </div>}
  </div></div>;
}
