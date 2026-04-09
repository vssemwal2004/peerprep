const GRID_GAP = 40;
const VIEW_W = 1920;
const VIEW_H = 1280;
const PAD = 240;

const H_COUNT = Math.ceil((VIEW_H + PAD * 2) / GRID_GAP) + 1;
const V_COUNT = Math.ceil((VIEW_W + PAD * 2) / GRID_GAP) + 1;

const horizontalPaths = Array.from({ length: H_COUNT }, (_, index) => {
  const y = -PAD + index * GRID_GAP;
  return `M ${-PAD} ${y} L ${VIEW_W + PAD} ${y}`;
});

const verticalPaths = Array.from({ length: V_COUNT }, (_, index) => {
  const x = -PAD + index * GRID_GAP;
  return `M ${x} ${-PAD} L ${x} ${VIEW_H + PAD}`;
});

export default function GridBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
      <svg
        viewBox="0 0 1920 1280"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <style>
          {`
            @keyframes pp-grid-drift {
              0% { transform: translate3d(0, 0, 0); }
              50% { transform: translate3d(0, -12px, 0); }
              100% { transform: translate3d(0, 0, 0); }
            }
            .pp-grid-anim { animation: pp-grid-drift 18s ease-in-out infinite; }
          `}
        </style>

        <defs>
          <filter id="pp-grid-warp" x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.008 0.02"
              numOctaves="2"
              seed="7"
              result="noise"
            >
              <animate
                attributeName="baseFrequency"
                dur="16s"
                values="0.008 0.02; 0.010 0.018; 0.008 0.02"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="noise" scale="10" xChannelSelector="R" yChannelSelector="G">
              <animate attributeName="scale" dur="18s" values="8; 11; 8" repeatCount="indefinite" />
            </feDisplacementMap>
          </filter>

          <filter id="pp-grid-soften">
            <feGaussianBlur stdDeviation="0.35" />
          </filter>
        </defs>

        <g
          className="pp-grid-anim block dark:hidden"
          filter="url(#pp-grid-soften)"
          opacity="0.12"
          stroke="#60a5fa"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        >
          {horizontalPaths.map((d) => (
            <path key={`l-${d}`} d={d} />
          ))}
          {verticalPaths.map((d) => (
            <path key={`l-v-${d}`} d={d} />
          ))}

          <g filter="url(#pp-grid-soften)" opacity="0.7">
            {horizontalPaths.slice(4, Math.min(24, horizontalPaths.length)).map((d) => (
              <path key={`l-soft-${d}`} d={d} strokeWidth="1.6" opacity="0.55" />
            ))}
          </g>
        </g>

        <g
          className="pp-grid-anim hidden dark:block"
          filter="url(#pp-grid-soften)"
          opacity="0.08"
          stroke="#7dd3fc"
          strokeWidth="1"
          strokeLinecap="round"
          fill="none"
        >
          {horizontalPaths.map((d) => (
            <path key={`d-${d}`} d={d} />
          ))}
          {verticalPaths.map((d) => (
            <path key={`d-v-${d}`} d={d} />
          ))}

          <g filter="url(#pp-grid-soften)" opacity="0.65">
            {horizontalPaths.slice(4, Math.min(24, horizontalPaths.length)).map((d) => (
              <path key={`d-soft-${d}`} d={d} strokeWidth="1.6" opacity="0.5" />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
