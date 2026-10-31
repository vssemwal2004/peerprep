import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Eye,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import InterviewActionMenu from "../../components/interviews/InterviewActionMenu";
import { interviewApi } from "./api";
import { ROOT, uid } from "./definition";
import { useDebounced, useRemote } from "./useRemote";
import { StatusChip } from "./wizard/WizardShell";
import { COMPLETE_TEXT, REOPEN_TEXT, interviewStatus } from "./wizard/steps";
import { Dialog, Field, Notice, Pagination, Select, TextInput, primaryClass, secondaryClass, surfaceClass } from "./ui";
import { scrollStripClass, useScrollFade } from "./useScrollFade";

const COLUMNS = "xl:grid-cols-[minmax(260px,2.4fr)_120px_110px_150px_120px_40px]";
const FILTERS = [
  ["", "All"],
  ["incomplete", "Drafts"],
  ["complete", "Ready & published"],
  ["completed", "Completed"],
  ["archived", "Archived"],
];
const SORTS = [
  { value: "updated", label: "Last edited" },
  { value: "oldest", label: "Oldest edited" },
  { value: "title", label: "Name A–Z" },
];

const edited = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
// The list only carries the server summary; publishedRevision is not listed, so a
// published interview reads as Published here.
const statusOf = (item) =>
  interviewStatus({ ...item, publishedRevision: item.publishedAt ? item.revision : undefined, validation: { ...item.validation, validatedRevision: item.revision } });
const duration = (summary = {}) =>
  summary.unlimited
    ? "Untimed"
    : summary.budgetSeconds
      ? `≤ ${Math.ceil(summary.budgetSeconds / 60)} min`
      : "—";
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const completedMessage = (closing = {}) => {
  const parts = [
    closing.ended ? `${count(closing.ended, "interview")} in progress ended and sent for scoring` : "",
    closing.closed ? `${count(closing.closed, "schedule")} closed` : "",
    closing.cancelled ? `${count(closing.cancelled, "schedule")} not yet open cancelled` : "",
  ].filter(Boolean);
  return `Interview marked complete.${parts.length ? ` ${parts.join(", ")}.` : ""} Its reports stay under Reports.`;
};
const TILE_TONES = {
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300",
  sky: "bg-sky-50 text-sky-600 dark:bg-sky-400/10 dark:text-sky-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300",
  slate: "bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-gray-400",
};

export function DirectoryActions({ params }) {
  return (
    <Link className={primaryClass} to={`${ROOT}/new`} state={{ returnTo: `${ROOT}${params ? `?${params}` : ""}` }}>
      <Plus size={16} aria-hidden="true" />
      Create interview
    </Link>
  );
}

