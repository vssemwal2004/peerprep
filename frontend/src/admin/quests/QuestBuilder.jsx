import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, LoaderCircle, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { api } from '../../utils/api';
import QuestCard from '../../student/quests/QuestCard';
import { QUEST_CATEGORIES, QUEST_THEMES } from '../../student/quests/questTheme';

const field = 'mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:ring-sky-500/20';
const panel = 'rounded-2xl border border-slate-200 bg-white p-5 dark:border-zinc-800 dark:bg-[#242424]';
const keyOf = (item) => `${item.source}:${item.problemId}`;
const DIFFICULTY_PILL = { Easy: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', Medium: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300', Hard: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300' };
const blank = { title: '', description: '', category: 'study-plan', company: '', topics: [], theme: 'sky', rewardXp: 50, badgeTitle: '', semesters: [], status: 'draft', items: [] };

/** Library search with topic and company facets; the admin ticks questions into the quest. */
function LibraryPicker({ selectedKeys, onAdd, onRemove }) {
  const [query, setQuery] = useState({ search: '', difficulty: '', topic: '', company: '', page: 1 });
  const [result, setResult] = useState({ items: [], pagination: { page: 1, pages: 1, total: 0 }, facets: { topics: [], companies: [] } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const data = await api.searchQuestLibrary({ ...Object.fromEntries(Object.entries(query).filter(([, value]) => value !== '')), limit: 25 });
        if (active) setResult(data);
      } catch (cause) { if (active) setError(cause.message || 'The library could not load.'); }
      finally { if (active) setLoading(false); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [query]);
  const set = (key, value) => setQuery((previous) => ({ ...previous, [key]: value, page: key === 'page' ? value : 1 }));
  const unselected = result.items.filter((item) => !selectedKeys.has(keyOf(item)));

  return <section className={panel} aria-labelledby="quest-library-title">
    <div className="flex items-center justify-between gap-3">
      <h2 id="quest-library-title" className="font-semibold">Question library</h2>
      <span className="text-xs text-slate-500">{result.pagination.total.toLocaleString()} matching</span>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      <label className="relative block sm:col-span-2"><span className="sr-only">Search the library</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input value={query.search} onChange={(event) => set('search', event.target.value)} placeholder="Search by title, topic or company" className={`${field} mt-0 pl-9`} />
      </label>
      <label className="text-xs font-medium">Difficulty<select className={field} value={query.difficulty} onChange={(event) => set('difficulty', event.target.value)}><option value="">Any</option>{['Easy', 'Medium', 'Hard'].map((level) => <option key={level}>{level}</option>)}</select></label>
      <label className="text-xs font-medium">Topic<select className={field} value={query.topic} onChange={(event) => set('topic', event.target.value)}><option value="">Any topic</option>{result.facets.topics.map((facet) => <option key={facet.name} value={facet.name}>{facet.name} ({facet.count})</option>)}</select></label>
      <label className="text-xs font-medium sm:col-span-2">Company<select className={field} value={query.company} onChange={(event) => set('company', event.target.value)}><option value="">Any company</option>{result.facets.companies.map((facet) => <option key={facet.name} value={facet.name}>{facet.name} ({facet.count})</option>)}</select></label>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
    <div className="mt-3 flex items-center justify-between gap-2">
      <p className="text-xs text-slate-500">{loading ? 'Loading…' : `Page ${result.pagination.page} of ${result.pagination.pages}`}</p>
      <button type="button" disabled={!unselected.length} onClick={() => onAdd(unselected)} className="text-xs font-semibold text-sky-700 disabled:opacity-40 dark:text-sky-300">Add all {unselected.length} on this page</button>
    </div>
    <ul className="mt-2 max-h-[460px] space-y-1.5 overflow-y-auto" aria-busy={loading}>
      {result.items.map((item) => {
        const added = selectedKeys.has(keyOf(item));
        return <li key={keyOf(item)} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${added ? 'border-sky-200 bg-sky-50/60 dark:border-sky-500/30 dark:bg-sky-500/10' : 'border-slate-200 dark:border-zinc-700'}`}>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={item.title}>{item.title}</p>
            <p className="truncate text-[11px] text-slate-500">{[...item.tags.slice(0, 3), ...item.companies.slice(0, 2)].join(' · ') || (item.source === 'shared' ? 'Shared library' : 'University library')}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_PILL[item.difficulty] || ''}`}>{item.difficulty}</span>
          <button type="button" onClick={() => (added ? onRemove(keyOf(item)) : onAdd([item]))} aria-label={`${added ? 'Remove' : 'Add'} ${item.title}`}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${added ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>
            {added ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          </button>
        </li>;
      })}
      {!loading && !result.items.length && <li className="py-8 text-center text-sm text-slate-500">No library questions match these filters.</li>}
    </ul>
    <div className="mt-3 flex justify-between">
      <button type="button" disabled={result.pagination.page <= 1 || loading} onClick={() => set('page', result.pagination.page - 1)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800">Previous</button>
      <button type="button" disabled={result.pagination.page >= result.pagination.pages || loading} onClick={() => set('page', result.pagination.page + 1)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:text-zinc-300 dark:hover:bg-zinc-800">Next</button>
    </div>
  </section>;
}

export default function QuestBuilder({ questId, onDone }) {
  const [form, setForm] = useState(blank);
  const [loading, setLoading] = useState(Boolean(questId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [topicDraft, setTopicDraft] = useState('');

  useEffect(() => {
    if (!questId) return undefined;
    let active = true;
    api.getAdminQuest(questId).then(({ quest }) => {
      if (!active) return;
      setForm({ ...blank, ...quest, items: quest.items.map((item) => ({ source: item.source, problemId: item.problemId, section: item.section || '', title: item.title, difficulty: item.difficulty, tags: item.tags || [], available: item.available })) });
    }).catch((cause) => active && setError(cause.message || 'The quest could not load.')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [questId]);

  const selectedKeys = useMemo(() => new Set(form.items.map(keyOf)), [form.items]);
  const change = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const addItems = (items) => change('items', [...form.items, ...items.filter((item) => !selectedKeys.has(keyOf(item))).map((item) => ({ source: item.source, problemId: item.problemId, section: '', title: item.title, difficulty: item.difficulty, tags: item.tags, available: true }))]);
  const removeItem = (key) => change('items', form.items.filter((item) => keyOf(item) !== key));
  const moveItem = (index, delta) => {
    const next = [...form.items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change('items', next);
  };
  const addTopic = () => {
    const topic = topicDraft.trim();
    if (topic && !form.topics.includes(topic) && form.topics.length < 10) change('topics', [...form.topics, topic]);
    setTopicDraft('');
  };
  const difficulty = form.items.reduce((acc, item) => ({ ...acc, [item.difficulty]: (acc[item.difficulty] || 0) + 1 }), { Easy: 0, Medium: 0, Hard: 0 });
  const preview = { id: 'preview', slug: '', title: form.title || 'Untitled quest', description: form.description, category: form.category, company: form.company, theme: form.theme,
    rewardXp: form.rewardXp, total: form.items.length, solved: 0, difficulty, started: false, badge: { title: form.badgeTitle || `${form.title || 'Quest'} Finisher` } };

  const save = async (status) => {
    setSaving(true); setError('');
    const payload = { ...form, status, items: form.items.map(({ source, problemId, section }) => ({ source, problemId, section })) };
    try {
      if (questId) await api.updateQuest(questId, payload); else await api.createQuest(payload);
      onDone(status === 'published' ? 'Quest published. Students can see it now.' : 'Draft saved.');
    } catch (cause) { setError(cause.message || 'The quest could not be saved.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" role="status" aria-label="Loading quest" />;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={() => onDone()} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-zinc-300"><ArrowLeft className="h-4 w-4" />All quests</button>
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => save('draft')} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"><Save className="h-4 w-4" />Save draft</button>
        <button type="button" disabled={saving || !form.items.length} onClick={() => save('published')} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{form.status === 'published' ? 'Save and keep published' : 'Publish quest'}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-900/10 dark:text-rose-300">{error}</p>}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-5">
        <section className={panel} aria-labelledby="quest-details-title">
          <h2 id="quest-details-title" className="font-semibold">Quest details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-medium sm:col-span-2">Quest name<input className={field} maxLength={80} value={form.title} onChange={(event) => change('title', event.target.value)} placeholder="e.g. Amazon Top 50 or 75 Hard" /></label>
            <label className="text-xs font-medium sm:col-span-2">Description<textarea className={field} rows={3} maxLength={600} value={form.description} onChange={(event) => change('description', event.target.value)} placeholder="Who is this quest for and what will it build?" /></label>
            <label className="text-xs font-medium">Type<select className={field} value={form.category} onChange={(event) => change('category', event.target.value)}>{QUEST_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select></label>
            <label className="text-xs font-medium">Company (optional)<input className={field} maxLength={60} value={form.company} onChange={(event) => change('company', event.target.value)} placeholder="e.g. Amazon" /></label>
            <div className="text-xs font-medium sm:col-span-2">Topics (up to 10)
              <div className="mt-1 flex gap-2"><input className={`${field} mt-0`} value={topicDraft} maxLength={40} onChange={(event) => setTopicDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTopic(); } }} placeholder="Type a topic and press Enter" /><button type="button" onClick={addTopic} className="rounded-lg bg-slate-100 px-3 text-sm font-semibold dark:bg-zinc-800">Add</button></div>
              {form.topics.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{form.topics.map((topic) => <span key={topic} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-xs dark:bg-zinc-800">{topic}<button type="button" aria-label={`Remove ${topic}`} onClick={() => change('topics', form.topics.filter((value) => value !== topic))} className="rounded-full p-0.5 hover:bg-slate-200 dark:hover:bg-zinc-700"><X className="h-3 w-3" /></button></span>)}</div>}
            </div>
            <div className="text-xs font-medium sm:col-span-2" role="radiogroup" aria-label="Theme">Theme
              <div className="mt-1.5 flex flex-wrap gap-2">{Object.entries(QUEST_THEMES).map(([name, theme]) => <button key={name} type="button" role="radio" aria-checked={form.theme === name} aria-label={name} onClick={() => change('theme', name)} className={`h-9 w-14 rounded-lg bg-gradient-to-br ${theme.band} ring-offset-2 dark:ring-offset-zinc-900 ${form.theme === name ? 'ring-2 ring-slate-900 dark:ring-white' : ''}`} />)}</div>
            </div>
            <label className="text-xs font-medium">Completion XP<input className={field} type="number" min={0} max={1000} value={form.rewardXp} onChange={(event) => change('rewardXp', Number(event.target.value))} /></label>
            <label className="text-xs font-medium">Badge name (optional)<input className={field} maxLength={60} value={form.badgeTitle} onChange={(event) => change('badgeTitle', event.target.value)} placeholder={`${form.title || 'Quest'} Finisher`} /></label>
            <div className="text-xs font-medium sm:col-span-2">Visible to
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button type="button" aria-pressed={!form.semesters.length} onClick={() => change('semesters', [])} className={`rounded-full px-3 py-1 text-xs font-semibold ${!form.semesters.length ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-zinc-800'}`}>All students</button>
                {Array.from({ length: 8 }, (_, index) => index + 1).map((semester) => { const on = form.semesters.includes(semester); return <button key={semester} type="button" aria-pressed={on} onClick={() => change('semesters', on ? form.semesters.filter((value) => value !== semester) : [...form.semesters, semester].sort((a, b) => a - b))} className={`rounded-full px-3 py-1 text-xs font-semibold ${on ? 'bg-sky-600 text-white' : 'bg-slate-100 dark:bg-zinc-800'}`}>Semester {semester}</button>; })}
              </div>
            </div>
          </div>
        </section>

        <section className={panel} aria-labelledby="quest-items-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="quest-items-title" className="font-semibold">Questions in this quest <span className="font-normal text-slate-500">({form.items.length})</span></h2>
            <p className="text-xs text-slate-500">{['Easy', 'Medium', 'Hard'].map((level) => `${difficulty[level]} ${level}`).join(' · ')}</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">Order is the order students see. Give questions the same section name to group them (for example “Week 1”).</p>
          {!form.items.length ? <p className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-zinc-700">Add questions from the library.</p>
            : <ol className="mt-3 space-y-1.5">{form.items.map((item, index) => <li key={keyOf(item)} className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 sm:flex-nowrap ${item.available === false ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-500/10' : 'border-slate-200 dark:border-zinc-700'}`}>
              <span className="w-6 shrink-0 text-xs tabular-nums text-slate-400">{index + 1}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" title={item.title}>{item.title}</p>{item.available === false && <p className="text-[11px] text-amber-700 dark:text-amber-300">No longer published. Remove it before saving.</p>}</div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${DIFFICULTY_PILL[item.difficulty] || ''}`}>{item.difficulty}</span>
              <input aria-label={`Section for ${item.title}`} value={item.section} maxLength={60} onChange={(event) => change('items', form.items.map((entry, position) => position === index ? { ...entry, section: event.target.value } : entry))} placeholder="Section" className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900" />
              <div className="flex shrink-0 items-center">
                <button type="button" aria-label={`Move ${item.title} up`} disabled={!index} onClick={() => moveItem(index, -1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-800"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" aria-label={`Move ${item.title} down`} disabled={index === form.items.length - 1} onClick={() => moveItem(index, 1)} className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-800"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" aria-label={`Remove ${item.title}`} onClick={() => removeItem(keyOf(item))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>)}</ol>}
        </section>
      </div>

      <div className="space-y-5">
        <section className={panel} aria-label="Student preview">
          <h2 className="font-semibold">Student preview</h2>
          <p className="mt-1 text-xs text-slate-500">How the quest card appears on the Quests page.</p>
          <div className="pointer-events-none mt-4 flex [&>a]:flex-1">{/* Preview only; the card link is inert here. */}<QuestCard quest={preview} /></div>
        </section>
        <LibraryPicker selectedKeys={selectedKeys} onAdd={addItems} onRemove={removeItem} />
      </div>
    </div>
  </div>;
}
