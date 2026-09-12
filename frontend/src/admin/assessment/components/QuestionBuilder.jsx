import { useRef, useState } from 'react';
import {
  Award,
  Check,
  Clock3,
  GripVertical,
  ImagePlus,
  Plus,
  Shuffle,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../../../utils/api';
import { useToast } from '../../../components/CustomToast';
import CodingQuestionEditor from './CodingQuestionEditor';

const EMPTY_OPTIONS = ['', '', '', ''];
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function RequiredLabel({ children, optional = false, className = '' }) {
  return (
    <label className={`mb-1.5 block text-xs font-semibold text-slate-700 dark:text-gray-200 ${className}`}>
      {children}{optional ? <span className="ml-1 font-normal text-slate-400">(optional)</span> : <span className="ml-1 text-rose-500" aria-label="required">*</span>}
    </label>
  );
}

export function QuestionImageUploader({ value, onChange, label = 'Add image', compact = false }) {
  const inputRef = useRef(null);
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const upload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Use a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Question images must be 5 MB or smaller.');
      return;
    }
    setUploading(true);
    try {
      const response = await api.uploadLibraryQuestionAsset(file);
      onChange({ ...(response.asset || {}), alt: value?.alt || '', caption: value?.caption || '' });
      toast.success('Image uploaded.');
    } catch (error) {
      toast.error(error.message || 'Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  if (value?.url) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-gray-700 dark:bg-gray-800">
        <div className="relative flex min-h-24 items-center justify-center bg-white p-2 dark:bg-gray-900">
          <img src={value.url} alt={value.alt || ''} className="max-h-40 max-w-full rounded-lg object-contain" />
          <button type="button" onClick={() => onChange(null)} title="Remove image" aria-label="Remove image" className="absolute right-2 top-2 rounded-lg bg-white/95 p-1.5 text-slate-500 shadow hover:text-rose-600 dark:bg-gray-800"><X className="h-4 w-4" /></button>
        </div>
        <input value={value.alt || ''} onChange={(event) => onChange({ ...value, alt: event.target.value })} placeholder="Alternative text for accessibility" className="w-full border-t border-slate-200 bg-transparent px-3 py-2 text-xs text-slate-700 outline-none dark:border-gray-700 dark:text-gray-200" />
      </div>
    );
  }

  return (
    <>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} title={label} className={`inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs font-semibold text-slate-600 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 ${compact ? 'h-10 w-10 p-0' : 'px-3 py-2.5'}`}>
        <ImagePlus className="h-4 w-4" />{compact ? null : (uploading ? 'Uploading...' : label)}
      </button>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload} className="hidden" />
    </>
  );
}

