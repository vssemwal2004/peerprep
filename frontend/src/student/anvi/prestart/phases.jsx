import {
  AlertTriangle, Ban, Briefcase, Building2, Camera, Circle, Clock3, Eye, FileText, Headphones, Languages, Layers, Loader2,
  LogOut, Maximize2, MessageSquareText, Mic, Monitor, PauseCircle, Repeat2, RotateCcw, ScanFace, ShieldAlert, ShieldCheck, Smartphone, UserRoundX, Users, Wifi,
} from "lucide-react";
import { useId } from "react";
import ProctoringFooter from "../../../features/assessment/student/components/ProctoringFooter";
import { getProctoringStatusText } from "../../../features/assessment/student/components/ProctoringStatusBadge";
import { formatIST } from "../anviSchedule";
import { ConsentBox, TermsStep } from "../LobbySteps";
import ResumeStep from "../ResumeStep";
import { focus } from "../list/styles";
import { CAMERA_PRIVACY, PHASES, aiChecksOf, proctoringRulesOf } from "./prestartModel";
import { AnimatedCheck } from "./motion";
import { CheckRow, MicPanel } from "./ui";
import { glass } from "./styles";

const RULE_ICONS = { fullscreen: Maximize2, tabSwitch: Layers, refresh: RotateCcw, blocked: Ban, warnings: AlertTriangle, limit: ShieldAlert };
const AI_ICONS = { noFace: ScanFace, outOfFrame: Camera, multiplePersons: Users, mobile: Smartphone, lookingAway: Eye };
const iconTile = "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300";
const quiet = "text-[13px] leading-5 text-slate-500 dark:text-zinc-400";

export function Section({ title, tag = null, aside = null, children, className = "", ...rest }) {
  const id = useId();
  return <section aria-labelledby={id} className={`${glass} p-4 sm:p-5 ${className}`} {...rest}>
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-zinc-100">{title}{tag}</h2>
      {aside}
    </div>
    <div className="mt-3">{children}</div>
  </section>;
}

export const Tag = ({ tone = "slate", children }) => <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${tone === "amber"
  ? "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200/80 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20"
  : tone === "emerald" ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
    : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}>{children}</span>;

