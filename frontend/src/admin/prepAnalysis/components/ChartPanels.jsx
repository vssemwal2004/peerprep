import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw } from "lucide-react";
<<<<<<< Updated upstream
import { newGroup } from "../filterModel";
import { ChartBody } from "./ChartCard";
import { GroupFilters } from "./GroupEditor";
=======
import { ChartBody } from "./ChartCard";
import { ConditionBuilder } from "./ConditionBuilder";
>>>>>>> Stashed changes
import { sectionStyle } from "./sectionStyles";
import { Button, Dialog, Drawer, IconButton, OptionPicker, focusRing, inputClass, selectClass } from "./ui";

/** Per-chart settings: compare by, how many, which student, and filters for this chart only. */
<<<<<<< Updated upstream
export function ChartSettingsDialog({ open, entry, definition, catalog, fields, onClose, onSave }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (open && entry) {
      setDraft({ filter: Array.isArray(entry.filter?.rules) ? entry.filter : newGroup(), options: { ...(definition?.options || {}), ...(entry.options || {}) }, labels: entry.labels || {} });
=======
export function ChartSettingsDialog({ open, entry, definition, catalog, fields, fieldMap, onClose, onSave }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (open && entry) {
      setDraft({ filter: entry.filter?.type === "group" ? entry.filter : newGroup(), options: { ...(definition?.options || {}), ...(entry.options || {}) }, labels: entry.labels || {} });
>>>>>>> Stashed changes
    }
  }, [definition, entry, open]);
  if (!open || !draft || !definition) return null;
  const has = (key) => definition.options?.[key] !== undefined;
  const setOption = (key, value) => setDraft((current) => ({ ...current, options: { ...current.options, [key]: value } }));
  return (
    <Dialog open={open} onClose={onClose} size="max-w-4xl" title={definition.title} subtitle={definition.question}
      footer={<>
        <Button tone="ghost" onClick={() => setDraft({ filter: newGroup(), options: { ...(definition.options || {}) }, labels: {} })}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button tone="primary" onClick={() => onSave(draft)}>Save</Button>
      </>}>
      <div className="space-y-5 p-4">
        {(has("groupBy") || has("limit") || has("studentId")) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {has("studentId") && (
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">Student</span>
                <OptionPicker list="students" multiple={false} value={draft.options.studentId || ""} labels={draft.labels} placeholder="Top student in view"
                  onChange={(studentId, labels) => setDraft((current) => ({ ...current, options: { ...current.options, studentId }, labels }))} />
              </label>
            )}
            {has("groupBy") && (
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">Compare by</span>
                <select className={selectClass} value={draft.options.groupBy} onChange={(event) => setOption("groupBy", event.target.value)}>
                  {catalog.groupBy.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
            )}
            {has("limit") && (
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-700 dark:text-slate-200">How many to show</span>
                <input type="number" min={1} max={50} className={inputClass} value={draft.options.limit} onChange={(event) => setOption("limit", event.target.value)} />
              </label>
            )}
          </div>
        )}
        <section>
          <h4 className="text-[12.5px] font-bold text-slate-900 dark:text-white">Show this chart only for some students <span className="font-medium text-slate-400">(optional)</span></h4>
          <p className="mb-2.5 mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">These work on top of the filters at the top of the page. Leave them empty to use every student on the page.</p>
<<<<<<< Updated upstream
          <GroupFilters group={draft.filter} featureFields={fields.filter((field) => field.module !== "student")} studentFields={fields.filter((field) => field.module === "student")}
            catalog={catalog} onChange={(filter) => setDraft((current) => ({ ...current, filter }))} />
=======
          <ConditionBuilder group={draft.filter} fields={fields} fieldMap={fieldMap} catalog={catalog}
            emptyText="No condition: the chart uses every student on the page."
            onChange={(filter) => setDraft((current) => ({ ...current, filter }))} />
>>>>>>> Stashed changes
        </section>
      </div>
    </Dialog>
  );
}

export function ChartExpandDialog({ chart, view = "chart", onClose, onStudent }) {
  if (!chart) return null;
  return (
    <Dialog open onClose={onClose} size="max-w-6xl" title={chart.title} subtitle={chart.question}>
      <div className="p-4"><ChartBody chart={chart} view={view} onStudent={onStudent} height={Math.min(620, Math.max(440, typeof window !== "undefined" ? window.innerHeight * 0.6 : 520))} /></div>
    </Dialog>
  );
}

/** Choose and order the charts of the current area. */
export function CustomizeDrawer({ open, charts, sections = [], layout, areaLabel, onClose, onChange, onReset }) {
  const sectionLabel = (key) => sections.find((section) => section.key === key)?.label || "";
  const visible = new Set(layout.map((entry) => entry.id));
  const byId = new Map(charts.map((chart) => [chart.id, chart]));
  const move = (index, delta) => {
    const next = [...layout];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    onChange(next);
  };
  const hidden = charts.filter((chart) => !visible.has(chart.id));
  return (
    <Drawer open={open} onClose={onClose} width="max-w-md" title={`Charts · ${areaLabel}`} subtitle={`${layout.length} of ${charts.length} charts on the page`}
      footer={<div className="flex justify-between"><Button tone="ghost" onClick={onReset}><RotateCcw className="h-3.5 w-3.5" />Default charts</Button><Button tone="primary" onClick={onClose}>Done</Button></div>}>
      <div className="space-y-5 p-4">
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-bold text-slate-700 dark:text-slate-200">On the page</h3>
          <ul className="space-y-1">
            {layout.map((entry, index) => {
              const chart = byId.get(entry.id);
              if (!chart) return null;
              const style = sectionStyle(chart.section);
              const Icon = style.Icon;
              return (
                <li key={entry.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 dark:border-gray-700 dark:bg-gray-900">
                  <input type="checkbox" checked onChange={() => onChange(layout.filter((item) => item.id !== entry.id))} aria-label={`Hide ${chart.title}`} className="h-3.5 w-3.5 accent-sky-600" />
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${style.chip}`}><Icon className="h-3 w-3" /></span>
                  <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-800 dark:text-slate-100" title={chart.question}>
                    {chart.title}<span className="ml-1.5 text-[10.5px] font-medium text-slate-400">{sectionLabel(chart.section)}</span>
                  </p>
                  <IconButton label="Move up" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-3.5 w-3.5" /></IconButton>
                  <IconButton label="Move down" disabled={index === layout.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-3.5 w-3.5" /></IconButton>
                </li>
              );
            })}
          </ul>
        </section>
        {[...new Set(hidden.map((chart) => chart.section))].map((section) => (
          <section key={section}>
            <h3 className="mb-1.5 text-[11.5px] font-bold text-slate-700 dark:text-slate-200">Add a chart · {sectionLabel(section)}</h3>
            <ul className="space-y-1">
              {hidden.filter((chart) => chart.section === section).map((chart) => (
                <li key={chart.id}>
                  <button type="button" onClick={() => onChange([...layout, { id: chart.id, options: {} }])} className={`flex w-full items-start gap-2 rounded-xl border border-dashed border-slate-200 px-2.5 py-2 text-left hover:border-sky-300 hover:bg-sky-50/50 dark:border-gray-700 dark:hover:border-sky-500/40 dark:hover:bg-sky-500/5 ${focusRing}`}>
                    <Plus className="mt-0.5 h-3.5 w-3.5 text-sky-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-slate-700 dark:text-slate-200">{chart.title}</span>
                      <span className="block text-[11px] leading-4 text-slate-500">{chart.question}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Drawer>
  );
}