export default function QuestionBuilder({ type, value, onChange, onRemove, groupName: _groupName, defaultPositiveMarks = 1, defaultNegativeMarks = 0, selected = false, onSelect, enableMedia = false, questionNumber, stage = 'all', hideRemove = false }) {
  const question = value || {};
  const options = question.options?.length >= 2 ? question.options : EMPTY_OPTIONS;
  const optionImages = Array.from({ length: options.length }, (_, index) => question.optionImages?.[index] || null);
  const update = (updates) => onChange({ ...question, ...updates });
  const showContent = stage === 'all' || stage === 'content';
  const showAnswer = stage === 'all' || stage === 'answer';
  const showSettings = stage === 'all' || stage === 'settings';

  const updateOption = (index, nextValue) => {
    const nextOptions = [...options];
    nextOptions[index] = nextValue;
    update({ options: nextOptions });
  };

  const updateOptionImage = (index, asset) => {
    const nextImages = [...optionImages];
    nextImages[index] = asset;
    update({ optionImages: nextImages });
  };

  const selectedAnswers = question.correctOptionIndexes?.length
    ? question.correctOptionIndexes
    : [question.correctOptionIndex !== null && question.correctOptionIndex !== undefined && Number.isInteger(Number(question.correctOptionIndex)) ? Number(question.correctOptionIndex) : null].filter((item) => item !== null);

  const toggleCorrectAnswer = (index) => {
    const exists = selectedAnswers.includes(index);
    const correctOptionIndexes = exists ? selectedAnswers.filter((item) => item !== index) : [...selectedAnswers, index].sort((a, b) => a - b);
    const allowMultipleAnswers = correctOptionIndexes.length > 1;
    update({
      correctOptionIndexes,
      correctOptionIndex: correctOptionIndexes[0] ?? null,
      allowMultipleAnswers,
      partialScoring: allowMultipleAnswers ? Boolean(question.partialScoring) : false,
    });
  };

  const addOption = () => {
    if (options.length >= 8) return;
    update({ options: [...options, ''], optionImages: [...optionImages, null] });
  };

  const removeOption = (index) => {
    if (options.length <= 2) return;
    const nextOptions = options.filter((_, itemIndex) => itemIndex !== index);
    const nextImages = optionImages.filter((_, itemIndex) => itemIndex !== index);
    const nextCorrect = selectedAnswers.filter((item) => item !== index).map((item) => (item > index ? item - 1 : item));
    update({ options: nextOptions, optionImages: nextImages, correctOptionIndexes: nextCorrect, correctOptionIndex: nextCorrect[0] ?? null });
  };

  if (type === 'coding') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between"><div className="text-xs font-semibold text-slate-500 dark:text-gray-400">Coding Question</div>{!hideRemove && <button type="button" onClick={onRemove} title="Remove question" className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"><Trash2 className="h-4 w-4" /></button>}</div>
        <CodingQuestionEditor value={question.coding || {}} onChange={(coding) => update({ coding })} title={question.questionText || ''} onTitleChange={(nextTitle) => update({ questionText: nextTitle, coding: { ...(question.coding || {}), title: nextTitle } })} />
      </div>
    );
  }

  return (
    <article onClick={onSelect} className={`rounded-2xl border bg-white p-5 shadow-sm transition dark:bg-gray-900 ${selected ? 'border-sky-300 ring-2 ring-sky-100 dark:border-sky-700 dark:ring-sky-900/30' : 'border-slate-200 dark:border-gray-700'}`}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-gray-800">
        <div className="flex items-center gap-3"><GripVertical className="h-4 w-4 text-slate-300" /><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-xs font-bold text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">{questionNumber || 1}</span><div><p className="text-sm font-bold text-slate-900 dark:text-white">{stage === 'content' ? 'Write the question' : stage === 'answer' ? 'Set the correct answer' : stage === 'settings' ? 'Scoring and settings' : (type === 'mcq' ? 'Multiple-choice question' : type === 'one_line' ? 'One-word question' : 'Written-answer question')}</p><p className="text-[11px] text-slate-500 dark:text-gray-400">{type === 'mcq' ? 'MCQ' : type === 'one_line' ? 'One word' : 'Written answer'} · Question {questionNumber || 1}</p></div></div>
        {!hideRemove && <button type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }} title="Remove question" aria-label="Remove question" className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20"><Trash2 className="h-4 w-4" /></button>}
      </div>

      <div className="mt-5 space-y-5">
        {showContent && <div>
          <RequiredLabel>Question statement</RequiredLabel>
          <textarea value={question.questionText || ''} onChange={(event) => update({ questionText: event.target.value })} rows="3" placeholder="Write a clear, unambiguous question" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/30" />
          {enableMedia && <div className="mt-2"><QuestionImageUploader value={question.questionImage} onChange={(questionImage) => update({ questionImage })} label="Add diagram or question image" /></div>}
        </div>}

        {showAnswer && type === 'mcq' && (
          <>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
              <p className="text-xs font-bold text-slate-800 dark:text-gray-100">Question options</p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-gray-400">Mark one or more correct options below. Selecting more than one automatically makes this a multiple-answer question.</p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-200 pt-3 dark:border-gray-700">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(question.shuffleOptions)} onChange={(event) => update({ shuffleOptions: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" /><Shuffle className="h-3.5 w-3.5" />Shuffle options</label>
                {question.allowMultipleAnswers && <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600 dark:text-gray-300"><input type="checkbox" checked={Boolean(question.partialScoring)} onChange={(event) => update({ partialScoring: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />Allow partial scoring</label>}
              </div>
            </div>

            <div>
              <RequiredLabel>Answer options</RequiredLabel>
              <p className="mb-3 text-[11px] text-slate-500 dark:text-gray-400">Click the box beside every correct answer. Text, an image, or both can be used.</p>
              <div className="space-y-3">
                {options.map((option, index) => {
                  const checked = selectedAnswers.includes(index);
                  return (
                    <div key={`option-${index}`} className={`rounded-xl border p-3 transition ${checked ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-900/10' : 'border-slate-200 bg-slate-50/60 dark:border-gray-700 dark:bg-gray-800/50'}`}>
                      <div className="flex items-start gap-3">
                        <button type="button" aria-pressed={checked} onClick={() => toggleCorrectAnswer(index)} title={checked ? 'Correct answer selected' : 'Mark as correct'} className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-slate-500 dark:border-gray-600 dark:bg-gray-900'}`}>{checked ? <Check className="h-4 w-4" /> : String.fromCharCode(65 + index)}</button>
                        <div className="min-w-0 flex-1">
                          <div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Option {String.fromCharCode(65 + index)}</span>{checked && <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Correct answer</span>}</div>
                          <input value={option} onChange={(event) => updateOption(index, event.target.value)} placeholder={`Option ${String.fromCharCode(65 + index)} text`} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200" />
                          {optionImages[index]?.url && <div className="mt-2 max-w-xs"><QuestionImageUploader compact value={optionImages[index]} onChange={(asset) => updateOptionImage(index, asset)} /></div>}
                        </div>
                        {enableMedia && !optionImages[index]?.url && <QuestionImageUploader compact value={null} onChange={(asset) => updateOptionImage(index, asset)} label={`Add image to option ${index + 1}`} />}
                        {options.length > 2 && <button type="button" onClick={() => removeOption(index)} title="Remove option" aria-label={`Remove option ${index + 1}`} className="mt-1 rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><X className="h-4 w-4" /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <button type="button" onClick={addOption} disabled={options.length >= 8} className="mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"><Plus className="h-4 w-4" />Add option</button>
            </div>

            <div><RequiredLabel optional>Answer explanation</RequiredLabel><textarea value={question.answerExplanation || ''} onChange={(event) => update({ answerExplanation: event.target.value })} rows="2" placeholder="Explain why the selected answer is correct" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /></div>
          </>
        )}

        {showAnswer && type === 'short' && (
          <div className="grid gap-3 md:grid-cols-2">
            <div><RequiredLabel>Model answer</RequiredLabel><input value={question.expectedAnswer || ''} onChange={(event) => update({ expectedAnswer: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" placeholder="Model answer" /></div>
            <div><RequiredLabel optional>Accepted keywords</RequiredLabel><input value={(question.keywords || []).join(', ')} onChange={(event) => update({ keywords: event.target.value.split(',').map((keyword) => keyword.trim()).filter(Boolean) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" placeholder="Keyword 1, keyword 2" /></div>
          </div>
        )}

        {showAnswer && type === 'one_line' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <RequiredLabel>Exact one-word answer</RequiredLabel>
            <input value={question.expectedAnswer || ''} onChange={(event) => update({ expectedAnswer: event.target.value.replace(/\s+/g, '') })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" placeholder="Example: Polymorphism" />
            <p className="mt-2 text-[11px] text-slate-500 dark:text-gray-400">Spaces are removed automatically so this remains a true one-word response.</p>
          </div>
        )}

        {showSettings && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div><RequiredLabel><span className="inline-flex items-center gap-1.5"><Award className="h-3.5 w-3.5 text-emerald-600" />Positive marks</span></RequiredLabel><input type="number" step="0.01" min="0" value={question.points ?? defaultPositiveMarks} onChange={(event) => update({ points: event.target.value === '' ? '' : Number(event.target.value) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /></div>
          <div><RequiredLabel optional>Negative marks</RequiredLabel><input type="number" step="0.01" min="0" value={question.negativePoints ?? defaultNegativeMarks} onChange={(event) => update({ negativePoints: event.target.value === '' ? '' : Number(event.target.value) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /></div>
          <div><RequiredLabel>Difficulty</RequiredLabel><select value={question.difficulty || 'Easy'} onChange={(event) => update({ difficulty: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
          <div><RequiredLabel optional><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />Time limit</span></RequiredLabel><div className="relative"><input type="number" min="0" value={question.timeLimitSeconds || ''} onChange={(event) => update({ timeLimitSeconds: event.target.value === '' ? '' : Number(event.target.value) })} placeholder="No limit" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">sec</span></div></div>
        </div>}

        {showSettings && <div><RequiredLabel optional><span className="inline-flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" />Tags and skills</span></RequiredLabel><input value={(question.tags || []).join(', ')} onChange={(event) => update({ tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" placeholder="Arrays, aptitude, JavaScript" /></div>}
      </div>
    </article>
  );
}
