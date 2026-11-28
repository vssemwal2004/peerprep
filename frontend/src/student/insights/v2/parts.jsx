// Prep Analysis v2 building blocks, in the student Dashboard / Profile design language: DM Sans,
// white cards with a soft colour title tile, and gradient hero cards (Prep Score sky, coins gold…)
// with a dotted texture and soft light, like the profile's Prep Score and Readiness cards.
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ChevronDown } from "lucide-react";
import { CountUp } from "../components/motion";

export const focusRing = "focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1a1a1a]";
export const surface = "min-w-0 rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424] dark:shadow-none";
export const softSurface = "rounded-xl bg-[#f6f7f9] dark:bg-white/[0.04]";
export const muted = "text-slate-500 dark:text-zinc-400";

const TITLE_TONES = {
  sky: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25",
  violet: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/25",
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  amber: "bg-amber-50 text-amber-600 ring-amber-100 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25",
  rose: "bg-rose-50 text-rose-600 ring-rose-100 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25",
  teal: "bg-teal-50 text-teal-600 ring-teal-100 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/25",
  slate: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10",
};

export function TitleIcon({ icon: Icon, tone = "sky" }) {
  return <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-inset ${TITLE_TONES[tone] || TITLE_TONES.sky}`} aria-hidden="true"><Icon className="h-4 w-4" strokeWidth={2} /></span>;
}

/** The one card template: colour tile + title, a plain one-line insight, actions, then the body. */
export function Panel({ id, title, insight, icon, tone = "sky", actions, children, className = "", bodyClassName = "", guide, as: Tag = "section" }) {
  const headingId = id ? `pa-${id}-title` : undefined;
  return (
    <Tag aria-labelledby={headingId} data-guide={guide} className={`${surface} p-5 ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-start gap-3">
            {icon ? <TitleIcon icon={icon} tone={tone} /> : null}
            <div className="min-w-0">
              {title && <h2 id={headingId} className="text-[15.5px] font-semibold tracking-[-0.015em] text-slate-900 dark:text-zinc-50">{title}</h2>}
              {insight && <p className={`mt-0.5 text-[12.5px] leading-5 ${muted}`}>{insight}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/** Dashboard-style section heading with a trailing hairline. */
export function SectionHeader({ id, title, action }) {
  return (
    <header className="mb-4 flex items-center gap-4">
      <h2 id={id} className="shrink-0 text-[17px] font-medium tracking-[-0.015em] text-slate-900 dark:text-zinc-50">{title}</h2>
      <span className="h-px flex-1 bg-[#e6e7eb] dark:bg-white/[0.08]" aria-hidden="true" />
      {action}
    </header>
  );
}

const GRADIENTS = {
  sky: "from-sky-500 via-sky-600 to-sky-800 shadow-[0_10px_30px_-18px_rgba(2,132,199,0.8)]",
  ocean: "from-sky-700 via-sky-800 to-slate-900 shadow-[0_10px_30px_-18px_rgba(3,105,161,0.9)]",
  gold: "from-amber-400 via-orange-500 to-rose-600 shadow-[0_10px_30px_-18px_rgba(234,88,12,0.85)]",
  ink: "from-slate-800 via-slate-900 to-sky-950 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.9)]",
  violet: "from-violet-500 via-violet-600 to-indigo-800 shadow-[0_10px_30px_-18px_rgba(109,40,217,0.85)]",
  teal: "from-teal-500 via-teal-600 to-emerald-800 shadow-[0_10px_30px_-18px_rgba(13,148,136,0.85)]",
};

/** A gradient hero card (profile style): soft light, dotted texture, white text. */
export function GradientCard({ tone = "sky", className = "", children, as: Tag = "section", ...props }) {
  return (
    <Tag {...props} className={`relative flex flex-col overflow-hidden rounded-2xl bg-gradient-to-br text-white ${GRADIENTS[tone]} ${className}`}>
      <span className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-white/[0.07] blur-2xl" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:16px_16px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)]" aria-hidden="true" />
      <div className="relative flex flex-1 flex-col">{children}</div>
    </Tag>
  );
}

/** Icon + title + subtitle for a gradient card. */
export function GradientHeader({ icon: Icon, title, subtitle, right }) {
  return (
    <header className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 ring-1 ring-inset ring-white/25" aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {subtitle && <p className="truncate text-[11.5px] text-white/75">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/** White pill on a gradient card ("+0.75 · 30 days"). */
export function GlassChip({ children, tone = "plain", className = "" }) {
  const tones = { plain: "bg-white/12 text-white ring-white/25", up: "bg-emerald-400/25 text-emerald-50 ring-emerald-200/40", down: "bg-rose-500/30 text-rose-50 ring-rose-200/40" };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ring-1 ring-inset ${tones[tone]} ${className}`}>{children}</span>;
}

export const glassButton = "inline-flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset ring-white/25 transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";

/** A big tabular number that counts up once. */
export function HeroNumber({ value, decimals = null, suffix = "", className = "text-[40px]" }) {
  return <span className={`font-bold leading-none tracking-[-0.04em] tabular-nums ${className}`}><CountUp value={value} decimals={decimals} duration={700} suffix={suffix} /></span>;
}

/** "▲ +0.75" / "▼ −0.2" / "No change", green or red (invert for "lower is better"). */
export function Change({ value, text, label = "", invert = false, className = "" }) {
  const number = Number(value) || 0;
  const good = invert ? number < 0 : number > 0;
  const bad = invert ? number > 0 : number < 0;
  const tone = good ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20"
    : bad ? "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20"
      : "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-300 dark:ring-white/10";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ring-1 ring-inset ${tone} ${className}`}>
      {number ? <span aria-hidden="true">{number > 0 ? "▲" : "▼"}</span> : null}{number ? text : "No change"}{label ? <span className="font-medium opacity-80">{label}</span> : null}
    </span>
  );
}

/** A quota ring with the count in the middle: sky→violet while open, amber when full. */
export function QuotaRing({ used = 0, limit = 3, size = 56, id = "q" }) {
  const reduce = useReducedMotion();
  const radius = size / 2 - 6;
  const circumference = 2 * Math.PI * radius;
  const full = limit > 0 && used >= limit;
  const share = limit ? Math.min(1, used / limit) : 0;
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id={`${id}-open`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor="#8b5cf6" /></linearGradient>
          <linearGradient id={`${id}-full`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fbbf24" /><stop offset="1" stopColor="#f97316" /></linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth="7" className="stroke-slate-100 dark:stroke-white/[0.08]" />
        <motion.circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth="7" strokeLinecap="round" stroke={`url(#${id}-${full ? "full" : "open"})`} strokeDasharray={circumference}
          initial={reduce ? false : { strokeDashoffset: circumference }} animate={{ strokeDashoffset: circumference * (1 - share) }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[12px] font-bold tabular-nums text-slate-800 dark:text-zinc-100">{used}/{limit}</span>
    </span>
  );
}

/** A bullet bar: the value against a target marker (readiness, pass marks). */
export function BulletBar({ value = 0, target = null, gradient = "from-sky-400 to-sky-600", label, light = false }) {
  const reduce = useReducedMotion();
  const width = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className={`relative h-2.5 rounded-full ${light ? "bg-white/20" : "bg-[#eef0f3] dark:bg-white/[0.08]"}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)}>
      <motion.div className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${gradient}`}
        initial={reduce ? false : { width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
      {target !== null && target !== undefined ? <span className={`absolute -bottom-1.5 -top-1.5 w-0.5 rounded ${light ? "bg-white" : "bg-slate-800 dark:bg-zinc-100"}`} style={{ left: `${target}%` }} title={`Target ${target}`} /> : null}
    </div>
  );
}

/** A button-like link. `tone`: dark (primary), soft, or glass (on a gradient card). */
export function ActionLink({ to, children, tone = "dark", className = "", onClick }) {
  const style = tone === "dark"
    ? "bg-slate-900 text-white hover:bg-slate-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
    : tone === "sky" ? "bg-sky-600 text-white shadow-[0_8px_18px_-10px_rgba(2,132,199,0.9)] hover:bg-sky-700"
      : "bg-[#eef0f3] text-slate-800 hover:bg-[#e4e7eb] dark:bg-white/[0.07] dark:text-zinc-100 dark:hover:bg-white/[0.12]";
  const classes = `inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition ${style} ${focusRing} ${className}`;
  if (onClick) return <button type="button" onClick={onClick} className={classes}>{children}</button>;
  return <Link to={to} className={classes}>{children}</Link>;
}

export function TextLink({ to, children, onClick, light = false }) {
  const classes = `inline-flex items-center gap-1 rounded text-[12.5px] font-semibold ${light ? "text-white/90 hover:text-white" : "text-sky-700 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300"} ${focusRing}`;
  const body = <>{children}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></>;
  return onClick ? <button type="button" onClick={onClick} className={classes}>{body}</button> : <Link to={to} className={classes}>{body}</Link>;
}

/** No data yet: what it is, and the one button to start. */
export function StartState({ icon: Icon, title, text, to, label }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {Icon ? <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25" aria-hidden="true"><Icon className="h-6 w-6" /></span> : null}
      <p className="text-[16px] font-semibold text-slate-900 dark:text-zinc-100">{title}</p>
      {text && <p className={`max-w-md text-[13px] leading-5 ${muted}`}>{text}</p>}
      {to && <ActionLink to={to} tone="sky" className="mt-1">{label}</ActionLink>}
    </div>
  );
}

/** "How is this counted?" — a closed-by-default plain explanation. */
export function HowCounted({ title = "How is this counted?", children }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`inline-flex items-center gap-1 rounded text-[13px] font-semibold text-sky-700 dark:text-sky-300 ${focusRing}`}>
        {title}<ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div className={`mt-2 text-[13px] leading-5 ${muted}`}>{children}</div>}
    </div>
  );
}

/** A small labelled figure: soft tile on white, glass tile on a gradient card. */
export function Tile({ label, children, glass = false, tone = "" }) {
  return (
    <div className={`min-w-0 rounded-xl px-3.5 py-3 ${glass ? "bg-white/[0.1] ring-1 ring-inset ring-white/15" : softSurface}`}>
      <p className={`truncate text-[11.5px] font-medium ${glass ? "text-white/75" : muted}`}>{label}</p>
      <p className={`mt-0.5 text-[20px] font-bold tabular-nums tracking-[-0.02em] ${glass ? "text-white" : "text-slate-950 dark:text-zinc-50"} ${tone}`}>{children}</p>
    </div>
  );
}
