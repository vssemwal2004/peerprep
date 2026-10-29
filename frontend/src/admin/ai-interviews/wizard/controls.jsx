import { useId, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Minus, Plus, X } from "lucide-react";
import { RequiredMark, surfaceClass } from "../ui";
import { ICON_TONES, TONES } from "../theme";

export const inputBase =
  "w-full rounded-lg border bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 dark:bg-gray-950 dark:text-gray-100 dark:placeholder:text-gray-500 dark:disabled:bg-gray-900 dark:disabled:text-gray-500 dark:[color-scheme:dark]";
const inputTone = (error) =>
  error
    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/20 dark:border-rose-500/70"
    : "border-slate-300 dark:border-gray-700";
export const buttonPrimary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-950";
export const buttonSecondary =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:ring-offset-gray-950";
export const buttonGhost =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white";
export const iconButton =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white";

export function StepHeading({ title, description }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[22px] sm:leading-8">
        {title}
      </h2>
      {description && (
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500 dark:text-gray-400">
          {description}
        </p>
      )}
    </div>
  );
}

export function Card({ title, description, icon: Icon, action, children, className = "", tone = "default", ...rest }) {
  return (
    <section
      {...rest}
      className={`${surfaceClass} ${tone === "ai" ? "!border-indigo-200 dark:!border-indigo-500/30" : ""} ${className}`}
    >
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-gray-800">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span
                aria-hidden="true"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone === "ai" ? ICON_TONES.indigo : ICON_TONES.sky}`}
              >
                <Icon size={16} />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">{title}</h3>
              {description && (
                <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500 dark:text-gray-400">{description}</p>
              )}
            </div>
          </div>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function FieldLabel({ id, htmlFor, children, required, optional, srOnly = false }) {
  const Tag = htmlFor ? "label" : "span";
  return (
    <Tag
      id={id}
      htmlFor={htmlFor}
      className={
        srOnly
          ? "sr-only"
          : "mb-1.5 flex items-baseline gap-1.5 text-[13px] font-medium text-slate-700 dark:text-gray-200"
      }
    >
      <span>
        {children}
        {required && <RequiredMark />}
      </span>
      {optional && (
        <span className="text-xs font-normal text-slate-400 dark:text-gray-500">Optional</span>
      )}
    </Tag>
  );
}

export function FieldMessage({ hintId, errorId, hint, error }) {
  return (
    <>
      {error && (
        <p
          id={errorId}
          className="mt-1.5 flex items-start gap-1.5 text-sm text-rose-600 dark:text-rose-400"
        >
          <AlertCircle size={15} aria-hidden="true" className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
          {hint}
        </p>
      )}
    </>
  );
}

const describe = (hint, error, hintId, errorId) =>
  [error && errorId, hint && hintId].filter(Boolean).join(" ") || undefined;

export function TextField({
  label,
  value,
  onChange,
  required,
  optional,
  hint,
  error,
  field,
  multiline = false,
  rows = 3,
  className = "",
  inputRef,
  ...rest
}) {
  const id = useId(),
    hintId = useId(),
    errorId = useId();
  const Control = multiline ? "textarea" : "input";
  return (
    <div data-field={field} className={`min-w-0 ${className}`}>
      <FieldLabel htmlFor={id} required={required} optional={optional}>
        {label}
      </FieldLabel>
      <Control
        {...rest}
        ref={inputRef}
        id={id}
        rows={multiline ? rows : undefined}
        value={value ?? ""}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(hint, error, hintId, errorId)}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} ${inputTone(error)} ${multiline ? "min-h-20 resize-y py-2 leading-relaxed" : "h-10"}`}
      />
      <FieldMessage hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

