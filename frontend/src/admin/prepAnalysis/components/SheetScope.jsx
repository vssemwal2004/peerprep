import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, Layers, Loader2, Search, X } from "lucide-react";
import { useAnalysisApi } from "../analysisScope";
import { MAX_SHEETS } from "../filterModel";
import { Button, Popover, Segmented, focusRing } from "./ui";

const SEARCH_DELAY_MS = 220;
const CHIPS_SHOWN = 3;

/**
 * Sheets from the server, searched by title. The list comes most-started first and is capped (60), so
 * with thousands of sheets the admin types to find the rest. Results are kept per search for this visit.
 */
function useSheetOptions(query) {
  const api = useAnalysisApi();
  const cache = useRef(new Map());
  const key = query.trim().toLowerCase();
  const [result, setResult] = useState({ key: null, options: [], total: null, failed: false });
  useEffect(() => {
    if (cache.current.has(key)) { setResult(cache.current.get(key)); return undefined; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api.options("sheets", key, controller.signal)
        .then((response) => {
          const next = { key, options: response.options || [], total: response.total ?? (response.options || []).length, failed: false };
          cache.current.set(key, next);
          setResult(next);
        })
        .catch((error) => { if (error.name !== "AbortError") setResult({ key, options: [], total: null, failed: true }); });
    }, key ? SEARCH_DELAY_MS : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, key]);
  return { ...result, loading: result.key !== key, everySheet: cache.current.get("")?.total ?? null };
}

