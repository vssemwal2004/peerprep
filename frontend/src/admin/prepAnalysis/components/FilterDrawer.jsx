import { useEffect, useMemo, useState } from "react";
import { LayoutGrid, Loader2, Plus, RotateCcw, SlidersHorizontal, Users, X } from "lucide-react";
import { prepAnalysisApi } from "../api";
import {
  MAX_GROUPS, RANGE_PRESETS, countActive, countRules, defaultFilterState, featureFields, groupName, groupText, isRuleComplete, newGroup, nodeId,
  optionLookup, rankMetrics, rankText, setRule, studentFields, switchArea, toQueryRequest, valueParts,
} from "../filterModel";
import { GroupCard, GroupFilters, RankEditor } from "./GroupEditor";
import { AREA_ICONS } from "./sectionStyles";
import { Button, Drawer, fieldSelectClass, focusRing } from "./ui";

const AREA_HINTS = {
  all: "Every feature together",
  coding: "Problems, Prep Score and Quick Prep sheets",
  learning: "Course topics and subjects",
  interview: "Mock and AI interviews",
  assessment: "Tests and their results",
};

function Step({ number, title, hint, aside, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <header className="mb-3 flex flex-wrap items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-bold text-white">{number}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">{title}</h3>
          {hint && <p className="mt-0.5 text-[12px] text-slate-500 dark:text-gray-400">{hint}</p>}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Groups with nothing chosen add nothing (and would otherwise mean "everyone"). */
const withoutEmptyGroups = (state, fieldMap) => {
  const groups = state.groups.filter((group) => countRules(group, fieldMap) > 0);
  return { ...state, groups: groups.length ? groups : [newGroup()] };
};

/**
 * The whole filter in three questions: what to analyse, which students, and
 * everyone or only the top / bottom. Changes stay here, with a live count,
 * until "Show N students".
 */
export function FilterDrawer({ open, state, catalog, fieldMap, matched, onApply, onClose }) {
  const [draft, setDraft] = useState(state);
  const [openGroup, setOpenGroup] = useState(state.groups[0]?.id);
  const [count, setCount] = useState({ value: matched ?? null, loading: false });
  useEffect(() => {
    if (!open) return;
    setDraft(state);
    setOpenGroup(state.groups[0]?.id);
  }, [open, state]);

  const requestKey = useMemo(() => JSON.stringify(toQueryRequest({ state: draft }, fieldMap)), [draft, fieldMap]);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setCount((current) => ({ ...current, loading: true }));
    const timer = setTimeout(() => {
      prepAnalysisApi.count(JSON.parse(requestKey), controller.signal)
        .then((result) => setCount({ value: result.matched, loading: false }))
        .catch((error) => { if (error.name !== "AbortError") setCount((current) => ({ ...current, loading: false })); });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, requestKey]);

  if (!open) return null;
  const areas = catalog.areas || [];
  const areaLabel = areas.find((entry) => entry.key === draft.area)?.label || "";
  const metrics = rankMetrics(catalog, draft.area);
  const features = featureFields(catalog, draft.area);
  const students = studentFields(catalog);
  const setGroup = (next) => setDraft((current) => ({ ...current, groups: current.groups.map((group) => (group.id === next.id ? next : group)) }));
  const addGroup = () => {
    const group = newGroup();
    setDraft((current) => ({ ...current, groups: [...current.groups, group] }));
    setOpenGroup(group.id);
  };
  const copyGroup = (group) => {
    const copy = { id: nodeId(), rules: group.rules.map((rule) => ({ ...rule, id: nodeId() })) };
    setDraft((current) => ({ ...current, groups: [...current.groups, copy] }));
    setOpenGroup(copy.id);
  };
  const removeGroup = (id) => setDraft((current) => ({ ...current, groups: current.groups.filter((group) => group.id !== id) }));
  const changes = countActive(draft, fieldMap) + (draft.range.preset !== "all" ? 1 : 0);
  const several = draft.groups.length > 1;
  const lastIsEmpty = !countRules(draft.groups.at(-1), fieldMap);
  const filters = (group, flat) => (
    <GroupFilters key={group.id} group={group} featureFields={features} studentFields={students} areaLabel={areaLabel} area={draft.area} catalog={catalog} fieldMap={fieldMap} flat={flat} onChange={setGroup} />
  );

  return (
    <Drawer open onClose={onClose} width="max-w-[920px]" title="Filters" subtitle="Choose filters, then press Show. Nothing changes on the page until then."
      footer={(
        <div className="flex items-center gap-2">
          <Button tone="ghost" disabled={!changes} aria-label="Clear all" onClick={() => { const fresh = defaultFilterState(draft.area); setDraft(fresh); setOpenGroup(fresh.groups[0].id); }}>
            <RotateCcw className="h-3.5 w-3.5" /><span className="hidden sm:inline">Clear all</span>
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button tone="primary" className="sm:min-w-[170px]" onClick={() => { onApply(withoutEmptyGroups(draft, fieldMap)); onClose(); }}>
              {count.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Users className="h-3.5 w-3.5" />}
              {count.value === null ? "Show students" : `Show ${count.value.toLocaleString()} student${count.value === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      )}>
      <div className="space-y-3 bg-slate-50 p-3 sm:p-4 dark:bg-gray-950">
        <Step number={1} title="What do you want to analyse?"
          aside={(
            <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-gray-300">
              Activity from
              <select className={`${fieldSelectClass} w-36`} value={draft.range.preset} onChange={(event) => setDraft({ ...draft, range: { preset: event.target.value } })}>
                {RANGE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
              </select>
            </label>
          )}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" role="radiogroup" aria-label="Feature">
            {areas.map((entry) => {
              const Icon = AREA_ICONS[entry.key] || LayoutGrid;
              const active = entry.key === draft.area;
              return (
                <button key={entry.key} type="button" role="radio" aria-checked={active} onClick={() => setDraft(switchArea(draft, entry.key, fieldMap, catalog))}
                  className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${active ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:border-sky-400 dark:bg-sky-500/10 dark:ring-sky-400" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800"} ${focusRing}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${active ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300"}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-bold text-slate-900 dark:text-white">{entry.label}</span>
                    <span className="line-clamp-2 block text-[10.5px] leading-4 text-slate-500 dark:text-gray-400">{AREA_HINTS[entry.key] || ""}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Step>

        <Step number={2} title="Which students?"
          hint={several ? "Students who fit any one of these groups are shown." : "Open a filter and tick one or more options. Several ticks in one filter mean any of them; every filter you set must match."}>
          {several ? (
            <div className="space-y-2">
              {draft.groups.map((group, index) => (
                <div key={group.id}>
                  {index > 0 && (
                    <div className="my-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                      <span className="h-px flex-1 bg-slate-200 dark:bg-gray-800" />or students in<span className="h-px flex-1 bg-slate-200 dark:bg-gray-800" />
                    </div>
                  )}
                  <GroupCard name={groupName(index)} group={group} open={openGroup === group.id} fieldMap={fieldMap} catalog={catalog}
                    onOpen={() => setOpenGroup(openGroup === group.id ? null : group.id)} onDuplicate={() => copyGroup(group)} onRemove={() => removeGroup(group.id)}>
                    {filters(group, true)}
                  </GroupCard>
                </div>
              ))}
            </div>
          ) : filters(draft.groups[0], false)}
          {draft.groups.length < MAX_GROUPS && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={addGroup} disabled={lastIsEmpty} title={lastIsEmpty ? "Choose at least one filter first" : undefined}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-sky-300 px-3 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
                <Plus className="h-4 w-4" />Add another group of students
              </button>
              <span className="text-[11.5px] text-slate-500 dark:text-gray-400">
                {lastIsEmpty ? "Choose at least one filter first." : <>e.g. Semester 5 with Prep Score 75+, <b>or</b> Semester 6 who stopped practising.</>}
              </span>
            </div>
          )}
        </Step>

        <Step number={3} title="Everyone, or only the top / bottom?" hint="Works on the students chosen above.">
          <RankEditor rank={draft.rank} metrics={metrics} defaultMetric={catalog.rankMetric?.[draft.area]} onChange={(rank) => setDraft({ ...draft, rank })} />
        </Step>
      </div>
    </Drawer>
  );
}

function Chip({ label, text, onOpen, onClear }) {
  return (
    <span className="inline-flex h-7 min-w-0 max-w-[480px] items-center rounded-full border border-slate-200 bg-slate-50 text-[11.5px] text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
      <button type="button" onClick={onOpen} title={`${label}: ${text}`} className={`min-w-0 truncate rounded-l-full py-0.5 pl-2.5 pr-1 ${focusRing}`}>
        <span className="font-semibold text-slate-500 dark:text-gray-400">{label}: </span><span className="font-semibold text-slate-900 dark:text-white">{text}</span>
      </button>
      <button type="button" onClick={onClear} aria-label={`Clear ${label}`} className={`mr-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-200 hover:text-slate-800 dark:hover:bg-gray-700 ${focusRing}`}><X className="h-3 w-3" /></button>
    </span>
  );
}

/** The page's one line: the "Filters" button, what is being analysed, the filters in use, and the count. */
export function FilterToolbar({ state, catalog, fieldMap, meta, loading, onOpen, onChange }) {
  const lookup = useMemo(() => optionLookup(catalog), [catalog]);
  const areaLabel = catalog.areas?.find((entry) => entry.key === state.area)?.label || "";
  const AreaIcon = AREA_ICONS[state.area] || LayoutGrid;
  const period = RANGE_PRESETS.find((preset) => preset.value === state.range.preset)?.label || "All time";
  const metricLabel = (key) => fieldMap.get(key)?.label || key;
  const ranking = rankText(state.rank, metricLabel);
  const total = countActive(state, fieldMap);
  const several = state.groups.length > 1;
  const single = state.groups[0];
  return (
    <section aria-label="Filters" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <button type="button" onClick={onOpen}
        className={`inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3.5 text-[12.5px] font-semibold text-white shadow-sm hover:bg-sky-700 ${focusRing}`}>
        <SlidersHorizontal className="h-4 w-4" />Filters
        {total > 0 && <span className="rounded-full bg-white/25 px-1.5 text-[11px] leading-5">{total}</span>}
      </button>
      <button type="button" onClick={onOpen} title="Change what you analyse"
        className={`inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 px-3 text-[12px] text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 ${focusRing}`}>
        <AreaIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        <span className="font-bold text-slate-900 dark:text-white">{areaLabel}</span><span className="text-slate-400">·</span>{period}
      </button>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {several
          ? state.groups.map((group, index) => {
            const text = groupText(group, fieldMap, lookup);
            return text && (
              <span key={group.id} className="contents">
                {index > 0 && <span className="text-[11px] font-bold text-slate-500">or</span>}
                <Chip label={groupName(index)} text={text} onOpen={onOpen} onClear={() => onChange({ ...state, groups: state.groups.filter((entry) => entry.id !== group.id) })} />
              </span>
            );
          })
          : single.rules.filter((rule) => isRuleComplete(rule, fieldMap.get(rule.field))).map((rule) => {
            const field = fieldMap.get(rule.field);
            const { text, extra } = valueParts(rule, field, lookup);
            return <Chip key={rule.field} label={field.label} text={`${text}${extra ? ` +${extra}` : ""}`} onOpen={onOpen} onClear={() => onChange({ ...state, groups: [setRule(single, rule.field, null)] })} />;
          })}
        {ranking && <Chip label="Showing" text={ranking} onOpen={onOpen} onClear={() => onChange({ ...state, rank: { join: "and", rules: [] } })} />}
        {!total && <span className="text-[12px] text-slate-500 dark:text-gray-400">No filters: every student is shown.</span>}
      </div>
      <p className="ml-auto inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] text-slate-500 dark:text-gray-400" aria-live="polite">
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-sky-600" /> : <Users className="h-4 w-4 text-sky-600" />}
        {meta ? <span><b className="text-[15px] tabular-nums text-slate-900 dark:text-white">{meta.matched.toLocaleString()}</b> of {meta.cohortSize.toLocaleString()} students</span> : "Counting…"}
      </p>
    </section>
  );
}
