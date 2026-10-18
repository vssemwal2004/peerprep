import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Plus, Search, Trash2, Users, X } from "lucide-react";
import { prepAnalysisApi } from "../api";
import {
  MAX_RANK_RULES, groupText, isMainField, isRuleComplete, listRule, newRankRule, numberPresets, optionLookup, rangeOf, rangeRule, ruleFor, setRule,
  valueParts,
} from "../filterModel";
import { AREA_ICONS } from "./sectionStyles";
import { Button, IconButton, Popover, fieldClass, fieldSelectClass, focusRing, inputClass } from "./ui";

const TOGGLE = "inline-flex h-7 items-center rounded-md px-2.5 text-[11.5px] font-semibold transition-colors";
const TOGGLE_ON = "bg-white text-sky-700 shadow-sm dark:bg-gray-900 dark:text-sky-300";
const TOGGLE_OFF = "text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white";

// Option lists loaded from the server are kept for the page's lifetime.
const optionCache = new Map();

function useFieldOptions(field, catalog) {
  const fixed = catalog.staticOptions?.[field.options];
  const [state, setState] = useState(() => ({ options: optionCache.get(field.options) || [], loading: !fixed && !optionCache.has(field.options) }));
  useEffect(() => {
    if (fixed || optionCache.has(field.options)) return undefined;
    const controller = new AbortController();
    prepAnalysisApi.options(field.options, "", controller.signal)
      .then((result) => { optionCache.set(field.options, result.options || []); setState({ options: result.options || [], loading: false }); })
      .catch((error) => { if (error.name !== "AbortError") setState({ options: [], loading: false }); });
    return () => controller.abort();
  }, [field.options, fixed]);
  return fixed ? { options: fixed, loading: false } : state;
}

const optionText = (field, option) => (field.options === "semesters" ? `Semester ${option.value}` : String(option.label ?? option.value).replace(/\s*\(.*\)\s*$/, ""));
const optionHint = (option) => String(option.label ?? "").match(/\((.*)\)\s*$/)?.[1] || "";

function PanelHeader({ title, note }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-gray-800">
      <p className="truncate text-[13px] font-bold text-slate-900 dark:text-white">{title}</p>
      {note && <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">{note}</span>}
    </div>
  );
}

function PanelFooter({ children, onDone }) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-slate-100 px-3 py-2 dark:border-gray-800">
      {children}
      <Button size="sm" tone="primary" className="ml-auto" onClick={onDone}>Done</Button>
    </div>
  );
}

const linkButton = `text-[12px] font-semibold rounded ${focusRing}`;

// ---------------------------------------------------------------- dropdown panels

// The match choice, as a sentence, shown once something is ticked.
const MODES = {
  enum: { lead: "Students who", options: [{ value: "anyOf", label: "are" }, { value: "noneOf", label: "are not" }], tail: "one of these" },
  set: { lead: "Students with", options: [{ value: "anyOf", label: "any of these" }, { value: "allOf", label: "all of these" }, { value: "noneOf", label: "none of these" }], tail: "" },
};

