import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";
import { useDebounced } from "../useRemote";
import { FieldLabel, FieldMessage, inputBase } from "./controls";

const keyOf = (value) => String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
const MAX_SHOWN = 60;

// Searchable single choice with an "Add" option: suggestions come from `loadOptions(search)`. Picking,
// adding (when `creatable`) and clearing all go through `onSelect(name, { isNew })`, which may be async
// (it saves a new name, or resolves a company id); while it runs the list stays open with a spinner.
// Typed text that is neither picked nor added is discarded on blur, so the value is always a listed name.
export function ComboField({
  label,
  field,
  value,
  onSelect,
  loadOptions,
  creatable = true,
  required,
  optional,
  hint,
  error,
  placeholder,
  disabled,
  addLabel = "Add",
}) {
  const id = useId(),
    listId = useId(),
    hintId = useId(),
    errorId = useId();
  const inputRef = useRef(null);
  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const search = useDebounced(text, 200);

  useEffect(() => {
    if (!open) setText(value || "");
  }, [value, open]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    Promise.resolve()
      .then(() => loadOptions(search === value ? "" : search))
      .then((names) => {
        if (alive) setOptions(Array.isArray(names) ? names : []);
      })
      .catch(() => {
        if (alive) setOptions([]);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // loadOptions is an inline function; the search text and open state identify the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, search]);

  const query = keyOf(text === value ? "" : text);
  const seen = new Set();
  const matches = [];
  for (const name of options) {
    const key = keyOf(name);
    if (!key || seen.has(key) || (query && !key.includes(query))) continue;
    seen.add(key);
    matches.push(name);
  }
  // Names that start with the search come first; the rest keep the source order.
  const rank = (name) => (keyOf(name).startsWith(query) ? 0 : 1);
  if (query) matches.sort((a, b) => rank(a) - rank(b));
  const shown = matches.slice(0, MAX_SHOWN);
  const trimmed = text.trim().replace(/\s+/g, " ");
  const canAdd = Boolean(creatable && query && trimmed.length >= 2 && !seen.has(query));
  const items = [...shown.map((name) => ({ kind: "pick", name })), ...(canAdd ? [{ kind: "add", name: trimmed }] : [])];

  const close = () => {
    setOpen(false);
    setFailure("");
    setText(value || "");
  };
  const choose = async (item) => {
    if (!item || busy) return;
    setFailure("");
    setBusy(true);
    try {
      await onSelect(item.name, { isNew: item.kind === "add" });
      setOpen(false);
    } catch (err) {
      setFailure(err?.message || `Could not ${item.kind === "add" ? "add" : "select"} “${item.name}”.`);
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) return setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) => (items.length ? (index + step + items.length) % items.length : 0));
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      choose(items[Math.min(active, items.length - 1)]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      close();
    }
  };
  const activeId = open && items.length ? `${listId}-${Math.min(active, items.length - 1)}` : undefined;

  return (
    <div
      data-field={field}
      className="relative min-w-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !busy) close();
      }}
    >
      <FieldLabel htmlFor={id} required={required} optional={optional}>
        {label}
      </FieldLabel>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined}
          autoComplete="off"
          maxLength={120}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onClick={() => setOpen(true)}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`${inputBase} ${error ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500/70" : "border-slate-300 dark:border-gray-700"} h-10 ${value && !disabled ? "pr-16" : "pr-9"}`}
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              Promise.resolve(onSelect("", { isNew: false })).catch(() => {});
              setText("");
              inputRef.current?.focus();
            }}
            className="absolute right-8 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform dark:text-gray-500 ${open ? "rotate-180" : ""}`}
        />
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
        >
          {items.map((item, index) => {
            const selected = item.kind === "pick" && keyOf(item.name) === keyOf(value);
            const highlighted = index === Math.min(active, items.length - 1);
            return (
              <li
                key={`${item.kind}:${item.name}`}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(item)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${highlighted ? "bg-sky-50 text-slate-900 dark:bg-sky-500/10 dark:text-white" : "text-slate-700 dark:text-gray-200"} ${item.kind === "add" ? "border-t border-slate-100 font-medium text-sky-700 dark:border-gray-800 dark:text-sky-300" : ""}`}
              >
                {item.kind === "add" ? (
                  <>
                    {busy && highlighted ? <Loader2 size={14} aria-hidden="true" className="animate-spin" /> : <Plus size={14} aria-hidden="true" />}
                    <span className="truncate">
                      {addLabel} “{item.name}”
                    </span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    {selected && <Check size={14} aria-hidden="true" className="shrink-0 text-sky-600 dark:text-sky-400" />}
                  </>
                )}
              </li>
            );
          })}
          {!items.length && (
            <li role="presentation" className="px-3 py-2 text-sm text-slate-500 dark:text-gray-400">
              {loading ? "Loading…" : "No matches. Type at least 2 characters to add a new one."}
            </li>
          )}
          {matches.length > MAX_SHOWN && (
            <li role="presentation" className="px-3 py-1.5 text-xs text-slate-400 dark:text-gray-500">
              Keep typing to narrow {matches.length} matches.
            </li>
          )}
        </ul>
      )}
      <FieldMessage hint={hint} error={failure || error} hintId={hintId} errorId={errorId} />
    </div>
  );
}
