import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, Tags, X } from 'lucide-react';
import { questCategory, questTheme } from '../../student/quests/questTheme';
import { MixBar, StatusPill, primaryButton, secondaryButton } from './ui';
import { QUICKPREP_ROOT } from './useQuickPrepActions';

const dateLabel = (value) => value && Number.isFinite(+new Date(value)) ? new Date(value).toLocaleString() : 'Not set';

function TagsList({ title, values, icon: Icon, empty }) {
  return <section className="min-w-0"><h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-zinc-400"><Icon className="h-4 w-4" aria-hidden="true" />{title}</h3>
    {values?.length ? <ul className="flex flex-wrap gap-1.5">{values.map((value, index) => <li key={`${value}-${index}`} className="max-w-full whitespace-normal break-words rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-700 [overflow-wrap:anywhere] dark:bg-zinc-800 dark:text-zinc-200">{value}</li>)}</ul> : <p className="text-sm text-slate-600 dark:text-zinc-300">{empty}</p>}
  </section>;
}

export default function QuickPrepSummaryDialog({ quest, central, onClose }) {
  const dialogRef = useRef(null), closeRef = useRef(null);
  const titleId = useId();
  const theme = questTheme(quest.theme), type = questCategory(quest.category), Icon = type.icon;
  useEffect(() => {
    const dialog = dialogRef.current, opener = document.activeElement;
    const locks = [document.body, ...document.querySelectorAll('[data-app-scroll-container]')].map((node) => [node, node.style.overflow]);
    locks.forEach(([node]) => { node.style.overflow = 'hidden'; });
    if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    closeRef.current?.focus();
    const keydown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const items = [...dialog.querySelectorAll('button:not(:disabled), a[href]')];
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      dialog.close?.();
      locks.forEach(([node, overflow]) => { node.style.overflow = overflow; });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [onClose]);
  const metrics = [
    ['Questions', quest.questionCount ?? 0], ['Reward', `${quest.rewardXp ?? 0} XP`],
    ['Audience', central ? 'All universities' : `${quest.audience ?? '—'} students`],
    ['Semesters', quest.semesters?.length ? quest.semesters.map((value) => `Sem ${value}`).join(', ') : 'All semesters'],
    ...(!central ? [['Started', quest.stats?.enrolled ?? 0], ['Completed', quest.stats?.completed ?? 0], ['Average progress', `${quest.stats?.averageProgress ?? 0}%`]] : []),
    ['Badge', quest.badgeTitle || quest.badge?.title || 'Completion badge'],
  ];
  return createPortal(<dialog ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} data-platform-popup-root
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/50 dark:border-zinc-700 dark:bg-[#242424] dark:text-zinc-100"
    onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div>
      <header className="flex items-start gap-3 border-b border-slate-100 p-5 dark:border-zinc-800">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${theme.band}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-500 dark:text-zinc-400">QuickPrep details · {type.label}</p><h2 id={titleId} className="mt-1 break-words text-lg font-semibold [overflow-wrap:anywhere]">{quest.title}</h2><p className="mt-1 break-all font-mono text-xs text-slate-400">/{quest.slug}</p></div>
        <button ref={closeRef} type="button" aria-label="Close QuickPrep details" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-500 dark:hover:bg-zinc-800"><X className="h-4 w-4" /></button>
      </header>
      <div className="space-y-5 p-5">
        <StatusPill status={quest.status} />
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 [overflow-wrap:anywhere] dark:text-zinc-300">{quest.description || 'No description added.'}</p>
        <div className="grid gap-5 sm:grid-cols-2"><TagsList title="Companies" values={quest.companies} icon={Building2} empty="All companies" /><TagsList title="Topics" values={quest.topics} icon={Tags} empty="All topics" /></div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 dark:bg-zinc-900/60">{metrics.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-slate-500 dark:text-zinc-400">{label}</dt><dd className="mt-1 break-words text-sm font-semibold [overflow-wrap:anywhere]">{value}</dd></div>)}</dl>
        <section><h3 className="mb-2 text-xs font-semibold text-slate-500 dark:text-zinc-400">Question difficulty</h3><MixBar difficulty={quest.difficulty} /></section>
        {quest.unavailableCount > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">{quest.unavailableCount} questions are unavailable in the library and hidden from students.</p>}
        <dl className="grid gap-3 text-xs sm:grid-cols-3">{[['Created', quest.createdAt], ['Published', quest.publishedAt], ['Updated', quest.updatedAt]].map(([label, value]) => <div key={label}><dt className="text-slate-500 dark:text-zinc-400">{label}</dt><dd className="mt-1">{dateLabel(value)}</dd></div>)}</dl>
      </div>
      <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 p-4 dark:border-zinc-800"><button type="button" className={secondaryButton} onClick={onClose}>Close</button><Link to={`${QUICKPREP_ROOT}/${quest.id}`} className={primaryButton} onClick={onClose}>Open full sheet<ArrowUpRight className="h-4 w-4" /></Link></footer>
    </div>
  </dialog>, document.body);
}
