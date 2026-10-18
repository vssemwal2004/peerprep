import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { prepAnalysisApi } from "./api";
<<<<<<< Updated upstream
import { switchArea, toQueryRequest } from "./filterModel";
import { prepAnalysisStateFromSearch } from "./analysisPreset";
=======
import { normalizeState, switchArea, toQueryRequest } from "./filterModel";
>>>>>>> Stashed changes

const STORAGE_KEY = "peerprep.prepAnalysis.v4";
const OLD_STORAGE_KEY = "peerprep.prepAnalysis.v3";
const DEFAULT_TABLE = { sort: "", direction: "desc", page: 1, limit: 25 };
// Filters apply as the admin ticks; a short pause lets several quick ticks become one request.
const QUERY_DELAY_MS = 180;

// Filters and chart layouts are a per-browser convenience; the page works without them.
// Version 3 kept flat filters (moved into the new sections by normalizeState) and chart layouts without per-chart groups.
function readStored() {
  try {
    const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (current) return current;
    const old = JSON.parse(window.localStorage.getItem(OLD_STORAGE_KEY) || "null");
    return old ? { state: old.state } : {};
  } catch { return {}; }
}
function writeStored(value) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const defaultLayout = (catalog, area) => (catalog?.defaultLayout?.[area] || []).map((id) => ({ id, options: {} }));

export function usePrepAnalysis() {
  const stored = useMemo(readStored, []);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
<<<<<<< Updated upstream
  const [state, setState] = useState(() => prepAnalysisStateFromSearch(window.location.search, stored.state));
=======
  const [state, setState] = useState(() => normalizeState(stored.state));
>>>>>>> Stashed changes
  const [layouts, setLayouts] = useState(stored.layouts || {});
  const [table, setTableState] = useState(DEFAULT_TABLE);
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
    if (catalog) writeStored({ state: effectiveState, layouts });
  }, [catalog, effectiveState, layouts]);

  // The request only changes with filters, chart settings and the table, not with a chart's view or width.
  const requestKey = useMemo(() => {
    if (!catalog || !area || !layout) return null;
    return JSON.stringify(toQueryRequest({ state: effectiveState, layout, table: { ...table, sort: table.sort || undefined } }, fieldMap));
  }, [area, catalog, effectiveState, fieldMap, layout, table]);

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
  }, [catalog, fieldMap]);
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
    table, setTable, data, loading, error, refresh,
  };
}
