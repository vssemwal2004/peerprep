import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreVertical, Search, Plus, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../utils/api";
import { useToast } from "../components/CustomToast";
import CompanyBenchmarkForm, { createEmptyBenchmark, validateBenchmark } from "./CompanyBenchmarkForm";
import { SortHeader, TablePager, useClientTable } from "../components/table";

const PAGE_SIZE = 8;
const numberOrNull = (value) => (value === null || value === undefined || value === "" || Number.isNaN(Number(value)) ? null : Number(value));
const COLUMN_VALUES = {
  companyName: (company) => company.companyName || null,
  dsaAccuracyRequired: (company) => numberOrNull(company.dsaAccuracyRequired),
  requiredTopics: (company) => (company.requiredTopics || []).join(", ") || null,
  minStreak: (company) => numberOrNull(company.minStreak),
  interviewScore: (company) => numberOrNull(company.interviewScore),
};
const columnValue = (company, key) => COLUMN_VALUES[key]?.(company);
const COLUMNS = [["companyName", "Company Name"], ["dsaAccuracyRequired", "DSA Accuracy"], ["requiredTopics", "Key Topics"], ["minStreak", "Min Streak"], ["interviewScore", "Interview Score"]];
const HEADER_CLASS = "px-6 py-3 text-xs tracking-widest text-slate-400 dark:text-gray-500";

function EditModal({ open, onClose, onSave, values, setValues, errors, saving }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">Edit Benchmark</div>
            <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Update company criteria</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>
        <div className="mt-5 max-h-[65vh] overflow-y-auto pr-1">
          <CompanyBenchmarkForm values={values} setValues={setValues} errors={errors} />
        </div>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ open, onClose, onConfirm, companyName, deleting }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Delete benchmark</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-gray-300">
          Are you sure you want to delete <span className="font-semibold">{companyName}</span>? This action cannot be undone.
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="rounded-xl bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-60"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCompanyInsights() {
  const toast = useToast();
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [formValues, setFormValues] = useState(createEmptyBenchmark());
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef(null);

  const loadCompanies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.listCompanyBenchmarks();
      setCompanies(res?.companies || []);
    } catch (err) {
      toast.error(err.message || "Failed to load benchmarks.");
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    const handleClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpenId(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return companies;
    return companies.filter((c) => c.companyName.toLowerCase().includes(query));
  }, [companies, search]);

  const table = useClientTable(filtered, { getValue: columnValue, initialPageSize: PAGE_SIZE, resetKey: search });
  const pagedCompanies = table.pageRows;

  const openEdit = (company) => {
    setEditingCompany(company);
    setFormValues({
      companyName: company.companyName || "",
      dsaAccuracyRequired: company.dsaAccuracyRequired ?? 70,
      requiredTopics: company.requiredTopics || [],
      minQuestionAttempts: company.minQuestionAttempts ?? 0,
      minStreak: company.minStreak ?? 0,
      interviewScore: company.interviewScore ?? 0,
      weightDsa: company.weightDsa ?? 0.4,
      weightConsistency: company.weightConsistency ?? 0.3,
      weightInterview: company.weightInterview ?? 0.3,
    });
    setFormErrors({});
    setEditOpen(true);
  };

  const saveEdit = async () => {
    const validationErrors = validateBenchmark(formValues);
    setFormErrors(validationErrors);
    if (Object.keys(validationErrors).length) {
      toast.error("Fix validation errors before saving.");
      return;
    }
    try {
      setSaving(true);
      await api.updateCompanyBenchmark(editingCompany.id, formValues);
      toast.success("Benchmark updated.");
      setEditOpen(false);
      await loadCompanies();
    } catch (err) {
      toast.error(err.message || "Update failed.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!editingCompany) return;
    try {
      setDeleting(true);
      await api.deleteCompanyBenchmark(editingCompany.id);
      toast.success("Benchmark deleted.");
      setDeleteOpen(false);
      await loadCompanies();
    } catch (err) {
      toast.error(err.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">
              Company Insights
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">View Benchmarks</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
              Search, edit, and manage company benchmarks used for readiness analytics.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadCompanies}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <Link
              to="/admin/company-insights/add"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500"
            >
              <Plus className="h-4 w-4" />
              Add Benchmark
            </Link>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 dark:border-gray-800 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">
              Total Companies: {filtered.length}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company"
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm" style={{ "--serial-start": (table.page - 1) * table.pageSize }}>
              <thead className="bg-slate-50 text-xs uppercase tracking-widest text-slate-400 dark:bg-gray-800/60 dark:text-gray-500">
                <tr>
                  {COLUMNS.map(([key, label]) => (
                    <SortHeader key={key} sortKey={key} sort={table.sort} onSort={table.toggleSort} className={HEADER_CLASS}>{label}</SortHeader>
                  ))}
                  <SortHeader sortable={false} align="right" className={HEADER_CLASS}>Actions</SortHeader>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500 dark:text-gray-400">
                      Loading benchmarks...
                    </td>
                  </tr>
                ) : pagedCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-6 text-center text-sm text-slate-500 dark:text-gray-400">
                      No benchmarks found.
                    </td>
                  </tr>
                ) : (
                  pagedCompanies.map((company) => (
                    <tr key={company.id} className="border-t border-slate-100 dark:border-gray-800">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{company.companyName}</div>
                        <div className="text-xs text-slate-400 dark:text-gray-500">
                          Min attempts: {company.minQuestionAttempts ?? 0}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-gray-200">
                        {company.dsaAccuracyRequired}%
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-gray-200">
                        {(company.requiredTopics || []).slice(0, 3).join(", ") || "—"}
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-gray-200">
                        {company.minStreak} days
                      </td>
                      <td className="px-6 py-4 text-slate-700 dark:text-gray-200">
                        {company.interviewScore}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="relative inline-block" ref={menuRef}>
                          <button
                            data-platform-menu-trigger
                            aria-expanded={menuOpenId === company.id}
                            onClick={() => setMenuOpenId(menuOpenId === company.id ? null : company.id)}
                            className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuOpenId === company.id && (
                            <div data-platform-action-menu className="absolute right-0 z-10 mt-2 w-32 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                              <button
                                onClick={() => {
                                  setMenuOpenId(null);
                                  openEdit(company);
                                }}
                                className="block w-full px-4 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => {
                                  setMenuOpenId(null);
                                  setEditingCompany(company);
                                  setDeleteOpen(true);
                                }}
                                className="block w-full px-4 py-2 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <TablePager {...table.pager} busy={loading} noun="companies" className="px-6 dark:border-gray-800" />
        </div>
      </div>

      <EditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={saveEdit}
        values={formValues}
        setValues={setFormValues}
        errors={formErrors}
        saving={saving}
      />
      <DeleteModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        companyName={editingCompany?.companyName || "this company"}
        deleting={deleting}
      />
    </div>
  );
}
