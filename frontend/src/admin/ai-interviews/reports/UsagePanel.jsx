import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarRange, Clock, Coins, Cpu, Database, Info, RefreshCw, Users } from "lucide-react";
import { reportApi } from "../api";
import { KpiTile } from "../schedules/scheduleUi";
import { EmptyState, FilterField, Notice, Panel, Select, ToneChip, inputClass, secondaryClass, tableHeadClass, tableRowClass } from "../ui";
import { usageApi } from "./usageApi";
import { SortHeader, TablePager, useClientTable } from "../../../components/table";
import { USAGE_MAX_DAYS, istDate, presetRange, rangeError } from "./usageRange";

const PRESETS = [
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: String(USAGE_MAX_DAYS), label: `Last ${USAGE_MAX_DAYS} days` },
  { value: "custom", label: "Custom range" },
];
// Plain names for the ledger kinds.
const KIND_LABELS = {
  live: { label: "Live conversation", detail: "ANVI speaking and listening during interviews" },
  transcribe: { label: "Answer transcription", detail: "Turning recorded answers into text" },
  generate: { label: "Question generation", detail: "Questions ANVI writes for each student" },
  evaluate: { label: "Report scoring", detail: "Marking answers and writing reports" },
  transcribe_accurate: { label: "Accurate transcription", detail: "A second, more careful pass over unclear answers" },
  decision: { label: "Follow-up decisions", detail: "Choosing whether to ask a follow-up or move on" },
  tts: { label: "Question audio", detail: "Turning questions into ANVI's voice (cached and reused)" },
};
const kindLabel = (kind) => KIND_LABELS[kind]?.label || kind;

// Token counts read like AI prices do ("1.2M"), not in lakh.
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-IN");
const tokens = (n) => (n >= 10_000 ? compact.format(n) : whole.format(n || 0));
function money(value, currency = "USD") {
  if (value === null || value === undefined) return "Price not set";
  const n = Number(value) || 0;
  const format = (digits) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
  if (n > 0 && n < 0.01) return `< ${new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(0.01)}`;
  return format(n >= 100 ? 0 : 2);
}
const minutes = (n) => `${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 1 })} min`;
const dayLabel = (day) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const known = (value) => value !== null && value !== undefined && Number.isFinite(Number(value));
const percent = (rate) => `${Math.round(Number(rate) * 100)}%`;

// Modality-aware cost (reports that send `cost`): INR first, USD beside it. An unknown cost is shown
// as "Incomplete", never as 0.
function costParts(usd, inr) {
  if (!known(usd)) return { primary: "Incomplete", secondary: "", incomplete: true };
  if (!known(inr)) return { primary: money(usd, "USD"), secondary: "INR unknown", incomplete: true };
  return { primary: money(inr, "INR"), secondary: money(usd, "USD"), incomplete: false };
}
function CostCell({ usd, inr, className = "" }) {
  const { primary, secondary, incomplete } = costParts(usd, inr);
  return (
    <td data-cost-cell className={`px-3 py-2.5 text-right tabular-nums ${incomplete ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-white"} ${className}`}>
      {primary}
      {secondary && <span className="block text-xs text-slate-500 dark:text-gray-400">{secondary}</span>}
    </td>
  );
}

const WARNING_TEXT = {
  pricesIncomplete: (warning) => {
    const kinds = (warning.unpricedKinds || []).map(kindLabel).join(", ").toLowerCase();
    const parts = [];
    if (kinds) parts.push(`no price is set for ${kinds}`);
    if (warning.inrMissing) parts.push("the USD to INR rate is not set");
    return `The cost is incomplete: ${parts.join(" and ") || "some prices are not set"}.`;
  },
  avgAboveInr45: (warning) => `The average cost per completed attempt (${money(warning.value, "INR")}) is above ${money(warning.threshold, "INR")}.`,
  p90AboveInr60: (warning) => `1 in 10 completed attempts costs more than ${money(warning.value, "INR")}, above the ${money(warning.threshold, "INR")} limit.`,
  lowCacheHit: (warning) => `Only ${percent(warning.value)} of question audio came from the cache (target ${percent(warning.threshold)}).`,
  pricingExpired: (warning) => `The configured prices were valid until ${warning.validUntil ? new Date(warning.validUntil).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "an earlier date"}. Check the current Gemini prices.`,
};

