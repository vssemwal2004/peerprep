/** Small, decorative SVG scenes; intentionally independent of student progress data. */
export function CodingStartIllustration({ className = '' }) {
  return (
    <svg className={className} width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 91h10c12 0 13-14 25-14h79c21 0 26-16 38-16h8" stroke="var(--illustration-line, #bae6fd)" strokeWidth="1.5" strokeDasharray="2 5" />
      <rect x="22" y="17" width="132" height="83" rx="9" fill="#f1f5f9" />
      <rect x="18" y="12" width="132" height="83" rx="9" fill="white" stroke="#cbd5e1" strokeWidth="1.3" />
      <path d="M27 12h114a9 9 0 0 1 9 9v10H18V21a9 9 0 0 1 9-9Z" fill="#f8fafc" />
      <path d="M18 31h132" stroke="#e2e8f0" />
      <circle cx="29" cy="22" r="2" fill="#cbd5e1" />
      <circle cx="37" cy="22" r="2" fill="#cbd5e1" />
      <circle cx="45" cy="22" r="2" fill="var(--illustration-line, #7dd3fc)" />
      <path d="M77 22h26" stroke="#cbd5e1" strokeWidth="2.5" />
      <path d="M37 39v47" stroke="#f1f5f9" />
      <g stroke="#cbd5e1" strokeWidth="2">
        <path d="M27 45h3M27 55h3M27 65h3M27 75h3M27 85h3" />
      </g>
      <g strokeWidth="3">
        <path d="M47 45h17M70 45h24" stroke="var(--illustration-accent, #38bdf8)" />
        <path d="M55 55h29M90 55h24" stroke="#cbd5e1" />
        <path d="M55 65h17" stroke="var(--illustration-line, #7dd3fc)" />
        <path d="M79 65h31M55 75h37" stroke="#cbd5e1" />
        <path d="M47 85h17" stroke="var(--illustration-accent, #38bdf8)" />
      </g>
      <path d="m116 48-5 5 5 5m10-10 5 5-5 5m-5-12-3 14" stroke="var(--illustration-ink, #0284c7)" strokeWidth="1.7" />
      <circle cx="148" cy="83" r="15" fill="var(--illustration-soft, #f0f9ff)" stroke="var(--illustration-line, #7dd3fc)" strokeWidth="1.3" />
      <path d="m141 83 4.5 4.5 9-9" stroke="var(--illustration-ink, #0284c7)" strokeWidth="2.3" />
      <circle cx="166" cy="24" r="3" fill="var(--illustration-soft, #e0f2fe)" />
      <path d="M9 48h5m-2.5-2.5v5" stroke="#cbd5e1" strokeWidth="1.3" />
    </svg>
  );
}

export function LearningStartIllustration({ className = '' }) {
  return (
    <svg className={className} width="180" height="110" viewBox="0 0 180 110" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 83h152" stroke="#e2e8f0" strokeWidth="1.3" />
      <path d="M28 33h46v45H28a6 6 0 0 1-6-6V39a6 6 0 0 1 6-6Z" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.2" />
      <path d="M25 72h49" stroke="#cbd5e1" />
      <path d="M31 26h42a3 3 0 0 1 3 3v39H31a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5Z" fill="var(--illustration-soft, #e0f2fe)" stroke="var(--illustration-line, #7dd3fc)" strokeWidth="1.3" />
      <path d="M32 26v35M32 61h44M32 61a3.5 3.5 0 0 0 0 7" stroke="var(--illustration-line, #7dd3fc)" strokeWidth="1.3" />
      <path d="M43 37h21M43 44h15" stroke="var(--illustration-accent, #38bdf8)" strokeWidth="2.5" />
      <path d="M58 26v10l4-2.5 4 2.5V26" fill="var(--illustration-accent, #0ea5e9)" />
      <rect x="82" y="20" width="78" height="58" rx="7" fill="#f1f5f9" />
      <rect x="78" y="15" width="78" height="58" rx="7" fill="white" stroke="#cbd5e1" strokeWidth="1.3" />
      <path d="M78 26h78" stroke="#e2e8f0" />
      <path d="M88 21h11" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="117" cy="45" r="12" fill="var(--illustration-soft, #f0f9ff)" stroke="var(--illustration-line, #bae6fd)" />
      <path d="m114 40 8 5-8 5V40Z" fill="var(--illustration-accent, #0ea5e9)" />
      <path d="M90 63h32" stroke="#cbd5e1" strokeWidth="2.5" />
      <path d="M128 63h16" stroke="#e2e8f0" strokeWidth="2.5" />
      <path d="M48 97h79" stroke="var(--illustration-line, #bae6fd)" strokeWidth="1.5" strokeDasharray="2 4" />
      <circle cx="48" cy="97" r="4" fill="var(--illustration-accent, #0ea5e9)" />
      <circle cx="88" cy="97" r="4" fill="white" stroke="var(--illustration-accent, #38bdf8)" strokeWidth="1.4" />
      <circle cx="127" cy="97" r="4" fill="white" stroke="#cbd5e1" strokeWidth="1.4" />
      <path d="M162 43h5m-2.5-2.5v5" stroke="var(--illustration-line, #bae6fd)" strokeWidth="1.3" />
    </svg>
  );
}

export function QuietScheduleIllustration({ className = '' }) {
  return (
    <svg className={className} width="80" height="64" viewBox="0 0 80 64" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <rect x="17" y="14" width="46" height="42" rx="6" fill="#f1f5f9" />
      <rect x="13" y="10" width="46" height="42" rx="6" fill="white" stroke="#cbd5e1" strokeWidth="1.3" />
      <path d="M19 10h34a6 6 0 0 1 6 6v7H13v-7a6 6 0 0 1 6-6Z" fill="var(--illustration-soft, #f0f9ff)" />
      <path d="M13 23h46" stroke="var(--illustration-line, #bae6fd)" />
      <path d="M25 7v8M47 7v8" stroke="#94a3b8" strokeWidth="2" />
      <g fill="#cbd5e1">
        <rect x="22" y="30" width="4" height="4" rx="1" />
        <rect x="34" y="30" width="4" height="4" rx="1" />
        <rect x="46" y="30" width="4" height="4" rx="1" />
        <rect x="22" y="41" width="4" height="4" rx="1" />
      </g>
      <rect x="34" y="41" width="4" height="4" rx="1" fill="var(--illustration-accent, #38bdf8)" />
      <circle cx="59" cy="48" r="10" fill="var(--illustration-soft, #f0f9ff)" stroke="var(--illustration-line, #7dd3fc)" strokeWidth="1.3" />
      <path d="m54.5 48 3 3 6-6" stroke="var(--illustration-ink, #0284c7)" strokeWidth="1.8" />
    </svg>
  );
}

export function QuietAnnouncementsIllustration({ className = '' }) {
  return (
    <svg className={className} width="80" height="64" viewBox="0 0 80 64" fill="none" aria-hidden="true" focusable="false" strokeLinecap="round" strokeLinejoin="round">
      <rect x="15" y="13" width="52" height="40" rx="6" fill="#f1f5f9" />
      <rect x="11" y="9" width="52" height="40" rx="6" fill="white" stroke="#cbd5e1" strokeWidth="1.3" />
      <path d="M18 16h38v25H18V16Z" fill="#f8fafc" stroke="#e2e8f0" />
      <path d="M23 23h13" stroke="var(--illustration-accent, #38bdf8)" strokeWidth="2.5" />
      <path d="M23 29h26M23 35h19" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M47 34h9v7l-9-7Z" fill="var(--illustration-soft, #e0f2fe)" />
      <circle cx="37" cy="16" r="3" fill="var(--illustration-accent, #0ea5e9)" />
      <path d="M25 49v7M49 49v7M20 56h10M44 56h10" stroke="#94a3b8" strokeWidth="1.5" />
      <circle cx="69" cy="19" r="2" fill="var(--illustration-line, #bae6fd)" />
    </svg>
  );
}
