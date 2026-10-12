import { Link } from 'react-router-dom';
import { ArrowRight, Award, Building2, Check, Layers, Sparkles } from 'lucide-react';
import { DIFFICULTY_TONES, questCategory, questPercent, questState, questTheme } from './questTheme';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2';

/** Easy / Medium / Hard as one proportional bar, so a set's mix reads at a glance. */
export function DifficultyMix({ difficulty, total }) {
  if (!total) return null;
  return <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]" role="img"
    aria-label={['Easy', 'Medium', 'Hard'].map((level) => `${difficulty?.[level] || 0} ${level}`).join(', ')}>
    {['Easy', 'Medium', 'Hard'].map((level) => difficulty?.[level] ? <span key={level} className={DIFFICULTY_TONES[level].bar} style={{ width: `${(difficulty[level] / total) * 100}%` }} /> : null)}
  </span>;
}

export function ProgressRing({ value, size = 44, label }) {
  const stroke = 4, radius = (size - stroke) / 2, circumference = 2 * Math.PI * radius;
  return <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
    <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="white" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - value / 100)} />
    </svg>
    <span className="text-[11.5px] font-semibold tabular-nums text-white">{value}%</span>
  </span>;
}

/**
 * A QuickPrep as a card: coloured header with its type and companies, the difficulty mix, the reward,
 * and a call to action that lifts on hover. `preview` renders it without a link (admin builder).
 */
export default function QuestCard({ quest, preview = false }) {
  const theme = questTheme(quest.theme);
  const category = questCategory(quest.category);
  const Icon = category.icon;
  const state = questState(quest);
  const percent = questPercent(quest);
  const companies = quest.companies?.length ? quest.companies : quest.company ? [quest.company] : [];
  const cta = state === 'completed' ? 'Review' : state === 'active' ? 'Continue' : 'Start QuickPrep';
  const Wrapper = preview ? 'div' : Link;
  const wrapperProps = preview ? {} : { to: `/student/quickprep/${quest.slug}` };
  return <Wrapper {...wrapperProps} className={`group relative flex flex-col overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_22px_44px_-24px_rgba(15,23,42,0.45)] motion-reduce:transform-none dark:border-white/[0.07] dark:bg-[#232325] ${focusRing}`}>
    <div className={`relative h-[108px] overflow-hidden bg-gradient-to-br ${theme.band}`}>
      <span className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.8)_1px,transparent_1px)] [background-size:14px_14px]" aria-hidden="true" />
      <Icon className="absolute -bottom-6 -right-3 h-32 w-32 rotate-[-8deg] text-white/[0.16] transition-transform duration-500 group-hover:rotate-[-2deg] group-hover:scale-110 motion-reduce:transition-none" strokeWidth={1.3} aria-hidden="true" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-semibold text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm"><Icon className="h-3.5 w-3.5" aria-hidden="true" />{category.label}</span>
          {state === 'completed'
            ? <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-600 shadow-lg" aria-label="Completed"><Check className="h-5 w-5" strokeWidth={3} /></span>
            : state === 'active' ? <ProgressRing value={percent} label={`${quest.title} progress`} /> : null}
        </div>
        {companies.length > 0 && <div className="flex flex-wrap gap-1">
          {companies.slice(0, 3).map((name) => <span key={name} className="inline-flex items-center gap-1 rounded-md bg-slate-950/25 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm"><Building2 className="h-3 w-3" aria-hidden="true" />{name}</span>)}
          {companies.length > 3 && <span className="rounded-md bg-slate-950/25 px-1.5 py-0.5 text-[11px] font-semibold text-white">+{companies.length - 3}</span>}
        </div>}
      </div>
    </div>
    <div className="flex flex-1 flex-col p-4">
      <h3 className="line-clamp-2 text-[16.5px] font-semibold leading-snug tracking-[-0.015em] text-slate-950 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300">{quest.title}</h3>
      {quest.description && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{quest.description}</p>}
      {quest.topics?.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1">
        {quest.topics.slice(0, 3).map((topic) => <span key={topic} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-zinc-300">{topic}</span>)}
        {quest.topics.length > 3 && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-white/[0.06] dark:text-zinc-400">+{quest.topics.length - 3}</span>}
      </div>}
      <div className="mt-3.5"><DifficultyMix difficulty={quest.difficulty} total={quest.total} /></div>
      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[12px]">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white/[0.04]"><dt className="flex items-center gap-1 text-[10.5px] text-slate-500 dark:text-zinc-400"><Layers className="h-3 w-3" aria-hidden="true" />Questions</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{state === 'new' ? quest.total : `${quest.solved}/${quest.total}`}</dd></div>
        <div className="rounded-lg bg-amber-50/70 px-2 py-1.5 dark:bg-amber-500/[0.07]"><dt className="flex items-center gap-1 text-[10.5px] text-amber-700/80 dark:text-amber-300/80"><Sparkles className="h-3 w-3" aria-hidden="true" />Reward</dt><dd className="mt-0.5 font-semibold tabular-nums text-amber-700 dark:text-amber-300">{quest.rewardXp} XP</dd></div>
        <div className={`min-w-0 rounded-lg px-2 py-1.5 ${theme.soft}`}><dt className="flex items-center gap-1 text-[10.5px] opacity-80"><Award className="h-3 w-3" aria-hidden="true" />Badge</dt><dd className="mt-0.5 truncate font-semibold" title={quest.badge?.title}>{quest.badge?.title || '—'}</dd></div>
      </dl>
      <div className="mt-auto pt-4">
        <span className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${state === 'completed' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-slate-900 text-white group-hover:bg-sky-600 dark:bg-white dark:text-slate-900 dark:group-hover:bg-sky-400'}`}>
          {cta}<ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
        </span>
      </div>
    </div>
  </Wrapper>;
}
