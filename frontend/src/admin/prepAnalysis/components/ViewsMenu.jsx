import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, Check, Loader2, Save, Share2, Trash2, Users } from "lucide-react";
import { prepAnalysisApi } from "../api";
import { useToasts } from "./Toasts";
import { Button, IconButton, Popover, focusRing, inputClass } from "./ui";

/**
 * Saved views: the current filters, period and charts under a name. Open one in a click; your
 * own views can be updated, shared with other admins, or deleted.
 */
export default function ViewsMenu({ area, state, layout, onApply }) {
  const toasts = useToasts();
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [views, setViews] = useState(null);
  const [limit, setLimit] = useState(50);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState("");
  const [active, setActive] = useState(null);

  const load = useCallback(() => {
    prepAnalysisApi.views.list()
      .then((result) => { setViews(result.views || []); setLimit(result.limit || 50); })
      .catch((error) => { setViews([]); toasts.show({ tone: "error", title: "Views could not load", text: error.message }); });
  }, [toasts]);
  useEffect(() => { if (open && views === null) load(); }, [load, open, views]);

  const run = async (label, work) => {
    setBusy(label);
    try { await work(); } catch (error) { toasts.show({ tone: "error", title: "Could not save the view", text: error.message }); } finally { setBusy(""); }
  };
  const save = () => run("save", async () => {
    const view = await prepAnalysisApi.views.create({ name: name.trim(), area, state, layout });
    setViews((current) => [view, ...(current || [])]);
    setActive(view.id);
    setName("");
    toasts.show({ title: `Saved “${view.name}”` });
  });
  const overwrite = (view) => run(`update:${view.id}`, async () => {
    const saved = await prepAnalysisApi.views.update(view.id, { area, state, layout });
    setViews((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
    toasts.show({ title: `Updated “${saved.name}”` });
  });
  const share = (view) => run(`share:${view.id}`, async () => {
    const saved = await prepAnalysisApi.views.update(view.id, { shared: !view.shared });
    setViews((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
    toasts.show({ title: saved.shared ? `“${saved.name}” is shared with other admins` : `“${saved.name}” is private again` });
  });
  const remove = (view) => run(`delete:${view.id}`, async () => {
    await prepAnalysisApi.views.remove(view.id);
    setViews((current) => current.filter((entry) => entry.id !== view.id));
    if (active === view.id) setActive(null);
    toasts.show({ title: `Deleted “${view.name}”` });
  });
  const openView = (view) => { onApply(view); setActive(view.id); setOpen(false); toasts.show({ title: `Opened “${view.name}”` }); };

  const mine = (views || []).filter((view) => view.mine);
  const shared = (views || []).filter((view) => !view.mine);
  const row = (view) => (
    <li key={view.id} className="group flex items-center gap-1 rounded-lg px-1 hover:bg-slate-100 dark:hover:bg-white/[0.05]">
      <button type="button" onClick={() => openView(view)} className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1.5 text-left ${focusRing}`}>
        {active === view.id ? <Check className="h-3.5 w-3.5 shrink-0 text-sky-600" /> : <Bookmark className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{view.name}</span>
          {!view.mine && <span className="block truncate text-[10.5px] text-slate-400">by {view.ownerName || "another admin"}</span>}
        </span>
        {view.mine && view.shared && <Users className="h-3 w-3 shrink-0 text-sky-500" aria-label="Shared" />}
      </button>
      {view.mine && (
        <span className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <IconButton label="Save the current page into this view" onClick={() => overwrite(view)} disabled={Boolean(busy)}>{busy === `update:${view.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}</IconButton>
          <IconButton label={view.shared ? "Stop sharing" : "Share with other admins"} onClick={() => share(view)} disabled={Boolean(busy)}><Share2 className={`h-3.5 w-3.5 ${view.shared ? "text-sky-600" : ""}`} /></IconButton>
          <IconButton label="Delete" onClick={() => remove(view)} disabled={Boolean(busy)} className="hover:!text-rose-600"><Trash2 className="h-3.5 w-3.5" /></IconButton>
        </span>
      )}
    </li>
  );

  return (
    <>
      <span ref={anchorRef} className="inline-flex"><Button onClick={() => setOpen(true)} title="Saved views" aria-label="Saved views"><Bookmark className="h-3.5 w-3.5" /><span className="hidden 2xl:inline">Views</span></Button></span>
      <Popover open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} minWidth={320} maxHeight={480} label="Saved views">
        <form className="flex gap-2 border-b border-slate-100 p-2.5 dark:border-gray-800" onSubmit={(event) => { event.preventDefault(); if (name.trim()) save(); }}>
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Name this view, e.g. Sem 5 CSE" className={inputClass} aria-label="View name" />
          <Button type="submit" tone="primary" disabled={!name.trim() || Boolean(busy) || mine.length >= limit}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Save</Button>
        </form>
        <div className="min-h-0 overflow-y-auto p-1.5">
          {views === null ? <p className="flex items-center justify-center gap-2 p-4 text-[12px] text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p> : (
            <>
              <p className="px-2 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">My views</p>
              {mine.length ? <ul>{mine.map(row)}</ul> : <p className="px-2 pb-2 text-[12px] text-slate-500">Save the filters and charts you use often.</p>}
              {shared.length > 0 && <><p className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-400">Shared by other admins</p><ul>{shared.map(row)}</ul></>}
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
