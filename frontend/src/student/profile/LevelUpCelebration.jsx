import { useMemo } from 'react';
import LevelMedallion from './LevelMedallion';
import BadgeCelebration from '../badges/BadgeCelebration';
import { fromAward } from '../badges/badgeModel';

/**
 * Celebration for a new learner level and/or newly earned awards: the shared badge celebration
 * (fireworks, confetti, the medal in 3D). A level-up shows the level medallion as the hero.
 * @param {{ open: boolean, level?: {level:number,title:string,helper:string}|null, awards: Array, onClose: () => void, onView?: () => void }} props
 */
export default function LevelUpCelebration({ open, level, awards = [], onClose, onView }) {
  const items = useMemo(() => awards.map((award) => fromAward({ ...award, earned: true })), [awards]);
  const heading = level ? `Level ${level.level} reached!` : 'Congratulations!';
  const subheading = level
    ? `You are now a ${level.title}. ${level.helper || ''}`.trim()
    : items.length > 1 ? `You earned ${items.length} new badges` : 'You earned a new badge';
  return (
    <BadgeCelebration
      open={open}
      items={items}
      hero={level ? <LevelMedallion level={level.level} size="lg" /> : null}
      heading={heading}
      subheading={subheading}
      onClose={onClose}
      onView={onView && items.length ? onView : undefined}
      viewLabel="View your badges"
    />
  );
}
