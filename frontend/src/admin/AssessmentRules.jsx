import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Save, Trash2, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const buildBlock = (type = 'bullet') => ({ type, text: '' });

export default function AssessmentRules() {
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('Assessment Rules');
  const [blocks, setBlocks] = useState([buildBlock('bullet')]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const initialRef = useRef({ title: 'Assessment Rules', blocks: [buildBlock('bullet')] });

  const cleanedBlocks = useMemo(() => (
    blocks
      .map((block) => ({
        type: block.type === 'paragraph' ? 'paragraph' : 'bullet',
        text: (block.text || '').trim(),
      }))
      .filter((block) => block.text.length > 0)
  ), [blocks]);

  const isDirty = useMemo(() => {
    const initial = initialRef.current;
    const next = {
      title: (title || '').trim(),
      blocks: cleanedBlocks,
    };
    const prev = {
      title: (initial.title || '').trim(),
      blocks: (initial.blocks || [])
        .map((block) => ({
          type: block.type === 'paragraph' ? 'paragraph' : 'bullet',
          text: (block.text || '').trim(),
        }))
        .filter((block) => block.text.length > 0),
    };
    return JSON.stringify(prev) !== JSON.stringify(next);
  }, [cleanedBlocks, title]);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await api.getAssessmentRulesAdmin();
      const rules = data?.rules;
      const nextTitle = rules?.title || 'Assessment Rules';
      const nextBlocks = Array.isArray(rules?.blocks) && rules.blocks.length > 0
        ? rules.blocks
        : [buildBlock('bullet')];

      setTitle(nextTitle);
      setBlocks(nextBlocks);
      initialRef.current = { title: nextTitle, blocks: nextBlocks };
    } catch (err) {
      toast.error(err.message || 'Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const updateBlock = (index, patch) => {
    setBlocks((prev) => prev.map((block, idx) => (idx === index ? { ...block, ...patch } : block)));
  };

  const addBlock = (type) => {
    setBlocks((prev) => [...prev, buildBlock(type)]);
  };

  const removeBlock = (index) => {
    setBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const saveRules = async () => {
    if (cleanedBlocks.length === 0) {
      toast.error('Add at least one rule before saving.');
      return false;
    }
    setSaving(true);
    try {
      const payload = { title: (title || '').trim() || 'Assessment Rules', blocks: cleanedBlocks };
      await api.saveAssessmentRulesAdmin(payload);
      toast.success('Rules updated');
      initialRef.current = { title: payload.title, blocks: payload.blocks };
      return true;
    } catch (err) {
      toast.error(err.message || 'Failed to save rules');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    await saveRules();
  };

  const handleComplete = async () => {
    const ok = await saveRules();
    if (ok) navigate('/admin/assessment');
  };

  const handleDiscard = () => {
    const initial = initialRef.current;
    setTitle(initial.title || 'Assessment Rules');
    setBlocks(Array.isArray(initial.blocks) && initial.blocks.length ? initial.blocks : [buildBlock('bullet')]);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Assessment Rules</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">
              Manage the instructions students see before starting a test.
              {isDirty && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Unsaved changes</span>}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDiscard}
              disabled={!isDirty || saving}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RotateCcw className="h-4 w-4" />
              Discard
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !isDirty}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={handleComplete}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="h-4 w-4" />
              Save & Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Editor */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">Title</label>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Assessment Rules"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => addBlock('paragraph')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add Paragraph
              </button>
              <button
                type="button"
                onClick={() => addBlock('bullet')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add Bullet
              </button>
            </div>

            <div className="space-y-4">
              {loading && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  Loading rules...
                </div>
              )}

              {!loading && blocks.map((block, idx) => (
                <div key={`block-${idx}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <select
                      value={block.type}
                      onChange={(event) => updateBlock(idx, { type: event.target.value })}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    >
                      <option value="bullet">Bullet</option>
                      <option value="paragraph">Paragraph</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeBlock(idx)}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={block.text}
                    onChange={(event) => updateBlock(idx, { text: event.target.value })}
                    rows={block.type === 'paragraph' ? 4 : 2}
                    placeholder={block.type === 'paragraph' ? 'Write a paragraph...' : 'Write a bullet rule...'}
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Student Preview</div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-gray-400">This is how rules will appear to students.</div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
                <div className="text-sm font-semibold text-slate-700 dark:text-gray-200">{(title || 'Assessment Rules').trim() || 'Assessment Rules'}</div>
                <div className="mt-3 space-y-2 text-sm text-slate-600 dark:text-gray-300">
                  {cleanedBlocks.length === 0 ? (
                    <div className="text-xs text-slate-500">Add rules on the left to see a preview.</div>
                  ) : (
                    cleanedBlocks.map((block, idx) => (
                      block.type === 'paragraph' ? (
                        <p key={`preview-${idx}`} className="text-sm text-slate-600 dark:text-gray-300">{block.text}</p>
                      ) : (
                        <div key={`preview-${idx}`} className="flex items-start gap-2">
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <span>{block.text}</span>
                        </div>
                      )
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
