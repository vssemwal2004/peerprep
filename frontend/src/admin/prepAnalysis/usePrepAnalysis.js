import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalysisApi } from "./analysisScope";
import { defaultFilterState, normalizeState, switchArea, toQueryRequest, toRequestGroup } from "./filterModel";
import { prepAnalysisStateFromSearch } from "./analysisPreset";
import { upgradeToDefaults } from "./layoutDefaults";

const STORAGE_KEY = "peerprep.prepAnalysis.v5";
const OLD_STORAGE_KEYS = ["peerprep.prepAnalysis.v4", "peerprep.prepAnalysis.v3"];
const DEFAULT_TABLE = { sort: "", direction: "desc", page: 1, limit: 25 };
// One assessment's page ranks students by their score on it: the stored Prep Score covers all tests.
const SCOPED_TABLE = { ...DEFAULT_TABLE, sort: "testScore" };
// Filters apply as the admin ticks; a short pause lets several quick ticks become one request.
const QUERY_DELAY_MS = 180;

// Every visit opens on all students: only the chart layout (sizes, views, hidden charts, limits) is
// remembered per browser. Per-chart student filters and picked students are choices about WHICH
// students, so they are dropped like the page filters.
// Older versions could save a "how many" outside 1–100; it is brought back into range here.
const cleanLimit = (value) => {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) ? Math.min(100, Math.max(1, number)) : undefined;
};
const layoutOnly = (layouts) => Object.fromEntries(Object.entries(layouts || {}).map(([area, list]) => [area,
  Array.isArray(list) ? list.filter((entry) => entry && typeof entry.id === "string").map(({ filter: _filter, ...entry }) => {
    const { studentId: _studentId, limit, ...options } = entry.options || {};
    const kept = cleanLimit(limit);
    return { ...entry, options: kept ? { ...options, limit: kept } : options };
  }) : []]));

/**
 * A chart list with retired charts swapped for the chart that replaced them (the server's
 * `replacedCharts`, e.g. "Solved problems by difficulty" → "Trend of submissions till today").
 * Applied to every layout, from this browser, a saved view or the defaults, every time, so a
 * layout saved while an older server was running can never bring a retired chart back.
 */
export function replaceRetiredCharts(list, replaced = {}) {
  if (!Array.isArray(list)) return list;
  const seen = new Set();
  return list.flatMap((entry) => {
    const next = replaced[entry.id];
    // The old view (e.g. "Rose") means nothing for the new chart: only the card size carries over.
    const swapped = next ? { id: next, options: {}, ...(entry.size ? { size: entry.size } : {}) } : entry;
    if (seen.has(swapped.id)) return [];
    seen.add(swapped.id);
    return [swapped];
  });
}
const replaceInLayouts = (layouts, replaced) => Object.fromEntries(Object.entries(layouts || {}).map(([area, list]) => [area, replaceRetiredCharts(list, replaced)]));

