import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, BookOpenCheck, Crown, Flame, Gauge, Lightbulb, Medal, Radar, Sparkles, Target, Trophy,
} from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import PeerAvatar from './PeerAvatar';
import { errorMessage, peerSubtitle } from './peerNetwork';
import { compareInsight } from './compareInsight';
import { DuelLegend, MATE_COLOR, YOU_COLOR } from './circleViz';
import { ConsistencyStrip, DifficultyDonut, DifficultyLegend, MomentumChart, ShareRing, SkillRadar } from './compareCharts';
import { BADGE_MARKS, tierStyle } from '../rewards/tiers';

// min-w-0: grid items must be able to shrink below their chart's width on phones.
const surface = 'min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-white/[0.07] dark:bg-[#242424] dark:shadow-none';
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Your Prep Mate';
const TIER_BY_LEVEL = ['Bronze', 'Bronze', 'Silver', 'Silver', 'Gold', 'Gold', 'Platinum', 'Platinum', 'Diamond', 'Legend'];
const tierOf = (level) => (level ? TIER_BY_LEVEL[Math.min(10, level) - 1] : null);

function CardHeader({ icon: Icon, title, subtitle, children }) {
  return <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-slate-100 text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300" aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0"><h2 className="text-[15px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-zinc-50">{title}</h2>{subtitle && <p className="mt-0.5 text-[12px] text-slate-500 dark:text-zinc-400">{subtitle}</p>}</div>
    </div>
    {children}
  </header>;
}

/** One side of the face-off: who they are and where they stand. */
function Fighter({ person, color, role, align = 'left', to }) {
  const name = to
    ? <Link to={to} className="block truncate text-[18px] font-bold tracking-[-0.02em] text-slate-900 hover:text-sky-700 dark:text-white dark:hover:text-sky-300">{person.name}</Link>
    : <p className="truncate text-[18px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{person.name}</p>;
  const stats = [
    { icon: Trophy, label: 'Circle rank', value: person.rank?.allTime ? `#${person.rank.allTime}` : '—', hint: person.rank?.of ? `of ${person.rank.of}` : '' },
    { icon: Medal, label: 'Badges', value: person.badgesEarned?.earned ?? 0, hint: 'earned' },
    { icon: Flame, label: 'Streak', value: `${person.streak.current}d`, hint: `best ${person.streak.best}d` },
  ];
  return <div className={`flex min-w-0 flex-col items-center gap-3 text-center ${align === 'right' ? 'lg:items-end lg:text-right' : 'lg:items-start lg:text-left'}`}>
    <div className={`flex min-w-0 items-center gap-3.5 ${align === 'right' ? 'lg:flex-row-reverse' : ''} flex-col lg:flex-row`}>
      <span className="relative shrink-0 rounded-full p-[3px]" style={{ background: `conic-gradient(${color}, ${color}55, ${color})` }}>
        <PeerAvatar name={person.name} url={person.avatarUrl} size="lg" className="!h-[72px] !w-[72px] !rounded-full ring-[3px] ring-white dark:ring-[#242424]" />
        {person.rank?.allTime === 1 && <span className="absolute -top-1.5 left-1/2 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow ring-2 ring-white dark:ring-[#242424]" title="Leads your circle"><Crown className="h-3.5 w-3.5" aria-hidden="true" /></span>}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color }}>{role}</p>
        {name}
        <p className="truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{peerSubtitle(person) || 'Student'}</p>
        {person.level?.title && <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/[0.07] dark:text-zinc-200">
          <Sparkles className="h-3 w-3" aria-hidden="true" />{person.level.title}<span className="font-normal opacity-60">· Lv {person.level.level}</span></span>}
      </div>
    </div>
    <dl className="grid w-full max-w-[340px] grid-cols-3 gap-2">
      {stats.map(({ icon: Icon, label, value, hint }) => <div key={label} className="rounded-xl bg-slate-50 px-2.5 py-2 text-center ring-1 ring-inset ring-slate-100 dark:bg-white/[0.04] dark:ring-white/[0.05]">
        <dt className="flex items-center justify-center gap-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500"><Icon className="h-3 w-3" aria-hidden="true" />{label}</dt>
        <dd className="mt-0.5 text-[17px] font-bold tabular-nums text-slate-900 dark:text-white">{value}<span className="ml-1 text-[10.5px] font-medium text-slate-400 dark:text-zinc-500">{hint}</span></dd>
      </div>)}
    </dl>
  </div>;
}

