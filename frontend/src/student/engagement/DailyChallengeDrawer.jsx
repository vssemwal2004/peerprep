import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, BookOpen, Check, CheckCircle2, Clock3, Code2, LockKeyhole, MessageSquare, RefreshCw, Sparkles, Target, Trophy, X } from 'lucide-react';
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';
import { focusRing } from '../profile/format';
import { MISSION_MODULES } from './missionAccess';
import { dailyGoalStatus, dailyPlanProgress } from './dailyChallengeModel';
import ChallengeAcceptance from './ChallengeAcceptance';
import useChallengeHub from './useChallengeHub';

const domains = { coding: ['Coding', Code2], learning: ['Learning', BookOpen], assessments: ['Assessment', Target], interviews: ['AI interview', MessageSquare], events: ['Peer interview', MessageSquare] };
const slots = { core: 'Core mission', choice: 'Choose one', stretch: 'Optional stretch' };
const dateLabel = (value, options) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleDateString('en-IN', options) : '';

function DailyTask({ goal, disabled }) {
  const [domain, Icon] = domains[goal.domain] || ['Practice', Target];
  const status = dailyGoalStatus(goal);
  const target = Math.max(1, Number(goal.target) || 1);
  const value = goal.completed ? target : Math.min(target, Math.max(0, Number(goal.value) || 0));
  return <li className={`rounded-2xl border p-4 ${goal.completed ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-500/5' : 'border-slate-200 bg-white dark:border-zinc-700 dark:bg-[#242424]'}`}>
    <div className="flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${goal.completed ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400'}`}>{goal.completed ? <Check size={19} /> : <Icon size={19} />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] font-semibold">
          <span className="uppercase tracking-wider text-slate-500 dark:text-zinc-400">{slots[goal.slot] || domain}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : status === 'paused' ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>{status === 'paused' && <LockKeyhole size={10} />}{status === 'completed' ? 'Completed' : status === 'paused' ? 'Paused' : 'Pending'}</span>
        </div>
        <h3 className="mt-1.5 break-words text-sm font-semibold leading-relaxed text-slate-800 dark:text-zinc-100">{goal.title || goal.label}</h3>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-zinc-400"><span>{domain}</span>{goal.difficulty && <span>· {goal.difficulty}</span>}{goal.minutes > 0 && <span className="inline-flex items-center gap-1"><Clock3 size={11} />~{goal.minutes} min</span>}{goal.slot === 'stretch' && <span className="font-semibold text-sky-600 dark:text-sky-400">+{goal.rewardXp || 0} XP</span>}</p>
      </div>
    </div>
    {goal.reason && <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{goal.reason}</p>}
    <div className="mt-3 flex items-center gap-3">
      <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-zinc-800" role="progressbar" aria-label={goal.title || goal.label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}><div className={`h-full rounded-full ${goal.completed ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${value / target * 100}%` }} /></div>
      <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-zinc-400">{value}/{target}</span>
      {!disabled && !goal.completed && !goal.paused && goal.href && <Link to={goal.href} aria-label={`${value ? 'Continue' : 'Start'}: ${goal.title || goal.label}`} className={`inline-flex shrink-0 items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-300 ${focusRing}`}>{value ? 'Continue' : 'Start'}<ArrowRight size={13} /></Link>}
    </div>
    {goal.paused && <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">Content is currently unavailable. Your earned progress is safe.</p>}
  </li>;
}

export default function DailyChallengeDrawer({ id, onClose, returnFocusRef }) {
  const { section, refresh } = useChallengeHub({ includeRanking: false });
  const { allowsModule, allowsPath } = useUniversityPolicy();
  const [filter, setFilter] = useState('all');
  const overlayRef = useRef(null), panelRef = useRef(null), closeRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const data = section.data, daily = data?.daily;
  const goals = (daily?.goals || []).filter(goal => allowsModule(MISSION_MODULES[goal.domain]) && (!goal.href || allowsPath(goal.href, 'student')));
  const accessChanged = goals.length !== (daily?.goals?.length || 0);
  const progress = dailyPlanProgress(goals);
  const counts = { all: goals.length, pending: 0, completed: 0, paused: 0 };
  goals.forEach(goal => { counts[dailyGoalStatus(goal)]++; });
  const visibleGoals = goals.filter(goal => filter === 'all' || dailyGoalStatus(goal) === filter);
  const actionsEnabled = data?.enabled && !section.error && !accessChanged;

  useEffect(() => {
    const previousFocus = returnFocusRef?.current || document.activeElement;
    const scrollNodes = [document.body, ...document.querySelectorAll('[data-app-scroll-container]')];
    const overflow = scrollNodes.map(node => [node, node.style.overflow]);
    scrollNodes.forEach(node => { node.style.overflow = 'hidden'; });
    closeRef.current?.focus({ preventScroll: true });
    const background = [...document.body.children].filter(node => node !== overlayRef.current);
    const previousInert = background.map(node => [node, node.inert]);
    background.forEach(node => { node.inert = true; });
    const onKey = event => {
      if (document.querySelector('dialog[data-challenge-celebration][open]')) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...panelRef.current.querySelectorAll('a[href], button:not(:disabled), [tabindex="0"]')];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panelRef.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    const keepFocus = event => { if (!document.querySelector('dialog[data-challenge-celebration][open]') && !panelRef.current?.contains(event.target)) closeRef.current?.focus({ preventScroll: true }); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', keepFocus);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', keepFocus);
      overflow.forEach(([node, value]) => { node.style.overflow = value; });
      previousInert.forEach(([node, value]) => { node.inert = value; });
      if (previousFocus?.isConnected && !previousFocus.closest('[inert]')) previousFocus.focus({ preventScroll: true });
    };
  }, [onClose, returnFocusRef]);

  return createPortal(<div ref={overlayRef} data-platform-popup-root className="fixed inset-0 z-[10020]">
    <motion.div aria-hidden="true" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reducedMotion ? 0 : 0.18 }} onClick={onClose} />
    <motion.section ref={panelRef} id={id} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} className="absolute inset-y-0 right-0 flex w-full max-w-[500px] flex-col border-l border-slate-200 bg-[#f6f7f9] text-slate-900 shadow-2xl dark:border-zinc-800 dark:bg-[#1a1a1a] dark:text-zinc-100" initial={{ x: reducedMotion ? 0 : '100%' }} animate={{ x: 0 }} transition={{ duration: reducedMotion ? 0 : 0.24, ease: 'easeOut' }} onClick={event => {
      if (event.target.closest('a[href]') && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) onClose();
    }}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#202020]">
        <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"><Sparkles size={21} /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-sky-600 dark:text-sky-400">Small steps. Real progress.</p><h2 id={`${id}-title`} className="mt-0.5 text-lg font-semibold tracking-tight">Daily challenges</h2></div></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close daily challenges" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-zinc-400 dark:hover:bg-zinc-800 ${focusRing}`}><X size={19} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
        <p id={`${id}-description`} className="mb-4 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">Your personal plan, adapted to your progress and university access.</p>
        <div className="mb-4 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-600 dark:text-zinc-300">{dateLabel(daily?.periodKey, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) || 'Today’s plan'}</p><button type="button" aria-label="Refresh daily challenges" onClick={refresh} disabled={section.loading} className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-sky-600 disabled:opacity-50 dark:text-sky-400 ${focusRing}`}><RefreshCw size={13} className={section.loading ? 'animate-spin motion-reduce:animate-none' : ''} />{section.loading ? 'Updating…' : 'Refresh'}</button></div>
        {section.error && <div role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{data && <span className="font-semibold">Showing last synced progress. </span>}{section.error}</div>}
        {!data && section.loading ? <div role="status" className="space-y-3"><span className="sr-only">Loading daily challenges</span>{[0, 1, 2].map(index => <div key={index} className="h-32 animate-pulse rounded-2xl bg-slate-200/60 motion-reduce:animate-none dark:bg-zinc-800" />)}</div>
          : !data ? <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-[#242424]"><Target className="mx-auto mb-3 text-sky-500" size={28} /><p className="text-sm font-semibold">Let’s get your plan back</p><p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">Your saved achievements are safe. Use Refresh to try loading your challenges again.</p></div>
            : <>
              {!data.enabled || !goals.length ? <div role="status" className="rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-[#242424]"><Target size={30} className="mx-auto mb-3 text-sky-500" /><h3 className="font-semibold">{!data.enabled ? 'Challenges are paused' : 'Your next challenge is on its way'}</h3><p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-zinc-400">{!data.enabled ? 'Your university has paused new challenges. Your earned XP and badges are safe.' : 'There are no suitable open tasks in your enabled modules right now. Check back when new content is available.'}</p></div> : <>
                <div className="relative overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-cyan-50 p-4 dark:border-sky-900 dark:from-sky-950/50 dark:via-[#242424] dark:to-[#242424]">
                  <div className="flex items-center gap-4">
                    <div className="relative h-24 w-24 shrink-0" role="progressbar" aria-label="Daily plan progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-valuetext={`${progress.completed} of ${progress.total} required steps completed`}>
                      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="7" className="text-sky-100 dark:text-sky-950" /><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="7" pathLength="100" strokeDasharray={`${progress.percent} 100`} strokeLinecap="round" className={daily.completed ? 'text-emerald-500' : 'text-sky-500'} /></svg>
                      <span className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-xl font-bold tabular-nums">{progress.percent}%</span><span className="text-[10px] text-slate-500 dark:text-zinc-400">daily plan</span></span>
                    </div>
                    <div className="min-w-0"><p className="flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300">{daily.completed ? <CheckCircle2 size={13} /> : <Sparkles size={13} />}{daily.completed ? 'Today, well done!' : 'A little progress today'}</p><p className="mt-1.5 text-lg font-semibold tabular-nums">{daily.completed ? '+' : 'Earn '}{daily.rewardPoints} XP</p><p className="mt-1 text-xs text-slate-500 dark:text-zinc-400">{progress.completed}/{progress.total} required steps complete</p></div>
                  </div>
                  <p className="mt-3 border-t border-sky-100 pt-3 text-[11px] leading-relaxed text-slate-500 dark:border-sky-900/50 dark:text-zinc-400">Complete the core{goals.some(goal => goal.slot === 'choice') ? ' + any one choice' : ''}. Optional tasks and other choices do not block your daily reward.</p>
                </div>
                {(daily.paused || accessChanged) && <p role="status" className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">University access or content changed. This plan is paused; your next plan will use your current access.</p>}
                <div className="my-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter daily tasks">{['all', 'pending', 'completed', ...(counts.paused ? ['paused'] : [])].map(status => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${focusRing} ${filter === status ? 'border-sky-500 bg-sky-600 text-white dark:border-sky-600' : 'border-slate-200 bg-white text-slate-500 hover:border-sky-300 dark:border-zinc-700 dark:bg-[#242424] dark:text-zinc-400'}`}>{status === 'all' ? 'All' : status === 'pending' ? 'Pending' : status === 'completed' ? 'Completed' : 'Paused'}<span className={filter === status ? 'text-sky-100' : 'text-slate-400'}>{counts[status]}</span></button>)}</div>
                <div aria-live="polite" aria-atomic="true" className="sr-only">{counts.completed} completed tasks, {counts.pending} pending{counts.paused ? `, ${counts.paused} paused` : ''}.</div>
                {visibleGoals.length ? <ul aria-label="Daily tasks" className="space-y-3">{visibleGoals.map(goal => <DailyTask key={goal.id} goal={goal} disabled={!actionsEnabled || daily.paused} />)}</ul> : <p className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-xs leading-relaxed text-slate-500 dark:border-zinc-700 dark:text-zinc-400">{filter === 'completed' ? 'Your first win is waiting. Complete a task to see it here.' : filter === 'pending' ? 'No pending tasks. Nice work!' : 'No tasks in this view.'}</p>}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#242424]"><ChallengeAcceptance plan={daily} kind="daily" enabled={actionsEnabled} /></div>
              </>}
              {data.level && <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-100/80 p-3 dark:bg-zinc-800/60"><Trophy size={20} className="shrink-0 text-sky-500" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Level {data.level.level} · {data.level.title}</p><p className="mt-0.5 text-[11px] text-slate-500 dark:text-zinc-400">{Number(data.lifetime?.points || 0).toLocaleString('en-IN')} lifetime XP · Every verified XP adds 1 rank point</p></div></div>}
            </>}
        <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400"><Clock3 size={13} className="mt-0.5 shrink-0" /><span>New plan {dateLabel(daily?.endsAt, { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }) || 'daily'} at 2 AM IST. Missing a day never removes XP.</span></p>
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] dark:border-zinc-800 dark:bg-[#202020] sm:px-5"><Link to="/student/challenges?period=daily" className={`flex items-center justify-between gap-3 rounded-xl bg-sky-600 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-700 ${focusRing}`}><span>View all challenges<span className="mt-0.5 block text-[11px] font-normal text-sky-100">Daily, weekly & monthly progress</span></span><ArrowRight size={19} /></Link></footer>
    </motion.section>
  </div>, document.body);
}