function Warnings({ warnings }) {
  const shown = warnings.filter((warning) => WARNING_TEXT[warning.code]);
  if (!shown.length) return null;
  return (
    <div data-usage-warnings role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-100">
      <ul className="space-y-1.5">
        {shown.map((warning) => (
          <li key={warning.code} data-warning={warning.code} className="flex items-start gap-2">
            <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{WARNING_TEXT[warning.code](warning)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Calls, cache hits, audio minutes and the per-attempt distribution (reports that send `cost`).
function HybridKpis({ data }) {
  const totals = data.totals || {};
  const cache = data.cache || {};
  const ttsCache = cache.tts || {};
  const transcriptCache = cache.transcript || {};
  const mins = data.minutes || {};
  const attempts = data.attempts || {};
  const per = attempts.perCompleted || {};
  const inr = per.inr || {};
  const usd = per.usd || {};
  const hits = (ttsCache.hits || 0) + (transcriptCache.hits || 0);
  const perValue = !per.completed ? "None yet" : known(inr.avg) ? money(inr.avg, "INR") : known(usd.avg) ? money(usd.avg, "USD") : "Incomplete";
  const spread = known(inr.p50) ? `p50 ${money(inr.p50, "INR")} · p90 ${money(inr.p90, "INR")}` : known(usd.p50) ? `p50 ${money(usd.p50, "USD")} · p90 ${money(usd.p90, "USD")}` : "";
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-usage-hybrid>
      <KpiTile label="AI calls" icon={Cpu} tone="sky" value={whole.format(totals.calls || 0)} detail="Requests sent to Gemini (cache hits are not calls)" />
      <KpiTile
        label="Cache hits"
        icon={Database}
        tone="emerald"
        value={whole.format(hits)}
        detail={[
          known(ttsCache.hitRate) ? `${percent(ttsCache.hitRate)} of question audio from cache` : "No question audio lookups yet",
          `${whole.format(cache.replays || 0)} replay${cache.replays === 1 ? "" : "s"} without a call`,
        ].join(" · ")}
      />
      <KpiTile
        label="Audio minutes"
        icon={Clock}
        tone="violet"
        value={minutes(mins.live)}
        detail={`Live · ${minutes(mins.studentAudio)} student answers · ${minutes(mins.tts)} question audio`}
      />
      <KpiTile
        label="Per completed attempt"
        icon={Users}
        tone={per.complete === false ? "amber" : "indigo"}
        value={perValue}
        detail={[
          spread || `${whole.format(per.completed || 0)} completed attempt${per.completed === 1 ? "" : "s"}`,
          per.complete === false ? "Incomplete: some attempts have an unknown cost" : "",
        ].filter(Boolean).join(" · ")}
      />
    </div>
  );
}

// The usage tables share one shape: every header sorts, the standard pager sits under the table.
// `columns`: [{ key, label, align?, className? (th extras, e.g. responsive visibility) }].
function UsageTable({ columns, rows, getValue, caption, tableProps, tableClassName, wrapperClassName = "overflow-x-auto", headClassName = tableHeadClass, children, noun = "rows" }) {
  const table = useClientTable(rows, { getValue });
  return (
    <>
      <div className={wrapperClassName}>
        <table data-no-serial {...tableProps} className={`w-full text-left text-sm ${tableClassName}`}>
          <caption className="sr-only">{caption}</caption>
          <thead className={headClassName}>
            <tr>
              {columns.map((column, index) => (
                <SortHeader
                  key={column.key}
                  sortKey={column.key}
                  sort={table.sort}
                  onSort={table.toggleSort}
                  align={column.align}
                  className={`py-3 tracking-wider ${index === 0 || index === columns.length - 1 ? "sm:px-5" : ""} ${column.className || ""}`}
                >{column.label}</SortHeader>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
            {table.pageRows.map(children)}
          </tbody>
        </table>
      </div>
      <TablePager {...table.pager} noun={noun} className="sm:px-5 dark:border-gray-800" />
    </>
  );
}

const usdOrNull = (value) => (known(value) ? Number(value) : null);
const legacyCost = (priced) => (row) => (priced ? usdOrNull(row.estimatedUsd) : usdOrNull(row.estimatedCost));
const reader = (values) => (row, key) => values[key]?.(row);

const DURATION_COLUMNS = [
  { key: "length", label: "Length" },
  { key: "attempts", label: "Attempts", align: "right" },
  { key: "p50", label: "p50 / p90 per completed", align: "right", className: "hidden sm:table-cell" },
  { key: "average", label: "Average per completed", align: "right" },
  { key: "total", label: "Total", align: "right" },
];
const durationValue = reader({
  length: (row) => usdOrNull(row.durationMinutes),
  attempts: (row) => Number(row.attempts || 0),
  p50: (row) => usdOrNull(row.perCompleted?.inr?.p50),
  average: (row) => usdOrNull(row.perCompleted?.inr?.avg),
  total: (row) => usdOrNull(row.estimatedUsd),
});

function ByDuration({ rows }) {
  return (
    <UsageTable columns={DURATION_COLUMNS} rows={rows} getValue={durationValue} caption="Cost by interview length" tableProps={{ "data-usage-by-duration": "" }} tableClassName="sm:min-w-[560px]" noun="lengths">
          {(row) => {
            const per = row.perCompleted || {};
            const inr = per.inr || {};
            return (
              <tr key={row.durationMinutes ?? "unknown"} className={tableRowClass}>
                <td className="px-3 py-2.5 sm:px-5 text-slate-800 dark:text-gray-200">{row.durationMinutes ? `${row.durationMinutes} min` : "Not recorded"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300">
                  {whole.format(row.attempts || 0)}
                  <span className="block text-xs text-slate-500 dark:text-gray-400">{whole.format(per.completed || 0)} completed</span>
                </td>
                <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell">
                  {known(inr.p50) ? `${money(inr.p50, "INR")} / ${money(inr.p90, "INR")}` : "–"}
                </td>
                <td className={`px-3 py-2.5 text-right tabular-nums ${per.complete === false ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-white"}`}>
                  {known(inr.avg) ? money(inr.avg, "INR") : per.completed ? "Incomplete" : "–"}
                </td>
                <CostCell usd={row.estimatedUsd} inr={row.estimatedInr} className="sm:px-5" />
              </tr>
            );
          }}
    </UsageTable>
  );
}

const KIND_COLUMNS = [
  { key: "activity", label: "Activity" },
  { key: "calls", label: "AI calls", align: "right", className: "hidden sm:table-cell" },
  { key: "tokens", label: "Tokens", align: "right", className: "hidden sm:table-cell" },
  { key: "share", label: "Share of tokens", className: "hidden w-40 sm:table-cell" },
  { key: "cost", label: "Estimated cost", align: "right" },
];

function ByKind({ rows, currency, priced }) {
  const total = rows.reduce((sum, row) => sum + (row.totalTokens || 0), 0);
  const getValue = useMemo(() => reader({
    activity: (row) => kindLabel(row.kind),
    calls: (row) => Number(row.calls || 0),
    tokens: (row) => Number(row.totalTokens || 0),
    share: (row) => Number(row.totalTokens || 0),
    cost: legacyCost(priced),
  }), [priced]);
  return (
    <UsageTable columns={KIND_COLUMNS} rows={rows} getValue={getValue} caption="Usage by activity" tableProps={{ "data-usage-by-kind": "" }} tableClassName="sm:min-w-[640px]" noun="activities">
          {(row) => {
            const share = total ? Math.round(((row.totalTokens || 0) / total) * 100) : 0;
            return (
              <tr key={row.kind} className={tableRowClass}>
                <td className="px-3 py-3 sm:px-5">
                  <p className="font-medium text-slate-900 dark:text-white">{kindLabel(row.kind)}</p>
                  {KIND_LABELS[row.kind] && <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{KIND_LABELS[row.kind].detail}</p>}
                </td>
                <td className="hidden px-3 py-3 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell">{whole.format(row.calls || 0)}</td>
                <td className="hidden px-3 py-3 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell" title={`${whole.format(row.inputTokens || 0)} in · ${whole.format(row.outputTokens || 0)} out`}>
                  {tokens(row.totalTokens)}
                </td>
                <td className="hidden px-3 py-3 sm:table-cell">
                  <div className="flex items-center gap-2">
                    <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                      <div className="h-full rounded-full bg-sky-500 dark:bg-sky-400" style={{ width: `${share}%` }} />
                    </div>
                    <span className="w-9 text-right text-xs tabular-nums text-slate-500 dark:text-gray-400">{share}%</span>
                  </div>
                </td>
                {priced ? (
                  <CostCell usd={row.estimatedUsd} inr={row.estimatedInr} className="sm:px-5" />
                ) : (
                  <td className={`px-3 py-3 sm:px-5 text-right tabular-nums ${row.estimatedCost === null ? "text-amber-700 dark:text-amber-300" : "text-slate-900 dark:text-white"}`}>
                    {money(row.estimatedCost, currency)}
                  </td>
                )}
              </tr>
            );
          }}
    </UsageTable>
  );
}

const DAY_COLUMNS = [
  { key: "day", label: "Day" },
  { key: "sessions", label: "Sessions", align: "right", className: "hidden sm:table-cell" },
  { key: "liveMinutes", label: "Live minutes", align: "right" },
  { key: "tokens", label: "Tokens", align: "right", className: "hidden sm:table-cell" },
  { key: "cost", label: "Estimated cost", align: "right" },
];
const INTERVIEW_COLUMNS = [
  { key: "interview", label: "Interview" },
  { key: "sessions", label: "Sessions", align: "right" },
  { key: "liveMinutes", label: "Live minutes", align: "right", className: "hidden sm:table-cell" },
  { key: "tokens", label: "Tokens", align: "right", className: "hidden sm:table-cell" },
  { key: "cost", label: "Estimated cost", align: "right" },
];

function ByDay({ rows, currency, priced }) {
  // Newest day first unless a header sort is chosen.
  const newestFirst = useMemo(() => [...rows].reverse(), [rows]);
  const getValue = useMemo(() => reader({
    day: (row) => row.day || null,
    sessions: (row) => Number(row.sessions || 0),
    liveMinutes: (row) => Number(row.liveMinutes || 0),
    tokens: (row) => Number(row.totalTokens || 0),
    cost: legacyCost(priced),
  }), [priced]);
  return (
    <UsageTable columns={DAY_COLUMNS} rows={newestFirst} getValue={getValue} caption="Usage by day (IST)" tableProps={{ "data-usage-by-day": "" }} tableClassName="sm:min-w-[560px]" wrapperClassName="max-h-[420px] overflow-auto" headClassName={`${tableHeadClass} sticky top-0`} noun="days">
          {(row) => (
            <tr key={row.day} className={tableRowClass}>
              <td className="whitespace-nowrap px-3 py-2.5 sm:px-5 text-slate-800 dark:text-gray-200">{dayLabel(row.day)}</td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell">{whole.format(row.sessions || 0)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300">{minutes(row.liveMinutes)}</td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell">{tokens(row.totalTokens)}</td>
              {priced ? (
                <CostCell usd={row.estimatedUsd} inr={row.estimatedInr} className="sm:px-5" />
              ) : (
                <td className="px-3 py-2.5 sm:px-5 text-right tabular-nums text-slate-900 dark:text-white">{money(row.estimatedCost, currency)}</td>
              )}
            </tr>
          )}
    </UsageTable>
  );
}

// Optional: a per-interview breakdown, shown when the server sends one (`byInterview`).
function ByInterview({ rows, currency, titles, priced }) {
  const getValue = useMemo(() => reader({
    interview: (row) => row.title || titles.get(row.interviewId) || null,
    sessions: (row) => Number(row.sessions || 0),
    liveMinutes: (row) => Number(row.liveMinutes || 0),
    tokens: (row) => Number(row.totalTokens || 0),
    cost: legacyCost(priced),
  }), [priced, titles]);
  return (
    <UsageTable columns={INTERVIEW_COLUMNS} rows={rows} getValue={getValue} caption="Usage by interview" tableProps={{ "data-usage-by-interview": "" }} tableClassName="sm:min-w-[560px]" noun="interviews">
          {(row) => (
            <tr key={row.interviewId} className={tableRowClass}>
              <td className="px-3 py-2.5 sm:px-5 text-slate-800 dark:text-gray-200">{row.title || titles.get(row.interviewId) || "Untitled interview"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300">{whole.format(row.sessions || 0)}</td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell">{minutes(row.liveMinutes)}</td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-slate-700 dark:text-gray-300 sm:table-cell">{tokens(row.totalTokens)}</td>
              {priced ? (
                <CostCell usd={row.estimatedUsd} inr={row.estimatedInr} className="sm:px-5" />
              ) : (
                <td className="px-3 py-2.5 sm:px-5 text-right tabular-nums text-slate-900 dark:text-white">{money(row.estimatedCost, currency)}</td>
              )}
            </tr>
          )}
    </UsageTable>
  );
}

/** Gemini usage and estimated cost of the admin's interviews over a date range. */
export default function UsagePanel() {
  const [preset, setPreset] = useState("30");
  const [custom, setCustom] = useState(() => presetRange(30));
  const [interviewId, setInterviewId] = useState("");
  const [interviews, setInterviews] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [round, setRound] = useState(0);

  const range = preset === "custom" ? custom : presetRange(Number(preset));
  const invalid = preset === "custom" ? rangeError(custom) : "";
  const { from, to } = range;

  useEffect(() => {
    let active = true;
    reportApi
      .list({ limit: 25 })
      .then((value) => { if (active) setInterviews(value?.interviews || []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (invalid) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    usageApi
      .get({ from, to, interviewId })
      .then((value) => { if (active) setData(value); })
      .catch((cause) => { if (active) setError(cause.message || "Usage could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, to, interviewId, invalid, round]);

  const titles = useMemo(() => new Map(interviews.map((row) => [row.id, row.title])), [interviews]);
  const currency = data?.pricing?.currency || "USD";
  const totals = data?.totals || {};
  const sessions = data?.sessions || {};
  const empty = data && !totals.calls && !sessions.count;
  const unpriced = (data?.pricing?.unpricedKinds || []).map(kindLabel);
  // Newer servers send the modality-aware `cost` (USD and INR, null = unknown); older ones only the
  // legacy estimate, shown as before.
  const cost = data?.cost || null;
  const priced = Boolean(cost);
  const costNow = priced ? costParts(cost.usd, cost.inr) : null;
  const costUnpriced = (cost?.unpricedKinds || []).map(kindLabel).join(", ").toLowerCase();
  const costDetail = !priced ? "" : cost.complete
    ? `${costNow.secondary ? `${costNow.secondary} · ` : ""}from configured prices${cost.repriced ? " (older rows priced today)" : ""}`
    : !known(cost.usd)
      ? `Incomplete: no price set for ${costUnpriced || "some activities"}`
      : "Incomplete: the USD to INR rate is not set";

  return (
    <div className="space-y-4" data-usage-panel>
      <Panel
        title="AI usage and cost"
        description="How much ANVI was used in your interviews, and what it is estimated to cost."
        icon={Activity}
        action={
          <button type="button" className={secondaryClass} onClick={() => setRound((n) => n + 1)} aria-label="Refresh usage">
            <RefreshCw size={14} aria-hidden="true" />
          </button>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <FilterField label="Period" className="sm:w-48">
            <Select aria-label="Period" value={preset} options={PRESETS} onChange={(e) => {
              const value = e.target.value;
              if (value === "custom") setCustom(range);
              setPreset(value);
            }} />
          </FilterField>
          {preset === "custom" && (
            <>
              <FilterField label="From" className="sm:w-44">
                <input type="date" aria-label="From" className={inputClass} value={custom.from} max={istDate()} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              </FilterField>
              <FilterField label="To" className="sm:w-44">
                <input type="date" aria-label="To" className={inputClass} value={custom.to} max={istDate()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
              </FilterField>
            </>
          )}
          <FilterField label="Interview" className="sm:w-72">
            <Select
              aria-label="Interview"
              value={interviewId}
              onChange={(e) => setInterviewId(e.target.value)}
              options={[{ value: "", label: "All my interviews" }, ...interviews.map((row) => ({ value: row.id, label: row.title }))]}
            />
          </FilterField>
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400 sm:ml-auto sm:pb-2.5">
            <CalendarRange size={14} aria-hidden="true" />
            {dayLabel(from)} – {dayLabel(to)} (IST)
          </p>
        </div>
        {invalid && <p role="alert" className="mt-3 text-sm text-rose-600 dark:text-rose-400">{invalid}</p>}
      </Panel>

      {error && <Notice error>{error}</Notice>}
      {loading && !data && !error && (
        <p aria-busy="true" className="py-10 text-center text-sm text-slate-500 dark:text-gray-400">Loading usage…</p>
      )}
      {data && (
        <div className={`space-y-4 ${loading ? "opacity-60 transition-opacity" : ""}`} aria-busy={loading || undefined}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-usage-kpis>
            <KpiTile label="Sessions" icon={Activity} tone="sky" value={whole.format(sessions.count || 0)} detail={`${whole.format(sessions.attempts || 0)} interview attempt${sessions.attempts === 1 ? "" : "s"}`} />
            <KpiTile label="Live minutes" icon={Clock} tone="violet" value={minutes(sessions.liveMinutes)} detail="Time students spent talking with ANVI" />
            <KpiTile label="Tokens" icon={Cpu} tone="indigo" value={tokens(totals.totalTokens)} detail={`${tokens(totals.inputTokens)} in · ${tokens(totals.outputTokens)} out`} />
            {priced ? (
              <KpiTile label="Estimated cost" icon={Coins} tone={cost.complete ? "emerald" : "amber"} value={costNow.primary} detail={costDetail} />
            ) : (
              <KpiTile
                label="Estimated cost"
                icon={Coins}
                tone={totals.complete === false ? "amber" : "emerald"}
                value={money(totals.estimatedCost, currency)}
                detail={totals.complete === false ? `Partial: no price set for ${unpriced.join(", ").toLowerCase() || "some activities"}` : `In ${currency}, from configured prices`}
              />
            )}
          </div>
          {priced && !cost.complete && !empty && (
            <p className="flex items-center gap-2 px-1 text-xs text-slate-600 dark:text-gray-300" data-usage-incomplete>
              <ToneChip tone="amber">Incomplete</ToneChip>
              Costs with a missing price are left out rather than counted as zero.
            </p>
          )}
          {priced && <Warnings warnings={Array.isArray(data.warnings) ? data.warnings : []} />}
          {priced && !empty && <HybridKpis data={data} />}
          {priced && !empty && ((data.attempts?.economical || 0) > 0 || (data.attempts?.cachedOnly || 0) > 0) && (
            <p className="px-1 text-xs text-slate-500 dark:text-gray-400" data-usage-budget>
              Budget: {whole.format(data.attempts.economical || 0)} attempt{data.attempts.economical === 1 ? "" : "s"} switched to economical mode
              {" "}and {whole.format(data.attempts.cachedOnly || 0)} to cached-only ({whole.format(data.attempts.cachedOnlyCompleted || 0)} of them completed).
            </p>
          )}
          {empty ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white dark:border-gray-800 dark:bg-gray-900">
              <EmptyState title="No usage in this period" detail="When students take your interviews, ANVI's usage and its estimated cost appear here." />
            </div>
          ) : (
            <>
              <Panel title="By activity" description="What the AI was used for." bodyClassName="">
                <ByKind rows={data.byKind || []} currency={currency} priced={priced} />
              </Panel>
              {Array.isArray(data.byInterview) && data.byInterview.length > 0 && !interviewId && (
                <Panel title="By interview" bodyClassName="">
                  <ByInterview rows={data.byInterview} currency={currency} titles={titles} priced={priced} />
                </Panel>
              )}
              {priced && Array.isArray(data.byDuration) && data.byDuration.length > 0 && (
                <Panel title="By interview length" description="Per completed attempt, for attempts in this period." bodyClassName="">
                  <ByDuration rows={data.byDuration} />
                </Panel>
              )}
              <Panel title="By day" description="Newest first. Days are in IST." bodyClassName="">
                {data.byDay?.length ? (
                  <ByDay rows={data.byDay} currency={currency} priced={priced} />
                ) : (
                  <p className="px-5 py-6 text-sm text-slate-500 dark:text-gray-400">No daily usage in this period.</p>
                )}
              </Panel>
            </>
          )}
          <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
            <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            {priced
              ? `Costs are estimates in INR and USD from the prices set for this platform${known(cost.usdInrRate) ? ` (USD 1 = INR ${cost.usdInrRate})` : ""} and can differ from the actual bill. Each call keeps the price it was estimated with. Usage is kept for ${USAGE_MAX_DAYS} days.`
              : <>Costs are estimates from the prices set for this platform ({data.pricing?.unit || "per 1M tokens"}) and can differ from the actual bill. Usage is kept for {USAGE_MAX_DAYS} days.</>}
          </p>
        </div>
      )}
    </div>
  );
}
