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

/**
 * Wallet ⟶ PeerPrep, drawn like a payment: the student's wallet on the left (balance counting down),
 * PeerPrep on the right (the amount counting up, then a tick), and the coins arcing between them
 * along a glowing track. `direction` -1 plays it backwards (a refund). `preview` shows the same
 * picture standing still, for the confirmation step.
 */
function CoinTransfer({ before, after, cost, direction = 1, play, preview = false, pending = false }) {
  const reduce = useReducedMotion();
  const animate = play && !reduce;
  const walletCount = useCount(before, after, animate, 1300);
  const sent = useCount(0, cost || 0, animate, 1300);
  const [landed, setLanded] = useState(!animate);
  useEffect(() => {
    if (!animate) { setLanded(Boolean(play)); return undefined; }
    setLanded(false);
    const timer = setTimeout(() => setLanded(true), 1350);
    return () => clearTimeout(timer);
  }, [animate, play]);
  const count = Math.max(3, Math.min(8, cost || 3));
  const outbound = direction > 0;
  const walletShown = preview ? before : walletCount;
  // PeerPrep's side counts what moved: +10 received, or −10 given back on a refund.
  const peerShown = preview ? 0 : sent;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#fffbeb_0%,#ffffff_45%,#f5f3ff_100%)] px-3 py-4 ring-1 ring-inset ring-amber-200/60 dark:bg-[linear-gradient(135deg,rgba(245,158,11,0.08)_0%,rgba(255,255,255,0.02)_45%,rgba(139,92,246,0.1)_100%)] dark:ring-white/[0.08]">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(70px,1.15fr)_minmax(0,1fr)] items-center gap-1">
        {/* Wallet */}
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_10px_24px_-14px_rgba(217,119,6,0.8)] ring-1 ring-amber-200 dark:bg-zinc-800 dark:ring-amber-400/25">
            <span className="absolute -left-1 bottom-1 opacity-70"><PrepCoinIcon size={18} /></span>
            <PrepCoinIcon size={32} shine pop={animate} />
          </div>
          <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[.12em] text-slate-500 dark:text-zinc-400">Your wallet</p>
          <p className="text-[22px] font-bold leading-tight tabular-nums text-slate-950 dark:text-white" aria-hidden="true">{Number(walletShown).toLocaleString()}</p>
          <span className="sr-only" role="status">{preview ? `Balance ${before} Prep Coins` : `Wallet balance ${after.toLocaleString()} Prep Coins`}</span>
        </div>

        {/* The track and the coins on it */}
        <div className="relative h-20" aria-hidden="true">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <defs>
              <linearGradient id="coin-track" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0" stopColor="#f59e0b" /><stop offset="1" stopColor="#8b5cf6" />
              </linearGradient>
            </defs>
            <path d="M2 30 Q50 -6 98 30" fill="none" stroke="url(#coin-track)" strokeWidth="1.6" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity="0.55">
              {animate || pending ? <animate attributeName="stroke-dashoffset" from={outbound ? '12' : '0'} to={outbound ? '0' : '12'} dur="0.6s" repeatCount="indefinite" /> : null}
            </path>
          </svg>
          {animate ? Array.from({ length: count }, (_, index) => (
            <motion.span key={`${direction}-${index}`} className="absolute -ml-2.5 -mt-2.5 drop-shadow-[0_4px_8px_rgba(217,119,6,0.55)]"
              initial={{ left: outbound ? '2%' : '98%', top: '75%', opacity: 0, scale: 0.5, rotate: 0 }}
              animate={{ left: outbound ? ['2%', '50%', '98%'] : ['98%', '50%', '2%'], top: ['75%', '0%', '75%'], opacity: [0, 1, 1, 0], scale: [0.5, 1.05, 0.7], rotate: [0, 180, 360] }}
              transition={{ duration: 1, delay: index * 0.09, ease: [0.45, 0, 0.25, 1] }}>
              <PrepCoinIcon size={20} />
            </motion.span>
          )) : null}
          {/* The amount, sitting on the arc */}
          <span className={`absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold tabular-nums shadow-sm ring-1 ${outbound ? 'bg-white text-amber-700 ring-amber-200 dark:bg-zinc-900 dark:text-amber-300 dark:ring-amber-400/30' : 'bg-white text-emerald-700 ring-emerald-200 dark:bg-zinc-900 dark:text-emerald-300 dark:ring-emerald-400/30'} ${pending ? 'animate-pulse' : ''}`}>
            {outbound ? '−' : '+'}{Number(cost || 0).toLocaleString()} <span className="font-semibold">coins</span>
          </span>
        </div>

        {/* PeerPrep */}
        <div className="flex flex-col items-center text-center">
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_10px_24px_-14px_rgba(109,40,217,0.8)] ring-1 ring-violet-200 dark:bg-zinc-800 dark:ring-violet-400/25">
            <img src="/images/logo.png" alt="" className="h-auto w-12 object-contain" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
            {landed && !preview ? (
              <motion.span initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className={`absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-white dark:ring-zinc-900 ${outbound ? 'bg-emerald-500' : 'bg-sky-500'}`}>
                <Check className="h-3 w-3" strokeWidth={3} />
              </motion.span>
            ) : null}
            {landed && animate ? <motion.span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-violet-400" initial={{ opacity: 0.8, scale: 1 }} animate={{ opacity: 0, scale: 1.35 }} transition={{ duration: 0.7 }} /> : null}
          </div>
          <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-[.12em] text-slate-500 dark:text-zinc-400">{outbound ? 'PeerPrep' : 'Returned'}</p>
          <p className="text-[22px] font-bold leading-tight tabular-nums text-violet-700 dark:text-violet-300" aria-hidden="true">{preview ? '—' : `${outbound ? '+' : '−'}${Number(peerShown).toLocaleString()}`}</p>
        </div>
      </div>
    </div>
  );
}

