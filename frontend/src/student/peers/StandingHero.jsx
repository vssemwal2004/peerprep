import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import PeerAvatar from './PeerAvatar';
import { compactCount } from './peerNetwork';
import { CrestGlyph, InviteGlyph, MatesGlyph, PulseGlyph, SpectrumGlyph } from './peerGlyphs';
import { YOU_COLOR } from './circleViz';
import { PERIODS } from './circleMath';
import { useWidth } from './useWidth';
import { focusRing, Skeleton } from '../dashboard/ui';
import GuideInfo from '../../guide/platform/GuideInfo';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Student';
const binLabel = (bin) => (bin.from === bin.to ? String(bin.from) : `${bin.from}–${bin.to}`);

export function PeriodTabs({ period, onPeriod }) {
  return <div data-guide="pm-period" className="flex shrink-0 rounded-xl bg-white/70 p-0.5 ring-1 ring-inset ring-black/[0.05] backdrop-blur dark:bg-white/[0.06] dark:ring-white/[0.06]" role="tablist" aria-label="Ranking period">
    {PERIODS.map((item) => <button key={item.key} type="button" role="tab" aria-selected={period === item.key} onClick={() => onPeriod(item.key)}
      className={`rounded-[10px] px-3 py-1.5 text-[12px] font-semibold transition ${focusRing} ${period === item.key ? 'bg-slate-900 text-white shadow-sm dark:bg-white dark:text-zinc-900' : 'text-slate-600 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-100'}`}>{item.label}</button>)}
  </div>;
}

/** How many Prep Mates solved how many problems, with your bar picked out. */
function Distribution({ distribution, phrase }) {
  const [ref, width] = useWidth(420);
  const [hover, setHover] = useState(null);
  const bins = distribution?.bins || [];
  if (!bins.length) return null;
  const height = 150;
  const pad = { top: 26, bottom: 22 };
  const plotH = height - pad.top - pad.bottom;
  const slot = width / bins.length;
  const barW = Math.max(4, Math.min(34, slot - 6));
  const max = Math.max(1, ...bins.map((bin) => bin.count));
  const youBin = distribution.youBin;
  const labelled = new Set([0, bins.length - 1, youBin]);
  const shown = hover ?? youBin;
  return <div ref={ref} className="relative">
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full overflow-visible" role="img"
      aria-label={`Prep Mates by problems solved ${phrase}: ${bins.map((bin) => `${bin.count} solved ${binLabel(bin)}`).join(', ')}. You are in ${binLabel(bins[youBin])}.`}>
      <defs>
        <linearGradient id="standing-you" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#38bdf8" /><stop offset="1" stopColor={YOU_COLOR} /></linearGradient>
      </defs>
      <line x1="0" x2={width} y1={pad.top + plotH} y2={pad.top + plotH} className="stroke-slate-200 dark:stroke-white/[0.08]" />
      {bins.map((bin, index) => {
        const h = bin.count ? Math.max(4, (bin.count / max) * plotH) : 0;
        const x = index * slot + (slot - barW) / 2;
        const top = pad.top + plotH - h;
        const you = index === youBin;
        const r = Math.min(5, barW / 2, h);
        return <g key={bin.from} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
          <rect x={index * slot} y={0} width={slot} height={height} fill="transparent" />
          {h > 0 && <path d={`M${x},${pad.top + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${pad.top + plotH} Z`}
            fill={you ? 'url(#standing-you)' : undefined} className={you ? '' : hover === index ? 'fill-slate-400 dark:fill-zinc-500' : 'fill-slate-200 dark:fill-zinc-700'} />}
          {you && <g transform={`translate(${x + barW / 2}, ${top - 8})`}>
            <rect x="-17" y="-15" width="34" height="16" rx="8" fill={YOU_COLOR} />
            <text y="-4" textAnchor="middle" className="fill-white text-[10px] font-bold">You</text>
          </g>}
          {labelled.has(index) && <text x={x + barW / 2} y={height - 5} textAnchor="middle" className={`text-[10.5px] tabular-nums ${you ? 'fill-sky-700 font-semibold dark:fill-sky-300' : 'fill-slate-400 dark:fill-zinc-500'}`}>{binLabel(bin)}</text>}
        </g>;
      })}
    </svg>
    <p className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400" aria-live="polite">
      <b className="text-slate-900 dark:text-white">{compactCount(bins[shown]?.count || 0)}</b> {bins[shown]?.count === 1 ? 'person' : 'people'} solved <b className="text-slate-900 dark:text-white">{binLabel(bins[shown] || bins[0])}</b> {phrase}{shown === youBin ? ', like you' : ''}
    </p>
  </div>;
}

