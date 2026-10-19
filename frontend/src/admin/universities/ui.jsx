import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from 'lucide-react';

export const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-900/40';
export const helper = 'text-xs text-slate-500 dark:text-slate-400';

const BUTTONS = {
  primary: 'bg-sky-600 text-white hover:bg-sky-700 shadow-sm',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
  danger: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:bg-transparent dark:text-rose-300 dark:hover:bg-rose-950/40',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
};

export function Button({ variant = 'primary', busy = false, icon: Icon, children, className = '', ...props }) {
  return (
    <button type="button" {...props} disabled={props.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTONS[variant]} ${className}`}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function ButtonLink({ to, variant = 'primary', icon: Icon, children, className = '' }) {
  return (
    <Link to={to} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${BUTTONS[variant]} ${className}`}>
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}{children}
    </Link>
  );
}

export function PageHeader({ eyebrow = 'Universities', title, description, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-sky-600">{eyebrow}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, icon: Icon, actions, children, className = '', id }) {
  return (
    <section aria-labelledby={id} className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>}
            <div className="min-w-0">
              {title && <h2 id={id} className="text-base font-bold text-slate-950 dark:text-white">{title}</h2>}
              {description && <p className={`mt-0.5 ${helper}`}>{description}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, required, children, className = '' }) {
  return (
    <label className={`block text-sm font-semibold text-slate-700 dark:text-slate-200 ${className}`}>
      <span>{label}{required && <span className="ml-0.5 text-rose-500" aria-hidden="true">*</span>}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className={`mt-1 block font-normal ${helper}`}>{hint}</span>}
    </label>
  );
}

const TONES = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30',
  info: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
};

export function Pill({ tone = 'neutral', children }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${TONES[tone]}`}>{children}</span>;
}

const NOTICE_ICONS = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info };
export function Notice({ tone = 'info', children, role }) {
  const Icon = NOTICE_ICONS[tone] || Info;
  return (
    <p role={role || (tone === 'danger' ? 'alert' : 'status')} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ring-1 ring-inset ${TONES[tone]}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span>{children}</span>
    </p>
  );
}

export function Stat({ label, value, hint, tone }) {
  const color = tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : tone === 'danger' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-950 dark:text-white';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className={helper}>{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className={`mt-0.5 ${helper}`}>{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center dark:border-slate-700">
      {Icon && <Icon className="h-8 w-8 text-slate-400" aria-hidden="true" />}
      <p className="mt-3 font-semibold text-slate-900 dark:text-white">{title}</p>
      {children && <p className={`mt-1 max-w-md ${helper}`}>{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'}`}>
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function LoadingBlock({ label = 'Loading…' }) {
  return <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{label}</div>;
}

export const pageShell = 'mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6';
