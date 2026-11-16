import { useEffect, useState } from "react";
import { GitCompareArrows, X } from "lucide-react";
import { COMPARE_MAX_VALUES, COMPARE_MIN_VALUES, compareDimensions, isCompareReady } from "../compareModel";
import { countRules, featureFields, newGroup, studentFields } from "../filterModel";
import { GroupFilters } from "./GroupEditor";
import { Button, Dialog, OptionList, Segmented, inputClass } from "./ui";

const SIDES = ["A", "B"];
const blank = () => SIDES.map((side) => ({ label: `Group ${side}`, group: newGroup() }));
const blankClasses = () => ({ dimension: "section", values: [] });
const MODES = [{ value: "classes", label: "Sections, groups, campuses…" }, { value: "groups", label: "Two custom groups" }];

/** Pick a dimension, then 2–8 of its values (searchable, from the admin's own students). */
function ClassPicker({ draft, catalog, onChange }) {
  const dimensions = compareDimensions(catalog);
  const dimension = dimensions.find((entry) => entry.key === draft.dimension) || dimensions[0];
  const labels = Object.fromEntries(draft.values.map((entry) => [entry.value, entry.label]));
  const full = draft.values.length >= COMPARE_MAX_VALUES;
  return (
    <div className="space-y-3 p-4">
      <div role="radiogroup" aria-label="Compare by" className="flex flex-wrap gap-1.5">
        {dimensions.map((entry) => (
          <button key={entry.key} type="button" role="radio" aria-checked={entry.key === dimension.key}
            onClick={() => entry.key !== dimension.key && onChange({ dimension: entry.key, values: [] })}
            className={`h-8 rounded-lg border px-3 text-[12px] font-semibold transition-colors ${entry.key === dimension.key ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-gray-700 dark:text-slate-300"}`}>
            {entry.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="rounded-xl border border-slate-200 p-2 dark:border-gray-700">
          <OptionList key={dimension.key} list={dimension.options} value={draft.values.map((entry) => entry.value)} labels={labels} maxHeight="max-h-72"
            onChange={(next, nextLabels) => {
              if (next.length > COMPARE_MAX_VALUES) return;
              onChange({ dimension: dimension.key, values: next.map((value) => ({ value, label: nextLabels[value] ?? String(value) })) });
            }} />
        </div>
        <div className="space-y-1.5">
          <p className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">{draft.values.length} of {COMPARE_MAX_VALUES} picked</p>
          <ul className="flex flex-wrap gap-1.5">
            {draft.values.map((entry) => (
              <li key={String(entry.value)} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-sky-50 pl-2.5 pr-1 text-[11.5px] font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
                <span className="truncate">{entry.label}</span>
                <button type="button" aria-label={`Remove ${entry.label}`} onClick={() => onChange({ ...draft, values: draft.values.filter((item) => item !== entry) })}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-sky-100 dark:hover:bg-white/10"><X className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
          {full && <p className="text-[11px] text-amber-700 dark:text-amber-300">Up to {COMPARE_MAX_VALUES} at a time.</p>}
          {draft.values.length < COMPARE_MIN_VALUES && <p className="text-[11px] text-slate-500">Pick at least {COMPARE_MIN_VALUES}.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * "Compare": either classes side by side (2–8 Sections, Groups, Campuses, Branches, Semesters or
 * Courses in one table and set of charts) or two named groups of students, each chosen with the
 * filter drawer's controls (every chart then shows both groups side by side).
 */
export default function CompareControl({ compare, classCompare, catalog, area, fieldMap, onApply, onApplyClasses, openRequest = 0 }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("classes");
  const [draft, setDraft] = useState(blank);
  const [classDraft, setClassDraft] = useState(blankClasses);
  useEffect(() => {
    if (!open) return;
    setDraft(compare || blank());
    setClassDraft(classCompare || blankClasses());
    setMode(compare ? "groups" : "classes");
  }, [classCompare, compare, open]);
  // The dashboard's "Change" button opens this dialog.
  useEffect(() => { if (openRequest) setOpen(true); }, [openRequest]);
  const features = catalog ? featureFields(catalog, area) : [];
  const students = catalog ? studentFields(catalog) : [];
  // Only finished conditions count (a picked field with no value yet is not a group).
  const ruleCount = (side) => countRules(side.group, fieldMap);
  const ready = mode === "classes" ? isCompareReady(classDraft) : draft.every((side) => ruleCount(side) > 0);
  const setSide = (index, patch) => setDraft((current) => current.map((side, at) => (at === index ? { ...side, ...patch } : side)));
  const comparing = Boolean(compare || classCompare);
  const apply = () => {
    if (mode === "classes") onApplyClasses(classDraft);
    else onApply(draft.map((side, index) => ({ ...side, label: side.label.trim() || `Group ${SIDES[index]}` })));
    setOpen(false);
  };
  return (
    <>
      <Button tone={comparing ? "primary" : "secondary"} onClick={() => setOpen(true)} title="Compare sections, groups, campuses or two groups of students" aria-label="Compare">
        <GitCompareArrows className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">{comparing ? "Comparing" : "Compare"}</span>
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="max-w-5xl" title="Compare"
        footer={<>
          {comparing && <Button tone="ghost" onClick={() => { onApply(null); onApplyClasses(null); setOpen(false); }}><X className="h-3.5 w-3.5" />Stop comparing</Button>}
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button tone="primary" disabled={!ready} onClick={apply}>Compare</Button>
        </>}>
        <div className="px-4 pt-3"><Segmented size="md" value={mode} options={MODES} onChange={setMode} label="What to compare" /></div>
        {mode === "classes" ?<ClassPicker draft={classDraft} catalog={catalog} onChange={setClassDraft} /> : (
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
        )}
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

/** "Comparing Section: A, B, C" in the filter bar, with a button to stop. */
export function ClassCompareChip({ label, onClear }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-sky-600 pl-3 pr-1 text-[11.5px] font-semibold text-white shadow-sm">
      <GitCompareArrows className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{label}</span>
      <button type="button" onClick={onClear} aria-label="Stop comparing" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-white/20"><X className="h-3 w-3" /></button>
    </span>
  );
}
