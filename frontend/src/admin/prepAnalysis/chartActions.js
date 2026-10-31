// The requests behind a chart's full page, its drill panel and its downloads. `analysis` is
// { state, fieldMap, catalog, entryById }: the page's filters and the chart layout, so every
// request uses exactly the students the chart shows.

import { useCallback, useRef, useState } from "react";
import { prepAnalysisApi } from "./api";
import { useToasts } from "./components/Toasts";
import { optionLookup, summaryLines, toQueryRequest } from "./filterModel";

/**
 * The /query body for one chart, with its own filter and options (plus `options`), any focus,
 * and any comparison; `group` (0 or 1) narrows it to one side of the comparison.
 */
export function chartRequest(analysis, chartId, options = {}, group = null) {
  const entry = analysis.entryById?.get(chartId) || { id: chartId, options: {} };
  const body = toQueryRequest({ state: analysis.state, layout: [{ ...entry, options: { ...(entry.options || {}), ...options } }] }, analysis.fieldMap);
  return {
    ...body,
    ...(analysis.focus ? { focus: analysis.focus } : {}),
    ...(analysis.compareRequest ? { compare: analysis.compareRequest, ...(group === 0 || group === 1 ? { group } : {}) } : {}),
  };
}

/** A focus on the students behind `part` of `chart`, with the chart's own filter and options. */
export function focusOn(analysis, chart, part) {
  const [entry] = chartRequest({ ...analysis, focus: null, compareRequest: null }, chart.id).charts;
  return { chartId: chart.id, key: part.key, label: `${part.label} · ${chart.title}`, ...(entry.filter ? { filter: entry.filter } : {}), ...(entry.options ? { options: entry.options } : {}) };
}

/** The filters in plain words, for the top of a downloaded file. */
export function filterLines(analysis) {
  const metricLabel = (key) => analysis.fieldMap.get(key)?.label || key;
  return summaryLines(analysis.state, analysis.fieldMap, metricLabel, optionLookup(analysis.catalog));
}

/** The students behind a chart (or one part of it, `drill.key`), a page at a time. */
export function drillChart(analysis, chartId, { group = null, ...drill }, signal) {
  return prepAnalysisApi.drill({ ...chartRequest(analysis, chartId, {}, group), drill: { chartId, ...drill } }, signal);
}

/** The chart's detailed file: Excel (summary, chart data, students, detail) or CSV (students). */
export function downloadChart(analysis, chartId, { key = "", format = "xlsx", group = null } = {}) {
  const side = analysis.compareRequest && (group === 0 || group === 1) ? [`Group: ${analysis.compareRequest[group].label}`] : [];
  const summary = [...filterLines(analysis), ...(analysis.focus ? [`Only: ${analysis.focus.label}`] : []), ...side];
  return prepAnalysisApi.download({ ...chartRequest(analysis, chartId, {}, group), scope: "chart", drill: { chartId, key }, format, summary });
}

/** Downloads one chart's file, with progress in a toast: { run(format, key, label), busy }. */
export function useChartDownload(analysis, chartId) {
  const toasts = useToasts();
  const [busy, setBusy] = useState(false);
  const analysisRef = useRef(analysis);
  analysisRef.current = analysis;
  const run = useCallback(async (format, key = "", label = "", group = null) => {
    setBusy(true);
    const kind = format === "xlsx" ? "Excel" : "CSV";
    const id = toasts.show({ tone: "busy", title: `Preparing ${kind}…`, text: label });
    try {
      const result = await downloadChart(analysisRef.current, chartId, { format, key, group });
      toasts.update(id, { tone: "done", title: `${kind} downloaded${result.rowCount != null ? ` · ${result.rowCount.toLocaleString()} students` : ""}`, text: result.filename });
    } catch (error) {
      toasts.update(id, { tone: "error", title: "Download failed", text: error.message });
    } finally {
      setBusy(false);
    }
  }, [chartId, toasts]);
  return { busy, run };
}
