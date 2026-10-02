import { FilterX, X } from "lucide-react";
import { getScopeChips } from "../analyticsQuery";

export default function ActiveScopeBar({ query, meta, onRemove, onClear }) {
  const chips = getScopeChips(query);
  const evidenceCount = meta?.evidenceCount ?? (meta?.evidence ? Object.values(meta.evidence).reduce((sum, value) => sum + (Number(value) || 0), 0) : null);
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 lg:flex-row lg:items-center">
      <div className="flex shrink-0 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        <FilterX className="h-3.5 w-3.5" /> Active scope
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {chips.map((chip) => (
          <button key={chip.key} type="button" onClick={() => onRemove(chip.key)} title={`Remove ${chip.label} filter`} className="group inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
            <span className="font-bold">{chip.label}</span><span className="truncate">{chip.value}</span><X className="h-3 w-3 opacity-45 group-hover:opacity-100" />
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-100 pt-3 text-xs lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 dark:border-white/10">
        {evidenceCount != null && <span className="font-semibold text-slate-500">{evidenceCount.toLocaleString()} evidence rows</span>}
        <button type="button" onClick={onClear} className="font-bold text-sky-700 hover:text-sky-500 dark:text-sky-300">Clear all</button>
      </div>
    </div>
  );
}
