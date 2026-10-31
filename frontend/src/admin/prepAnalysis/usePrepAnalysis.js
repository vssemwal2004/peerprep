import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prepAnalysisApi } from "./api";
import { normalizeState, switchArea, toQueryRequest, toRequestGroup } from "./filterModel";
import { prepAnalysisStateFromSearch } from "./analysisPreset";

const STORAGE_KEY = "peerprep.prepAnalysis.v5";
const OLD_STORAGE_KEYS = ["peerprep.prepAnalysis.v4", "peerprep.prepAnalysis.v3"];
const DEFAULT_TABLE = { sort: "", direction: "desc", page: 1, limit: 25 };
// Filters apply as the admin ticks; a short pause lets several quick ticks become one request.
const QUERY_DELAY_MS = 180;

// Every visit opens on all students: only the chart layout (sizes, views, hidden charts, limits) is
// remembered per browser. Per-chart student filters and picked students are choices about WHICH
// students, so they are dropped like the page filters.
const layoutOnly = (layouts) => Object.fromEntries(Object.entries(layouts || {}).map(([area, list]) => [area,
  Array.isArray(list) ? list.map(({ filter: _filter, ...entry }) => {
    const { studentId: _studentId, ...options } = entry.options || {};
    return { ...entry, options };
  }) : []]));

function readStored() {
  try {
    const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (current) return { layouts: layoutOnly(current.layouts) };
    for (const key of OLD_STORAGE_KEYS) {
      const old = JSON.parse(window.localStorage.getItem(key) || "null");
      if (old) return { layouts: layoutOnly(old.layouts) };
    }
    return {};
  } catch { return {}; }
}
function writeStored(value) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const EMPTY_FILTER = { type: "group", join: "and", children: [] };
/** The request form of a comparison: [{ label, filter }, { label, filter }]. */
export const compareRequest = (compare, fieldMap) => compare.map((side) => ({ label: side.label, filter: toRequestGroup(side.group, fieldMap) || EMPTY_FILTER }));

const defaultLayout = (catalog, area) => (catalog?.defaultLayout?.[area] || []).map((id) => ({ id, options: {} }));

export function usePrepAnalysis() {
  const stored = useMemo(readStored, []);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [state, setState] = useState(() => prepAnalysisStateFromSearch(window.location.search));
  const [layouts, setLayouts] = useState(stored.layouts || {});
  const [table, setTableState] = useState(DEFAULT_TABLE);
  // "Only these students": the students behind one part of a chart, chosen from its popup.
  const [focus, setFocusState] = useState(null);
  // Compare: two named groups of students ({ label, group } each, groups as in the filter drawer).
  const [compare, setCompare] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    prepAnalysisApi.catalog(controller.signal)
      .then(setCatalog)
      .catch((caught) => { if (caught.name !== "AbortError") setCatalogError(caught); });
    return () => controller.abort();
  }, []);

  const fieldMap = useMemo(() => new Map((catalog?.fields || []).map((field) => [field.key, field])), [catalog]);
  const areas = useMemo(() => catalog?.areas || [], [catalog]);
  const area = areas.some((entry) => entry.key === state.area) ? state.area : areas[0]?.key || null;

  // Only charts the catalog still offers for this area; a fresh area starts from its default layout.
  const areaCharts = useMemo(() => (catalog?.charts || []).filter((chart) => area === "all" || chart.module === area), [area, catalog]);
  const layout = useMemo(() => {
    if (!catalog || !area) return null;
    const known = new Set(areaCharts.map((chart) => chart.id));
    return (layouts[area] || defaultLayout(catalog, area)).filter((entry) => known.has(entry.id));
  }, [area, areaCharts, catalog, layouts]);

  const effectiveState = useMemo(() => (area && area !== state.area ? { ...state, area } : state), [area, state]);

  useEffect(() => {
    if (catalog) writeStored({ layouts });
  }, [catalog, layouts]);

  // The request only changes with filters, chart settings and the table, not with a chart's view or width.
  const requestKey = useMemo(() => {
    if (!catalog || !area || !layout) return null;
    return JSON.stringify({
      ...toQueryRequest({ state: effectiveState, layout, table: { ...table, sort: table.sort || undefined } }, fieldMap),
      ...(focus ? { focus } : {}),
      ...(compare ? { compare: compareRequest(compare, fieldMap) } : {}),
    });
  }, [area, catalog, compare, effectiveState, fieldMap, focus, layout, table]);

  useEffect(() => {
    if (!requestKey) return undefined;
    const controller = new AbortController();
    const refresh = refreshRef.current;
    refreshRef.current = false;
    setLoading(true);
    const timer = setTimeout(() => {
      prepAnalysisApi.query(JSON.parse(requestKey), { signal: controller.signal, refresh })
        .then((result) => { setData(result); setError(null); setLoading(false); })
        .catch((caught) => { if (caught.name !== "AbortError") { setError(caught); setLoading(false); } });
    }, refresh ? 0 : QUERY_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [refreshTick, requestKey]);

  const update = useCallback((next) => { setState(next); setTableState((current) => ({ ...current, page: 1 })); }, []);
  const chooseArea = useCallback((next) => {
    setState((current) => switchArea(current, next, fieldMap, catalog));
    setTableState(DEFAULT_TABLE);
    // A focus belongs to a chart of the area it was chosen in.
    setFocusState(null);
  }, [catalog, fieldMap]);
  const setFocus = useCallback((next) => { setFocusState(next); setTableState((current) => ({ ...current, page: 1 })); }, []);
  // Opens a saved view: its feature, period and filters, and its charts for that feature.
  const applyView = useCallback((view) => {
    const next = normalizeState(view.state, view.area);
    setState({ ...next, area: view.area });
    if (Array.isArray(view.layout) && view.layout.length) setLayouts((current) => ({ ...current, [view.area]: view.layout }));
    setTableState(DEFAULT_TABLE);
    setFocusState(null);
  }, []);
  const setLayout = useCallback((next) => setLayouts((current) => ({ ...current, [area]: next })), [area]);
  const updateChart = useCallback((id, patch) => setLayouts((current) => {
    const list = current[area] || defaultLayout(catalog, area);
    return { ...current, [area]: list.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) };
  }), [area, catalog]);
  const resetLayout = useCallback(() => setLayouts((current) => ({ ...current, [area]: defaultLayout(catalog, area) })), [area, catalog]);
  const refresh = useCallback(() => { refreshRef.current = true; setRefreshTick((tick) => tick + 1); }, []);
  const setTable = useCallback((patch) => setTableState((current) => ({ ...current, ...patch })), []);

  return {
    catalog, catalogError, fieldMap, areas, area, chooseArea,
    state: effectiveState, update, layout: layout || [], areaCharts, setLayout, updateChart, resetLayout,
    table, setTable, data, loading, error, refresh, refreshTick, focus, setFocus, applyView, layouts, compare, setCompare,
  };
}
