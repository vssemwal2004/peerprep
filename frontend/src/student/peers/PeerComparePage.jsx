import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Lightbulb, Medal, Swords } from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import PeerAvatar from './PeerAvatar';
import { errorMessage } from './peerNetwork';
import { compareInsight } from './compareInsight';
import { DuelLegend, DuelRow, MATE_COLOR, MirrorBars, WeeklyDuelChart, YOU_COLOR } from './circleViz';

const card = 'rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]';
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';

function CardHeading({ title, subtitle, children }) {
  return <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
    <div><h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">{title}</h2>{subtitle && <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">{subtitle}</p>}</div>
    {children}
  </header>;
}

export default function PeerComparePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    api.comparePrepMate(id)
      .then((data) => { if (active) setState({ loading: false, error: null, data }); })
      .catch((error) => { if (active) setState({ loading: false, error, data: null }); });
    return () => { active = false; };
  }, [id]);

  const data = state.data;
  const mateName = data ? firstName(data.mate.name) : '';
  const insight = useMemo(() => (data ? compareInsight(data) : ''), [data]);

  if (state.loading) {
    return <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-12 pt-5 sm:px-6" aria-busy="true">
      {[0, 1, 2].map((key) => <div key={key} className="h-40 animate-pulse rounded-2xl bg-slate-100 dark:bg-zinc-800" />)}
    </div>;
  }
  if (state.error || !data) {
    return <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-8 text-center sm:px-6">
      <p className="text-sm text-slate-600 dark:text-zinc-300">{errorMessage(state.error, 'This comparison is not available.')}</p>
      <Link to="/student/peers" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 dark:text-sky-300"><ArrowLeft className="h-4 w-4" />Back to Prep Mates</Link>
    </div>;
  }

  const { you, mate } = data;
  const lead = you.totals.total - mate.totals.total;
  const verdict = lead === 0 ? 'Level on problems solved' : lead > 0 ? `You lead by ${lead} problem${lead === 1 ? '' : 's'}` : `${mateName} leads by ${-lead} problem${lead === -1 ? '' : 's'}`;

  return <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-5 sm:px-6">
    <Link to="/student/peers" className="mb-4 inline-flex items-center gap-1 rounded text-[13px] font-semibold text-slate-500 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-400 dark:hover:text-sky-300"><ArrowLeft className="h-4 w-4" />Prep Mates</Link>

    {/* Who is compared, in which colour, and the one-line verdict. */}
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_-12px_rgba(14,116,144,0.18)] dark:border-zinc-800 dark:bg-[#242424]" aria-label="Comparison summary">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-6 sm:px-8">
        <div className="flex min-w-0 flex-col items-center text-center sm:flex-row sm:text-left sm:gap-4">
          <span className="rounded-full p-[3px]" style={{ backgroundColor: YOU_COLOR }}><PeerAvatar name={you.name} url={you.avatarUrl || user?.avatarUrl} size="lg" className="!rounded-full ring-2 ring-white dark:ring-[#242424]" /></span>
          <div className="mt-2 min-w-0 sm:mt-0">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: YOU_COLOR }}>You</p>
            <p className="truncate text-[15px] font-semibold text-slate-900 dark:text-white">{you.name}</p>
            <p className="text-[28px] font-black leading-tight tabular-nums text-slate-900 dark:text-white">{you.totals.total}<span className="ml-1 text-[12px] font-medium text-slate-500 dark:text-zinc-400">solved</span></p>
          </div>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white shadow-md dark:bg-zinc-100 dark:text-zinc-900" aria-hidden="true"><Swords className="h-5 w-5" /></span>
        <div className="flex min-w-0 flex-col items-center text-center sm:flex-row-reverse sm:gap-4 sm:text-right">
          <span className="rounded-full p-[3px]" style={{ backgroundColor: MATE_COLOR }}><PeerAvatar name={mate.name} url={mate.avatarUrl} size="lg" className="!rounded-full ring-2 ring-white dark:ring-[#242424]" /></span>
          <div className="mt-2 min-w-0 sm:mt-0">
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: MATE_COLOR }}>Prep Mate</p>
            <Link to={`/student/peers/${mate.id}`} className="block truncate text-[15px] font-semibold text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">{mate.name}</Link>
            <p className="text-[28px] font-black leading-tight tabular-nums text-slate-900 dark:text-white">{mate.totals.total}<span className="ml-1 text-[12px] font-medium text-slate-500 dark:text-zinc-400">solved</span></p>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-3 dark:border-zinc-800 dark:bg-white/[0.02] sm:px-8">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{verdict}</p>
        <DuelLegend mateLabel={mateName} />
      </div>
    </section>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className={card} aria-label="Head to head">
        <CardHeading title="Head to head" subtitle="Practice only · the bar shows each side's share" />
        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          <DuelRow label="Problems solved" you={you.totals.total} mate={mate.totals.total} mateName={mateName} />
          <DuelRow label="This week" you={you.thisWeek} mate={mate.thisWeek} mateName={mateName} />
          <DuelRow label="This month" you={you.thisMonth} mate={mate.thisMonth} mateName={mateName} />
          <DuelRow label="Current streak" you={you.streak.current} mate={mate.streak.current} format={(value) => `${value}d`} mateName={mateName} />
          <DuelRow label="Best streak" you={you.streak.best} mate={mate.streak.best} format={(value) => `${value}d`} mateName={mateName} />
          <DuelRow label="Practice days (30 days)" you={you.activeDays30} mate={mate.activeDays30} mateName={mateName} />
          <DuelRow label="Topics covered" you={you.topicsCovered} mate={mate.topicsCovered} mateName={mateName} />
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <section className={card} aria-label="By difficulty">
          <CardHeading title="By difficulty" subtitle="Problems solved, all time" />
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            <DuelRow label="Easy" you={you.totals.easy} mate={mate.totals.easy} mateName={mateName} />
            <DuelRow label="Medium" you={you.totals.medium} mate={mate.totals.medium} mateName={mateName} />
            <DuelRow label="Hard" you={you.totals.hard} mate={mate.totals.hard} mateName={mateName} />
          </div>
        </section>
        <section className={card} aria-label="This month's badges">
          <CardHeading title="This month's badges" subtitle="Highest level reached (each of you has your own targets)" />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {data.badges.map((badge) => <li key={badge.key} className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-white/[0.03]">
              <p className="flex items-center gap-1 truncate text-[12px] font-medium text-slate-600 dark:text-zinc-300"><Medal className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />{badge.title}</p>
              <p className="mt-1 flex items-center justify-between text-[13px] tabular-nums">
                <span className={badge.you >= badge.mate && badge.you ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: YOU_COLOR }} aria-hidden="true" />L{badge.you}</span>
                <span className={badge.mate >= badge.you && badge.mate ? 'font-bold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-zinc-400'}>L{badge.mate}<span className="ml-1 inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: MATE_COLOR }} aria-hidden="true" /></span>
              </p>
            </li>)}
          </ul>
        </section>
      </div>
    </div>

    <section className={`${card} mt-4`} aria-label="Problems solved per week">
      <CardHeading title="Problems solved per week" subtitle="Last 8 weeks · hover a week for exact numbers"><DuelLegend mateLabel={mateName} /></CardHeading>
      <WeeklyDuelChart you={you.weekly} mate={mate.weekly} mateName={mateName} />
    </section>

    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className={card} aria-label="Topics">
        <CardHeading title="Topics" subtitle="Problems solved per topic, your most practised topics together"><DuelLegend mateLabel={mateName} /></CardHeading>
        {data.topics.length ? <MirrorBars rows={data.topics} mateName={mateName} /> : <p className="py-6 text-center text-[13px] text-slate-500 dark:text-zinc-400">No topics yet. Solve a problem to start.</p>}
      </section>
      <section className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 dark:border-sky-900/60 dark:from-sky-500/10 dark:to-[#242424]" aria-label="Tip">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-sky-800 dark:text-sky-200"><Lightbulb className="h-4 w-4" aria-hidden="true" />What to do next</p>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-700 dark:text-zinc-200">{insight}</p>
        <Link to="/problems" className="mt-4 inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">Practice now</Link>
        <p className="mt-3 text-[11px] text-slate-500 dark:text-zinc-400">Only practice is compared. Prep Score, Prep Coins, tests and interviews stay private.</p>
      </section>
    </div>
  </div>;
}
