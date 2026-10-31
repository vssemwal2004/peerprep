import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Crosshair, EyeOff, HelpCircle, LayoutGrid, Loader2, RefreshCw, Users, X } from "lucide-react";
import { focusOn } from "./chartActions";
import { buildChartOption } from "./charts/chartOptions";
import { ALL_STUDENTS } from "./charts/chartParts";
import { chartTheme } from "./charts/chartTheme";
import AnalysisHeader from "./components/AnalysisHeader";
import ChartCard from "./components/ChartCard";
import ChartFullPage from "./components/ChartFullPage";
import PartDialog from "./components/PartDialog";
import { ToastProvider } from "./components/Toasts";
import { ChartSettingsDialog, CustomizeDrawer } from "./components/ChartPanels";
import DownloadMenu from "./components/DownloadMenu";
import { FilterDrawer, FilterToolbar } from "./components/FilterDrawer";
import { KpiStrip, ScoreHelpDialog, StudentTable } from "./components/Insights";
import StudentDrawer from "./components/StudentDrawer";
import ViewsMenu from "./components/ViewsMenu";
import CompareControl, { CompareChip } from "./components/CompareBar";
import { sectionStyle } from "./components/sectionStyles";
import { Button, IconButton } from "./components/ui";
import { featureFields, isKpiActive, kpiRule, studentFields, toggleKpi } from "./filterModel";
import { compareRequest, usePrepAnalysis } from "./usePrepAnalysis";

/** "Only: Hard problems · Solved problems by difficulty (12)" with a clear button. */
function FocusChip({ label, count, onClear }) {
  return (
    <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-sky-600 pl-3 pr-1 text-[11.5px] font-semibold text-white shadow-sm">
      <Crosshair className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">Only: {label}{count !== undefined ? ` (${count.toLocaleString()})` : ""}</span>
      <button type="button" onClick={onClear} aria-label="Show every student again" className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full hover:bg-white/20"><X className="h-3 w-3" /></button>
    </span>
  );
}

/**
 * Charts with nothing to draw for these students are hidden; this says so. When a whole section
 * is empty (e.g. "Not practising") it becomes the way to see and download those students.
 */
function NoActivityNote({ section, charts, students, all, onList }) {
  const names = charts.map((chart) => chart.title).join(", ");
  if (!all) {
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-500 dark:text-slate-400" title={names}>
        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
        {charts.length} chart{charts.length === 1 ? " has" : "s have"} nothing to show for these students
        <button type="button" onClick={onList} className="font-semibold text-sky-700 hover:underline dark:text-sky-300">See the students</button>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-900">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300"><Users className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-slate-900 dark:text-white">No {section} activity for these {students.toLocaleString()} students</p>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">The charts are hidden because there is nothing to draw. See who these students are, or download them.</p>
      </div>
      <Button tone="primary" onClick={onList}><Users className="h-3.5 w-3.5" />See the {students.toLocaleString()} students</Button>
    </div>
  );
}

