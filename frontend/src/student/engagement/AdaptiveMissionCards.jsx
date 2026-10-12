import { difficultyTheme } from '../../utils/difficultyTheme';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Circle, Code2, Flag, LockKeyhole, MessageSquare, Sparkles, Target, Trophy } from 'lucide-react';
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';
import { Card } from '../profile/ui';
import { focusRing } from '../profile/format';
import LevelMedallion from '../profile/LevelMedallion';
import { MISSION_MODULES as access } from './missionAccess';
import ChallengeAcceptance from './ChallengeAcceptance';

const icons = { coding: Code2, learning: BookOpen, assessments: Target, interviews: MessageSquare, events: MessageSquare };
const labels = { coding: 'Coding', learning: 'Learning', assessments: 'Assessment', interviews: 'AI interview', events: 'Peer interview' };
function State({ section, onRetry, children }) {
  if (section?.loading) return <div className="h-32 animate-pulse rounded-lg bg-slate-100 dark:bg-zinc-800" aria-label="Loading missions" />;
  if (section?.error || !section?.data) return <p className="text-xs text-slate-500" role="status">Progress is unavailable. <button onClick={onRetry} className="text-sky-600 underline">Retry</button></p>;
  return children;
}
function Goal({ goal, compact = false }) {
  const Icon = goal.completed ? Check : goal.paused ? LockKeyhole : icons[goal.domain] || Circle;
  return <li className={`rounded-lg border px-3 py-2.5 ${goal.completed ? 'border-emerald-200/70 bg-emerald-50/50 dark:border-emerald-800/50 dark:bg-emerald-500/5' : 'border-slate-200/70 bg-slate-50/60 dark:border-zinc-700/70 dark:bg-zinc-900/30'}`}>
    <div className="flex items-start gap-2.5">
      <Icon size={15} className={`mt-0.5 shrink-0 ${goal.completed ? 'text-emerald-600' : 'text-sky-500'}`} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold leading-relaxed text-slate-800 dark:text-zinc-100">{goal.title || goal.label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-500 dark:text-zinc-400">
          {labels[goal.domain] && <span>{labels[goal.domain]}</span>}
          {goal.difficulty && <span className={difficultyTheme(goal.difficulty).pill}>{goal.difficulty}</span>}
          {goal.minutes && <span>~{goal.minutes} min</span>}
          {goal.target > 1 && <span className="font-semibold tabular-nums">{goal.value}/{goal.target}</span>}
          {goal.slot === 'stretch' && <span className="text-amber-600 dark:text-amber-400">+{goal.rewardXp} XP</span>}
        </div>
        {!compact && goal.reason && <p className="mt-1 text-[11px] leading-relaxed text-slate-400 dark:text-zinc-500">{goal.reason}</p>}
      </div>
      {!goal.completed && goal.href && !goal.paused && <Link to={goal.href} className={`inline-flex shrink-0 items-center gap-1 rounded-md p-1.5 text-xs font-semibold text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-500/10 ${focusRing}`} aria-label={`Start: ${goal.title || goal.label}`}>Start<ArrowRight size={15} /></Link>}
    </div>
    {goal.target > 1 && <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-700" role="progressbar" aria-label={goal.title || goal.label} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={goal.value}><div className="h-full rounded-full bg-sky-500" style={{ width: `${goal.progress}%` }} /></div>}
    {goal.paused && <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">This content is currently unavailable. Your earned progress is safe.</p>}
  </li>;
}

export function AdaptiveDailyCard({ section, onRetry, compact = false, showHubLink = true }) {
  const { allowsModule, allowsPath } = useUniversityPolicy();
  const data = section?.data, daily = data?.daily;
  const goals = (daily?.goals || []).filter((goal) => allowsModule(access[goal.domain]) && (!goal.href || allowsPath(goal.href, 'student')));
  const core = goals.filter((goal) => goal.slot === 'core'), choices = goals.filter((goal) => goal.slot === 'choice'), stretch = goals.filter((goal) => goal.slot === 'stretch');
  return <Card id="missions" title="Today's missions" description={daily?.completed ? 'Daily plan completed. Your progress is saved.' : 'A small plan, selected for your progress.'} icon={<Sparkles size={16} />} action={goals.length ? <span className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{daily.completed ? 'Earned' : 'Earn'} {daily.rewardPoints} XP</span> : null}>
    <State section={section} onRetry={onRetry}>
      {!goals.length ? <p className="rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-zinc-900/40 dark:text-zinc-400">{!data?.enabled ? 'Missions are paused by your university.' : 'No suitable open tasks are available right now. New missions appear when your university adds accessible content.'}</p> : <div className="space-y-3">
        <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Core mission</p><ul className="space-y-2">{core.map((goal) => <Goal key={goal.id} goal={goal} compact={compact} />)}</ul></div>
        {choices.length > 0 && <div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Choose one</p><ul className="space-y-2">{choices.map((goal) => <Goal key={goal.id} goal={goal} compact={compact} />)}</ul></div>}
        {stretch.length > 0 && <details className="text-xs"><summary className={`cursor-pointer rounded font-medium text-sky-600 dark:text-sky-400 ${focusRing}`}>Optional stretch · +{stretch[0].rewardXp} XP</summary><ul className="mt-2">{stretch.map((goal) => <Goal key={goal.id} goal={goal} compact={compact} />)}</ul></details>}
        {daily.paused && <p className="text-[11px] text-amber-600 dark:text-amber-400">University access changed. This plan is paused; your next plan will use your current access.</p>}
        <ChallengeAcceptance plan={daily} kind="daily" enabled={data.enabled} nextHref={goals.find((goal) => goal.slot !== 'stretch' && !goal.completed && !goal.paused && goal.href)?.href} />
        {showHubLink && <Link to="/student/quickprep" className={`inline-flex items-center gap-1 rounded text-xs font-semibold text-sky-600 dark:text-sky-400 ${focusRing}`}>Daily challenge & QuickPrep<ArrowRight size={14} /></Link>}
        <p className="border-t border-slate-100 pt-2 text-[10px] text-slate-400 dark:border-zinc-800">New plan at 2 AM IST · Missing a day never removes XP.</p>
      </div>}
    </State>
  </Card>;
}

export function AdaptiveJourneyCard({ section, onRetry, periodKind }) {
  const [selected, setTab] = useState('weekly');
  const tab = periodKind || selected;
  const id = useId();
  const { allowsModule, allowsPath } = useUniversityPolicy();
  const data = section?.data;
  const period = data?.periods?.find((entry) => entry.kind === tab);
  const goals = (period?.goals || []).filter((goal) => (goal.domain === 'momentum' || allowsModule(access[goal.domain])) && (!goal.href || allowsPath(goal.href, 'student')));
  return <Card title="Your challenges" icon={<Flag size={16} />} description="Build momentum throughout the month.">
    {!periodKind && <div className="mb-3 flex rounded-lg bg-slate-100 p-1 dark:bg-zinc-900/60" role="tablist" aria-label="Challenge period" onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'weekly' : event.key === 'End' ? 'monthly' : tab === 'weekly' ? 'monthly' : 'weekly';
      setTab(next); document.getElementById(`${id}-${next}`)?.focus();
    }}>{['weekly', 'monthly'].map((kind) => <button key={kind} role="tab" type="button" tabIndex={tab === kind ? 0 : -1} id={`${id}-${kind}`} aria-controls={`${id}-panel`} aria-selected={tab === kind} onClick={() => setTab(kind)} className={`flex-1 rounded-md py-1.5 text-xs font-semibold ${focusRing} ${tab === kind ? 'bg-white text-sky-700 shadow-sm dark:bg-zinc-700 dark:text-sky-300' : 'text-slate-500'}`}>{kind === 'weekly' ? 'This week' : 'This month'}</button>)}</div>}
    <State section={section} onRetry={onRetry}>
      <div id={`${id}-panel`} role={periodKind ? undefined : 'tabpanel'} aria-labelledby={periodKind ? undefined : `${id}-${tab}`}>
        {!period ? <p className="text-xs leading-relaxed text-slate-500">{data?.enabled === false ? 'Your university has paused challenges.' : 'Your journey begins when suitable tasks are available.'}</p> : <>
          <div className="mb-3 flex items-center justify-between gap-3"><p className="text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{period.title}</p><span className="text-xs font-semibold text-sky-600 dark:text-sky-400">{period.earned ? '✓ Earned' : '+'} {period.rewardPoints} XP</span></div>
          <ul className="space-y-2">{goals.map((goal) => <Goal key={goal.id} goal={goal} compact />)}</ul>
          {period.paused && <p className="mt-2 text-[11px] text-amber-600">Some requirements are paused after an access or content change.</p>}
          <p className="mt-3 text-[10px] text-slate-400">Resets {new Date(period.endsAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} · 2 AM IST</p>
          <div className="mt-3"><ChallengeAcceptance plan={period} kind={tab} enabled={data.enabled} nextHref={goals.find((goal) => !goal.completed && !goal.paused && goal.href)?.href} /></div>
        </>}
      </div>
      {data?.level && <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-3 dark:border-zinc-800"><LevelMedallion level={data.level.level} size="sm" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-800 dark:text-zinc-100">Level {data.level.level} · {data.level.title}</p><p className="mt-0.5 text-[11px] text-slate-500">{data.lifetime.points} XP · {data.level.mastery}% mastery</p></div><Link to="/student/profile#badges" className={`rounded text-sky-600 ${focusRing}`} aria-label="View badges and level requirements"><Trophy size={17} /></Link></div>}
      <details className="mt-3 text-[11px] text-slate-500 dark:text-zinc-400"><summary className="cursor-pointer">How progression works</summary><p className="mt-2 leading-relaxed">{data?.rules}</p></details>
    </State>
    {!periodKind && <Link to="/student/quickprep" className={`mt-3 inline-flex items-center gap-1 rounded text-xs font-semibold text-sky-600 dark:text-sky-400 ${focusRing}`}>Daily challenge & QuickPrep<ArrowRight size={14} /></Link>}
  </Card>;
}
