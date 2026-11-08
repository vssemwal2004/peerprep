import { useCallback, useMemo } from "react";
import { ChartScatter, Layers, LayoutGrid, List, Search, X } from "lucide-react";
import { topicMapOption, topicTreemapOption } from "../insightCharts";
import { filterTopics, formatPercent, stateCounts, STATE_ORDER, TOPIC_SORTS, TOPIC_STATES } from "../insightModel";
import { Card, Chart, Empty, focusRing, Pill, ProgressBar, Section, Segmented } from "./ui";

const VIEWS = [
  { id: "list", label: "List", icon: List },
  { id: "map", label: "Map", icon: ChartScatter },
  { id: "coverage", label: "Coverage", icon: LayoutGrid },
];
const LIST_PAGE = 15;

function TopicRow({ topic, onOpen }) {
  const state = TOPIC_STATES[topic.state];
  return (
    <li>
      <button type="button" onClick={() => onOpen(topic.key)} className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 text-left transition hover:bg-sky-50/50 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_70px] dark:hover:bg-white/[0.03] ${focusRing}`}>
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13.5px] font-semibold text-slate-900 dark:text-zinc-100">{topic.name}</span>
          {topic.core && <span className="hidden rounded bg-slate-100 px-1 text-[9.5px] font-bold uppercase tracking-wider text-slate-500 sm:inline dark:bg-white/[0.06] dark:text-zinc-400">Core</span>}
        </span>
        <Pill className={`${state.chip} justify-self-end sm:order-3 sm:justify-self-start`}>{state.label}</Pill>
        <span className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:order-2">
          <ProgressBar value={Math.min(topic.solved, topic.target)} max={topic.target} color={state.color} label={`${topic.name} progress to strong`} />
          <span className="w-[86px] shrink-0 text-right text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400"><b className="font-semibold text-slate-800 dark:text-zinc-200">{topic.solved}</b>/{topic.target} · of {topic.total}</span>
        </span>
        <span className="hidden text-right text-[12.5px] font-semibold tabular-nums text-slate-700 sm:order-4 sm:block dark:text-zinc-300">
          {formatPercent(topic.accuracy)}
          {topic.solvedInPeriod > 0 && <span className="block text-[10.5px] font-medium text-emerald-600 dark:text-emerald-400">+{topic.solvedInPeriod} new</span>}
        </span>
      </button>
    </li>
  );
}

export default function TopicsSection({ coverage, filters, onFilters, onOpenTopic, periodLabel }) {
  const { view, state, coreOnly, search, sort, limit } = filters;
  const counts = useMemo(() => stateCounts(coreOnly ? coverage.topics.filter((topic) => topic.core) : coverage.topics), [coverage.topics, coreOnly]);
  const topics = useMemo(() => filterTopics(coverage.topics, { state, coreOnly, search, sort }), [coverage.topics, state, coreOnly, search, sort]);
  const mapOption = useCallback((theme) => topicMapOption(topics, theme), [topics]);
  const treemapOption = useCallback((theme) => topicTreemapOption(topics, theme), [topics]);
  const notStartedHidden = view === "map" ? topics.filter((topic) => topic.state === "notStarted").length : 0;
  const set = (patch) => onFilters({ ...filters, ...patch });
  const openFromChart = (item) => { const key = item?.data?.topic?.key; if (key) onOpenTopic(key); };

  return (
    <Section id="topics" icon={Layers} title="Topics" subtitle={`How much of each topic you have covered and how much is correct · new solves: ${periodLabel}`}
      actions={<Segmented label="Topic view" options={VIEWS} value={view} onChange={(next) => set({ view: next })} size="sm" />}>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#eef0f3] p-3.5 dark:border-white/[0.06] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by state">
            {["all", ...STATE_ORDER].map((key) => {
              const active = state === key;
              const total = key === "all" ? Object.values(counts).reduce((sum, value) => sum + value, 0) : counts[key];
              return (
                <button key={key} type="button" aria-pressed={active} onClick={() => set({ state: key, limit: LIST_PAGE })}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset transition ${focusRing} ${active ? "bg-slate-900 text-white ring-slate-900 dark:bg-zinc-100 dark:text-zinc-900 dark:ring-zinc-100" : "bg-white text-slate-600 ring-[#e4e7ec] hover:bg-slate-50 dark:bg-transparent dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/[0.04]"}`}>
                  {key !== "all" && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: TOPIC_STATES[key].color }} aria-hidden="true" />}
                  {key === "all" ? "All" : TOPIC_STATES[key].label}
                  <span className="tabular-nums opacity-70">{total}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[12px] font-medium text-slate-600 dark:text-zinc-300">
              <input type="checkbox" checked={coreOnly} onChange={(event) => set({ coreOnly: event.target.checked, limit: LIST_PAGE })} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              Core only
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input type="search" value={search} onChange={(event) => set({ search: event.target.value, limit: LIST_PAGE })} placeholder="Find a topic" aria-label="Find a topic"
                className="h-8 w-40 rounded-lg border border-[#e4e7ec] bg-white pl-8 pr-2 text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-100 dark:focus:ring-sky-500/20" />
            </div>
            <select value={sort} onChange={(event) => set({ sort: event.target.value })} aria-label="Sort topics"
              className="h-8 rounded-lg border border-[#e4e7ec] bg-white px-2 text-[12.5px] font-medium text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-[#232325] dark:text-zinc-200">
              {TOPIC_SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </div>
        </div>

        {!topics.length ? (
          <Empty icon={Search} title="No topics match these filters." action={<button type="button" onClick={() => set({ state: "all", coreOnly: false, search: "" })} className={`inline-flex items-center gap-1 text-[12.5px] font-semibold text-sky-700 dark:text-sky-300 ${focusRing}`}><X className="h-3.5 w-3.5" />Clear filters</button>} />
        ) : view === "map" ? (
          <div className="p-3">
            <Chart option={mapOption} height={380} label="Topic map: progress to strong against accuracy" onClick={openFromChart} />
            {notStartedHidden > 0 && <p className="px-1 pt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">{notStartedHidden} topics not started yet are not on the map. Switch to List to see them.</p>}
          </div>
        ) : view === "coverage" ? (
          <div className="p-3"><Chart option={treemapOption} height={420} label="Topics sized by number of questions, coloured by state" onClick={openFromChart} /></div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_88px_70px] gap-x-4 border-b border-[#f1f2f4] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 sm:grid dark:border-white/[0.05] dark:text-zinc-500">
              <span>Topic</span><span>Progress to strong</span><span>State</span><span className="text-right">Accuracy</span>
            </div>
            <ul className="divide-y divide-[#f1f2f4] dark:divide-white/[0.05]">
              {topics.slice(0, limit).map((topic) => <TopicRow key={topic.key} topic={topic} onOpen={onOpenTopic} />)}
            </ul>
            {topics.length > limit && (
              <div className="border-t border-[#f1f2f4] p-2 text-center dark:border-white/[0.05]">
                <button type="button" onClick={() => set({ limit: limit + LIST_PAGE })} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}>
                  Show {Math.min(LIST_PAGE, topics.length - limit)} more · {topics.length - limit} left
                </button>
              </div>
            )}
          </>
        )}
      </Card>
      <p className="px-1 text-[11.5px] text-slate-500 dark:text-zinc-400">A topic is strong once you solve its target (10% of its questions, between 3 and 15) with at least 60% accuracy.</p>
    </Section>
  );
}