function PageMessage({ icon: Icon = AlertCircle, title, children, action }) {
  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <Icon className="mx-auto h-6 w-6 text-slate-400" />
      <h2 className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-gray-400">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export default function PrepAnalysisPage() {
  const {
    catalog, catalogError, fieldMap, areas, area, chooseArea, state, update, layout, areaCharts, setLayout, updateChart, resetLayout,
    table, setTable, data, loading, error, refresh, refreshTick, focus, setFocus, applyView, compare, setCompare,
  } = usePrepAnalysis();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsId, setSettingsId] = useState(null);
  const [studentId, setStudentId] = useState(null);
  // The part popup: { chart, part } for the students behind a bar, slice or row.
  const [openPart, setOpenPart] = useState(null);
  const showPart = useCallback((chart, part) => setOpenPart({ chart, part }), []);
  // ?chart=<id> opens a chart on its own page; Back returns to every chart.
  const [searchParams, setSearchParams] = useSearchParams();
  const fullChartId = searchParams.get("chart");
  const openChart = useCallback((chartId) => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.set("chart", chartId);
    return next;
  }), [setSearchParams]);
  const closeChart = useCallback(() => setSearchParams((current) => {
    const next = new URLSearchParams(current);
    next.delete("chart");
    return next;
  }), [setSearchParams]);

  // A chart's own conditions can use the feature's fields and the student fields.
  const chartFields = useMemo(() => (catalog ? [...featureFields(catalog, area), ...studentFields(catalog)] : []), [area, catalog]);
  const chartById = useMemo(() => new Map((catalog?.charts || []).map((chart) => [chart.id, chart])), [catalog]);
  const entryById = useMemo(() => new Map(layout.map((entry) => [entry.id, entry])), [layout]);
  // What every chart request needs: the page's filters and each chart's own settings.
  // Charts with nothing to draw for these students (e.g. "Not practising"): hidden, not shown blank.
  const emptyIds = useMemo(() => new Set((data?.charts || []).filter((chart) => !buildChartOption(chart, chartTheme(false), "chart")).map((chart) => chart.id)), [data]);
  const compareBody = useMemo(() => (compare ? compareRequest(compare, fieldMap) : null), [compare, fieldMap]);
  const analysis = useMemo(() => ({ state, fieldMap, catalog, entryById, focus, compareRequest: compareBody }), [catalog, compareBody, entryById, fieldMap, focus, state]);
  // Each compared group's version of every chart and KPI section, by id / key.
  const sidesFor = useMemo(() => {
    if (!compare || !data?.compare) return () => null;
    return (chart) => data.compare.map((side) => {
      const own = side.charts.find((entry) => entry.id === chart.id);
      return own ? { label: side.label, chart: { ...chart, data: own.data, summary: own.summary, studentCount: own.studentCount } } : null;
    }).filter(Boolean);
  }, [compare, data]);
  const filterChips = (focus || compare) ? <>
    {focus && <FocusChip label={focus.label} count={data?.meta?.focus?.students} onClear={() => setFocus(null)} />}
    {compare && <CompareChip compare={compare} counts={data?.compare?.map((side) => side.matched)} onClear={() => setCompare(null)} />}
  </> : null;

  if (catalogError) return <PageMessage title="Prep Analysis could not load">{catalogError.status === 403 ? "Analysis is not enabled for this university." : catalogError.message}</PageMessage>;
  if (!catalog) return <div className="flex h-64 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Prep Analysis…</div>;
  if (!areas.length) return <PageMessage title="Nothing to analyse yet">This university has not turned on a feature that Prep Analysis covers.</PageMessage>;

  const meta = data?.meta;
  const areaLabel = areas.find((entry) => entry.key === area)?.label || "";
  // A headline number picked these students (e.g. "Not practising"): their list leads the page.
  const activeKpi = (data?.kpiGroups || []).flatMap((group) => group.kpis.map((kpi) => ({ section: group.key, kpi, rule: kpiRule(group.key, kpi.id, fieldMap) })))
    .find((entry) => entry.rule && isKpiActive(entry.rule, state));
  const studentList = (title, actions) => (
    <StudentTable table={data?.students} area={area} loading={loading} onChange={setTable} onOpen={setStudentId} title={title} actions={actions} />
  );
  const settingsEntry = entryById.get(settingsId);
  const charts = data?.charts || [];
  const groups = data?.kpiGroups || [];
  // A chart opened from a link that is not on this area's page falls back to every chart.
  const fullChart = fullChartId && entryById.has(fullChartId) ? fullChartId : null;

  return (
    <ToastProvider>
    <main className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-gray-950 dark:text-gray-100">
      <AnalysisHeader areas={areas} area={area} onArea={chooseArea} period={state.range.preset} onPeriod={(preset) => update({ ...state, range: { preset } })}>
        <CompareControl compare={compare} catalog={catalog} area={area} fieldMap={fieldMap} onApply={setCompare} />
        <ViewsMenu area={area} state={state} layout={layout} onApply={applyView} />
        <Button onClick={() => setCustomizeOpen(true)} title="Choose charts" aria-label="Choose charts"><LayoutGrid className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Charts</span></Button>
        <DownloadMenu catalog={catalog} area={area} areaLabel={areaLabel} state={state} fieldMap={fieldMap} matched={meta?.matched} table={table} focus={focus} />
        <IconButton label="How Prep Score works" onClick={() => setHelpOpen(true)}><HelpCircle className="h-4 w-4" /></IconButton>
        <IconButton label="Refresh data" onClick={refresh} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></IconButton>
      </AnalysisHeader>

      {fullChart ? (
        <div className="mx-auto max-w-[1680px] px-4 py-4">
          <ChartFullPage key={fullChart} chartId={fullChart} cardChart={charts.find((chart) => chart.id === fullChart)} entry={entryById.get(fullChart)}
            analysis={analysis} meta={meta} refreshTick={refreshTick}
            onBack={closeChart} onStudent={setStudentId} onPart={showPart} onOpenFilters={() => setFiltersOpen(true)} onFilterChange={update} filterExtra={filterChips}
            onSettings={() => setSettingsId(fullChart)} onView={(view) => updateChart(fullChart, { view })} />
        </div>
      ) : (
      <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-4">
        <FilterToolbar state={state} catalog={catalog} fieldMap={fieldMap} meta={meta} loading={loading} onOpen={() => setFiltersOpen(true)} onChange={update} extra={filterChips} />

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{data ? "Could not refresh; showing the last result. " : ""}{error.message}</span>
          </div>
        )}

        {/* One section per feature. Quick Prep sheets are part of Prep Coding. */}
        {!groups.length ? <KpiStrip kpis={null} /> : groups.map((group) => {
          const style = sectionStyle(group.key);
          const SectionIcon = style.Icon;
          const allCharts = charts.filter((chart) => chart.section === group.key);
          // While comparing, a chart empty for everyone may still have data for one group, so all stay.
          const hidden = compare ? [] : allCharts.filter((chart) => emptyIds.has(chart.id));
          const sectionCharts = allCharts.filter((chart) => !hidden.includes(chart));
          return (
            <section key={group.key} className="space-y-3" aria-label={group.label}>
              <div className="flex items-center justify-between pt-1">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${style.chip}`}><SectionIcon className="h-4 w-4" /></span>{group.label}
                </h2>
                {area === "all" && <button type="button" onClick={() => chooseArea(group.module)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">Analyse {group.label} only →</button>}
              </div>
              <KpiStrip section={group.key} kpis={group.kpis} loading={loading} state={state} fieldMap={fieldMap} onToggle={(rule) => update(toggleKpi(rule, state))}
                compare={compare && data?.compare ? data.compare.map((side) => ({ label: side.label, kpis: side.kpiGroups.find((entry) => entry.key === group.key)?.kpis || [] })) : null} />
              {activeKpi?.section === group.key && studentList(`${activeKpi.kpi.label}: these students`,
                <DownloadMenu catalog={catalog} area={area} areaLabel={areaLabel} state={state} fieldMap={fieldMap} matched={meta?.matched} table={table} focus={focus} />)}
              {hidden.length > 0 && (meta?.matched || 0) > 0 && (
                <NoActivityNote section={group.label} charts={hidden} students={meta.matched} all={!sectionCharts.length}
                  onList={() => showPart(hidden[0], { key: ALL_STUDENTS, label: "Students in view" })} />
              )}
              {sectionCharts.length > 0 && (
                <div className={`grid grid-cols-12 gap-3 ${loading && data ? "opacity-80 transition-opacity" : ""}`}>
                  {sectionCharts.map((chart, index) => (
                    <ChartCard key={chart.id} chart={chart} entry={entryById.get(chart.id)} analysis={analysis} index={index}
                      onChange={(patch) => updateChart(chart.id, patch)}
                      onSettings={() => setSettingsId(chart.id)}
                      onOpen={() => openChart(chart.id)}
                      onPart={showPart} compareSides={sidesFor(chart)}
                      onRemove={() => setLayout(layout.filter((entry) => entry.id !== chart.id))}
                      onStudent={setStudentId} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
        {data && layout.length === 0 && (
          <PageMessage icon={LayoutGrid} title="No charts on the page" action={<Button tone="primary" onClick={() => setCustomizeOpen(true)}>Add charts</Button>}>Pick the charts you want to see.</PageMessage>
        )}

        {!activeKpi && studentList("Students")}
      </div>
      )}

      <FilterDrawer open={filtersOpen} state={state} catalog={catalog} fieldMap={fieldMap} matched={meta?.matched} onApply={update} onClose={() => setFiltersOpen(false)} />
      <CustomizeDrawer open={customizeOpen} charts={areaCharts} sections={catalog.sections || []} layout={layout} areaLabel={areaLabel} onClose={() => setCustomizeOpen(false)} onChange={setLayout} onReset={resetLayout} />
      <ChartSettingsDialog open={Boolean(settingsEntry)} entry={settingsEntry} definition={chartById.get(settingsId)} catalog={catalog} fields={chartFields}
        onClose={() => setSettingsId(null)}
        onSave={(draft) => { updateChart(settingsId, { filter: draft.filter, options: draft.options, labels: draft.labels }); setSettingsId(null); }} />
      <ScoreHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <PartDialog open={openPart} analysis={analysis} layered={Boolean(studentId)} onClose={() => setOpenPart(null)} onStudent={setStudentId}
        onFocus={(part) => { setFocus(focusOn(analysis, openPart.chart, part)); setOpenPart(null); }}
        onOpenFull={fullChart ? undefined : () => { const chartId = openPart?.chart.id; setOpenPart(null); if (chartId) openChart(chartId); }} />
      {studentId && <StudentDrawer studentId={studentId} range={state.range.preset} onClose={() => setStudentId(null)} />}
    </main>
    </ToastProvider>
  );
}
