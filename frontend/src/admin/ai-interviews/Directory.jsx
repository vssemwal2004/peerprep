import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArrowUpRight,
  Copy,
  Eye,
  History,
  Link2,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import InterviewActionMenu from "../../components/interviews/InterviewActionMenu";
import { interviewApi } from "./api";
import { ROOT, uid } from "./definition";
import { useDebounced, useRemote } from "./useRemote";
import {
  Avatar,
  Badge,
  Dialog,
  EmptyState,
  Field,
  Notice,
  Pagination,
  Select,
  TextInput,
  primaryClass,
  secondaryClass,
} from "./ui";

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
  const open = (item, division = "sections") =>
    navigate(`${ROOT}/${item._id}/${division}`, {
      state: { returnTo: `${ROOT}?${params}` },
    });
  const action = async (item, type) => {
    setError("");
    setMessage("");
    if (type === "copy") {
      try {
        await navigator.clipboard.writeText(
          `${window.location.origin}${ROOT}/${item._id}/sections`,
        );
        setMessage("Admin link copied. Sign-in is required.");
      } catch {
        setError(
          "Could not copy the link. Open the interview and copy its address.",
        );
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
            ? "Draft deleted. This cannot be undone."
            : type === "archive"
              ? "Interview archived. You can restore it from Archived."
              : "Interview restored as a draft.",
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Interview status"
          className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 dark:bg-gray-900"
        >
          {[
            ["", "All interviews"],
            ["incomplete", "Drafts"],
            ["complete", "Configuration complete"],
            ["archived", "Archived"],
          ].map(([value, label]) => (
            <button
              key={value}
              aria-pressed={status === value}
              className={`rounded-md px-3 py-2 text-xs font-medium ${status === value ? "bg-white text-sky-700 shadow-sm dark:bg-gray-800" : "text-slate-500"}`}
              onClick={() => set("status", value)}
            >
              {label}
            </button>
          ))}
        </div>
        <Link
          className={primaryClass}
          to={`${ROOT}/new`}
          state={{ returnTo: `${ROOT}?${params}` }}
        >
          <Plus size={16} />
          Create interview
        </Link>
      </div>
      <div className="flex gap-3">
        <div className="max-w-xl flex-1">
          <TextInput
            aria-label="Search interviews"
            placeholder="Search title, company or role…"
            value={search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        <div className="w-40">
          <Select
            aria-label="Sort interviews"
            value={sort}
            options={[
              { value: "updated", label: "Recently updated" },
              { value: "oldest", label: "Oldest updated" },
              { value: "title", label: "Title A–Z" },
            ]}
            onChange={(e) => set("sort", e.target.value)}
          />
        </div>
      </div>
      {message && <Notice>{message}</Notice>}
      {(error || remote.error) && !confirm && (
        <Notice error>
          {error || remote.error}{" "}
          <button onClick={remote.reload} className="underline">
            Refresh
          </button>
        </Notice>
      )}
      <section
        aria-label="Interview directory"
        className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900"
      >
        {remote.loading ? (
          <div role="status" className="space-y-3 p-4">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded-lg bg-slate-50 dark:bg-gray-800"
              />
            ))}
            <span className="sr-only">Loading interviews</span>
          </div>
        ) : !remote.result?.items.length ? (
          <EmptyState
            title={
              search || status
                ? "No matching interviews"
                : "Create your first AI interview"
            }
            detail={
              search || status
                ? "Try a different search or clear the filters."
                : "Start with a draft, then add sections, questions and an interviewer."
            }
            action={
              search || status ? (
                <button
                  className={secondaryClass}
                  onClick={() => setParams({})}
                >
                  Clear filters
                </button>
              ) : (
                <Link className={primaryClass} to={`${ROOT}/new`}>
                  <Plus size={15} />
                  Create interview
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(220px,2fr)_1fr_1fr_150px_110px_32px] gap-4 rounded-t-xl border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 xl:grid dark:bg-gray-950 dark:border-gray-800">
              <span>Interview / company</span>
              <span>Role</span>
              <span>Content</span>
              <span>Configuration</span>
              <span>Updated</span>
              <span />
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {remote.result.items.map((item) => (
                <li
                  key={item._id}
                  className="relative flex items-center gap-4 px-4 py-3 xl:grid xl:grid-cols-[minmax(220px,2fr)_1fr_1fr_150px_110px_32px]"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar size={36} />
                    <div className="min-w-0">
                      <button
                        className="block max-w-full truncate text-left text-sm font-semibold text-slate-900 hover:text-sky-700 dark:text-white"
                        onClick={() => open(item)}
                      >
                        {item.title}
                      </button>
                      <span className="block truncate text-xs text-slate-500">
                        {item.companyName || "General practice"}
                      </span>
                    </div>
                  </div>
                  <span className="hidden truncate text-xs text-slate-600 xl:block dark:text-gray-300">
                    {item.role || "Role not set"}
                  </span>
                  <div className="hidden text-xs text-slate-500 lg:block">
                    <span>{item.summary?.sectionCount || 0} sections</span>
                    <p>
                      {item.summary?.manualCount || 0} manual ·{" "}
                      {item.summary?.plannedCount || 0} planned
                    </p>
                  </div>
                  <div className="hidden sm:block">
                    <Badge complete={item.validation?.complete}>
                      {item.lifecycle === "archived"
                        ? "Archived"
                        : item.validation?.complete
                          ? "Complete · not live"
                          : "Draft"}
                    </Badge>
                  </div>
                  <span className="hidden text-xs text-slate-500 xl:block">
                    {new Date(item.updatedAt).toLocaleDateString()}
                  </span>
                  <InterviewActionMenu
                    name={item.title}
                    actions={[
                      {
                        id: "open",
                        label: "Open configuration",
                        icon: ArrowUpRight,
                        run: () => open(item),
                      },
                      {
                        id: "preview",
                        label: "Preview configuration",
                        icon: Eye,
                        run: () => open(item, "preview"),
                      },
                      {
                        id: "duplicate",
                        label: "Duplicate as draft",
                        icon: Copy,
                        run: () => action(item, "duplicate"),
                      },
                      {
                        id: "copy",
                        label: "Copy admin link",
                        icon: Link2,
                        run: () => action(item, "copy"),
                      },
                      {
                        id: "history",
                        label: "View change history",
                        icon: History,
                        run: () => open(item, "review"),
                      },
                      {
                        id: "lifecycle",
                        label:
                          item.lifecycle === "archived" ? "Restore" : "Archive",
                        icon:
                          item.lifecycle === "archived" ? RotateCcw : Archive,
                        run: () =>
                          action(
                            item,
                            item.lifecycle === "archived"
                              ? "restore"
                              : "archive",
                          ),
                      },
                      ...(item.lifecycle === "draft"
                        ? [
                            {
                              id: "delete",
                              label: "Delete draft",
                              icon: Trash2,
                              danger: true,
                              run: () => action(item, "delete"),
                            },
                          ]
                        : []),
                    ]}
                  />
                </li>
              ))}
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
          title={`${confirm.type === "delete" ? "Delete draft" : confirm.type === "duplicate" ? "Duplicate interview" : confirm.type === "archive" ? "Archive interview" : "Restore interview"}`}
          onClose={() => {
            if (!busy) setConfirm(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm">{confirm.item.title}</p>
            {error && <Notice error>{error}</Notice>}
            {confirm.type === "delete" ? (
              <Field label="Type the interview title to permanently delete this draft">
                <TextInput
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoFocus
                />
              </Field>
            ) : (
              <p className="text-sm text-slate-500">
                {confirm.type === "duplicate"
                  ? "Creates an independent draft. No candidates or activity are copied."
                  : confirm.type === "archive"
                    ? "The interview becomes read-only. You can restore it later."
                    : "Restores this interview as a draft. Validate its configuration again before marking it complete."}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                disabled={busy}
                className={secondaryClass}
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                className={primaryClass}
                disabled={
                  busy ||
                  (confirm.type === "delete" && typed !== confirm.item.title)
                }
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
