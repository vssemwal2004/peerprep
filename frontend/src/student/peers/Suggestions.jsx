import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import PeerAvatar from './PeerAvatar';
import PeerActions from './PeerActions';
import { PEER_NETWORK_EVENT, peerSubtitle } from './peerNetwork';
import { DuelGlyph, InviteGlyph, MatesGlyph, PanelTitle, SparkGlyph } from './peerGlyphs';
import { card, focusRing, Skeleton } from '../dashboard/ui';

/** Classmates from your university you may want as Prep Mates (most active this week first). */
export function Suggestions({ title = 'Classmates you may know', subtitle = 'Active this week at your university' }) {
  const [state, setState] = useState({ loading: true, items: [] });
  const load = useCallback(() => api.getPeerSuggestions().then((data) => setState({ loading: false, items: data.items || [] })).catch(() => setState({ loading: false, items: [] })), []);
  useEffect(() => { load(); }, [load]);
  const patch = (id, relation) => setState((current) => ({ ...current, items: current.items.map((item) => (item.id === id ? { ...item, relation } : item)) }));
  if (!state.loading && !state.items.length) return null;
  return <section className={`${card} p-5 sm:p-6`} aria-labelledby="suggestions-title">
    <PanelTitle id="suggestions-title" glyph={SparkGlyph} tone="violet" title={title} subtitle={subtitle} />
    {state.loading ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-40" />)}</div>
      : <ul className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {state.items.map((peer) => <li key={peer.id} className="group relative flex flex-col items-center overflow-hidden rounded-2xl border border-[#eef0f3] bg-white px-4 pb-4 pt-5 text-center transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(16,24,40,0.35)] motion-reduce:transform-none dark:border-white/[0.06] dark:bg-white/[0.02]">
          <span className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-br from-violet-100 via-fuchsia-50 to-amber-50 dark:from-violet-500/15 dark:via-fuchsia-500/5 dark:to-amber-500/10" aria-hidden="true" />
          <Link to={`/student/peers/${peer.id}`} className={`relative rounded-full ${focusRing}`}><PeerAvatar name={peer.name} url={peer.avatarUrl} size="lg" className="!rounded-full ring-4 ring-white dark:ring-[#242424]" /></Link>
          <Link to={`/student/peers/${peer.id}`} className="relative mt-2 block w-full truncate text-[13.5px] font-semibold text-slate-900 hover:text-sky-700 dark:text-zinc-50 dark:hover:text-sky-300">{peer.name}</Link>
          <p className="relative w-full truncate text-[11.5px] text-slate-500 dark:text-zinc-400">{peerSubtitle(peer) || 'Student'}</p>
          <p className="relative mt-2 rounded-full bg-slate-50 px-2.5 py-0.5 text-[11.5px] text-slate-600 dark:bg-white/[0.05] dark:text-zinc-300"><b className="tabular-nums text-slate-900 dark:text-white">{peer.thisWeek}</b> solved this week</p>
          <div className="relative mt-3 w-full"><PeerActions peer={peer} relation={peer.relation} size="sm" block onRelationChange={(relation) => patch(peer.id, relation)} /></div>
        </li>)}
      </ul>}
  </section>;
}

/** First visit (no Prep Mates yet): what Prep Mates is for, three steps, and classmates to add. */
export function CircleWelcome({ onFind }) {
  const steps = [
    { Glyph: InviteGlyph, title: 'Send a request', text: 'Find a classmate and add them as a Prep Mate.' },
    { Glyph: MatesGlyph, title: 'They accept', text: 'You both see each other in your ranking.' },
    { Glyph: DuelGlyph, title: 'Compare and push', text: 'Week by week charts, streaks, topics and badges.' },
  ];
  return <section className="relative overflow-hidden rounded-3xl border border-[#ece6dc] bg-white dark:border-white/[0.07] dark:bg-[#242424]" aria-labelledby="welcome-title">
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_100%_at_0%_0%,rgba(245,158,11,0.16),transparent_65%),radial-gradient(55%_100%_at_100%_100%,rgba(14,165,233,0.14),transparent_65%)]" aria-hidden="true" />
    <div className="relative grid items-center gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">Practise together</p>
        <h2 id="welcome-title" className="mt-2 text-[26px] font-semibold leading-tight tracking-[-0.03em] text-slate-950 sm:text-[30px] dark:text-white">Build your circle of Prep Mates</h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-slate-600 dark:text-zinc-300">Add classmates from your university, see where you stand each week and compare your practice side by side. Only practice is shared.</p>
        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {steps.map(({ Glyph, title, text }, index) => <li key={title} className="rounded-2xl bg-white/80 p-4 ring-1 ring-black/[0.05] backdrop-blur dark:bg-white/[0.04] dark:ring-white/[0.06]">
            <span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white dark:bg-white dark:text-zinc-900"><Glyph className="h-4 w-4" /></span><span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500">STEP {index + 1}</span></span>
            <p className="mt-3 text-[13.5px] font-semibold text-slate-900 dark:text-white">{title}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{text}</p>
          </li>)}
        </ol>
        <button type="button" onClick={onFind} className={`mt-6 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_10px_22px_-10px_rgba(2,132,199,0.9)] hover:bg-sky-700 ${focusRing}`}>Find classmates</button>
      </div>
      <WelcomeArt />
    </div>
  </section>;
}

/** Two classmates linked by a dashed arc over a pair of rising bar groups. Decorative. */
function WelcomeArt() {
  return <svg viewBox="0 0 320 220" className="hidden h-auto w-full lg:block" aria-hidden="true" fill="none">
    <rect x="40" y="60" width="240" height="140" rx="22" className="fill-white dark:fill-white/[0.04]" stroke="currentColor" strokeOpacity=".08" />
    <path d="M60 178h200" className="stroke-slate-200 dark:stroke-white/10" strokeWidth="1.5" />
    {[0, 1, 2, 3].map((index) => <g key={index}>
      <rect x={78 + index * 46} y={150 - index * 16} width="14" height={28 + index * 16} rx="4" fill="#0284c7" />
      <rect x={95 + index * 46} y={160 - index * 12} width="14" height={18 + index * 12} rx="4" fill="#d97706" />
    </g>)}
    <path d="M86 128c30-26 64-34 102-30s58-16 72-38" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M70 40c40-34 140-34 180 0" stroke="#f59e0b" strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" />
    <circle cx="62" cy="48" r="22" fill="#0ea5e9" /><circle cx="62" cy="42" r="7" fill="white" /><path d="M50 60c3-7 7-10 12-10s9 3 12 10" fill="white" />
    <circle cx="258" cy="48" r="22" fill="#f59e0b" /><circle cx="258" cy="42" r="7" fill="white" /><path d="M246 60c3-7 7-10 12-10s9 3 12 10" fill="white" />
    <circle cx="160" cy="20" r="12" fill="#a855f7" /><path d="m160 13 1.8 3.8 4.2.6-3 2.9.7 4.1-3.7-2-3.7 2 .7-4.1-3-2.9 4.2-.6Z" fill="white" />
  </svg>;
}