function SheetRow({ title, hint, count, checked, onToggle }) {
  return (
    <li>
      <button type="button" role="option" aria-selected={checked} onClick={onToggle}
        className={`flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.05] ${checked ? "bg-sky-50/70 dark:bg-sky-500/[0.08]" : ""} ${focusRing}`}>
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-white/20"}`}>
          {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{title}</span>
          {hint && <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{hint}</span>}
        </span>
        {count != null && (
          <span className="shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-slate-500 dark:text-slate-400" title={`${count} student${count === 1 ? "" : "s"} started this sheet`}>
            <b className="text-slate-800 dark:text-slate-200">{count.toLocaleString()}</b> started
          </span>
        )}
      </button>
    </li>
  );
}

/** The chooser itself: works on a draft and only changes the page on "Show". */
function SheetChooser({ value, onApply, onClose }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [draft, setDraft] = useState(() => new Map(value.map((sheet) => [sheet.id, sheet.title])));
  const { options, total, loading, failed, everySheet } = useSheetOptions(tab === "all" ? query : "");
  const needle = query.trim().toLowerCase();
  const chosen = useMemo(() => [...draft].map(([id, title]) => ({ id, title })), [draft]);
  const chosenShown = needle ? chosen.filter((sheet) => sheet.title.toLowerCase().includes(needle)) : chosen;
  const full = draft.size >= MAX_SHEETS;

  const toggle = (id, title) => setDraft((current) => {
    const next = new Map(current);
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_SHEETS) next.set(id, title);
    return next;
  });
  const listed = tab === "all" ? options : [];
  const allListedChosen = listed.length > 0 && listed.every((option) => draft.has(String(option.value)));
  const toggleListed = () => setDraft((current) => {
    const next = new Map(current);
    if (allListedChosen) listed.forEach((option) => next.delete(String(option.value)));
    else for (const option of listed) { if (next.size >= MAX_SHEETS) break; next.set(String(option.value), option.label); }
    return next;
  });
  const apply = (list) => { onApply(list); onClose(); };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-slate-200 p-3 dark:border-gray-700">
        <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 focus-within:border-sky-400 dark:border-gray-700 dark:bg-white/[0.03]">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sheets by name…" aria-label="Search sheets"
            className="h-9 w-full bg-transparent text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100" />
          {loading && tab === "all" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-400" />}
          {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
        </label>
        <div className="flex items-center justify-between gap-2">
          <Segmented label="Which sheets to list" value={tab} onChange={setTab}
            options={[{ value: "all", label: everySheet != null ? `All sheets (${everySheet.toLocaleString()})` : "All sheets" }, { value: "chosen", label: `Selected (${draft.size})` }]} />
          {tab === "all" && listed.length > 0 && (
            <button type="button" onClick={toggleListed} disabled={!allListedChosen && full} className="text-[11.5px] font-semibold text-sky-700 hover:underline disabled:opacity-50 dark:text-sky-300">
              {allListedChosen ? "Untick these" : needle ? `Tick all ${listed.length} found` : `Tick these ${listed.length}`}
            </button>
          )}
        </div>
      </div>

      <ul role="listbox" aria-multiselectable="true" aria-label="Sheets" className="min-h-[120px] flex-1 overflow-y-auto p-1.5">
        {tab === "all" ? (
          <>
            {listed.map((option) => (
              <SheetRow key={option.value} title={option.label} hint={option.hint} count={option.count}
                checked={draft.has(String(option.value))} onToggle={() => toggle(String(option.value), option.label)} />
            ))}
            {!listed.length && !loading && (
              <li className="px-3 py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
                {failed ? "Sheets could not be loaded. Close and try again." : needle ? `No sheet matches “${query.trim()}”.` : "No published sheets yet."}
              </li>
            )}
            {total != null && total > listed.length && (
              <li className="px-3 py-2 text-center text-[11px] text-slate-500 dark:text-slate-400">
                Showing {listed.length} of {total.toLocaleString()} sheets{needle ? "" : ", most started first"}. Type a name to find the rest.
              </li>
            )}
          </>
        ) : (
          <>
            {chosenShown.map((sheet) => <SheetRow key={sheet.id} title={sheet.title} checked onToggle={() => toggle(sheet.id, sheet.title)} />)}
            {!chosenShown.length && (
              <li className="px-3 py-6 text-center text-[12px] text-slate-500 dark:text-slate-400">
                {draft.size ? `No selected sheet matches “${query.trim()}”.` : "Nothing selected: the analysis uses every sheet."}
              </li>
            )}
          </>
        )}
      </ul>

      {full && <p className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">Up to {MAX_SHEETS} sheets can be chosen. For more, use All sheets.</p>}
      <footer className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-white/[0.02]">
        <span className="text-[11.5px] text-slate-600 dark:text-slate-300">
          {draft.size ? <><b className="tabular-nums text-slate-900 dark:text-white">{draft.size}</b> selected</> : "Every sheet"}
        </span>
        {draft.size > 0 && <button type="button" onClick={() => setDraft(new Map())} className="text-[11.5px] font-semibold text-slate-500 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-white">Clear</button>}
        <div className="ml-auto flex gap-2">
          <Button tone="ghost" onClick={onClose}>Cancel</Button>
          <Button tone="primary" onClick={() => apply(chosen)}>{draft.size ? `Show ${draft.size} sheet${draft.size === 1 ? "" : "s"}` : "Show all sheets"}</Button>
        </div>
      </footer>
    </div>
  );
}

/**
 * Quick Prep: which sheets the page analyses. Default is every sheet; the admin can pick one, several
 * or all, searching by name (there can be thousands). Every KPI, chart, drill, the table and
 * downloads use the choice. `applied` is what the server used ({ id, title }[] or null).
 */
export default function SheetScope({ value = [], applied, loading, onChange, compact = false }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const appliedIds = useMemo(() => new Set((applied || []).map((sheet) => sheet.id)), [applied]);
  // Chosen sheets the server no longer knows (deleted or unpublished) are shown as missing.
  const missing = !loading && applied !== undefined && value.length ? value.filter((sheet) => !appliedIds.has(sheet.id)) : [];
  const remove = (id) => onChange(value.filter((sheet) => sheet.id !== id));
  const label = value.length === 0 ? "All sheets" : value.length === 1 ? value[0].title : `${value.length} sheets`;

  // On the filter line: one picker button ("Sheets: All ▾" / "Sheets: DSA Basics ×"); the chosen
  // list is in the picker, and a warning icon says when a chosen sheet is gone.
  if (compact) {
    const missingText = missing.length === value.length
      ? "The chosen sheets are no longer published, so every sheet is shown."
      : `${missing.length} chosen sheet${missing.length === 1 ? " is" : "s are"} no longer published and left out.`;
    return (
      <span ref={anchorRef} className={`inline-flex h-8 min-w-0 max-w-[300px] shrink-0 items-center rounded-lg border text-[12px] transition-colors ${value.length
        ? "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-500/50 dark:bg-sky-500/10 dark:text-sky-100"
        : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-slate-100 dark:hover:bg-white/[0.06]"}`}>
        <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open}
          title={value.length ? `Only these sheets are analysed: ${value.map((sheet) => sheet.title).join(", ")}` : "Every sheet is analysed. Choose sheets"}
          className={`flex h-full min-w-0 items-center gap-1.5 rounded-lg pl-2.5 ${value.length ? "pr-1" : "pr-2"} ${focusRing}`}>
          <Layers className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
          <span className={`shrink-0 ${value.length ? "font-medium text-sky-700 dark:text-sky-300" : "font-semibold"}`}>Sheets:</span>
          <span className="min-w-0 truncate font-semibold">{value.length ? label : "All"}</span>
          {!value.length && <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />}
        </button>
        {missing.length > 0 && <span title={missingText} aria-label={missingText} className="inline-flex h-6 w-5 shrink-0 items-center justify-center text-amber-600 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" /></span>}
        {value.length > 0 && (
          <button type="button" onClick={() => onChange([])} aria-label="Analyse every sheet" title="Back to all sheets"
            className={`mr-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-500/20 ${focusRing}`}><X className="h-3 w-3" /></button>
        )}
        <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={420} maxHeight={520} label="Choose sheets">
          <SheetChooser value={value} onApply={onChange} onClose={() => setOpen(false)} />
        </Popover>
      </span>
    );
  }

  return (
    <section aria-label="Quick Prep sheets" className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Layers className="h-4 w-4" /></span>
      <div className="mr-1 hidden min-w-0 sm:block">
        <p className="text-[12.5px] font-bold leading-4 text-slate-900 dark:text-white">Sheets</p>
        <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{value.length ? "Only these are analysed" : "Every sheet is analysed"}</p>
      </div>
      <span ref={anchorRef} className="inline-flex min-w-0 max-w-full">
        <button type="button" onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open}
          className={`inline-flex h-9 min-w-0 max-w-[280px] items-center gap-2 rounded-lg border px-3 text-[12.5px] font-semibold transition-colors ${value.length ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-200" : "border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50 dark:border-gray-700 dark:bg-white/[0.03] dark:text-slate-100 dark:hover:bg-white/[0.06]"} ${focusRing}`}>
          <span className="truncate">{label}</span>
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </span>
      {value.length > 1 && (
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {value.slice(0, CHIPS_SHOWN).map((sheet) => (
            <span key={sheet.id} className={`inline-flex h-7 max-w-[200px] items-center gap-1 rounded-full border pl-2.5 pr-1 text-[11.5px] font-medium ${appliedIds.has(sheet.id) || loading || applied === undefined ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-gray-700 dark:bg-white/[0.04] dark:text-slate-200" : "border-amber-300 bg-amber-50 text-amber-800 line-through dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"}`}>
              <span className="truncate">{sheet.title}</span>
              <button type="button" onClick={() => remove(sheet.id)} aria-label={`Remove ${sheet.title}`} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X className="h-3 w-3" /></button>
            </span>
          ))}
          {value.length > CHIPS_SHOWN && (
            <button type="button" onClick={() => setOpen(true)} className="inline-flex h-7 items-center rounded-full border border-dashed border-slate-300 px-2.5 text-[11.5px] font-semibold text-slate-600 hover:border-sky-400 hover:text-sky-700 dark:border-gray-600 dark:text-slate-300">
              +{value.length - CHIPS_SHOWN} more
            </button>
          )}
        </div>
      )}
      {value.length > 0 && <Button tone="ghost" size="sm" onClick={() => onChange([])}><X className="h-3.5 w-3.5" />All sheets</Button>}
      {missing.length > 0 && (
        <p className="flex basis-full items-center gap-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {missing.length === value.length
            ? "The chosen sheets are no longer published, so every sheet is shown."
            : `${missing.length} chosen sheet${missing.length === 1 ? " is" : "s are"} no longer published and left out.`}
        </p>
      )}
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={420} maxHeight={520} label="Choose sheets">
        <SheetChooser value={value} onApply={onChange} onClose={() => setOpen(false)} />
      </Popover>
    </section>
  );
}
