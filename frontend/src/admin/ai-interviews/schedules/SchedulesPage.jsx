import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarClock, CalendarPlus, ChevronRight, Download, ExternalLink, Pencil, RefreshCw, Users } from "lucide-react";
import { ROOT } from "../definition";
import { useRemote } from "../useRemote";
import { EmptyState, Notice, Pagination, Panel, Select, primaryClass, secondaryClass, tableHeadClass, tableRowClass } from "../ui";
import { scheduleApi } from "./schedulesApi";
import { RowMenu, ScheduleFrame, StatusPill } from "./scheduleUi";
import { STATUS_FILTERS, formatIst, idOf, isEditable, kpiValue, listRows, timingLabel } from "./scheduleModel";

// Opened from here, the wizard offers "Change" on a preselected interview.
export function NewScheduleLink({ interviewId }) {
  return <Link className={primaryClass} state={{ from: "schedules" }} to={`${ROOT}/schedules/new${interviewId ? `?interviewId=${encodeURIComponent(interviewId)}` : ""}`}>
    <CalendarPlus size={16} aria-hidden="true" />New schedule
  </Link>;
}

/** The "⋮" menu of one schedule, shared by the list rows and cards. */
function scheduleMenu(row, { navigate, exportRoster }) {
  const id = idOf(row);
  return [
    { id: "open", label: "Open schedule", icon: ExternalLink, onSelect: () => navigate(`${ROOT}/schedules/${id}`) },
    { id: "students", label: "View assigned students", icon: Users, onSelect: () => navigate(`${ROOT}/schedules/${id}/students`) },
    ...(isEditable(row) ? [{ id: "edit", label: "Edit schedule", icon: Pencil, onSelect: () => navigate(`${ROOT}/schedules/${id}/edit`) }] : []),
    { id: "export", label: "Export roster CSV", icon: Download, onSelect: () => exportRoster(id) },
  ];
}

