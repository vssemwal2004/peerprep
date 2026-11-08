import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { DIFFICULTY_COLORS } from "../insightCharts";
import { insightsApi } from "../insightsApi";
import { formatPercent, shortDate, TOPIC_STATES } from "../insightModel";
import { Empty, focusRing, Pill, ProgressBar } from "./ui";

const TABS = [
  { id: "next", label: "Next", icon: Sparkles, empty: "You have tried every question here." },
  { id: "retry", label: "Retry", icon: RotateCcw, empty: "Nothing left half-done." },
  { id: "solved", label: "Solved", icon: CheckCircle2, empty: "No solves yet. Start with an easy one." },
];

function QuestionRow({ item, tab }) {
  return (
    <li>
      <Link to={item.to} className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-sky-50/70 dark:hover:bg-white/[0.04] ${focusRing}`}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: DIFFICULTY_COLORS[item.difficulty] }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-slate-800 group-hover:text-sky-700 dark:text-zinc-200 dark:group-hover:text-sky-300">{item.title}</span>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            {item.difficulty}{item.type !== "coding" ? " · Quiz" : ""}
            {tab === "solved" && item.solvedAt ? ` · solved ${shortDate(item.solvedAt)}` : ""}
            {tab === "retry" ? ` · ${item.graded} ${item.graded === 1 ? "try" : "tries"}${item.lastAt ? `, last ${shortDate(item.lastAt)}` : ""}` : ""}
          </span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** One topic in detail, as a side panel (a bottom sheet on phones). */
export default function TopicDrawer({ topicKey, onClose }) {
  const [state, setState] = useState({ key: null, loading: true, data: null, error: null });
  const [tab, setTab] = useState("next");
  const closeRef = useRef(null);

  useEffect(() => {
    if (!topicKey) return undefined;
    const controller = new AbortController();
    setState({ key: topicKey, loading: true, data: null, error: null });
    insightsApi.topic(topicKey, controller.signal)
      .then((data) => {
        setState({ key: topicKey, loading: false, data, error: null });
        setTab(data.counts.retry && !data.counts.next ? "retry" : data.counts.next ? "next" : "solved");
      })
      .catch((error) => { if (error.name !== "AbortError") setState({ key: topicKey, loading: false, data: null, error }); });
    return () => controller.abort();
  }, [topicKey]);

  useEffect(() => {
    if (!topicKey) return undefined;
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus?.(); };
  }, [topicKey, onClose]);

  if (!topicKey) return null;
  const { data, loading, error } = state;
  const topic = data?.topic;
  const meta = topic ? TOPIC_STATES[topic.state] : null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-end sm:items-stretch" role="presentation">
      <button type="button" aria-label="Close topic" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <aside role="dialog" aria-modal="true" aria-labelledby="topic-drawer-title"
        className="relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-h-none sm:max-w-[460px] sm:rounded-none sm:rounded-l-3xl dark:bg-[#1f1f21]">
        <header className="border-b border-[#eef0f3] px-5 pb-4 pt-5 dark:border-white/[0.06]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Topic</p>
              <h2 id="topic-drawer-title" className="truncate text-[20px] font-semibold tracking-[-0.02em] text-slate-950 dark:text-zinc-50">{topic?.name || "Loading…"}</h2>
            </div>
            <button ref={closeRef} type="button" onClick={onClose} className={`rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 ${focusRing}`} aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          {topic && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill className={meta.chip}>{meta.label}</Pill>
                <span className="text-[12.5px] text-slate-600 dark:text-zinc-300">Solved <b className="tabular-nums">{topic.solved}</b> of {topic.total} · accuracy <b className="tabular-nums">{formatPercent(topic.accuracy)}</b></span>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-[11.5px] text-slate-500 dark:text-zinc-400"><span>Progress to strong</span><span className="tabular-nums">{Math.min(topic.solved, topic.target)}/{topic.target}</span></div>
                <ProgressBar value={Math.min(topic.solved, topic.target)} max={topic.target} color={meta.color} height="h-2" label="Progress to strong" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["Easy", "Medium", "Hard"].map((level) => (
                  <div key={level} className="rounded-xl bg-[#f6f7f9] px-2.5 py-2 dark:bg-white/[0.04]">
                    <p className="text-[10.5px] font-semibold" style={{ color: DIFFICULTY_COLORS[level] }}>{level}</p>
                    <p className="text-[14px] font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{topic.byDifficulty[level].solved}<span className="text-[11px] font-medium text-slate-400">/{topic.byDifficulty[level].total}</span></p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading topic…</div>
          ) : error ? (
            <Empty title={error.message || "This topic could not be loaded."} />
          ) : (
            <>
              <div role="tablist" aria-label="Questions" className="mx-3 mb-2 flex gap-1 rounded-xl bg-[#f6f7f9] p-1 dark:bg-white/[0.04]">
                {TABS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold transition ${focusRing} ${tab === item.id ? "bg-white text-sky-700 shadow-sm dark:bg-[#2c2c2f] dark:text-sky-300" : "text-slate-500 hover:text-slate-800 dark:text-zinc-400"}`}>
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />{item.label}<span className="tabular-nums opacity-70">{data.counts[item.id]}</span>
                    </button>
                  );
                })}
              </div>
              {data[tab].length
                ? <ul role="tabpanel">{data[tab].map((item) => <QuestionRow key={`${item.source}:${item.id}`} item={item} tab={tab} />)}</ul>
                : <Empty title={TABS.find((item) => item.id === tab).empty} />}
              {data.counts[tab] > data[tab].length && <p className="px-3 pt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">Showing {data[tab].length} of {data.counts[tab]}.</p>}
            </>
          )}
        </div>

        {topic && (
          <footer className="border-t border-[#eef0f3] p-4 dark:border-white/[0.06]">
            <Link to={data.practiceAll} className={`flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-sky-700 ${focusRing}`}>
              Practise all {topic.total} in PrepCoding<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </footer>
        )}
      </aside>
    </div>
  );
}
