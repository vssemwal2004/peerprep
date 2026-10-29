import { ArrowRight, CalendarClock, Clock3, Eye, FileText, Languages, Loader2, Mic, Play, Radio } from "lucide-react";
import ActionMenu from "./ActionMenu";
import InterviewRow from "./InterviewRow";
import { factsOf, formatISTShort, scoreOf } from "./listModel";
import { languageLabel, resumeSetupOf } from "../anviStartSetup";
import { btn, cardSurface } from "./styles";
import { DateTile, Meta, ScoreBadge, StatusChip } from "./ui";

const subtitleOf = (item) => [item.role, item.companyName].filter(Boolean).join(" · ") || "General practice";

/** A practice interview that is running (Ongoing) or finished (Completed), as a row. */
export function PracticeRow({ entry, onOpen, busy, locked, now = Date.now() }) {
  const { item } = entry;
  const active = item.status === "active";
  const endedAt = item.lastAttempt?.endedAt;
  const preparing = !active && item.lastAttempt?.status === "evaluating";
  const tile = active ? <DateTile value={item.lastAttempt?.startedAt || now} tone="violet" pulse /> : <DateTile value={endedAt || item.completedAt || item.updatedAt} />;
  const chip = active ? <StatusChip tone="violet" pulse>In progress</StatusChip>
    : preparing ? <StatusChip tone="sky">Report preparing</StatusChip>
      : <StatusChip tone="emerald">Report ready</StatusChip>;
  const meta = active ? <Meta icon={Radio}>Your attempt is still open</Meta>
    : endedAt ? <Meta icon={CalendarClock}>Finished {formatISTShort(endedAt)}</Meta> : null;
  const primary = active
    ? <button type="button" onClick={() => onOpen(item)} disabled={locked} className={btn.primary}>{busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}Continue{!busy && <ArrowRight className="h-4 w-4" aria-hidden="true" />}</button>
    : <button type="button" onClick={() => onOpen(item)} disabled={locked || !item.lastAttempt?.id} className={btn.secondary}><Eye className="h-4 w-4" aria-hidden="true" />View report</button>;
  return <InterviewRow data-practice={item.id} tile={tile} title={item.title} chip={chip}
    badge={active || preparing ? null : <ScoreBadge score={scoreOf(item)} />}
    subtitle={subtitleOf(item)} meta={meta} facts={["Practice", ...factsOf(item)]} primary={primary} />;
}

/** A practice interview not started yet, as a compact grid card ("Practice anytime"). */
export function PracticeCard({ entry, onOpen, onReport, busy, locked }) {
  const { item } = entry;
  // The resume, language and terms are settled in the lobby that Start practice opens.
  const resume = resumeSetupOf(item);
  const usesResume = resume.mode !== "none";
  const language = languageLabel(item.languageSetup || item.language);
  // An attempt that ended early is still scored; its report stays one click away.
  const earlierReport = item.lastAttempt?.id && ["ready", "evaluating"].includes(item.lastAttempt.status) ? item.lastAttempt.id : null;
  return <li data-practice={item.id} className={`${cardSurface} flex h-full flex-col p-4 transition-colors hover:border-slate-300/80 dark:hover:border-white/[0.14] sm:p-5`}>
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300" aria-hidden="true">
        {usesResume ? <FileText className="h-5 w-5" strokeWidth={1.75} /> : <Mic className="h-5 w-5" strokeWidth={1.75} />}
      </span>
      <div className="flex items-center gap-1.5">
        {earlierReport ? <StatusChip tone="slate">Tried before</StatusChip> : usesResume ? <StatusChip tone="sky">{resume.mode === "required" ? "Needs your resume" : "Can use your resume"}</StatusChip> : null}
        {earlierReport && <ActionMenu label={item.title} items={[{ id: "report", label: "Last attempt report", icon: Eye, onSelect: () => onReport(earlierReport) }]} />}
      </div>
    </div>
    <h3 className="mt-3.5 line-clamp-2 text-[15px] font-semibold leading-snug text-slate-900 dark:text-zinc-50">{item.title}</h3>
    <p className="mt-0.5 truncate text-[13px] text-slate-500 dark:text-zinc-400">{subtitleOf(item)}</p>
    <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-slate-600 dark:text-zinc-300">
      {language && <Meta icon={Languages}>{language}</Meta>}
      {item.estimatedMinutes > 0 && <Meta icon={Clock3}>{Math.round(item.estimatedMinutes)} min</Meta>}
    </div>
    <div className="mt-auto flex justify-end pt-4">
      <button type="button" onClick={() => onOpen(item)} disabled={locked} className={`${btn.soft} w-full sm:w-auto`}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}Start practice
      </button>
    </div>
  </li>;
}

/**
 * Practice closed because the institution scheduled the same interview: one quiet note instead of
 * disabled cards that look like errors.
 */
export function BlockedPracticeNote({ entries }) {
  if (!entries?.length) return null;
  return <div data-practice-blocked={entries.map((entry) => entry.id).join(" ")} className={`${cardSurface} flex items-start gap-3 px-4 py-4`} role="status">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">
      <CalendarClock className="h-4 w-4" aria-hidden="true" />
    </span>
    <div>
      <p className="text-sm font-semibold text-slate-900 dark:text-zinc-50">Practice temporarily unavailable</p>
      <p className="mt-0.5 text-sm leading-6 text-slate-500 dark:text-zinc-400">Practice will be available after the current institutional schedule ends.</p>
    </div>
  </div>;
}
