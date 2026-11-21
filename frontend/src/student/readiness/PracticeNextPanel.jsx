import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, RefreshCw, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { api } from '../../utils/api';
import { useReadiness } from './useReadiness';
import { focusRing, percent, signed, TRACK_META } from './readinessModel';

const DIFFICULTY = {
  Easy: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  Medium: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  Hard: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
};
const QUOTA = {
  open: { label: 'Prep Score open today', cls: 'text-emerald-700 dark:text-emerald-300' },
  partial: { label: 'Some tags full today', cls: 'text-amber-700 dark:text-amber-300' },
  full: { label: 'Tags full today · readiness only', cls: 'text-slate-500 dark:text-zinc-400' },
};

function Chips({ icon: Icon, title, items, render }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{title}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">{items.map((item) => <li key={item.key} className="rounded-full bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.04] dark:text-zinc-200 dark:ring-white/10">{render(item)}</li>)}</ul>
    </div>
  );
}

/**
 * ANVI Practice Next: deterministic picks from the real catalogue for the selected track (server:
 * services/prepReadiness/recommend.js), with the reason, the readiness gain and today's quota.
 * Also the student's real strengths and topics that improved in the last 14 days.
 */
export default function PracticeNextPanel({ track, insights }) {
  const fetcher = useCallback(() => api.getPrepReadinessPractice(track), [track]);
  const { data, loading, error, reload } = useReadiness(fetcher, [track]);
  const meta = TRACK_META[track];
  const trackInsights = insights?.[track];

  return (
    <section aria-labelledby="practice-next-title" data-guide="an-readiness-next"
      className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/70 via-white to-white p-4 dark:border-violet-400/15 dark:from-violet-500/[0.07] dark:via-[#232325] dark:to-[#232325]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="practice-next-title" className="flex items-center gap-2 text-[14px] font-semibold text-slate-900 dark:text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /></span>
          ANVI Practice Next <span className="text-[12px] font-normal text-slate-500 dark:text-zinc-400">· {meta.full}</span>
        </h3>
        {data?.level ? <span className="text-[11.5px] text-slate-500 dark:text-zinc-400">Suggested level: <b className="text-slate-700 dark:text-zinc-200">{data.level}</b></span> : null}
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Chips icon={Trophy} title="Strong topics" items={trackInsights?.strengths} render={(item) => `${item.label} · ${percent(item.progress)}`} />
        <Chips icon={TrendingUp} title={`Improved in ${trackInsights?.windowDays || 14} days`} items={trackInsights?.improved} render={(item) => `${item.label} ${signed(item.gain)}`} />
      </div>

      {loading && !data ? (
        <ul className="mt-3 space-y-2" aria-hidden="true">{[0, 1, 2].map((key) => <li key={key} className="h-[74px] animate-pulse rounded-xl bg-white/80 dark:bg-white/[0.04]" />)}</ul>
      ) : error && !data ? (
        <p className="mt-3 flex items-center gap-2 text-[12.5px] text-slate-600 dark:text-zinc-300">Suggestions could not be loaded.
          <button type="button" onClick={reload} className={`inline-flex items-center gap-1 font-semibold text-violet-700 dark:text-violet-300 ${focusRing}`}><RefreshCw className="h-3.5 w-3.5" />Retry</button></p>
      ) : data?.items?.length ? (
        <ol className="mt-3 space-y-2">
          {data.items.map((item, index) => (
            <li key={item.problemKey}>
              <Link to={item.url} className={`group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white p-3 transition hover:border-violet-300 hover:shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-violet-400/40 ${focusRing}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-200">{index + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-[13px] font-semibold text-slate-900 group-hover:text-violet-700 dark:text-zinc-50 dark:group-hover:text-violet-300">{item.title}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${DIFFICULTY[item.difficulty]}`}>{item.difficulty}</span>
                    <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/10 dark:text-violet-200">{item.topicLabel}</span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-snug text-slate-600 dark:text-zinc-300">{item.reason}</span>
                  <span className={`mt-1 block text-[11px] font-medium ${QUOTA[item.quota.state].cls}`}>{QUOTA[item.quota.state].label}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-bold tabular-nums text-violet-700 dark:text-violet-300">+{item.gain.toFixed(2)}</span>
                  <span className="block text-[10px] text-slate-400">{meta.label}</span>
                  <ArrowRight className="ml-auto mt-1 h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-violet-500" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 rounded-xl bg-white/80 px-3 py-3 text-[12.5px] text-slate-600 dark:bg-white/[0.03] dark:text-zinc-300">{data?.empty || 'No suggestion right now.'}</p>
      )}
      {data?.allCapped ? <p className="mt-2 text-[11.5px] text-amber-700 dark:text-amber-300">Every suitable topic is full for Prep Score today (resets 12:00 AM IST). These still raise your readiness.</p> : null}
    </section>
  );
}
