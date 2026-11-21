import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Volume2, VolumeX } from 'lucide-react';
import { api } from '../../utils/api';
import socketService from '../../utils/socket';
import PrepCoinIcon from '../../components/prepCoin/PrepCoinIcon';
import { announceCoinsEarned, BADGE_LEVEL_EARNED, COINS_EARNED, startRewardSocketBridge } from './rewardEvents';
import { playRewardSound, setSoundsEnabled, SOUND_SETTING_EVENT, soundsEnabled, unlockRewardSounds } from './rewardSound';
import BadgeCelebration from '../badges/BadgeCelebration';
import { fromBadgeEvent } from '../badges/badgeModel';

const COIN_SHOW_MS = 2800;
const KIND_LABEL = { login: 'Daily login', solve: 'Problem solved', badge: 'Badge level', challenge: 'Daily challenge', sheet: 'Sheet completed', milestone: 'Lifetime badge', level: 'Elite level reached' };

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
  const reduced = useReducedMotion();
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
              <span className="max-w-[210px] truncate font-medium text-slate-700 dark:text-zinc-200">{item.note || KIND_LABEL[item.kind] || 'Prep Coins'}</span>
              <button type="button" onClick={toggleSound} title={soundOn ? 'Mute reward sounds' : 'Turn reward sounds on'} aria-label={soundOn ? 'Mute reward sounds' : 'Turn reward sounds on'}
                className="ml-0.5 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10">
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Badge earned: the full celebration (monthly and lifetime badges). */}
      <BadgeCelebration open={badgeItems.length > 0} items={badgeItems} onClose={closeBadges} onView={viewBadges} />
    </>
  );
}
