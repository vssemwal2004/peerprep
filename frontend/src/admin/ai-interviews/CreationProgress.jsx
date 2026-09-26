import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { ROOT } from "./definition";
import { getAuthoringProgress } from "./authoringProgress";

const steps = [
  { id: "basics", label: "Interview details", shortLabel: "Details" },
  { id: "sections", label: "Questions & topics", shortLabel: "Questions" },
  { id: "review", label: "Review & finish", shortLabel: "Review" },
];

// The blue line indicates the current position, not a percentage of saved work.
// Readiness comes from the actual fields; only server validation completes setup.
export default function CreationProgress({
  id,
  current = "basics",
  data,
  complete = false,
}) {
  const progress = getAuthoringProgress(data);
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === current),
  );
  const position = (activeIndex / (steps.length - 1)) * 100;
  return (
    <nav
      aria-label="AI interview creation progress"
      className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 sm:px-5"
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Step {activeIndex + 1} of {steps.length}: {steps[activeIndex].label}.{" "}
        {complete ? "Setup complete. Not live." : "Interview setup."}
      </p>
      <div className="relative">
        <div
          aria-hidden="true"
          data-creation-track
          className="pointer-events-none absolute left-[16.6667%] right-[16.6667%] top-[19px] h-0.5 overflow-hidden rounded-full bg-slate-200 dark:bg-gray-700"
        >
          <span
            data-creation-position
            className="block h-full rounded-full bg-sky-500 transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${position}%` }}
          />
        </div>
        <ol className="relative grid grid-cols-3">
          {steps.map((step, index) => {
            const active = activeIndex === index;
            const ready =
              step.id === "review"
                ? complete
                : Boolean(id && progress.steps[index].ready);
            const needsAttention = Boolean(id && index < activeIndex && !ready);
            const status = active
              ? complete && step.id === "review"
                ? "Complete"
                : "Current"
              : ready
                ? "Ready"
                : needsAttention
                  ? "Needs details"
                  : "Next";
            const className =
              "group flex min-w-0 flex-col items-center gap-1.5 rounded-lg px-1 py-0.5 text-center outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900";
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors motion-reduce:transition-none ${active ? "border-sky-600 bg-sky-600 text-white ring-4 ring-sky-100 dark:ring-sky-950" : ready ? "border-sky-500 bg-sky-500 text-white" : needsAttention ? "border-amber-300 bg-white text-amber-700 dark:border-amber-700 dark:bg-gray-900 dark:text-amber-300" : "border-slate-200 bg-white text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-500"}`}
                >
                  {ready && (!active || complete) ? (
                    <Check size={17} strokeWidth={3} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={`text-xs font-semibold sm:text-sm ${active ? "text-sky-700 dark:text-sky-300" : "text-slate-700 group-hover:text-sky-700 dark:text-gray-200 dark:group-hover:text-sky-300"}`}
                >
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.shortLabel}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`text-[11px] leading-4 ${active ? "font-semibold text-sky-700 dark:text-sky-300" : needsAttention ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-gray-400"}`}
                >
                  {active && status !== "Complete"
                    ? `Step ${index + 1} of ${steps.length}`
                    : status}
                </span>
              </>
            );
            return (
              <li
                key={step.id}
                data-creation-step={step.id}
                data-step-state={
                  active
                    ? "current"
                    : ready
                      ? "ready"
                      : needsAttention
                        ? "incomplete"
                        : "upcoming"
                }
              >
                {id ? (
                  <Link
                    className={className}
                    to={`${ROOT}/${id}/${step.id}`}
                    aria-current={active ? "step" : undefined}
                    aria-label={`${step.label}: ${status}`}
                  >
                    {content}
                  </Link>
                ) : (
                  <span
                    className={className}
                    aria-current={active ? "step" : undefined}
                    aria-disabled={!active}
                    aria-label={`${step.label}: ${status}`}
                    title={!active ? "Create the draft to continue" : undefined}
                  >
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </nav>
  );
}
