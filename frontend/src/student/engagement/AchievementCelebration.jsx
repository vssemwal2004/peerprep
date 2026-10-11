import { useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import LevelUpCelebration from '../profile/LevelUpCelebration';

// Mounted only on Dashboard/Profile. The server's atomic delivery receipt arbitrates tabs/devices.
export default function AchievementCelebration({ revision, enabled = true }) {
  const [events, setEvents] = useState([]);
  const claiming = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!revision || !enabled || claiming.current || events.length) return undefined;
    const timer = setTimeout(async () => {
      claiming.current = true;
      try {
        const result = await api.claimAchievements();
        if (mounted.current) setEvents(result.events || []);
      } catch { /* Progress stays available; try delivery after the next refresh. */ }
      finally { claiming.current = false; }
    }, 400);
    return () => { clearTimeout(timer); };
  }, [revision, enabled, events.length]);
  const close = () => {
    const ids = events.map((event) => event.id);
    setEvents([]);
    api.acknowledgeAchievements(ids).catch(() => {});
  };
  const level = events.filter((event) => event.type === 'level').sort((a, b) => b.level.level - a.level.level)[0]?.level;
  return <LevelUpCelebration open={events.length > 0 && enabled} level={level} awards={events.filter((event) => event.type === 'badge').map((event) => event.award)} onClose={close} />;
}
