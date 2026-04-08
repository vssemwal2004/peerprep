import { motion } from "framer-motion";

const MotionSvg = motion.svg;
const MotionG = motion.g;

const horizontalPaths = Array.from({ length: 10 }, (_, index) => {
  const y = 170 + index * 72;
  const curve = 28 + index * 7;

  return `M -120 ${y}
    C 180 ${y - curve}, 430 ${y + curve * 1.25}, 760 ${y}
    S 1400 ${y - curve * 0.95}, 2040 ${y + curve * 0.18}`;
});

const verticalPaths = Array.from({ length: 11 }, (_, index) => {
  const x = 120 + index * 170;
  const curve = 24 + (index % 5) * 8;

  return `M ${x} -120
    C ${x + curve} 210, ${x - curve * 1.1} 510, ${x} 860
    S ${x + curve * 1.35} 1230, ${x - curve * 0.3} 1540`;
});

export default function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.10),transparent_48%)]" />
      <div className="absolute inset-x-0 top-12 h-[34rem] bg-[radial-gradient(circle_at_center,rgba(125,211,252,0.08),transparent_60%)] blur-3xl" />

      <MotionSvg
        viewBox="0 0 1920 1280"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{ opacity: 0.7 }}
        initial={{ scale: 1.02 }}
        animate={{ scale: [1.02, 1.045, 1.02] }}
        transition={{ duration: 18, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id="grid-line-horizontal" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="20%" stopColor="rgba(186,230,253,0.12)" />
            <stop offset="50%" stopColor="rgba(56,189,248,0.18)" />
            <stop offset="80%" stopColor="rgba(191,219,254,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <linearGradient id="grid-line-vertical" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="24%" stopColor="rgba(191,219,254,0.12)" />
            <stop offset="50%" stopColor="rgba(56,189,248,0.16)" />
            <stop offset="76%" stopColor="rgba(186,230,253,0.12)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <filter id="grid-soft-blur">
            <feGaussianBlur stdDeviation="1.8" />
          </filter>

          <filter id="grid-warp" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.007 0.02"
              numOctaves="2"
              seed="2"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                dur="18s"
                values="0.007 0.02; 0.009 0.018; 0.007 0.02"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="16"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>

        <g filter="url(#grid-warp)">
          <MotionG
            animate={{ y: [0, -14, 0] }}
            transition={{ duration: 16, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          >
            {horizontalPaths.map((path) => (
              <path
                key={path}
                d={path}
                fill="none"
                stroke="url(#grid-line-horizontal)"
                strokeWidth="0.95"
                strokeLinecap="round"
              />
            ))}
          </MotionG>

          <MotionG
            animate={{ x: [0, 10, 0] }}
            transition={{ duration: 20, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          >
            {verticalPaths.map((path) => (
              <path
                key={path}
                d={path}
                fill="none"
                stroke="url(#grid-line-vertical)"
                strokeWidth="0.9"
                strokeLinecap="round"
              />
            ))}
          </MotionG>

          <MotionG
            filter="url(#grid-soft-blur)"
            animate={{ opacity: [0.08, 0.14, 0.08] }}
            transition={{ duration: 14, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
          >
            {horizontalPaths.slice(1, 8).map((path) => (
              <path
                key={`glow-${path}`}
                d={path}
                fill="none"
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            ))}
          </MotionG>
        </g>
      </MotionSvg>
    </div>
  );
}
