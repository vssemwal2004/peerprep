import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { ArrowRight, CheckCircle, Copy, Download, Loader2, Mail, Pencil, Trash2, XCircle } from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../../admin/coordinatorPermissions';
import InterviewBrowser from './InterviewBrowser';
import { interviewActionIds } from './interviewListActions';

const input = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-200 dark:border-gray-700 dark:bg-gray-950 dark:text-white';
const toLocal = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function ActionDialog({ task, busy, error, onClose, onConfirm }) {
  const dialog = useRef(null);
  const [fields, setFields] = useState({ name: task.event.name || '', description: task.event.description || '', startDate: toLocal(task.event.startDate), endDate: toLocal(task.event.endDate) });
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  const titles = { edit: 'Edit interview', invitations: 'Send invitations', published: 'Publish interview', completed: 'Mark as complete', cancelled: 'Cancel interview', delete: 'Delete interview' };
  const explanations = { invitations: 'Invitation emails will be queued for all assigned students. Students who already received an invitation may receive it again.', published: 'The draft will become published under its current access rules. This status action does not assign students, generate pairs, or send invitations. Review the roster in interview details before sending invitations.', completed: 'This round will be marked completed. Its interview records and feedback will be kept.', cancelled: 'This changes the interview status to cancelled. No cancellation email is sent by this status action.', delete: 'This permanently deletes the interview, pairs, slot proposals, participant assignments, and feedback. Cancellation emails will be queued for eligible students. This cannot be undone.' };
  return createPortal(<dialog ref={dialog} aria-labelledby="interview-action-title" onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }} className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-slate-950/40 dark:border-gray-700 dark:bg-gray-900">
    <form onSubmit={(e) => { e.preventDefault(); onConfirm(fields); }}>
      <div className="border-b border-slate-200 p-5 dark:border-gray-800"><h2 id="interview-action-title" className="text-base font-semibold text-slate-900 dark:text-white">{titles[task.kind]}</h2><p className="mt-1 truncate text-xs text-slate-500" title={task.event.name}>{task.event.name}</p></div>
      <fieldset disabled={busy} className="max-h-[60dvh] space-y-4 overflow-auto p-5">
        {task.kind === 'edit' ? <>
          <label className="block text-xs font-medium text-slate-600 dark:text-gray-300">Interview name<input autoFocus required value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} className={input + ' mt-1.5'} /></label>
          <label className="block text-xs font-medium text-slate-600 dark:text-gray-300">Student instructions<textarea rows={4} value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} className={input + ' mt-1.5'} /></label>
          <div className="grid gap-3 sm:grid-cols-2">{['startDate', 'endDate'].map((key) => <label key={key} className="block text-xs font-medium text-slate-600 dark:text-gray-300">{key === 'startDate' ? 'Starts' : 'Ends'}<input type="datetime-local" value={fields[key]} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} className={input + ' mt-1.5'} /></label>)}</div>
          <p className="text-xs text-slate-500">Times use {Intl.DateTimeFormat().resolvedOptions().timeZone}. Editing does not resend invitations or change existing pair slots.</p>
        </> : <p className="text-sm leading-relaxed text-slate-600 dark:text-gray-300">{explanations[task.kind]}</p>}
        {task.kind === 'delete' && <label className="block text-xs font-medium text-slate-600 dark:text-gray-300">Type the interview name to confirm<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={input + ' mt-1.5'} autoComplete="off" /></label>}
        {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-gray-800"><button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300">Keep unchanged</button><button type="submit" disabled={busy || (task.kind === 'delete' && confirmation !== task.event.name)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 ${['delete', 'cancelled'].includes(task.kind) ? 'bg-rose-600' : 'bg-sky-600'}`}>{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{busy ? 'Working…' : task.kind === 'edit' ? 'Save changes' : titles[task.kind]}</button></div>
    </form>
  </dialog>, document.body);
}

export default function InterviewDirectory({ search, onSearchChange, view, onViewChange, onSelect, onChanged }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const root = pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const [query, setQuery] = useState(search);
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [lifecycle, setLifecycle] = useState('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [data, setData] = useState({ events: [], pagination: { page: 1, pages: 1, total: 0, limit: 25 } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [task, setTask] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const actionLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const timer = setTimeout(() => setQuery(search), 300); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    api.listEvents({ view: 'interviews', page, limit, search: query, period: view, type, sort, lifecycle }).then((result) => {
      if (!active) return;
      if (!Array.isArray(result.events) || !result.pagination) throw new Error('The interview list could not be loaded.');
      if (page > result.pagination.pages) { active = false; setPage(result.pagination.pages); return; }
      setData(result);
    }).catch((err) => { if (active) setError(err.message || 'Unable to load interviews.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [query, view, type, sort, lifecycle, page, limit, refresh]);

  const execute = async (work) => {
    if (actionLock.current) return;
    actionLock.current = true; setActionBusy(true); setActionError(''); setNotice('');
    try { await work(); }
    catch (err) { if (mounted.current) setActionError(err.message || 'The action could not be completed.'); }
    finally { actionLock.current = false; if (mounted.current) setActionBusy(false); }
  };
  const requestAction = (kind, event) => {
    if (actionLock.current) return;
    setActionError(''); setNotice('');
    if (kind === 'edit') execute(async () => { const full = await api.getEvent(event._id); if (mounted.current) setTask({ kind, event: full }); });
    else setTask({ kind, event });
  };
  const confirm = (fields) => execute(async () => {
    const id = task.event._id;
    if (task.kind === 'edit') {
      if (!fields.name.trim()) throw new Error('Enter an interview name.');
      if (fields.startDate && fields.endDate && new Date(fields.endDate) <= new Date(fields.startDate)) throw new Error('The end must be after the start.');
      await api.updateEvent(id, { name: fields.name.trim(), description: fields.description, startDate: fields.startDate ? new Date(fields.startDate).toISOString() : null, endDate: fields.endDate ? new Date(fields.endDate).toISOString() : null });
    } else if (task.kind === 'invitations') await api.sendEventInvitations(id, []);
    else if (task.kind === 'delete') await api.deleteEvent(id, 'Interview deleted by its administrator.');
    else await api.updateEventStatus(id, task.kind);
    if (!mounted.current) return;
    setNotice(task.kind === 'invitations' ? 'Invitation emails queued.' : task.kind === 'delete' ? 'Interview and related records deleted. This cannot be undone; cancellation emails were queued.' : 'Interview updated.');
    setTask(null); setRefresh((value) => value + 1);
    // A sidebar refresh failure must not turn a successful mutation into a retry.
    try { Promise.resolve(onChanged?.()).catch(() => {}); } catch { /* List refresh remains independent. */ }
  });
  const actionsFor = (event) => {
    const allowed = interviewActionIds(event, user, hasPermission);
    return [
      { id: 'open', label: 'View interview & reports', icon: ArrowRight, run: () => onSelect(event._id) },
      { id: 'edit', label: 'Edit details & schedule', icon: Pencil, run: () => requestAction('edit', event) },
      { id: 'export', label: 'Export joined students CSV', icon: Download, run: () => execute(async () => {
        const csv = await api.exportParticipantsCsv(event._id);
        if (!mounted.current) return;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const link = document.createElement('a'); link.href = url; link.download = `interview-${event._id}-students.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice('Joined-student CSV downloaded.');
      }) },
      { id: 'copy', label: 'Copy management link', icon: Copy, run: () => execute(async () => { await navigator.clipboard.writeText(`${window.location.origin}${root}/interviews/one-to-one/${event._id}`); if (mounted.current) setNotice('Management link copied. Staff sign-in is required.'); }) },
      { id: 'invitations', label: 'Send / resend invitations', icon: Mail, run: () => requestAction('invitations', event) },
      { id: 'published', label: 'Publish interview', icon: CheckCircle, run: () => requestAction('published', event) },
      { id: 'completed', label: 'Mark as complete', icon: CheckCircle, run: () => requestAction('completed', event) },
      { id: 'cancelled', label: 'Cancel interview', icon: XCircle, danger: true, run: () => requestAction('cancelled', event) },
      { id: 'delete', label: 'Delete interview', icon: Trash2, danger: true, run: () => requestAction('delete', event) },
    ].filter((action) => allowed.includes(action.id));
  };

  return <>
    {(notice || actionBusy || (actionError && !task)) && <div role={actionError ? 'alert' : 'status'} className={`mb-3 rounded-lg border p-3 text-xs ${actionError ? 'border-rose-200 text-rose-600' : 'border-slate-200 text-slate-600 dark:border-gray-700 dark:text-gray-300'}`}>{actionBusy ? 'Working…' : actionError || notice}</div>}
    <InterviewBrowser events={data.events} remote loading={loading || query !== search} error={error} onRetry={() => setRefresh((value) => value + 1)} search={search} onSearchChange={(value) => { onSearchChange(value); setPage(1); }} view={view} onViewChange={(value) => { setPage(1); setLifecycle('all'); onViewChange(value); }} type={type} onTypeChange={(value) => { setType(value); setPage(1); }} sort={sort} onSortChange={(value) => { setSort(value); setPage(1); }} lifecycle={lifecycle} onLifecycleChange={(value) => { setLifecycle(value); setPage(1); if (value !== 'all') onViewChange('all'); }} onSelect={onSelect} actionsFor={actionsFor} pagination={data.pagination} onPageChange={setPage} onPageSizeChange={(value) => { setLimit(value); setPage(1); }} />
    {task && <ActionDialog key={`${task.kind}-${task.event._id}`} task={task} busy={actionBusy} error={actionError} onClose={() => { if (!actionBusy) { setTask(null); setActionError(''); } }} onConfirm={confirm} />}
  </>;
}
