import { Layers3, LayoutList, LoaderCircle, Plus, Star, Trash2 } from 'lucide-react';
import { card, focusRing } from './problemsUi';

function NavItem({ active, icon: Icon, iconClass, label, count, onClick, children }) {
  return <div className="group relative">
    <button type="button" aria-pressed={active} onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13.5px] font-medium transition-colors ${focusRing} ${active
        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
        : 'text-slate-700 hover:bg-[#f3f4f6] dark:text-zinc-200 dark:hover:bg-white/[0.05]'}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white/15 dark:bg-slate-900/10' : iconClass}`} aria-hidden="true"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null && <span className={`text-[12px] tabular-nums ${children ? 'group-hover:invisible' : ''} ${active ? 'text-white/70 dark:text-slate-900/60' : 'text-slate-400 dark:text-zinc-500'}`}>{count}</span>}
    </button>
    {children}
  </div>;
}

/** Saved lists. Lists keep their server ids; favorites stay on this device. */
export default function LibrarySidebar({ view, totalProblems, favoritesCount, lists, busyListId, onView, onCreateList, onDeleteList }) {
  return <div className={`p-3 ${card}`}>
    <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-semibold text-slate-400 dark:text-zinc-500">Library</p>
    <div className="space-y-0.5">
      <NavItem active={view.kind === 'all'} icon={LayoutList} iconClass="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" label="All questions" count={Number(totalProblems || 0).toLocaleString()} onClick={() => onView({ kind: 'all' })} />
      <NavItem active={view.kind === 'favorites'} icon={Star} iconClass="bg-amber-50 text-amber-500 dark:bg-amber-500/10 dark:text-amber-300" label="Favorites" count={favoritesCount} onClick={() => onView({ kind: 'favorites' })} />
    </div>

    <div className="mt-3 flex items-center justify-between border-t border-[#f0f1f4] px-2.5 pt-3 dark:border-white/[0.06]">
      <p className="text-[11.5px] font-semibold text-slate-400 dark:text-zinc-500">Your lists</p>
      <button type="button" onClick={onCreateList} aria-label="Create a new list" className={`flex h-6 w-6 items-center justify-center rounded-md text-slate-500 hover:bg-[#f3f4f6] hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100 ${focusRing}`}><Plus className="h-4 w-4" /></button>
    </div>
    <div className="mt-1.5 space-y-0.5">
      {lists.map((list) => <NavItem key={list._id} active={view.kind === 'list' && view.id === list._id} icon={Layers3} iconClass="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300"
        label={list.title} count={list.problemCount ?? list.problemIds?.length ?? 0} onClick={() => onView({ kind: 'list', id: list._id })}>
        <button type="button" onClick={() => onDeleteList(list)} aria-label={`Delete ${list.title}`}
          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:text-rose-500 focus:opacity-100 group-hover:opacity-100 ${focusRing}`}>
          {busyListId === list._id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      </NavItem>)}
      {!lists.length && <button type="button" onClick={onCreateList} className={`flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-[12.5px] text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:border-white/10 dark:text-zinc-400 dark:hover:text-zinc-200 ${focusRing}`}>
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />Create a practice list
      </button>}
    </div>

  </div>;
}
