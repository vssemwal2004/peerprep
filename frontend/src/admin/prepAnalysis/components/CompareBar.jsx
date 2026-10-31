import { useEffect, useState } from "react";
import { GitCompareArrows, X } from "lucide-react";
import { countRules, featureFields, newGroup, studentFields } from "../filterModel";
import { GroupFilters } from "./GroupEditor";
import { Button, Dialog, inputClass } from "./ui";

const SIDES = ["A", "B"];
const blank = () => SIDES.map((side) => ({ label: `Group ${side}`, group: newGroup() }));

/**
 * "Compare": two named groups of students (e.g. Sem 5 vs Sem 7), each chosen with the same
 * controls as the filter drawer. Every chart then shows both groups side by side.
 */
export default function CompareControl({ compare, catalog, area, fieldMap, onApply }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(blank);
  useEffect(() => { if (open) setDraft(compare || blank()); }, [compare, open]);
  const features = catalog ? featureFields(catalog, area) : [];
  const students = catalog ? studentFields(catalog) : [];
  // Only finished conditions count (a picked field with no value yet is not a group).
  const ruleCount = (side) => countRules(side.group, fieldMap);
  const ready = draft.every((side) => ruleCount(side) > 0);
  const setSide = (index, patch) => setDraft((current) => current.map((side, at) => (at === index ? { ...side, ...patch } : side)));
  return (
    <>
      <Button tone={compare ? "primary" : "secondary"} onClick={() => setOpen(true)} title="Compare two groups of students side by side" aria-label="Compare two groups of students">
        <GitCompareArrows className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{compare ? "Comparing" : "Compare"}</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="max-w-5xl" title="Compare two groups of students"
        subtitle="Every chart shows both groups side by side, within the page's filters."
        footer={<>
          {compare && <Button tone="ghost" onClick={() => { onApply(null); setOpen(false); }}><X className="h-3.5 w-3.5" />Stop comparing</Button>}
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button tone="primary" disabled={!ready} onClick={() => { onApply(draft.map((side, index) => ({ ...side, label: side.label.trim() || `Group ${SIDES[index]}` }))); setOpen(false); }}>Compare</Button>
        </>}>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {draft.map((side, index) => (
            <section key={SIDES[index]} className="space-y-2.5 rounded-xl border border-slate-200 p-3 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold text-white ${index ? "bg-amber-500" : "bg-sky-600"}`}>{SIDES[index]}</span>
                <input value={side.label} onChange={(event) => setSide(index, { label: event.target.value })} maxLength={40} aria-label={`Name of group ${SIDES[index]}`} className={inputClass} />
              </div>
              <GroupFilters group={side.group} featureFields={features} studentFields={students} catalog={catalog} fieldMap={fieldMap} onChange={(group) => setSide(index, { group })} />
              {!ruleCount(side) && <p className="text-[11.5px] text-slate-500">Pick at least one condition for this group.</p>}
            </section>
          ))}
        </div>
      </Dialog>
    </>
  );
}

/** "A Sem 5 (120) vs B Sem 7 (98)" in the filter bar, with a button to stop comparing. */
export function CompareChip({ compare, counts = [], onClear }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-1.5 pr-1 text-[11.5px] font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-slate-200">
      {compare.map((side, index) => (
        <span key={index} className="inline-flex min-w-0 items-center gap-1">
          {index > 0 && <span className="text-slate-400">vs</span>}
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9.5px] font-bold text-white ${index ? "bg-amber-500" : "bg-sky-600"}`}>{SIDES[index]}</span>
          <span className="truncate">{side.label}{counts[index] !== undefined ? ` (${counts[index].toLocaleString()})` : ""}</span>
        </span>
      ))}
      <button type="button" onClick={onClear} aria-label="Stop comparing" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-3 w-3" /></button>
    </span>
  );
}
