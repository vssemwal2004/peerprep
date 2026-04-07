import { useMemo, useState } from "react";
import { UploadCloud, Download, Save, RotateCcw } from "lucide-react";
import { api } from "../utils/api";
import { useToast } from "../components/CustomToast";
import CompanyBenchmarkForm, { createEmptyBenchmark, validateBenchmark } from "./CompanyBenchmarkForm";

export default function AdminCompanyBenchmarkAdd() {
  const toast = useToast();
  const [values, setValues] = useState(createEmptyBenchmark());
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const weightSum = useMemo(
    () => Number(values.weightDsa) + Number(values.weightConsistency) + Number(values.weightInterview),
    [values.weightDsa, values.weightConsistency, values.weightInterview]
  );

  const handleSave = async () => {
    const validationErrors = validateBenchmark(values);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) {
      toast.error("Please fix the highlighted errors.");
      return;
    }
    try {
      setSaving(true);
      await api.createCompanyBenchmark(values);
      toast.success("Benchmark saved successfully.");
      setValues(createEmptyBenchmark());
      setErrors({});
    } catch (err) {
      toast.error(err.message || "Failed to save benchmark.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setValues(createEmptyBenchmark());
    setErrors({});
  };

  const handleTemplateDownload = async () => {
    try {
      const csv = await api.downloadCompanyBenchmarkTemplate();
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "company-benchmarks-template.csv";
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || "Failed to download template.");
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      setUploadResult(null);
      const res = await api.uploadCompanyBenchmarks(file);
      setUploadResult(res?.result || null);
      toast.success("Upload complete. Review any row-level errors below.");
    } catch (err) {
      setUploadResult(null);
      toast.error(err.message || "CSV upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    handleFile(file);
  };

  return (
    <div className="min-h-screen bg-white pt-20 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">
            Company Insights
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Add Benchmark</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
            Upload bulk benchmarks or add a single company with structured evaluation criteria.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">Bulk Upload</div>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">Upload CSV</h2>
                </div>
                <button
                  onClick={handleTemplateDownload}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  <Download className="h-4 w-4" />
                  Download Template
                </button>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`mt-4 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  dragActive ? "border-sky-400 bg-sky-50 dark:bg-sky-500/10" : "border-slate-200 dark:border-gray-700"
                }`}
              >
                <UploadCloud className="h-8 w-8 text-sky-500" />
                <p className="text-sm font-semibold text-slate-700 dark:text-gray-200">
                  Drag & drop CSV here, or select a file
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500">
                  {uploading ? "Uploading..." : "Select CSV"}
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0])}
                  />
                </label>
              </div>

              {uploadResult && (
                <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-300">
                  <div className="font-semibold text-slate-800 dark:text-gray-100">
                    Imported {uploadResult.imported} rows · Skipped {uploadResult.skipped} rows
                  </div>
                  {uploadResult.errors?.length > 0 && (
                    <div className="mt-3 space-y-2 text-xs text-rose-500">
                      {uploadResult.errors.map((err, idx) => (
                        <div key={`${err.row}-${idx}`} className="rounded-lg bg-white/70 px-3 py-2 dark:bg-gray-800">
                          Row {err.row}: {err.company} — {err.issues.join(", ")}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div className="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-gray-400">
                Validation
              </div>
              <div className="mt-2 text-sm text-slate-600 dark:text-gray-300">
                Weight total: <span className="font-semibold">{weightSum.toFixed(2)}</span>. Keep it near 1.00 for a balanced readiness score.
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <CompanyBenchmarkForm values={values} setValues={setValues} errors={errors} />

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-500 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save Benchmark"}
              </button>
              <button
                onClick={handleReset}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Form
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