function LadderRow({ person, tone, label, chip, compare }) {
  const you = tone === 'you';
  return <li className={`relative flex items-center gap-3 rounded-2xl px-3 py-2.5 ${you ? 'bg-white shadow-[0_8px_24px_-14px_rgba(2,132,199,0.55)] ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-400/25' : ''}`}>
    <span className="w-8 shrink-0 text-center text-[13px] font-bold tabular-nums text-slate-500 dark:text-zinc-400">#{person.rank}</span>
    <PeerAvatar name={person.name} url={person.avatarUrl} size="sm" className="!rounded-full" />
    <div className="min-w-0 flex-1">
      <p className={`truncate text-[13px] ${you ? 'font-semibold text-sky-800 dark:text-sky-200' : 'font-medium text-slate-800 dark:text-zinc-100'}`}>{label}</p>
      <p className="text-[11.5px] tabular-nums text-slate-500 dark:text-zinc-400">{person.solved} solved</p>
    </div>
    {chip}
    {compare && <Link to={`/student/peers/${person.id}/compare`} className={`hidden rounded-lg px-2 py-1 text-[11.5px] font-semibold text-sky-700 hover:bg-sky-50 sm:inline-flex dark:text-sky-300 dark:hover:bg-white/[0.06] ${focusRing}`}>Compare</Link>}
  </li>;
}

/**
 * The top of the Prep Mates page: your rank and top percentage for the period, who is just above and
 * below you, where everyone stands (histogram), and three quick counts. Works the same for 3 or
 * 3,000 Prep Mates because the server sends a summary, not the whole list.
 */
