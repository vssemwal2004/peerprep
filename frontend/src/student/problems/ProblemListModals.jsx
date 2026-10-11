import { useState } from 'react';
import { Check, Layers3, LoaderCircle, Lock, Plus, Star, X } from 'lucide-react';
import { fieldBase, focusRing } from './problemsUi';

const dialog = 'w-full rounded-2xl border border-[#e9eaee] bg-white shadow-[0_32px_64px_-32px_rgba(16,24,40,0.45)] dark:border-white/[0.08] dark:bg-[#232325]';
const closeButton = `rounded-lg p-2 text-slate-500 hover:bg-[#f3f4f6] dark:text-zinc-400 dark:hover:bg-white/[0.06] ${focusRing}`;

export function CreateListModal({ busy, onClose, onCreate }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="create-list-title" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (title.trim()) onCreate({ title: title.trim(), description: description.trim(), isPrivate }); }} className={`max-w-xl p-6 ${dialog}`}>
      <div className="flex items-center justify-between"><h2 id="create-list-title" className="text-[18px] font-semibold tracking-[-0.01em]">Create a practice list</h2><button type="button" onClick={onClose} aria-label="Close" className={closeButton}><X className="h-5 w-5" /></button></div>
      <label className="mt-6 block text-[13px] font-medium">Title<div className="relative mt-2"><input autoFocus value={title} maxLength={30} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Graphs before placements" className={`h-11 w-full px-4 pr-16 ${fieldBase}`} /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs tabular-nums text-slate-400">{title.length}/30</span></div></label>
      <label className="mt-5 block text-[13px] font-medium">Description<div className="relative mt-2"><textarea value={description} maxLength={150} onChange={(event) => setDescription(event.target.value)} placeholder="What is this list for?" rows={4} className={`h-auto w-full resize-none px-4 py-3 pb-8 ${fieldBase}`} /><span className="absolute bottom-3 right-4 text-xs tabular-nums text-slate-400">{description.length}/150</span></div></label>
      <label className="mt-5 flex items-center gap-3 text-[13px] font-medium"><input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="h-4 w-4 accent-sky-600" /><Lock className="h-4 w-4 text-slate-400" aria-hidden="true" />Private</label>
      <div className="mt-7 flex justify-end gap-3"><button type="button" onClick={onClose} className={`rounded-xl bg-[#f3f4f6] px-5 py-2.5 text-[13px] font-medium dark:bg-white/[0.07] ${focusRing}`}>Cancel</button><button type="submit" disabled={busy || !title.trim()} className={`rounded-xl bg-slate-900 px-5 py-2.5 text-[13px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-slate-900 ${focusRing}`}>{busy ? 'Creating…' : 'Create list'}</button></div>
    </form>
  </div>;
}

export function SaveToListsModal({ problem, favorites, lists, busyListId, onClose, onFavorite, onMembership, onNewList }) {
  const problemId = String(problem.listId || problem._id);
  const row = `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f3f4f6] disabled:opacity-50 dark:hover:bg-white/[0.05] ${focusRing}`;
  return <div className="fixed inset-0 z-[145] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="save-list-title" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`max-w-md p-5 ${dialog}`}>
      <div className="flex items-center justify-between"><div className="min-w-0"><h2 id="save-list-title" className="text-[17px] font-semibold">Save to a list</h2><p className="mt-1 truncate text-xs text-slate-400">{problem.title}</p></div><button type="button" onClick={onClose} aria-label="Close" className={closeButton}><X className="h-5 w-5" /></button></div>
      <div className="mt-4 max-h-72 space-y-0.5 overflow-y-auto">
        <button type="button" onClick={onFavorite} className={row}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10"><Star className={`h-4 w-4 ${favorites.includes(problemId) ? 'fill-amber-400 text-amber-400' : 'text-amber-400'}`} /></span><span className="flex-1 text-[13.5px] font-medium">Favorites</span>{favorites.includes(problemId) && <Check className="h-4 w-4 text-emerald-500" />}</button>
        {lists.map((list) => { const included = list.problemIds.includes(problemId); return <button key={list._id} type="button" disabled={busyListId === list._id} onClick={() => onMembership(list, !included)} className={row}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-50 text-violet-500 dark:bg-violet-500/10"><Layers3 className="h-4 w-4" /></span><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{list.title}</span>{busyListId === list._id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : included ? <Check className="h-4 w-4 text-emerald-500" /> : null}</button>; })}
        {!lists.length && <p className="px-3 py-5 text-center text-[13px] text-slate-400">Create your first practice list.</p>}
      </div>
      <button type="button" onClick={onNewList} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-2.5 text-[13px] font-medium text-slate-600 hover:border-slate-400 dark:border-white/15 dark:text-zinc-300 ${focusRing}`}><Plus className="h-4 w-4" />New list</button>
    </div>
  </div>;
}
