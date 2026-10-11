import { BadgeCheck, RefreshCw, Route } from 'lucide-react';
import { AnviWordmark } from '../../components/AnviApproach';

// What "Ask AnvI" does inside a problem today: one approach at a time, from instructor-approved directions.
const CAPABILITIES = [
  { icon: Route, label: 'One focused approach' },
  { icon: RefreshCw, label: 'A fresh angle on request' },
  { icon: BadgeCheck, label: 'Instructor-approved' },
];

/** A single compact row: the Anvi wordmark, what it does, and where to find it. */
export default function AnviHero() {
  return <section aria-label="Anvi AI coding guide" className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c0b1d] text-white shadow-[0_14px_32px_-24px_rgba(76,29,149,0.65)]">
    <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(520px_160px_at_8%_-40%,rgba(139,92,246,0.42),transparent_70%),radial-gradient(480px_180px_at_94%_160%,rgba(34,211,238,0.26),transparent_70%)]" />
    <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(60%_140%_at_25%_0%,black,transparent)]" />
    <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/60 to-transparent" />
    <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:px-5">
      <AnviWordmark tone="dark" className="h-8 w-32 shrink-0" />
      <span aria-hidden="true" className="hidden h-8 w-px bg-white/10 sm:block" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-semibold text-white">Your AI coding guide for a focused next step.</p>
        <p className="flex items-center gap-1.5 text-[12px] text-violet-100/65">
          <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="truncate">Inside every coding problem: press Ask AnvI for a direction to try, not a full solution.</span>
        </p>
      </div>
      <ul className="hidden flex-wrap gap-1.5 md:flex">
        {CAPABILITIES.map(({ icon: Icon, label }) => <li key={label} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-violet-50 ring-1 ring-inset ring-white/10">
          <Icon className="h-3 w-3 text-cyan-300" aria-hidden="true" />{label}
        </li>)}
      </ul>
    </div>
  </section>;
}
