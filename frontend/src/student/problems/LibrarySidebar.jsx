import { FolderHeart, LibraryBig, LoaderCircle, Plus, Star, Trash2 } from 'lucide-react';
import { card, focusRing } from './problemsUi';
import GuideInfo from '../../guide/platform/GuideInfo';

function NavItem({ active, icon: Icon, iconClass, label, count, onClick, children }) {
  return <div className="group relative">
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-[13.5px] font-semibold transition-colors ${focusRing} ${active
        ? 'bg-violet-50 text-violet-900 ring-1 ring-inset ring-violet-200 dark:bg-violet-500/10 dark:text-violet-100 dark:ring-violet-400/25'
        : 'text-slate-700 hover:bg-[#f6f7f9] dark:text-zinc-200 dark:hover:bg-white/[0.04]'}`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br text-white ${iconClass}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className={`rounded-full px-1.5 text-[11.5px] tabular-nums ${children ? 'group-hover:invisible' : ''} ${active ? 'bg-violet-100 font-semibold text-violet-700 dark:bg-violet-500/20 dark:text-violet-200' : 'font-medium text-slate-400 dark:text-zinc-500'}`}>{count}</span>}
    </button>
    {children}
  </div>;
}

/** Saved lists. Lists keep their server ids; favorites stay on this device. */
export default function LibrarySidebar({ view, totalProblems, favoritesCount, lists, busyListId, onView, onCreateList, onDeleteList }) {
  return <div data-guide="pc-library" className={`p-3 ${card}`}>
    <p className="flex items-center gap-1.5 px-2 pb-2 pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">Library<GuideInfo step="pc-library" /></p>
    <div className="space-y-0.5">
      <NavItem active={view.kind === 'all'} icon={LibraryBig} iconClass="from-violet-500 to-indigo-600 shadow-[0_6px_14px_-8px_rgba(109,40,217,0.9)]" label="All questions" count={Number(totalProblems || 0).toLocaleString()} onClick={() => onView({ kind: 'all' })} />
      <NavItem active={view.kind === 'favorites'} icon={Star} iconClass="from-amber-400 to-orange-500 shadow-[0_6px_14px_-8px_rgba(245,158,11,0.9)]" label="Favorites" count={favoritesCount} onClick={() => onView({ kind: 'favorites' })} />
    </div>

    <div className="mt-3 flex items-center justify-between border-t border-[#f0f1f4] px-2 pt-3 dark:border-white/[0.06]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-zinc-400">Your lists</p>
      <button type="button" onClick={onCreateList} aria-label="Create a new list" className={`flex h-6 w-6 items-center justify-center rounded-md text-violet-600 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-500/10 ${focusRing}`}><Plus className="h-4 w-4" /></button>
    </div>
    <div className="mt-1.5 space-y-0.5">
      {lists.map((list) => <NavItem key={list._id} active={view.kind === 'list' && view.id === list._id} icon={FolderHeart} iconClass="from-sky-400 to-cyan-600 shadow-[0_6px_14px_-8px_rgba(14,165,233,0.9)]"
        label={list.title} count={list.problemCount ?? list.problemIds?.length ?? 0} onClick={() => onView({ kind: 'list', id: list._id })}>
        <button type="button" onClick={() => onDeleteList(list)} aria-label={`Delete ${list.title}`}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:text-rose-500 focus:opacity-100 group-hover:opacity-100 ${focusRing}`}>
          {busyListId === list._id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </NavItem>)}
      {!lists.length && <button type="button" onClick={onCreateList} className={`flex w-full items-center gap-2 rounded-xl border border-dashed border-violet-200 px-3 py-2.5 text-[12.5px] font-medium text-violet-700 hover:border-violet-300 hover:bg-violet-50/50 dark:border-violet-400/25 dark:text-violet-300 dark:hover:bg-violet-500/10 ${focusRing}`}>
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />Create a practice list
      </button>}
    </div>

  </div>;
}
