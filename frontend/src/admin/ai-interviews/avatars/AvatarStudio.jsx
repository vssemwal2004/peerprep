import { useState } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useSearchParams,
} from "react-router-dom";
import { Archive, Pencil, Play, Plus, RotateCcw, Search } from "lucide-react";
import { avatarApi, AVATAR_ROOT } from "./api";
import { AvatarStatus, SourceVisual, PreviewDialog } from "./components";
import { languageName, renderActive } from "./definition";
import AvatarEditor from "./AvatarEditor";
import { useDebounced, useRemote } from "../useRemote";
import {
  Dialog,
  EmptyState,
  Notice,
  Pagination,
  Select,
  TextInput,
  primaryClass,
  secondaryClass,
} from "../ui";

function AvatarLibrary({ capabilities }) {
  const [params, setParams] = useSearchParams();
  const search = params.get("search") || "";
  const [preview, setPreview] = useState(null),
    [archive, setArchive] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const settled = useDebounced(search);
  const page = Math.max(1, Number(params.get("page")) || 1),
    active = params.get("active") || "true";
  const remote = useRemote(
    () => avatarApi.list({ page, limit: 12, search: settled, active }),
    [page, settled, active],
  );
  const query = (patch) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === "") next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    });
  const changeArchive = async () => {
    setBusy(true);
    setError("");
    try {
      await avatarApi.archive(archive._id, archive.revision, !archive.active);
      setArchive(null);
      remote.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="relative min-w-48 max-w-sm flex-1">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-3 text-slate-400"
            />
            <TextInput
              aria-label="Search avatars"
              placeholder="Search avatars…"
              className="pl-9"
              value={search}
              onChange={(event) => {
                query({ search: event.target.value, page: 1 });
              }}
            />
          </div>
          <div className="w-32">
            <Select
              aria-label="Avatar status filter"
              value={active}
              options={[
                { value: "true", label: "Active" },
                { value: "false", label: "Archived" },
                { value: "all", label: "All avatars" },
              ]}
              onChange={(event) =>
                query({ active: event.target.value, page: 1 })
              }
            />
          </div>
        </div>
        <Link to={`${AVATAR_ROOT}/new`} className={primaryClass}>
          <Plus size={15} />
          Create avatar
        </Link>
      </div>
      {(!capabilities.storage?.ready || !capabilities.renderer?.configured) && (
        <Notice>
          Avatar drafts are available.{" "}
          {!capabilities.storage?.ready
            ? "Media storage setup is required before uploading files."
            : "Video renderer setup is required before generating previews."}
        </Notice>
      )}
      {(error || remote.error) && (
        <Notice error>
          {error || remote.error}{" "}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => {
              setError("");
              remote.reload();
            }}
          >
            Retry
          </button>
        </Notice>
      )}
      {remote.loading ? (
        <div role="status" className="py-12 text-center text-sm text-slate-500">
          Loading avatars…
        </div>
      ) : remote.error ? null : !remote.result?.items.length ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          <EmptyState
            title={
              search
                ? "No matching avatars"
                : active === "false"
                  ? "No archived avatars"
                  : "Create your first avatar"
            }
            detail={
              search
                ? "Try a different name or clear your search."
                : "Add an identity, introduction and voice, then generate a short preview."
            }
            action={
              <Link className={primaryClass} to={`${AVATAR_ROOT}/new`}>
                <Plus size={15} />
                Create avatar
              </Link>
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {remote.result.items.map((doc) => (
            <article
              key={doc._id}
              className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <button type="button" aria-label={`Open ${doc.data.name} introduction`} onClick={() => setPreview(doc)} className="relative block w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500">
                <SourceVisual
                  source={doc.assets?.source}
                  className="aspect-video w-full"
                />
                <span className="absolute right-3 top-3">
                  <AvatarStatus doc={doc} />
                </span>
                <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-2 text-xs font-medium text-white backdrop-blur"><Play size={13} fill="currentColor" />{doc.assets?.preview ? "Watch introduction" : "View avatar"}</span>
              </button>
              <div className="space-y-4 p-4">
                <div>
                  <h2 className="truncate text-base font-semibold">
                    <button type="button" onClick={() => setPreview(doc)} className="text-left hover:text-sky-600 focus-visible:underline">{doc.data.name}</button>
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {doc.data.role || "Interviewer"} ·{" "}
                    {languageName(doc.data.language)}
                  </p>
                  <p className="mt-2 line-clamp-2 min-h-8 text-xs leading-relaxed text-slate-500">{doc.data.description || "A custom AI interviewer for your team."}</p>
                  <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Generated languages">
                    {Object.entries(doc.languagePreviews || {}).filter(([, clip]) => !clip.stale).map(([language]) => <span key={language} className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-950 dark:text-sky-300">{languageName(language)}</span>)}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
                  {doc.assets?.preview?.url && (
                    <button
                      type="button"
                      className={secondaryClass}
                      onClick={() => setPreview(doc)}
                    >
                      <Play size={13} />
                      {doc.previewStale || doc.render?.status !== "ready"
                        ? "Previous preview"
                        : "Preview"}
                    </button>
                  )}
                  <Link
                    aria-label={`Edit ${doc.data.name}`}
                    className={secondaryClass}
                    to={`${AVATAR_ROOT}/${doc._id}/edit`}
                  >
                    <Pencil size={13} />
                    {doc.active === false ? "View" : "Edit"}
                  </Link>
                  <button
                    type="button"
                    title={
                      doc.active === false ? "Restore avatar" : "Archive avatar"
                    }
                    aria-label={`${doc.active === false ? "Restore" : "Archive"} ${doc.data.name}`}
                    className={`${secondaryClass} ml-auto`}
                    disabled={renderActive(doc)}
                    onClick={() => {
                      setError("");
                      setArchive(doc);
                    }}
                  >
                    {doc.active === false ? (
                      <RotateCcw size={14} />
                    ) : (
                      <Archive size={14} />
                    )}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination
        value={remote.result?.pagination}
        onPage={(value) => query({ page: value })}
      />
      <div className="text-right">
        <Link
          className="text-xs text-slate-500 underline hover:text-sky-700"
          to="/admin/ai-interviews/profiles"
        >
          Legacy interviewer profiles
        </Link>
      </div>
      {preview && (
        <PreviewDialog doc={preview} allowEdit onClose={() => { setPreview(null); remote.reload(); }} />
      )}
      {archive && (
        <Dialog
          title={
            archive.active === false ? "Restore avatar?" : "Archive avatar?"
          }
          onClose={() => {
            if (!busy) setArchive(null);
          }}
        >
          <p className="text-sm text-slate-600">
            {archive.active === false
              ? "Return this avatar to your active library."
              : "Move this avatar out of your active library. You can restore it later."}
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-rose-600">
              {error}
            </p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className={secondaryClass}
              disabled={busy}
              onClick={() => setArchive(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={primaryClass}
              disabled={busy}
              onClick={changeArchive}
            >
              {busy
                ? "Saving…"
                : archive.active === false
                  ? "Restore avatar"
                  : "Archive avatar"}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default function AvatarStudio() {
  const capabilities = useRemote(() => avatarApi.capabilities(), []);
  if (capabilities.loading)
    return (
      <p role="status" className="py-12 text-center text-sm text-slate-500">
        Loading Avatar Studio…
      </p>
    );
  if (capabilities.error)
    return (
      <Notice error>
        {capabilities.error}{" "}
        <button
          type="button"
          className="ml-2 underline"
          onClick={capabilities.reload}
        >
          Retry
        </button>
      </Notice>
    );
  return (
    <Routes>
      <Route
        index
        element={<AvatarLibrary capabilities={capabilities.result || {}} />}
      />
      <Route
        path="new"
        element={<AvatarEditor capabilities={capabilities.result || {}} />}
      />
      <Route
        path=":id/edit"
        element={<AvatarEditor capabilities={capabilities.result || {}} />}
      />
      <Route path="*" element={<Navigate to={AVATAR_ROOT} replace />} />
    </Routes>
  );
}
