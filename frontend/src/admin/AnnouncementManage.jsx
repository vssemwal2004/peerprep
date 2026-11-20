import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { SortHeader, TablePager, useClientTable } from '../components/table';
import PageGuideButton from '../guide/platform/PageGuideButton';

const typeOptions = [
  { value: '', label: 'All Types' },
  { value: 'motivation', label: 'Motivation' },
  { value: 'info', label: 'Info' },
  { value: 'alert', label: 'Alert' }
];

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
  const [form, setForm] = useState({
    title: '',
    message: '',
    type: 'motivation',
    status: 'inactive',
    priority: 'normal',
    expiryDate: '',
    showAsPopup: false
  });

  const loadAnnouncements = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAnnouncementsAdmin({
        status: statusFilter || undefined,
        type: typeFilter || undefined
      });
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      setError(err?.message || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnnouncements();
  }, [statusFilter, typeFilter]);

  const openEdit = (announcement) => {
    setEditing(announcement);
    setForm({
      title: announcement.title || '',
      message: announcement.message || '',
      type: announcement.type || 'motivation',
      status: announcement.status || 'inactive',
      priority: announcement.priority || 'normal',
      expiryDate: announcement.expiryDate ? new Date(announcement.expiryDate).toISOString().slice(0, 10) : '',
      showAsPopup: Boolean(announcement.showAsPopup)
    });
  };

  const closeEdit = () => {
    setEditing(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    setError('');
    try {
      const res = await api.updateAnnouncement(editing._id, {
        title: form.title,
        message: form.message,
        type: form.type,
        status: form.status,
        priority: form.priority,
        expiryDate: form.expiryDate || null,
        showAsPopup: form.showAsPopup
      });
      setAnnouncements((prev) => prev.map((a) => (a._id === editing._id ? res.announcement : a)));
      closeEdit();
    } catch (err) {
      setError(err?.message || 'Failed to update announcement');
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

  const filteredAnnouncements = useMemo(() => announcements, [announcements]);
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
                  {[['title', 'Title'], ['type', 'Type'], ['status', 'Status'], ['priority', 'Priority'], ['expiryDate', 'Expiry'], ['createdAt', 'Created']].map(([key, label]) => (
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
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
                          {ann.type}
                        </span>
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

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Announcement</h2>
              <button
                onClick={closeEdit}
                className="text-sm font-semibold text-slate-500 hover:text-slate-700"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              <input
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Title"
              />
              <textarea
                value={form.message}
                onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                rows={4}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder="Message"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {typeOptions.slice(1).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {statusOptions.slice(1).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <select
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <input
                  type="date"
                  value={form.expiryDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, expiryDate: e.target.value }))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-gray-700 dark:bg-gray-800/60 dark:text-white">
                <input
                  type="checkbox"
                  checked={form.showAsPopup}
                  onChange={(e) => setForm((prev) => ({ ...prev, showAsPopup: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                Show as popup when students log in
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={closeEdit}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
