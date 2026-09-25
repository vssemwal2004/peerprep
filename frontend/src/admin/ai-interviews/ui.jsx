import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";

export const inputClass =
  "h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-sky-900";
export const primaryClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50";
export const secondaryClass =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200";
export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">
        {label}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  );
}
export function TextInput(props) {
  return (
    <input {...props} className={`${inputClass} ${props.className || ""}`} />
  );
}
export function TextArea(props) {
  return (
    <textarea
      rows={3}
      {...props}
      className={`${inputClass} min-h-24 py-2 ${props.className || ""}`}
    />
  );
}
export function Select({ options, ...props }) {
  return (
    <select {...props} className={inputClass}>
      {options.map((o) => (
        <option
          key={typeof o === "string" ? o : o.value}
          value={typeof o === "string" ? o : o.value}
        >
          {typeof o === "string" ? o : o.label}
        </option>
      ))}
    </select>
  );
}
export function Panel({ title, action, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {title}
          </h2>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}
export function Notice({ children, error = false }) {
  return (
    <div
      role={error ? "alert" : "status"}
      className={`rounded-lg border px-3 py-2 text-sm ${error ? "border-rose-200 bg-rose-50 text-rose-700" : "border-sky-100 bg-sky-50 text-sky-800"} dark:bg-gray-900`}
    >
      {children}
    </div>
  );
}
export function Badge({ children, complete }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${complete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"} dark:bg-gray-800 dark:text-gray-200`}
    >
      {children}
    </span>
  );
}
export function EmptyState({ title, detail, action }) {
  return (
    <div className="flex flex-col items-center px-5 py-12 text-center">
      <svg
        viewBox="0 0 120 90"
        className="mb-4 h-20 w-28"
        fill="none"
        aria-hidden="true"
      >
        <ellipse cx="60" cy="77" rx="43" ry="7" fill="#f1f5f9" />
        <rect
          x="26"
          y="13"
          width="63"
          height="58"
          rx="10"
          fill="#f0f9ff"
          stroke="#bae6fd"
        />
        <path
          d="M40 32h32M40 42h24M40 52h16"
          stroke="#7dd3fc"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="86" cy="59" r="16" fill="#ede9fe" stroke="#c4b5fd" />
        <path
          d="m86 49 2.5 7.5L96 59l-7.5 2.5L86 69l-2.5-7.5L76 59l7.5-2.5L86 49Z"
          fill="#8b5cf6"
        />
      </svg>
      <h2 className="text-base font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">{detail}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Pagination({ value, onPage, onLimit }) {
  if (!value) return null;
  const { page, pages, total, limit } = value;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-gray-800">
      <span>
        {total
          ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)}`
          : "0"}{" "}
        of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-2">
        {onLimit && (
          <select
            aria-label="Items per page"
            className="rounded border border-slate-200 bg-transparent px-2 py-1"
            value={limit}
            onChange={(e) => onLimit(Number(e.target.value))}
          >
            {[25, 50, 100].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        )}
        <button
          aria-label="Previous page"
          className={secondaryClass}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        <span>
          Page {page} of {pages}
        </span>
        <button
          aria-label="Next page"
          className={secondaryClass}
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
export function PageHeader({ title, back, crumbs = [], actions }) {
  return (
    <header data-page-header className="border-b border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
      <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
        {back && (
          <Link
            aria-label="Back"
            to={back}
            className="mr-1 rounded p-1 hover:bg-slate-100"
          >
            <ArrowLeft size={16} />
          </Link>
        )}
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-2"
        >
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-center gap-2">
              {i > 0 && <ChevronRight size={12} />}
              {c.to ? (
                <Link className="truncate hover:text-sky-700" to={c.to}>
                  {c.label}
                </Link>
              ) : (
                <span className="truncate" aria-current="page">
                  {c.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
    </header>
  );
}
export function Dialog({ title, children, onClose }) {
  const ref = useRef(null),
    label = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const element = ref.current;
    element?.showModal();
    return () => {
      element?.close();
      previous?.focus?.();
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={label}
      onSubmit={(e) => e.stopPropagation()}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto max-h-[85dvh] w-[min(680px,94vw)] rounded-xl border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-950/30 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h2 id={label} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label="Close dialog"
          onClick={onClose}
          className="rounded p-1"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>,
    document.body,
  );
}
export function Avatar({ variant = "annu", size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <rect
        width="48"
        height="48"
        rx="13"
        fill={variant === "orbit" ? "#e0f2fe" : "#ede9fe"}
      />
      {variant === "spark" ? (
        <path d="m24 9 4 11 11 4-11 4-4 11-4-11-11-4 11-4Z" fill="#8b5cf6" />
      ) : (
        <>
          <rect
            x="11"
            y="15"
            width="26"
            height="21"
            rx="8"
            stroke={variant === "orbit" ? "#0284c7" : "#8b5cf6"}
            strokeWidth="2"
          />
          <path
            d="M24 10v5M19 29h10"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="19" cy="23" r="2" fill="#0284c7" />
          <circle cx="29" cy="23" r="2" fill="#0284c7" />
        </>
      )}
    </svg>
  );
}
