import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, RefreshCw, Sparkles } from 'lucide-react';

export const ANVI_ASK_EVENT = 'peerprep:ask-anvi';

export function AnviMark({ className = 'h-8 w-8', tone = 'auto' }) {
  if (tone === 'dark') {
    return <img src="/brand/anvi-mark-dark.png" alt="" aria-hidden="true" className={`${className} object-contain`} />;
  }
  if (tone === 'light') {
    return <img src="/brand/anvi-mark.png" alt="" aria-hidden="true" className={`${className} object-contain`} />;
  }
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} aria-hidden="true">
      <img src="/brand/anvi-mark.png" alt="" className="absolute inset-0 h-full w-full object-contain dark:hidden" />
      <img src="/brand/anvi-mark-dark.png" alt="" className="absolute inset-0 hidden h-full w-full object-contain dark:block" />
    </span>
  );
}

export function AnviWordmark({ className = '', tone = 'dark' }) {
  if (tone === 'dark') {
    return <img src="/brand/anvi-wordmark-dark.png" alt="AnvI AI" className={`${className} object-contain object-left drop-shadow-[0_0_12px_rgba(125,211,252,0.2)]`} />;
  }
  const middleTone = tone === 'light' ? 'text-slate-700' : 'text-white';
  const badgeTone = tone === 'light'
    ? 'border-violet-200 bg-violet-50 text-violet-700'
    : 'border-white/15 bg-white/10 text-cyan-100';
  return (
    <span className={`inline-flex items-baseline whitespace-nowrap font-sans leading-none ${className}`} aria-label="AnvI AI">
      <span className="bg-gradient-to-br from-cyan-300 via-violet-400 to-fuchsia-400 bg-clip-text text-[1.22em] font-black tracking-[-0.08em] text-transparent">A</span>
      <span className={`text-[0.82em] font-extrabold tracking-[-0.06em] ${middleTone}`}>nv</span>
      <span className="bg-gradient-to-br from-fuchsia-300 via-violet-300 to-cyan-300 bg-clip-text text-[1.22em] font-black tracking-[-0.06em] text-transparent">I</span>
      <span className={`ml-2 rounded-md border px-1.5 py-1 align-middle text-[0.38em] font-black uppercase tracking-[0.14em] ${badgeTone}`}>AI</span>
    </span>
  );
}

export function AnviIdentity({ className = '', compact = false, subtitle = '', tone = 'dark' }) {
  const subtitleTone = tone === 'light' ? 'text-slate-500' : 'text-violet-100/75';
  if (tone === 'dark') {
    return (
      <div className={`flex min-w-0 items-center ${className}`}>
        <span className="min-w-0">
          <AnviWordmark tone="dark" className={compact ? 'h-8 w-28' : 'h-11 w-44'} />
          {subtitle ? <span className={`mt-1 block truncate text-xs ${subtitleTone}`}>{subtitle}</span> : null}
        </span>
      </div>
    );
  }
  return (
    <div className={`flex min-w-0 items-center ${compact ? 'gap-2' : 'gap-3'} ${className}`}>
      <span className={`flex shrink-0 items-center justify-center rounded-xl border ${compact ? 'h-9 w-9' : 'h-11 w-11'} ${tone === 'light' ? 'border-violet-100 bg-violet-50 shadow-sm' : 'border-cyan-300/20 bg-white/10 shadow-[0_0_24px_rgba(34,211,238,0.12)]'}`}>
        <AnviMark tone="light" className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
      </span>
      <span className="min-w-0">
        <AnviWordmark tone={tone} className={compact ? 'text-lg' : 'text-2xl'} />
        {subtitle ? <span className={`mt-1 block truncate text-xs ${subtitleTone}`}>{subtitle}</span> : null}
      </span>
    </div>
  );
}

function chooseRandomApproach(approaches, previousIndex) {
  if (!approaches.length) return -1;
  if (approaches.length === 1) return 0;
  let nextIndex = Math.floor(Math.random() * approaches.length);
  if (nextIndex === previousIndex) nextIndex = (nextIndex + 1) % approaches.length;
  return nextIndex;
}

