import { memo, useState } from 'react';
import { motion } from 'framer-motion';

const MotionDiv = motion.div;
const MotionSpan = motion.span;
const RIM_LAYERS = 12;
// Flight length; AcceptedCelebration times the landing burst and text to it.
const FLIGHT_S = 1.8;
const STREAKS = [
  { top: '30%', height: 10, width: 260, color: 'rgba(56,189,248,.85)', delay: 0 },
  { top: '46%', height: 16, width: 360, color: 'rgba(251,191,36,.9)', delay: 0.08 },
  { top: '62%', height: 9, width: 220, color: 'rgba(14,165,233,.75)', delay: 0.16 },
  { top: '74%', height: 6, width: 160, color: 'rgba(253,230,138,.85)', delay: 0.24 },
];
const LAND = [0.25, 1.15, 0.4, 1];
const RESTING = { x: 0, y: 0, scale: 1, opacity: 1 };
const FLIGHT = { x: 0, y: [70, -34, 0], scale: [0.35, 1.15, 1], opacity: 1 };
const FLIGHT_TIMING = { x: { duration: FLIGHT_S, ease: LAND }, y: { duration: FLIGHT_S, times: [0, 0.55, 1], ease: 'easeOut' },
  scale: { duration: FLIGHT_S + 0.05, times: [0, 0.72, 1], ease: 'easeOut' }, opacity: { duration: 0.25 } };
const SPIN = {
  still: { rotateY: -18 },
  flying: { rotateY: 720, transition: { duration: FLIGHT_S, ease: [0.25, 0.7, 0.35, 1] } },
  landed: { rotateY: [720, 738, 720, 702, 720], transition: { duration: 6, ease: 'easeInOut', repeat: Infinity } },
};

/** A CSS 3D PeerPrep coin. It is a visual celebration only, not a currency. */
export default memo(function PeerPrepCoin({ still = false }) {
  const [landed, setLanded] = useState(still);
  const [startX] = useState(() => -Math.round(Math.min(1100, (typeof window === 'undefined' ? 1000 : window.innerWidth) * 0.7)));
  return <div className="pp-coin" aria-hidden="true">
    <MotionDiv className="pp-coin__flight"
      initial={still ? false : { x: startX, y: 70, scale: 0.35, opacity: 0 }}
      animate={still ? RESTING : FLIGHT} transition={FLIGHT_TIMING}
      onAnimationComplete={() => setLanded(true)}>
      {!still && <span className="pp-coin__trail">{STREAKS.map((streak, index) => <MotionSpan key={index} className="pp-coin__streak"
        style={{ top: streak.top, height: streak.height, width: streak.width, '--streak': streak.color }}
        initial={{ opacity: 0, scaleX: 0.3 }} animate={{ opacity: [0, 0.95, 0], scaleX: [0.3, 1, 0.15] }}
        transition={{ duration: FLIGHT_S * 0.9, times: [0, 0.3, 1], delay: streak.delay, ease: 'easeOut' }} />)}</span>}
      <span className={`pp-coin__halo${landed ? ' pp-coin__halo--landed' : ''}`} />
      {landed && !still && [0, 1].map((ring) => <MotionSpan key={ring} className="pp-coin__pulse"
        initial={{ scale: 0.75, opacity: 0.8 }} animate={{ scale: 2.2, opacity: 0 }}
        transition={{ duration: 1.1, delay: ring * 0.35, ease: 'easeOut' }} />)}
      <MotionDiv className="pp-coin__spin" initial={still ? false : { rotateY: 0 }} animate={SPIN[still ? 'still' : landed ? 'landed' : 'flying']}>
        {Array.from({ length: RIM_LAYERS }, (_, index) => <span key={index} className="pp-coin__rim"
          style={{ transform: `translateZ(calc(var(--coin-depth) * ${(index / (RIM_LAYERS - 1) - 0.5).toFixed(3)}))` }} />)}
        <span className="pp-coin__face pp-coin__face--front">
          <span className="pp-coin__ring" />
          <span className="pp-coin__emboss"><span className="pp-coin__mark" /></span>
          <span className="pp-coin__sheen" />
        </span>
        <span className="pp-coin__face pp-coin__face--back">
          <span className="pp-coin__ring" />
          <span className="pp-coin__letter">P</span>
          <span className="pp-coin__sheen" />
        </span>
      </MotionDiv>
    </MotionDiv>
    <span className={`pp-coin__shadow${landed ? ' pp-coin__shadow--landed' : ''}`} />
  </div>;
});