/** Phase 1: a one-row summary of the interview, then the resume (the hero) when the interview uses one. */
export function BackgroundPhase({ setup, resume }) {
  const assigned = setup.kind === "assignment";
  const facts = [
    { Icon: Briefcase, value: setup.role, strong: true },
    { Icon: Building2, value: setup.companyName },
    { Icon: Clock3, value: setup.estimatedMinutes ? `~${Math.round(setup.estimatedMinutes)} min` : "" },
    { Icon: MessageSquareText, value: setup.questionCount ? `${setup.questionCount} questions` : "" },
  ].filter((fact) => fact.value);
  const required = setup.resume.mode === "required";
  const withResume = setup.resume.mode !== "none";
  return <div className="space-y-4">
    <div data-interview-summary="" className={`${glass} px-4 py-3 sm:px-5`}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600 dark:text-zinc-300">
        {facts.map(({ Icon, value, strong }) => <li key={value} className={`inline-flex min-w-0 items-center gap-1.5 ${strong ? "font-semibold text-slate-900 dark:text-white" : ""}`}><Icon className="h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" /><span className="[overflow-wrap:anywhere]">{value}</span></li>)}
        <li><Tag>{assigned ? "Scheduled" : "Practice"}</Tag></li>
      </ul>
      {assigned && <p data-testid="anvi-assigned-context" className={`mt-1.5 ${quiet}`}>Your institution scheduled this interview{setup.deadline ? ` · Join by ${formatIST(setup.deadline)}` : ""}.</p>}
    </div>
    {withResume
      ? <Section title="Your resume" data-step="resume" className="sm:p-6" tag={!resume.provided && !resume.uploading ? <Tag tone={required ? "amber" : "slate"}>{required ? "Required" : "Optional"}</Tag> : null}>
        <p className={`-mt-1 mb-4 ${quiet}`}>{required ? "ANVI asks about your projects and experience, so this interview needs your resume." : "Add it if you want ANVI to ask about your own projects and experience."}</p>
        <ResumeStep controller={resume} setup={setup.resume} />
      </Section>
      : <Section title="What to expect">
        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {[
            { Icon: Mic, title: "A spoken conversation", text: "ANVI asks each question out loud and listens to your answer." },
            { Icon: MessageSquareText, title: "Follow-up questions", text: "Like a real interviewer, ANVI may ask you to go deeper." },
            { Icon: FileText, title: "A report afterwards", text: "You get feedback on each answer once you finish." },
          ].map(({ Icon, title, text }) => <li key={title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className={iconTile}><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 text-sm"><span className="block font-medium text-slate-900 dark:text-zinc-100">{title}</span><span className={quiet}>{text}</span></span>
          </li>)}
        </ul>
      </Section>}
  </div>;
}

/** The camera preview of camera AI proctoring: mirrored, with a face guide and the Assessment status footer. */
function CameraPanel({ cameraCheck }) {
  const { camera, status, videoRef, start, faceDetected, needsFace, faceModelOut } = cameraCheck;
  const on = camera.state === "on";
  const searching = on && needsFace && !faceDetected && !faceModelOut;
  const faceText = !on ? "Turn on your camera first."
    : faceDetected ? "Face detected ✓"
      : faceModelOut ? "The face check couldn't load here. Your camera works, so you can continue."
        : status.faceModel === "loading" || status.faceModel === "unknown" ? "Starting the face check…"
          : `${getProctoringStatusText("face", status.face)}. Sit facing the camera in good light.`;
  const corner = `absolute h-5 w-5 border-2 transition-colors duration-500 ${faceDetected ? "border-emerald-400" : "border-white/60"}`;
  return <div className={`${glass} overflow-hidden`} data-camera-step="">
    {/* The live camera image is the content here, so its frame stays dark in both themes. */}
    <div data-camera-preview="" className="relative aspect-video bg-slate-900">
      <video ref={videoRef} muted playsInline autoPlay aria-label="Your camera preview" className={`h-full w-full -scale-x-100 object-cover ${on ? "" : "invisible"}`} />
      {on && <div aria-hidden="true" className="pointer-events-none absolute inset-y-[14%] left-1/2 w-[34%] -translate-x-1/2">
        <span className={`${corner} left-0 top-0 rounded-tl-lg border-b-0 border-r-0`} />
        <span className={`${corner} right-0 top-0 rounded-tr-lg border-b-0 border-l-0`} />
        <span className={`${corner} bottom-0 left-0 rounded-bl-lg border-r-0 border-t-0`} />
        <span className={`${corner} bottom-0 right-0 rounded-br-lg border-l-0 border-t-0`} />
      </div>}
      {on && (faceDetected || searching) && <span aria-hidden="true" className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur ${faceDetected ? "anvi-pop bg-emerald-600/90" : "bg-slate-950/60"}`}>
        {faceDetected ? <AnimatedCheck className="h-3.5 w-3.5" tone="white" /> : <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />}{faceDetected ? "Face detected" : "Looking for your face"}
      </span>}
      {!on && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-sm text-slate-200">
        <Camera className="h-7 w-7 text-slate-400" aria-hidden="true" />
        {camera.state === "error" ? camera.error : camera.state === "requesting" ? "Waiting for camera permission…" : "Your camera is off."}
      </div>}
      {on && <div className="absolute inset-x-2 bottom-2 flex justify-center"><ProctoringFooter status={status} enabled compact /></div>}
    </div>
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      {faceDetected && needsFace ? <AnimatedCheck className="h-6 w-6" /> : <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${camera.state === "error" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400"}`}>{camera.state === "error" ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> : <ScanFace className="h-3.5 w-3.5" aria-hidden="true" />}</span>}
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-medium text-slate-900 dark:text-white">Camera</span>
        <span data-face-check={faceDetected ? "ok" : "pending"} className={`block text-xs ${faceDetected ? "font-medium text-emerald-700 dark:text-emerald-300" : "text-slate-500 dark:text-zinc-400"}`}>{needsFace ? faceText : on ? "Camera on ✓" : "Turn on your camera."}</span>
      </span>
      {!on && <button type="button" onClick={() => void start()} disabled={camera.state === "requesting"}
        className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg bg-violet-600 px-3 text-[13px] font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:bg-violet-500 dark:hover:bg-violet-400 dark:disabled:bg-white/10 dark:disabled:text-zinc-500 ${focus}`}>
        {camera.state === "requesting" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
        {camera.state === "error" ? "Try again" : "Turn on camera"}
      </button>}
    </div>
  </div>;
}

/** Phase 2: the camera/mic preview on the left, the checklist on the right. */
export function SystemPhase({ setup, support, micCheck, cameraCheck, studentName, fullscreenSupported }) {
  const { check, online } = micCheck;
  const cameraOn = cameraCheck?.enabled;
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
    <div className="space-y-4">
      {cameraOn && <CameraPanel cameraCheck={cameraCheck} />}
      <MicPanel micCheck={micCheck} support={support} studentName={studentName} compact={cameraOn} />
      <p aria-live="polite" className="sr-only">{check.detail}</p>
    </div>
    <Section title="Checklist" className="lg:self-start">
      <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        <CheckRow data-check="browser" state={support.ok ? "ok" : "bad"} title="Browser" detail={support.ok ? "Live audio is supported here." : support.reason} />
        <CheckRow data-check="mic" state={check.state} title="Microphone" detail={check.detail} />
        <CheckRow data-check="network" state={online ? "ok" : "bad"} title={<span className="inline-flex items-center gap-1.5">Connection{!online && <Wifi className="h-3.5 w-3.5" aria-hidden="true" />}</span>} detail={online ? "You're online." : "You appear to be offline. Reconnect to continue."} />
        {cameraOn && <CheckRow data-check="camera" state={cameraCheck.camera.state === "error" ? "bad" : cameraCheck.camera.state === "requesting" ? "busy" : cameraCheck.ready ? "ok" : cameraCheck.camera.state === "on" ? "busy" : "idle"} title="Camera"
          detail={cameraCheck.camera.state === "error" ? cameraCheck.camera.error : cameraCheck.faceDetected ? "Face detected ✓" : cameraCheck.ready ? "Camera on." : cameraCheck.camera.state === "on" ? "Looking for your face…" : "Needed for this interview's camera checks."} />}
        {setup.proctoring.fullscreen === "required" && <CheckRow data-check="fullscreen" state={fullscreenSupported ? "ok" : "bad"} title="Fullscreen" detail={fullscreenSupported ? "Supported. Opens when you join." : "This browser can't go fullscreen, which this interview needs."} />}
      </ul>
      <p className={`mt-4 flex items-start gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06] ${quiet}`}>
        <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />Use headphones in a quiet spot, so ANVI's voice stays out of your microphone.
      </p>
      {cameraOn && <p className={`mt-2 flex items-start gap-2 ${quiet}`}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />{CAMERA_PRIVACY}</p>}
    </Section>
  </div>;
}

/** Phase 3 (only when proctoring is on): each rule as a row, the camera checks and the acknowledgement. */
export function ProctoringPhase({ setup, assigned, acknowledged, onAcknowledge, fullscreenSupported, disabled }) {
  const rules = proctoringRulesOf(setup.proctoring);
  const aiChecks = aiChecksOf(setup.proctoring);
  const id = useId();
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
    <Section title={assigned ? "Your institution turned on proctoring" : "This interview is proctored"}>
      <p className={`-mt-1 ${quiet}`}>{aiChecks.length ? "Your browser activity and your camera are checked during the interview." : "Your browser activity is monitored during the interview. There is no camera."}</p>
      <ul className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2" data-proctoring-rules="">
        {rules.map(({ id: ruleId, title, text }) => {
          const Icon = RULE_ICONS[ruleId] || Eye;
          return <li key={ruleId} data-rule={ruleId} className="flex gap-3">
            <span className={iconTile}><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 text-sm"><span className="block font-medium text-slate-900 dark:text-zinc-100">{title}</span><span className={`mt-0.5 block ${quiet}`}>{text}</span></span>
          </li>;
        })}
      </ul>
    </Section>
    <div className="space-y-4">
      {aiChecks.length > 0 && <Section title="Camera checks" data-ai-checks="">
        <ul className="space-y-2">
          {aiChecks.map(({ id: checkId, text }) => {
            const Icon = AI_ICONS[checkId] || Eye;
            return <li key={checkId} data-ai-check={checkId} className="flex items-start gap-2.5 text-[13px] leading-5 text-slate-600 dark:text-zinc-300"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />{text}</li>;
          })}
        </ul>
        <p data-camera-privacy="" className={`mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06] ${quiet}`}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />{CAMERA_PRIVACY}</p>
      </Section>}
      <div className="space-y-2 px-1">
        {setup.proctoring.fullscreen === "required" && <p data-fullscreen-check={fullscreenSupported ? "ok" : "unsupported"} className={`flex items-start gap-2 text-[13px] leading-5 ${fullscreenSupported ? "text-slate-600 dark:text-zinc-300" : "font-medium text-amber-700 dark:text-amber-300"}`}>
          <Monitor className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
          {fullscreenSupported ? "Your browser supports fullscreen. You'll enter it only when you press Join on the last step." : "This browser can't go fullscreen, which this interview needs. Use Chrome, Edge or Firefox on a computer."}
        </p>}
        <p className={`flex items-start gap-2 ${quiet}`}><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />Recorded events appear in your report. They never lower your score automatically.</p>
      </div>
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm transition-colors hover:border-slate-300 has-[:checked]:border-violet-500 has-[:checked]:bg-violet-50/50 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:has-[:checked]:border-violet-400 dark:has-[:checked]:bg-violet-500/[0.07]">
        <input id={id} type="checkbox" checked={acknowledged} disabled={disabled} onChange={(event) => onAcknowledge(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800" />
        <span className="font-medium text-slate-800 dark:text-zinc-100">I understand these proctoring rules and agree to follow them.</span>
      </label>
    </div>
  </div>;
}

const RULES = [
  { Icon: Languages, title: "Answer in English", text: "The interview and your responses stay in English.", language: true },
  { Icon: PauseCircle, title: "Speak naturally", text: "Pause briefly when you finish; ANVI continues automatically." },
  { Icon: Repeat2, title: "Use voice shortcuts", text: "Say “repeat” to hear it again or “skip” to move on." },
  { Icon: LogOut, title: "Finish safely", text: "Use End interview when done and avoid sharing personal contact details." },
];

/** Final phase: concise ground rules, completed setup, terms and consent on one join-ready screen. */
export function InstructionsPhase({ setup, termsAccepted, onTerms, consent, onConsent, disabled, readyItems = [], onEdit, notices = null }) {
  const termsShown = Boolean(setup.terms.text || setup.terms.required);
  return <div className="space-y-4">
    <div data-ready-card="" className={`${glass} flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-lg shadow-violet-600/15 dark:from-violet-500 dark:to-fuchsia-400"><Mic className="h-5 w-5" aria-hidden="true" /></span>
        <span className="min-w-0"><span className="block text-[15px] font-semibold text-slate-950 dark:text-white">ANVI is ready when you are</span><span className={quiet}>Confirm the final checkbox, then join the conversation.</span></span>
      </div>
      <ul className="flex flex-wrap gap-2 text-[11px] font-medium text-slate-600 dark:text-zinc-300" aria-label="Interview essentials">
        <li className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/[0.06]">English</li>
        <li className="rounded-full bg-slate-100 px-2.5 py-1 dark:bg-white/[0.06]">Live voice</li>
        <li className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Audio not saved</li>
      </ul>
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,.92fr)]">
      <Section title="Conversation essentials" className="lg:self-start" tag={<Tag>English only</Tag>}>
        <ul className="grid gap-2.5 sm:grid-cols-2" data-ground-rules="">
          {RULES.map(({ Icon, title, text, language }) => <li key={title} className="flex min-h-[86px] items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 dark:border-white/[0.06] dark:bg-white/[0.025]">
            <span className={language ? "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300" : iconTile}><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="min-w-0 text-sm"><span className="block font-medium text-slate-900 dark:text-zinc-100">{title}</span><span {...(language ? { "data-language-note": "" } : {})} className={`mt-0.5 block ${quiet}`}>{text}</span></span>
          </li>)}
        </ul>
        <p className={`mt-3 flex items-start gap-2 border-t border-slate-100 pt-3 dark:border-white/[0.06] ${quiet}`}><UserRoundX className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />Keep answers professional and do not share phone numbers, addresses, or other private details.</p>
      </Section>

      <Section title="Final confirmation" className="lg:self-start" tag={<Tag tone="emerald">Setup checked</Tag>} data-final-confirmation="">
        <ReadySummary items={readyItems} onEdit={onEdit} disabled={disabled} compact />
        {termsShown && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/[0.06]" data-step="terms">
          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-[13px] font-semibold text-slate-900 dark:text-zinc-100">Interview terms</h3>{setup.terms.required && <Tag tone={termsAccepted ? "emerald" : "amber"}>{termsAccepted ? "Accepted" : "Required"}</Tag>}</div>
          <TermsStep terms={setup.terms} accepted={termsAccepted} onAccept={onTerms} disabled={disabled} />
        </div>}
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
          <ConsentBox checked={consent} onChange={onConsent} disabled={disabled} />
        </div>
        {notices && <div className="mt-3 space-y-2.5 empty:hidden">{notices}</div>}
      </Section>
    </div>
  </div>;
}

