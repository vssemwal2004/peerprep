import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock3, Flame, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import socketService from '../utils/socket';

function timeRemaining(nextResetAt) {
  const remaining = Math.max(0, new Date(nextResetAt).getTime() - Date.now());
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const difficultyTone = {
  Easy: 'text-[#00b8a3] bg-emerald-50 dark:bg-emerald-500/10',
  Medium: 'text-[#ffb800] bg-amber-50 dark:bg-amber-500/10',
  Hard: 'text-[#ff375f] bg-rose-50 dark:bg-rose-500/10',
};

export default function DailyCodingChallenge({ variant = 'card', className = '', onLoaded }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    let active = true;
    const refresh = () => api.getDailyCodingChallenge().then((result) => {
      if (!active) return;
      setData(result);
      onLoaded?.(result);
    }).catch(() => {});
    const handleNotification = (notification) => { if (notification?.type === 'STREAK') refresh(); };
    refresh();
    const poll = window.setInterval(refresh, 60000);
    socketService.on('new_notification', handleNotification);
    return () => { active = false; window.clearInterval(poll); socketService.off('new_notification', handleNotification); };
  }, [onLoaded]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = timeRemaining(data?.nextResetAt);
  if (!data?.enabled || !data?.challenge) return null;
  const open = () => navigate(`/problems/${data.challenge._id}`);

  if (variant === 'header') {
    return <button type="button" onClick={open} title={`Daily challenge resets in ${countdown}`} className={`inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs font-medium transition hover:bg-zinc-200 dark:hover:bg-zinc-700 ${className}`}>
      <Flame className={`h-4 w-4 ${data.completedToday ? 'text-[#2cbb5d]' : 'text-[#ffa116]'}`} />
      <span className="hidden text-zinc-600 dark:text-zinc-300 lg:inline">{data.currentStreak} day streak</span>
      <span className="hidden font-mono text-zinc-400 xl:inline">{countdown}</span>
    </button>;
  }

  if (variant === 'compact') {
    return <button type="button" onClick={open} className={`w-full rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-50 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md dark:border-orange-500/20 dark:from-orange-500/10 dark:to-amber-500/5 ${className}`}>
      <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-orange-600 dark:text-orange-400"><Flame className="h-4 w-4" /> Daily challenge</span><span className="font-mono text-[11px] text-zinc-400">{countdown}</span></div>
      <p className="mt-3 truncate text-sm font-medium text-zinc-900 dark:text-white">{data.challenge.title}</p>
      <div className="mt-3 flex items-center justify-between"><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${difficultyTone[data.challenge.difficulty]}`}>{data.challenge.difficulty}</span><span className="text-xs font-medium text-zinc-500">{data.completedToday ? 'Completed' : `${data.currentStreak} day streak`}</span></div>
    </button>;
  }

  return <section className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-[#242424] ${className}`}>
    <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center">
      <div className="flex min-w-0 items-start gap-4"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${data.completedToday ? 'bg-emerald-50 text-[#2cbb5d] dark:bg-emerald-500/10' : 'bg-orange-50 text-[#ffa116] dark:bg-orange-500/10'}`}>{data.completedToday ? <Check className="h-6 w-6" /> : <Target className="h-6 w-6" />}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-zinc-900 dark:text-white">Today’s coding challenge</h2><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${difficultyTone[data.challenge.difficulty]}`}>{data.challenge.difficulty}</span></div><p className="mt-1 truncate text-sm text-zinc-600 dark:text-zinc-300">{data.challenge.title}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-400"><span className="flex items-center gap-1.5"><Flame className="h-3.5 w-3.5 text-[#ffa116]" />{data.currentStreak} current · {data.bestStreak} best</span><span className="flex items-center gap-1.5 font-mono"><Clock3 className="h-3.5 w-3.5" />{countdown} remaining</span></div></div></div>
      <button type="button" onClick={open} className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold ${data.completedToday ? 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300' : 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'}`}>{data.completedToday ? 'Review challenge' : 'Solve challenge'}<ChevronRight className="h-4 w-4" /></button>
    </div>
    <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-2.5 text-[11px] text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/40">A new shared challenge starts every day at 2:00 AM IST.</div>
  </section>;
}
