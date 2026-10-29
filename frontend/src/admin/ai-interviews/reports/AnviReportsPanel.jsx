import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Activity, CalendarClock, Eye, FileBarChart, Languages, Loader2, RefreshCw, ShieldAlert, X } from "lucide-react";
import UsagePanel from "./UsagePanel";
import AnviReport from "../../../student/anvi/AnviReport";
import { IntegritySection, WarmupTranscript } from "../../../student/anvi/report/ReportSections";
import { RESUME_SOURCE_LABELS, endReasonLabel, proctoringOf } from "../../../student/anvi/report/reportModel";
import { reportApi } from "../api";
import { Badge, Drawer, EmptyState, Notice, Pagination, Panel, Select, ToneChip, secondaryClass, surfaceClass, tableHeadClass, tableRowClass } from "../ui";
import { formatIst } from "../schedules/scheduleModel";

const STATUS_LABELS = {
  in_progress: "In progress",
  completed: "Awaiting evaluation",
  evaluating: "Evaluating",
  ready: "Report ready",
  failed: "Evaluation failed",
  abandoned: "Ended early",
  expired: "Timed out",
};
const STATUS_TONES = { in_progress: "sky", completed: "amber", evaluating: "violet", ready: "emerald", failed: "rose", abandoned: "slate", expired: "slate" };
const STATUS_OPTIONS = [{ value: "", label: "All statuses" }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))];
// Every displayed time is IST (en-IN, Asia/Kolkata), like the Schedules pages and the CSV exports.
const dateTime = (value) => formatIst(value);
const marks = (value) => (Number.isInteger(Number(value)) ? String(Number(value)) : Number(value || 0).toFixed(1));

function StatusBadge({ row }) {
  // List rows carry a top-level `violations` (null when not proctored); the attempt detail a proctoring record.
  const violations = Number(row.violations ?? row.proctoring?.violations) || 0;
  return <span className="inline-flex flex-wrap items-center gap-1">
    <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status] || row.status}</Badge>
    {row.partial && row.status !== "abandoned" && row.status !== "expired" && <Badge>Partial</Badge>}
    {row.assignmentId && <ToneChip tone="indigo" icon={CalendarClock} className="text-[11px]">Scheduled</ToneChip>}
    {/* Shown when the attempt has violations (or ended at the violation limit). */}
    {(row.endReason === "proctoring_limit" || violations > 0) && <ToneChip tone="amber" icon={ShieldAlert} className="text-[11px]">
      {row.endReason === "proctoring_limit" ? "Ended: violations" : `${violations} violation${violations === 1 ? "" : "s"}`}
    </ToneChip>}
  </span>;
}

/** The re-evaluation prompt: a scheduled attempt's report may still be withheld from the student. */
const reEvaluateMessage =(detail = {}) => (detail.assignmentId
  ? "Re-run the AI evaluation for this scheduled attempt? The current scores are kept in the history. The student sees the new report once the schedule's reports are released."
  : "Re-run the AI evaluation for this attempt? The current scores are kept in the history, and the student sees the new report when it is ready.");

const OTHER_LANGUAGE = "other_language";
const hasOtherLanguage = (item) => Array.isArray(item?.flags) && item.flags.includes(OTHER_LANGUAGE);

function OtherLanguageBadge() {
  return <ToneChip tone="amber" icon={Languages} className="text-[11px]">Answered in another language</ToneChip>;
}

// Answers ANVI marked as given in a language other than the interview's.
function LanguageFlags({ items }) {
  const flagged = items.filter(hasOtherLanguage);
  if (!flagged.length) return null;
  return <Panel title="Language check" description="These answers were given in a language other than the interview language." icon={Languages} tone="amber">
    <ul className="space-y-2.5" data-language-flags>
      {flagged.map((item) => <li key={item.qid} className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <span className="min-w-0 text-slate-800 dark:text-gray-200">{item.questionText}</span>
        <OtherLanguageBadge />
      </li>)}
    </ul>
  </Panel>;
}

// The admin detail in the shape the shared report components read.
const reportView = (detail) => ({ ...detail, title: detail.title || detail.interviewTitle, scoredAt: detail.eval?.scoredAt || null });

