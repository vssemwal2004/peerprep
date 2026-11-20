import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Compass, MapPin, Search, X, Zap } from "lucide-react";
import { usePlatformGuide } from "./context";
import { guideIcon } from "./icons";
import { AREAS, openPath } from "./registry";
import { minutesFor, tourLengths } from "./buildPageGuide";

function ProgressRing({ value, total }) {
  const share = total ? value / total : 0;
  const radius = 22;
  const length = 2 * Math.PI * radius;
  return (
    <div className="relative h-14 w-14 shrink-0" role="img" aria-label={`${value} of ${total} pages explored`}>
      <svg viewBox="0 0 56 56" className="h-14 w-14 -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-white/10" />
        <circle cx="28" cy="28" r={radius} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-sky-500 transition-[stroke-dashoffset] duration-500"
          strokeDasharray={length} strokeDashoffset={length * (1 - share)} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-bold tabular-nums text-slate-900 dark:text-white">{Math.round(share * 100)}%</span>
    </div>
  );
}

function ModuleRow({ module, current, explored, parent, onTour, onOpen }) {
  const Icon = guideIcon(module.icon);
  const path = openPath(module);
  const steps = tourLengths(module).full;
  return (
    <li className={`group flex items-start gap-3 rounded-xl border px-3 py-2.5 transition ${current ? "border-sky-300 bg-sky-50/60 dark:border-sky-800 dark:bg-sky-950/30" : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-gray-700 dark:hover:bg-white/[0.03]"}`}>
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${explored ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-slate-300"}`}>
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-bold text-slate-900 dark:text-white">
          {module.title}
          {current && <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-600 px-1.5 py-px text-[10px] font-bold text-white"><MapPin className="h-2.5 w-2.5" />You are here</span>}
          {explored && <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-px text-[10px] font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><Check className="h-3 w-3" />Explored</span>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{module.summary}</p>
        {!module.delegate && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{steps} steps · about {minutesFor(steps)} min</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 self-center">
        {current || path ? (
          <button type="button" onClick={() => onTour(module)}
            className="inline-flex h-8 items-center gap-1 rounded-lg bg-white px-2.5 text-[12px] font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-600 hover:text-white hover:ring-sky-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:bg-gray-900 dark:text-sky-300 dark:ring-sky-800 dark:hover:bg-sky-600 dark:hover:text-white">
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />Tour
          </button>
        ) : parent && openPath(parent) ? (
          <button type="button" onClick={() => onOpen(parent)} title={`Opens from ${parent.title}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200">
            From {parent.title}<ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Guides: every page the person can use, grouped like the menu, with what each is for, its tour
 * (opens the page and starts), what they explored so far, and the "new here?" tips switch.
 */
export default function GuideCenter({ onClose }) {
  const guide = usePlatformGuide();
  const navigate = useNavigate();
  const titleId = useId();
  const searchRef = useRef(null);
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(false);
  useEffect(() => { const frame = requestAnimationFrame(() => setShown(true)); searchRef.current?.focus({ preventScroll: true }); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const currentId = guide.current?.id;
  const listed = useMemo(() => guide.modules.filter((module) => !module.hidden || module.id === currentId), [currentId, guide.modules]);
  const explored = listed.filter((module) => guide.isExplored(module.id)).length;
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const match = (module) => !needle || `${module.title} ${module.summary} ${module.area} ${(module.terms || []).map((entry) => entry.term).join(" ")}`.toLowerCase().includes(needle);
    return (AREAS[guide.role] || []).map((area) => ({ area, modules: listed.filter((module) => module.area === area && match(module)) })).filter((group) => group.modules.length);
  }, [guide.role, listed, query]);
  const next = listed.find((module) => !guide.isExplored(module.id) && module.id !== guide.current?.id && openPath(module));

  return createPortal(
    <div className="fixed inset-0 z-[8700]" role="presentation">
      <div className={`absolute inset-0 bg-slate-950/40 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`} onClick={onClose} aria-hidden="true" />
      <section role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`absolute inset-y-0 right-0 flex w-full max-w-[26rem] flex-col border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none dark:border-gray-800 dark:bg-gray-950 ${shown ? "translate-x-0" : "translate-x-full"}`}>
        <header className="border-b border-slate-100 bg-gradient-to-br from-sky-50 via-white to-indigo-50/60 px-5 pb-4 pt-5 dark:border-gray-800 dark:from-sky-950/40 dark:via-gray-950 dark:to-indigo-950/30">
          <div className="flex items-start gap-3">
            <ProgressRing value={explored} total={listed.length} />
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[17px] font-bold text-slate-950 dark:text-white">Guides</h2>
              <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">Step-by-step tours of every page. You explored <b className="tabular-nums text-slate-900 dark:text-white">{explored}</b> of <span className="tabular-nums">{listed.length}</span>.</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close guides" className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"><X className="h-5 w-5" /></button>
          </div>
          {guide.current && (
            <div className="mt-4 rounded-xl border border-sky-200 bg-white p-3 shadow-sm dark:border-sky-900 dark:bg-gray-900">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-sky-700 dark:text-sky-300">This page · {guide.current.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[12px] text-slate-600 dark:text-slate-300">{guide.current.summary}</p>
              <div className="mt-2 flex gap-2">
                {!guide.current.delegate && (
                  <button type="button" onClick={() => guide.startModule(guide.current.id, { mode: "quick" })}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-600 text-[12px] font-bold text-white hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"><Zap className="h-3.5 w-3.5" />Quick look</button>
                )}
                <button type="button" onClick={() => guide.startModule(guide.current.id, { mode: "full" })}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 text-[12px] font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-white/[0.05]"><Compass className="h-3.5 w-3.5" />{guide.current.delegate ? "Page tour" : "Full tour"}</button>
              </div>
            </div>
          )}
          {!guide.current && next && (
            <button type="button" onClick={() => guide.startModule(next.id, { mode: "quick" })}
              className="mt-4 flex w-full items-center gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-left text-[12.5px] font-semibold text-slate-700 shadow-sm hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-sky-900 dark:bg-gray-900 dark:text-slate-200">
              <Compass className="h-4 w-4 text-sky-600" aria-hidden="true" /><span className="flex-1">Suggested next: <b>{next.title}</b></span><ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </button>
          )}
          <label className="relative mt-3 block">
            <span className="sr-only">Search guides</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages, features, words…"
              className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white" />
          </label>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
          {groups.length === 0 && <p className="px-3 py-10 text-center text-[13px] text-slate-500">No guide matches “{query}”.</p>}
          {groups.map((group) => (
            <section key={group.area} className="mb-3">
              <h3 className="flex items-center gap-2 px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                {group.area}
                <span className="tabular-nums font-semibold normal-case tracking-normal">{group.modules.filter((module) => guide.isExplored(module.id)).length}/{group.modules.length}</span>
              </h3>
              <ul className="space-y-1">
                {group.modules.map((module) => (
                  <ModuleRow key={module.id} module={module} current={guide.current?.id === module.id} explored={guide.isExplored(module.id)}
                    parent={module.openFrom ? guide.modules.find((entry) => entry.id === module.openFrom) : null}
                    onTour={(entry) => guide.startModule(entry.id, { mode: "full" })}
                    onOpen={(entry) => { onClose(); navigate(openPath(entry)); }} />
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer className="flex items-center gap-3 border-t border-slate-100 px-5 py-3 dark:border-gray-800">
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">“New here?” tips</p>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-400">A small offer to tour a page the first time you open it.</p>
          </div>
          <button type="button" role="switch" aria-checked={!guide.progress.nudgesOff} aria-label="Show “New here?” tips" onClick={() => guide.setNudgesOff(!guide.progress.nudgesOff)}
            className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-950">
            <span className={`relative block h-6 w-11 rounded-full transition-colors ${guide.progress.nudgesOff ? "bg-slate-300 dark:bg-gray-700" : "bg-sky-500"}`} aria-hidden="true">
              <span className={`absolute left-0 top-1 block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${guide.progress.nudgesOff ? "translate-x-1" : "translate-x-6"}`} />
            </span>
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
