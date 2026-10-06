import { useEffect, useState } from 'react';
import { api } from '../utils/api';

export default function QuestionPracticePanel() {
  const [questions, setQuestions] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [active, setActive] = useState(null);
  const [answer, setAnswer] = useState('');
  const [subAnswers, setSubAnswers] = useState({});
  const [result, setResult] = useState('');
  const [feedback, setFeedback] = useState('');
  const [language, setLanguage] = useState('python');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    api.listPracticeQuestions({ page, limit: 20, search, type }).then((data) => {
      if (current) { setQuestions(data.questions || []); setPages(data.pagination?.pages || 1); setError(''); }
    }).catch((failure) => { if (current) setError(failure.message || 'Could not load questions.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, search, type, refresh]);

  const open = async (question) => {
    setBusy(true); setError(''); setResult(''); setFeedback(''); setAnswer(''); setSubAnswers({});
    try {
      const data = await api.getPracticeQuestion(question.source, question._id);
      setActive(data.question);
      setLanguage(data.question.supportedLanguages?.[0] || 'python');
    } catch (failure) { setError(failure.message || 'Could not open question.'); }
    finally { setBusy(false); }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!active) return;
    setBusy(true); setError('');
    try {
      const response = await api.submitPracticeAnswer(active.source, active._id,
        active.subquestions?.length ? subAnswers : active.questionType === 'mcq' ? answer.split(',').filter(Boolean).map(Number) : answer, language);
      setResult(response.result);
      setFeedback(response.feedback || '');
      setRefresh((value) => value + 1);
    } catch (failure) { setError(failure.message || 'Could not submit your answer.'); }
    finally { setBusy(false); }
  };

  const choice = (index) => {
    if (!active.allowMultipleAnswers) { setAnswer(String(index)); return; }
    const current = answer.split(',').filter(Boolean);
    setAnswer(current.includes(String(index)) ? current.filter((item) => item !== String(index)).join(',') : [...current, String(index)].join(','));
  };

  const choiceChild = (childIndex, optionIndex, multiple) => {
    setSubAnswers((current) => {
      const selected = current[childIndex] || [];
      return { ...current, [childIndex]: multiple
        ? selected.includes(optionIndex) ? selected.filter((item) => item !== optionIndex) : [...selected, optionIndex]
        : [optionIndex] };
    });
  };

  return <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#282828]">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">All Questions</h2><p className="text-xs text-zinc-500">Published university and shared questions. Your practice attempts stay with your university.</p></div><div className="flex gap-2"><input aria-label="Search all questions" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search questions" className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" /><select aria-label="Question type" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }} className="rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"><option value="">All types</option><option value="mcq">MCQ</option><option value="short">Short</option><option value="one_line">One line</option><option value="coding">Coding</option></select></div></div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-600">{error}</p>}
    {loading ? <p className="mt-4 text-sm text-zinc-500">Loading questions…</p> : questions.length === 0 ? <p className="mt-4 text-sm text-zinc-500">No published questions found.</p> : <div className="mt-4 divide-y divide-zinc-100 dark:divide-zinc-700">{questions.map((question) => <button key={`${question.source}:${question._id}`} type="button" onClick={() => open(question)} className="flex w-full items-center justify-between gap-3 py-3 text-left hover:text-sky-600"><span className="min-w-0 truncate text-sm font-medium">{question.questionText || 'Untitled question'}</span><span className="shrink-0 text-xs text-zinc-500">{question.source === 'shared' ? 'Shared' : 'University'} · {question.questionType}{question.result ? ` · ${question.result}` : ''}</span></button>)}</div>}
    {pages > 1 && <div className="mt-4 flex items-center justify-end gap-3 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="disabled:opacity-40">Previous</button><span>{page} / {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(page + 1)} className="disabled:opacity-40">Next</button></div>}
    {active && <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActive(null); }}><form onSubmit={submit} role="dialog" aria-modal="true" aria-label="Solve question" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 text-zinc-900 dark:bg-[#282828] dark:text-white"><div className="flex justify-between gap-3"><span className="text-xs uppercase text-zinc-500">{active.source === 'shared' ? 'Shared question' : 'University question'} · {active.questionType}</span><button type="button" onClick={() => setActive(null)} aria-label="Close question">✕</button></div><h3 className="mt-4 whitespace-pre-wrap text-lg font-semibold">{active.questionText || active.passage?.title}</h3>{active.statement && <p className="mt-3 whitespace-pre-wrap text-sm">{active.statement}</p>}{active.passage?.text && <p className="mt-3 whitespace-pre-wrap text-sm">{active.passage.text}</p>}
      {active.questionType === 'coding' && <label className="mt-5 block text-sm">Language <select value={language} onChange={(event) => setLanguage(event.target.value)} className="ml-2 rounded-lg border border-zinc-200 bg-transparent px-3 py-2 dark:border-zinc-700">{(active.supportedLanguages?.length ? active.supportedLanguages : ['python', 'javascript', 'java', 'cpp']).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
      {active.subquestions?.length ? <div className="mt-5 space-y-5">{active.subquestions.map((child, childIndex) => <fieldset key={childIndex} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><legend className="px-1 text-sm font-semibold">{child.questionText || `Question ${childIndex + 1}`}</legend>{child.options.map((option, optionIndex) => <label key={optionIndex} className="mt-2 flex items-center gap-3 text-sm"><input type={child.allowMultipleAnswers ? 'checkbox' : 'radio'} name={`child-${childIndex}`} checked={(subAnswers[childIndex] || []).includes(optionIndex)} onChange={() => choiceChild(childIndex, optionIndex, child.allowMultipleAnswers)} />{option}</label>)}</fieldset>)}</div> : active.questionType === 'mcq' ? <div className="mt-5 space-y-2">{active.options.map((option, index) => <label key={index} className="flex items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"><input type={active.allowMultipleAnswers ? 'checkbox' : 'radio'} name="answer" checked={answer.split(',').includes(String(index))} onChange={() => choice(index)} />{option}</label>)}</div> : <textarea value={answer} onChange={(event) => setAnswer(event.target.value)} rows={active.questionType === 'coding' ? 12 : 5} placeholder={active.questionType === 'coding' ? 'Write your solution code' : 'Write your answer'} className="mt-5 w-full rounded-lg border border-zinc-200 bg-transparent p-3 font-mono text-sm dark:border-zinc-700" />}
      {error && <p role="alert" className="mt-4 text-sm text-rose-600">{error}</p>}
      {result && <p className={`mt-4 text-sm font-semibold ${result === 'correct' ? 'text-emerald-600' : result === 'incorrect' ? 'text-rose-600' : 'text-sky-600'}`}>{feedback || (result === 'submitted' ? 'Answer submitted' : result === 'correct' ? 'Correct' : 'Try again')}</p>}
      <div className="mt-5 flex justify-end"><button type="submit" disabled={busy || (active.subquestions?.length ? Object.keys(subAnswers).length < active.subquestions.length : !answer.trim())} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Submitting…' : 'Submit answer'}</button></div></form></div>}
  </section>;
}
