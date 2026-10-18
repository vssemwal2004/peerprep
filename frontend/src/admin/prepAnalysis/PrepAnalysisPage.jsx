import { useMemo, useState } from "react";
import { AlertCircle, HelpCircle, LayoutGrid, Loader2, RefreshCw, Sigma } from "lucide-react";
import ChartCard from "./components/ChartCard";
import { ChartExpandDialog, ChartSettingsDialog, CustomizeDrawer } from "./components/ChartPanels";
import DownloadMenu from "./components/DownloadMenu";
import { FilterDrawer, FilterToolbar } from "./components/FilterDrawer";
import { KpiStrip, ScoreHelpDialog, StudentTable } from "./components/Insights";
import StudentDrawer from "./components/StudentDrawer";
import { sectionStyle } from "./components/sectionStyles";
import { Button } from "./components/ui";
import { featureFields, studentFields, toggleKpi } from "./filterModel";
import { usePrepAnalysis } from "./usePrepAnalysis";

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
    table, setTable, data, loading, error, refresh,
  } = usePrepAnalysis();
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsId, setSettingsId] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [studentId, setStudentId] = useState(null);

  // A chart's own conditions can use the feature's fields and the student fields.
  const chartFields = useMemo(() => (catalog ? [...featureFields(catalog, area), ...studentFields(catalog)] : []), [area, catalog]);
  const chartById = useMemo(() => new Map((catalog?.charts || []).map((chart) => [chart.id, chart])), [catalog]);

  if (catalogError) return <PageMessage title="Prep Analysis could not load">{catalogError.status === 403 ? "Analysis is not enabled for this university." : catalogError.message}</PageMessage>;
  if (!catalog) return <div className="flex h-64 items-center justify-center text-xs text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading Prep Analysis…</div>;
  if (!areas.length) return <PageMessage title="Nothing to analyse yet">This university has not turned on a feature that Prep Analysis covers.</PageMessage>;

  const meta = data?.meta;
  const areaLabel = areas.find((entry) => entry.key === area)?.label || "";
  const entryById = new Map(layout.map((entry) => [entry.id, entry]));
  const settingsEntry = entryById.get(settingsId);
  const charts = data?.charts || [];
  const groups = data?.kpiGroups || [];

  return (
    <main className="min-h-full bg-slate-50 font-sans text-slate-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
        <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white shadow-sm shadow-sky-600/25"><Sigma className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold leading-6 text-slate-950 dark:text-white">Prep Analysis</h1>
              <p className="truncate text-xs text-slate-500 dark:text-gray-400">Find any group of students and see how their prep is going</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button onClick={() => setCustomizeOpen(true)}><LayoutGrid className="h-3.5 w-3.5" />Charts</Button>
            <DownloadMenu catalog={catalog} area={area} areaLabel={areaLabel} state={state} fieldMap={fieldMap} matched={meta?.matched} table={table} />
            <Button tone="ghost" onClick={() => setHelpOpen(true)}><HelpCircle className="h-3.5 w-3.5" />Help</Button>
            <Button tone="ghost" onClick={refresh} disabled={loading} aria-label="Refresh data" title="Refresh data"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1680px] space-y-4 px-4 py-4">
        <FilterToolbar state={state} catalog={catalog} fieldMap={fieldMap} meta={meta} loading={loading} onOpen={() => setFiltersOpen(true)} onChange={update} />

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
          const sectionCharts = charts.filter((chart) => chart.section === group.key);
          return (
            <section key={group.key} className="space-y-3" aria-label={group.label}>
              <div className="flex items-center justify-between pt-1">
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${style.chip}`}><SectionIcon className="h-4 w-4" /></span>{group.label}
                </h2>
                {area === "all" && <button type="button" onClick={() => chooseArea(group.module)} className="text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">Analyse {group.label} only →</button>}
              </div>
              <KpiStrip section={group.key} kpis={group.kpis} loading={loading} state={state} fieldMap={fieldMap} onToggle={(rule) => update(toggleKpi(rule, state))} />
              {sectionCharts.length > 0 && (
                <div className={`grid grid-cols-12 gap-3 ${loading && data ? "opacity-80 transition-opacity" : ""}`}>
                  {sectionCharts.map((chart) => (
                    <ChartCard key={chart.id} chart={chart} entry={entryById.get(chart.id)}
                      onChange={(patch) => updateChart(chart.id, patch)}
                      onSettings={() => setSettingsId(chart.id)}
                      onExpand={(view) => setExpanded({ chart, view })}
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

        <StudentTable table={data?.students} area={area} loading={loading} onChange={setTable} onOpen={setStudentId} />
      </div>

      <FilterDrawer open={filtersOpen} state={state} catalog={catalog} fieldMap={fieldMap} matched={meta?.matched} onApply={update} onClose={() => setFiltersOpen(false)} />
      <CustomizeDrawer open={customizeOpen} charts={areaCharts} sections={catalog.sections || []} layout={layout} areaLabel={areaLabel} onClose={() => setCustomizeOpen(false)} onChange={setLayout} onReset={resetLayout} />
      <ChartSettingsDialog open={Boolean(settingsEntry)} entry={settingsEntry} definition={chartById.get(settingsId)} catalog={catalog} fields={chartFields}
        onClose={() => setSettingsId(null)}
        onSave={(draft) => { updateChart(settingsId, { filter: draft.filter, options: draft.options, labels: draft.labels }); setSettingsId(null); }} />
      <ChartExpandDialog chart={expanded?.chart} view={expanded?.view} onClose={() => setExpanded(null)} onStudent={(id) => { setExpanded(null); setStudentId(id); }} />
      <ScoreHelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} formula={meta?.formula || catalog.formula} />
      {studentId && <StudentDrawer studentId={studentId} range={state.range.preset} onClose={() => setStudentId(null)} />}
    </main>
  );
}
