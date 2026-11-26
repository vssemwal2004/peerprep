const darkArt = 'dark:[--art-paper:#2e3437] dark:[--art-shadow:#262b2d] dark:[--art-header:#363d40] dark:[--art-line:#728d9c] dark:[--art-edge:#68737a] dark:[--art-divider:#4c575e] dark:[--art-soft:#39474e] dark:[--art-accent:#84a7b8] dark:[--art-ink:#adc0ca]';

/** Small, decorative SVG scenes; intentionally independent of student progress data. */
export function CodingStartIllustration({ className = '' }) {
  return (
    <svg className={`${darkArt} ${className}`} width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 91h10c12 0 13-14 25-14h79c21 0 26-16 38-16h8" stroke="var(--art-line, var(--illustration-line, #bae6fd))" strokeWidth="1.5" strokeDasharray="2 5" />
      <rect x="22" y="17" width="132" height="83" rx="9" fill="var(--art-shadow, #f1f5f9)" />
      <rect x="18" y="12" width="132" height="83" rx="9" fill="var(--art-paper, white)" stroke="var(--art-edge, #cbd5e1)" strokeWidth="1.3" />
      <path d="M27 12h114a9 9 0 0 1 9 9v10H18V21a9 9 0 0 1 9-9Z" fill="var(--art-header, #f8fafc)" />
      <path d="M18 31h132" stroke="var(--art-divider, #e2e8f0)" />
      <circle cx="29" cy="22" r="2" fill="var(--art-edge, #cbd5e1)" />
      <circle cx="37" cy="22" r="2" fill="var(--art-edge, #cbd5e1)" />
      <circle cx="45" cy="22" r="2" fill="var(--art-line, var(--illustration-line, #7dd3fc))" />
      <path d="M77 22h26" stroke="var(--art-edge, #cbd5e1)" strokeWidth="2.5" />
      <path d="M37 39v47" stroke="var(--art-shadow, #f1f5f9)" />
      <g stroke="var(--art-edge, #cbd5e1)" strokeWidth="2">
        <path d="M27 45h3M27 55h3M27 65h3M27 75h3M27 85h3" />
      </g>
      <g strokeWidth="3">
        <path d="M47 45h17M70 45h24" stroke="var(--art-accent, var(--illustration-accent, #38bdf8))" />
        <path d="M55 55h29M90 55h24" stroke="var(--art-edge, #cbd5e1)" />
        <path d="M55 65h17" stroke="var(--art-line, var(--illustration-line, #7dd3fc))" />
        <path d="M79 65h31M55 75h37" stroke="var(--art-edge, #cbd5e1)" />
        <path d="M47 85h17" stroke="var(--art-accent, var(--illustration-accent, #38bdf8))" />
      </g>
      <path d="m116 48-5 5 5 5m10-10 5 5-5 5m-5-12-3 14" stroke="var(--art-ink, var(--illustration-ink, #0284c7))" strokeWidth="1.7" />
      <circle cx="148" cy="83" r="15" fill="var(--art-soft, var(--illustration-soft, #f0f9ff))" stroke="var(--art-line, var(--illustration-line, #7dd3fc))" strokeWidth="1.3" />
      <path d="m141 83 4.5 4.5 9-9" stroke="var(--art-ink, var(--illustration-ink, #0284c7))" strokeWidth="2.3" />
      <circle cx="166" cy="24" r="3" fill="var(--art-soft, var(--illustration-soft, #e0f2fe))" />
      <path d="M9 48h5m-2.5-2.5v5" stroke="var(--art-edge, #cbd5e1)" strokeWidth="1.3" />
    </svg>
  );
}

export function LearningStartIllustration({ className = '' }) {
  return (
    <svg className={`${darkArt} ${className}`} width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 83h152" stroke="var(--art-divider, #e2e8f0)" strokeWidth="1.3" />
      <path d="M28 33h46v45H28a6 6 0 0 1-6-6V39a6 6 0 0 1 6-6Z" fill="var(--art-shadow, #f1f5f9)" stroke="var(--art-edge, #cbd5e1)" strokeWidth="1.2" />
      <path d="M25 72h49" stroke="var(--art-edge, #cbd5e1)" />
      <path d="M31 26h42a3 3 0 0 1 3 3v39H31a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5Z" fill="var(--art-soft, var(--illustration-soft, #e0f2fe))" stroke="var(--art-line, var(--illustration-line, #7dd3fc))" strokeWidth="1.3" />
      <path d="M32 26v35M32 61h44M32 61a3.5 3.5 0 0 0 0 7" stroke="var(--art-line, var(--illustration-line, #7dd3fc))" strokeWidth="1.3" />
      <path d="M43 37h21M43 44h15" stroke="var(--art-accent, var(--illustration-accent, #38bdf8))" strokeWidth="2.5" />
      <path d="M58 26v10l4-2.5 4 2.5V26" fill="var(--art-accent, var(--illustration-accent, #0ea5e9))" />
      <rect x="82" y="20" width="78" height="58" rx="7" fill="var(--art-shadow, #f1f5f9)" />
      <rect x="78" y="15" width="78" height="58" rx="7" fill="var(--art-paper, white)" stroke="var(--art-edge, #cbd5e1)" strokeWidth="1.3" />
      <path d="M78 26h78" stroke="var(--art-divider, #e2e8f0)" />
      <path d="M88 21h11" stroke="var(--art-edge, #cbd5e1)" strokeWidth="2" />
      <circle cx="117" cy="45" r="12" fill="var(--art-soft, var(--illustration-soft, #f0f9ff))" stroke="var(--art-line, var(--illustration-line, #bae6fd))" />
      <path d="m114 40 8 5-8 5V40Z" fill="var(--art-accent, var(--illustration-accent, #0ea5e9))" />
      <path d="M90 63h32" stroke="var(--art-edge, #cbd5e1)" strokeWidth="2.5" />
      <path d="M128 63h16" stroke="var(--art-divider, #e2e8f0)" strokeWidth="2.5" />
      <path d="M48 97h79" stroke="var(--art-line, var(--illustration-line, #bae6fd))" strokeWidth="1.5" strokeDasharray="2 4" />
      <circle cx="48" cy="97" r="4" fill="var(--art-accent, var(--illustration-accent, #0ea5e9))" />
      <circle cx="88" cy="97" r="4" fill="var(--art-paper, white)" stroke="var(--art-accent, var(--illustration-accent, #38bdf8))" strokeWidth="1.4" />
      <circle cx="127" cy="97" r="4" fill="var(--art-paper, white)" stroke="var(--art-edge, #cbd5e1)" strokeWidth="1.4" />
      <path d="M162 43h5m-2.5-2.5v5" stroke="var(--art-line, var(--illustration-line, #bae6fd))" strokeWidth="1.3" />
    </svg>
  );
}

