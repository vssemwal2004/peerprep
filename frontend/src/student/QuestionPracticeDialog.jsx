import { useEffect, useState } from 'react';
import { api } from '../utils/api';

export default function QuestionPracticeDialog({ question, onClose, onAnswered }) {
  const [detail, setDetail] = useState(null);
  const [answer, setAnswer] = useState('');
  const [subAnswers, setSubAnswers] = useState({});
  const [language, setLanguage] = useState('python');
  const [result, setResult] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api.getPracticeQuestion(question.source, question._id).then(({ question: loaded }) => {
      if (active) { setDetail(loaded); setLanguage(loaded.supportedLanguages?.[0] || 'python'); }
    }).catch((failure) => { if (active) setError(failure.message || 'Could not load question.'); });
    return () => { active = false; };
  }, [question._id, question.source]);

  const choose = (index) => {
    if (!detail.allowMultipleAnswers) return setAnswer(String(index));
    const current = answer.split(',').filter(Boolean);
    setAnswer(current.includes(String(index)) ? current.filter((item) => item !== String(index)).join(',') : [...current, String(index)].join(','));
  };
  const chooseChild = (childIndex, optionIndex, multiple) => setSubAnswers((current) => {
    const selected = current[childIndex] || [];
    return { ...current, [childIndex]: multiple
      ? selected.includes(optionIndex) ? selected.filter((item) => item !== optionIndex) : [...selected, optionIndex]
      : [optionIndex] };
  });
  const submit = async (event) => {
    event.preventDefault();
    if (!detail) return;
    setBusy(true); setError('');
    try {
      const response = await api.submitPracticeAnswer(question.source, question._id,
        detail.subquestions?.length ? subAnswers : detail.questionType === 'mcq' ? answer.split(',').filter(Boolean).map(Number) : answer, language);
      setResult(response.result);
      setFeedback(response.feedback || '');
      onAnswered?.();
    } catch (failure) { setError(failure.message || 'Could not submit answer.'); }
    finally { setBusy(false); }
  };
  const ready = detail?.subquestions?.length
    ? Object.keys(subAnswers).length === detail.subquestions.length
    : Boolean(answer.trim());

  return <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Solve question" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-zinc-900 dark:bg-[#282828] dark:text-white">
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold uppercase text-zinc-500">{detail?.questionType?.replace('_', ' ') || 'Question'}</span><button type="button" onClick={onClose} aria-label="Close question">✕</button></div>
      {!detail && !error && <p className="mt-4 text-sm text-zinc-500">Loading question…</p>}
      {detail && <>
        <h2 className="mt-4 whitespace-pre-wrap text-lg font-semibold">{detail.questionText || detail.passage?.title}</h2>
        {detail.statement && <p className="mt-3 whitespace-pre-wrap text-sm">{detail.statement}</p>}
        {detail.passage?.text && <p className="mt-3 whitespace-pre-wrap text-sm">{detail.passage.text}</p>}
        {detail.questionType === 'coding' && <label className="mt-5 block text-sm">Language <select value={language} onChange={(event) => setLanguage(event.target.value)} className="ml-2 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 dark:border-zinc-700">{(detail.supportedLanguages?.length ? detail.supportedLanguages : ['python', 'javascript', 'java', 'cpp']).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        {detail.subquestions?.length ? <div className="mt-5 space-y-5">{detail.subquestions.map((child, childIndex) => <fieldset key={childIndex} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><legend className="px-1 text-sm font-semibold">{child.questionText || `Question ${childIndex + 1}`}</legend>{child.options.map((option, optionIndex) => <label key={optionIndex} className="mt-2 flex items-center gap-3 text-sm"><input type={child.allowMultipleAnswers ? 'checkbox' : 'radio'} name={`child-${childIndex}`} checked={(subAnswers[childIndex] || []).includes(optionIndex)} onChange={() => chooseChild(childIndex, optionIndex, child.allowMultipleAnswers)} />{option}</label>)}</fieldset>)}</div>
          : detail.questionType === 'mcq' ? <div className="mt-5 space-y-2">{detail.options.map((option, index) => <label key={index} className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"><input type={detail.allowMultipleAnswers ? 'checkbox' : 'radio'} name="answer" checked={answer.split(',').includes(String(index))} onChange={() => choose(index)} />{option}</label>)}</div>
            : <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={detail.questionType === 'coding' ? 12 : 5} placeholder={detail.questionType === 'coding' ? 'Write your solution code' : 'Write your answer'} className="mt-5 w-full resize-none rounded-lg border border-zinc-200 bg-transparent p-3 font-mono text-sm dark:border-zinc-700" />}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}
      {result && <p className={`mt-4 text-sm font-semibold ${result === 'correct' ? 'text-emerald-600' : result === 'incorrect' ? 'text-rose-600' : 'text-sky-600'}`}>{feedback || (result === 'submitted' ? 'Answer submitted' : result === 'correct' ? 'Correct' : 'Try again')}</p>}
      {detail && <div className="mt-5 flex justify-end"><button type="submit" disabled={busy || !ready} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Submitting…' : 'Submit answer'}</button></div>}
    </form>
  </div>;
}
