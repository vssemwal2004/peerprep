import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  GraduationCap,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../utils/api";
import { useToast } from "../components/CustomToast";

const CATEGORIES = [
  {
    key: "campus",
    label: "Campus / College",
    singular: "campus",
    description: "Institutions assigned to students",
    icon: Building2,
  },
  {
    key: "branch",
    label: "Branches",
    singular: "branch",
    description: "Academic specializations",
    icon: GitBranch,
  },
  {
    key: "semester",
    label: "Semesters",
    singular: "semester",
    description: "Academic terms from 1 to 8",
    icon: GraduationCap,
  },
  {
    key: "course",
    label: "Courses",
    singular: "course",
    description: "Degree and programme names",
    icon: CheckCircle2,
  },
];

const emptyForm = { name: "", code: "", order: 0, isActive: true };

export default function MasterData() {
  const { category: routeCategory } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const category = CATEGORIES.some((item) => item.key === routeCategory)
    ? routeCategory
    : "campus";
  const categoryInfo = CATEGORIES.find((item) => item.key === category);
  const EmptyStateIcon = categoryInfo.icon;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteEntry, setDeleteEntry] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.listMasterData();
      setEntries(response.entries || []);
    } catch (error) {
      toast.error(error.message || "Could not load master data.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!routeCategory || !CATEGORIES.some((item) => item.key === routeCategory)) {
      navigate("/admin/settings/master-data/campus", { replace: true });
    }
  }, [navigate, routeCategory]);

  const categoryCounts = useMemo(
    () =>
      Object.fromEntries(
        CATEGORIES.map((item) => [
          item.key,
          entries.filter((entry) => entry.category === item.key).length,
        ]),
      ),
    [entries],
  );
  const visibleEntries = entries
    .filter((entry) => entry.category === category)
    .filter((entry) =>
      [entry.name, entry.code]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    );

  const openCreate = () => {
    setEditor({ category });
    setForm({ ...emptyForm, order: category === "semester" ? 1 : 0 });
  };
  const openEdit = (entry) => {
    setEditor(entry);
    setForm({
      name: entry.name,
      code: entry.code || "",
      order: entry.order || 0,
      isActive: entry.isActive !== false,
    });
  };
  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required.");
    try {
      setSaving(true);
      const body = {
        category,
        name: form.name.trim(),
        code: form.code.trim(),
        order: Number(form.order) || 0,
        isActive: form.isActive,
      };
      const result = editor?._id
        ? await api.updateMasterData(editor._id, body)
        : await api.createMasterData(body);
      toast.success(
        result.updatedStudents
          ? `Saved and updated ${result.updatedStudents} student records.`
          : `${categoryInfo.singular[0].toUpperCase()}${categoryInfo.singular.slice(1)} saved.`,
      );
      setEditor(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not save this value.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    try {
      setSaving(true);
      await api.deleteMasterData(deleteEntry._id);
      toast.success("Master-data value deleted.");
      setDeleteEntry(null);
      await load();
    } catch (error) {
      toast.error(error.message || "Could not remove this value.");
    } finally {
      setSaving(false);
    }
  };
  const sync = async () => {
    try {
      setSyncing(true);
      const result = await api.syncMasterData();
      toast.success(
        `${result.created} new values imported; ${result.matched} existing values refreshed.`,
      );
      await load();
    } catch (error) {
      toast.error(error.message || "Could not synchronize student data.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-5rem)] bg-slate-50 p-4 sm:p-6 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700">
              Settings · Master data
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
              Academic master data
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Maintain the approved values used by student onboarding,
              directories, and analytics filters.
            </p>
          </div>
          <button
            type="button"
            onClick={sync}
            disabled={syncing}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sync from students
          </button>
        </header>

        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[280px_minmax(0,1fr)] dark:border-gray-800 dark:bg-gray-900">
          <aside className="border-b border-slate-200 bg-slate-50/70 p-3 lg:min-h-[650px] lg:border-b-0 lg:border-r dark:border-gray-800 dark:bg-gray-950/40">
            <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Data categories
            </p>
            <nav className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
              {CATEGORIES.map((item) => {
                const Icon = item.icon;
                const active = item.key === category;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      navigate(`/admin/settings/master-data/${item.key}`)
                    }
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${active ? "bg-sky-600 text-white shadow-sm" : "text-slate-600 hover:bg-white hover:text-slate-950 dark:text-gray-300 dark:hover:bg-gray-800"}`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? "bg-white/15" : "bg-white shadow-sm dark:bg-gray-800"}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block text-xs">{item.label}</strong>
                      <span
                        className={`mt-0.5 block truncate text-[10px] ${active ? "text-sky-100" : "text-slate-400"}`}
                      >
                        {categoryCounts[item.key]} values
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                );
              })}
            </nav>
          </aside>

          <main className="min-w-0">
            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">
                  {categoryInfo.label}
                </h2>
                <p className="text-xs text-slate-500">
                  {categoryInfo.description}
                </p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white hover:bg-sky-500"
              >
                <Plus className="h-4 w-4" />
                Add {categoryInfo.singular}
              </button>
            </div>
            <div className="border-b border-slate-100 p-4 dark:border-gray-800">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={`Search ${categoryInfo.label.toLowerCase()}...`}
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex min-h-96 items-center justify-center">
                <Loader2 className="h-7 w-7 animate-spin text-sky-600" />
              </div>
            ) : visibleEntries.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:bg-gray-950/40">
                    <tr>
                      <th className="px-5 py-3">Name</th>
                      <th className="px-5 py-3">Code</th>
                      <th className="px-5 py-3">Students</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                    {visibleEntries.map((entry) => (
                      <tr key={entry._id} className="hover:bg-sky-50/40 dark:hover:bg-sky-950/10">
                        <td className="px-5 py-4 font-bold text-slate-900 dark:text-white">
                          {category === "semester"
                            ? `Semester ${entry.name}`
                            : entry.name}
                        </td>
                        <td className="px-5 py-4 font-mono text-xs text-slate-500">
                          {entry.code || "—"}
                        </td>
                        <td className="px-5 py-4 text-slate-600 dark:text-gray-300">
                          {entry.studentCount}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${entry.isActive ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-gray-800"}`}>
                            {entry.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => openEdit(entry)} aria-label={`Edit ${entry.name}`} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-sky-300 hover:text-sky-700 dark:border-gray-700"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => setDeleteEntry(entry)} aria-label={`Delete ${entry.name}`} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-rose-300 hover:text-rose-600 dark:border-gray-700"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex min-h-96 flex-col items-center justify-center px-6 text-center">
                <EmptyStateIcon className="h-10 w-10 text-slate-300" />
                <p className="mt-3 font-bold text-slate-700 dark:text-gray-200">No values found</p>
                <p className="mt-1 text-xs text-slate-500">Add a value or synchronize existing student records.</p>
              </div>
            )}
          </main>
        </div>
      </div>

      {editor && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[1px]">
          <button type="button" className="absolute inset-0" aria-label="Close editor" onClick={() => setEditor(null)} />
          <form onSubmit={save} className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700">{editor._id ? "Edit" : "Add"} master value</p><h2 className="mt-1 text-lg font-bold text-slate-950 dark:text-white">{categoryInfo.label}</h2></div>
              <button type="button" onClick={() => setEditor(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 dark:border-gray-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600 sm:col-span-2 dark:text-gray-300">{category === "semester" ? "Semester number" : "Display name"}<input type={category === "semester" ? "number" : "text"} min={category === "semester" ? 1 : undefined} max={category === "semester" ? 8 : undefined} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder={category === "semester" ? "1 to 8" : `Enter ${categoryInfo.singular} name`} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950" /></label>
              <label className="text-xs font-bold text-slate-600 dark:text-gray-300">Code (optional)<input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} placeholder="Short code" className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm uppercase outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950" /></label>
              <label className="text-xs font-bold text-slate-600 dark:text-gray-300">Display order<input type="number" min="0" value={form.order} onChange={(event) => setForm((current) => ({ ...current, order: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-950" /></label>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-xs font-bold text-slate-700 sm:col-span-2 dark:border-gray-700 dark:text-gray-200"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="h-4 w-4 accent-sky-600" />Available for student forms and analytics</label>
            </div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setEditor(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 dark:border-gray-700">Cancel</button><button type="submit" disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-600 px-5 text-xs font-bold text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save value</button></div>
          </form>
        </div>
      )}

      {deleteEntry && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4">
          <button type="button" className="absolute inset-0" aria-label="Cancel deletion" onClick={() => setDeleteEntry(null)} />
          <section className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-gray-900"><h2 className="text-lg font-bold text-slate-950 dark:text-white">Remove {deleteEntry.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-500">Only unused values can be deleted. If students use this value, reassign them first so reports and forms remain consistent.</p><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDeleteEntry(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600">Cancel</button><button type="button" onClick={remove} disabled={saving} className="h-10 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white disabled:opacity-50">Remove</button></div></section>
        </div>
      )}
    </div>
  );
}
