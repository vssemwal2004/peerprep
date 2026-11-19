import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Volume2, VolumeX, X } from 'lucide-react';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { announceCoinsEarned, BADGE_LEVEL_EARNED, COINS_EARNED, startRewardSocketBridge } from './rewardEvents';
import { playRewardSound, setSoundsEnabled, SOUND_SETTING_EVENT, soundsEnabled, unlockRewardSounds } from './rewardSound';
import { BADGE_MARKS, tierStyle } from './tiers';

const COIN_SHOW_MS = 2800;
const BADGE_SHOW_MS = 6000;
const KIND_LABEL = { login: 'Daily login', solve: 'Problem solved', badge: 'Badge level' };

/**
 * Student-wide reward feedback: the daily check-in, the small coin popup at the top (with sound),
 * and the badge level card. Mounted once for students outside tests; renders nothing at rest.
 */
export default function StudentRewardsLayer({ userId }) {
  const [coins, setCoins] = useState([]);
  const [badge, setBadge] = useState(null);
  const [soundOn, setSoundOn] = useState(soundsEnabled);
  const reduced = useReducedMotion();
  const badgeTimer = useRef(null);

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
      // A badge level plays its own fanfare, so its coins stay quiet.
      if (item.kind !== 'badge') playRewardSound(item.kind === 'login' ? 'login' : 'coin');
      setTimeout(() => setCoins((current) => current.filter((entry) => entry.id !== item.id)), COIN_SHOW_MS);
    };
    const onBadge = (event) => {
      setBadge(event.detail);
      playRewardSound('badge');
      clearTimeout(badgeTimer.current);
      badgeTimer.current = setTimeout(() => setBadge(null), BADGE_SHOW_MS);
    };
    const onSetting = () => setSoundOn(soundsEnabled());
    window.addEventListener(COINS_EARNED, onCoins);
    window.addEventListener(BADGE_LEVEL_EARNED, onBadge);
    window.addEventListener(SOUND_SETTING_EVENT, onSetting);
    return () => {
      window.removeEventListener(COINS_EARNED, onCoins);
      window.removeEventListener(BADGE_LEVEL_EARNED, onBadge);
      window.removeEventListener(SOUND_SETTING_EVENT, onSetting);
      clearTimeout(badgeTimer.current);
    };
  }, []);

  const toggleSound = () => setSoundsEnabled(!soundOn);
  const tier = tierStyle(badge?.tier);

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
              <span className="max-w-[210px] truncate font-medium text-slate-700 dark:text-zinc-200">{item.note || KIND_LABEL[item.kind] || 'Prep Coins'}</span>
              <button type="button" onClick={toggleSound} title={soundOn ? 'Mute reward sounds' : 'Turn reward sounds on'} aria-label={soundOn ? 'Mute reward sounds' : 'Turn reward sounds on'}
                className="ml-0.5 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10">
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Badge level: a richer card at the top right. */}
      <AnimatePresence>
        {badge && (
          <motion.div role="status" key={`${badge.track}:${badge.level}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.92 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="fixed right-4 top-16 z-[121] w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15 dark:border-white/10 dark:bg-zinc-900">
            <div className={`h-1.5 bg-gradient-to-r ${tier.ring}`} />
            <div className="flex items-center gap-3 p-4">
              <motion.span initial={reduced ? false : { rotate: -25, scale: 0.6 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
                className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${tier.ring} p-[3px] shadow-md`}>
                <span className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white text-slate-900 dark:bg-zinc-900 dark:text-white">
                  <span className="text-[10px] font-bold tracking-wide text-slate-500">{BADGE_MARKS[badge.track] || '★'}</span>
                  <span className="text-lg font-black leading-none">{badge.level}</span>
                </span>
              </motion.span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Badge level up</p>
                <p className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{badge.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ${tier.chip}`}>Level {badge.level} · {badge.tier}</span>
                  {badge.coins > 0 && <span className="inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300"><PrepCoinIcon size={14} />+{badge.coins}</span>}
                </p>
                <Link to="/student/dashboard#badges" onClick={() => setBadge(null)} className="mt-1 inline-block text-xs font-semibold text-sky-700 hover:underline dark:text-sky-300">See this month's badges</Link>
              </div>
              <button type="button" onClick={() => setBadge(null)} aria-label="Close" className="self-start rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
