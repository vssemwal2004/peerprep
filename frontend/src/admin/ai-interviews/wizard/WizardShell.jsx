import { Link } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { STEPS, stepIndex } from "./steps";
import { ToneChip, pageClass } from "../ui";

export function StatusChip({ status }) {
  return (
    <ToneChip data-interview-status tone={status.tone}>
      {status.label}
    </ToneChip>
  );
}

function Stepper({ current, onStep, stepReady, locked }) {
  const active = stepIndex(current);
  return (
    <nav aria-label="Interview setup steps">
      <p className="text-sm font-medium text-slate-700 dark:text-gray-200 sm:hidden">
        Step {active + 1} of {STEPS.length} · {STEPS[active].label}
      </p>
      <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-800 sm:hidden">
        <div className="h-full rounded-full bg-sky-600" style={{ width: `${((active + 1) / STEPS.length) * 100}%` }} />
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {STEPS.map((step, index) => {
          const isCurrent = index === active;
          const done = Boolean(stepReady[step.id]) && !isCurrent;
          const disabled = locked && index > 0;
          return (
            <li key={step.id} data-wizard-step={step.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                aria-disabled={disabled || undefined}
                title={disabled ? "Create the draft first" : undefined}
                onClick={() => !disabled && onStep(step.id)}
                className={`group flex min-w-0 items-center gap-2.5 rounded-lg px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition ${isCurrent ? "bg-sky-600 text-white ring-4 ring-sky-100 dark:ring-sky-400/15" : done ? "bg-emerald-500 text-white dark:bg-emerald-500/90" : "border border-slate-300 bg-white text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"}`}
                >
                  {done ? <Check size={14} strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={`truncate text-sm ${isCurrent ? "font-semibold text-slate-900 dark:text-white" : "font-medium text-slate-600 group-hover:text-slate-900 dark:text-gray-400 dark:group-hover:text-white"}`}
                >
                  {step.label}
                </span>
                <span className="sr-only">{isCurrent ? " (current step)" : done ? " (done)" : ""}</span>
              </button>
              {index < STEPS.length - 1 && (
                <span aria-hidden="true" className={`h-0.5 min-w-4 flex-1 rounded-full ${index < active ? "bg-sky-500/60 dark:bg-sky-500/40" : "bg-slate-200 dark:bg-gray-800"}`} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default function WizardShell({
  returnTo,
  title,
  status,
  saveStatus,
  menu,
  current,
  onStep,
  stepReady,
  locked = false,
  notices,
  back,
  primary,
  topRef,
  children,
}) {
  return (
    <main
      data-interview-wizard
      className={pageClass}
    >
      <header
        ref={topRef}
        data-page-header
        className="border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95"
      >
        <div className="mx-auto w-full max-w-6xl px-4 pb-4 pt-3 sm:px-6">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
            <Link
              to={returnTo}
              aria-label="Back"
              className="-ml-1 rounded-md p-1 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <ArrowLeft size={16} aria-hidden="true" />
            </Link>
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
              <Link to={returnTo} className="shrink-0 hover:text-sky-700 dark:hover:text-sky-300">
                AI Interviews
              </Link>
              <ChevronRight size={12} aria-hidden="true" className="shrink-0 text-slate-300 dark:text-gray-600" />
              <span aria-current="page" className="truncate font-medium text-slate-700 dark:text-gray-200">
                {title}
              </span>
            </nav>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="min-w-0 truncate text-xl font-semibold leading-8 tracking-tight text-slate-950 dark:text-white sm:text-[22px]">
                {title}
              </h1>
              <StatusChip status={status} />
            </div>
            <div className="flex items-center gap-3">
              {saveStatus}
              {menu}
            </div>
          </div>
          <div className="mt-5">
            <Stepper current={current} onStep={onStep} stepReady={stepReady} locked={locked} />
          </div>
        </div>
      </header>
      {/* Every step uses the full content width; the interview summary lives on Review & publish. */}
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        <div className="min-w-0 space-y-4">
          {notices}
          {children}
        </div>
      </div>
      <footer className="sticky bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-4px_16px_rgba(15,23,42,0.06)] dark:border-gray-800 dark:bg-gray-900 dark:shadow-[0_-4px_16px_rgba(0,0,0,0.35)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>{back}</div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-slate-500 dark:text-gray-400 sm:inline">
              Step {stepIndex(current) + 1} of {STEPS.length}
            </span>
            {primary}
          </div>
        </div>
      </footer>
    </main>
  );
}