export function SelectField({ label, value, onChange, options, hint, field, className = "", ...rest }) {
  const id = useId(),
    hintId = useId();
  return (
    <div data-field={field} className={`min-w-0 ${className}`}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          {...rest}
          id={id}
          value={value}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputBase} ${inputTone(false)} h-10 appearance-none pr-9`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500"
        />
      </div>
      <FieldMessage hint={hint} hintId={hintId} />
    </div>
  );
}

// Single choice as an ARIA radiogroup with roving focus (arrows, Home, End).
// variant "cards" renders larger option cards with a description.
export function Segmented({
  label,
  value,
  options,
  onChange,
  required,
  hint,
  error,
  field,
  variant = "pills",
  hideLabel = false,
  disabled,
  columns = "sm:grid-cols-2",
  renderCard,
}) {
  const labelId = useId(),
    hintId = useId(),
    errorId = useId();
  const refs = useRef([]);
  const selected = options.findIndex((o) => o.value === value);
  const choose = (index, focus = false) => {
    onChange(options[index].value);
    if (focus) refs.current[index]?.focus();
  };
  const onKeyDown = (event, index) => {
    const n = options.length;
    const next = {
      ArrowRight: (index + 1) % n,
      ArrowDown: (index + 1) % n,
      ArrowLeft: (index - 1 + n) % n,
      ArrowUp: (index - 1 + n) % n,
      Home: 0,
      End: n - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(next, true);
  };
  const cards = variant === "cards";
  return (
    <div data-field={field} className="min-w-0">
      <FieldLabel id={labelId} required={required} srOnly={hideLabel}>
        {label}
      </FieldLabel>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe(hint, error, hintId, errorId)}
        className={
          cards
            ? `grid gap-3 ${columns}`
            : `flex w-full flex-wrap gap-1 rounded-lg border p-1 sm:inline-flex sm:w-auto ${error ? "border-rose-400 dark:border-rose-500/70" : "border-slate-200 dark:border-gray-800"} bg-slate-100/80 dark:bg-gray-950`
        }
      >
        {options.map((option, index) => {
          const checked = index === selected;
          const Icon = option.icon;
          return (
            <button
              key={String(option.value)}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option.ariaLabel}
              tabIndex={(selected === -1 ? index === 0 : checked) ? 0 : -1}
              disabled={disabled}
              onClick={() => choose(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={
                cards
                  ? `flex min-w-0 items-start gap-3 rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-gray-950 ${checked ? (renderCard ? "border-violet-500 bg-violet-50/70 ring-1 ring-violet-500 dark:border-violet-400 dark:bg-violet-500/10 dark:ring-violet-400" : "border-sky-500 bg-sky-50/70 ring-1 ring-sky-500 dark:bg-sky-950/40") : `${error ? "border-rose-300 dark:border-rose-500/60" : "border-slate-200 dark:border-gray-700"} bg-white hover:border-slate-300 hover:bg-slate-50 dark:bg-gray-900 dark:hover:bg-gray-800`}`
                  : `min-h-8 flex-1 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none ${checked ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-gray-700 dark:text-white dark:shadow-black/30 dark:ring-gray-600" : "text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"}`
              }
            >
              {cards && renderCard ? (
                renderCard(option, checked)
              ) : cards ? (
                <>
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${checked ? "border-sky-600 bg-sky-600" : "border-slate-300 dark:border-gray-600"}`}
                  >
                    {checked && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                      {Icon && <Icon size={16} aria-hidden="true" className="text-sky-600 dark:text-sky-400" />}
                      {option.label}
                    </span>
                    {option.detail && (
                      <span className="mt-1 block text-sm leading-snug text-slate-500 dark:text-gray-400">
                        {option.detail}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                option.label
              )}
            </button>
          );
        })}
      </div>
      <FieldMessage hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Whole-number input that only reports values inside [min, max]; while the admin
// types an out-of-range value the last valid value stays in the data.
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  decimals = false,
  stepper = false,
  hint,
  error,
  field,
  suffix,
  hideLabel = false,
  className = "",
}) {
  const id = useId(),
    hintId = useId(),
    errorId = useId();
  const [draft, setDraft] = useState(null);
  const valid = (n) =>
    Number.isFinite(n) && (decimals || Number.isInteger(n)) && n >= min && n <= max;
  const commit = (n) => {
    setDraft(null);
    onChange(decimals ? Math.round(n * 100) / 100 : n);
  };
  const current = Number(value);
  return (
    <div data-field={field} className={`min-w-0 ${className}`}>
      <FieldLabel htmlFor={id} srOnly={hideLabel}>
        {label}
      </FieldLabel>
      <div className="flex items-stretch">
        {stepper && (
          <button
            type="button"
            aria-label={`Decrease ${label.toLowerCase()}`}
            disabled={!(current > min)}
            onClick={() => commit(clamp(current - step, min, max))}
            className={`${inputTone(error)} flex h-10 w-10 shrink-0 items-center justify-center rounded-l-lg border bg-white text-slate-600 hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800`}
          >
            <Minus size={15} aria-hidden="true" />
          </button>
        )}
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="number"
            inputMode={decimals ? "decimal" : "numeric"}
            min={min}
            max={max}
            step={decimals ? "0.01" : step}
            value={draft ?? (Number.isFinite(current) ? String(value) : "")}
            aria-invalid={error || (draft !== null && !valid(Number(draft))) ? true : undefined}
            aria-describedby={describe(hint, error, hintId, errorId)}
            onChange={(e) => {
              const raw = e.target.value;
              const n = Number(raw);
              if (raw.trim() !== "" && valid(n)) {
                setDraft(raw);
                onChange(decimals ? Math.round(n * 100) / 100 : n);
              } else setDraft(raw);
            }}
            onBlur={() => setDraft(null)}
            className={`${inputBase} ${inputTone(error)} h-10 tabular-nums ${stepper ? "rounded-none border-x-0 text-center" : ""} ${suffix ? "pr-12" : ""}`}
          />
          {suffix && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
            >
              {suffix}
            </span>
          )}
        </div>
        {stepper && (
          <button
            type="button"
            aria-label={`Increase ${label.toLowerCase()}`}
            disabled={!(current < max)}
            onClick={() => commit(clamp((Number.isFinite(current) ? current : min) + step, min, max))}
            className={`${inputTone(error)} flex h-10 w-10 shrink-0 items-center justify-center rounded-r-lg border bg-white text-slate-600 hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-40 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800`}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      {draft !== null && !valid(Number(draft)) && !error && (
        <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">
          Enter {decimals ? "a number" : "a whole number"} from {min} to {max}.
        </p>
      )}
      <FieldMessage hint={hint} error={error} hintId={hintId} errorId={errorId} />
    </div>
  );
}

// Free-text chips (skills). Enter or comma adds; Backspace on an empty input removes the last.
export function ChipInput({ label, values = [], onChange, placeholder, hint, field, max = 30 }) {
  const id = useId(),
    hintId = useId();
  const [text, setText] = useState("");
  const add = () => {
    const value = text.trim().replace(/,$/, "").slice(0, 80);
    setText("");
    if (
      !value ||
      values.length >= max ||
      values.some((v) => v.toLowerCase() === value.toLowerCase())
    )
      return;
    onChange([...values, value]);
  };
  return (
    <div data-field={field} className="min-w-0">
      <FieldLabel htmlFor={id} optional>
        {label}
      </FieldLabel>
      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5 shadow-sm focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/20 dark:border-gray-700 dark:bg-gray-950">
        {values.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 py-0.5 pl-2 pr-1 text-xs font-medium text-slate-700 dark:bg-gray-800 dark:text-gray-200"
          >
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((v) => v !== value))}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          placeholder={values.length ? "" : placeholder}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !text && values.length)
              onChange(values.slice(0, -1));
          }}
          className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-gray-100"
        />
      </div>
      <FieldMessage hint={hint} hintId={hintId} />
    </div>
  );
}

// A disclosure section; children mount only while open.
export function Disclosure({ title, description, open, onToggle, children, icon: Icon, badge, field }) {
  const contentId = useId();
  return (
    <section
      data-field={field}
      className={surfaceClass}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={contentId}
        data-platform-disclosure="wizard"
        onClick={onToggle}
        className="flex w-full items-start gap-3 rounded-2xl px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"
      >
        {Icon && (
          <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_TONES.slate}`}>
            <Icon size={16} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">
            {title}
            {badge}
          </span>
          {description && (
            <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-gray-400">{description}</span>
          )}
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`mt-1 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div id={contentId} hidden={!open} className="border-t border-slate-100 px-5 py-5 dark:border-gray-800">
        {open && children}
      </div>
    </section>
  );
}

export function Chip({ children, tone = "slate", title }) {
  const tones = { ...TONES, ai: TONES.indigo };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

export function Alert({ tone = "info", title, children, action }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
    error: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100",
    warning: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
  };
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}
    >
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
      {action}
    </div>
  );
}
