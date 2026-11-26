// The paid-check popup: Prep Coins fly from the student's wallet to PeerPrep, then ANVI's steps
// follow the server's real stages (reading → matching → verifying). A failed check flies the coins
// back. Every state the server can answer (short balance, price change, daily limit, paused
// budget, feature off) has its own message, and nothing is charged in those states.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Check, CircleSlash, Clock3, Coins, FileSearch, Loader2, RotateCcw, ScanText, ShieldCheck, X } from 'lucide-react';
import PrepCoinIcon from '../../../../components/prepCoin/PrepCoinIcon';
import { playRewardSound } from '../../../../student/rewards/rewardSound';
import { AnviOrb, AnviWord } from '../AnviVisuals';

const STEPS = [
  { key: 'coins', label: 'Prep Coins sent to PeerPrep', Icon: Coins },
  { key: 'reading', label: 'ANVI is reading the job description', Icon: FileSearch },
  { key: 'matching', label: 'ANVI is matching it with your résumé', Icon: ScanText },
  { key: 'verifying', label: 'Checking every keyword and line', Icon: ShieldCheck },
];
const STAGE_STEP = { queued: 1, reading: 1, matching: 2, verifying: 3, done: 4, failed: 4 };

/** The step the server is on, shown one step at a time so each one is seen. */
function useShownStep(target) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown === target) return undefined;
    if (target < shown) { setShown(target); return undefined; }
    const timer = setTimeout(() => setShown((value) => Math.min(target, value + 1)), shown === 0 ? 1200 : 650);
    return () => clearTimeout(timer);
  }, [shown, target]);
  return shown;
}

function useCount(from, to, run, duration = 900) {
  const [value, setValue] = useState(from);
  useEffect(() => {
    if (!run || from === to) { setValue(to); return undefined; }
    let frame;
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to, run, duration]);
  return value;
}

