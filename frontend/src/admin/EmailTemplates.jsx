import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { api } from '../utils/api';

const HISTORY_LIMIT = 50;

const areEditFormsEqual = (a, b) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.name !== b.name) return false;
  if (a.subject !== b.subject) return false;
  if (a.htmlContent !== b.htmlContent) return false;
  if (a.type !== b.type) return false;

  const av = Array.isArray(a.variables) ? a.variables : [];
  const bv = Array.isArray(b.variables) ? b.variables : [];
  if (av.length !== bv.length) return false;
  for (let i = 0; i < av.length; i += 1) {
    if (av[i] !== bv[i]) return false;
  }
  return true;
};

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
  const [editHistory, setEditHistory] = useState({
    past: [],
    present: { name: '', subject: '', htmlContent: '', type: '', variables: [] },
    future: [],
  });
  const [saving, setSaving] = useState(false);

  const editForm = editHistory.present;

  const commitEditForm = useCallback((updater) => {
    setEditHistory((prev) => {
      const current = prev.present;
      const next = typeof updater === 'function' ? updater(current) : updater;
      if (areEditFormsEqual(current, next)) return prev;

      const past = [...prev.past, current];
      const trimmedPast = past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;
      return { past: trimmedPast, present: next, future: [] };
    });
  }, []);

  const canUndo = editHistory.past.length > 0;
  const canRedo = editHistory.future.length > 0;

  const handleUndo = useCallback(() => {
    setEditHistory((prev) => {
      if (!prev.past.length) return prev;
      const previous = prev.past[prev.past.length - 1];
      const nextPast = prev.past.slice(0, -1);
      const future = [prev.present, ...prev.future];
      const trimmedFuture = future.length > HISTORY_LIMIT ? future.slice(0, HISTORY_LIMIT) : future;
      return { past: nextPast, present: previous, future: trimmedFuture };
    });
  }, []);

  const handleRedo = useCallback(() => {
    setEditHistory((prev) => {
      if (!prev.future.length) return prev;
      const next = prev.future[0];
      const nextFuture = prev.future.slice(1);
      const past = [...prev.past, prev.present];
      const trimmedPast = past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past;
      return { past: trimmedPast, present: next, future: nextFuture };
    });
  }, []);

  const htmlTextareaRef = useRef(null);
  const previewRef = useRef(null);
  const syncingScrollRef = useRef(false);

  const [findQuery, setFindQuery] = useState('');
  const [findMatches, setFindMatches] = useState([]);
  const [findIndex, setFindIndex] = useState(0);

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
      setEditHistory({
        past: [],
        present: {
          name: full.name || '',
          subject: full.subject || '',
          htmlContent: full.htmlContent || '',
          type: full.type || '',
          variables: full.variables || [],
        },
        future: [],
      });
      setFindQuery('');
      setFindMatches([]);
      setFindIndex(0);
    } catch (err) {
      setError(err?.message || 'Failed to load template');
    }
  };

  const closeModals = () => {
    setViewing(null);
    setEditing(null);
  };

  const scrollTextareaToIndex = useCallback((index) => {
    const textarea = htmlTextareaRef.current;
    if (!textarea) return;

    const content = textarea.value || '';
    const before = content.slice(0, Math.max(0, index));
    const lineCount = before.split('\n').length - 1;
    const computed = window.getComputedStyle(textarea);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 18;
    const targetScroll = Math.max(0, lineCount * lineHeight - textarea.clientHeight * 0.35);
    textarea.scrollTop = targetScroll;
  }, []);

  const selectRangeInTextarea = useCallback((start, end) => {
    const textarea = htmlTextareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(start, end);
    scrollTextareaToIndex(start);
  }, [scrollTextareaToIndex]);

  const insertAtCursor = useCallback((insertText) => {
    const textarea = htmlTextareaRef.current;
    const content = editForm.htmlContent || '';
    if (!textarea) {
      commitEditForm((prev) => ({ ...prev, htmlContent: (prev.htmlContent || '') + insertText }));
      return;
    }

    const start = textarea.selectionStart ?? content.length;
    const end = textarea.selectionEnd ?? content.length;
    const next = content.slice(0, start) + insertText + content.slice(end);
    commitEditForm((prev) => ({ ...prev, htmlContent: next }));

    requestAnimationFrame(() => {
      textarea.focus();
      const nextPos = start + insertText.length;
      textarea.setSelectionRange(nextPos, nextPos);
      scrollTextareaToIndex(nextPos);
    });
  }, [commitEditForm, editForm.htmlContent, scrollTextareaToIndex]);

  const computeFindMatches = useCallback((query, content) => {
    const q = (query || '').trim();
    if (!q) return [];
    const haystack = content || '';
    const needle = q.toLowerCase();

    const matches = [];
    const lower = haystack.toLowerCase();
    let idx = 0;
    while (idx < lower.length) {
      const at = lower.indexOf(needle, idx);
      if (at === -1) break;
      matches.push({ start: at, end: at + needle.length });
      idx = at + Math.max(1, needle.length);
      if (matches.length > 200) break;
    }
    return matches;
  }, []);

  const runFind = useCallback((direction) => {
    const content = editForm.htmlContent || '';
    const matches = computeFindMatches(findQuery, content);
    setFindMatches(matches);
    if (!matches.length) return;

    let nextIndex = findIndex;
    if (direction === 'next') nextIndex = (findIndex + 1) % matches.length;
    if (direction === 'prev') nextIndex = (findIndex - 1 + matches.length) % matches.length;
    setFindIndex(nextIndex);
    const m = matches[nextIndex];
    selectRangeInTextarea(m.start, m.end);
  }, [computeFindMatches, editForm.htmlContent, findIndex, findQuery, selectRangeInTextarea]);

  const handleTextareaScroll = useCallback(() => {
    const textarea = htmlTextareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;
    if (syncingScrollRef.current) return;

    syncingScrollRef.current = true;
    const maxTextarea = Math.max(1, textarea.scrollHeight - textarea.clientHeight);
    const maxPreview = Math.max(1, preview.scrollHeight - preview.clientHeight);
    const ratio = textarea.scrollTop / maxTextarea;
    preview.scrollTop = ratio * maxPreview;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, []);

  const handlePreviewScroll = useCallback(() => {
    const textarea = htmlTextareaRef.current;
    const preview = previewRef.current;
    if (!textarea || !preview) return;
    if (syncingScrollRef.current) return;

    syncingScrollRef.current = true;
    const maxTextarea = Math.max(1, textarea.scrollHeight - textarea.clientHeight);
    const maxPreview = Math.max(1, preview.scrollHeight - preview.clientHeight);
    const ratio = preview.scrollTop / maxPreview;
    textarea.scrollTop = ratio * maxTextarea;
    requestAnimationFrame(() => {
      syncingScrollRef.current = false;
    });
  }, []);

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
                  type="button"
                  onClick={handleUndo}
                  disabled={!canUndo}
                  title="Undo"
                  aria-label="Undo"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRedo}
                  disabled={!canRedo}
                  title="Redo"
                  aria-label="Redo"
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
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
                    onChange={(e) => commitEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-slate-500">Subject Line</label>
                  <input
                    value={editForm.subject}
                    onChange={(e) => commitEditForm((prev) => ({ ...prev, subject: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase text-slate-500">HTML Content</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <input
                            value={findQuery}
                            onChange={(e) => {
                              setFindQuery(e.target.value);
                              setFindIndex(0);
                              setFindMatches([]);
                            }}
                            placeholder="Find in HTML"
                            className="w-44 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => runFind('prev')}
                          disabled={!findQuery.trim()}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"
                        >
                          Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => runFind('next')}
                          disabled={!findQuery.trim()}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"
                        >
                          Next
                        </button>
                        {!!findMatches.length && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {Math.min(findIndex + 1, findMatches.length)}/{findMatches.length}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {editForm.variables?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      {editForm.variables.map((v) => (
                        <button
                          key={v}
                          type="button"
                          title="Click to insert into HTML"
                          onClick={() => insertAtCursor(`{{${v}}}`)}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-semibold text-slate-600 hover:bg-slate-100 dark:border-gray-700 dark:bg-gray-800 dark:text-slate-200 dark:hover:bg-gray-700"
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  )}

                  <textarea
                    ref={htmlTextareaRef}
                    value={editForm.htmlContent}
                    onChange={(e) => commitEditForm((prev) => ({ ...prev, htmlContent: e.target.value }))}
                    onScroll={handleTextareaScroll}
                    className="mt-2 h-[360px] w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-mono text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold uppercase text-slate-500">Live Preview</label>
                  {editForm.variables?.length > 0 && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Tip: use variables above to insert quickly
                    </div>
                  )}
                </div>
                <div
                  ref={previewRef}
                  className="mt-2 h-[520px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-950"
                  onScroll={handlePreviewScroll}
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