/** Every schedule the admin created, newest first, with status and progress. */
export default function SchedulesPage({ navigation }) {
  const navigate = useNavigate();
  const [exportError, setExportError] = useState("");
  const exportRoster = async (id) => {
    setExportError("");
    try { await scheduleApi.downloadRoster(id); } catch (cause) { setExportError(cause.message || "The export could not be downloaded."); }
  };
  const [params, setParams] = useSearchParams();
  const status = params.get("status") || "", interviewId = params.get("interviewId") || "";
  const page = Number(params.get("page")) || 1, limit = Number(params.get("limit")) || 25;
  const remote = useRemote(() => scheduleApi.list({ status, interviewId, page, limit }), [status, interviewId, page, limit]);
  const set = (name, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(name, value); else next.delete(name);
    if (name !== "page") next.delete("page");
    return next;
  }, { replace: true });
  const rows = listRows(remote.result).map((row) => {
    const kpis = row.kpis || row.counts || {};
    const assigned = kpiValue(kpis, "assigned") || Number(row.audience?.studentCount) || 0;
    const completed = kpiValue(kpis, "completed");
    return { row, assigned, completed, share: assigned ? Math.round((completed / assigned) * 100) : 0 };
  });
  const filtered = Boolean(status || interviewId);
  return (
    <ScheduleFrame
      title="AI Interview Schedules"
      description="Assign a published interview to a cohort, with a window in IST and optional bookable slots."
      back={ROOT}
      crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Schedules" }]}
      navigation={navigation}
      actions={<NewScheduleLink interviewId={interviewId} />}
    >
      <Panel
        title="Schedules"
        description="Status, window and completion for every cohort you scheduled."
        icon={CalendarClock}
        bodyClassName=""
        action={<>
          {interviewId && <button type="button" className={secondaryClass} onClick={() => set("interviewId", "")}>Show all interviews</button>}
          <Select aria-label="Filter by status" value={status} onChange={(event) => set("status", event.target.value)} options={STATUS_FILTERS} className="w-44" compact />
          <button type="button" className={secondaryClass} onClick={remote.reload} aria-label="Refresh schedules"><RefreshCw size={14} aria-hidden="true" /></button>
        </>}
      >
        {(remote.error || exportError) && <div className="px-5 pt-4"><Notice error>{remote.error || exportError}</Notice></div>}
        {remote.loading && !remote.result ? <p className="py-10 text-center text-sm text-slate-500 dark:text-gray-400" aria-busy="true">Loading schedules…</p>
          : rows.length === 0 ? <EmptyState
            title={filtered ? "No schedules match" : "No schedules yet"}
            detail={filtered ? "Try another status, or show every interview." : "Schedule a published AI interview for a cohort of students, with a window in IST and optional bookable slots."}
            action={!filtered && <NewScheduleLink />} />
            : <>
            {/* Phones get one card per schedule; the table needs about 900px. */}
            <ul aria-label="AI interview schedules" className="divide-y divide-slate-100 dark:divide-gray-800 md:hidden">
              {rows.map(({ row, assigned, completed, share }) => <li key={idOf(row)} className="space-y-3 px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`${ROOT}/schedules/${idOf(row)}`} className="font-semibold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">{row.title || "AI interview"}</Link>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{[row.role, row.mode === "adaptive" ? "Adaptive" : "Mock"].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-1"><StatusPill status={row.status} /><RowMenu label={`Actions for ${row.title || "schedule"}`} items={scheduleMenu(row, { navigate, exportRoster })} /></div>
                </div>
                <p className="text-[13px] tabular-nums text-slate-700 dark:text-gray-300">{formatIst(row.window?.opensAt, { suffix: false })} <span className="text-slate-400 dark:text-gray-500">to</span> {formatIst(row.window?.closesAt, { suffix: false })}<span className="block text-xs text-slate-500 dark:text-gray-400">{timingLabel(row)}</span></p>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" aria-hidden="true"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} /></div>
                  <span className="shrink-0 text-xs tabular-nums text-slate-600 dark:text-gray-300">{completed.toLocaleString("en-IN")} of {assigned.toLocaleString("en-IN")} completed</span>
                </div>
              </li>)}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table data-no-serial className="w-full min-w-[900px] text-left text-sm">
                <caption className="sr-only">AI interview schedules</caption>
                <thead className={tableHeadClass}>
                  <tr>
                    <th scope="col" className="px-5 py-3 font-semibold">Schedule</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Window (IST)</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Timing</th>
                    <th scope="col" className="px-3 py-3 font-semibold">Progress</th>
                    <th scope="col" className="px-5 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                  {rows.map(({ row, assigned, completed, share }) => {
                    return <tr key={idOf(row)} className={tableRowClass}>
                      <td className="px-5 py-3.5"><Link to={`${ROOT}/schedules/${idOf(row)}`} className="font-semibold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">{row.title || "AI interview"}</Link>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">{[row.role, row.mode === "adaptive" ? "Adaptive" : "Mock"].filter(Boolean).join(" · ")}</p></td>
                      <td className="px-3 py-3.5"><StatusPill status={row.status} /></td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-[13px] tabular-nums text-slate-700 dark:text-gray-300"><span className="block">{formatIst(row.window?.opensAt, { suffix: false })}</span><span className="block text-xs text-slate-500 dark:text-gray-400">to {formatIst(row.window?.closesAt, { suffix: false })}</span></td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-[13px] text-slate-700 dark:text-gray-300">{timingLabel(row)}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800" role="progressbar" aria-label={`${share}% completed`} aria-valuenow={share} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-emerald-500" style={{ width: `${share}%` }} /></div>
                          <span className="text-xs font-semibold tabular-nums text-slate-700 dark:text-gray-200">{share}%</span>
                        </div>
                        <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-gray-400">{completed.toLocaleString("en-IN")} of {assigned.toLocaleString("en-IN")} completed</p>
                      </td>
                      <td className="px-5 py-3.5"><div className="flex items-center justify-end gap-1">
                        <Link className={secondaryClass} to={`${ROOT}/schedules/${idOf(row)}`} aria-label={`Open ${row.title || "schedule"}`}>Open<ChevronRight size={14} aria-hidden="true" className="-mr-1 text-slate-400" /></Link>
                        <RowMenu label={`Actions for ${row.title || "schedule"}`} items={scheduleMenu(row, { navigate, exportRoster })} />
                      </div></td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            </>}
        {remote.result?.pagination && rows.length > 0 && <Pagination value={remote.result.pagination} onPage={(value) => set("page", String(value))} onLimit={(value) => set("limit", String(value))} />}
      </Panel>
    </ScheduleFrame>
  );
}
