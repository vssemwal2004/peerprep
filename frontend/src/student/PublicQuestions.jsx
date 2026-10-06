import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';

export default function PublicQuestions() {
  const [questions, setQuestions] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.publicQuestions()
      .then((result) => { if (active) setQuestions(result.questions || []); })
      .catch((failure) => { if (active) setError(failure.message || 'Could not load questions.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => questions.filter((question) =>
    String(question.questionText || '').toLowerCase().includes(search.trim().toLowerCase())), [questions, search]);

  return <main className="mx-auto max-w-5xl space-y-5 p-6 text-slate-900 dark:text-white">
    <header><h1 className="text-2xl font-bold">Published questions</h1><p className="text-sm text-slate-500">Questions shared by the main admin.</p></header>
    <input aria-label="Search published questions" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" placeholder="Search questions" value={search} onChange={(event) => setSearch(event.target.value)} />
    {loading && <p>Loading questions…</p>}
    {error && <p role="alert" className="text-rose-600">{error}</p>}
    {!loading && !error && visible.length === 0 && <p>No published questions found.</p>}
    <div className="space-y-3">{visible.map((question) => <article key={question._id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-2 flex gap-2 text-xs text-slate-500"><span className="capitalize">{question.questionType}</span>{question.difficulty && <span>· {question.difficulty}</span>}</div>
      <h2 className="whitespace-pre-wrap font-medium">{question.questionText}</h2>
      {question.options?.length > 0 && <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-slate-600 dark:text-slate-300">{question.options.map((option, index) => <li key={`${question._id}-${index}`}>{option}</li>)}</ul>}
    </article>)}</div>
  </main>;
}
