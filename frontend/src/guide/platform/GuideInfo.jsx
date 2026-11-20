import { useCallback, useEffect, useRef, useState } from "react";
import { Info, PlayCircle } from "lucide-react";
import FloatingPanel from "./FloatingPanel";
import GlossaryText from "../engine/GlossaryText";
import { usePlatformGuide } from "./context";
import { glossaryFor } from "./glossary";

/**
 * The small ⓘ beside a section heading. It explains that part of the page (the matching step of
 * the page's tour, or the given title/body) on hover, focus or tap, with "Show me" to run the
 * tour from that step.
 *   <GuideInfo step="qp-filters" />              text from the current page's guide
 *   <GuideInfo title="Streak" body="…" />        text given here
 */
export default function GuideInfo({ step: stepId, title, body, className = "", label }) {
  const guide = usePlatformGuide();
  const ref = useRef(null);
  const timer = useRef(null);
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const close = useCallback(() => { pinned.current = false; setOpen(false); }, []);
  useEffect(() => () => clearTimeout(timer.current), []);

  const module = guide?.current;
  const step = stepId ? module?.steps?.find((entry) => entry.id === stepId) : null;
  const heading = title || step?.title;
  const text = body || step?.body;
  if (!heading || !text) return null;

  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 140); };
  const hide = () => { clearTimeout(timer.current); if (!pinned.current) timer.current = setTimeout(() => setOpen(false), 160); };
  const canShow = Boolean(step && module && !module.delegate);
  const glossary = glossaryFor(module);

  return (
    <>
      <button ref={ref} type="button" aria-label={label || `What is ${heading}?`} aria-expanded={open}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") show(); }} onPointerLeave={(event) => { if (event.pointerType === "mouse") hide(); }}
        onFocus={show} onBlur={hide}
        onClick={(event) => { event.stopPropagation(); event.preventDefault(); pinned.current = !open; setOpen(!open); }}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-slate-400 transition hover:bg-sky-50 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-500 dark:hover:bg-sky-950/50 dark:hover:text-sky-300 ${open ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" : ""} ${className}`}>
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <FloatingPanel anchor={ref.current} onClose={close} width={292} label={heading}
          onPointerEnter={() => clearTimeout(timer.current)} onPointerLeave={hide}>
          <div className="px-3.5 py-3">
            <p className="text-[13px] font-bold text-slate-900 dark:text-white">{heading}</p>
            <div className="mt-1 space-y-1.5 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
              {String(text).split("\n").filter(Boolean).map((line, at) => <p key={at}><GlossaryText text={line} glossary={glossary} /></p>)}
            </div>
            {canShow && (
              <button type="button" onClick={() => { close(); guide.startModule(module.id, { mode: "full", at: step.id }); }}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-[11.5px] font-bold text-sky-700 hover:bg-sky-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-950">
                <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />Show me in the tour
              </button>
            )}
          </div>
        </FloatingPanel>
      )}
    </>
  );
}
