import { useId } from "react";
import { Check } from "lucide-react";
import { FieldLabel } from "../controls";

// A labelled list of checkbox rows. options: { value, label, detail }.
export function CheckList({ label, hint, options, values, onToggle, isLocked, lockedHint, field }) {
  const labelId = useId(),
    hintId = useId();
  return (
    <div role="group" aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} data-field={field} className="min-w-0">
      <FieldLabel id={labelId}>{label}</FieldLabel>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const checked = values.includes(option.value);
          const locked = Boolean(isLocked?.(option.value));
          return (
            <label
              key={option.value}
              className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 transition ${checked ? "border-sky-300 bg-sky-50/60 dark:border-sky-500/40 dark:bg-sky-400/5" : "border-slate-200 bg-white hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"} ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              <input
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                disabled={locked}
                aria-describedby={locked && lockedHint ? `${hintId}-locked` : undefined}
                onChange={() => onToggle(option.value)}
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-sky-500 peer-focus-visible:ring-offset-2 dark:peer-focus-visible:ring-offset-gray-900 ${checked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-950"} ${locked ? "opacity-60" : ""}`}
              >
                {checked && <Check size={13} strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-900 dark:text-white">{option.label}</span>
                {option.detail && (
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-gray-400">{option.detail}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {lockedHint && options.some((o) => isLocked?.(o.value)) && (
        <p id={`${hintId}-locked`} className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">
          {lockedHint}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
          {hint}
        </p>
      )}
    </div>
  );
}

// A short line under a setting showing what students will see.
export function StudentSees({ children }) {
  return (
    <p className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-[13px] text-slate-600 dark:bg-gray-800/60 dark:text-gray-300">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">Students see</span>
      {children}
    </p>
  );
}
