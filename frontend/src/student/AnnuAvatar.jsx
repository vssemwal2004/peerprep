const labels = {
  idle: 'ANNU is ready', listening: 'ANNU is listening',
  thinking: 'ANNU is preparing the next question', speaking: 'ANNU is speaking',
};

export default function AnnuAvatar({ phase = 'idle', level = 0 }) {
  const mouth = phase === 'speaking' ? Math.max(3, Math.min(16, 3 + level * 60)) : 3;
  return <div className="relative mx-auto w-full max-w-[280px]" role="img" aria-label={labels[phase] || labels.idle}>
    <style>{`@keyframes annuFloat { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-5px) } } @keyframes annuGlow { 0%,100% { opacity:.45 } 50% { opacity:.9 } }`}</style>
    <svg viewBox="0 0 280 280" className="h-auto w-full drop-shadow-xl" aria-hidden="true">
      <defs>
        <linearGradient id="annuBg" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#312e81"/><stop offset="1" stopColor="#0e7490"/></linearGradient>
        <linearGradient id="annuFace" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#f8d6b9"/><stop offset="1" stopColor="#dca987"/></linearGradient>
      </defs>
      <circle cx="140" cy="140" r="132" fill="url(#annuBg)" />
      <circle cx="140" cy="140" r="118" fill="none" stroke="#a5f3fc" strokeWidth="2" opacity={phase === 'speaking' ? .8 : .3} style={{ animation: phase === 'speaking' ? 'annuGlow 1s ease-in-out infinite' : undefined }} />
      <g style={{ animation: 'annuFloat 3s ease-in-out infinite' }}>
        <path d="M52 264c10-49 43-71 88-71s78 22 88 71" fill="#dbeafe" />
        <path d="M96 203l44 45 44-45" fill="#fff" />
        <path d="M130 209l10 12 10-12-10-10z" fill="#4f46e5" />
        <path d="M140 221l-8 43h16z" fill="#4f46e5" />
        <ellipse cx="140" cy="128" rx="72" ry="83" fill="#1e293b" />
        <ellipse cx="140" cy="133" rx="59" ry="69" fill="url(#annuFace)" />
        <path d="M79 115c1-55 28-77 64-77 48 0 70 34 63 83-8-28-23-40-44-43-25 22-52 24-83 37z" fill="#172033" />
        <path d="M100 125q13-8 25 0M155 125q13-8 25 0" fill="none" stroke="#382d35" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="113" cy="139" rx="4" ry="6" fill="#172033" />
        <ellipse cx="167" cy="139" rx="4" ry="6" fill="#172033" />
        <path d="M137 148q-5 10 2 12" fill="none" stroke="#a56d59" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="140" cy="179" rx={phase === 'speaking' ? 12 : 14} ry={mouth} fill={phase === 'speaking' ? '#7f1d1d' : '#a84458'} />
        {phase !== 'speaking' && <path d="M126 178q14 9 28 0" fill="none" stroke="#823346" strokeWidth="2" />}
        <path d="M67 128q-10 0-10 16t11 16M212 128q10 0 10 16t-11 16" fill="none" stroke="#f8d6b9" strokeWidth="6" strokeLinecap="round" />
        <path d="M53 139c0-28 17-46 38-47M227 139c0-28-17-46-38-47" fill="none" stroke="#67e8f9" strokeWidth="8" strokeLinecap="round" />
        <rect x="44" y="133" width="18" height="39" rx="9" fill="#0891b2" />
        <rect x="218" y="133" width="18" height="39" rx="9" fill="#0891b2" />
      </g>
      {phase === 'listening' && <g fill="none" stroke="#a5f3fc" strokeWidth="3"><path d="M24 125q-12 16 0 32M256 125q12 16 0 32"/><path d="M15 116q-20 25 0 50M265 116q20 25 0 50"/></g>}
      {phase === 'thinking' && <g fill="#a5f3fc"><circle cx="231" cy="54" r="4"/><circle cx="244" cy="54" r="4"/><circle cx="257" cy="54" r="4"/></g>}
    </svg>
    <p className="mt-2 text-center text-sm font-semibold text-indigo-700 dark:text-indigo-300">{labels[phase] || labels.idle}</p>
  </div>;
}