/** One head-to-head measure as a tile: both values, the winner crowned, a split bar under them. */
function ScoreTile({ label, you, mate, unit = '', mateName }) {
  const total = you + mate;
  const lead = you === mate ? null : you > mate ? 'you' : 'mate';
  const youShare = total ? (you / total) * 100 : 50;
  const value = (number, side) => <span className={`flex items-center gap-1 text-[22px] font-black leading-none tabular-nums ${lead === side ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-zinc-500'}`}>
    {lead === side && <Crown className="h-3.5 w-3.5" style={{ color: side === 'you' ? YOU_COLOR : MATE_COLOR }} aria-hidden="true" />}{number}{unit && <span className="text-[12px] font-semibold">{unit}</span>}
  </span>;
  return <li className={`${surface} relative overflow-hidden p-3.5`} aria-label={`${label}: you ${you}${unit}, ${mateName} ${mate}${unit}`}>
    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: lead === 'you' ? YOU_COLOR : lead === 'mate' ? MATE_COLOR : 'transparent' }} aria-hidden="true" />
    <p className="text-[11.5px] font-medium text-slate-500 dark:text-zinc-400">{label}</p>
    <div className="mt-2 flex items-end justify-between">{value(you, 'you')}{value(mate, 'mate')}</div>
    <div className="mt-2.5 flex h-1.5 gap-[2px]" aria-hidden="true">
      {total ? <>
        {you > 0 && <span className="h-full rounded-full" style={{ width: `${youShare}%`, backgroundColor: YOU_COLOR }} />}
        {mate > 0 && <span className="h-full flex-1 rounded-full" style={{ backgroundColor: MATE_COLOR }} />}
      </> : <span className="h-full w-full rounded-full bg-slate-100 dark:bg-white/[0.06]" />}
    </div>
  </li>;
}

