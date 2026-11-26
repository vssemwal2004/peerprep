import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle, Lightbulb, Sparkles, Volume2, VolumeX, X } from 'lucide-react';
import { COACH_TIP } from './coachTip';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { announceCoinsEarned, BADGE_LEVEL_EARNED, COINS_EARNED, startRewardSocketBridge } from './rewardEvents';
import { playRewardSound, setSoundsEnabled, SOUND_SETTING_EVENT, soundsEnabled, unlockRewardSounds } from './rewardSound';
import BadgeCelebration from '../badges/BadgeCelebration';
import { fromBadgeEvent } from '../badges/badgeModel';

// Long enough to read why the coins came (students thought a solve paid them; 2026-11-26 feedback).
const COIN_SHOW_MS = 4500;
// Prep Coach tips stay until read (paused while hovered), then leave on their own.
const TIP_SHOW_MS = 10_000;
const TIP_TONES = {
  warn: { Icon: AlertTriangle, ring: 'border-amber-300 dark:border-amber-500/40', icon: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300', label: 'Heads up' },
  info: { Icon: Lightbulb, ring: 'border-sky-200 dark:border-sky-500/30', icon: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', label: 'Prep Coach' },
  good: { Icon: Sparkles, ring: 'border-emerald-200 dark:border-emerald-500/30', icon: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', label: 'Level up' },
};

/** One Prep Coach tip card at the top centre: what happened, what to do next, up to two links. */
function CoachTipCard({ tip, onClose, onGo, onHold }) {
  const tone = TIP_TONES[tip.tone] || TIP_TONES.info;
  return (
    <div role="status" onMouseEnter={() => onHold(true)} onMouseLeave={() => onHold(false)} onFocus={() => onHold(true)} onBlur={() => onHold(false)}
      className={`pointer-events-auto w-full max-w-md rounded-2xl border bg-white/95 p-3 shadow-xl shadow-slate-900/10 backdrop-blur dark:bg-zinc-900/95 ${tone.ring}`}>
      <div className="flex items-start gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone.icon}`}><tone.Icon className="h-4 w-4" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{tone.label}</p>
          <p className="text-[13.5px] font-semibold leading-snug text-slate-900 dark:text-zinc-50">{tip.title}</p>
          {tip.body && <p className="mt-0.5 text-[12.5px] leading-snug text-slate-600 dark:text-zinc-300">{tip.body}</p>}
          {tip.actions?.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">
            {tip.actions.slice(0, 2).map((action, index) => (
              <button key={action.href} type="button" onClick={() => onGo(action.href)}
                className={`max-w-full truncate rounded-lg px-2.5 py-1 text-[12px] font-semibold transition-colors ${index === 0 ? 'bg-slate-900 text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-zinc-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-zinc-200 dark:hover:bg-white/15'}`}>
                {action.label}
              </button>
            ))}
          </div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss tip" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
const KIND_LABEL = { login: 'Daily login', solve: 'Problem solved', badge: 'Monthly badge level up', challenge: 'Daily challenge done', sheet: 'Sheet completed', milestone: 'Lifetime badge', level: 'Elite level reached' };

/**
 * Student-wide reward feedback: the daily check-in, the small coin popup at the top (with sound),
 * and the badge celebration (fireworks + the medal in 3D) for monthly and lifetime badges. Badges
 * that arrive while it is open join it. Mounted once for students outside tests; renders nothing at rest.
 */
export default function StudentRewardsLayer({ userId }) {
  const navigate = useNavigate();
  const [coins, setCoins] = useState([]);
  const [badges, setBadges] = useState([]);
  const [soundOn, setSoundOn] = useState(soundsEnabled);
  const [tip, setTip] = useState(null);
  const [tipHeld, setTipHeld] = useState(false);
  const reduced = useReducedMotion();
  // Closing while hovered must not leave the hold on for the next tip.
  const closeTip = useCallback(() => { setTip(null); setTipHeld(false); }, []);
  const goTip = useCallback((href) => { setTip(null); setTipHeld(false); navigate(href); }, [navigate]);

  // A newer tip replaces the current one; it leaves after TIP_SHOW_MS unless hovered or focused.
  useEffect(() => {
    const onTip = (event) => { setTip(event.detail); setTipHeld(false); };
    window.addEventListener(COACH_TIP, onTip);
    return () => window.removeEventListener(COACH_TIP, onTip);
  }, []);
  useEffect(() => {
    if (!tip || tipHeld) return undefined;
    const timer = setTimeout(() => setTip(null), TIP_SHOW_MS);
    return () => clearTimeout(timer);
  }, [tip, tipHeld]);
  const badgeItems = useMemo(() => badges.map(fromBadgeEvent), [badges]);
  const closeBadges = useCallback(() => setBadges([]), []);
  const viewBadges = useCallback(() => { setBadges([]); navigate('/student/profile#badges'); }, [navigate]);

  useEffect(() => {
    if (!userId) return undefined;
    const stopUnlock = unlockRewardSounds();
    socketService.connect();
    socketService.emit('register', userId);
    const stopBridge = startRewardSocketBridge();
    let cancelled = false;
    // First open of the day: +1 coin, and today counts on the heatmap. Idempotent on the server.
    api.dailyCheckIn().then((result) => {
      if (cancelled || !result?.coins) return;
      const streak = Number(result.streak) || 0;
      announceCoinsEarned({ kind: 'login', amount: result.coins.amount, balance: result.coins.balance,
        note: streak > 1 ? `Daily login · ${streak}-day streak` : 'Daily login' });
    }).catch(() => {});
    return () => { cancelled = true; stopUnlock(); stopBridge(); };
  }, [userId]);

  useEffect(() => {
    const onCoins = (event) => {
      const item = { id: `${event.detail.kind}:${event.detail.balance}:${event.detail.at}`, ...event.detail };
      setCoins((current) => [...current.slice(-2), item]);
      // A badge plays its own fanfare, so its coins stay quiet.
      if (item.kind !== 'badge' && item.kind !== 'milestone') playRewardSound(item.kind === 'login' ? 'login' : 'coin');
      setTimeout(() => setCoins((current) => current.filter((entry) => entry.id !== item.id)), COIN_SHOW_MS);
    };
    const onBadge = (event) => {
      setBadges((current) => [...current.filter((entry) => entry.track !== event.detail.track), event.detail].slice(-8));
      playRewardSound('badge');
    };
    const onSetting = () => setSoundOn(soundsEnabled());
    window.addEventListener(COINS_EARNED, onCoins);
    window.addEventListener(BADGE_LEVEL_EARNED, onBadge);
    window.addEventListener(SOUND_SETTING_EVENT, onSetting);
    return () => {
      window.removeEventListener(COINS_EARNED, onCoins);
      window.removeEventListener(BADGE_LEVEL_EARNED, onBadge);
      window.removeEventListener(SOUND_SETTING_EVENT, onSetting);
    };
  }, []);

  const toggleSound = () => setSoundsEnabled(!soundOn);

  return (
    <>
      {/* Coin popups: small pills dropping in at the top centre. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[120] flex flex-col items-center gap-2 px-4">
        <AnimatePresence initial={false}>
          {coins.map((item) => (
            <motion.div key={item.id} layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 28 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-amber-200 bg-white/95 py-1.5 pl-1.5 pr-2 text-sm shadow-lg shadow-amber-900/10 backdrop-blur dark:border-amber-500/30 dark:bg-zinc-900/95">
              <PrepCoinIcon size={28} pop shine />
              <span className="font-extrabold tabular-nums text-amber-700 dark:text-amber-300">+{item.amount}</span>
              <button type="button" onClick={() => navigate('/student/wallet')} title="See how Prep Coins are earned"
                className="min-w-0 max-w-[260px] rounded-md text-left leading-tight hover:underline">
                <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-zinc-100">{KIND_LABEL[item.kind] || 'Prep Coins'}</span>
                {item.note && item.note !== KIND_LABEL[item.kind] && <span className="block truncate text-[11px] text-slate-500 dark:text-zinc-400">{item.note}</span>}
              </button>
              <button type="button" onClick={toggleSound} title={soundOn ? 'Mute reward sounds' : 'Turn reward sounds on'} aria-label={soundOn ? 'Mute reward sounds' : 'Turn reward sounds on'}
                className="ml-0.5 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10">
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
            </motion.div>
          ))}
          {tip && <motion.div key={`tip:${tip.code}:${tip.at}`} layout={!reduced} className="flex w-full justify-center"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -24 }} animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }}>
            <CoachTipCard tip={tip} onClose={closeTip} onGo={goTip} onHold={setTipHeld} />
          </motion.div>}
        </AnimatePresence>
      </div>

      {/* Badge earned: the full celebration (monthly and lifetime badges). */}
      <BadgeCelebration open={badgeItems.length > 0} items={badgeItems} onClose={closeBadges} onView={viewBadges} />
    </>
  );
}
