import { useEffect, useState } from 'react';
import { Pause, Play, Timer, TimerReset } from 'lucide-react';

const formatElapsed = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const clock = `${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return hours ? `${hours}:${clock}` : clock;
};

/**
 * Practice stopwatch with pause and reset. It keeps its own clock so the editor and the problem
 * panels do not re-render every second.
 */
export default function WorkspaceTimer() {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(true);
  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
  const control = 'inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-35 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100';
  return (
    <div role="group" aria-label="Practice timer" className="hidden items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-1 shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#2a2a2c] sm:flex">
      <span role="timer" aria-live="off" className={`flex items-center gap-1.5 px-2 text-[13px] font-semibold tabular-nums ${running ? 'text-slate-800 dark:text-zinc-100' : 'text-amber-600 dark:text-amber-300'}`}>
        <Timer className="h-4 w-4" aria-hidden="true" />
        {formatElapsed(seconds)}
        {!running && <span className="rounded-md bg-amber-50 px-1.5 py-px text-[10.5px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Paused</span>}
      </span>
      <button type="button" onClick={() => setRunning((value) => !value)} aria-pressed={!running} aria-label={running ? 'Pause timer' : 'Resume timer'} title={running ? 'Pause timer' : 'Resume timer'} className={control}>
        {running ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
      </button>
      <button type="button" onClick={() => { setSeconds(0); setRunning(true); }} disabled={seconds === 0 && running} aria-label="Reset timer" title="Reset timer" className={control}>
        <TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
