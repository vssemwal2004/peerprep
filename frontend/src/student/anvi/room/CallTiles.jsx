import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Mic, MicOff } from "lucide-react";
import AnviOrb from "../AnviOrb";
import { chip, initialsOf, surface, surfaceRing, surfaceShadow, useLevelVar } from "./callUtils";

/** Three bars that follow `--lvl` from the nearest useLevelVar element. */
export function LevelBars({ className = "", tone = "bg-violet-500 dark:bg-violet-300" }) {
  const bar = (weight) => ({ height: `calc(28% + var(--lvl, 0) * ${weight}%)` });
  return <span aria-hidden="true" className={`inline-flex h-3.5 w-3.5 items-center justify-center gap-[2px] ${className}`}>
    <span className={`w-[3px] rounded-full ${tone} transition-[height] duration-75`} style={bar(55)} />
    <span className={`w-[3px] rounded-full ${tone} transition-[height] duration-75`} style={bar(72)} />
    <span className={`w-[3px] rounded-full ${tone} transition-[height] duration-75`} style={bar(48)} />
  </span>;
}

const tileBase = `isolate flex min-h-0 items-center justify-center overflow-hidden rounded-2xl ring-1 transition-[box-shadow,--tw-ring-color] duration-300 motion-reduce:transition-none ${surface} ${surfaceShadow}`;
const plate = `absolute bottom-3 left-3 z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${chip}`;

