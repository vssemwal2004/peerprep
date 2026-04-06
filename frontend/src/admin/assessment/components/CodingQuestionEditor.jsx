import { useEffect, useMemo, useState } from 'react';
import { Play, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import MonacoCodeEditor from '../../compiler/MonacoCodeEditor';
import RichTextEditor from '../../compiler/RichTextEditor';
import { RichTextPreview } from '../../compiler/CompilerContentPreview';
import { api } from '../../../utils/api';
import { COMPILER_LANGUAGES, buildPreviewRunFormData, getLanguageLabel, getMonacoLanguage } from '../../compiler/compilerUtils';

const emptyCase = () => ({ input: '', output: '', explanation: '' });

export default function CodingQuestionEditor({ value, onChange, title, onTitleChange }) {
  const [activeLanguage, setActiveLanguage] = useState(value.supportedLanguages?.[0] || 'python');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewInput, setPreviewInput] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeCaseTab, setActiveCaseTab] = useState('visible');

  const supportedLanguages = value.supportedLanguages?.length ? value.supportedLanguages : ['python', 'javascript'];
  const starterCode = value.starterCode || [];
  const visibleTestCases = value.visibleTestCases || [];
  const hiddenTestCases = value.hiddenTestCases || [];

  useEffect(() => {
    if (!supportedLanguages.includes(activeLanguage)) {
      setActiveLanguage(supportedLanguages[0] || 'python');
    }
  }, [supportedLanguages, activeLanguage]);

  const updateCoding = (updates) => {
    onChange({ ...value, ...updates });
  };

  const codeTemplates = useMemo(() => {
    const templates = {};
    starterCode.forEach((entry) => {
      if (entry?.language) templates[entry.language] = entry.code || '';
    });
    return templates;
  }, [starterCode]);

  const updateStarterCode = (language, code) => {
    const next = starterCode.filter((entry) => entry.language !== language);
    next.push({ language, code });
    updateCoding({ starterCode: next });
  };

  const toggleLanguage = (languageId) => {
    const next = supportedLanguages.includes(languageId)
      ? supportedLanguages.filter((lang) => lang !== languageId)
      : [...supportedLanguages, languageId];
    updateCoding({ supportedLanguages: next });
    if (!supportedLanguages.includes(languageId)) {
      updateStarterCode(languageId, codeTemplates[languageId] || '');
    }
  };

  const updateVisibleCase = (index, updates) => {
    const next = visibleTestCases.map((entry, idx) => (idx === index ? { ...entry, ...updates } : entry));
    updateCoding({ visibleTestCases: next });
  };

  const updateHiddenCase = (index, updates) => {
    const next = hiddenTestCases.map((entry, idx) => (idx === index ? { ...entry, ...updates } : entry));
    updateCoding({ hiddenTestCases: next });
  };

  const runPreview = async () => {
    setIsRunning(true);
    setPreviewResult(null);
    try {
      const formData = buildPreviewRunFormData({
        supportedLanguages,
        codeTemplates,
        sampleTestCases: visibleTestCases,
        timeLimitSeconds: value.timeLimitSeconds || 2,
      }, activeLanguage, previewInput);
      const result = await api.runCompilerPreview(formData);
      setPreviewResult(result);
    } catch (err) {
      setPreviewResult({ status: 'ERROR', output: '', stderr: err.message || 'Preview failed.' });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Problem Title</label>
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            placeholder="e.g., Two Sum"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Difficulty</label>
          <select
            value={value.difficulty || 'Medium'}
            onChange={(e) => updateCoding({ difficulty: e.target.value })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Tags</label>
          <input
            value={(value.tags || []).join(', ')}
            onChange={(e) => updateCoding({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            placeholder="Arrays, Sorting"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Time Limit (sec)</label>
            <input
              type="number"
              min="1"
              value={value.timeLimitSeconds || 2}
              onChange={(e) => updateCoding({ timeLimitSeconds: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Memory Limit (MB)</label>
            <input
              type="number"
              min="32"
              value={value.memoryLimitMb || 256}
              onChange={(e) => updateCoding({ memoryLimitMb: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 dark:text-gray-400">Problem Description</label>
        <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <RichTextEditor
            value={value.description || ''}
            onChange={(content) => updateCoding({ description: content })}
            rows={10}
            placeholder="Explain the problem clearly with examples and constraints."
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Constraints</label>
          <textarea
            value={value.constraints || ''}
            onChange={(e) => updateCoding({ constraints: e.target.value })}
            rows="3"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Input Format</label>
          <textarea
            value={value.inputFormat || ''}
            onChange={(e) => updateCoding({ inputFormat: e.target.value })}
            rows="3"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 dark:text-gray-400">Output Format</label>
          <textarea
            value={value.outputFormat || ''}
            onChange={(e) => updateCoding({ outputFormat: e.target.value })}
            rows="3"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Sample Input</label>
            <textarea
              value={value.sampleInput || ''}
              onChange={(e) => updateCoding({ sampleInput: e.target.value })}
              rows="3"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 dark:text-gray-400">Sample Output</label>
            <textarea
              value={value.sampleOutput || ''}
              onChange={(e) => updateCoding({ sampleOutput: e.target.value })}
              rows="3"
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Supported Languages</div>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">Select languages available to students.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {COMPILER_LANGUAGES.map((language) => (
              <button
                key={language.id}
                type="button"
                onClick={() => toggleLanguage(language.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  supportedLanguages.includes(language.id)
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {language.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex flex-wrap gap-2">
            {supportedLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setActiveLanguage(lang)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  activeLanguage === lang
                    ? 'bg-slate-900 text-white dark:bg-sky-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
              >
                {getLanguageLabel(lang)}
              </button>
            ))}
          </div>
          <MonacoCodeEditor
            language={getMonacoLanguage(activeLanguage)}
            value={codeTemplates[activeLanguage] || ''}
            onChange={(code) => updateStarterCode(activeLanguage, code)}
            height={280}
          />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Test Cases</div>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">Manage visible and hidden test cases.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCaseTab('visible')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                activeCaseTab === 'visible'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Visible
            </button>
            <button
              type="button"
              onClick={() => setActiveCaseTab('hidden')}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                activeCaseTab === 'hidden'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              Hidden
            </button>
          </div>
        </div>

        {activeCaseTab === 'visible' && (
          <div className="mt-3 space-y-3">
            {visibleTestCases.map((testCase, index) => (
              <div key={`visible-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                  Visible Case {index + 1}
                  <button type="button" onClick={() => updateCoding({ visibleTestCases: visibleTestCases.filter((_, idx) => idx !== index) })}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <textarea
                    value={testCase.input}
                    onChange={(e) => updateVisibleCase(index, { input: e.target.value })}
                    rows="3"
                    placeholder="Input"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  />
                  <textarea
                    value={testCase.output}
                    onChange={(e) => updateVisibleCase(index, { output: e.target.value })}
                    rows="3"
                    placeholder="Output"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  />
                </div>
                <textarea
                  value={testCase.explanation || ''}
                  onChange={(e) => updateVisibleCase(index, { explanation: e.target.value })}
                  rows="2"
                  placeholder="Explanation (optional)"
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateCoding({ visibleTestCases: [...visibleTestCases, emptyCase()] })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Visible Test
            </button>
          </div>
        )}

        {activeCaseTab === 'hidden' && (
          <div className="mt-3 space-y-3">
            {hiddenTestCases.map((testCase, index) => (
              <div key={`hidden-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                  Hidden Case {index + 1}
                  <button type="button" onClick={() => updateCoding({ hiddenTestCases: hiddenTestCases.filter((_, idx) => idx !== index) })}>
                    <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                  </button>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <textarea
                    value={testCase.input}
                    onChange={(e) => updateHiddenCase(index, { input: e.target.value })}
                    rows="3"
                    placeholder="Input"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  />
                  <textarea
                    value={testCase.output}
                    onChange={(e) => updateHiddenCase(index, { output: e.target.value })}
                    rows="3"
                    placeholder="Output"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => updateCoding({ hiddenTestCases: [...hiddenTestCases, { input: '', output: '' }] })}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Hidden Test
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Preview Mode</div>
            <p className="text-[11px] text-slate-400 dark:text-gray-500">Test the problem before saving.</p>
          </div>
          <button
            type="button"
            onClick={() => setPreviewOpen((prev) => !prev)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            {previewOpen ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {previewOpen ? 'Hide Preview' : 'Open Preview'}
          </button>
        </div>

        {previewOpen && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Problem</div>
              <div className="mt-3 space-y-3">
                <RichTextPreview content={value.description || ''} />
                <div className="grid gap-3 text-xs md:grid-cols-2">
                  <div>
                    <div className="font-semibold text-slate-500">Input</div>
                    <div className="mt-1 whitespace-pre-wrap">{value.inputFormat || 'Not provided.'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-500">Output</div>
                    <div className="mt-1 whitespace-pre-wrap">{value.outputFormat || 'Not provided.'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-500">Constraints</div>
                    <div className="mt-1 whitespace-pre-wrap">{value.constraints || 'Not provided.'}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setActiveLanguage(lang)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                        activeLanguage === lang
                          ? 'bg-sky-600 text-white'
                          : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {getLanguageLabel(lang)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={isRunning}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-sky-600 dark:hover:bg-sky-500"
                >
                  <Play className="h-3.5 w-3.5" />
                  {isRunning ? 'Running...' : 'Run Preview'}
                </button>
              </div>
              <div className="mt-3">
                <MonacoCodeEditor
                  language={getMonacoLanguage(activeLanguage)}
                  value={codeTemplates[activeLanguage] || ''}
                  onChange={(code) => updateStarterCode(activeLanguage, code)}
                  height={260}
                />
              </div>
              <div className="mt-3">
                <label className="text-xs text-slate-500 dark:text-gray-400">Custom Input</label>
                <textarea
                  value={previewInput}
                  onChange={(e) => setPreviewInput(e.target.value)}
                  rows="3"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                />
              </div>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-950 px-3 py-2 text-xs text-slate-100">
                <pre className="whitespace-pre-wrap">{previewResult?.output || previewResult?.stderr || previewResult?.compileOutput || 'Run preview to see output.'}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
