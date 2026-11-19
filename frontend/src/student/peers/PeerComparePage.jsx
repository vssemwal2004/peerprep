import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import PeerAvatar from './PeerAvatar';
import { errorMessage, peerSubtitle } from './peerNetwork';
import { compareInsights } from './compareInsight';
import { MATE_COLOR, Swatch, YOU_COLOR } from './circleViz';
import { OTHER_COLORS } from './circleMath';
import { ConsistencyGrid, DifficultyMix, LeaderBars, PerformanceChart, TopicButterfly } from './compareCharts';
import {
  CompassGlyph, CrestGlyph, DuelGlyph, GridGlyph, HiveGlyph, LadderGlyph, MedalGlyph, MiniFlame, PanelTitle, PulseGlyph, SparkGlyph, TargetGlyph, TrendGlyph,
} from './peerGlyphs';
import MonthlyBadgeEmblem from '../rewards/MonthlyBadgeEmblem';
import { card, focusRing, Skeleton } from '../dashboard/ui';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';
const TIERS = ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Gold', 'Platinum', 'Platinum', 'Diamond', 'Legend'];
const tierOf = (level) => (level ? TIERS[Math.min(10, level) - 1] : null);
const panel = `${card} p-5 sm:p-6`;

/** One side of the face-off: ringed photo, level, rank, and the headline number. */
function Fighter({ person, color, role, to, align = 'left' }) {
  const right = align === 'right';
  const name = to
    ? <Link to={to} className={`block truncate text-[19px] font-semibold tracking-[-0.02em] text-slate-900 hover:underline dark:text-white ${focusRing}`}>{person.name}</Link>
    : <p className="truncate text-[19px] font-semibold tracking-[-0.02em] text-slate-900 dark:text-white">{person.name}</p>;
  return <div className={`flex min-w-0 flex-1 items-center gap-4 ${right ? 'sm:flex-row-reverse sm:text-right' : ''}`}>
    <span className="relative shrink-0 rounded-full p-[3px] shadow-lg" style={{ background: `conic-gradient(${color}, ${color}55, ${color})` }}>
      <PeerAvatar name={person.name} url={person.avatarUrl} size="xl" className="!h-20 !w-20 !rounded-full ring-4 ring-white dark:ring-[#242424]" />
      {person.level?.level && <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold text-white shadow" style={{ backgroundColor: color }}>Lv {person.level.level}</span>}
    </span>
    <div className="min-w-0">
      <p className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color }}>{role}</p>
      {name}
      <p className="truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{[person.level?.title, peerSubtitle(person)].filter(Boolean).join(' · ') || 'Student'}</p>
      <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${right ? 'sm:justify-end' : ''}`}>
        {person.rank?.allTime && <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10">#{person.rank.allTime} of {person.rank.of}</span>}
        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10"><MiniFlame lit={person.streak.current > 0} className="h-3.5 w-3" />{person.streak.current}d streak</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10"><MedalGlyph className="h-3.5 w-3.5 text-violet-500" />{person.badgesEarned?.earned ?? 0} badges</span>
      </div>
    </div>
  </div>;
}

/** One measure, both values, who leads and by how much, and a share bar. */
function ScoreCard({ glyph: Glyph, tone, label, you, mate, mateName, unit = '' }) {
  const lead = you - mate;
  const share = you + mate ? (you / (you + mate)) * 100 : 50;
  return <li className={`${card} relative overflow-hidden p-4`}>
    <span className={`pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-[0.12] blur-xl ${tone}`} aria-hidden="true" />
    <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500 dark:text-zinc-400"><Glyph className="h-4 w-4 text-slate-400 dark:text-zinc-500" />{label}</p>
    <p className="mt-2 flex items-baseline gap-2 tabular-nums">
      <span className="text-[24px] font-bold leading-none tracking-[-0.03em]" style={{ color: YOU_COLOR }}>{you}{unit}</span>
      <span className="text-[12px] font-medium text-slate-300 dark:text-zinc-600">vs</span>
      <span className="text-[24px] font-bold leading-none tracking-[-0.03em]" style={{ color: MATE_COLOR }}>{mate}{unit}</span>
    </p>
    <span className="mt-3 flex h-1.5 gap-[2px] overflow-hidden rounded-full" aria-hidden="true">
      <span className="h-full rounded-l-full" style={{ width: `${share}%`, backgroundColor: you + mate ? YOU_COLOR : '#cbd5e1' }} />
      <span className="h-full flex-1 rounded-r-full" style={{ backgroundColor: you + mate ? MATE_COLOR : '#e2e8f0' }} />
    </span>
    <p className={`mt-2 text-[11.5px] font-semibold ${lead > 0 ? 'text-sky-700 dark:text-sky-300' : lead < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-zinc-400'}`}>
      {lead === 0 ? 'Level' : lead > 0 ? `You lead by ${lead}${unit}` : `${mateName} leads by ${-lead}${unit}`}
    </p>
  </li>;
}