/** Wallet chip ⟶ coins in flight ⟶ PeerPrep. `direction` -1 flies them back (refund). */
function CoinTransfer({ before, after, cost, direction = 1, play }) {
  const reduce = useReducedMotion();
  const count = useCount(before, after, play && !reduce, 1100);
  const coins = Math.max(1, Math.min(10, cost || 1));
  return (
    <div className="relative flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-3 ring-1 ring-inset ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
      <div className="flex min-w-0 items-center gap-2">
        <PrepCoinIcon size={30} shine pop={play} />
        <div className="leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">Your wallet</p>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-white" aria-hidden="true">{count.toLocaleString()}</p>
          <span className="sr-only" role="status">Wallet balance {after.toLocaleString()} Prep Coins</span>
        </div>
      </div>
      <div className="relative h-10 flex-1" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-amber-300/70 dark:border-amber-400/30" />
        {play && !reduce ? Array.from({ length: coins }, (_, index) => (
          <motion.span key={`${direction}-${index}`} className="absolute top-1/2 -mt-2.5" style={{ left: direction > 0 ? '0%' : '100%' }}
            initial={{ left: direction > 0 ? '0%' : '100%', y: 0, opacity: 0, scale: 0.6 }}
            animate={{ left: direction > 0 ? ['0%', '50%', '100%'] : ['100%', '50%', '0%'], y: [0, -22, 0], opacity: [0, 1, 0], scale: [0.6, 1, 0.7] }}
            transition={{ duration: 0.9, delay: index * 0.08, ease: 'easeInOut' }}>
            <PrepCoinIcon size={20} />
          </motion.span>
        )) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-right leading-tight">
          <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-400">{direction > 0 ? 'To' : 'From'}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-white">PeerPrep</p>
        </div>
        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl bg-white ring-1 ring-black/[0.06] dark:bg-zinc-800 dark:ring-white/[0.08]">
          <img src="/images/logo.png" alt="" className="h-7 w-7 object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
        </span>
      </div>
    </div>
  );
}

function Steps({ shown, failed, free = false }) {
  return (
    <ol className="space-y-2" aria-label="Check progress">
      {STEPS.map(({ key, label: stepLabel, Icon }, index) => {
        // A free check (monthly free use, or a price of 0) sends no coins.
        const label = key === 'coins' && free ? 'Free check: no Prep Coins used' : stepLabel;
        const done = shown > index;
        const active = shown === index && !failed;
        return (
          <li key={key} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition ${active ? 'bg-violet-50 text-violet-900 dark:bg-violet-500/10 dark:text-violet-100' : done ? 'text-slate-700 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-500'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-500 text-white' : active ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-white/[0.06]'}`}>
              {done ? <Check className="h-3.5 w-3.5" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
            </span>
            <span className="font-medium">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const BLOCKED = {
  shortfall: { Icon: Coins, tone: 'amber', title: 'Not enough Prep Coins' },
  price: { Icon: AlertTriangle, tone: 'amber', title: 'The price changed' },
  limit: { Icon: Clock3, tone: 'slate', title: 'Daily limit reached' },
  tooLong: { Icon: AlertTriangle, tone: 'amber', title: 'Too long for one check' },
  paused: { Icon: CircleSlash, tone: 'slate', title: 'Paused for now' },
  disabled: { Icon: CircleSlash, tone: 'slate', title: 'Not turned on' },
  error: { Icon: AlertTriangle, tone: 'rose', title: 'Could not start' },
};
const TONE = {
  amber: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200',
  slate: 'bg-slate-100 text-slate-700 dark:bg-white/[0.06] dark:text-zinc-200',
  rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
};
const coins = (value) => `${Number(value || 0).toLocaleString()} Prep Coin${Number(value) === 1 ? '' : 's'}`;

export default function JdMatchPopup({ state, onClose, onRetry, onShowReport }) {
  const reduce = useReducedMotion();
  const phase = state?.phase;
  const failed = phase === 'failed';
  const target = phase === 'quote' || phase === 'charging' ? 0 : STAGE_STEP[state?.stage] ?? 1;
  const shown = useShownStep(phase === 'done' ? 4 : target);
  const charge = state?.charge;
  const paid = Boolean(charge?.cost);
  // Balances only when known: a check picked up after a refresh shows no made-up numbers.
  const known = paid ? Number.isFinite(charge.balance) : Number.isFinite(state?.quote?.balance);
  const before = paid ? charge.balance + charge.cost : state?.quote?.balance ?? 0;
  const after = paid ? charge.balance : before;
  const free = Boolean(state?.quote) && state.quote.cost === 0;
  const retryCost = state?.quote?.cost;
  const dialogRef = useRef(null);
  // Focus moves into the dialog and returns to where it was when the dialog closes.
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous && typeof previous.focus === 'function') previous.focus(); };
  }, []);
  const sounded = useRef({ spend: false, refund: false });
  useEffect(() => {
    if (paid && !sounded.current.spend) { sounded.current.spend = true; playRewardSound('coin'); }
    if (failed && state?.refunded && !sounded.current.refund) { sounded.current.refund = true; playRewardSound('notice'); }
  }, [paid, failed, state?.refunded]);
  // The report opens on its own a moment after it is ready.
  useEffect(() => {
    if (phase !== 'done' || (shown < 4 && !state?.cached)) return undefined;
    const timer = setTimeout(onShowReport, state?.cached ? 900 : 1100);
    return () => clearTimeout(timer);
  }, [phase, shown, onShowReport, state?.cached]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!state) return null;

  const blocked = phase === 'blocked' ? state.error || { kind: 'error' } : null;
  const look = blocked ? BLOCKED[blocked.kind] || BLOCKED.error : null;
  const busy = phase === 'quote' || phase === 'charging';
  const lost = phase === 'lost';
  const stageText = busy ? 'Starting the check' : phase === 'done' ? 'Report ready' : failed ? 'Check failed' : STEPS[Math.min(shown, STEPS.length - 1)]?.label;

  return createPortal(
    <AnimatePresence>
      <motion.div key="jd-popup" className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={busy ? undefined : onClose} role="presentation">
        <motion.div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="jd-popup-title" onClick={(event) => event.stopPropagation()}
          initial={reduce ? false : { y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none ring-1 ring-black/[0.06] dark:bg-[#202020] dark:ring-white/[0.08]">
          <span className="sr-only" role="status">{stageText}</span>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.14),transparent_70%)]" aria-hidden="true" />
          <div className="relative flex items-start gap-3">
            <AnviOrb size={42} busy={phase === 'running' || busy} online={phase === 'done'} />
            <div className="min-w-0 flex-1">
              <h2 id="jd-popup-title" className="text-base font-semibold text-slate-950 dark:text-white"><AnviWord /> JD Match</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {state.cached ? 'Same résumé and job as a check in the last 24 hours: shown again for free.'
                  : phase === 'done' ? 'Your keyword report is ready.'
                    : lost ? 'Still being checked on the server.'
                    : failed ? 'This check did not finish.'
                      : blocked ? 'Nothing was charged.'
                        : state.joined ? 'Your earlier check is still running.'
                          : 'Matching your résumé with this job description.'}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="-m-1 rounded-lg p-2.5 text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>

          {blocked ? (
            <div className="relative mt-4 space-y-3">
              <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm ${TONE[look.tone]}`} role="alert">
                <look.Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">{look.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5">
                    {blocked.kind === 'shortfall' ? `This check needs ${coins(blocked.required)} and you have ${coins(blocked.balance)}. Prep Coins are issued by your coordinator, or earned on PeerPrep.`
                      : blocked.kind === 'price' ? `It now costs ${coins(blocked.cost)}. Try again to use the new price.`
                        : blocked.message}
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10">Close</button>
                {['price', 'error'].includes(blocked.kind) ? <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><RotateCcw className="h-4 w-4" />{blocked.kind === 'price' && Number.isFinite(blocked.cost) ? `Use the new price · ${coins(blocked.cost)}` : 'Try again'}</button> : null}
              </div>
            </div>
          ) : (
            <div className="relative mt-4 space-y-3">
              {!state.cached && known && !free ? (
                failed && state.refunded && paid
                  ? <CoinTransfer before={after} after={before} cost={charge.cost} direction={-1} play />
                  : <CoinTransfer before={before} after={after} cost={charge?.cost || state.quote?.cost || 1} play={paid} />
              ) : null}
              {busy ? <p className="flex items-center gap-2 px-1 text-xs text-slate-600 dark:text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />{phase === 'quote' ? 'Checking the price…' : free ? 'Starting your free check…' : `Sending ${coins(state.quote?.cost)}…`}</p> : null}
              {!state.cached && !lost ? <Steps shown={busy ? 0 : shown} failed={failed} free={free} /> : null}
              {lost ? <div className="rounded-2xl bg-slate-100 px-4 py-3 text-[13px] leading-5 text-slate-700 dark:bg-white/[0.06] dark:text-zinc-200" role="alert">{state.error?.message}</div> : null}
              {failed ? (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-[13px] leading-5 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200" role="alert">
                  {state.error?.message || 'ANVI could not finish this check.'}
                  {state.refunded && paid ? <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-300">{coins(charge.cost)} returned to your wallet.</p> : null}
                </div>
              ) : null}
              {phase === 'done' ? (
                <button type="button" onClick={onShowReport} className="w-full rounded-xl bg-gradient-to-r from-sky-600 via-violet-600 to-fuchsia-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(124,58,237,0.9)]">See my keyword report</button>
              ) : null}
              {failed ? <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10">Close</button><button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"><RotateCcw className="h-4 w-4" />{retryCost ? `Try again · ${coins(retryCost)}` : 'Try again'}</button></div> : null}
              {lost ? <div className="flex justify-end"><button type="button" onClick={onClose} className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10">Close</button></div> : null}
              {phase === 'running' ? <p className="px-1 text-[12px] leading-4 text-slate-600 dark:text-zinc-400">You can close this window: ANVI keeps working and shows the report when it is ready. If it cannot finish, your coins come back automatically.</p> : null}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
