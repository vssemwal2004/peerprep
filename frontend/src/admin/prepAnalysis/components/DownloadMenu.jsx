import { useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, RotateCcw, Sheet } from "lucide-react";
import { prepAnalysisApi } from "../api";
import { RANGE_PRESETS, optionLookup, summaryLines, toQueryRequest } from "../filterModel";
import { Button, Dialog, Popover, focusRing } from "./ui";

const FORMATS = [
  { value: "pdf", label: "PDF", hint: "Ready to print or share", Icon: FileText },
  { value: "xlsx", label: "Excel", hint: "Sort and filter in Excel", Icon: FileSpreadsheet },
  { value: "csv", label: "CSV", hint: "Plain data for any tool", Icon: Sheet },
];
// Which column groups make sense for each feature (Quick Prep columns are part of Prep Coding).
const AREA_GROUPS = {
  coding: ["Student details", "Prep Coding"],
  learning: ["Student details", "Prep Learning"],
  interview: ["Student details", "Prep Interview"],
  assessment: ["Student details", "Prep Assessment"],
  all: ["Student details", "Prep Coding", "Prep Learning", "Prep Interview", "Prep Assessment"],
};

function ExportDialog({ open, initialFormat, onClose, catalog, area, areaLabel, state, fieldMap, matched, table }) {
  const groups = AREA_GROUPS[area] || AREA_GROUPS.all;
  const columns = useMemo(() => (catalog.exportColumns || []).filter((column) => groups.includes(column.group)), [catalog, groups]);
  const recommended = useMemo(() => (catalog.exportDefaults?.[area] || []).filter((key) => columns.some((column) => column.key === key)), [area, catalog, columns]);
  const [format, setFormat] = useState(initialFormat);
  const [selected, setSelected] = useState(recommended);
  const [status, setStatus] = useState({ busy: false, error: "", done: "" });
  const maxPdf = catalog.exportLimits?.maxPdfColumns || 12;
  const metricLabel = (key) => fieldMap.get(key)?.label || key;
  const lines = summaryLines(state, fieldMap, metricLabel, optionLookup(catalog), areaLabel);
  const period = RANGE_PRESETS.find((preset) => preset.value === state.range.preset)?.label || "Custom period";
  const tooManyForPdf = format === "pdf" && selected.length > maxPdf;
  const ordered = columns.filter((column) => selected.includes(column.key)).map((column) => column.key);

  const toggle = (key) => setSelected((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
  const setGroup = (group, on) => {
    const keys = columns.filter((column) => column.group === group).map((column) => column.key);
    setSelected((current) => (on ? [...new Set([...current, ...keys])] : current.filter((key) => !keys.includes(key))));
  };

  const download = async () => {
    setStatus({ busy: true, error: "", done: "" });
    try {
      const body = { ...toQueryRequest({ state, layout: [], table }, fieldMap), format, columns: ordered, summary: lines };
      const result = await prepAnalysisApi.download(body);
      setStatus({ busy: false, error: "", done: `${result.filename} downloaded${result.rowCount != null ? ` · ${result.rowCount.toLocaleString()} students` : ""}` });
    } catch (error) {
      setStatus({ busy: false, error: error.message, done: "" });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} size="max-w-2xl" title="Download students" subtitle="The file lists every student that matches your filters, not just this page."
      footer={<>
        <Button tone="ghost" onClick={() => setSelected(recommended)}><RotateCcw className="h-3.5 w-3.5" />Recommended columns</Button>
        <Button onClick={onClose}>Close</Button>
        <Button tone="primary" disabled={!ordered.length || tooManyForPdf || status.busy} onClick={download}>
          {status.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Download {FORMATS.find((entry) => entry.value === format)?.label}
        </Button>
      </>}>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="File type">
          {FORMATS.map(({ value, label, hint, Icon }) => (
            <button key={value} type="button" role="radio" aria-checked={format === value} onClick={() => setFormat(value)}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${format === value ? "border-sky-500 bg-sky-50 ring-1 ring-sky-500 dark:bg-sky-500/10" : "border-slate-200 hover:border-slate-300 dark:border-gray-700"} ${focusRing}`}>
              <Icon className={`h-5 w-5 ${format === value ? "text-sky-600 dark:text-sky-300" : "text-slate-400"}`} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-bold text-slate-900 dark:text-white">{label}</span>
                <span className="block truncate text-[10.5px] text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>

        <section className="rounded-xl bg-slate-50 px-3 py-2.5 text-[12px] text-slate-600 dark:bg-white/[0.03] dark:text-slate-300">
          <p className="font-bold text-slate-900 dark:text-white">What will be in the file</p>
          <p className="mt-1">{areaLabel} · {period} · <b className="text-slate-900 dark:text-white">{(matched ?? 0).toLocaleString()} students</b></p>
          {lines.length
            ? <ul className="mt-1 list-disc space-y-0.5 pl-5">{lines.map((line) => <li key={line}>{line}</li>)}</ul>
            : <p className="mt-1 text-slate-500">No filters: every student is included.</p>}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[12.5px] font-bold text-slate-900 dark:text-white">Columns</h3>
            <span className={`text-[11.5px] ${tooManyForPdf ? "font-semibold text-rose-600" : "text-slate-500"}`}>
              {selected.length} selected{format === "pdf" ? ` · a PDF page fits up to ${maxPdf}` : ""}
            </span>
          </div>
          <div className="space-y-3">
            {groups.filter((group) => columns.some((column) => column.group === group)).map((group) => {
              const inGroup = columns.filter((column) => column.group === group);
              const allOn = inGroup.every((column) => selected.includes(column.key));
              return (
                <div key={group} className="rounded-xl border border-slate-200 p-2.5 dark:border-gray-700">
                  <div className="mb-1.5 flex items-center justify-between">
                    <p className="text-[11.5px] font-bold text-slate-700 dark:text-slate-200">{group}</p>
                    <button type="button" onClick={() => setGroup(group, !allOn)} className="text-[11px] font-semibold text-sky-600 hover:underline dark:text-sky-400">{allOn ? "Untick all" : "Tick all"}</button>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                    {inGroup.map((column) => (
                      <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-[12px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.04]">
                        <input type="checkbox" className="h-3.5 w-3.5 accent-sky-600" checked={selected.includes(column.key)} onChange={() => toggle(column.key)} />
                        <span className="truncate">{column.key === "position" ? "# (place in list)" : column.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {tooManyForPdf && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">Untick {selected.length - maxPdf} column{selected.length - maxPdf === 1 ? "" : "s"} for a PDF, or choose Excel for every column.</p>}
        {status.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{status.error}</p>}
        {status.done && <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{status.done}</p>}
      </div>
    </Dialog>
  );
}

/** "Download" → PDF / Excel / CSV → a popup to choose columns. */
export default function DownloadMenu(props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [format, setFormat] = useState(null);
  const anchorRef = useRef(null);
  return (
    <>
      <button ref={anchorRef} type="button" onClick={() => setMenuOpen(true)}
        className={`inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-[12px] font-semibold text-white hover:bg-sky-700 ${focusRing}`}>
        <Download className="h-3.5 w-3.5" />Download
      </button>
      <Popover open={menuOpen} anchorRef={anchorRef} onClose={() => setMenuOpen(false)} minWidth={240} label="Download as">
        <div className="p-1.5">
          {FORMATS.map(({ value, label, hint, Icon }) => (
            <button key={value} type="button" onClick={() => { setMenuOpen(false); setFormat(value); }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-sky-50 dark:hover:bg-sky-500/10 ${focusRing}`}>
              <Icon className="h-4 w-4 text-sky-500" />
              <span>
                <span className="block text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{label}</span>
                <span className="block text-[11px] text-slate-500">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      </Popover>
      {format && <ExportDialog {...props} open initialFormat={format} onClose={() => setFormat(null)} />}
    </>
  );
}
