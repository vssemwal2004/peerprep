import { useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, FolderPlus, MoreHorizontal, Plus, Search, Trash2 } from "lucide-react";
import {
  MAX_GROUP_DEPTH, MAX_RANK_RULES, OPERATORS, addChild, defaultValue, duplicateNode, newGroup, newRankRule, newRule, removeNode, updateNode,
} from "../filterModel";
import { IconButton, OptionPicker, Popover, focusRing, inputClass, selectClass } from "./ui";

const optionSource = (key, catalog) => (catalog.staticOptions?.[key] ? { staticOptions: catalog.staticOptions[key] } : { list: key });
const compactSelect = `${selectClass} w-auto min-w-0`;
const JOIN_WIDTH = "w-[68px] shrink-0";

// ---------------------------------------------------------------- pickers

/** A searchable list of fields under plain headings (e.g. "Prep Coding · Results"). */
function FieldPicker({ fields, value, onChange, moduleLabel }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const anchorRef = useRef(null);
  const selected = fields.find((field) => field.key === value);
  const needle = query.trim().toLowerCase();
  const heading = (field) => `${moduleLabel(field.module)} · ${field.group}`;
  const visible = fields.filter((field) => !needle || `${field.label} ${heading(field)}`.toLowerCase().includes(needle));
  const headings = [...new Set(visible.map(heading))];
  const close = () => { setOpen(false); setQuery(""); };
  return (
    <>
      <button ref={anchorRef} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className={`flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border bg-white px-2.5 text-left text-[12px] transition-colors hover:border-slate-300 dark:bg-gray-900 dark:hover:border-gray-600 ${selected ? "border-slate-200 font-semibold text-slate-800 dark:border-gray-700 dark:text-gray-100" : "border-dashed border-sky-300 text-sky-700 dark:border-sky-500/40 dark:text-sky-300"} ${focusRing}`}>
        <span className="truncate">{selected?.label || "Choose a field"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      <Popover open={open} anchorRef={anchorRef} onClose={close} minWidth={280} maxHeight={420} label="Choose a field">
        <div className="shrink-0 border-b border-slate-100 p-2 dark:border-gray-800">
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 dark:border-gray-700">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search fields…" aria-label="Search fields"
              className="h-8 w-full bg-transparent text-[12px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-gray-100" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {headings.map((title) => (
            <div key={title} className="pb-1">
              <p className="px-2 pb-0.5 pt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
              {visible.filter((field) => heading(field) === title).map((field) => (
                <button key={field.key} type="button" onClick={() => { onChange(field); close(); }}
                  className={`flex w-full rounded-md px-2 py-1.5 text-left text-[12.5px] ${field.key === value ? "bg-sky-50 font-semibold text-sky-800 dark:bg-sky-500/10 dark:text-sky-200" : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-800"} ${focusRing}`}>
                  {field.label}
                </button>
              ))}
            </div>
          ))}
          {!headings.length && <p className="px-2 py-6 text-center text-[12px] text-slate-400">No field called “{query}”.</p>}
        </div>
      </Popover>
    </>
  );
}

function ValueEditor({ field, rule, catalog, onChange }) {
  if (!field) return <div className={`${inputClass} flex items-center text-slate-400`}>Choose a field first</div>;
  const unit = field.kind === "percent" ? "%" : field.unit && field.unit !== "/ 100" ? field.unit : "";
  if (field.kind === "enum" || field.kind === "set") {
    return (
      <OptionPicker {...optionSource(field.options, catalog)} value={Array.isArray(rule.value) ? rule.value : []} labels={rule.labels} placeholder="Choose values…"
        onChange={(value, labels) => onChange({ value, labels })} />
    );
  }
  if (field.kind === "text") {
    return <input className={inputClass} value={rule.value} maxLength={120} placeholder="Type text…" onChange={(event) => onChange({ value: event.target.value })} />;
  }
  const box = (value, set, label) => (
    <span className="relative min-w-0 flex-1">
      <input type="number" min={0} inputMode="decimal" aria-label={label} className={`${inputClass} ${unit ? "pr-11" : ""}`} value={value} placeholder="0" onChange={(event) => set(event.target.value)} />
      {unit && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">{unit}</span>}
    </span>
  );
  if (rule.operator === "between") {
    const [low, high] = Array.isArray(rule.value) ? rule.value : ["", ""];
    return (
      <div className="flex items-center gap-1.5">
        {box(low, (next) => onChange({ value: [next, high] }), "From")}
        <span className="text-[11.5px] text-slate-400">and</span>
        {box(high, (next) => onChange({ value: [low, next] }), "To")}
      </div>
    );
  }
  return box(rule.value, (next) => onChange({ value: next }), field.label);
}

function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  return (
    <>
      <span ref={anchorRef} className="inline-flex"><IconButton label="More" onClick={() => setOpen(true)}><MoreHorizontal className="h-4 w-4" /></IconButton></span>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={190} label="Actions">
        <div className="p-1">
          {items.filter(Boolean).map(({ label, icon: Icon, onClick, danger }) => (
            <button key={label} type="button" onClick={() => { setOpen(false); onClick(); }}
              className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12px] font-medium ${danger ? "text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10" : "text-slate-700 hover:bg-slate-100 dark:text-gray-200 dark:hover:bg-gray-800"} ${focusRing}`}>
              <Icon className="h-3.5 w-3.5 opacity-70" />{label}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

// ---------------------------------------------------------------- one condition

function RuleRow({ rule, fields, fieldMap, catalog, moduleLabel, onChange, onRemove, onDuplicate, onWrap, canWrap }) {
  const field = fieldMap.get(rule.field);
  const [onlyOpen, setOnlyOpen] = useState(Object.values(rule.qualifiers || {}).some((values) => values?.length));
  const qualifierSet = field?.qualifiers ? catalog.qualifiers?.[field.qualifiers] || {} : {};
  const operators = field ? OPERATORS[field.kind] || [] : [];
  const setOperator = (operator) => {
    const keepList = Array.isArray(rule.value) && ["anyOf", "noneOf", "allOf"].includes(operator);
    onChange({ ...rule, operator, value: keepList ? rule.value : defaultValue(operator) });
  };
  return (
    <div className="min-w-0 flex-1">
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-[minmax(130px,1.1fr)_auto_minmax(150px,1.4fr)_auto] sm:items-center">
        <FieldPicker fields={fields} value={rule.field} moduleLabel={moduleLabel}
          onChange={(next) => onChange({ ...newRule(next), id: rule.id })} />
        <select className={compactSelect} disabled={!field} value={rule.operator} aria-label="Condition" onChange={(event) => setOperator(event.target.value)}>
          {!field && <option value="">—</option>}
          {operators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}
        </select>
        <ValueEditor field={field} rule={rule} catalog={catalog} onChange={(patch) => onChange({ ...rule, ...patch })} />
        <div className="flex items-center justify-end">
          <IconButton label="Delete condition" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></IconButton>
          <RowMenu items={[
            { label: "Duplicate", icon: Copy, onClick: onDuplicate },
            canWrap && { label: "Turn into a group", icon: FolderPlus, onClick: onWrap },
            Object.keys(qualifierSet).length > 0 && { label: onlyOpen ? "Count everything" : "Count only some…", icon: Plus, onClick: () => { if (onlyOpen) onChange({ ...rule, qualifiers: {} }); setOnlyOpen(!onlyOpen); } },
          ]} />
        </div>
      </div>
      {onlyOpen && Object.keys(qualifierSet).length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11.5px] text-slate-600 dark:bg-gray-800/60 dark:text-gray-300">
          <span className="font-semibold">Count only</span>
          {Object.entries(qualifierSet).map(([key, definition]) => (
            <span key={key} className="flex min-w-[150px] flex-1 items-center gap-1.5">
              <span className="shrink-0 text-slate-500">{definition.label}</span>
              <OptionPicker compact {...optionSource(definition.options, catalog)} value={rule.qualifiers?.[key] || []} placeholder="All"
                onChange={(next) => onChange({ ...rule, qualifiers: { ...rule.qualifiers, [key]: next } })} />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- groups

function JoinCell({ index, join, onJoin }) {
  if (index === 0) return <span className={`${JOIN_WIDTH} pt-2 text-[11.5px] font-semibold text-slate-500 dark:text-gray-400`}>Where</span>;
  if (index === 1) {
    return (
      <select value={join} onChange={(event) => onJoin(event.target.value)} aria-label="Join with" title="AND: students must match every condition. OR: students may match any one."
        className={`${JOIN_WIDTH} h-8 rounded-lg border border-slate-200 bg-white px-1.5 text-[11.5px] font-bold text-sky-700 dark:border-gray-700 dark:bg-gray-900 dark:text-sky-300 ${focusRing}`}>
        <option value="and">AND</option>
        <option value="or">OR</option>
      </select>
    );
  }
  return <span className={`${JOIN_WIDTH} pl-2 pt-2 text-[11.5px] font-bold text-slate-400`}>{join === "or" ? "OR" : "AND"}</span>;
}

const GROUP_NAMES = ["", "Group", "Sub-group", "Sub-sub-group"];

function GroupBody({ group, depth, root, setRoot, fields, fieldMap, catalog, moduleLabel, emptyText }) {
  const set = (id, fn) => setRoot(updateNode(root, id, fn));
  const canNest = depth < MAX_GROUP_DEPTH;
  return (
    <div className="space-y-2">
      {!group.children.length && <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-[11.5px] text-slate-400 dark:border-gray-700">{emptyText}</p>}
      {group.children.map((child, index) => (
        <div key={child.id} className="flex items-start gap-2">
          <JoinCell index={index} join={group.join} onJoin={(join) => set(group.id, (node) => ({ ...node, join }))} />
          {child.type === "rule" ? (
            <RuleRow rule={child} fields={fields} fieldMap={fieldMap} catalog={catalog} moduleLabel={moduleLabel} canWrap={canNest}
              onChange={(next) => set(child.id, () => next)}
              onRemove={() => setRoot(removeNode(root, child.id))}
              onDuplicate={() => setRoot(duplicateNode(root, child.id))}
              onWrap={() => set(child.id, (node) => newGroup("and", [node]))} />
          ) : (
            <div className={`min-w-0 flex-1 rounded-xl border p-2.5 ${depth % 2 ? "border-slate-200 bg-slate-50/80 dark:border-gray-700 dark:bg-gray-800/40" : "border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900"}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-gray-400">{GROUP_NAMES[depth + 1] || "Group"}</span>
                <select value={child.negate ? "exclude" : "include"} onChange={(event) => set(child.id, (node) => ({ ...node, negate: event.target.value === "exclude" }))} aria-label="Keep or leave out"
                  className={`h-7 rounded-md border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 ${focusRing}`}>
                  <option value="include">Keep students who match</option>
                  <option value="exclude">Leave out students who match</option>
                </select>
                <div className="ml-auto flex items-center">
                  <IconButton label="Delete group" onClick={() => setRoot(removeNode(root, child.id))}><Trash2 className="h-3.5 w-3.5" /></IconButton>
                  <RowMenu items={[{ label: "Duplicate group", icon: Copy, onClick: () => setRoot(duplicateNode(root, child.id)) }]} />
                </div>
              </div>
              <GroupBody group={child} depth={depth + 1} root={root} setRoot={setRoot} fields={fields} fieldMap={fieldMap} catalog={catalog} moduleLabel={moduleLabel} emptyText="Add a condition to this group." />
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5 pl-[76px]">
        <button type="button" onClick={() => setRoot(addChild(root, group.id, newRule()))}
          className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
          <Plus className="h-3.5 w-3.5" />Add condition
        </button>
        {canNest && (
          <button type="button" onClick={() => setRoot(addChild(root, group.id, newGroup("or", [newRule()])))}
            className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-slate-600 hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-gray-800 ${focusRing}`}>
            <FolderPlus className="h-3.5 w-3.5" />Add {GROUP_NAMES[depth + 1]?.toLowerCase() || "group"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Conditions joined with AND / OR, with groups inside groups (two levels):
 * "Where Semester is 5 AND (Branch is CSE OR Branch is IT)".
 */
export function ConditionBuilder({ group, onChange, fields, fieldMap, catalog, emptyText = "No conditions yet: every student is included." }) {
  const moduleLabels = useMemo(() => new Map([
    ["student", "Student"],
    ...(catalog.areas || []).map((area) => [area.key, area.label]),
  ]), [catalog]);
  const moduleLabel = (key) => moduleLabels.get(key) || key;
  return (
    <GroupBody group={group} depth={1} root={group} setRoot={onChange} fields={fields} fieldMap={fieldMap} catalog={catalog} moduleLabel={moduleLabel} emptyText={emptyText} />
  );
}

// ---------------------------------------------------------------- top / bottom rules

/** Admin-made rules such as "Top 10% by Prep Score AND Bottom 20 by Accuracy". */
export function RankBuilder({ rank, metrics, defaultMetric, onChange }) {
  const set = (id, patch) => onChange({ ...rank, rules: rank.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)) });
  return (
    <div className="space-y-2">
      {!rank.rules.length && <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2.5 text-[11.5px] text-slate-400 dark:border-gray-700">No rule: every student who matches the filters is shown.</p>}
      {rank.rules.map((rule, index) => (
        <div key={rule.id} className="flex items-start gap-2">
          <JoinCell index={index} join={rank.join} onJoin={(join) => onChange({ ...rank, join })} />
          <div className="grid min-w-0 flex-1 grid-cols-[auto_80px_auto] items-center gap-1.5 sm:grid-cols-[auto_80px_auto_auto_minmax(140px,1fr)_auto]">
            <select className={compactSelect} value={rule.direction} aria-label="Top or bottom" onChange={(event) => set(rule.id, { direction: event.target.value })}>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
            <input type="number" min={1} max={rule.unit === "percent" ? 100 : undefined} className={inputClass} aria-label="How many" value={rule.value} onChange={(event) => set(rule.id, { value: event.target.value })} />
            <select className={compactSelect} value={rule.unit} aria-label="Students or percent" onChange={(event) => set(rule.id, { unit: event.target.value })}>
              <option value="count">students</option>
              <option value="percent">% of students</option>
            </select>
            <span className="text-[11.5px] text-slate-500">by</span>
            <select className={selectClass} value={rule.metric} aria-label="Ranked by" onChange={(event) => set(rule.id, { metric: event.target.value })}>
              {metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
            </select>
            <IconButton label="Delete rule" onClick={() => onChange({ ...rank, rules: rank.rules.filter((entry) => entry.id !== rule.id) })}><Trash2 className="h-3.5 w-3.5" /></IconButton>
          </div>
        </div>
      ))}
      {rank.rules.length < MAX_RANK_RULES && metrics.length > 0 && (
        <div className="pl-[76px]">
          <button type="button" onClick={() => onChange({ ...rank, rules: [...rank.rules, newRankRule(defaultMetric || metrics[0].key)] })}
            className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
            <Plus className="h-3.5 w-3.5" />Add a top / bottom rule
          </button>
        </div>
      )}
    </div>
  );
}