function readStored() {
  try {
    const current = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (current) return { layouts: layoutOnly(current.layouts), versions: current.versions || {} };
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

// The area's default charts, with the card widths that page sets (catalog `defaultSizes`).
const defaultLayout = (catalog, area) => (catalog?.defaultLayout?.[area] || []).map((id) => {
  const size = catalog?.defaultSizes?.[area]?.[id];
  return { id, options: {}, ...(size ? { size } : {}) };
});

/**
 * `scope` ({ assessmentIds }) pins the analysis to those assessments, as on the report page: the
 * feature is always Prep Assessment and the page URL never decides the filters.
 */
export function usePrepAnalysis({ scope = null } = {}) {
  const api = useAnalysisApi();
  const scoped = Boolean(scope?.assessmentIds?.length);
  const stored = useMemo(readStored, []);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState(null);
  const [state, setState] = useState(() => (scoped ? defaultFilterState("assessment") : prepAnalysisStateFromSearch(window.location.search)));
  const [layouts, setLayouts] = useState(stored.layouts || {});
  // Which version of each area's default layout the saved layouts were made under.
  const [layoutVersions, setLayoutVersions] = useState(stored.versions || {});
  const baseTable = scoped ? SCOPED_TABLE : DEFAULT_TABLE;
  const [table, setTableState] = useState(baseTable);
  // "Only these students": the students behind one part of a chart, chosen from its popup.
  const [focus, setFocusState] = useState(null);
  // Compare: two named groups of students ({ label, group } each, groups as in the filter drawer).
  const [compare, setCompareState] = useState(null);
  // Compare classes: { dimension: "section" | "group" | "college" | …, values: [{ value, label }] }.
  // One comparison at a time: picking one ends the other.
  const [classCompare, setClassCompareState] = useState(null);
  const setCompare = useCallback((next) => { setCompareState(next); if (next) setClassCompareState(null); }, []);
  const setClassCompare = useCallback((next) => { setClassCompareState(next); if (next) setCompareState(null); }, []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const refreshRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    api.catalog(controller.signal)
      .then(setCatalog)
      .catch((caught) => { if (caught.name !== "AbortError") setCatalogError(caught); });
    return () => controller.abort();
  }, [api]);

  // Once the server says which charts were replaced, the stored layouts use the new ones (and are
  // saved that way), so size/view changes made later apply to the chart actually shown.
  useEffect(() => {
    if (catalog?.replacedCharts && Object.keys(catalog.replacedCharts).length) setLayouts((current) => replaceInLayouts(current, catalog.replacedCharts));
  }, [catalog]);
  // A redesigned default layout (e.g. Prep Coding, 2026-11-18) replaces older saved layouts once.
  useEffect(() => {
    if (!catalog?.defaultLayoutVersion) return;
    const upgraded = upgradeToDefaults(layouts, layoutVersions, catalog.defaultLayoutVersion);
    if (!upgraded) return;
    setLayouts(upgraded.layouts);
    setLayoutVersions(upgraded.versions);
    // Only when the catalog arrives: the admin's later layout changes must never be undone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const fieldMap = useMemo(() => new Map((catalog?.fields || []).map((field) => [field.key, field])), [catalog]);
  const areas = useMemo(() => catalog?.areas || [], [catalog]);
  const area = scoped
    ? (areas.some((entry) => entry.key === "assessment") ? "assessment" : null)
    : areas.some((entry) => entry.key === state.area) ? state.area : areas[0]?.key || null;

  // Only charts the catalog still offers for this area; a fresh area starts from its default layout.
  const areaCharts = useMemo(() => (catalog?.charts || []).filter((chart) => area === "all" || chart.module === area), [area, catalog]);
  const layout = useMemo(() => {
    if (!catalog || !area) return null;
    const known = new Set(areaCharts.map((chart) => chart.id));
    return replaceRetiredCharts(layouts[area] || defaultLayout(catalog, area), catalog.replacedCharts).filter((entry) => known.has(entry.id));
  }, [area, areaCharts, catalog, layouts]);

  const effectiveState = useMemo(() => (area && area !== state.area ? { ...state, area } : state), [area, state]);

  useEffect(() => {
    if (catalog) writeStored({ layouts, versions: { ...layoutVersions, ...(catalog.defaultLayoutVersion || {}) } });
  }, [catalog, layouts, layoutVersions]);

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
      api.query(JSON.parse(requestKey), { signal: controller.signal, refresh })
        .then((result) => { setData(result); setError(null); setLoading(false); })
        .catch((caught) => { if (caught.name !== "AbortError") { setError(caught); setLoading(false); } });
    }, refresh ? 0 : QUERY_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, refreshTick, requestKey]);

  const update = useCallback((next) => { setState(next); setTableState((current) => ({ ...current, page: 1 })); }, []);
  const chooseArea = useCallback((next) => {
    if (scoped) return;
    setState((current) => switchArea(current, next, fieldMap, catalog));
    // The student search box follows the admin from section to section.
    setTableState((current) => ({ ...baseTable, search: current.search || "" }));
    // A focus belongs to a chart of the area it was chosen in.
    setFocusState(null);
  }, [baseTable, catalog, fieldMap, scoped]);
  const setFocus = useCallback((next) => { setFocusState(next); setTableState((current) => ({ ...current, page: 1 })); }, []);
  // Opens a saved view: its feature, period and filters, and its charts for that feature.
  const applyView = useCallback((view) => {
    const next = normalizeState(view.state, view.area);
    setState({ ...next, area: view.area });
    // A view saved before a chart was replaced opens with the new chart.
    if (Array.isArray(view.layout) && view.layout.length) setLayouts((current) => ({ ...current, [view.area]: replaceRetiredCharts(view.layout, catalog?.replacedCharts) }));
    setTableState(baseTable);
    setFocusState(null);
  }, [baseTable, catalog]);
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
    classCompare, setClassCompare,
  };
}