const STATUS_ICON = {
  ok: <AnimatedCheck className="h-5 w-5" />,
  busy: <Loader2 className="h-5 w-5 animate-spin text-violet-600 motion-reduce:animate-none dark:text-violet-300" aria-hidden="true" />,
  bad: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />,
  idle: <Circle className="h-5 w-5 text-slate-300 dark:text-zinc-600" aria-hidden="true" />,
};

/** Phase 5: the checklist of every phase, each with Edit. The Join button sits in the footer (in the flow). */
export function ReadySummary({ items, onEdit, disabled, compact = false }) {
  return <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]" aria-label="Summary" data-ready-summary="">
    {items.map(({ id, state, detail }) => <li key={id} data-summary={id} data-summary-state={state} className={`flex items-center gap-3 first:pt-0 last:pb-0 ${compact ? "py-2" : "py-3"}`}>
      {STATUS_ICON[state] || STATUS_ICON.idle}
      <span className="min-w-0 flex-1 text-sm"><span className="block font-medium text-slate-900 dark:text-zinc-100">{PHASES[id].title}</span><span className={`block ${quiet}`}>{detail}</span></span>
      {onEdit && <button type="button" onClick={() => onEdit(id)} disabled={disabled} className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100 ${focus}`}>Edit<span className="sr-only"> {PHASES[id].title}</span></button>}
    </li>)}
  </ul>;
}
