import { useEffect, useId, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, ArrowUpRight, Loader2 } from "lucide-react";
import { clamp, getToneClasses } from "./analyticsUtils";

export function fadeIn(delay = 0, y = 16) {
  return {
    initial: { opacity: 0, y },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "-80px" },
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1], delay },
  };
}

export function AnimatedNumber({ value, suffix = "", prefix = "", duration = 600 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const target = Number(value) || 0;
    const start = display;
    const startedAt = performance.now();
    let frameId = 0;

    const tick = (time) => {
      const progress = Math.min(1, (time - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(start + (target - start) * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  return (
    <>
      {prefix}
      {display}
      {suffix}
    </>
  );
}

export function Surface({ children, className = "", compact = false }) {
  return (
    <div
      className={[
        "rounded-[20px] border border-slate-200/90 bg-white/95 shadow-[0_18px_50px_-42px_rgba(15,23,42,0.28)] backdrop-blur-xl",
        "dark:border-slate-700/70 dark:bg-slate-900/90 dark:shadow-[0_20px_60px_-46px_rgba(0,0,0,0.75)]",
        compact ? "p-3.5" : "p-4 sm:p-5",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, subtitle, action = null, className = "" }) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
            {eyebrow}
          </div>
        ) : null}
        <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-950 dark:text-white sm:text-xl">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function TonePill({ children, tone = "sky", className = "" }) {
  const toneClasses = getToneClasses(tone);
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${toneClasses.pill} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${toneClasses.dot}`} />
      {children}
    </span>
  );
}

export function IconBadge({ Icon, tone = "sky", className = "" }) {
  const toneClasses = getToneClasses(tone);
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-[0_14px_28px_-20px_rgba(14,165,233,0.9)] ${toneClasses.icon} ${className}`}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}

export function MetricCard({ label, value, helper, Icon, tone = "sky", suffix = "", prefix = "", delay = 0, compact = false }) {
  const toneClasses = getToneClasses(tone);
  return (
    <motion.div
      {...fadeIn(delay, 10)}
      whileHover={{ y: -3 }}
      className={[
        "group relative overflow-hidden rounded-[16px] border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:border-sky-200 hover:shadow-[0_18px_44px_-36px_rgba(14,165,233,0.8)] dark:border-white/10 dark:bg-slate-950/75",
        compact ? "p-3" : "p-3.5",
      ].join(" ")}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent opacity-70 dark:via-white/20" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            {label}
          </div>
          <div className={`${compact ? "mt-1.5 text-xl" : "mt-2 text-2xl"} font-bold tracking-tight text-slate-950 dark:text-white`}>
            <AnimatedNumber value={value} prefix={prefix} suffix={suffix} />
          </div>
          {helper ? <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{helper}</p> : null}
        </div>
        {Icon ? <IconBadge Icon={Icon} tone={tone} /> : null}
      </div>
      <div className={`${compact ? "mt-3" : "mt-4"} h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10`}>
        <motion.div
          className={`h-full rounded-full ${toneClasses.bar}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${clamp(value)}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </motion.div>
  );
}

export function MiniMetric({ label, value, helper, tone = "sky", Icon }) {
  const toneClasses = getToneClasses(tone);
  return (
    <div className={`rounded-[16px] border p-3.5 ${toneClasses.panel}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{label}</div>
          <div className="mt-1 truncate text-lg font-bold">{value}</div>
          {helper ? <p className="mt-1 text-xs leading-relaxed opacity-75">{helper}</p> : null}
        </div>
        {Icon ? (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/55 dark:bg-white/10">
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ProgressBar({ value = 0, tone = "sky", label, helper }) {
  const toneClasses = getToneClasses(tone);
  return (
    <div>
      {label ? (
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300">{label}</span>
          <span className="font-bold text-slate-900 dark:text-white">{Math.round(value)}%</span>
        </div>
      ) : null}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <motion.div
          className={`h-full rounded-full ${toneClasses.bar}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${clamp(value)}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      {helper ? <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{helper}</p> : null}
    </div>
  );
}

export function ScoreRing({ score = 0, size = 168, stroke = 12, tone = "sky", label = "Score" }) {
  const id = useId();
  const value = clamp(score);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = {
    sky: ["#7dd3fc", "#0284c7"],
    emerald: ["#86efac", "#059669"],
    amber: ["#fde68a", "#d97706"],
    rose: ["#fda4af", "#e11d48"],
    violet: ["#7dd3fc", "#0284c7"],
    slate: ["#cbd5e1", "#475569"],
  }[tone] || ["#7dd3fc", "#0284c7"];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`${id}-gradient`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color[0]} />
            <stop offset="100%" stopColor={color[1]} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-100 dark:stroke-white/10"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${id}-gradient)`}
          strokeLinecap="round"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          whileInView={{ strokeDashoffset: offset }}
          viewport={{ once: true }}
          transition={{ duration: 1.05, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
          <AnimatedNumber value={value} suffix="%" />
        </div>
        <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          {label}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ title = "No data yet", text = "Start using PeerPrep to unlock this insight.", Icon = AlertCircle }) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center dark:border-white/10 dark:bg-white/[0.03]">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-500 shadow-sm dark:bg-white/10 dark:text-slate-300">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
      <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 pt-24 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="h-[360px] animate-pulse rounded-[32px] bg-white motion-reduce:animate-none dark:bg-white/5" />
          <div className="h-[360px] animate-pulse rounded-[32px] bg-white motion-reduce:animate-none dark:bg-white/5" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-[22px] bg-white motion-reduce:animate-none dark:bg-white/5" />
          ))}
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          Building your analytics workspace
        </div>
      </div>
    </div>
  );
}

export function ErrorBanner({ error, onRetry }) {
  if (!error) return null;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="text-sm font-bold">Analytics could not refresh</div>
            <p className="mt-1 text-xs opacity-80">{error.message || "Please try again."}</p>
          </div>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-rose-500"
          >
            Retry
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function DataChip({ label, value, tone = "sky" }) {
  const toneClasses = getToneClasses(tone);
  return (
    <div className={`rounded-2xl px-3 py-2 ring-1 ${toneClasses.pill}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-bold">{value}</div>
    </div>
  );
}

export function ActivityDots({ points = [], tone = "sky" }) {
  const toneClasses = getToneClasses(tone);
  const max = useMemo(() => Math.max(1, ...points.map((point) => Number(point.count || point.value || 0))), [points]);

  return (
    <div className="grid grid-cols-7 gap-2">
      {points.map((point, index) => {
        const value = Number(point.count || point.value || 0);
        const opacity = value ? 0.28 + (value / max) * 0.72 : 0.12;
        return (
          <div key={`${point.date || point.label}-${index}`} className="flex flex-col items-center gap-1">
            <div
              title={`${point.date || point.label}: ${value}`}
              className={`h-8 w-full rounded-xl ${toneClasses.bar}`}
              style={{ opacity }}
            />
            <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
              {point.label || ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}
