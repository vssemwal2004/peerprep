import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import MonacoCodeEditor from '../../compiler/MonacoCodeEditor';
import RichTextEditor from '../../compiler/RichTextEditor';
import { RichTextPreview } from '../../compiler/CompilerContentPreview';
import { COMPILER_LANGUAGES, getLanguageLabel, getMonacoLanguage } from '../../compiler/compilerUtils';
import { SectionCard } from '../../compiler/CompilerUi';

const EDITOR_TABS = [
  { key: 'details', label: 'Question Details' },
  { key: 'tests', label: 'Test Cases' },
  { key: 'templates', label: 'Code Templates' },
];

function TabButton({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? 'bg-sky-600 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
      }`}
    >
      {label}
    </button>
  );
}

const emptyCase = () => ({ input: '', output: '', explanation: '' });

export default function CodingQuestionEditor({ value, onChange, title, onTitleChange }) {
  const [activeLanguage, setActiveLanguage] = useState(value.supportedLanguages?.[0] || 'python');
  const [activeTab, setActiveTab] = useState('details');
  const [activeCaseTab, setActiveCaseTab] = useState('visible');

  const supportedLanguages = useMemo(
    () => (value.supportedLanguages?.length ? value.supportedLanguages : ['python', 'javascript']),
    [value.supportedLanguages],
  );
  const starterCode = useMemo(() => value.starterCode || [], [value.starterCode]);
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
    const isEnabled = supportedLanguages.includes(languageId);
    if (isEnabled && supportedLanguages.length === 1) return;

    const next = isEnabled
      ? supportedLanguages.filter((lang) => lang !== languageId)
      : [...supportedLanguages, languageId];
    const hasTemplate = starterCode.some((entry) => entry.language === languageId);
    const nextStarterCode = !isEnabled && !hasTemplate
      ? [...starterCode, { language: languageId, code: '' }]
      : starterCode;

    updateCoding({ supportedLanguages: next, starterCode: nextStarterCode });
  };

  const updateVisibleCase = (index, updates) => {
    const next = visibleTestCases.map((entry, idx) => (idx === index ? { ...entry, ...updates } : entry));
    updateCoding({ visibleTestCases: next });
  };

  const updateHiddenCase = (index, updates) => {
    const next = hiddenTestCases.map((entry, idx) => (idx === index ? { ...entry, ...updates } : entry));
    updateCoding({ hiddenTestCases: next });
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Assessment Coding Question"
        subtitle="Full compiler-grade authoring flow for assessment coding questions."
        action={<div className="flex flex-wrap gap-2">{EDITOR_TABS.map((tab) => <TabButton key={tab.key} label={tab.label} active={activeTab === tab.key} onClick={() => setActiveTab(tab.key)} />)}</div>}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/60">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-gray-100">Draft workspace</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Sample cases: {visibleTestCases.length} | Hidden cases: {hiddenTestCases.length} | Languages: {supportedLanguages.length}</p>
          </div>
        </div>
      </SectionCard>

      {activeTab === 'details' ? (
        <>
          <SectionCard title="Question Details" subtitle="Core metadata and public-facing problem statement.">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Title</label>
                <input
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  placeholder="Example: Two Sum"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Description</label>
                <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
                  <RichTextEditor
                    value={value.description || ''}
                    onChange={(content) => updateCoding({ description: content })}
                    rows={14}
                    placeholder="Explain the problem clearly with examples and constraints."
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Difficulty</label>
                <select
                  value={value.difficulty || 'Medium'}
                  onChange={(e) => updateCoding({ difficulty: e.target.value })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Tags</label>
                <input
                  value={(value.tags || []).join(', ')}
                  onChange={(e) => updateCoding({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                  placeholder="Arrays, Sorting"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Input / Output Specification" subtitle="Public contract shown to problem solvers.">
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Input Format</label>
                <textarea
                  value={value.inputFormat || ''}
                  onChange={(e) => updateCoding({ inputFormat: e.target.value })}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Output Format</label>
                <textarea
                  value={value.outputFormat || ''}
                  onChange={(e) => updateCoding({ outputFormat: e.target.value })}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Constraints</label>
                <textarea
                  value={value.constraints || ''}
                  onChange={(e) => updateCoding({ constraints: e.target.value })}
                  rows={5}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Execution Limits" subtitle="Judge limits for submissions.">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Time Limit</label>
                <input
                  type="number"
                  min="1"
                  step="0.5"
                  value={value.timeLimitSeconds || 2}
                  onChange={(e) => updateCoding({ timeLimitSeconds: Number(e.target.value) })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-gray-300">Memory Limit</label>
                <input
                  type="number"
                  min="64"
                  step="64"
                  value={value.memoryLimitMb || 256}
                  onChange={(e) => updateCoding({ memoryLimitMb: Number(e.target.value) })}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
            </div>
          </SectionCard>
        </>
      ) : null}

      {activeTab === 'tests' ? (
        <SectionCard title="Test Cases" subtitle="Manage visible and hidden test cases.">
          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveCaseTab('visible')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                activeCaseTab === 'visible'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Visible
            </button>
            <button
              type="button"
              onClick={() => setActiveCaseTab('hidden')}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                activeCaseTab === 'hidden'
                  ? 'bg-sky-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              Hidden
            </button>
          </div>

          {activeCaseTab === 'visible' && (
            <div className="space-y-3">
              {visibleTestCases.map((testCase, index) => (
                <div key={`visible-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Visible Case {index + 1}</h4>
                    {visibleTestCases.length > 1 && (
                      <button type="button" onClick={() => updateCoding({ visibleTestCases: visibleTestCases.filter((_, idx) => idx !== index) })} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <textarea
                      value={testCase.input}
                      onChange={(e) => updateVisibleCase(index, { input: e.target.value })}
                      rows={5}
                      placeholder="Input"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                    />
                    <textarea
                      value={testCase.output}
                      onChange={(e) => updateVisibleCase(index, { output: e.target.value })}
                      rows={5}
                      placeholder="Output"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                    />
                    <textarea
                      value={testCase.explanation || ''}
                      onChange={(e) => updateVisibleCase(index, { explanation: e.target.value })}
                      rows={5}
                      placeholder="Explanation"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateCoding({ visibleTestCases: [...visibleTestCases, emptyCase()] })}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add Visible Test
              </button>
            </div>
          )}

          {activeCaseTab === 'hidden' && (
            <div className="space-y-3">
              {hiddenTestCases.map((testCase, index) => (
                <div key={`hidden-${index}`} className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Hidden Case {index + 1}</h4>
                    {hiddenTestCases.length > 1 && (
                      <button type="button" onClick={() => updateCoding({ hiddenTestCases: hiddenTestCases.filter((_, idx) => idx !== index) })} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    )}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <textarea
                      value={testCase.input}
                      onChange={(e) => updateHiddenCase(index, { input: e.target.value })}
                      rows={5}
                      placeholder="Input"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                    />
                    <textarea
                      value={testCase.output}
                      onChange={(e) => updateHiddenCase(index, { output: e.target.value })}
                      rows={5}
                      placeholder="Output"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => updateCoding({ hiddenTestCases: [...hiddenTestCases, { input: '', output: '' }] })}
                className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Add Hidden Test
              </button>
            </div>
          )}
        </SectionCard>
      ) : null}

      {activeTab === 'templates' ? (
        <SectionCard title="Code Templates" subtitle="Multi-language starter code templates.">
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
                readOnly={false}
                internalClipboardOnly={false}
                contentKey={`assessment-template:${activeLanguage}`}
              />
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
