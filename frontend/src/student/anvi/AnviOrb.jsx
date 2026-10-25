import { useEffect, useId, useRef } from "react";

const LABELS = {
  idle: "ANVI is ready",
  connecting: "ANVI is connecting",
  listening: "ANVI is listening",
  thinking: "ANVI is thinking",
  speaking: "ANVI is speaking",
};

/**
 * ANVI's animated presence. `getLevel()` (0..~0.3 RMS) is read on every frame and applied to the SVG
 * directly, so voice-reactive motion never re-renders React. Motion stops under prefers-reduced-motion.
 * The colours read on both themes: a soft violet drop glow on light surfaces, a brighter halo on dark.
 */
export default function AnviOrb({ phase = "idle", getLevel = null, size = 224, className = "" }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const coreRef = useRef(null);
  const glowRef = useRef(null);
  const rippleRef = useRef(null);

  useEffect(() => {
    const core = coreRef.current;
    const glow = glowRef.current;
    const ripple = rippleRef.current;
    if (!getLevel || !core || !glow || !ripple) return undefined;
    let frame = 0;
    let smooth = 0;
    const draw = () => {
      const raw = Math.min(1, Math.max(0, Number(getLevel()) || 0) * 4.5);
      // Fast attack, slow release reads as speech rather than flicker.
      smooth += (raw - smooth) * (raw > smooth ? 0.45 : 0.08);
      core.style.transform = `scale(${(1 + smooth * 0.09).toFixed(4)})`;
      glow.style.opacity = (0.45 + smooth * 0.55).toFixed(3);
      ripple.style.transform = `scale(${(1 + smooth * 0.22).toFixed(4)})`;
      ripple.style.opacity = (0.15 + smooth * 0.6).toFixed(3);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      core.style.transform = "";
      ripple.style.transform = "";
      glow.style.opacity = "";
      ripple.style.opacity = "";
    };
  }, [getLevel]);

  const label = LABELS[phase] || LABELS.idle;
  const scope = `anvi-orb-${id}`;
  const centred = { transformBox: "fill-box", transformOrigin: "center", transition: "opacity 300ms ease" };

  return (
    <svg viewBox="0 0 240 240" width={size} height={size} role="img" aria-label={label} className={`${scope} block max-w-full drop-shadow-[0_22px_40px_rgba(109,40,217,0.22)] dark:drop-shadow-[0_0_44px_rgba(139,92,246,0.28)] ${className}`} data-phase={phase}>
      <style>{`
        .${scope} .breathe { animation: anviOrbBreathe 3.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
        .${scope} .spin { animation: anviOrbSpin 2.2s linear infinite; transform-box: fill-box; transform-origin: center; }
        .${scope} .drift { animation: anviOrbSpin 14s linear infinite; transform-box: fill-box; transform-origin: center; }
        @keyframes anviOrbBreathe { 0%, 100% { transform: scale(1); opacity: .55; } 50% { transform: scale(1.045); opacity: .9; } }
        @keyframes anviOrbSpin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .${scope} * { animation: none !important; } }
      `}</style>
      <defs>
        <radialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#d946ef" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-core`} cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#cffafe" />
          <stop offset="28%" stopColor="#67e8f9" />
          <stop offset="62%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#a21caf" />
        </radialGradient>
        <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="50%" stopColor="#8b5cf6" />
          <stop offset="100%" stopColor="#d946ef" />
        </linearGradient>
      </defs>

      <circle ref={glowRef} cx="120" cy="120" r="116" fill={`url(#${id}-glow)`} opacity={phase === "idle" || phase === "connecting" ? 0.35 : 0.5} style={{ transition: "opacity 300ms ease" }} />

      <g ref={rippleRef} style={centred} opacity="0.25">
        <circle cx="120" cy="120" r="86" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="1.5" />
      </g>

      {phase === "listening" && <circle className="breathe" cx="120" cy="120" r="78" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="2.5" />}
      {(phase === "thinking" || phase === "connecting") && (
        <circle className="spin" cx="120" cy="120" r="80" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="3" strokeLinecap="round" strokeDasharray="70 432" opacity={phase === "connecting" ? 0.5 : 0.95} />
      )}

      <g ref={coreRef} style={centred}>
        <circle cx="120" cy="120" r="64" fill={`url(#${id}-core)`} />
        <g className="drift" opacity="0.35">
          <ellipse cx="104" cy="112" rx="34" ry="20" fill="#f0abfc" opacity="0.45" />
          <ellipse cx="140" cy="134" rx="28" ry="16" fill="#22d3ee" opacity="0.35" />
        </g>
        <ellipse cx="100" cy="94" rx="22" ry="13" fill="#ffffff" opacity="0.38" />
      </g>
    </svg>
  );
}