function AttemptDrawer({ attemptId, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setDetail(null); setError("");
    reportApi.get(attemptId).then((value) => { if (active) setDetail(value); })
      .catch((cause) => { if (active) setError(cause.message || "This attempt could not be loaded."); });
    return () => { active = false; };
  }, [attemptId]);

  const reEvaluate = async () => {
    if (!window.confirm(reEvaluateMessage(detail))) return;
    setBusy(true); setError("");
    try {
      setDetail(await reportApi.reEvaluate(attemptId));
      onChanged?.();
    } catch (cause) {
      setError(cause.message || "The evaluation could not be queued.");
    } finally {
      setBusy(false);
    }
  };

  const canReEvaluate = detail && detail.status !== "in_progress" && !["pending", "processing"].includes(detail.pendingWork?.status);
  // A scored attempt shows candidate, timing, setup, warm-up, flags and integrity inside the shared report (and
  // its PDF); the drawer adds only the status and the evaluation details above it.
  const scored = Boolean(detail?.overall && detail.status === "ready");
  const proctoring = detail && !scored ? proctoringOf(detail) : null;
  return <Drawer
    title={detail ? `${detail.student?.name || "Student"} · ${detail.interviewTitle}` : "Attempt report"}
    description={detail ? `${STATUS_LABELS[detail.status] || detail.status} · started ${dateTime(detail.startedAt)}` : undefined}
    onClose={onClose}
    footer={<>
      <button type="button" className={secondaryClass} onClick={onClose}>Close</button>
      <button type="button" className={secondaryClass} onClick={reEvaluate} disabled={!canReEvaluate || busy}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={14} aria-hidden="true" />}Re-evaluate
      </button>
    </>}
  >
    {error && <Notice error>{error}</Notice>}
    {!detail && !error && <p className="text-sm text-slate-500 dark:text-gray-400">Loading attempt…</p>}
    {detail && <>
      <dl className={`grid gap-4 p-5 text-sm sm:grid-cols-2 ${surfaceClass}`}>
        {!scored && <div><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">Student</dt><dd className="mt-1 font-semibold text-slate-900 dark:text-white">{detail.student?.name}</dd><dd className="text-xs text-slate-500 dark:text-gray-400">{[detail.student?.email, detail.student?.studentId].filter(Boolean).join(" · ")}</dd></div>}
        <div><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">Status</dt><dd className="mt-1"><StatusBadge row={detail} /></dd>{detail.endReason && <dd className="mt-1 text-xs text-slate-500 dark:text-gray-400">Ended: {endReasonLabel(detail.endReason)}</dd>}</div>
        {!scored && <div><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">Timing</dt><dd className="mt-1 tabular-nums text-slate-800 dark:text-gray-200"><span className="text-slate-500 dark:text-gray-400">Started </span>{dateTime(detail.startedAt)}</dd><dd className="tabular-nums text-slate-800 dark:text-gray-200"><span className="text-slate-500 dark:text-gray-400">Ended </span>{dateTime(detail.endedAt)}</dd></div>}
        <div><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">Evaluation</dt><dd className="mt-1 text-slate-800 dark:text-gray-200">{detail.eval ? `${detail.eval.modelId || "model"} · ${detail.eval.promptVersion} · ${detail.eval.calls || 0} calls` : "Not evaluated yet"}</dd>
          {detail.eval?.history?.length > 0 && <dd className="text-xs text-slate-500 dark:text-gray-400">{detail.eval.history.length} earlier evaluation{detail.eval.history.length === 1 ? "" : "s"} kept</dd>}
          {detail.pendingWork?.lastError && <dd className="text-xs text-rose-600 dark:text-rose-400">{detail.pendingWork.lastError}</dd>}</div>
        {!scored && <div data-attempt-setup><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">Before the interview</dt>
          <dd className="mt-1 text-slate-800 dark:text-gray-200"><span className="text-slate-500 dark:text-gray-400">Terms accepted </span>{detail.termsAcceptedAt ? <span className="tabular-nums">{dateTime(detail.termsAcceptedAt)}</span> : "None recorded"}</dd>
          <dd className="text-slate-800 dark:text-gray-200"><span className="text-slate-500 dark:text-gray-400">Resume </span>{RESUME_SOURCE_LABELS[detail.resumeSource] || "Not used"}</dd></div>}
        {!scored && detail.language && <div><dt className="text-xs font-medium text-slate-500 dark:text-gray-400">Language</dt><dd className="mt-1 text-slate-800 dark:text-gray-200">{detail.language}</dd></div>}
      </dl>
      {!scored && detail.warmup?.trim() && <WarmupTranscript text={detail.warmup} className={surfaceClass} />}
      {/* A scored report flags each answer itself; before scoring the flagged answers are listed here. */}
      {!scored && <LanguageFlags items={detail.items || []} />}
      {proctoring && <IntegritySection proctoring={proctoring} full />}
      {scored
        ? <AnviReport attempt={reportView(detail)} readOnly showExpectedAnswer />
        : <Panel title="Answers">
          {detail.items?.length ? <ol className="space-y-4">
            {detail.items.map((item) => <li key={item.qid} className="text-sm">
              <p className="font-semibold text-slate-900 dark:text-white">{item.questionText}</p>
              {hasOtherLanguage(item) && <p className="mt-1"><OtherLanguageBadge /></p>}
              <p className="mt-1 whitespace-pre-wrap text-slate-600 dark:text-gray-300">{item.answerText || <em>{item.status === "skipped" ? "Skipped" : "Not attempted"}</em>}</p>
              {item.expectedAnswer && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500 dark:text-gray-400">Expected: {item.expectedAnswer}</p>}
            </li>)}
          </ol> : <p className="text-sm text-slate-500 dark:text-gray-400">No answers were saved for this attempt.</p>}
        </Panel>}
    </>}
  </Drawer>;
}

const TABS = [
  { id: "attempts", label: "Attempts", icon: FileBarChart },
  { id: "usage", label: "Usage and cost", icon: Activity },
];

/** Attempts (with the scored report in a drawer) and AI usage, as tabs kept in ?view=. */
export default function AnviReportsPanel() {
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "usage" ? "usage" : "attempts";
  const refs = useRef([]);
  const choose = (id, focus = false) => {
    const next = new URLSearchParams(params);
    if (id === "usage") { next.set("view", "usage"); next.delete("assignmentId"); next.delete("attemptId"); } else next.delete("view");
    setParams(next);
    if (focus) refs.current[TABS.findIndex((tab) => tab.id === id)]?.focus();
  };
  const onKeyDown = (event, index) => {
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: TABS.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    choose(TABS[(next + TABS.length) % TABS.length].id, true);
  };
  return <div className="space-y-4">
    <div role="tablist" aria-label="Report views" className="inline-flex gap-1 rounded-lg border border-slate-200 bg-slate-100/80 p-1 dark:border-gray-800 dark:bg-gray-950">
      {TABS.map((tab, index) => {
        const selected = view === tab.id;
        const Icon = tab.icon;
        return <button key={tab.id} ref={(element) => { refs.current[index] = element; }} type="button" role="tab" id={`reports-tab-${tab.id}`}
          aria-selected={selected} aria-controls={`reports-panel-${tab.id}`} tabIndex={selected ? 0 : -1}
          onClick={() => choose(tab.id)} onKeyDown={(event) => onKeyDown(event, index)}
          className={`inline-flex min-h-8 items-center gap-2 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected ? "bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-gray-700 dark:text-white dark:ring-gray-600" : "text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"}`}>
          <Icon size={15} aria-hidden="true" />{tab.label}
        </button>;
      })}
    </div>
    <div role="tabpanel" id={`reports-panel-${view}`} aria-labelledby={`reports-tab-${view}`}>
      {view === "usage" ? <UsagePanel /> : <AttemptsView params={params} setParams={setParams} />}
    </div>
  </div>;
}

/** Admin list of ANVI attempts for the admin's own interviews, with the scored report in a drawer. */
function AttemptsView({ params, setParams }) {
  // ?assignmentId= (from a schedule) narrows the list to that schedule's attempts.
  const assignmentId = params.get("assignmentId") || "";
  const [filters, setFilters] = useState({ interviewId: "", status: "", page: 1, limit: 25, assignmentId });
  useEffect(() => { setFilters((current) => (current.assignmentId === assignmentId ? current : { ...current, assignmentId, page: 1 })); }, [assignmentId]);
  const clearAssignment = () => { const next = new URLSearchParams(params); next.delete("assignmentId"); setParams(next); };
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  // ?attemptId= (a deep link, e.g. Assigned students' "View report") opens that attempt's drawer directly.
  const linkedAttemptId = params.get("attemptId") || "";
  const [openId, setOpenId] = useState(linkedAttemptId);
  useEffect(() => { if (linkedAttemptId) setOpenId(linkedAttemptId); }, [linkedAttemptId]);
  const closeDrawer = () => {
    setOpenId("");
    if (!params.has("attemptId")) return;
    const next = new URLSearchParams(params);
    next.delete("attemptId");
    // Replace, so Back does not reopen the drawer that was just closed.
    setParams(next, { replace: true });
  };
  const [round, setRound] = useState(0);
  const refresh = useCallback(() => setRound((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    reportApi.list(filters).then((value) => { if (active) setData(value); })
      .catch((cause) => { if (active) setError(cause.message || "Reports could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters, round]);

  const set = (patch) => setFilters((current) => ({ ...current, page: 1, ...patch }));
  const rows = data?.attempts || [];
  const interviews = data?.interviews || [];

  return <div className="space-y-4">
    <Panel title="Interview attempts" description="Open an attempt to see its transcript, scores and evaluation history." icon={FileBarChart} bodyClassName="" action={<button type="button" className={secondaryClass} onClick={refresh} aria-label="Refresh reports"><RefreshCw size={14} aria-hidden="true" /></button>}>
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center">
        <Select aria-label="Filter by interview" value={filters.interviewId} onChange={(event) => set({ interviewId: event.target.value })} className="sm:w-72"
          options={[{ value: "", label: "All my interviews" }, ...interviews.map((row) => ({ value: row.id, label: row.title }))]} />
        <Select aria-label="Filter by status" value={filters.status} onChange={(event) => set({ status: event.target.value })} options={STATUS_OPTIONS} className="sm:w-52" />
        {filters.assignmentId && <div className="flex flex-wrap items-center gap-2 text-xs sm:ml-auto">
          <ToneChip tone="indigo" icon={CalendarClock}>Showing one schedule&apos;s attempts</ToneChip>
          <button type="button" className={secondaryClass} onClick={clearAssignment}><X size={14} aria-hidden="true" />Show all attempts</button>
        </div>}
      </div>
      {error && <div className="px-5 pb-4"><Notice error>{error}</Notice></div>}
      {loading && !data ? <p className="py-10 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading reports…</p>
        : rows.length === 0 ? <EmptyState title="No attempts yet" detail="When students take your published AI interviews, their attempts and AI-generated reports appear here." />
          : <>
          {/* Phones get one card per attempt; the table needs about 880px. */}
          <ul aria-label="ANVI interview attempts" className="divide-y divide-slate-100 dark:divide-gray-800 md:hidden">
            {rows.map((row) => <li key={row.attemptId} className="space-y-2.5 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="font-semibold text-slate-900 dark:text-white">{row.student?.name}</p><p className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400" title={[row.student?.studentId, row.student?.email].filter(Boolean).join(" · ")}>{[row.student?.studentId, row.student?.email].filter(Boolean).join(" · ")}</p></div>
                <button type="button" className={secondaryClass} onClick={() => setOpenId(row.attemptId)} aria-label={`View report for ${row.student?.name || "student"}`}><Eye size={14} aria-hidden="true" />View</button>
              </div>
              <p className="text-[13px] text-slate-700 dark:text-gray-300">{row.interviewTitle}</p>
              <div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge row={row} />{row.overall && <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{marks(row.overall.score)} / {marks(row.overall.max)} <span className="text-xs font-normal text-slate-500 dark:text-gray-400">{row.overall.percent}% · {row.overall.band}</span></span>}</div>
              <p className="text-xs tabular-nums text-slate-500 dark:text-gray-400">Started {dateTime(row.startedAt)}</p>
            </li>)}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table data-no-serial className="w-full min-w-[880px] text-left text-sm">
              <caption className="sr-only">ANVI interview attempts</caption>
              <thead className={tableHeadClass}>
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Student</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Interview</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Score</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Started</th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {rows.map((row) => <tr key={row.attemptId} className={tableRowClass}>
                  <td className="max-w-[260px] px-5 py-3"><p className="truncate font-semibold text-slate-900 dark:text-white">{row.student?.name}</p><p className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400" title={[row.student?.studentId, row.student?.email].filter(Boolean).join(" · ")}>{[row.student?.studentId, row.student?.email].filter(Boolean).join(" · ")}</p></td>
                  <td className="min-w-[240px] px-3 py-3 text-[13px] text-slate-700 [text-wrap:balance] dark:text-gray-300">{row.interviewTitle}</td>
                  <td className="px-3 py-3"><StatusBadge row={row} /></td>
                  <td className="min-w-[130px] whitespace-nowrap px-3 py-3 tabular-nums">{row.overall ? <><span className="font-semibold text-slate-900 dark:text-white">{marks(row.overall.score)} / {marks(row.overall.max)}</span> <span className="block text-xs text-slate-500 dark:text-gray-400">{row.overall.percent}% · {row.overall.band}</span></> : <span className="text-slate-400 dark:text-gray-600">—</span>}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums text-slate-500 dark:text-gray-400">{dateTime(row.startedAt)}</td>
                  <td className="px-5 py-3 text-right"><button type="button" className={secondaryClass} onClick={() => setOpenId(row.attemptId)} aria-label={`View report for ${row.student?.name || "student"}`}><Eye size={14} aria-hidden="true" />View</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          </>}
      {data?.pagination && rows.length > 0 && <Pagination value={data.pagination} onPage={(page) => setFilters((current) => ({ ...current, page }))} onLimit={(limit) => set({ limit })} />}
    </Panel>
    {openId && <AttemptDrawer attemptId={openId} onClose={closeDrawer} onChanged={refresh} />}
  </div>;
}