/** A multi-select list: search, tick boxes with student counts, select all / clear, and (once ticked) are / are not. */
function ListPanel({ field, rule, catalog, onChange, onDone }) {
  const { options, loading } = useFieldOptions(field, catalog);
  const [query, setQuery] = useState("");
  const selected = Array.isArray(rule?.value) ? rule.value.map(String) : [];
  const operator = rule?.operator || "anyOf";
  const needle = query.trim().toLowerCase();
  const visible = options.filter((option) => !needle || optionText(field, option).toLowerCase().includes(needle));
  const labelsOf = (list) => Object.fromEntries(list.map((option) => [String(option.value), option.label ?? String(option.value)]));
  const apply = (values, nextOperator = operator, extraLabels = {}) => onChange(listRule(field, values, nextOperator, extraLabels, rule));
  const toggle = (option) => {
    const value = String(option.value);
    apply(selected.includes(value) ? selected.filter((entry) => entry !== value) : [...selected, value], operator, labelsOf([option]));
  };
  const allVisibleOn = visible.length > 0 && visible.every((option) => selected.includes(String(option.value)));
  const mode = MODES[field.kind] || MODES.enum;
  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title={field.label} note={selected.length ? `${selected.length} chosen` : ""} />
      {options.length > 7 && (
        <div className="shrink-0 px-3 pt-2.5">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 focus-within:border-sky-400 dark:border-gray-700 dark:bg-gray-900">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${options.length} options…`} aria-label={`Search ${field.label}`}
              className="h-8 w-full bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-500 dark:text-gray-100 dark:placeholder:text-gray-400" />
            {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 ${focusRing}`}><X className="h-3.5 w-3.5" /></button>}
          </label>
        </div>
      )}
      <div role="group" aria-label={field.label} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
        {visible.map((option) => {
          const on = selected.includes(String(option.value));
          const hint = optionHint(option);
          return (
            <button key={String(option.value)} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(option)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors ${on ? "bg-sky-50 text-sky-900 dark:bg-sky-500/10 dark:text-sky-100" : "text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"} ${focusRing}`}>
              <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${on ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-900"}`}>
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{optionText(field, option)}</span>
                {hint && <span className="block truncate text-[10.5px] text-slate-500 dark:text-gray-400">{hint}</span>}
              </span>
              {option.count != null && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10.5px] tabular-nums text-slate-600 dark:bg-gray-800 dark:text-gray-300" title={`${option.count} students`}>{option.count}</span>}
            </button>
          );
        })}
      </div>
      {(loading || !visible.length) && (
        <p role="status" className="flex items-center justify-center gap-2 px-3 py-4 text-[12px] text-slate-500">
          {loading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading options…</> : needle ? `Nothing matches “${query}”.` : "Nothing to choose yet."}
        </p>
      )}
      {selected.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-[11.5px] text-slate-600 dark:border-gray-800 dark:text-gray-300">
          {mode.lead}
          <span className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Match">
            {mode.options.map((entry) => (
              <button key={entry.value} type="button" aria-pressed={operator === entry.value} onClick={() => apply(selected, entry.value)}
                className={`${TOGGLE} ${operator === entry.value ? TOGGLE_ON : TOGGLE_OFF} ${focusRing}`}>{entry.label}</button>
            ))}
          </span>
          {mode.tail}
        </div>
      )}
      <PanelFooter onDone={onDone}>
        {visible.length > 0 && (
          <button type="button" className={`${linkButton} text-sky-700 hover:underline dark:text-sky-300`} onClick={() => (allVisibleOn
            ? apply(selected.filter((value) => !visible.some((option) => String(option.value) === value)))
            : apply([...new Set([...selected, ...visible.map((option) => String(option.value))])], operator, labelsOf(visible)))}>
            {allVisibleOn ? "Untick all" : needle ? `Tick all ${visible.length} shown` : "Tick all"}
          </button>
        )}
        {selected.length > 0 && <button type="button" onClick={() => onChange(null)} className={`${linkButton} text-slate-500 hover:text-slate-800 hover:underline dark:hover:text-white`}>Clear</button>}
      </PanelFooter>
    </div>
  );
}

