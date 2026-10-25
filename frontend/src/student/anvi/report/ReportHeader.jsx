import { Download, Loader2 } from "lucide-react";
import { BandChip, Chip, Icon, IconTile, PeerPrepLogo, ScoreRing } from "./parts";
import { focusRing, muted, reportCard } from "./styles";
import { marks } from "./reportModel";

// A faint dot grid in the header's top-right corner: decoration only.
function CoverPattern() {
  return <svg aria-hidden="true" className="pointer-events-none absolute right-0 top-0 h-40 w-72 text-sky-500/[0.14] dark:text-sky-300/[0.07]" viewBox="0 0 288 160" fill="currentColor">
    {Array.from({ length: 8 }, (_, row) => Array.from({ length: 14 }, (__, col) => {
      const fade = Math.max(0, 1 - (row / 8 + (13 - col) / 14) * 0.9);
      return fade > 0.08 ? <circle key={`${row}-${col}`} cx={14 + col * 20} cy={12 + row * 20} r="1.6" opacity={fade} /> : null;
    }))}
  </svg>;
}

const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

/**
 * The report header: PeerPrep logo and Download PDF, the score ring with its band, the interview title with
 * role · company · type · difficulty · duration chips, then the candidate, date, status and, for a
 * proctored attempt, the "Proctoring details" button.
 */