export default function StandingHero({ circle, summary }) {
  const data = circle.data;
  const period = PERIODS.find((item) => item.key === circle.period) || PERIODS[0];
  const you = data?.you;
  const faces = (data?.podium || []).filter((row) => !row.isYou).slice(0, 4);
  const practisedShare = data?.mates ? (data.practisedToday / data.mates) * 100 : 0;
  const ring = 2 * Math.PI * 15;

  return <section data-guide="pm-standing" className="relative overflow-hidden rounded-3xl border border-[#ece6dc] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/[0.07] dark:bg-[#242424]" aria-labelledby="standing-title">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_90%_at_0%_0%,rgba(245,158,11,0.16),transparent_65%),radial-gradient(50%_90%_at_100%_10%,rgba(14,165,233,0.12),transparent_65%)]" aria-hidden="true" />
    <div className="relative grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="standing-title" className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300"><CrestGlyph className="h-4 w-4" />Your standing<GuideInfo step="pm-standing" /></h2>
          <PeriodTabs period={circle.period} onPeriod={circle.setPeriod} />
        </div>
        {!data ? <Skeleton className="mt-5 h-40" /> : <>
          <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
            <p className="text-[60px] font-bold leading-[0.9] tracking-[-0.05em] tabular-nums text-slate-950 dark:text-white">#{you?.rank ?? '–'}</p>
            <div className="pb-1">
              <p className="text-[14px] font-medium text-slate-600 dark:text-zinc-300">of {compactCount(data.total)} <span className="text-slate-400 dark:text-zinc-500">· you and your Prep Mates</span></p>
              {data.topPercent && <span className="mt-1 inline-flex items-center rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 py-0.5 text-[11.5px] font-bold text-white shadow-sm">Top {data.topPercent}%</span>}
            </div>
          </div>
          <p className="mt-3 text-[13px] text-slate-500 dark:text-zinc-400">You solved <b className="text-slate-900 dark:text-white">{you?.solved ?? 0}</b> {period.phrase} · median <b className="text-slate-900 dark:text-white">{data.median}</b></p>
          <ol className="relative mt-4 space-y-1" aria-label="Who is around you" data-guide="pm-around">
            <span className="absolute bottom-6 left-[27px] top-6 w-px bg-gradient-to-b from-amber-300 via-sky-300 to-slate-200 dark:from-amber-500/40 dark:via-sky-500/40 dark:to-white/10" aria-hidden="true" />
            {data.ahead ? <LadderRow person={data.ahead} label={data.ahead.name} compare
              chip={<span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">{data.ahead.toPass} to pass</span>} />
              : <li className="rounded-2xl px-3 py-2 text-[12.5px] font-medium text-amber-800 dark:text-amber-300">No one is ahead of you {period.phrase}. Keep the lead.</li>}
            {you && <LadderRow person={you} tone="you" label="You" />}
            {data.behind && <LadderRow person={data.behind} label={data.behind.name} compare
              chip={<span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200">you lead by {data.behind.lead}</span>} />}
          </ol>
        </>}
      </div>

      <div data-guide="pm-distribution" className="border-t border-black/[0.05] p-5 sm:p-6 lg:border-l lg:border-t-0 dark:border-white/[0.06]">
        <div className="flex items-center gap-2">
          <SpectrumGlyph className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-sky-800 dark:text-sky-300">Where everyone stands</h3>
          <GuideInfo step="pm-distribution" />
        </div>
        <p className="mt-1 text-[12.5px] text-slate-500 dark:text-zinc-400">Prep Mates grouped by problems solved {period.phrase}</p>
        <div className="mt-3">{data ? <Distribution distribution={data.distribution} phrase={period.phrase} /> : <Skeleton className="h-40" />}</div>
      </div>
    </div>

    <dl data-guide="pm-counts" className="relative grid grid-cols-1 border-t border-black/[0.05] bg-white/55 backdrop-blur sm:grid-cols-3 dark:border-white/[0.06] dark:bg-white/[0.02]">
      <Link to="/student/peers#my-prep-mates" className={`flex items-center gap-3 px-5 py-3.5 transition hover:bg-white/70 dark:hover:bg-white/[0.03] ${focusRing}`}>
        <span className="flex -space-x-2" aria-hidden="true">
          {faces.length ? faces.map((row) => <PeerAvatar key={row.id} name={row.name} url={row.avatarUrl} size="sm" className="!h-8 !w-8 !rounded-full ring-2 ring-white dark:ring-[#242424]" />)
            : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"><MatesGlyph className="h-4 w-4" /></span>}
        </span>
        <div><dt className="text-[11.5px] text-slate-500 dark:text-zinc-400">Prep Mates</dt><dd className="text-[18px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{compactCount(summary?.prepMates ?? data?.mates ?? 0)}</dd></div>
      </Link>
      <div className="flex items-center gap-3 border-t border-black/[0.05] px-5 py-3.5 sm:border-l sm:border-t-0 dark:border-white/[0.06]">
        <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-emerald-100 dark:stroke-emerald-500/15" />
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-emerald-500" strokeDasharray={`${(practisedShare / 100) * ring} ${ring}`} />
        </svg>
        <div><dt className="flex items-center gap-1 text-[11.5px] text-slate-500 dark:text-zinc-400"><PulseGlyph className="h-3.5 w-3.5 text-emerald-500" />Practised today</dt>
          <dd className="text-[18px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{data?.practisedToday ?? 0}<span className="ml-1 text-[12px] font-medium text-slate-400 dark:text-zinc-500">of {compactCount(data?.mates ?? 0)}</span></dd></div>
      </div>
      <Link to="/student/peers?tab=incoming#my-prep-mates" className={`flex items-center gap-3 border-t border-black/[0.05] px-5 py-3.5 transition hover:bg-white/70 sm:border-l sm:border-t-0 dark:border-white/[0.06] dark:hover:bg-white/[0.03] ${focusRing}`}>
        <span className={`relative flex h-9 w-9 items-center justify-center rounded-full ${summary?.incomingRequests ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400'}`} aria-hidden="true">
          <InviteGlyph className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1"><dt className="text-[11.5px] text-slate-500 dark:text-zinc-400">Requests waiting</dt><dd className="text-[18px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{compactCount(summary?.incomingRequests ?? 0)}</dd></div>
        {summary?.incomingRequests > 0 && <span className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-rose-600 dark:text-rose-300">Review<ArrowRight className="h-3.5 w-3.5" /></span>}
      </Link>
    </dl>
    {data?.ahead && <p className="sr-only">{`${firstName(data.ahead.name)} is ${data.ahead.toPass} solves away.`}</p>}
  </section>;
}