/** "Confirm & pay": what the check costs, the balance after, and what happens if it fails. */
function ConfirmView({ quote, onCancel, onConfirm }) {
  const cost = Number(quote?.cost || 0);
  const balance = Number(quote?.balance || 0);
  const after = Math.max(0, balance - cost);
  const confirmRef = useRef(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);
  return (
    <div className="relative mt-4 space-y-4">
      <CoinTransfer before={balance} after={after} cost={cost} preview play={false} />
      <dl className="overflow-hidden rounded-2xl ring-1 ring-inset ring-slate-200 dark:ring-white/[0.08]">
        {[
          ['Your balance now', `${balance.toLocaleString()} coins`, ''],
          ['ANVI deep check (this job)', `−${cost.toLocaleString()} coins`, 'text-amber-700 dark:text-amber-300'],
        ].map(([label, value, tone]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
            <dt className="text-slate-600 dark:text-zinc-300">{label}</dt>
            <dd className={`font-semibold tabular-nums text-slate-900 dark:text-white ${tone}`}>{value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-dashed border-slate-200 bg-slate-50 px-4 py-3 dark:border-white/[0.1] dark:bg-white/[0.03]">
          <dt className="text-[13px] font-semibold text-slate-900 dark:text-white">Balance after</dt>
          <dd className="flex items-center gap-1.5 text-[16px] font-bold tabular-nums text-slate-950 dark:text-white"><PrepCoinIcon size={18} />{after.toLocaleString()}</dd>
        </div>
      </dl>
      <ul className="space-y-1.5 text-[12.5px] leading-5 text-slate-600 dark:text-zinc-300">
        <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />If ANVI cannot finish, every coin comes back to your wallet automatically.</li>
        <li className="flex gap-2"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300" />The same résumé and job again within 24 hours opens free.</li>
      </ul>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-zinc-300 dark:hover:bg-white/10">Cancel</button>
        <button ref={confirmRef} type="button" onClick={onConfirm}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_12px_26px_-12px_rgba(109,40,217,0.95)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2">
          <PrepCoinIcon size={18} />Confirm &amp; pay {cost.toLocaleString()} coins
        </button>
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

export default function JdMatchPopup({ state, onClose, onRetry, onShowReport, onConfirm }) {
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
  const confirming = phase === 'confirm';
  const lost = phase === 'lost';
  const stageText = confirming ? 'Confirm the payment' : busy ? 'Starting the check' : phase === 'done' ? 'Report ready' : failed ? 'Check failed' : STEPS[Math.min(shown, STEPS.length - 1)]?.label;

  return createPortal(
    <AnimatePresence>
      <motion.div key="jd-popup" className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-[2px] sm:items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={busy ? undefined : onClose} role="presentation">
        <motion.div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="jd-popup-title" onClick={(event) => event.stopPropagation()}
          initial={reduce ? false : { y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl outline-none ring-1 ring-black/[0.06] dark:bg-[#202020] dark:ring-white/[0.08]">
          <span className="sr-only" role="status">{stageText}</span>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(139,92,246,0.14),transparent_70%)]" aria-hidden="true" />
          <div className="relative flex items-start gap-3">
            <AnviOrb size={42} busy={phase === 'running' || busy} online={phase === 'done'} />
            <div className="min-w-0 flex-1">
              <h2 id="jd-popup-title" className="text-base font-semibold text-slate-950 dark:text-white"><AnviWord /> JD Match</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                {confirming ? 'Check the price, then confirm. Nothing is taken until you do.'
                  : state.cached ? 'Same résumé and job as a check in the last 24 hours: shown again for free.'
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

          {confirming ? <ConfirmView quote={state.quote} onCancel={onClose} onConfirm={onConfirm} /> : blocked ? (
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
                  : <CoinTransfer before={before} after={paid ? after : Math.max(0, before - (state.quote?.cost || 0))} cost={charge?.cost || state.quote?.cost || 1} play={paid} pending={phase === 'charging'} preview={!paid} />
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
