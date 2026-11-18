import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, UserRound, X } from "lucide-react";
import { api } from "../../utils/api";

const splitIds = (value) => String(value || "").split(",").map((id) => id.trim()).filter(Boolean);

/**
 * Teacher ID(s) for a new student: a searchable list of the coordinators that exist (never a
 * free-typed ID), pick one or more. Searching happens on the server, so it stays fast with many
 * coordinators. `value` / `onChange` use the comma-separated form the server takes ("C01,C02").
 * An own-data coordinator can only choose their own Teacher ID, which is picked for them.
 */
export default function TeacherPicker({ value, onChange, id }) {
  const ids = splitIds(value);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState({ loading: true, teachers: [], total: 0, ownOnly: false, error: "" });
  // Every coordinator seen so far, so a chip keeps its name after the search changes.
  const [known, setKnown] = useState(() => new Map());
  const boxRef = useRef(null);
  const searchRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    let active = true;
    setResult((current) => ({ ...current, loading: true, error: "" }));
    const timer = setTimeout(() => {
      api.listTeacherOptions(search.trim())
        .then((data) => {
          if (!active) return;
          const teachers = data?.teachers || [];
          setResult({ loading: false, teachers, total: data?.total || teachers.length, ownOnly: Boolean(data?.ownOnly), error: "" });
          setKnown((current) => { const next = new Map(current); teachers.forEach((teacher) => next.set(teacher.id, teacher)); return next; });
        })
        .catch((error) => { if (active) setResult((current) => ({ ...current, loading: false, error: error.message || "Could not load Teacher IDs" })); });
    }, search ? 250 : 0);
    return () => { active = false; clearTimeout(timer); };
  }, [search]);

  // Own-data coordinator: their own Teacher ID is the only one allowed, so choose it for them.
  const onlyOwn = result.ownOnly && result.teachers.length === 1 ? result.teachers[0].id : null;
  useEffect(() => {
    if (onlyOwn && !value) onChange(onlyOwn);
  }, [onlyOwn, value, onChange]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!boxRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    searchRef.current?.focus();
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  const toggle = (teacherId) => onChange((ids.includes(teacherId) ? ids.filter((entry) => entry !== teacherId) : [...ids, teacherId]).join(","));
  const remove = (teacherId) => onChange(ids.filter((entry) => entry !== teacherId).join(","));

  return (
    <div ref={boxRef} className="relative" onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <div id={id} role="combobox" aria-expanded={open} aria-controls={listId} aria-haspopup="listbox" tabIndex={0}
        onClick={() => setOpen(true)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}
        className={`flex min-h-[38px] w-full cursor-pointer flex-wrap items-center gap-1 rounded-lg border bg-white py-1 pl-2 pr-8 text-sm text-slate-900 transition-all duration-200 dark:bg-gray-800 dark:text-gray-100 ${open ? "border-transparent ring-1 ring-sky-500" : "border-slate-300 dark:border-gray-600"} focus:outline-none focus:ring-1 focus:ring-sky-500`}>
        {ids.length ? ids.map((teacherId) => (
          <span key={teacherId} className="inline-flex max-w-full items-center gap-1 rounded-md bg-sky-50 py-0.5 pl-1.5 pr-0.5 text-xs font-medium text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">
            <span className="truncate">{known.get(teacherId)?.name || teacherId}</span>
            <span className="font-mono text-[10.5px] text-sky-600/80 dark:text-sky-300/80">{teacherId}</span>
            {!(result.ownOnly && teacherId === onlyOwn) && (
              <button type="button" aria-label={`Remove ${teacherId}`} onClick={(event) => { event.stopPropagation(); remove(teacherId); }}
                className="rounded p-0.5 hover:bg-sky-100 dark:hover:bg-sky-500/20"><X className="h-3 w-3" /></button>
            )}
          </span>
        )) : <span className="px-0.5 text-slate-400 dark:text-gray-500">Select Teacher ID(s)</span>}
        <ChevronDown className={`pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 min-w-[260px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
          <label className="flex items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-gray-700">
            <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
            <span className="sr-only">Search coordinators</span>
            <input ref={searchRef} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or Teacher ID"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-gray-100 [&::-webkit-search-cancel-button]:hidden" />
            {result.loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-500" aria-hidden="true" />}
          </label>
          <ul id={listId} role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto py-1">
            {result.teachers.map((teacher) => {
              const picked = ids.includes(teacher.id);
              return (
                <li key={teacher.id} role="option" aria-selected={picked}>
                  <button type="button" onClick={() => toggle(teacher.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm focus:outline-none ${picked ? "bg-sky-50 dark:bg-sky-500/10" : "hover:bg-slate-50 focus:bg-slate-50 dark:hover:bg-gray-700/60 dark:focus:bg-gray-700/60"}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${picked ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 dark:border-gray-500"}`}>{picked && <Check className="h-3 w-3" />}</span>
                    <UserRound className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900 dark:text-gray-100">{teacher.name}</span>
                      {teacher.department && <span className="block truncate text-xs text-slate-500 dark:text-gray-400">{teacher.department}</span>}
                    </span>
                    {!teacher.active && <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Inactive</span>}
                    <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-gray-400">{teacher.id}</span>
                  </button>
                </li>
              );
            })}
            {!result.loading && !result.error && !result.teachers.length && (
              <li className="px-3 py-4 text-center text-xs text-slate-500 dark:text-gray-400">
                {search ? `No coordinator matches “${search}”.` : "No coordinators yet. Add coordinators first, then pick their Teacher ID here."}
              </li>
            )}
            {result.error && <li className="px-3 py-3 text-center text-xs text-rose-600 dark:text-rose-400">{result.error}</li>}
          </ul>
          {result.total > result.teachers.length && (
            <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-gray-700 dark:text-gray-400">
              Showing {result.teachers.length} of {result.total.toLocaleString()}. Type to find others.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
