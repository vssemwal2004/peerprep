import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { resumeSetupOf } from "./anviStartSetup";
import { assignmentIdOf } from "./anviSchedule";
import ResumeStep from "./ResumeStep";
import useResumeUpload from "./prestart/useResumeUpload";
import { btn, focus, noOutline } from "./list/styles";

/**
 * Add, replace or remove the resume of a scheduled interview from its Upcoming card (the same step as in
 * booking and in the lobby). `onClose(changed)`: `changed` is true when the stored resume changed.
 */
export default function ResumeSheet({ item, onClose }) {
  const setup = resumeSetupOf(item);
  const [status, setStatus] = useState({ provided: setup.provided, source: setup.source });
  const changedRef = useRef(false);
  const titleRef = useRef(null);
  const onChange = (next) => {
    if (next.provided !== status.provided || next.source !== status.source) changedRef.current = true;
    setStatus(next);
  };
  const resume = useResumeUpload({ target: { kind: "assignment", id: assignmentIdOf(item) }, setup, onChange });
  // An upload still running finishes in the background; the list reloads so it can catch up.
  const close = () => onClose?.(changedRef.current || resume.uploading);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; });

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    const opener = document.activeElement;
    titleRef.current?.focus({ preventScroll: true });
    return () => { if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus(); };
  }, []);

  const required = setup.mode === "required";

  const sheet = <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/55 backdrop-blur-[2px] sm:items-center sm:p-6" role="presentation" onClick={close}>
    <div role="dialog" aria-modal="true" aria-labelledby="anvi-resume-title" data-resume-sheet=""
      className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] dark:border-white/10 dark:bg-[#242424] sm:rounded-2xl"
      onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 pb-4 pt-5 dark:border-white/[0.07] sm:px-6">
        <div className="min-w-0">
          <h2 id="anvi-resume-title" ref={titleRef} tabIndex={-1} className={`text-lg font-semibold tracking-tight text-slate-950 dark:text-white ${noOutline}`}>Your resume</h2>
          <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-zinc-400">{item?.title}</p>
        </div>
        <button type="button" onClick={close} aria-label="Close" className={`-mr-1.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-200 ${focus}`}><X className="h-5 w-5" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        <p className="mb-4 text-sm text-slate-600 dark:text-zinc-300">
          {required ? "This interview needs your resume: ANVI asks about your projects and experience. Add it before you join." : "Optional. Add it if you want ANVI to ask about your own projects and experience."}
        </p>
        <ResumeStep controller={resume} setup={setup} />
      </div>
      <div className="flex justify-end border-t border-slate-100 bg-slate-50/80 px-5 py-4 dark:border-white/[0.07] dark:bg-white/[0.02] sm:px-6">
        <button type="button" onClick={close} className={`${btn.primary} h-10`}>Done</button>
      </div>
    </div>
  </div>;
  return typeof document !== "undefined" && document.body ? createPortal(sheet, document.body) : sheet;
}