const INSIGHT_LOOKS = {
  focus: { Glyph: TargetGlyph, className: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  rhythm: { Glyph: PulseGlyph, className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  edge: { Glyph: SparkGlyph, className: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
};

export default function PeerComparePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [mode, setMode] = useState('week');
  const [withLeaders, setWithLeaders] = useState(false);
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    api.comparePrepMate(id)
      .then((data) => { if (active) setState({ loading: false, error: null, data }); })
      .catch((error) => { if (active) setState({ loading: false, error, data: null }); });
    return () => { active = false; };
  }, [id]);
  const data = state.data;
  const insights = useMemo(() => (data ? compareInsights(data) : []), [data]);

  const page = (children) => <div className="min-h-[calc(100dvh-65px)] bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
  </div>;
  const back = <Link to="/student/peers" className={`mb-4 inline-flex items-center gap-1 rounded text-[13px] font-semibold text-slate-500 hover:text-sky-700 dark:text-zinc-400 dark:hover:text-sky-300 ${focusRing}`}><ArrowLeft className="h-4 w-4" />Prep Mates</Link>;

  if (state.loading) return page(<>{back}<div className="space-y-4" aria-busy="true"><Skeleton className="h-44 rounded-3xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-28" />)}</div><Skeleton className="h-80" /></div></>);
  if (state.error || !data) {
    return page(<>{back}<p className="py-10 text-center text-[14px] text-slate-600 dark:text-zinc-300">{errorMessage(state.error, 'This comparison is not available.')}</p></>);
  }

  const you = { ...data.you, avatarUrl: data.you.avatarUrl || user?.avatarUrl };
  const { mate } = data;
  const mateName = firstName(mate.name);
  const measures = [
    ['solved', you.totals.total, mate.totals.total], ['week', you.thisWeek, mate.thisWeek], ['streak', you.streak.current, mate.streak.current],
    ['days', you.activeDays30, mate.activeDays30], ['topics', you.topicsCovered, mate.topicsCovered],
  ];
  const youWins = measures.filter(([, a, b]) => a > b).length;
  const mateWins = measures.filter(([, a, b]) => b > a).length;
  const lead = you.totals.total - mate.totals.total;
  const verdict = lead === 0 ? 'Level on problems solved' : lead > 0 ? `You are ahead by ${lead} problem${lead === 1 ? '' : 's'}` : `${mateName} is ahead by ${-lead} problem${lead === -1 ? '' : 's'}`;
  const others = data.others || [];
  const series = [
    { key: 'you', label: 'You', color: YOU_COLOR, weekly: you.weekly, total: you.totals.total },
    { key: 'mate', label: mateName, color: MATE_COLOR, weekly: mate.weekly, total: mate.totals.total },
    ...(withLeaders ? others.map((other, index) => ({ key: other.id, label: firstName(other.name), color: OTHER_COLORS[index], weekly: other.weekly, total: other.total })) : []),
  ];
  const otherColor = new Map(others.map((other, index) => [other.id, OTHER_COLORS[index]]));
  const leaderColor = (row) => (row.isYou ? YOU_COLOR : row.isMate ? MATE_COLOR : withLeaders && otherColor.get(row.id)) || '#94a3b8';

  return page(<>
    {back}
    {/* Face-off: who is compared, in which colour, and the overall score. */}
    <section className="relative overflow-hidden rounded-3xl border border-[#ece6dc] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]" aria-label="You and your Prep Mate">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_0%_0%,rgba(14,165,233,0.14),transparent_60%),radial-gradient(60%_120%_at_100%_0%,rgba(245,158,11,0.18),transparent_60%)] dark:bg-[radial-gradient(60%_120%_at_0%_0%,rgba(14,165,233,0.16),transparent_60%),radial-gradient(60%_120%_at_100%_0%,rgba(245,158,11,0.14),transparent_60%)]" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 p-5 sm:flex-row sm:items-center sm:p-7">
        <Fighter person={you} color={YOU_COLOR} role="You" />
        <div className="flex shrink-0 flex-col items-center gap-2 sm:px-2">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-950 text-[15px] font-black tracking-[0.08em] text-white shadow-xl dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900" aria-hidden="true">VS</span>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">Leads</p>
          <p className="text-[20px] font-bold tabular-nums leading-none" aria-label={`You lead ${youWins} measures, ${mateName} leads ${mateWins}`}>
            <span style={{ color: YOU_COLOR }}>{youWins}</span><span className="mx-1 text-slate-300 dark:text-zinc-600">–</span><span style={{ color: MATE_COLOR }}>{mateWins}</span>
          </p>
        </div>
        <Fighter person={mate} color={MATE_COLOR} role="Prep Mate" to={`/student/peers/${mate.id}`} align="right" />
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] bg-white/60 px-5 py-3 backdrop-blur sm:px-7 dark:border-white/[0.06] dark:bg-white/[0.02]">
        <p className="text-[14px] font-semibold text-slate-900 dark:text-white">{verdict}<span className="font-normal text-slate-500 dark:text-zinc-400"> · practice only</span></p>
        <div className="flex flex-wrap items-center gap-4"><Swatch color={YOU_COLOR} label="You" /><Swatch color={MATE_COLOR} label={mateName} /></div>
      </div>
    </section>

    <ul className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Head to head">
      <ScoreCard glyph={CrestGlyph} tone="bg-sky-500" label="Problems solved" you={you.totals.total} mate={mate.totals.total} mateName={mateName} />
      <ScoreCard glyph={TrendGlyph} tone="bg-emerald-500" label="This week" you={you.thisWeek} mate={mate.thisWeek} mateName={mateName} />
      <ScoreCard glyph={(props) => <MiniFlame lit {...props} />} tone="bg-orange-500" label="Current streak" you={you.streak.current} mate={mate.streak.current} mateName={mateName} unit="d" />
      <ScoreCard glyph={GridGlyph} tone="bg-violet-500" label="Practice days (30)" you={you.activeDays30} mate={mate.activeDays30} mateName={mateName} />
      <ScoreCard glyph={HiveGlyph} tone="bg-rose-500" label="Topics covered" you={you.topicsCovered} mate={mate.topicsCovered} mateName={mateName} />
    </ul>

    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <section className={panel} aria-labelledby="performance-title">
        <PanelTitle id="performance-title" glyph={TrendGlyph} tone="sky" title="Performance comparison" subtitle={mode === 'week' ? 'Problems solved each week, last 8 weeks' : 'Problems solved so far, week by week'}
          action={<div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="tablist" aria-label="Chart view">
            {[['week', 'Each week'], ['total', 'Total so far']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)}
              className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition ${focusRing} ${mode === key ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>{label}</button>)}
          </div>} />
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {series.map((item) => <Swatch key={item.key} color={item.color} label={item.label} />)}
          {others.length > 0 && <button type="button" onClick={() => setWithLeaders((value) => !value)} aria-pressed={withLeaders}
            className={`ml-auto rounded-full px-3 py-1 text-[12px] font-semibold ring-1 ring-inset transition ${focusRing} ${withLeaders ? 'bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/25' : 'text-slate-600 ring-slate-200 hover:bg-slate-50 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/[0.05]'}`}>
            {withLeaders ? 'Hide circle leaders' : `+ Add circle leaders (${others.length})`}
          </button>}
        </div>
        <div className="mt-3"><PerformanceChart series={series} mode={mode} /></div>
      </section>

      <section className={panel} aria-labelledby="leaders-title">
        <PanelTitle id="leaders-title" glyph={LadderGlyph} tone="amber" title="Problems solved" subtitle="Top of your Prep Mates, all time" />
        <div className="mt-5"><LeaderBars leaders={data.leaders || []} colorFor={leaderColor} /></div>
        <Link to="/student/peers" className={`mt-5 inline-flex items-center gap-1 rounded text-[12.5px] font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-400 ${focusRing}`}>Full ranking<ArrowRight className="h-3.5 w-3.5" /></Link>
      </section>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className={panel} aria-labelledby="difficulty-title">
        <PanelTitle id="difficulty-title" glyph={TargetGlyph} tone="rose" title="Difficulty mix" subtitle="Easy, Medium and Hard problems solved" />
        <div className="mt-5"><DifficultyMix you={you} mate={mate} mateName={mateName} /></div>
      </section>
      <section className={panel} aria-labelledby="topics-title">
        <PanelTitle id="topics-title" glyph={HiveGlyph} tone="violet" title="Topics" subtitle="Your most practised topics, side by side" />
        <div className="mt-5"><TopicButterfly topics={data.topics} mateName={mateName} /></div>
      </section>
    </div>

    <section className={`${panel} mt-5`} aria-labelledby="rhythm-title">
      <PanelTitle id="rhythm-title" glyph={GridGlyph} tone="emerald" title="Last 30 days" subtitle="Each square is a day with practice" />
      <div className="mt-5"><ConsistencyGrid you={you} mate={mate} mateName={mateName} /></div>
    </section>

    <section className={`${panel} mt-5`} aria-labelledby="badges-title">
      <PanelTitle id="badges-title" glyph={MedalGlyph} tone="violet" title="Badges this month" subtitle={`Levels reached in ${new Date(`${data.month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' })}`}
        action={<span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">Badge levels <b style={{ color: YOU_COLOR }}>{you.monthBadgeLevels}</b> vs <b style={{ color: MATE_COLOR }}>{mate.monthBadgeLevels}</b></span>} />
      <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {data.badges.map((badge) => <li key={badge.key} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 dark:bg-white/[0.03]">
          <MonthlyBadgeEmblem track={badge.key} level={badge.you} tier={tierOf(badge.you)} size={42} title={`You: ${badge.you ? `level ${badge.you}` : 'not started'}`} />
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{badge.title}</p>
            <p className="text-[12px] tabular-nums text-slate-500 dark:text-zinc-400"><b style={{ color: YOU_COLOR }}>L{badge.you}</b> vs <b style={{ color: MATE_COLOR }}>L{badge.mate}</b></p>
          </div>
          <MonthlyBadgeEmblem track={badge.key} level={badge.mate} tier={tierOf(badge.mate)} size={42} title={`${mateName}: ${badge.mate ? `level ${badge.mate}` : 'not started'}`} />
        </li>)}
      </ul>
    </section>

    <section className="relative mt-5 overflow-hidden rounded-3xl border border-[#ece6dc] bg-white p-5 sm:p-6 dark:border-white/[0.07] dark:bg-[#242424]" aria-labelledby="coach-title">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_100%_at_100%_100%,rgba(245,158,11,0.14),transparent_70%)]" aria-hidden="true" />
      <div className="relative">
        <PanelTitle id="coach-title" glyph={CompassGlyph} tone="ink" title="What this means for you"
          action={<Link to="/problems" className={`inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_18px_-8px_rgba(2,132,199,0.8)] hover:bg-sky-700 ${focusRing}`}>Practice now<ArrowRight className="h-4 w-4" /></Link>} />
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {insights.map((item) => {
            const look = INSIGHT_LOOKS[item.kind];
            return <li key={item.kind} className="rounded-2xl bg-slate-50/80 p-4 dark:bg-white/[0.03]">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${look.className}`}><look.Glyph className="h-5 w-5" /></span>
              <p className="mt-3 text-[13px] font-semibold text-slate-900 dark:text-white">{item.title}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{item.text}</p>
            </li>;
          })}
        </ul>
      </div>
    </section>
    <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-slate-400 dark:text-zinc-500"><DuelGlyph className="h-3.5 w-3.5" />Only practice is compared. Prep Score, Prep Coins, tests and interviews stay private.</p>
  </>);
}
