import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import { IntegritySection, SetupSection } from "./ReportSections";
import { focusRing, muted, reportFont } from "./styles";

/**
 * "Proctoring details": the integrity record (admins: rules, every event with its time, pauses and camera
 * detections; students: their counts) and the interview setup, in a side sheet over the report.
 */
export function ProctoringDrawer({ model, open, onClose }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;
    if (open && !dialog.open) {
      try { dialog.showModal(); } catch { dialog.setAttribute("open", ""); }
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    return undefined;
  }, [open]);
  if (!model.integrity) return null;
  return <dialog ref={ref} aria-labelledby={titleId} data-proctoring-drawer
    onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }}
    onClick={(event) => { if (event.target === ref.current) onClose(); }}
    className={`${reportFont} fixed inset-y-0 left-auto right-0 m-0 h-[100dvh] max-h-none w-full max-w-2xl overflow-hidden border-l border-slate-200 bg-slate-50 p-0 text-slate-800 shadow-2xl backdrop:bg-slate-950/40 dark:border-white/10 dark:bg-[#1c1c1c] dark:text-zinc-100`}>
    {open && <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 dark:border-white/10 dark:bg-[#242424]">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-slate-900 dark:text-zinc-50">Proctoring details</h2>
          <p className={`mt-0.5 text-sm ${muted}`}>{model.integrityFull ? "The full integrity record of this attempt." : "What was recorded while you took this interview."}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close proctoring details" data-proctoring-close
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-50 ${focusRing}`}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
        <IntegritySection proctoring={model.integrity} full={model.integrityFull} />
        {(model.setup.length > 0 || model.terms) && <SetupSection model={{ ...model, warmup: "" }} />}
      </div>
    </div>}
  </dialog>;
}
