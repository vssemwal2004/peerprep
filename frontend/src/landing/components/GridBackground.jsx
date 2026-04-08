const GRID_GAP = 48; // 30px–50px requirement

const horizontalPaths = Array.from({ length: 30 }, (_, index) => {
  const y = -240 + index * GRID_GAP;
  const amp = 14 + (index % 5) * 3;
  return `M -240 ${y}
    Q 480 ${y - amp}, 960 ${y}
    T 2160 ${y}`;
});

const verticalPaths = Array.from({ length: 46 }, (_, index) => {
  const x = -240 + index * GRID_GAP;
  const amp = 12 + (index % 6) * 3;
  return `M ${x} -240
    Q ${x + amp} 320, ${x} 640
    T ${x} 1520`;
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
          filter="url(#pp-grid-warp)"
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
            {horizontalPaths.slice(3, 20).map((d) => (
              <path key={`l-soft-${d}`} d={d} strokeWidth="1.6" opacity="0.55" />
            ))}
          </g>
        </g>

        <g
          className="pp-grid-anim hidden dark:block"
          filter="url(#pp-grid-warp)"
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
            {horizontalPaths.slice(3, 20).map((d) => (
              <path key={`d-soft-${d}`} d={d} strokeWidth="1.6" opacity="0.5" />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}