function Medallion({ track, level, size = 'md' }) {
  const style = tierStyle(tierOf(level));
  const box = size === 'sm' ? 'h-11 w-11' : 'h-12 w-12';
  return <span className={`flex ${box} shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${level ? style.ring : 'from-slate-100 to-slate-200 dark:from-white/10 dark:to-white/5'} p-[3px] shadow-sm`} aria-hidden="true">
    <span className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white dark:bg-[#242424]">
      <span className="text-[8.5px] font-bold tracking-wide text-slate-400">{BADGE_MARKS[track] || '★'}</span>
      <span className={`text-[15px] font-black leading-none ${level ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-zinc-600'}`}>{level || '–'}</span>
    </span>
  </span>;
}

export default function PeerComparePage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [mode, setMode] = useState('weekly');
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: null, data: null });
    api.comparePrepMate(id)
      .then((data) => { if (active) setState({ loading: false, error: null, data }); })
      .catch((error) => { if (active) setState({ loading: false, error, data: null }); });
    return () => { active = false; };
  }, [id]);

  const data = state.data;
  const insight = useMemo(() => (data ? compareInsight(data) : ''), [data]);

  if (state.loading) {
    return <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-12 pt-5 sm:px-6" aria-busy="true">
      <div className="h-64 animate-pulse rounded-3xl bg-slate-100 dark:bg-white/[0.04]" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04]" />)}</div>
      <div className="h-72 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/[0.04]" />
    </div>;
  }
  if (state.error || !data) {
    return <div className="mx-auto w-full max-w-3xl px-4 pb-12 pt-10 text-center sm:px-6">
      <p className="text-sm text-slate-600 dark:text-zinc-300">{errorMessage(state.error, 'This comparison is not available.')}</p>
      <Link to="/student/peers" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-700 dark:text-sky-300"><ArrowLeft className="h-4 w-4" />Back to Prep Mates</Link>
    </div>;
  }

  const you = { ...data.you, avatarUrl: data.you.avatarUrl || user?.avatarUrl };
  const { mate } = data;
  const mateName = firstName(mate.name);
  const tiles = [
    { label: 'Problems solved', you: you.totals.total, mate: mate.totals.total },
    { label: 'This week', you: you.thisWeek, mate: mate.thisWeek },
    { label: 'This month', you: you.thisMonth, mate: mate.thisMonth },
    { label: 'Hard solved', you: you.totals.hard, mate: mate.totals.hard },
    { label: 'Current streak', you: you.streak.current, mate: mate.streak.current, unit: 'd' },
    { label: 'Practice days (30d)', you: you.activeDays30, mate: mate.activeDays30 },
    { label: 'Topics covered', you: you.topicsCovered, mate: mate.topicsCovered },
    { label: 'Badge levels (month)', you: you.monthBadgeLevels, mate: mate.monthBadgeLevels },
  ];
  const wins = tiles.filter((tile) => tile.you > tile.mate).length;
  const losses = tiles.filter((tile) => tile.mate > tile.you).length;
  const lead = you.totals.total - mate.totals.total;
  const verdict = wins === losses ? 'Neck and neck' : wins > losses ? 'You are ahead' : `${mateName} is ahead`;

  return <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-5 sm:px-6">
    <Link to="/student/peers" className="mb-4 inline-flex items-center gap-1 rounded text-[13px] font-semibold text-slate-500 hover:text-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-400 dark:hover:text-sky-300"><ArrowLeft className="h-4 w-4" />Prep Mates</Link>

    {/* Face-off: both profiles, the share of problems solved and the category score. */}
    <section aria-label="Face-off" className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_50px_-28px_rgba(15,23,42,0.35)] dark:border-white/[0.07] dark:bg-[#242424]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: `${YOU_COLOR}22` }} />
        <div className="absolute -bottom-28 -right-20 h-72 w-72 rounded-full blur-3xl" style={{ backgroundColor: `${MATE_COLOR}22` }} />
        <div className="absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:18px_18px] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] dark:opacity-[0.12]" />
      </div>
      <div className="relative grid items-center gap-6 px-5 py-7 sm:px-8 lg:grid-cols-[1fr_auto_1fr]">
        <Fighter person={you} color={YOU_COLOR} role="You" />
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <ShareRing you={you.totals.total} mate={mate.totals.total} size={128} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-zinc-500">Score</span>
              <span className="text-[26px] font-black leading-none tabular-nums text-slate-900 dark:text-white">{wins}<span className="mx-1 text-slate-300 dark:text-zinc-600">:</span>{losses}</span>
            </div>
          </div>
          <p className="text-[14px] font-bold text-slate-900 dark:text-white">{verdict}</p>
          <p className="max-w-[220px] text-center text-[12px] text-slate-500 dark:text-zinc-400">
            {lead === 0 ? 'Level on problems solved' : lead > 0 ? `You lead by ${lead} problem${lead === 1 ? '' : 's'}` : `${mateName} leads by ${-lead} problem${lead === -1 ? '' : 's'}`} · {tiles.length} categories
          </p>
        </div>
        <Fighter person={mate} color={MATE_COLOR} role="Prep Mate" align="right" to={`/student/peers/${mate.id}`} />
      </div>
    </section>

    {/* Scoreboard: every measure, winner crowned. */}
    <section aria-label="Scoreboard" className="mt-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-zinc-50">Scoreboard</h2>
        <DuelLegend mateLabel={mateName} />
      </div>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">{tiles.map((tile) => <ScoreTile key={tile.label} {...tile} mateName={mateName} />)}</ul>
    </section>

    <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
      <section className={`${surface} p-5`} aria-label="Momentum">
        <CardHeader icon={Activity} title="Momentum" subtitle="Problems solved over the last 8 weeks">
          <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-white/[0.06]" role="tablist" aria-label="Chart view">
            {[['weekly', 'Weekly'], ['cumulative', 'Running total']].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={mode === key} onClick={() => setMode(key)}
              className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${mode === key ? 'bg-white text-slate-900 shadow-sm dark:bg-white/[0.12] dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-200'}`}>{label}</button>)}
          </div>
        </CardHeader>
        <MomentumChart you={you.weekly} mate={mate.weekly} mateName={mateName} mode={mode} />
        <div className="mt-2"><DuelLegend mateLabel={mateName} /></div>
      </section>

      <section className={`${surface} p-5`} aria-label="Difficulty mix">
        <CardHeader icon={Gauge} title="Difficulty mix" subtitle="All-time problems solved by level" />
        <div className="flex items-start justify-around gap-2">
          <DifficultyDonut totals={you.totals} label="You" accent={YOU_COLOR} />
          <DifficultyDonut totals={mate.totals} label={mateName} accent={MATE_COLOR} />
        </div>
        <div className="mt-4"><DifficultyLegend you={you.totals} mate={mate.totals} mateName={mateName} /></div>
      </section>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-2">
      <section className={`${surface} p-5`} aria-label="Skill shape">
        <CardHeader icon={Radar} title="Skill shape" subtitle="Your six most practised topics together · hover a topic"><DuelLegend mateLabel={mateName} /></CardHeader>
        <SkillRadar topics={data.topics} mateName={mateName} />
      </section>
      <section className={`${surface} p-5`} aria-label="Consistency">
        <CardHeader icon={Target} title="Consistency" subtitle="Practice days, last 30 days" />
        <div className="space-y-5">
          <ConsistencyStrip days={you.days30} color={YOU_COLOR} label="You" />
          <ConsistencyStrip days={mate.days30} color={MATE_COLOR} label={mateName} />
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-3">
          {[['Current streak', 'current'], ['Best streak', 'best']].map(([label, key]) => <div key={key} className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
            <dt className="text-[11.5px] text-slate-500 dark:text-zinc-400">{label}</dt>
            <dd className="mt-1 flex items-baseline gap-3 text-[18px] font-black tabular-nums">
              <span style={{ color: YOU_COLOR }}>{you.streak[key]}d</span><span className="text-[12px] font-medium text-slate-300 dark:text-zinc-600">vs</span><span style={{ color: MATE_COLOR }}>{mate.streak[key]}d</span>
            </dd>
          </div>)}
        </dl>
      </section>
    </div>

    <section className={`${surface} mt-5 p-5`} aria-label="Badges">
      <CardHeader icon={Medal} title="Badges this month" subtitle="Each of you has targets built from your own practice, so levels are a fair fight">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">
          Lifetime badges · <span style={{ color: YOU_COLOR }}>{you.badgesEarned.earned}</span> vs <span style={{ color: MATE_COLOR }}>{mate.badgesEarned.earned}</span>
        </span>
      </CardHeader>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.badges.map((badge) => {
          const leader = badge.you === badge.mate ? null : badge.you > badge.mate ? 'you' : 'mate';
          return <li key={badge.key} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-100 dark:bg-white/[0.03] dark:ring-white/[0.05]">
            <div className="relative"><Medallion track={badge.key} level={badge.you} />{leader === 'you' && <Crown className="absolute -top-2 left-1/2 h-3.5 w-3.5 -translate-x-1/2" style={{ color: YOU_COLOR }} aria-hidden="true" />}</div>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{badge.title}</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">{badge.you ? `L${badge.you} ${tierOf(badge.you)}` : 'Not yet'} · {badge.mate ? `L${badge.mate} ${tierOf(badge.mate)}` : 'Not yet'}</p>
            </div>
            <div className="relative"><Medallion track={badge.key} level={badge.mate} />{leader === 'mate' && <Crown className="absolute -top-2 left-1/2 h-3.5 w-3.5 -translate-x-1/2" style={{ color: MATE_COLOR }} aria-hidden="true" />}</div>
          </li>;
        })}
      </ul>
    </section>

    <section className="mt-5 flex flex-col gap-4 overflow-hidden rounded-2xl border border-sky-200/80 bg-gradient-to-r from-sky-50 via-white to-amber-50 p-5 sm:flex-row sm:items-center dark:border-white/[0.07] dark:from-sky-500/[0.08] dark:via-[#242424] dark:to-amber-500/[0.06]" aria-label="What to do next">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm" aria-hidden="true"><Lightbulb className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-slate-900 dark:text-white">Your next move</p>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-zinc-300">{insight}</p>
      </div>
      <Link to="/problems" className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"><BookOpenCheck className="h-4 w-4" aria-hidden="true" />Practice now</Link>
    </section>
    <p className="mt-3 text-center text-[11.5px] text-slate-400 dark:text-zinc-500">Only practice is compared. Prep Score, Prep Coins, tests and interviews stay private.</p>
  </div>;
}
