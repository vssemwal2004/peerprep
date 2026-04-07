import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';

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
    expiryDate: ''
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
      expiryDate: announcement.expiryDate ? new Date(announcement.expiryDate).toISOString().slice(0, 10) : ''
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
        expiryDate: form.expiryDate || null
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

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Manage Announcements</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              Edit, activate, or remove announcements shown to students.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
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

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-gray-700 dark:text-slate-400">
                <tr>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Priority</th>
                  <th className="px-5 py-3">Expiry</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
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
                  filteredAnnouncements.map((ann) => (
                    <tr key={ann._id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{ann.title}</div>
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
