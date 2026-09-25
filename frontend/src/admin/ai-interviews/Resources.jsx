import { useState } from "react";
import { Plus, Pencil, ChevronDown } from "lucide-react";
import { interviewApi } from "./api";
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
  TextArea,
  TextInput,
  primaryClass,
  secondaryClass,
} from "./ui";

export function ResourcePicker({ kind, selected, onSelect, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        disabled={disabled}
        type="button"
        onClick={() => setOpen(true)}
        className={`${secondaryClass} w-full justify-between text-left`}
      >
        <span className="truncate">
          {selected ||
            `Select ${kind === "companies" ? "company" : "interviewer profile"}`}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <Dialog
          title={
            kind === "companies"
              ? "Select or add company"
              : "Select interviewer profile"
          }
          onClose={() => setOpen(false)}
        >
          <ResourceList
            kind={kind}
            picker
            onSelect={(item) => {
              onSelect(item);
              setOpen(false);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
export function ResourceList({ kind, picker = false, onSelect }) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [editor, setEditor] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const settled = useDebounced(search);
  const remote = useRemote(
    () =>
      interviewApi.resources(kind, {
        search: settled,
        page,
        active: picker ? "true" : "",
      }),
    [kind, settled, page, picker],
  );
  const isProfile = kind === "profiles";
  const start = () =>
    setEditor({
      name: search,
      active: true,
      data: {
        displayName: "ANNU",
        avatar: "annu",
        tone: "Professional",
        language: "English",
        introduction: "Welcome. Let’s begin your practice interview.",
        closing: "Thank you for completing your interview.",
      },
    });
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const saved = await interviewApi.saveResource(kind, editor);
      setEditor(null);
      remote.reload();
      if (picker) onSelect(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-40 flex-1">
          <TextInput
            aria-label={`Search ${kind}`}
            placeholder={`Search ${isProfile ? "profiles" : "companies"}…`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <button className={primaryClass} onClick={start}>
          <Plus size={15} />
          {isProfile ? "New profile" : "Add company"}
        </button>
      </div>
      {(remote.error || error) && (
        <Notice error>
          {remote.error || error}{" "}
          <button className="underline" onClick={remote.reload}>
            Retry
          </button>
        </Notice>
      )}
      {remote.loading ? (
        <div role="status" className="p-6 text-sm text-slate-500">
          Loading {kind}…
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900">
          {!remote.result?.items.length ? (
            <EmptyState
              title={`No ${isProfile ? "profiles" : "companies"} found`}
              detail={
                isProfile
                  ? "Create a reusable static interviewer profile."
                  : "Add a company once and select it in future interviews."
              }
              action={
                <button className={secondaryClass} onClick={start}>
                  Create {isProfile ? "profile" : "company"}
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-gray-800">
              {remote.result.items.map((item) => (
                <li
                  key={item._id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  {isProfile && <Avatar variant={item.data.avatar} />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                      {item.name}
                    </p>
                    {isProfile && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {item.data.language} · {item.data.tone} · Static profile
                      </p>
                    )}
                  </div>
                  {!item.active && <Badge>Inactive</Badge>}
                  {picker ? (
                    <button
                      className={secondaryClass}
                      onClick={() => onSelect(item)}
                    >
                      Select
                    </button>
                  ) : (
                    <button
                      className={secondaryClass}
                      aria-label={`Edit ${item.name}`}
                      onClick={() => setEditor(structuredClone(item))}
                    >
                      <Pencil size={14} />
                      <span>Edit</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination value={remote.result?.pagination} onPage={setPage} />
        </div>
      )}
      {editor && (
        <Dialog
          title={`${editor._id ? "Edit" : "Create"} ${isProfile ? "interviewer profile" : "company"}`}
          onClose={() => {
            if (!busy) {
              setEditor(null);
              setError("");
            }
          }}
        >
          <form onSubmit={save} className="space-y-4">
            {error && <Notice error>{error}</Notice>}
            <Field label={isProfile ? "Profile name *" : "Company name *"}>
              <TextInput
                autoFocus
                required
                maxLength={120}
                value={editor.name}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
            </Field>
            {isProfile && (
              <>
                <Field label="Display name *">
                  <TextInput
                    required
                    maxLength={120}
                    value={editor.data.displayName}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, displayName: e.target.value },
                      })
                    }
                  />
                </Field>
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold">Avatar</legend>
                  <div className="flex flex-wrap gap-3">
                    {["annu", "orbit", "spark"].map((avatar) => (
                      <label
                        key={avatar}
                        className={`flex items-center gap-2 rounded-xl border p-3 ${editor.data.avatar === avatar ? "border-sky-400 bg-sky-50" : "border-slate-200"}`}
                      >
                        <input
                          type="radio"
                          name="avatar"
                          value={avatar}
                          checked={editor.data.avatar === avatar}
                          onChange={() =>
                            setEditor({
                              ...editor,
                              data: { ...editor.data, avatar },
                            })
                          }
                        />
                        <Avatar variant={avatar} />
                        <span className="text-xs capitalize">{avatar}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["tone", "Tone", ["Professional", "Friendly", "Neutral"]],
                    ["language", "Language", ["English", "Hindi", "Hinglish"]],
                  ].map(([key, label, options]) => (
                    <Field key={key} label={label}>
                      <Select
                        options={options}
                        value={editor.data[key]}
                        onChange={(e) =>
                          setEditor({
                            ...editor,
                            data: { ...editor.data, [key]: e.target.value },
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Introduction">
                  <TextArea
                    maxLength={2000}
                    value={editor.data.introduction}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, introduction: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="Closing message">
                  <TextArea
                    maxLength={2000}
                    value={editor.data.closing}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        data: { ...editor.data, closing: e.target.value },
                      })
                    }
                  />
                </Field>
              </>
            )}
            {editor._id && (
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editor.active}
                  onChange={(e) =>
                    setEditor({ ...editor, active: e.target.checked })
                  }
                />
                Available for new interviews
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                className={secondaryClass}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button disabled={busy} className={primaryClass}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
