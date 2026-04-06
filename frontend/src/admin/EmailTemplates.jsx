import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const badgeClass = (isSystem) => (
  isSystem
    ? 'bg-slate-100 text-slate-600 border border-slate-200'
    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
);

export default function EmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', subject: '', htmlContent: '', type: '', variables: [] });
  const [saving, setSaving] = useState(false);

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter((tpl) =>
      [tpl.name, tpl.subject, tpl.type].filter(Boolean).some((field) => field.toLowerCase().includes(q))
    );
  }, [templates, search]);

  const loadTemplates = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listEmailTemplates();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || 'Failed to load email templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const openView = async (tpl) => {
    try {
      const full = await api.getEmailTemplate(tpl._id);
      setViewing(full);
    } catch (err) {
      setError(err?.message || 'Failed to load template');
    }
  };

  const openEdit = async (tpl) => {
    try {
      const full = await api.getEmailTemplate(tpl._id);
      setEditing(full);
      setEditForm({
        name: full.name || '',
        subject: full.subject || '',
        htmlContent: full.htmlContent || '',
        type: full.type || '',
        variables: full.variables || [],
      });
    } catch (err) {
      setError(err?.message || 'Failed to load template');
    }
  };

  const closeModals = () => {
    setViewing(null);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await api.updateEmailTemplate(editing._id, {
        name: editForm.name,
        subject: editForm.subject,
        htmlContent: editForm.htmlContent,
        type: editForm.type,
        variables: editForm.variables,
      });
      setTemplates((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
      setEditing(updated);
    } catch (err) {
      setError(err?.message || 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl) => {
    if (tpl.isSystem) return;
    const confirmed = window.confirm('Delete this email template? This action cannot be undone.');
    if (!confirmed) return;
    try {
      await api.deleteEmailTemplate(tpl._id);
      setTemplates((prev) => prev.filter((t) => t._id !== tpl._id));
    } catch (err) {
      setError(err?.message || 'Failed to delete template');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Email Templates</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
              Manage the subject lines and HTML content used in system emails.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
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
                  <th className="px-5 py-3">Template</th>
                  <th className="px-5 py-3">Subject</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Last Updated</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-6 text-center text-slate-500">Loading templates...</td>
                  </tr>
                ) : filteredTemplates.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-6 text-center text-slate-500">No templates found.</td>
                  </tr>
                ) : (
                  filteredTemplates.map((tpl) => (
                    <tr key={tpl._id} className="text-slate-700 dark:text-slate-200">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{tpl.name}</div>
                        <div className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${badgeClass(tpl.isSystem)}`}>
                          {tpl.isSystem ? 'System' : 'Custom'}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{tpl.subject}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-300">
                          {tpl.type}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400">{formatDate(tpl.updatedAt)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openView(tpl)}
                            className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
                          >
                            View
                          </button>
                          <button
                            onClick={() => openEdit(tpl)}
                            className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-500"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(tpl)}
                            disabled={tpl.isSystem}
                            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${tpl.isSystem ? 'cursor-not-allowed border-slate-200 text-slate-300' : 'border-rose-200 text-rose-600 hover:bg-rose-50'}`}
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

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{viewing.name}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{viewing.subject}</p>
              </div>
              <button
                onClick={closeModals}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
              >
                Close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-6">
              <div
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"
                dangerouslySetInnerHTML={{ __html: viewing.htmlContent }}
              />
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Template</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{editing.type}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-70"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={closeModals}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="grid max-h-[75vh] grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Template Name</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Subject Line</label>
                  <input
                    value={editForm.subject}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, subject: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">HTML Content</label>
                    {editForm.variables?.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                        {editForm.variables.map((v) => (
                          <span key={v} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                            {`{{${v}}}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <textarea
                    value={editForm.htmlContent}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, htmlContent: e.target.value }))}
                    className="mt-2 h-[360px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-slate-500">Live Preview</label>
                <div
                  className="mt-2 h-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"
                  dangerouslySetInnerHTML={{ __html: editForm.htmlContent }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
