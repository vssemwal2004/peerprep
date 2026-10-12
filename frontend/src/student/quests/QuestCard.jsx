import { Link } from 'react-router-dom';
import { ArrowRight, Check, Sparkles } from 'lucide-react';
import { DIFFICULTY_TONES, questCategory, questPercent, questState, questTheme } from './questTheme';

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2';

/** Easy / Medium / Hard as one proportional bar, so a quest's mix reads at a glance. */
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

export default function QuestCard({ quest }) {
  const theme = questTheme(quest.theme);
  const category = questCategory(quest.category);
  const Icon = category.icon;
  const state = questState(quest);
  const percent = questPercent(quest);
  const cta = state === 'completed' ? 'Review quest' : state === 'active' ? 'Continue' : 'View quest';
  return <Link to={`/student/quests/${quest.slug}`} className={`group flex flex-col overflow-hidden rounded-2xl border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[#dcdee4] hover:shadow-[0_14px_32px_-22px_rgba(16,24,40,0.35)] motion-reduce:transform-none dark:border-white/[0.07] dark:bg-[#232325] ${focusRing}`}>
    <div className={`relative h-[92px] overflow-hidden bg-gradient-to-br ${theme.band}`}>
      <Icon className="absolute -bottom-5 -right-3 h-28 w-28 rotate-[-8deg] text-white/[0.14]" strokeWidth={1.4} aria-hidden="true" />
      <div className="relative flex h-full items-start justify-between p-4">
        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11.5px] font-medium text-white ring-1 ring-inset ring-white/25 backdrop-blur-sm">{quest.company || category.label}</span>
        {state === 'completed'
          ? <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-emerald-600 shadow" aria-label="Completed"><Check className="h-5 w-5" strokeWidth={3} /></span>
          : state === 'active' ? <ProgressRing value={percent} label={`${quest.title} progress`} /> : null}
      </div>
    </div>
    <div className="flex flex-1 flex-col p-4">
      <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-slate-950 transition-colors group-hover:text-sky-700 dark:text-zinc-50 dark:group-hover:text-sky-300">{quest.title}</h3>
      {quest.description && <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-slate-500 dark:text-zinc-400">{quest.description}</p>}
      <div className="mt-3"><DifficultyMix difficulty={quest.difficulty} total={quest.total} /></div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500 dark:text-zinc-400">
        <span><strong className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{state === 'new' ? quest.total : `${quest.solved}/${quest.total}`}</strong> questions</span>
        <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-300"><Sparkles className="h-3 w-3" aria-hidden="true" />{quest.rewardXp} XP</span>
      </p>
      <div className="mt-auto flex items-center justify-between gap-3 pt-4">
        <span className={`truncate rounded-full px-2 py-0.5 text-[11px] font-medium ${theme.soft}`} title={quest.badge?.title}>{quest.badge?.title}</span>
        <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-slate-700 transition-colors group-hover:text-sky-700 dark:text-zinc-200 dark:group-hover:text-sky-300">
          {cta}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  </Link>;
}
