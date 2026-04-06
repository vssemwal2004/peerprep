import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const buildBlock = (type = 'bullet') => ({ type, text: '' });

export default function AssessmentRules() {
  const toast = useToast();
  const [title, setTitle] = useState('Assessment Rules');
  const [blocks, setBlocks] = useState([buildBlock('bullet')]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await api.getAssessmentRulesAdmin();
      const rules = data?.rules;
      if (rules?.title) setTitle(rules.title);
      if (Array.isArray(rules?.blocks) && rules.blocks.length > 0) {
        setBlocks(rules.blocks);
      } else {
        setBlocks([buildBlock('bullet')]);
      }
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

  const handleSave = async () => {
    const cleaned = blocks
      .map((block) => ({ type: block.type === 'paragraph' ? 'paragraph' : 'bullet', text: (block.text || '').trim() }))
      .filter((block) => block.text.length > 0);
    if (cleaned.length === 0) {
      toast.error('Add at least one rule before saving.');
      return;
    }
    setSaving(true);
    try {
      await api.saveAssessmentRulesAdmin({ title, blocks: cleaned });
      toast.success('Rules updated');
      loadRules();
    } catch (err) {
      toast.error(err.message || 'Failed to save rules');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Assessment Rules</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Manage the instructions students see before starting a test.</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Save Rules
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <label className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-gray-500">Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Assessment Rules"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-sky-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
          />
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
                  className="inline-flex items-center gap-1 rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600"
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

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => addBlock('paragraph')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Paragraph
          </button>
          <button
            type="button"
            onClick={() => addBlock('bullet')}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Add Bullet
          </button>
        </div>
      </div>
    </div>
  );
}
