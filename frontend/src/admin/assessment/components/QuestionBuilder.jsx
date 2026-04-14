import { Trash2 } from 'lucide-react';
import CodingQuestionEditor from './CodingQuestionEditor';

export default function QuestionBuilder({ type, value, onChange, onRemove, groupName }) {
  const question = value || {};

  const update = (updates) => onChange({ ...question, ...updates });

  const updateOption = (idx, nextValue) => {
    const options = [...(question.options || ['', '', '', ''])];
    options[idx] = nextValue;
    update({ options });
  };

  if (type === 'coding') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Coding Question</div>
          <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs text-rose-600">
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
        <CodingQuestionEditor
          value={question.coding || {}}
          onChange={(coding) => update({ coding })}
          title={question.questionText || ''}
          onTitleChange={(nextTitle) => update({ questionText: nextTitle, coding: { ...(question.coding || {}), title: nextTitle } })}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Question</div>
        <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 text-xs text-rose-600">
          <Trash2 className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Question Text</label>
          <textarea
            value={question.questionText || ''}
            onChange={(e) => update({ questionText: e.target.value })}
            rows="2"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>

        {type === 'mcq' && (
          <div className="space-y-2">
            <div className="grid gap-2 md:grid-cols-2">
              {[0, 1, 2, 3].map((idx) => (
                <div key={`opt-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-gray-400">
                    Option {idx + 1}
                    <input
                      type="radio"
                      name={groupName || `correct-${question.id || ''}`}
                      checked={question.correctOptionIndex === idx}
                      onChange={() => update({ correctOptionIndex: idx })}
                    />
                  </div>
                  <input
                    value={(question.options || ['', '', '', ''])[idx] || ''}
                    onChange={(e) => updateOption(idx, e.target.value)}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none focus:border-sky-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                    placeholder={`Option ${idx + 1} text`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {(type === 'short' || type === 'one_line') && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Expected Answer</label>
              <input
                value={question.expectedAnswer || ''}
                onChange={(e) => update({ expectedAnswer: e.target.value })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 dark:text-gray-400">Keywords (optional)</label>
              <input
                value={(question.keywords || []).join(', ')}
                onChange={(e) => update({ keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                placeholder="Keyword1, Keyword2"
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[140px_minmax(0,1fr)]">
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Points</label>
            <input
              type="number"
              min="1"
              value={question.points || 1}
              onChange={(e) => update({ points: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Add Tag</label>
            <input
              value={(question.tags || []).join(', ')}
              onChange={(e) => update({ tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
              placeholder="Company, topic, difficulty..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