export default function AnviApproach({ approaches = [], requestKey = 0, onRequest }) {
  const cleanApproaches = useMemo(
    () => approaches.map((approach) => String(approach || '').trim()).filter(Boolean).slice(0, 10),
    [approaches],
  );
  const [phase, setPhase] = useState('idle');
  const [stage, setStage] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const timersRef = useRef([]);
  const lastRequestRef = useRef(0);

  useEffect(() => () => timersRef.current.forEach(window.clearTimeout), []);

  useEffect(() => {
    if (!requestKey || requestKey === lastRequestRef.current) return;
    lastRequestRef.current = requestKey;
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
    setPhase('loading');
    setStage(0);

    const duration = 2300 + Math.floor(Math.random() * 1701);
    timersRef.current.push(window.setTimeout(() => setStage(1), Math.round(duration * 0.34)));
    timersRef.current.push(window.setTimeout(() => setStage(2), Math.round(duration * 0.68)));
    timersRef.current.push(window.setTimeout(() => {
      setSelectedIndex((previous) => chooseRandomApproach(cleanApproaches, previous));
      setPhase('ready');
    }, duration));
  }, [cleanApproaches, requestKey]);

  const stages = ['Reading the problem', 'Mapping constraints', 'Selecting your next move'];
  const selectedApproach = selectedIndex >= 0 ? cleanApproaches[selectedIndex] : '';

  if (phase === 'idle') return null;

  if (phase === 'loading') {
    return (
      <section className="relative overflow-hidden rounded-2xl border border-violet-200/70 bg-[#090516] text-white shadow-[0_18px_55px_rgba(87,28,190,0.22)] dark:border-violet-700/50" aria-live="polite">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_25%,rgba(0,213,255,0.2),transparent_24%),radial-gradient(circle_at_78%_20%,rgba(255,48,174,0.24),transparent_30%),linear-gradient(135deg,rgba(47,15,102,0.35),transparent_55%)]" />
        <div className="relative grid min-h-[250px] md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative flex min-h-[190px] items-center justify-center overflow-hidden border-b border-white/10 md:border-b-0 md:border-r">
            <div className="absolute h-36 w-36 animate-ping rounded-full border border-fuchsia-400/25 [animation-duration:2.6s]" />
            <div className="absolute h-24 w-24 animate-pulse rounded-full bg-cyan-400/10 blur-xl" />
            <div className="absolute h-40 w-px rotate-45 bg-gradient-to-b from-transparent via-cyan-300/70 to-transparent" />
            <div className="absolute h-40 w-px -rotate-45 bg-gradient-to-b from-transparent via-fuchsia-400/70 to-transparent" />
            {[0, 1, 2, 3, 4, 5].map((node) => (
              <span key={node} className="absolute h-2 w-2 animate-pulse rounded-full bg-white shadow-[0_0_18px_rgba(59,223,255,0.95)]" style={{ transform: `rotate(${node * 60}deg) translateY(-66px)`, animationDelay: `${node * 140}ms` }} />
            ))}
            <div className="relative flex h-24 w-24 items-center justify-center rounded-[28px] border border-white/15 bg-white/5 shadow-[0_0_45px_rgba(181,59,255,0.3)] backdrop-blur-md">
              <AnviMark tone="dark" className="h-20 w-20 animate-pulse" />
            </div>
          </div>
          <div className="flex flex-col justify-center p-6 sm:p-7">
            <div className="flex items-center gap-3">
              <AnviWordmark tone="dark" className="h-10 w-40" />
              <span className="rounded-full border border-fuchsia-300/20 bg-fuchsia-400/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-fuchsia-200">Thinking</span>
            </div>
            <h3 className="mt-5 text-xl font-semibold">Building an approach for you</h3>
            <p className="mt-2 text-sm leading-6 text-violet-100/70">AnvI is connecting the statement, constraints, and expected complexity.</p>
            <div className="mt-5 space-y-3">
              {stages.map((label, index) => (
                <div key={label} className={`flex items-center gap-3 text-sm transition ${index <= stage ? 'text-white' : 'text-white/35'}`}>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${index < stage ? 'border-cyan-300 bg-cyan-300 text-slate-950' : index === stage ? 'animate-pulse border-fuchsia-300 bg-fuchsia-400/15' : 'border-white/15'}`}>
                    {index < stage ? '✓' : index + 1}
                  </span>
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/65 to-cyan-50/60 shadow-[0_16px_45px_rgba(76,29,149,0.12)] dark:border-violet-800/70 dark:from-[#171123] dark:via-[#161022] dark:to-[#07171d]">
      <div className="h-1 bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500" />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0c0716] shadow-[0_8px_24px_rgba(107,33,168,0.25)]"><AnviMark tone="dark" className="h-10 w-10" /></span>
            <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-500 dark:text-violet-300">AnvI approach</p><h3 className="mt-1 text-base font-semibold text-slate-950 dark:text-white">A useful next direction</h3></div>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-fuchsia-500" />
        </div>
        <div className="mt-5 rounded-xl border border-white/80 bg-white/80 p-4 text-sm leading-7 text-slate-700 shadow-sm dark:border-white/5 dark:bg-white/5 dark:text-slate-200">
          {selectedApproach || 'AnvI could not find an approved approach for this problem yet. Ask your instructor to add one.'}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Use the direction, then work out the implementation yourself.</p>
          <button type="button" onClick={onRequest} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-50 dark:border-violet-800 dark:bg-white/5 dark:text-violet-200 dark:hover:bg-white/10">
            <RefreshCw className="h-3.5 w-3.5" /> Ask again <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
