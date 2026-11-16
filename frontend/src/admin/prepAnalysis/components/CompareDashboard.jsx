import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, Download, FileSpreadsheet, GitCompareArrows, Loader2, Sheet, Users } from "lucide-react";
import { DataTable } from "../../../components/table";
import { rangeLabel } from "../../../components/dateRange/dateRangeModel";
import { useAnalysisApi } from "../analysisScope";
import EChart from "../charts/EChart";
import { compareByRequest, compareChartOption, compareTableRows, compareTitle, drillCellText, formatCompareValue } from "../compareModel";
import { optionLookup, summaryLines, toQueryRequest } from "../filterModel";
import { Button, Dialog } from "./ui";
import { TableSearch } from "./Insights";

const TONE_CLASS = {
  best: "bg-emerald-50 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  worst: "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
};

/** The page's filters as a compare request body. */
const baseBody = (state, fieldMap, focus) => ({ ...toQueryRequest({ state, layout: [] }, fieldMap), charts: undefined, ...(focus ? { focus } : {}) });

/** Every student behind one compared value, sortable and paged; a row opens the student. */
function ValueStudents({ open, body, onClose, onStudent }) {
  const api = useAnalysisApi();
  const [result, setResult] = useState({ loading: false, error: null, data: null });
  const key = open ? JSON.stringify(body) : "";
  useEffect(() => {
    if (!key) return undefined;
    const controller = new AbortController();
    setResult({ loading: true, error: null, data: null });
    api.compareStudents(JSON.parse(key), controller.signal)
      .then((data) => setResult({ loading: false, error: null, data }))
      .catch((error) => { if (error.name !== "AbortError") setResult({ loading: false, error, data: null }); });
    return () => controller.abort();
  }, [api, key]);
  const data = result.data;
  const [search, setSearch] = useState("");
  // A new value starts with an empty search.
  useEffect(() => { setSearch(""); }, [key]);
  // Name, email or ID (any text column); commas find several students.
  const rows = useMemo(() => {
    const terms = search.toLowerCase().split(",").map((term) => term.trim()).filter(Boolean);
    if (!data || !terms.length) return data?.rows || [];
    const textColumns = data.columns.map((column, index) => (!column.kind || column.kind === "text" ? index : -1)).filter((index) => index >= 0);
    return data.rows.filter((row) => {
      const text = textColumns.map((index) => String(row.cells[index] ?? "")).join("\n").toLowerCase();
      return terms.some((term) => text.includes(term));
    });
  }, [data, search]);
  const columns = useMemo(() => (data?.columns || []).map((column, index) => ({
    key: column.key, label: column.label,
    align: column.kind && column.kind !== "text" ? "right" : "left",
    value: (row) => row.cells[index],
    render: (row) => drillCellText(row.cells[index], column.kind),
    className: index === 0 ? "font-medium text-slate-900 dark:text-white" : "",
  })), [data]);
  return (
    <Dialog open={open} onClose={onClose} size="max-w-5xl" title={data ? `${data.label} · ${data.total.toLocaleString()} students` : "Students"}
      subtitle={data?.truncated ? `The first ${data.rows.length.toLocaleString()} are listed.` : undefined}>
      <div className="p-4">
        {result.loading && <p className="flex items-center justify-center py-10 text-[12px] text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading students…</p>}
        {result.error && <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[12px] text-rose-800 dark:bg-rose-500/10 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4" />{result.error.message}</p>}
        {data && (
          <div className="space-y-2">
            <TableSearch value={search} onSearch={setSearch} />
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} dense noun="students" resetKey={search}
              empty={search ? `No student matches “${search}”.` : "No students."}
              onRowClick={onStudent ? (row) => onStudent(row.id) : undefined} caption={`Students in ${data.label}`} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** One grouped bar chart; a bar opens the students of its value. */
function CompareChart({ chart, data, title, onValue }) {
  const buildOption = useCallback((theme) => compareChartOption(chart, data, theme), [chart, data]);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-1 text-[13px] font-bold text-slate-900 dark:text-white">{chart.title}</h3>
      <EChart height={260} ariaLabel={`${chart.title} for ${title}`} buildOption={buildOption} onClick={(params) => onValue(params.dataIndex)} />
    </article>
  );
}

/**
 * Compare classes side by side: the chosen Section / Group / Campus / Branch / Semester / Course
 * values in one table (a column per value plus "All selected") and grouped bar charts, for the
 * page's feature, period and filters. A value's student count or bar opens its students.
 */
export default function CompareDashboard({ classCompare, catalog, state, fieldMap, focus, refreshTick, areaLabel, onChange, onClose, onStudent }) {
  const api = useAnalysisApi();
  const [result, setResult] = useState({ loading: true, error: null, data: null });
  const [listValue, setListValue] = useState(null);
  const [download, setDownload] = useState({ busy: "", text: "", error: false });
  const body = useMemo(() => ({ ...baseBody(state, fieldMap, focus), compareBy: compareByRequest(classCompare) }), [classCompare, fieldMap, focus, state]);
  const requestKey = JSON.stringify(body);
  // The page's refresh button reloads the shared data (its own request goes first, at once); this
  // request follows a moment later and reads the reloaded data, so it never reloads it twice.
  useEffect(() => {
    const controller = new AbortController();
    setResult((current) => ({ ...current, loading: true }));
    const timer = setTimeout(() => {
      api.compare(JSON.parse(requestKey), { signal: controller.signal })
        .then((data) => setResult({ loading: false, error: null, data }))
        .catch((error) => { if (error.name !== "AbortError") setResult((current) => ({ ...current, loading: false, error })); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, refreshTick, requestKey]);

  const data = result.data;
  const rows = useMemo(() => compareTableRows(data), [data]);
  const openValue = useCallback((index) => {
    const column = data?.columns?.[index];
    if (column) setListValue(column.value);
  }, [data]);

  const columns = useMemo(() => {
    if (!data) return [];
    return [
      {
        key: "label", label: "Measure", value: (row) => row.order,
        render: (row) => (
          <span className="flex min-w-[170px] flex-col leading-tight">
            <span className="font-medium text-slate-900 dark:text-white">{row.label}</span>
            {row.module !== "student" && <span className="text-[10.5px] text-slate-400">{row.moduleLabel}</span>}
          </span>
        ),
      },
      ...data.columns.map((column, index) => ({
        key: `v${index}`, label: column.label, align: "right",
        value: (row) => row.cells[index].value,
        render: (row) => (row.id === "students" ? (
          <button type="button" onClick={() => openValue(index)} title={`See the ${column.label} students`}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10">
            <Users className="h-3 w-3" />{formatCompareValue(row.cells[index].value, row.format)}
          </button>
        ) : (
          <span className={`inline-block rounded-md px-1.5 py-0.5 ${TONE_CLASS[row.cells[index].tone] || ""}`}>{formatCompareValue(row.cells[index].value, row.format)}</span>
        )),
      })),
      {
        key: "total", label: data.total.label, align: "right", value: (row) => row.total,
        render: (row) => <span className="font-semibold text-slate-900 dark:text-white">{formatCompareValue(row.total, row.format)}</span>,
        headerClassName: "bg-slate-100/70 dark:bg-white/[0.04]",
      },
    ];
  }, [data, openValue]);

  const save = async (format) => {
    setDownload({ busy: format, text: "Preparing the file…", error: false });
    try {
      const summary = [...summaryLines(state, fieldMap, (key) => fieldMap.get(key)?.label || key, optionLookup(catalog)), ...(focus ? [`Only: ${focus.label}`] : [])];
      const file = await api.compareDownload({ ...body, format, summary });
      setDownload({ busy: "", text: `${file.filename} downloaded`, error: false });
    } catch (error) {
      setDownload({ busy: "", text: error.message, error: true });
    }
  };

  const title = compareTitle(classCompare, catalog);
  return (
    <section aria-label="Compare classes" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><GitCompareArrows className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[14px] font-bold text-slate-950 dark:text-white">{title}</h2>
          <p className="text-[11.5px] text-slate-500 dark:text-slate-400">
            {areaLabel} · {rangeLabel(state.range)}{data ? ` · ${data.total.students.toLocaleString()} of ${data.meta.matched.toLocaleString()} students in view` : ""}
          </p>
        </div>
        {result.loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Loading" />}
        <Button onClick={onChange}><GitCompareArrows className="h-3.5 w-3.5" />Change</Button>
        <Button disabled={!data || Boolean(download.busy)} onClick={() => save("xlsx")}>
          {download.busy === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />}Excel
        </Button>
        <Button disabled={!data || Boolean(download.busy)} onClick={() => save("csv")}>
          {download.busy === "csv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sheet className="h-3.5 w-3.5 text-slate-500" />}CSV
        </Button>
        <Button tone="ghost" onClick={onClose}><ArrowLeft className="h-3.5 w-3.5" />Back to charts</Button>
        {download.text && <p role="status" className={`w-full text-right text-[11px] ${download.error ? "text-rose-600" : "text-slate-500"}`}><Download className="mr-1 inline h-3 w-3" />{download.text}</p>}
      </div>

      {result.error && (
        <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{data ? "Could not refresh; showing the last result. " : ""}{result.error.message}
        </p>
      )}

      {data && (
        <div className={`space-y-3 ${result.loading ? "opacity-80 transition-opacity" : ""}`}>
          <DataTable key={data.columns.map((column) => column.label).join("|")} columns={columns} rows={rows} rowKey={(row) => row.id} dense
            initialPageSize={50} noun="measures" caption={title} empty="Nothing to compare." serial={false} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {data.charts.map((chart) => <CompareChart key={chart.id} chart={chart} data={data} title={title} onValue={openValue} />)}
          </div>
        </div>
      )}

      <ValueStudents open={listValue !== null} onClose={() => setListValue(null)} onStudent={onStudent}
        body={{ ...baseBody(state, fieldMap, focus), compareBy: { dimension: classCompare.dimension, value: listValue } }} />
    </section>
  );
}