export function ReportHeader({ model, headingLevel = 1, onDownload, downloading = false, onProctoring }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  const { score, integrity, candidate } = model;
  const date = model.meta.find((item) => item.key === "date");
  return <section className={`${reportCard} relative overflow-hidden !p-0`} aria-label="Report summary" data-report-header>
    <div aria-hidden="true" className="h-1 bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-400" />
    <CoverPattern />
    <div className="relative px-5 pb-6 pt-5 sm:px-7 sm:pt-6">
      <div className="flex items-center justify-between gap-3">
        <PeerPrepLogo className="h-7 w-auto sm:h-8" />
        <button type="button" onClick={onDownload} disabled={downloading} data-report-download aria-busy={downloading || undefined}
          className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-sky-600 px-3.5 text-sm font-semibold text-white shadow-[0_1px_2px_rgba(2,132,199,0.3)] transition hover:bg-sky-700 disabled:cursor-wait disabled:opacity-80 dark:bg-sky-500 dark:text-sky-950 dark:hover:bg-sky-400 ${focusRing}`}>
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {downloading ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
      <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-7">
        {score && <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:gap-2.5" data-report-score>
          <ScoreRing percent={score.percent} band={score.band} tone={score.tone} size={124} />
          <div className="flex flex-col items-start gap-1.5 sm:items-center">
            <BandChip band={score.band} tone={score.tone} />
            {score.marks && <p className={`text-xs tabular-nums ${muted}`}><span className="font-semibold text-slate-800 dark:text-zinc-100">{marks(score.marks.score)}</span> / {marks(score.marks.max)} marks</p>}
          </div>
        </div>}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-sky-700 dark:text-sky-300">AI Interview Report</p>
          <Heading className="mt-1.5 text-2xl font-semibold leading-tight tracking-[-0.02em] text-slate-900 [text-wrap:balance] dark:text-zinc-50 sm:text-[28px]">{model.title}</Heading>
          {model.chips.length > 0 && <ul className="mt-3.5 flex flex-wrap gap-1.5" aria-label="Interview details" data-report-chips>
            {model.chips.map((chip) => <li key={chip.key} data-chip={chip.key}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200">
              <Icon name={chip.icon} className="h-3.5 w-3.5 text-sky-600 dark:text-sky-300" />{chip.label}
            </li>)}
          </ul>}
          {(model.partial || model.flags.length > 0) && <p className="mt-3 flex flex-wrap items-center gap-1.5" data-report-flags>
            {model.partial && <Chip tone="caution" icon="triangleAlert">Ended early — only the saved responses were evaluated</Chip>}
            {model.flags.map((flag) => <Chip key={flag.key} tone={flag.tone} icon="flag">{flag.label}</Chip>)}
          </p>}
          {score?.summary && <p className={`mt-3 text-sm ${muted}`} data-report-summary>{score.summary}</p>}
        </div>
      </div>
    </div>
    <div className="relative flex flex-col gap-4 border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-white/[0.06] dark:bg-white/[0.02] sm:flex-row sm:flex-wrap sm:items-center sm:px-7" data-report-meta>
      {candidate && <div className="flex min-w-0 items-center gap-3 sm:mr-auto" data-report-candidate>
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[13px] font-semibold text-sky-800 dark:bg-sky-400/15 dark:text-sky-200">{initials(candidate.name) || <Icon name="user" />}</span>
        <div className="min-w-0">
          <p className={`text-[11px] ${muted}`}>Candidate</p>
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-zinc-50">{candidate.name}</p>
          {candidate.ids && <p className={`text-xs ${muted} [overflow-wrap:anywhere]`}>{candidate.ids}</p>}
        </div>
      </div>}
      <dl className={`flex flex-wrap items-center gap-x-6 gap-y-3 ${candidate ? "" : "sm:mr-auto"}`}>
        {date && <div className="flex items-center gap-2.5"><IconTile name="calendar" tone="neutral" size="sm" /><div><dt className={`text-[11px] ${muted}`}>Date &amp; time</dt><dd className="text-sm font-semibold text-slate-900 dark:text-zinc-50">{date.value}</dd></div></div>}
        {model.meta.filter((item) => item.key === "status").map((item) => <div key={item.key} className="flex items-center gap-2.5">
          <IconTile name={item.icon} tone={item.tone === "positive" ? "positive" : item.tone} size="sm" />
          <div><dt className={`text-[11px] ${muted}`}>Status</dt><dd className="text-sm font-semibold text-slate-900 dark:text-zinc-50">{item.value}{item.detail ? <span className={`font-normal ${muted}`}> · {item.detail}</span> : null}</dd></div>
        </div>)}
      </dl>
      {integrity && <button type="button" onClick={onProctoring} data-report-integrity-chip aria-haspopup="dialog"
        className={`inline-flex h-9 shrink-0 items-center gap-2 self-start rounded-lg border px-3 text-sm font-semibold transition sm:self-auto ${focusRing} ${integrity.violations
          ? "border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-amber-400/25 dark:bg-amber-400/[0.08] dark:text-amber-100 dark:hover:bg-amber-400/[0.14]"
          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08]"}`}>
        <Icon name={integrity.violations ? "shieldAlert" : "shieldCheck"} className="h-4 w-4" />
        Proctoring details
        <span className={`rounded-full px-1.5 text-[11px] tabular-nums ${integrity.violations ? "bg-amber-200/70 dark:bg-amber-400/20" : "bg-slate-100 dark:bg-white/10"}`}>
          {integrity.violations ?? 0}<span className="sr-only"> violation{integrity.violations === 1 ? "" : "s"}</span>
        </span>
      </button>}
    </div>
  </section>;
}

const KPI_COLUMNS = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };

/** Key points, answer length, pace and fillers as tiles; a tile without data is left out. */
export function KpiGrid({ model }) {
  if (!model.kpis.length) return null;
  return <dl className={`grid grid-cols-2 gap-3 ${KPI_COLUMNS[model.kpis.length] || "sm:grid-cols-4"}`} aria-label="Key figures" data-report-kpis>
    {model.kpis.map((tile) => <div key={tile.key} className={`${reportCard} flex min-w-0 flex-col gap-3 !p-4`}>
      <div className="flex items-center gap-2">
        <IconTile name={tile.icon} size="sm" />
        <dt className={`min-w-0 text-xs font-medium ${muted}`}>{tile.label}</dt>
      </div>
      <div>
        <dd className="text-xl font-semibold leading-tight tracking-[-0.01em] tabular-nums text-slate-900 dark:text-zinc-50">{tile.value}</dd>
        {tile.detail && <dd className={`mt-1 text-xs ${muted}`}>{tile.detail}</dd>}
      </div>
    </div>)}
  </dl>;
}