/** One-tap ranges in the field's own scale, or a custom from-to. Typed ranges are never lost on close. */
function RangePanel({ field, rule, onChange, onDone }) {
  const current = rangeOf(rule);
  const presets = numberPresets(field);
  const preset = presets.find((entry) => entry.from === current.from && entry.to === current.to);
  const [custom, setCustom] = useState(Boolean(rule) && !preset);
  const [draft, setDraft] = useState(current);
  const typed = useRef(false);
  const timer = useRef(null);
  const latest = useRef({ onChange, rule, draft });
  latest.current = { onChange, rule, draft };
  const fromRef = useRef(null);
  const pointerPick = useRef(false);
  const name = useId();
  // A changed range drops older "count only…" narrowing, so the filter is exactly what the dropdown shows.
  const commit = (from, to) => latest.current.onChange(rangeRule(field, from, to, latest.current.rule ? { ...latest.current.rule, qualifiers: {} } : null));
  const reset = () => { clearTimeout(timer.current); typed.current = false; setCustom(false); setDraft({ from: "", to: "" }); };

  useEffect(() => {
    if (!typed.current) return undefined;
    timer.current = setTimeout(() => { typed.current = false; commit(draft.from, draft.to); }, 350);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  // Closing the panel straight after typing still applies what was typed.
  useEffect(() => () => {
    if (!typed.current) return;
    clearTimeout(timer.current);
    commit(latest.current.draft.from, latest.current.draft.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Cleared from outside (the dropdown's ×): show "Any" again.
  useEffect(() => {
    if (!rule && !typed.current) { setCustom(false); setDraft({ from: "", to: "" }); }
  }, [rule]);

  const unit = field.kind === "percent" ? "%" : field.unit === "days" ? "days" : field.unit === "/ 5" ? "of 5" : "";
  const choice = (key, label, on, onPick, extra = {}) => (
    <label key={key} {...extra} className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors ${on ? "bg-sky-50 font-semibold text-sky-900 dark:bg-sky-500/10 dark:text-sky-100" : "text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"}`}>
      <input type="radio" name={name} checked={on} onChange={onPick} className="h-3.5 w-3.5 accent-sky-600" />{label}
    </label>
  );
  const box = (key, label) => (
    <label className="relative min-w-0 flex-1">
      <span className="mb-1 block text-[10.5px] font-semibold text-slate-600 dark:text-gray-300">{label}</span>
      <input ref={key === "from" ? fromRef : undefined} type="number" min={0} inputMode="decimal" placeholder="No limit" className={`${inputClass} ${unit ? "pr-12" : ""}`} value={draft[key]}
        onChange={(event) => { typed.current = true; setDraft({ ...draft, [key]: event.target.value }); }} />
      {unit && <span className="pointer-events-none absolute bottom-2 right-2.5 text-[11px] text-slate-500">{unit}</span>}
    </label>
  );
  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title={field.label} note={rule ? valueParts(rule, field).text : ""} />
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5" role="radiogroup" aria-label={field.label}>
        {choice("any", "Any", !rule && !custom, () => { reset(); onChange(null); })}
        {presets.map((entry) => choice(entry.label, entry.label, !custom && preset === entry, () => {
          reset();
          setDraft({ from: entry.from, to: entry.to });
          commit(entry.from, entry.to);
        }))}
        {choice("custom", "Custom range…", custom, () => {
          setCustom(true);
          setDraft(current);
          if (pointerPick.current) requestAnimationFrame(() => fromRef.current?.focus());
          pointerPick.current = false;
        }, { onPointerDown: () => { pointerPick.current = true; } })}
        {custom && (
          <div className="mx-2 mb-1 mt-1.5 flex items-end gap-2 rounded-lg bg-slate-50 p-2.5 dark:bg-gray-800/60">
            {box("from", "From")}
            <span className="pb-2 text-[12px] text-slate-500">to</span>
            {box("to", "To")}
          </div>
        )}
      </div>
      <PanelFooter onDone={onDone}>
        {rule && <button type="button" onClick={() => { reset(); onChange(null); }} className={`${linkButton} text-slate-500 hover:text-slate-800 hover:underline dark:hover:text-white`}>Clear</button>}
      </PanelFooter>
    </div>
  );
}

/** Free text (name, email or ID). Applies as you type, so closing never loses it. */
function TextPanel({ field, rule, onChange, onDone }) {
  const [text, setText] = useState(rule?.value || "");
  const update = (value) => {
    setText(value);
    const trimmed = value.trim();
    onChange(trimmed ? { id: rule?.id, field: field.key, operator: "contains", value: trimmed, labels: {}, qualifiers: {} } : null);
  };
  return (
    <div className="flex min-h-0 flex-col">
      <PanelHeader title={field.label} />
      <div className="p-3">
        <input autoFocus className={inputClass} value={text} maxLength={120} placeholder="Type a name, email or student ID" aria-label={field.label}
          onChange={(event) => update(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onDone(); }} />
      </div>
      <PanelFooter onDone={onDone} />
    </div>
  );
}

// ---------------------------------------------------------------- one closed dropdown

/** A filter as a closed field: its name, then "Any" or the choice. Opens a panel on click. */
function FilterDropdown({ field, rule, catalog, onChange }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const lookup = useMemo(() => optionLookup(catalog), [catalog]);
  const active = isRuleComplete(rule, field);
  const { text, extra } = valueParts(rule, field, lookup);
  const Panel = field.kind === "enum" || field.kind === "set" ? ListPanel : field.kind === "text" ? TextPanel : RangePanel;
  const labelId = useId();
  const valueId = useId();
  return (
    <div className="min-w-0">
      <p id={labelId} className={`mb-1 truncate text-[11.5px] font-semibold ${active ? "text-sky-700 dark:text-sky-300" : "text-slate-600 dark:text-gray-300"}`} title={field.label}>{field.label}</p>
      <div ref={anchorRef}
        className={`flex h-10 min-w-0 items-center rounded-lg border transition-all ${active ? "border-sky-300 bg-sky-50/70 dark:border-sky-500/50 dark:bg-sky-500/10" : "border-slate-200 bg-white hover:border-slate-300 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"} ${open ? "border-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.15)]" : ""}`}>
        <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={`${labelId} ${valueId}`}
          className={`flex h-full min-w-0 flex-1 items-center gap-2 rounded-lg pl-3 pr-1 text-left text-[12.5px] ${focusRing}`}>
          <span id={valueId} className="flex min-w-0 items-center gap-2">
            <span className={`min-w-0 truncate ${active ? "font-semibold text-sky-900 dark:text-sky-100" : "text-slate-500 dark:text-gray-400"}`}>{text}</span>
            {extra > 0 && <span className="shrink-0 rounded-full bg-sky-600 px-1.5 text-[10.5px] font-bold leading-[18px] text-white" aria-label={`and ${extra} more`}>+{extra}</span>}
          </span>
        </button>
        {active
          ? <button type="button" onClick={() => onChange(null)} aria-label={`Clear ${field.label}`} title="Clear" className={`mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sky-700 hover:bg-sky-100 hover:text-sky-900 dark:text-sky-300 dark:hover:bg-sky-500/20 ${focusRing}`}><X className="h-3.5 w-3.5" /></button>
          : <ChevronDown aria-hidden="true" className={`mr-2.5 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180 text-sky-600" : "text-slate-500"}`} />}
      </div>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={300} maxHeight={440} label={field.label}>
        <Panel field={field} rule={rule} catalog={catalog} onChange={onChange} onDone={() => setOpen(false)} />
      </Popover>
    </div>
  );
}

/**
 * One feature's filters (e.g. Prep Coding, Student details): a closed section that
 * opens into a grid of closed dropdowns. A section with filters set starts open.
 */
function FilterSection({ title, icon: Icon = Users, fields, group, catalog, fieldMap, onChange, defaultOpen = false, flat = false }) {
  const setFields = fields.filter((field) => isRuleComplete(ruleFor(group, field.key), field));
  const [expanded, setExpanded] = useState(() => defaultOpen || setFields.length > 0);
  const [more, setMore] = useState(false);
  // Fields with a value when the section first shows stay visible, even after they are cleared.
  const [pinned] = useState(() => new Set(fields.filter((field) => ruleFor(group, field.key)).map((field) => field.key)));
  const lookup = useMemo(() => optionLookup(catalog), [catalog]);
  const main = fields.filter((field) => isMainField(field) || pinned.has(field.key) || ruleFor(group, field.key));
  const base = main.length ? main : fields.slice(0, 6);
  const shown = more ? fields : base;
  const hidden = fields.length - base.length;
  const summary = groupText({ rules: group.rules.filter((rule) => fields.some((field) => field.key === rule.field)) }, fieldMap, lookup);
  if (!fields.length) return null;
  return (
    <section className={flat ? "border-t border-slate-200 first:border-t-0 dark:border-gray-800" : "rounded-xl border border-slate-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900"}>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
        className={`flex w-full items-center gap-3 rounded-xl text-left ${flat ? "px-1 py-2.5" : "px-4 py-3"} hover:bg-slate-50/70 dark:hover:bg-gray-800/40 ${focusRing}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-slate-900 dark:text-white">{title}</span>
            {setFields.length > 0 && <span className="rounded-full bg-sky-600 px-2 text-[10.5px] font-bold leading-5 text-white">{setFields.length} chosen</span>}
          </span>
          <span className={`block truncate text-[11.5px] ${summary ? "text-slate-700 dark:text-gray-200" : "text-slate-500 dark:text-gray-400"}`}>{summary || `${fields.length} filters · nothing chosen`}</span>
        </span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      {expanded && (
        <div className={flat ? "pb-3" : "border-t border-slate-100 px-4 pb-4 pt-3 dark:border-gray-800"}>
          <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((field) => (
              <FilterDropdown key={field.key} field={field} rule={ruleFor(group, field.key)} catalog={catalog} onChange={(rule) => onChange(setRule(group, field.key, rule))} />
            ))}
          </div>
          {hidden > 0 && (
            <button type="button" onClick={() => setMore(!more)} aria-expanded={more}
              className={`mt-3 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${more ? "rotate-180" : ""}`} />{more ? "Fewer filters" : `${hidden} more filters`}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Everything that describes one group of students: the feature's filters first,
 * then student details. Sections start closed (the first one open when a single
 * feature is chosen); every filter inside starts closed and says "Any".
 */
export function GroupFilters({ group, featureFields = [], studentFields = [], areaLabel, area, catalog, fieldMap, onChange, flat = false }) {
  const map = useMemo(() => fieldMap || new Map(catalog.fields.map((field) => [field.key, field])), [catalog, fieldMap]);
  const areaSections = useMemo(() => {
    const labels = new Map((catalog.areas || []).map((entry) => [entry.key, entry.label]));
    const modules = [...new Set(featureFields.map((field) => field.module))];
    return modules.map((module) => ({ module, title: labels.get(module) || areaLabel, fields: featureFields.filter((field) => field.module === module) }));
  }, [areaLabel, catalog, featureFields]);
  return (
    <div className={flat ? "" : "space-y-2.5"}>
      {areaSections.map((section, index) => (
        <FilterSection key={section.module} title={section.title} icon={AREA_ICONS[section.module] || AREA_ICONS[area]} fields={section.fields} group={group} catalog={catalog} fieldMap={map}
          onChange={onChange} flat={flat} defaultOpen={index === 0 && areaSections.length === 1} />
      ))}
      {studentFields.length > 0 && (
        <FilterSection title="Student details" fields={studentFields} group={group} catalog={catalog} fieldMap={map} onChange={onChange} flat={flat} defaultOpen={!areaSections.length} />
      )}
    </div>
  );
}

/** A group's plain-words summary, for its header. */
export function GroupSummary({ group, fieldMap, catalog }) {
  const text = groupText(group, fieldMap, optionLookup(catalog));
  return <span className={text ? "text-slate-700 dark:text-gray-200" : "text-slate-500 dark:text-gray-400"}>{text || "Nothing chosen yet"}</span>;
}

// ---------------------------------------------------------------- group cards (only when there are two or more groups)

export function GroupCard({ name, group, open, fieldMap, catalog, onOpen, onDuplicate, onRemove, children }) {
  return (
    <section className={`rounded-xl border bg-white dark:bg-gray-900 ${open ? "border-sky-300 shadow-sm dark:border-sky-500/40" : "border-slate-200 dark:border-gray-800"}`}>
      <header className="flex items-start gap-2 px-3.5 py-3">
        <button type="button" onClick={onOpen} aria-expanded={open} className={`flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left ${focusRing}`}>
          <span className={`mt-0.5 flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-bold ${open ? "bg-sky-600 text-white" : "bg-slate-200 text-slate-700 dark:bg-gray-800 dark:text-gray-200"}`}>{name}</span>
          <span className="min-w-0 flex-1 text-[12.5px] leading-5"><GroupSummary group={group} fieldMap={fieldMap} catalog={catalog} /></span>
          <ChevronDown aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <IconButton label={`Copy ${name}`} onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /></IconButton>
        <IconButton label={`Remove ${name}`} onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></IconButton>
      </header>
      {open && <div className="border-t border-slate-100 px-3.5 pb-1 dark:border-gray-800">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------- top / bottom

const SHOW_MODES = [{ value: "everyone", label: "Everyone" }, { value: "top", label: "Top" }, { value: "bottom", label: "Bottom" }];

function RankRow({ rule, metrics, onChange, onRemove, hideDirection = false }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-gray-300">
      {!hideDirection && (
        <select className={`${fieldSelectClass} w-28`} value={rule.direction} aria-label="Top or bottom" onChange={(event) => onChange({ ...rule, direction: event.target.value })}>
          <option value="top">Top</option>
          <option value="bottom">Bottom</option>
        </select>
      )}
      <input type="number" min={1} className={`${fieldClass} w-20`} aria-label="How many" value={rule.value} onChange={(event) => onChange({ ...rule, value: event.target.value })} />
      <select className={`${fieldSelectClass} w-40`} value={rule.unit} aria-label="Students or percent" onChange={(event) => onChange({ ...rule, unit: event.target.value })}>
        <option value="count">students</option>
        <option value="percent">% of students</option>
      </select>
      by
      <select className={`${fieldSelectClass} min-w-[200px]`} value={rule.metric} aria-label="Ranked by" onChange={(event) => onChange({ ...rule, metric: event.target.value })}>
        {metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
      </select>
      {onRemove && <IconButton label="Remove this rule" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></IconButton>}
    </div>
  );
}

/** "Show: Everyone | Top | Bottom", then how many and by what. Extra lists are optional. */
export function RankEditor({ rank, metrics, defaultMetric, onChange }) {
  const [first, ...others] = rank.rules;
  const mode = first ? first.direction : "everyone";
  const setRules = (rules) => onChange({ ...rank, rules });
  const pickMode = (next) => {
    if (next === "everyone") setRules([]);
    else setRules([{ ...(first || newRankRule(defaultMetric || metrics[0]?.key)), direction: next }, ...others]);
  };
  if (!metrics.length) return <p className="text-[12px] text-slate-500">Pick a feature to rank students by its measures.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-semibold text-slate-600 dark:text-gray-300">Show</span>
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Who to show">
          {SHOW_MODES.map((entry) => (
            <button key={entry.value} type="button" aria-pressed={mode === entry.value} onClick={() => pickMode(entry.value)}
              className={`${TOGGLE} px-3 ${mode === entry.value ? TOGGLE_ON : TOGGLE_OFF} ${focusRing}`}>{entry.label}</button>
          ))}
        </div>
      </div>
      {first && <RankRow rule={first} metrics={metrics} hideDirection onChange={(rule) => setRules([rule, ...others])} />}
      {others.map((rule) => (
        <div key={rule.id} className="space-y-1">
          <p className="text-[11.5px] text-slate-500 dark:text-gray-400">Also:</p>
          <RankRow rule={rule} metrics={metrics} onChange={(next) => setRules(rank.rules.map((entry) => (entry.id === rule.id ? next : entry)))} onRemove={() => setRules(rank.rules.filter((entry) => entry.id !== rule.id))} />
        </div>
      ))}
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600 dark:text-gray-300">
          Keep students who are in
          <span className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-gray-800" role="group" aria-label="Combine lists">
            {[{ value: "and", label: "all of these lists" }, { value: "or", label: "any of these lists" }].map((entry) => (
              <button key={entry.value} type="button" aria-pressed={rank.join === entry.value} onClick={() => onChange({ ...rank, join: entry.value })}
                className={`${TOGGLE} ${rank.join === entry.value ? TOGGLE_ON : TOGGLE_OFF} ${focusRing}`}>{entry.label}</button>
            ))}
          </span>
        </div>
      )}
      {first && rank.rules.length < MAX_RANK_RULES && (
        <button type="button" onClick={() => setRules([...rank.rules, newRankRule(defaultMetric || metrics[0].key)])}
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
          <Plus className="h-3.5 w-3.5" />Add another top / bottom list
        </button>
      )}
    </div>
  );
}
