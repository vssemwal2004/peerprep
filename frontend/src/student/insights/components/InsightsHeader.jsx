import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Award, BarChart3, CalendarRange, ChevronDown, Download, FileSpreadsheet, FileText, Flame, Loader2, RefreshCw, Trophy } from "lucide-react";
import LevelMedallion from "../../profile/LevelMedallion";
import { daysAgoText, formatNumber, PERIODS, preparationLevel, sectionPath } from "../insightModel";
import { SECTION_ICONS } from "../sectionIcons";
import { CountUp } from "./motion";
import { buttonClass, focusRing, primaryButtonClass, Segmented } from "./ui";
import { dayKey } from "../../../components/dateRange/dateRangeModel";
import PageGuideButton from "../../../guide/platform/PageGuideButton";

// The student's local calendar day (toISOString is UTC and blocked "today" in IST before 05:30).
const todayKey = () => dayKey();
const initials = (name = "") => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";

function DownloadMenu({ onDownload }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const run = async (format) => {
    setBusy(format);
    try { await onDownload(format); setOpen(false); } finally { setBusy(""); }
  };
  return (
    <div ref={ref} className="relative" data-guide="an-download">
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={buttonClass}>
        <Download className="h-3.5 w-3.5" aria-hidden="true" /><span className="hidden sm:inline">Report</span><ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white p-1 shadow-xl dark:border-white/10 dark:bg-[#26262a]">
          {[["xlsx", "Excel workbook", FileSpreadsheet], ["pdf", "PDF report", FileText]].map(([format, label, Icon]) => (
            <button key={format} type="button" role="menuitem" disabled={Boolean(busy)} onClick={() => run(format)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:text-zinc-200 dark:hover:bg-white/[0.05] ${focusRing}`}>
              {busy === format ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />}{label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Period (presets or custom dates), refresh and the report download. */
export function PeriodControls({ range, onRange, refreshing, onRefresh, onDownload, updatedAt }) {
  const [custom, setCustom] = useState({ from: range.from || "", to: range.to || "" });
  const [showCustom, setShowCustom] = useState(false);
  const options = [...PERIODS, { id: "custom", label: "Custom", short: "Custom", icon: CalendarRange }];
  const choose = (id) => {
    if (id === "custom") { setShowCustom(true); return; }
    setShowCustom(false);
    onRange({ period: id });
  };
  const validCustom = custom.from && custom.to && custom.from <= custom.to;
  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <Segmented label="Period" options={options} value={showCustom ? "custom" : range.period} onChange={choose} size="sm" />
      <button type="button" onClick={onRefresh} disabled={refreshing} className={buttonClass} aria-label="Refresh" title={updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : "Refresh"}>
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      </button>
      <DownloadMenu onDownload={onDownload} />
      {showCustom && (
        <form className="absolute right-0 top-full z-40 mt-2 flex flex-wrap items-end gap-2 rounded-2xl border border-[#e9eaee] bg-white p-3 shadow-xl dark:border-white/[0.07] dark:bg-[#26262a]"
          onSubmit={(event) => { event.preventDefault(); if (validCustom) { onRange({ period: "custom", from: custom.from, to: custom.to }); setShowCustom(false); } }}>
          {[["from", "From"], ["to", "To"]].map(([field, label]) => (
            <label key={field} className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{label}
              <input type="date" value={custom[field]} max={todayKey()} onChange={(event) => setCustom((value) => ({ ...value, [field]: event.target.value }))}
                className="mt-1 block h-8 rounded-lg border border-[#e4e7ec] bg-white px-2 text-[12.5px] text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:[color-scheme:dark]" />
            </label>
          ))}
          <button type="submit" disabled={!validCustom} className={primaryButtonClass}>Apply</button>
          <button type="button" onClick={() => setShowCustom(false)} className={buttonClass}>Cancel</button>
        </form>
      )}
    </div>
  );
}

function Chip({ icon: Icon, children, to, title }) {
  const body = <><Icon className="h-3.5 w-3.5" aria-hidden="true" />{children}</>;
  const className = "inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[12px] font-semibold text-white ring-1 ring-inset ring-white/20 backdrop-blur-sm transition hover:bg-white/20";
  return to ? <Link to={to} title={title} className={`${className} ${focusRing}`}>{body}</Link> : <span title={title} className={className}>{body}</span>;
}

/** Profile-style banner: who, level, streak, badges, Prep Score and the preparation estimate. */
export function ProfileBanner({ insights, badges }) {
  const reduce = useReducedMotion();
  const { student, activity, coverage, prepScore } = insights;
  const level = badges?.level;
  const prep = coverage?.preparation;
  const meta = [student.studentId, student.semester ? `Semester ${student.semester}` : "", student.branch || student.course].filter(Boolean).join(" · ");
  return (
    <motion.header data-guide="an-banner" initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-600 via-sky-700 to-blue-900 p-5 text-white shadow-[0_20px_50px_-24px_rgba(3,105,161,0.65)] sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:22px_22px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-blue-400/25 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-5 sm:gap-4">
          <div className="relative shrink-0">
            {student.avatarUrl
              ? <img src={student.avatarUrl} alt="" className="h-16 w-16 rounded-2xl object-cover ring-4 ring-white/25 sm:h-[72px] sm:w-[72px]" />
              : <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 text-[24px] font-bold ring-4 ring-white/20 sm:h-[72px] sm:w-[72px]" aria-hidden="true">{initials(student.name)}</span>}
            {level && <span className="absolute -bottom-2 -right-2"><LevelMedallion level={level.level} size="sm" /></span>}
          </div>
          <div className="min-w-0">
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-sky-100/90">Prep Analysis</p>
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] sm:text-[28px]">{student.name || "Your preparation"}</h1>
              <PageGuideButton size="sm" />
            </div>
            {meta && <p className="truncate text-[12.5px] text-sky-100/85">{meta}</p>}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Chip icon={Flame} title="Days in a row with any activity">{activity.streak.current ? `${activity.streak.current}-day streak` : `Last active ${daysAgoText(activity.daysSinceActive).toLowerCase()}`}</Chip>
              {level && <Chip icon={Trophy} to={sectionPath("badges")}>Level {level.level} · {level.title}</Chip>}
              {badges?.total > 0 && <Chip icon={Award} to={sectionPath("badges")}>{badges.earned.length}/{badges.total} badges</Chip>}
              {prepScore && <Chip icon={BarChart3} to="/student/rankings" title="Your Prep Score and rank">Prep Score {formatNumber(prepScore.total)}</Chip>}
            </div>
          </div>
        </div>
        {prep && (
          <div data-guide="an-prep" className="flex items-center gap-4 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
            <div>
              <p className="text-[11.5px] font-medium text-sky-100">Preparation</p>
              <p className="text-[34px] font-semibold leading-none tracking-[-0.03em]"><CountUp value={Math.round(prep.percent)} />%</p>
              <p className="mt-1 text-[11.5px] font-semibold text-sky-100">{preparationLevel(prep.percent).label}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-sky-50/90">
              <span><b className="text-white">{prep.states.strong}</b> strong</span>
              <span><b className="text-white">{prep.states.building}</b> building</span>
              <span><b className="text-white">{prep.states.needsWork}</b> needs work</span>
              <span><b className="text-white">{prep.states.notStarted}</b> not started</span>
            </div>
          </div>
        )}
      </div>
    </motion.header>
  );
}

/** Tabs to each Prep Analysis page the student may open. */
export function PageTabs({ sections, active }) {
  return (
    <div data-guide="an-tabs" className="sticky top-[calc(3rem+1px)] z-30 -mx-3 border-b lg:top-[calc(4rem+1px)] border-[#e9eaee]/80 bg-[#f6f7f9]/85 px-3 py-2 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8 dark:border-white/[0.06] dark:bg-[#1a1a1a]/85">
      <div>
        <nav aria-label="Prep Analysis pages" className="min-w-0">
          <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
            {sections.map((section) => {
              const Icon = SECTION_ICONS[section.id];
              const current = section.id === active;
              return (
                <li key={section.id} className="relative">
                  <Link to={sectionPath(section.id)} aria-current={current ? "page" : undefined}
                    className={`relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-[12.5px] font-semibold transition ${focusRing} ${current ? "text-sky-700 dark:text-sky-300" : "text-slate-500 hover:bg-white/70 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"}`}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />{section.label}
                  </Link>
                  {current && <motion.span layoutId="analysis-tab" className="absolute inset-0 rounded-xl bg-white shadow-sm ring-1 ring-black/[0.04] dark:bg-[#2c2c2f] dark:ring-white/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