/** ANVI's tile: the voice-reactive orb, a name plate and a glowing border while she speaks. */
export function AnviTile({ phase, getLevel, orbSize = 240, className = "", avatar = null }) {
  const speaking = phase === "speaking";
  const levelRef = useLevelVar(speaking ? getLevel : null);
  const videoRef = useRef(null);
  const previousPhase = useRef(phase);
  const [gestureChoice, setGestureChoice] = useState("idle");
  const [failedClips, setFailedClips] = useState(() => new Set());
  useEffect(() => {
    if (phase !== previousPhase.current) {
      const choices = phase === "speaking"
        ? ["speaking_neutral", "speaking_explain", "speaking_emphasis", "speaking_encourage", "speaking_question", "speaking_closing"]
        : phase === "listening" ? ["listening", "listening_nod"]
          : phase === "thinking" || phase === "connecting" ? ["thinking", "thinking_side"]
            : ["idle", "idle_smile"];
      setGestureChoice((current) => {
        const alternatives = choices.filter((id) => id !== current);
        return (alternatives.length ? alternatives : choices)[Math.floor(Math.random() * (alternatives.length || choices.length))];
      });
    }
    previousPhase.current = phase;
  }, [phase]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !speaking || typeof getLevel !== "function") return undefined;
    let frame;
    const followSpeech = () => {
      const level = Math.max(0, Math.min(1, Number(getLevel()) || 0));
      video.playbackRate = 0.82 + level * 0.5;
      frame = requestAnimationFrame(followSpeech);
    };
    frame = requestAnimationFrame(followSpeech);
    return () => cancelAnimationFrame(frame);
  }, [speaking, getLevel, gestureChoice, avatar?.enabled]);
  const candidates = [gestureChoice, speaking ? "speaking_neutral" : phase === "listening" ? "listening" : phase === "thinking" || phase === "connecting" ? "thinking" : "idle"];
  const clip = avatar?.enabled ? candidates.map((id) => avatar.gestures?.[id]).find((item) => item?.url && !failedClips.has(item.url)) : null;
  return (
    <section ref={levelRef} aria-label="ANVI, AI interviewer" data-speaking={speaking ? "1" : "0"}
      className={`${tileBase} relative ${speaking ? "ring-2 ring-violet-500/60 shadow-[0_0_0_4px_rgba(139,92,246,0.12),0_0_90px_-24px_rgba(139,92,246,0.55)] dark:ring-violet-400/80 dark:shadow-[0_0_0_4px_rgba(167,139,250,0.14),0_0_80px_-20px_rgba(167,139,250,0.55)]" : surfaceRing} ${className}`}>
      {/* A soft aurora behind the orb: violet core, a cyan and a fuchsia accent. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_55%_at_50%_45%,rgba(139,92,246,0.16),transparent_70%)] dark:bg-[radial-gradient(60%_55%_at_50%_45%,rgba(124,58,237,0.22),transparent_70%)]" />
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(38%_34%_at_72%_72%,rgba(34,211,238,0.12),transparent_70%),radial-gradient(34%_30%_at_26%_24%,rgba(217,70,239,0.08),transparent_70%)] dark:bg-[radial-gradient(38%_34%_at_72%_72%,rgba(34,211,238,0.08),transparent_70%),radial-gradient(34%_30%_at_26%_24%,rgba(217,70,239,0.07),transparent_70%)]" />
      {clip ? <video ref={videoRef} key={clip.url} autoPlay muted loop playsInline preload="auto" src={clip.url}
        onError={() => setFailedClips((current) => new Set([...current, clip.url]))}
        className="absolute inset-0 h-full w-full bg-slate-950 object-cover" aria-hidden="true" />
        : <AnviOrb phase={phase} getLevel={getLevel} size={orbSize} />}
      <span className={plate}>
        {speaking ? <LevelBars /> : <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-violet-500/70 dark:bg-violet-300/70" />}
        <span className="truncate">{avatar?.enabled ? avatar.name || "ANVI" : "ANVI"}</span>
        <span className="truncate text-slate-500 dark:text-white/60">· AI Interviewer</span>
      </span>
    </section>
  );
}

// Camera AI status chips (face, person, phone), in the Assessment module's words.
const CHIP_ITEMS = [["face", "Face"], ["person", "Person"], ["mobile", "Phone"]];
const CHIP_ISSUES = { face: ["missing", "out_of_frame", "multiple"], person: ["multiple", "missing"], mobile: ["detected"] };
const chipTone = (item, state) => {
  if (CHIP_ISSUES[item]?.includes(state)) return ["bg-rose-50/90 text-rose-700 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-100 dark:ring-rose-400/30", "bg-rose-500"];
  if (state === "ok") return ["bg-white/85 text-slate-700 ring-slate-900/[0.06] dark:bg-black/55 dark:text-zinc-100 dark:ring-white/10", "bg-emerald-500"];
  return ["bg-white/70 text-slate-500 ring-slate-900/[0.06] dark:bg-black/45 dark:text-zinc-400 dark:ring-white/10", "bg-slate-400 dark:bg-zinc-500"];
};

/** Compact face / person / phone chips over the camera preview; on phones a single dot. */
export function CameraChips({ status, statusText, compact = false }) {
  if (!status) return null;
  const issue = CHIP_ITEMS.some(([item]) => CHIP_ISSUES[item].includes(status[item]));
  if (compact) {
    return <span data-testid="anvi-camera-chips" title={issue ? "Camera check needs attention" : "Camera checks running"}
      className={`absolute left-2 top-2 z-20 h-2.5 w-2.5 rounded-full ring-2 ring-white/80 dark:ring-black/50 ${issue ? "bg-rose-500" : "bg-emerald-500"}`} />;
  }
  // Above the name plate, so a warning banner over the top of the stage never hides them.
  return <ul data-testid="anvi-camera-chips" aria-label="Camera checks" className="absolute bottom-14 left-3 z-20 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5">
    {CHIP_ITEMS.map(([item, label]) => {
      const [tone, dot] = chipTone(item, status[item]);
      const text = statusText(item, status[item]);
      return <li key={item} data-item={item} data-state={status[item] || "unknown"} title={`${label}: ${text}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset backdrop-blur-md ${tone}`}>
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} /><span className="whitespace-nowrap">{text}</span>
      </li>;
    })}
  </ul>;
}

/**
 * The student's compact self-view. Camera checks keep using the mounted video when the preview is
 * hidden; the student sees their profile photo or initials until they explicitly open the mirror view.
 */
export function YouTile({ name, profileImage = "", muted = false, getLevel = null, pip = false, className = "", camera = null }) {
  const levelRef = useLevelVar(muted ? null : getLevel, 6);
  const initials = initialsOf(name);
  const [failedProfile, setFailedProfile] = useState("");
  const avatar = pip ? "h-12 w-12 text-sm sm:h-14 sm:w-14 sm:text-base" : "h-24 w-24 text-3xl";
  const first = String(name || "").trim().split(/\s+/)[0];
  const previewVisible = Boolean(camera?.live && camera?.previewVisible);
  const canTogglePreview = Boolean(camera?.live && camera?.onTogglePreview);
  const cameraIssue = Boolean(camera?.status && CHIP_ITEMS.some(([item]) => CHIP_ISSUES[item].includes(camera.status[item])));
  return (
    <section ref={levelRef} aria-label={`You, microphone ${muted ? "muted" : "on"}${camera ? `, camera checks ${camera.live ? "on" : "off"}, preview ${previewVisible ? "shown" : "hidden"}` : ""}`}
      className={`${tileBase} ${pip ? "absolute" : "relative"} ${surfaceRing} ${className}`}>
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_50%_at_50%_45%,rgba(56,189,248,0.14),transparent_70%)] dark:bg-[radial-gradient(55%_50%_at_50%_45%,rgba(56,189,248,0.10),transparent_70%)]" />
      {camera && <video ref={camera.videoRef} data-testid="anvi-camera-preview" muted playsInline autoPlay aria-hidden="true"
        className={`absolute inset-0 h-full w-full -scale-x-100 object-cover transition-opacity duration-300 motion-reduce:transition-none ${previewVisible ? "opacity-100" : "opacity-0"}`} />}
      {previewVisible && <CameraChips status={camera.status} statusText={camera.statusText} compact={pip} />}
      {!muted && <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-2 ring-inset ring-emerald-500/80 dark:ring-emerald-400/90" style={{ opacity: "min(1, calc(var(--lvl, 0) * 1.6))" }} />}
      {!previewVisible && <span className="relative flex items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-emerald-400/30 motion-reduce:hidden dark:bg-emerald-400/25"
          style={{ transform: `scale(calc(1 + var(--lvl, 0) * ${pip ? 0.35 : 0.3}))`, opacity: "calc(var(--lvl, 0) * 1.4)" }} />
        {profileImage && failedProfile !== profileImage
          ? <img src={profileImage} alt="" onError={() => setFailedProfile(profileImage)} className={`relative ${avatar} rounded-full object-cover shadow-lg shadow-indigo-900/20 ring-4 ring-white/90 dark:shadow-black/30 dark:ring-[#141821]`} />
          : <span className={`relative flex ${avatar} items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 font-semibold tracking-wide text-white shadow-lg shadow-indigo-900/20 ring-4 ring-white/90 dark:shadow-black/30 dark:ring-[#141821]`}>{initials}</span>}
      </span>}
      {canTogglePreview && <button type="button" onClick={camera.onTogglePreview}
        aria-label={previewVisible ? "Hide self-view" : "Show self-view"}
        title={previewVisible ? "Hide self-view" : "Show self-view"}
        className={`absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-full text-slate-700 shadow-sm ring-1 ring-inset transition hover:scale-105 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 motion-reduce:transition-none dark:text-zinc-100 dark:hover:bg-zinc-800 ${chip}`}>
        {previewVisible ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>}
      {muted && pip && <span className={`absolute ${canTogglePreview ? "right-11" : "right-2"} top-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-white shadow-sm`}><MicOff className="h-3.5 w-3.5" aria-hidden="true" /></span>}
      {pip ? <span className={`absolute bottom-2 left-2 right-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium ${chip}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cameraIssue ? "bg-rose-500" : camera?.live ? "bg-emerald-500" : "bg-slate-400"}`} aria-hidden="true" />
        <span className="truncate">{first ? `${first} (You)` : "You"}</span>
        <span className={`ml-auto shrink-0 ${cameraIssue ? "text-rose-600 dark:text-rose-300" : "text-slate-500 dark:text-zinc-400"}`}>{cameraIssue ? "Check camera" : previewVisible ? "Preview on" : camera?.live ? "Checks on" : muted ? "Muted" : "Mic on"}</span>
      </span>
        : <span className={plate}>
          {muted ? <MicOff className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden="true" /> : <Mic className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />}
          <span className="truncate">{first ? `${first} (You)` : "You"}</span>
          <span className={`truncate ${muted ? "text-rose-600 dark:text-rose-200" : "text-slate-500 dark:text-white/60"}`}>· {muted ? "Muted" : "Mic on"}</span>
        </span>}
    </section>
  );
}
