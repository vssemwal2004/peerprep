import { useId } from 'react';

/** Small, first-party SVG emblems. Decorative; the adjacent label carries the meaning. */
export function ChallengeGlyph({ kind = 'daily', className = '' }) {
  const id = useId();
  const colors = kind === 'weekly' || kind === 'learning' ? ['#a78bfa', '#7c3aed'] : kind === 'monthly' || kind === 'assessments' ? ['#fbbf24', '#f59e0b'] : ['#38bdf8', '#0284c7'];
  return <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
    <defs><linearGradient id={id} x1="8" y1="4" x2="54" y2="62" gradientUnits="userSpaceOnUse"><stop stopColor={colors[0]} /><stop offset="1" stopColor={colors[1]} /></linearGradient></defs>
    <path d="M32 3C47 3 61 16 60 33S47 60 31 61 3 49 3 32 17 3 32 3Z" fill={`url(#${id})`} opacity=".12" />
    <rect x="12" y="10" width="40" height="42" rx="14" transform="rotate(-8 12 10)" fill={`url(#${id})`} opacity=".15" />
    <g stroke={`url(#${id})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'coding' ? <><path d="m24 23-9 9 9 9m16-18 9 9-9 9m-5-22-6 26" /></>
        : kind === 'learning' ? <><path d="M32 47V21c-7-5-14-4-19-2v24c6-2 12-2 19 4Zm0 0c7-6 13-6 19-4V19c-5-2-12-3-19 2" /><path d="m19 26 7 1m12 0 7-1" /></>
          : kind === 'weekly' ? <><path d="M20 50V15m1 2c11-8 15 9 26 1v23c-11 8-15-9-26-1" /><path d="m27 28 4 4 8-7" /></>
            : kind === 'monthly' ? <><path d="M22 15h20v16a10 10 0 0 1-20 0V15Zm0 5h-7v7c0 7 7 8 7 8m20-15h7v7c0 7-7 8-7 8M32 42v8m-9 1h18" /><path d="m29 24 3-3 3 3-1 5h-4l-1-5Z" /></>
              : kind === 'assessments' ? <><rect x="18" y="17" width="28" height="34" rx="5" /><rect x="25" y="12" width="14" height="9" rx="3" /><path d="m25 34 5 5 9-10m-13 16h12" /></>
                : kind === 'interviews' || kind === 'events' ? <><path d="M47 19a19 19 0 0 1-23 29l-11 3 3-11a19 19 0 0 1 31-21Z" /><path d="M25 26h14m-14 8h9" /></>
                  : kind === 'momentum' ? <><path d="M18 45h7V32h8V22h8V12m0 0-6 6m6-6 6 6" /><path d="M14 51h36" /></>
                    : <path d="m36 11-19 25h13l-2 17 19-26H34l2-16Z" fill={`url(#${id})`} strokeWidth="2" />}
    </g>
    <path d="m51 8 1.5 4.5L57 14l-4.5 1.5L51 20l-1.5-4.5L45 14l4.5-1.5L51 8Z" fill={colors[0]} />
  </svg>;
}

export default function ChallengeArtwork({ className = '' }) {
  const id = useId();
  return <svg viewBox="0 0 420 230" fill="none" className={className} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-rocket`} x1="175" y1="28" x2="261" y2="169" gradientUnits="userSpaceOnUse"><stop stopColor="white" /><stop offset="1" stopColor="#bae6fd" /></linearGradient>
      <linearGradient id={`${id}-fire`} x1="175" y1="146" x2="136" y2="204" gradientUnits="userSpaceOnUse"><stop stopColor="#fde68a" /><stop offset="1" stopColor="#38bdf8" stopOpacity="0" /></linearGradient>
    </defs>
    <ellipse cx="227" cy="120" rx="150" ry="74" transform="rotate(-16 227 120)" fill="#fff" fillOpacity=".04" stroke="#fff" strokeOpacity=".15" />
    <ellipse cx="227" cy="120" rx="115" ry="53" transform="rotate(-16 227 120)" stroke="#fff" strokeOpacity=".3" strokeDasharray="3 8" />
    <circle cx="227" cy="116" r="68" fill="#38bdf8" fillOpacity=".13" /><circle cx="227" cy="116" r="48" fill="#38bdf8" fillOpacity=".09" />
    <path d="M182 142c-31 11-42 36-44 62 28-6 45-23 52-48Z" fill={`url(#${id}-fire)`} />
    <g transform="rotate(32 223 102)">
      <path d="m205 112-23 25 2 24 27-14m30-35 23 25-2 24-27-14" fill="#38bdf8" stroke="#7dd3fc" strokeWidth="2" />
      <path d="M223 25c-29 23-36 77-22 120h44c14-43 7-97-22-120Z" fill={`url(#${id}-rocket)`} />
      <path d="M207 44c6-9 10-14 16-19 6 5 11 11 16 19Z" fill="#38bdf8" />
      <circle cx="223" cy="78" r="16" fill="#075985" stroke="#fff" strokeWidth="6" /><circle cx="219" cy="73" r="4" fill="#7dd3fc" />
      <path d="M203 130h40m-33 17v11m13-11v15m13-15v11" stroke="#7dd3fc" strokeWidth="5" strokeLinecap="round" />
    </g>
    <g transform="translate(53 115) rotate(-12)"><rect width="67" height="57" rx="16" fill="#e0f2fe" /><path d="m23 20-8 8 8 8m21-16 8 8-8 8m-8-21-6 26" stroke="#0284c7" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>
    <g transform="translate(318 56) rotate(12)"><rect width="62" height="62" rx="19" fill="#d1fae5" /><path d="M31 12 15 19v14c0 10 16 17 16 17s16-7 16-17V19L31 12Z" fill="#10b981" /><path d="m23 30 6 6 12-12" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g>
    <g fill="#fde68a"><path d="m121 27 3 10 10 3-10 3-3 10-3-10-10-3 10-3 3-10Z" /><path d="m303 169 2.5 8 8 2.5-8 2.5-2.5 8-2.5-8-8-2.5 8-2.5 2.5-8Z" /></g>
    <circle cx="83" cy="80" r="3" fill="#7dd3fc" /><circle cx="290" cy="30" r="4" fill="#7dd3fc" /><circle cx="367" cy="156" r="3" fill="white" />
    <path d="m103 202 18-4m206-57 12-3" stroke="white" strokeOpacity=".4" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}
