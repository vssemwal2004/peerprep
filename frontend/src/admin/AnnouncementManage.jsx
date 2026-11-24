import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Mail, X } from 'lucide-react';
import AnnouncementEmailDialog from './announcements/AnnouncementEmailDialog';
import { EmailToggle } from './announcements/EmailToggle';
import { api } from '../utils/api';
import { SortHeader, TablePager, useClientTable } from '../components/table';
import PageGuideButton from '../guide/platform/PageGuideButton';
import AnnouncementEditor, { formFromAnnouncement, payloadFromForm } from './announcements/AnnouncementEditor';
import AnnouncementDialog from '../components/announcements/AnnouncementDialog';
import { CATEGORIES, DESIGNS, categoryOf, labelOf, themeOf } from '../components/announcements/announcementMeta';

const typeOptions = [{ value: '', label: 'All kinds' }, ...CATEGORIES.map((item) => ({ value: item.key, label: item.label }))];

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' }
];

const priorityLabels = {
  high: 'High',
  normal: 'Normal',
  low: 'Low'
};

const PRIORITY_RANK = { high: 3, normal: 2, low: 1 };

const announcementSortValue = (ann, key) => {
  if (key === 'priority') return PRIORITY_RANK[ann.priority] || PRIORITY_RANK.normal;
  if (key === 'type') return labelOf(ann);
  if (key === 'expiryDate' || key === 'createdAt') return ann[key] ? new Date(ann[key]) : null;
  return ann?.[key];
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function AnnouncementManage() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [form, setForm] = useState(() => formFromAnnouncement(null));
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  // Email: { announcement (form values), id } for the email dialog.
  const [emailFor, setEmailFor] = useState(null);

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      // The kind filter runs here: older announcements carry only the legacy type.
      const data = await api.listAnnouncementsAdmin({ status: statusFilter || undefined });
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      setError(err?.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [statusFilter]);

  const openEdit = (announcement) => {
    setEditing(announcement);
    setEditError('');
    setForm(formFromAnnouncement(announcement));
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!form.title.trim() || !form.messageHtml.trim()) { setEditError('Title and message are required.'); return; }
    setEditError('');
    setSaving(true);
    try {
      const res = await api.updateAnnouncement(editing._id, payloadFromForm(form));
      setAnnouncements((prev) => prev.map((a) => (a._id === editing._id ? res.announcement : a)));
      closeEdit();
    } catch (err) {
      setEditError(err?.message || 'Failed to update announcement');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (announcement) => {
    const confirmed = window.confirm('Delete this announcement? This action cannot be undone.');
    if (!confirmed) return;
    try {
      await api.deleteAnnouncement(announcement._id);
      setAnnouncements((prev) => prev.filter((a) => a._id !== announcement._id));
    } catch (err) {
      setError(err?.message || 'Failed to delete announcement');
    }
  };

  const handleToggle = async (announcement) => {
    try {
      const res = await api.updateAnnouncement(announcement._id, {
        status: announcement.status === 'active' ? 'inactive' : 'active'
      });
      setAnnouncements((prev) => prev.map((a) => (a._id === announcement._id ? res.announcement : a)));
    } catch (err) {
      setError(err?.message || 'Failed to update status');
    }
  };

  const filteredAnnouncements = useMemo(() => (typeFilter ? announcements.filter((ann) => categoryOf(ann).key === typeFilter) : announcements), [announcements, typeFilter]);
  const table = useClientTable(filteredAnnouncements, { getValue: announcementSortValue, resetKey: `${statusFilter}|${typeFilter}` });

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div data-guide="am-header">
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">Manage Announcements<PageGuideButton /></h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              Edit, activate, or remove announcements shown to students.
            </p>
          </div>
          <div data-guide="am-filters" className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div data-guide="am-table" className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-gray-700 dark:text-slate-400">
                <tr>
                  {[['title', 'Title'], ['type', 'Shown as'], ['status', 'Status'], ['priority', 'Priority'], ['expiryDate', 'Expiry'], ['createdAt', 'Created']].map(([key, label]) => (
                    <SortHeader key={key} sortKey={key} sort={table.sort} onSort={table.toggleSort} className="px-5 py-3">{label}</SortHeader>
                  ))}
                  <SortHeader sortable={false} align="right" className="px-5 py-3">Actions</SortHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-6 text-center text-slate-500">Loading announcements...</td>
                  </tr>
                ) : filteredAnnouncements.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-6 text-center text-slate-500">No announcements found.</td>
                  </tr>
                ) : (
                  table.pageRows.map((ann) => (
                    <tr key={ann._id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-white">
                          {ann.title}
                          {ann.showAsPopup ? <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20" title="Shown as a popup when students log in">Popup</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ann.message}</div>
                      </td>
                      <td className="px-5 py-4">
                        {(() => {
                          const { Icon } = categoryOf(ann);
                          return (
                            <span className="flex flex-col items-start gap-1">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${themeOf(ann).soft}`}><Icon className="h-3 w-3" aria-hidden="true" />{labelOf(ann)}</span>
                              <span className="text-[11px] text-slate-400">{DESIGNS.find((design) => design.key === (ann.design || 'classic'))?.label} design</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ann.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                          {ann.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{priorityLabels[ann.priority] || 'Normal'}</td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{formatDate(ann.expiryDate)}</td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{formatDate(ann.createdAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setPreviewing(ann)}
                            aria-label={`Preview ${ann.title}`}
                            title="Preview as student"
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setEmailFor({ announcement: payloadFromForm(formFromAnnouncement(ann)), id: ann._id })}
                            aria-label={`Email ${ann.title} to students`}
                            title="Send as email"
                            className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(ann)}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggle(ann)}
                            className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
                          >
                            {ann.status === 'active' ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => handleDelete(ann)}
                            className="rounded-lg border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <TablePager {...table.pager} busy={loading} noun="announcements" />
        </div>
      </div>

      {editing ? createPortal(
        <div className="fixed inset-0 z-[150] flex flex-col bg-slate-50 dark:bg-gray-900" role="dialog" aria-modal="true" aria-labelledby="edit-announcement-title">
          <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6 dark:border-gray-700 dark:bg-gray-900">
            <h2 id="edit-announcement-title" className="min-w-0 flex-1 truncate text-lg font-semibold text-slate-900 dark:text-white">Edit announcement</h2>
            <button type="button" onClick={closeEdit} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            <div className="mx-auto max-w-7xl">
              <AnnouncementEditor form={form} setForm={setForm} error={editError}
                extra={<EmailToggle onOpen={() => setEmailFor({ announcement: payloadFromForm(form), id: editing._id })} />}
                actions={<>
                  <button type="button" onClick={closeEdit} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800">Cancel</button>
                  <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">{saving ? 'Saving…' : 'Save changes'}</button>
                </>} />
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
      <AnnouncementEmailDialog open={Boolean(emailFor)} onClose={() => setEmailFor(null)} announcement={emailFor?.announcement} announcementId={emailFor?.id} />
      {previewing ? <AnnouncementDialog items={[previewing]} onClose={() => setPreviewing(null)} zIndex="z-[200]" doneLabel="Close preview" preview /> : null}
    </div>
  );
}
