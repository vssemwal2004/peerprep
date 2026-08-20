import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  ClipboardCheck,
  Code2,
  Info,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { ANALYTICS_SECTION_IDS, getScoreTone, getToneClasses } from "./analyticsUtils";

const ANALYTICS_SECTIONS = [
  { id: "overview", label: "Overview", Icon: BarChart3 },
  { id: "coding", label: "Coding", Icon: Code2 },
  { id: "assessments", label: "Assessments", Icon: ClipboardCheck },
  { id: "interviews", label: "Interviews", Icon: MessageSquare },
  { id: "learning", label: "Learning", Icon: BookOpen },
  { id: "placement", label: "Placement", Icon: BriefcaseBusiness },
];

const SECTION_COUNT = ANALYTICS_SECTION_IDS.length;

const SECTION_COPY = {
  overview: "Your readiness, activity, and next priority.",
  coding: "Accuracy, topic coverage, and practice priorities.",
  assessments: "Score movement, stability, and reliability.",
  interviews: "Reviewed feedback and competency signals.",
  learning: "Course progress and learning activity.",
  placement: "Compare your evidence with company benchmarks.",
};

function formatUpdatedAt(value) {
  if (!value) return "Waiting for first sync";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently updated";
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function WorkspaceHeader({ activeSection, onSectionChange, refreshing, onRefresh, generatedAt }) {
  const reduceMotion = useReducedMotion();
  const activeIndex = Math.max(0, ANALYTICS_SECTIONS.findIndex((item) => item.id === activeSection));

  const handleKeyDown = (event, index) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + ANALYTICS_SECTIONS.length) % ANALYTICS_SECTIONS.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % ANALYTICS_SECTIONS.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = ANALYTICS_SECTIONS.length - 1;
    onSectionChange(ANALYTICS_SECTIONS[nextIndex].id);
    requestAnimationFrame(() => document.getElementById(`analytics-tab-${ANALYTICS_SECTIONS[nextIndex].id}`)?.focus());
  };

  return (
    <header className="sticky top-14 z-30 border-b border-slate-200/80 bg-white/92 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/90">
      <div className="mx-auto max-w-7xl px-4 pb-0 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-300">
              <Activity className="h-3.5 w-3.5" />
              Student analytics
            </div>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-[28px]">
              Performance &amp; readiness
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{SECTION_COPY[activeSection]}</p>
          </div>

          <div className="flex items-center gap-2 sm:pt-1">
            <div className="hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 md:block">
              All available evidence · {formatUpdatedAt(generatedAt)}
            </div>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition duration-200 hover:border-sky-300 hover:text-sky-700 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:border-sky-400/40 dark:hover:text-sky-300 dark:focus-visible:ring-offset-slate-950"
              aria-label="Refresh analytics"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} />
              <span>{refreshing ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>
        </div>

        <nav className="no-scrollbar mt-5 flex gap-1 overflow-x-auto" role="tablist" aria-label="Analytics sections">
          {ANALYTICS_SECTIONS.map(({ id, label, Icon }, index) => {
            const active = id === activeSection;
            return (
              <button
                key={id}
                id={`analytics-tab-${id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`analytics-panel-${id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => onSectionChange(id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                className={`group relative flex min-h-11 min-w-max items-center gap-2 px-3 py-2.5 text-sm font-semibold transition duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 ${
                  active
                    ? "text-sky-700 dark:text-sky-300"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {active ? (
                  <motion.span
                    layoutId="analytics-active-tab"
                    className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-sky-500"
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 430, damping: 34 }}
                  />
                ) : null}
              </button>
            );
          })}
        </nav>
        <span className="sr-only">Section {activeIndex + 1} of {SECTION_COUNT}</span>
      </div>
    </header>
  );
}

export function PageTransition({ children, direction = 0 }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction >= 0 ? 12 : -12, y: 4 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction >= 0 ? -8 : 8 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.26, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Panel({ children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-slate-200/90 bg-white shadow-[0_18px_55px_-48px_rgba(15,23,42,0.45)] dark:border-white/10 dark:bg-slate-900/75 ${className}`}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, description, eyebrow, action, className = "" }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow ? <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:text-sky-300">{eyebrow}</div> : null}
        <h2 className="mt-0.5 text-base font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricGrid({ children, columns = 4 }) {
  const columnClass = columns === 3 ? "lg:grid-cols-3" : columns === 5 ? "xl:grid-cols-5" : "lg:grid-cols-4";
  return <div className={`grid gap-3 sm:grid-cols-2 ${columnClass}`}>{children}</div>;
}

export function MetricTile({ label, value, suffix = "", helper, Icon, tone = "sky", available = true }) {
  const reduceMotion = useReducedMotion();
  const toneClasses = getToneClasses(tone);
  const display = available && value !== null && value !== undefined && value !== "" ? `${value}${suffix}` : "—";

  return (
    <motion.div
      whileHover={reduceMotion ? undefined : { y: -2 }}
      transition={{ duration: 0.18 }}
      className="rounded-xl border border-slate-200/90 bg-white p-4 dark:border-white/10 dark:bg-slate-900/75"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
          <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-950 dark:text-white">{display}</div>
        </div>
        {Icon ? (
          <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses.pill}`}>
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <div className="mt-2 min-h-4 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
        {available ? helper : "Not enough evidence yet"}
      </div>
    </motion.div>
  );
}

export function StatusBadge({ children, tone = "sky" }) {
  const toneClasses = getToneClasses(tone);
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${toneClasses.pill}`}>{children}</span>;
}

export function ScoreSummary({ score, status, label = "Readiness", available = true, detail }) {
  const reduceMotion = useReducedMotion();
  const tone = available ? getScoreTone(score) : "slate";
  const toneClasses = getToneClasses(tone);
  const value = Math.max(0, Math.min(100, Number(score) || 0));
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-[0_28px_80px_-52px_rgba(2,132,199,0.85)] dark:border-white/10">
      <div className="absolute -right-16 -top-16 h-44 w-44 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-slate-300">{label}</div>
          <StatusBadge tone={tone}>{available ? status : "Building signal"}</StatusBadge>
        </div>
        <div className="mt-5 flex items-end gap-2">
          <span className="text-5xl font-semibold tabular-nums tracking-[-0.06em]">{available ? Math.round(value) : "—"}</span>
          {available ? <span className="pb-1 text-sm font-medium text-slate-400">/100</span> : null}
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: available ? `${value}%` : "0%" }}
            transition={{ duration: reduceMotion ? 0 : 0.75, ease: [0.22, 1, 0.36, 1] }}
            className={`h-full rounded-full ${toneClasses.bar}`}
          />
        </div>
        {detail ? <p className="mt-4 text-xs leading-5 text-slate-300">{detail}</p> : null}
      </div>
    </div>
  );
}

export function ScoreBar({ label, value, helper, available = true, tone }) {
  const reduceMotion = useReducedMotion();
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  const resolvedTone = tone || getScoreTone(safeValue);
  const toneClasses = getToneClasses(resolvedTone);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="font-semibold tabular-nums text-slate-950 dark:text-white">{available ? `${Math.round(safeValue)}%` : "No data"}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: available ? `${safeValue}%` : "0%" }}
          viewport={{ once: true }}
          transition={{ duration: reduceMotion ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
          className={`h-full rounded-full ${toneClasses.bar}`}
        />
      </div>
      {helper ? <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{helper}</p> : null}
    </div>
  );
}

export function EvidencePanel({ items = [], title = "What the data says", emptyText = "More activity is needed before a reliable insight is available." }) {
  const visible = items.filter(Boolean).slice(0, 3);
  return (
    <Panel className="p-5">
      <PanelHeader title={title} eyebrow="Evidence" />
      {visible.length ? (
        <div className="mt-4 space-y-3">
          {visible.map((item, index) => (
            <div key={item.id || item.title || index} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-white/10 dark:bg-white/[0.03]">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm ring-1 ring-slate-200 dark:bg-white/10 dark:text-sky-300 dark:ring-white/10">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.title}</div>
                  <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.summary}</p>
                  {item.action ? (
                    <div className="mt-2 flex items-start gap-2 text-xs font-medium leading-5 text-sky-800 dark:text-sky-200">
                      <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {item.action}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs leading-5 text-slate-500 dark:border-white/10 dark:text-slate-400">{emptyText}</div>
      )}
    </Panel>
  );
}

export function ActionCard({ title, reason, action, onClick, buttonLabel, tone = "sky" }) {
  const toneClasses = getToneClasses(tone);
  return (
    <div className={`rounded-2xl border p-5 ${toneClasses.panel}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClasses.icon}`}>
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">Recommended next step</div>
          <h2 className="mt-1 text-base font-semibold">{title}</h2>
          {reason ? <p className="mt-1 text-xs leading-5 opacity-80">{reason}</p> : null}
          {action ? <p className="mt-3 text-sm font-medium leading-5">{action}</p> : null}
          {onClick && buttonLabel ? (
            <button type="button" onClick={onClick} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-slate-800 active:scale-[0.98] dark:bg-white dark:text-slate-950">
              {buttonLabel}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function EmptyPanel({ title, text }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-400 shadow-sm ring-1 ring-slate-200 dark:bg-white/5 dark:ring-white/10"><Info className="h-4 w-4" /></span>
      <div className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</div>
      <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

export function CheckList({ items = [], emptyText = "Nothing to show yet." }) {
  if (!items.length) return <p className="text-xs text-slate-500 dark:text-slate-400">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="flex items-start gap-3 text-sm leading-5 text-slate-700 dark:text-slate-300">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/20">
            {index + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function EvidenceChips({ items = [] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.filter(Boolean).map((item) => (
        <span key={item} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 dark:bg-white/5 dark:text-slate-300">
          <Check className="h-3 w-3 text-emerald-500" />
          {item}
        </span>
      ))}
    </div>
  );
}