export default function Directory() {
  const [params, setParams] = useSearchParams(),
    navigate = useNavigate();
  const search = params.get("search") || "",
    status = params.get("status") || "",
    sort = params.get("sort") || "updated",
    page = Number(params.get("page")) || 1,
    limit = Number(params.get("limit")) || 25;
  const settled = useDebounced(search),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(null),
    [typed, setTyped] = useState(""),
    [busy, setBusy] = useState(false);
  const key = useRef("");
  const strip = useScrollFade([status]);
  const remote = useRemote(
    () => interviewApi.list({ search: settled, status, sort, page, limit }),
    [settled, status, sort, page, limit],
  );
  const set = (name, value) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(name, value);
        else next.delete(name);
        if (name !== "page") next.delete("page");
        return next;
      },
      { replace: true },
    );
  const open = (item, step = "basics") =>
    navigate(`${ROOT}/${item._id}/${step}`, {
      state: { returnTo: `${ROOT}?${params}` },
    });
  const action = async (item, type) => {
    setError("");
    setMessage("");
    if (type === "copy") {
      try {
        await navigator.clipboard.writeText(`${window.location.origin}${ROOT}/${item._id}/basics`);
        setMessage("Admin link copied. Sign-in is required to open it.");
      } catch {
        setError("Could not copy the link. Open the interview and copy its address.");
      }
      return;
    }
    setTyped("");
    key.current = uid();
    setConfirm({ item, type });
  };
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await interviewApi.action(
        confirm.item._id,
        confirm.type,
        confirm.item.revision,
        { title: typed },
        key.current,
      );
      const type = confirm.type;
      setConfirm(null);
      remote.reload();
      if (type === "duplicate") open(result);
      else
        setMessage(
          type === "delete"
            ? "Interview and its linked schedules deleted."
            : type === "archive"
              ? "Interview archived. Find it under Archived to restore it."
              : type === "complete"
                ? completedMessage(result?.closing)
                : type === "reopen"
                  ? "Interview reopened. Students can see and start it again."
                  : "Interview restored as a draft.",
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const filtered = Boolean(search || status);
  const items = remote.result?.items || [];
  const total = remote.result?.pagination?.total;
  return (
    <div className="space-y-4">
      {message && <Notice>{message}</Notice>}
      {(error || remote.error) && !confirm && (
        <Notice error>
          {error || remote.error}{" "}
          <button onClick={remote.reload} className="font-semibold underline">
            Refresh
          </button>
        </Notice>
      )}
      <section
        aria-label="Interview directory"
        className={`overflow-visible ${surfaceClass}`}
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <div ref={strip.ref} style={strip.style} role="group" aria-label="Interview status" className={`flex max-w-full gap-1 rounded-lg bg-slate-100 p-1 dark:bg-gray-950/70 lg:self-start ${scrollStripClass}`}>
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={status === value}
                className={`shrink-0 snap-start whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${status === value ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-gray-700 dark:text-white dark:ring-gray-600" : "text-slate-600 hover:text-slate-900 dark:text-gray-400 dark:hover:text-white"}`}
                onClick={() => set("status", value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center lg:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-gray-500" />
              <TextInput
                aria-label="Search interviews"
                placeholder="Search name, company or role"
                value={search}
                className="pl-9"
                onChange={(e) => set("search", e.target.value)}
              />
            </div>
            <Select
              aria-label="Sort interviews"
              value={sort}
              onChange={(e) => set("sort", e.target.value)}
              className="sm:w-44"
              options={SORTS}
            />
          </div>
        </div>
        {remote.loading ? (
          <div role="status" className="space-y-3 p-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-14 animate-pulse rounded-lg bg-slate-100 dark:bg-gray-800" />
            ))}
            <span className="sr-only">Loading interviews</span>
          </div>
        ) : !items.length ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <svg viewBox="0 0 120 90" className="mb-4 h-20 w-28" fill="none" aria-hidden="true">
              <ellipse cx="60" cy="80" rx="42" ry="6" className="fill-slate-100 dark:fill-gray-800" />
              <rect x="24" y="12" width="60" height="58" rx="12" className="fill-sky-50 stroke-sky-200 dark:fill-sky-950 dark:stroke-sky-900" strokeWidth="2" />
              <circle cx="54" cy="36" r="9" className="fill-sky-200 dark:fill-sky-800" />
              <path d="M40 58c3-8 9-11 14-11s11 3 14 11" className="stroke-sky-300 dark:stroke-sky-700" strokeWidth="3" strokeLinecap="round" />
              <circle cx="86" cy="60" r="16" className="fill-indigo-50 stroke-indigo-200 dark:fill-indigo-950 dark:stroke-indigo-800" strokeWidth="2" />
              <path d="M80 60h12M86 54v12" className="stroke-indigo-500" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {filtered ? "No matching interviews" : "Create your first AI interview"}
            </h2>
            <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-gray-400">
              {filtered
                ? "Try a different search or clear the filters."
                : "Pick a role, let ANVI draft the questions, and publish. It takes a few minutes."}
            </p>
            <div className="mt-5">
              {filtered ? (
                <button className={secondaryClass} onClick={() => setParams({})}>
                  Clear filters
                </button>
              ) : (
                <DirectoryActions />
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={`hidden gap-4 border-b border-slate-100 bg-slate-50/80 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-gray-800 dark:bg-gray-950/50 dark:text-gray-400 xl:grid ${COLUMNS}`}>
              <span>Interview{total ? <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400 dark:text-gray-500">{total.toLocaleString()}</span> : null}</span>
              <span>Questions</span>
              <span>Duration</span>
              <span>Status</span>
              <span>Last edited</span>
              <span className="sr-only">Actions</span>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {items.map((item) => {
                const summary = item.summary || {};
                const questions = (summary.manualCount || 0) + (summary.plannedCount || 0);
                const itemStatus = statusOf(item);
                return (
                  <li key={item._id} className={`relative flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03] xl:grid ${COLUMNS}`}>
                    <div className="flex min-w-0 flex-1 basis-60 items-center gap-3 pr-10 xl:pr-0">
                      <span aria-hidden="true" className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:flex ${TILE_TONES[itemStatus.tone] || TILE_TONES.slate}`}>
                        <ClipboardList size={17} />
                      </span>
                      <div className="min-w-0">
                        <button
                          type="button"
                          title={item.title}
                          className="line-clamp-2 max-w-full text-left text-sm font-semibold xl:line-clamp-1 text-slate-900 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-white dark:hover:text-sky-300"
                          onClick={() => open(item)}
                        >
                          {item.title}
                        </button>
                        <span className="mt-0.5 block truncate text-[13px] text-slate-500 dark:text-gray-400">
                          {[item.role || "Role not set", item.companyName].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    </div>
                    <span className="text-sm tabular-nums text-slate-700 dark:text-gray-300">
                      {questions}
                      <span className="xl:hidden"> questions</span>
                      {summary.plannedCount ? (
                        <span className="ml-1.5 rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-300">{summary.plannedCount} live</span>
                      ) : null}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-sm tabular-nums text-slate-700 dark:text-gray-300">
                      <Clock3 size={14} aria-hidden="true" className="text-slate-400 dark:text-gray-500" />
                      {duration(summary)}
                    </span>
                    <span>
                      <StatusChip status={itemStatus} />
                    </span>
                    <span className="text-[13px] text-slate-500 dark:text-gray-400">
                      <span className="xl:hidden">Edited </span>
                      {edited(item.updatedAt)}
                    </span>
                    <span className="absolute right-3 top-3 xl:static">
                      <InterviewActionMenu
                        name={item.title}
                        actions={[
                          { id: "open", label: item.lifecycle === "draft" ? "Edit" : "View", icon: Pencil, run: () => open(item) },
                          { id: "preview", label: "Preview as student", icon: Eye, run: () => open(item, "review") },
                          ...(item.publishedAt && item.lifecycle === "draft"
                            ? [{ id: "schedule", label: "Assign to students", icon: CalendarClock, run: () => navigate(`${ROOT}/schedules/new?interviewId=${item._id}`) }]
                            : []),
                          ...(item.publishedAt && item.lifecycle !== "archived"
                            ? [{ id: "schedules", label: "View schedules", icon: CalendarClock, run: () => navigate(`${ROOT}/schedules?interviewId=${item._id}`) }]
                            : []),
                          // Students across every schedule of this interview (archived interviews keep their schedules).
                          ...(item.publishedAt
                            ? [{ id: "students", label: "View assigned students", icon: Users, run: () => navigate(`${ROOT}/schedules/interview/${item._id}/students`) }]
                            : []),
                          { id: "duplicate", label: "Duplicate as draft", icon: Copy, run: () => action(item, "duplicate") },
                          { id: "copy", label: "Copy admin link", icon: Link2, run: () => action(item, "copy") },
                          ...(item.publishedAt && item.lifecycle === "draft"
                            ? [{ id: "complete", label: "Mark complete", icon: CheckCircle2, run: () => action(item, "complete") }]
                            : []),
                          ...(item.lifecycle === "completed"
                            ? [{ id: "reopen", label: "Reopen", icon: RotateCcw, run: () => action(item, "reopen") }]
                            : []),
                          {
                            id: "lifecycle",
                            label: item.lifecycle === "archived" ? "Restore" : "Archive",
                            icon: item.lifecycle === "archived" ? RotateCcw : Archive,
                            run: () => action(item, item.lifecycle === "archived" ? "restore" : "archive"),
                          },
                          ...(item.lifecycle === "draft"
                            ? [{ id: "delete", label: "Delete draft", icon: Trash2, danger: true, run: () => action(item, "delete") }]
                            : []),
                        ]}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Pagination
          value={remote.result?.pagination}
          onPage={(v) => set("page", String(v))}
          onLimit={(v) => set("limit", String(v))}
        />
      </section>
      {confirm && (
        <Dialog
          title={
            confirm.type === "delete"
              ? "Delete draft"
              : confirm.type === "duplicate"
                ? "Duplicate interview"
                : confirm.type === "archive"
                  ? "Archive interview"
                  : confirm.type === "complete"
                    ? "Mark interview complete"
                    : confirm.type === "reopen"
                      ? "Reopen interview"
                      : "Restore interview"
          }
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{confirm.item.title}</p>
            {error && <Notice error>{error}</Notice>}
            {confirm.type === "delete" ? (
              <>
                <Notice error>This permanently deletes the interview, linked schedules, assigned-student records, bookings, completed attempts and reports. It cannot be undone.</Notice>
                <Field label="Type the interview name to confirm permanent deletion">
                  <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
                </Field>
              </>
            ) : (
              <p className="text-sm text-slate-600 dark:text-gray-300">
                {confirm.type === "duplicate"
                  ? "Creates an independent draft copy. No student activity is copied."
                  : confirm.type === "archive"
                    ? "Students will no longer see it and it becomes read-only. You can restore it later."
                    : confirm.type === "complete"
                      ? COMPLETE_TEXT
                      : confirm.type === "reopen"
                        ? REOPEN_TEXT
                        : "Restores this interview as an editable draft. Publish it again when ready."}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button disabled={busy} className={secondaryClass} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className={primaryClass}
                disabled={busy || (confirm.type === "delete" && typed !== confirm.item.title)}
                onClick={run}
              >
                {busy ? "Working…" : "Confirm"}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
