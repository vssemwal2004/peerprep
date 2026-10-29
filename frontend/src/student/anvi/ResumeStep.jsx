import { useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ExternalLink, FileText, Loader2, NotebookPen, RefreshCw, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { RESUME_BUILDER_ROUTE, RESUME_PRIVACY_NOTE, resumeFileProblem, resumeSourceLabel } from "./anviStartSetup";
import useResumeUpload from "./prestart/useResumeUpload";
import { AiMotionStyles, AnimatedCheck } from "./prestart/motion";
import { resumeHighlightsOf } from "./prestart/resumeHighlights";
import { focus } from "./list/styles";

const SOURCE_TEXT = {
  builder: { title: "Use Resume Builder resume", body: "The resume you made in PeerPrep.", Icon: NotebookPen },
  upload: { title: "Upload a file", body: "A PDF or TXT from your device.", Icon: UploadCloud },
};

const formatDay = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "";
};
const formatSize = (bytes) => (!bytes ? "" : bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

const smallButton = `inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${focus}`;
const primaryButton = `${smallButton} bg-violet-600 text-white hover:bg-violet-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100 dark:bg-violet-500 dark:hover:bg-violet-400 dark:disabled:bg-white/[0.06] dark:disabled:text-zinc-500`;
const quietButton = `${smallButton} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-200 dark:hover:bg-white/[0.07]`;
const fileCard = "rounded-xl border border-slate-200 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.02]";
const fileIcon = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600 ring-1 ring-inset ring-violet-100 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20";

/** The small status chip of a resume: "Uploading…" while the request runs, "Resume added ✓" once stored. */
export function ResumeChip({ controller, className = "" }) {
  if (controller.uploading) {
    const percent = controller.busy === "upload" && controller.progress > 0 && controller.progress < 1 ? ` ${Math.round(controller.progress * 100)}%` : "";
    return <span data-resume-chip="uploading" className={`inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-200/80 dark:bg-violet-500/10 dark:text-violet-200 dark:ring-violet-400/25 ${className}`}>
      <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />{controller.busy === "builder" ? "Adding…" : `Uploading…${percent}`}
    </span>;
  }
  if (controller.provided) {
    return <span data-resume-chip="added" className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/25 ${className}`}>
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Resume added ✓
    </span>;
  }
  return null;
}

/**
 * The resume step of a start, a booking or the resume sheet: the sources the interview allows as two
 * option cards (Resume Builder with an explicit permission tick, or a PDF/TXT drop zone), then the stored
 * file as one row with Replace / Remove. While a file uploads, "ANVI is reading your resume…" shows a slim
 * progress bar, but it never holds the student: Continue stays open and the upload finishes in the
 * background. Once it resolves, "Ready" and the skills (or sections) found in the preview fade in.
 *
 * Pass `controller` (useResumeUpload) when the upload must outlive this step (the pre-start phases, the
 * booking sheet); otherwise the step keeps its own. `target`: { kind, id }. `onChange({ provided, source })`.
 */
export default function ResumeStep({ controller, ...props }) {
  return controller ? <ResumeStepView controller={controller} setup={props.setup} /> : <OwnResumeStep {...props} />;
}

function OwnResumeStep({ target, setup, onChange }) {
  const controller = useResumeUpload({ target, setup, onChange });
  return <ResumeStepView controller={controller} setup={setup} />;
}

function ResumeStepView({ controller, setup }) {
  const sources = setup?.sources?.length ? setup.sources : ["builder", "upload"];
  const single = sources.length === 1;
  const [replacing, setReplacing] = useState(false);
  const [choice, setChoice] = useState(single ? sources[0] : "");
  const [permission, setPermission] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const ids = useId();
  const { stored, busy, uploading, error } = controller;
  const locked = Boolean(busy);

  const start = () => { setReplacing(false); setPermission(false); setChoice(single ? sources[0] : ""); };
  const pick = (file) => {
    if (!file || locked) return;
    void controller.upload(file);
    // A file refused before upload keeps the chooser open with the reason.
    if (!resumeFileProblem(file)) start();
  };
  const onFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    pick(file);
  };
  const dropProps = {
    onDragOver: (event) => { event.preventDefault(); if (!locked) { setDragging(true); setChoice("upload"); } },
    onDragLeave: () => setDragging(false),
    onDrop: (event) => { event.preventDefault(); setDragging(false); pick(event.dataTransfer?.files?.[0]); },
  };

  const errorNote = error && <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-200">
    <p className="flex items-start gap-1.5"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{error.message}
      {error.builderLink && <> <a href={RESUME_BUILDER_ROUTE} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">Open Resume Builder<ExternalLink className="h-3 w-3" aria-hidden="true" /></a></>}
    </span></p>
    {controller.canRetry && <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={() => void controller.retry()} className={quietButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Try again</button>
    </div>}
  </div>;
  const privacy = <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-slate-500 dark:text-zinc-400"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-zinc-500" aria-hidden="true" />{RESUME_PRIVACY_NOTE}</p>;

  // In flight: ANVI "reads" the resume, but the student never has to wait here (Continue stays open).
  if (uploading) {
    const sending = busy === "upload" && controller.progress > 0 && controller.progress < 1;
    const percent = Math.round(controller.progress * 100);
    const builder = busy === "builder";
    return <div data-resume-state="uploading">
      <AiMotionStyles />
      <div className={fileCard}>
        <div className="flex items-center gap-3">
          <span className={fileIcon}><FileText className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900 dark:text-zinc-100">{builder ? "Resume Builder resume" : controller.fileName || "Your resume"}</p>
            <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{[builder ? "" : formatSize(controller.fileSize), builder ? "From Resume Builder" : "Uploaded file"].filter(Boolean).join(" · ")}</p>
          </div>
          {sending && <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500 dark:text-zinc-400">{percent}%</span>}
        </div>
        <div role="progressbar" aria-label="Resume progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={sending ? percent : undefined}
          className="relative mt-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.08]">
          {sending
            ? <span className="absolute inset-y-0 left-0 rounded-full bg-violet-600 transition-[width] duration-300 dark:bg-violet-400" style={{ width: `${Math.max(4, percent)}%` }} />
            : <span className="anvi-indeterminate absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-violet-500 to-transparent dark:via-violet-300" />}
        </div>
        <p aria-live="polite" className="mt-2.5 flex items-center gap-2 text-[13px] font-medium text-violet-700 dark:text-violet-300">
          <span aria-hidden="true" className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping rounded-full bg-violet-400 opacity-60 motion-reduce:hidden" /><span className="relative h-1.5 w-1.5 rounded-full bg-violet-500" /></span>
          {builder ? "ANVI is reading your Resume Builder resume…" : "ANVI is reading your resume…"}
        </p>
        <p className="mt-0.5 pl-3.5 text-xs text-slate-500 dark:text-zinc-400">You can continue. This finishes in the background.</p>
      </div>
      {privacy}
    </div>;
  }

  if (stored && !replacing) {
    const day = formatDay(stored.createdAt);
    const { skills, sections } = resumeHighlightsOf(stored.preview, { maxSkills: 6, maxSections: 4 });
    const fromUpload = stored.source !== "builder";
    const name = !fromUpload ? "Resume Builder resume" : controller.fileName || "Uploaded resume";
    const meta = [fromUpload && controller.fileName ? formatSize(controller.fileSize) : "", `Using ${resumeSourceLabel(stored.source)}`, day ? `added ${day}` : ""].filter(Boolean).join(" · ");
    const chips = skills.length ? skills : sections;
    return <div data-resume-state="provided">
      <AiMotionStyles />
      <div className={fileCard}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={fileIcon}><FileText className="h-[18px] w-[18px]" aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900 dark:text-zinc-100">
              <span className="truncate">{name}</span>
              <span aria-live="polite" data-resume-chip="added" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 py-0.5 pl-0.5 pr-2 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200/80 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"><AnimatedCheck className="h-3.5 w-3.5" />Ready</span>
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{meta}.</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => { controller.clearError(); setReplacing(true); }} disabled={locked} className={quietButton}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Replace</button>
            <button type="button" onClick={() => void controller.remove()} disabled={locked} className={`${quietButton} text-rose-600 dark:text-rose-300`}>
              {busy === "remove" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}Remove
            </button>
          </div>
        </div>
        {(chips.length > 0 || stored.preview) && <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
          {chips.length > 0 && <div data-resume-highlights="">
            <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">{skills.length ? "Skills ANVI picked up" : "Sections ANVI found"}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={skills.length ? "Skills ANVI picked up" : "Sections ANVI found"}>
              {chips.map((label, index) => <li key={label} data-highlight={skills.length ? "skill" : "section"} style={{ animationDelay: `${120 + index * 60}ms` }}
                className="anvi-fade-up rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-white/[0.06] dark:text-zinc-200">{label}</li>)}
            </ul>
          </div>}
          {stored.preview && <details className={`group ${chips.length ? "mt-2.5" : ""}`}>
            <summary className={`inline-flex cursor-pointer list-none items-center gap-1 rounded-md text-xs font-semibold text-violet-700 hover:underline dark:text-violet-300 [&::-webkit-details-marker]:hidden ${focus}`}>
              View what ANVI will use<ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
            </summary>
            <blockquote className="mt-2 max-h-28 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 dark:bg-white/[0.03] dark:text-zinc-300" aria-label="Resume preview">
              <span className="whitespace-pre-line">{stored.preview}</span>
            </blockquote>
          </details>}
        </div>}
      </div>
      {errorNote}
      {privacy}
    </div>;
  }

  return <div data-resume-state="choose">
    <div role={single ? undefined : "radiogroup"} aria-label={single ? undefined : "How to add your resume"} className={`grid grid-cols-1 items-start gap-3 ${single ? "" : "sm:grid-cols-2"}`}>
      {sources.map((source) => {
        const { title, body, Icon } = SOURCE_TEXT[source];
        const open = choice === source;
        return <div key={source} data-resume-source={source} {...(source === "upload" ? dropProps : {})}
          className={`rounded-xl border transition-colors ${open ? "border-violet-500 bg-violet-50/50 ring-1 ring-violet-500 dark:border-violet-400 dark:bg-violet-500/[0.07] dark:ring-violet-400" : "border-slate-200 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20"}`}>
          <button type="button" role={single ? undefined : "radio"} aria-checked={single ? undefined : open} disabled={single || locked}
            onClick={() => { controller.clearError(); setChoice(source); }}
            className={`flex w-full items-start gap-3 rounded-xl p-3.5 text-left disabled:cursor-default ${focus}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${open ? "bg-violet-600 text-white dark:bg-violet-500" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300"}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">{title}</span>
              <span className="block text-[13px] text-slate-500 dark:text-zinc-400">{body}</span>
            </span>
            {!single && (open ? <AnimatedCheck className="mt-0.5 h-5 w-5" tone="primary" /> : <span aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 rounded-full border border-slate-300 dark:border-zinc-600" />)}
          </button>
          {open && source === "builder" && <div className="anvi-fade-up px-3.5 pb-3.5">
            <label htmlFor={`${ids}-permission`} className="flex cursor-pointer items-start gap-2.5 text-[13px] text-slate-700 dark:text-zinc-200">
              <input id={`${ids}-permission`} type="checkbox" checked={permission} onChange={(event) => setPermission(event.target.checked)} disabled={locked}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-600 dark:bg-zinc-800" />
              <span>I allow ANVI to read my Resume Builder resume for this interview.</span>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { if (permission && !locked) { void controller.saveBuilder(); start(); } }} disabled={!permission || locked} className={primaryButton}>Use this resume</button>
              <a href={RESUME_BUILDER_ROUTE} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] font-semibold text-violet-700 hover:underline dark:text-violet-300 ${focus}`}>Open Resume Builder<ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
            </div>
          </div>}
          {open && source === "upload" && <div className="anvi-fade-up px-3.5 pb-3.5">
            <div data-resume-dropzone=""
              className={`flex flex-col items-center rounded-lg border border-dashed px-4 py-4 text-center transition-colors ${dragging ? "border-violet-500 bg-violet-100/60 dark:bg-violet-500/15" : "border-slate-300 bg-white dark:border-white/15 dark:bg-white/[0.02]"}`}>
              <p className="text-[13px] text-slate-600 dark:text-zinc-300">
                Drag &amp; drop or <button type="button" onClick={() => fileRef.current?.click()} disabled={locked} className={`rounded font-semibold text-violet-700 underline-offset-2 hover:underline dark:text-violet-300 ${focus}`}>browse</button>
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">PDF/TXT · up to 5 MB</p>
              <input ref={fileRef} type="file" accept=".pdf,.txt,application/pdf,text/plain" onChange={onFile} className="sr-only" tabIndex={-1} aria-label="Upload resume file" />
            </div>
          </div>}
        </div>;
      })}
    </div>
    {replacing && <button type="button" onClick={() => { setReplacing(false); controller.clearError(); }} disabled={locked} className={`${quietButton} mt-3`}>Keep current resume</button>}
    {errorNote}
    {privacy}
  </div>;
}
