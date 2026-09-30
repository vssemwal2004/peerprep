import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Layers3, Search, Tags, X } from 'lucide-react';
import { api } from '../../utils/api';

const RESULT_LIMIT = 75;
const idOf = (value) => String(value?._id || value || '');
const mergeItems = (...groups) => Array.from(new Map(groups.flat().map((item) => [idOf(item), item])).values());

async function fetchOptions(kind, search, selectedIds) {
  const method = kind === 'topics' ? api.listCodingTopics : api.listCodingTags;
  const key = kind === 'topics' ? 'topics' : 'tags';
  const [results, selected] = await Promise.all([
    method({ search: search.trim() || undefined, limit: RESULT_LIMIT, skipCache: true }),
    selectedIds.length ? method({ ids: selectedIds.join(','), limit: Math.min(200, selectedIds.length), skipCache: true }) : Promise.resolve({ [key]: [] }),
  ]);
  return {
    items: mergeItems(selected[key] || [], results[key] || []),
    total: Number(results.pagination?.total || 0),
    uncategorizedCount: Number(results.uncategorizedCount || 0),
  };
}

export default function CodingQuestionFilterDrawer({ open, onClose, filters, onApply, availableDifficulties = [], availableAssessments = [] }) {
  const [draft, setDraft] = useState(filters);
  const [filterMode, setFilterMode] = useState('topics');
  const [topics, setTopics] = useState([]);
  const [tags, setTags] = useState([]);
  const [topicTotal, setTopicTotal] = useState(0);
  const [tagTotal, setTagTotal] = useState(0);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [topicSearch, setTopicSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedTopics = useMemo(() => new Set((draft.topicIds || []).map(String)), [draft.topicIds]);
  const selectedTags = useMemo(() => new Set((draft.tagIds || []).map(String)), [draft.tagIds]);
  const topicMode = draft.topicMode || (draft.uncategorized ? 'uncategorized' : draft.topicIds?.length ? 'selected' : 'all');
  const hasTopicCondition = topicMode === 'uncategorized' || selectedTopics.size > 0;
  const hasTagCondition = selectedTags.size > 0;

  useEffect(() => {
    if (!open) return undefined;
    setDraft({ ...filters, topicIds: [...(filters.topicIds || [])], tagIds: [...(filters.tagIds || [])], topicMode: filters.uncategorized ? 'uncategorized' : (filters.topicIds || []).length ? 'selected' : 'all' });
    setFilterMode((filters.tagIds || []).length && ((filters.topicIds || []).length || filters.uncategorized) ? 'combined' : (filters.tagIds || []).length ? 'tags' : 'topics');
    setTopicSearch(''); setTagSearch(''); setError('');
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    const escape = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || filters.type !== 'coding') return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const [topicResult, tagResult] = await Promise.all([
          filterMode !== 'tags' ? fetchOptions('topics', topicSearch, Array.from(selectedTopics)) : null,
          filterMode !== 'topics' ? fetchOptions('tags', tagSearch, Array.from(selectedTags)) : null,
        ]);
        if (cancelled) return;
        if (topicResult) { setTopics(topicResult.items); setTopicTotal(topicResult.total); setUncategorizedCount(topicResult.uncategorizedCount); }
        if (tagResult) { setTags(tagResult.items); setTagTotal(tagResult.total); }
      } catch (requestError) { if (!cancelled) setError(requestError.message || 'Unable to load classification options.'); } finally { if (!cancelled) setLoading(false); }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [filterMode, filters.type, open, selectedTags, selectedTopics, tagSearch, topicSearch]);

  if (!open) return null;
  const toggle = (field, value) => setDraft((current) => {
    const next = new Set((current[field] || []).map(String));
    if (next.has(value)) next.delete(value); else next.add(value);
    return { ...current, [field]: Array.from(next), ...(field === 'topicIds' ? { topicMode: 'selected', uncategorized: false } : {}) };
  });
  const setTopicMode = (mode) => setDraft((current) => ({ ...current, topicMode: mode, topicIds: mode === 'selected' ? current.topicIds : [], uncategorized: mode === 'uncategorized' }));
  const changeFilterMode = (mode) => {
    setFilterMode(mode);
    setDraft((current) => ({
      ...current,
      ...(mode === 'topics' ? { tagIds: [] } : {}),
      ...(mode === 'tags' ? { topicIds: [], uncategorized: false, topicMode: 'all' } : {}),
    }));
  };
  const reset = () => setDraft({ ...filters, type: filters.type, search: filters.search || '', tag: '', difficulty: '', status: '', visibility: '', sourceAssessmentId: '', topicIds: [], tagIds: [], topicLabels: [], tagLabels: [], topicScope: 'direct', topicMatch: 'any', tagMatch: 'any', classificationMatch: 'all', uncategorized: false, topicMode: 'all', viewMode: 'questions', folderBy: 'topics' });
  const selectedTopicItems = topics.filter((item) => selectedTopics.has(idOf(item)));
  const selectedTagItems = tags.filter((item) => selectedTags.has(idOf(item)));
  const pageLabel = { coding: 'Coding questions', mcq: 'MCQs', one_line: 'One-word questions', short: 'Short questions', all: 'All questions' }[filters.type || 'all'] || 'Current question page';
  const classificationEnabled = filters.type === 'coding';
  const topicLogic = topicMode === 'all' ? 'all topics' : topicMode === 'uncategorized' ? 'questions without a topic' : `${selectedTopics.size} selected topic(s)`;
  const activeLogic = !classificationEnabled ? `${pageLabel} page filters` : filterMode === 'topics'
    ? `Topic-wise: ${topicLogic}`
    : filterMode === 'tags'
      ? `Tag-wise: ${selectedTags.size ? `${selectedTags.size} selected tag(s)` : 'all tags'}`
      : `${topicLogic} ${draft.classificationMatch === 'any' ? 'OR' : 'AND'} ${selectedTags.size ? `${selectedTags.size} selected tag(s)` : 'all tags'}`;

  return <><button type="button" aria-label="Close filters" onClick={onClose} className="fixed inset-0 z-[110] bg-slate-950/35 backdrop-blur-[1px]" /><aside role="dialog" aria-modal="true" aria-label="Question bank filters" className="fixed inset-y-0 right-0 z-[111] flex h-dvh w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
    <header className="flex min-h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-gray-700"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600">Question bank</p><h2 className="mt-0.5 text-base font-bold text-slate-950 dark:text-white">Search and filter</h2></div><button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 dark:border-gray-700"><X className="h-4 w-4" /></button></header>
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300"><span className="font-bold text-slate-900 dark:text-white">Current page:</span> {pageLabel}. Filters will not change the question type.</div>
      {classificationEnabled && <section className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700">
        <div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Results layout</h3><p className="mt-0.5 text-[11px] text-slate-500">Choose how matching coding questions appear on the main screen.</p></div>
        <div className="mt-3 grid grid-cols-2 gap-2">{[['questions', 'Direct questions', 'Show the question table immediately'], ['folders', 'Folder structure', 'One expandable folder per row']].map(([value, label, detail]) => <button key={value} type="button" onClick={() => setDraft((current) => ({ ...current, viewMode: value }))} className={`rounded-xl border px-3 py-3 text-left ${(draft.viewMode || 'questions') === value ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300' : 'border-slate-200 text-slate-600 dark:border-gray-700 dark:text-gray-300'}`}><span className="block text-xs font-bold">{label}</span><span className="mt-1 block text-[10px] opacity-75">{detail}</span></button>)}</div>
        {(draft.viewMode || 'questions') === 'folders' && <div className="mt-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Build folders from</p><div className="grid grid-cols-2 gap-2">{[['topics', 'Topic folders'], ['tags', 'Tag folders']].map(([value, label]) => <button key={value} type="button" onClick={() => setDraft((current) => ({ ...current, folderBy: value }))} className={`rounded-xl border px-3 py-2.5 text-xs font-bold ${(draft.folderBy || 'topics') === value ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/30 dark:text-violet-300' : 'border-slate-200 text-slate-600 dark:border-gray-700 dark:text-gray-300'}`}>{label}</button>)}</div></div>}
      </section>}
      {classificationEnabled && <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-gray-700">
        <div className="border-b border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-800/60"><p className="px-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Filter questions by</p><div className="mt-2 grid grid-cols-3 gap-2">{[
          ['topics', 'Topic-wise', Layers3, 'Only topics'],
          ['tags', 'Tag-wise', Tags, 'Only tags'],
          ['combined', 'Topic + Tag', Check, 'Combine both'],
        ].map(([key, label, Icon, detail]) => <button key={key} type="button" onClick={() => changeFilterMode(key)} className={`rounded-xl border px-2 py-2.5 text-left transition ${filterMode === key ? 'border-sky-300 bg-white text-sky-700 shadow-sm dark:border-sky-700 dark:bg-gray-900 dark:text-sky-300' : 'border-transparent text-slate-500 hover:border-slate-200 dark:text-gray-400 dark:hover:border-gray-700'}`}><span className="flex items-center gap-1.5 text-xs font-bold"><Icon className="h-3.5 w-3.5" />{label}</span><span className="mt-0.5 block text-[9px] opacity-70">{detail}</span></button>)}</div></div>
        <div className="p-4">
          {filterMode !== 'tags' && <section><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Topics</h3><p className="mt-0.5 text-[11px] text-slate-500">Choose individual or multiple topic groups.</p></div><Layers3 className="h-5 w-5 text-sky-600" /></div>
            <div className="grid grid-cols-3 gap-2">{[['all', 'All topics', topicTotal], ['selected', 'Choose topics', selectedTopics.size], ['uncategorized', 'No topic', uncategorizedCount]].map(([mode, label, count]) => <button key={mode} type="button" onClick={() => setTopicMode(mode)} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${topicMode === mode ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300' : 'border-slate-200 text-slate-600 dark:border-gray-700 dark:text-gray-300'}`}><span className="block">{label}</span><span className="mt-0.5 block text-[10px] opacity-70">{count}</span></button>)}</div>
            {topicMode === 'selected' && <SelectorPanel query={topicSearch} setQuery={setTopicSearch} placeholder="Search thousands of topics" items={topics} total={topicTotal} selected={selectedTopics} loading={loading} countKey="directQuestionCount" onToggle={(id) => toggle('topicIds', id)} onSelectVisible={() => setDraft((current) => ({ ...current, topicIds: Array.from(new Set([...(current.topicIds || []), ...topics.map(idOf)])), uncategorized: false }))} onClear={() => setDraft((current) => ({ ...current, topicIds: [] }))} />}
            {selectedTopicItems.length > 0 && <SelectedChips items={selectedTopicItems} onRemove={(id) => toggle('topicIds', id)} tone="sky" />}
            {selectedTopics.size > 1 && <div className="mt-4 grid gap-3 sm:grid-cols-2"><Select label="Selected-topic rule" value={draft.topicMatch || 'any'} onChange={(topicMatch) => setDraft((current) => ({ ...current, topicMatch }))} options={[["any", 'Match any selected topic'], ['all', 'Match every selected topic']]} /><Select label="Hierarchy scope" value={draft.topicScope || 'direct'} onChange={(topicScope) => setDraft((current) => ({ ...current, topicScope }))} options={[["direct", 'Direct assignments only'], ['descendants', 'Include subtopics']]} /></div>}
          </section>}
          {filterMode === 'combined' && <div className="my-5 border-t border-dashed border-slate-200 dark:border-gray-700" />}
          {filterMode !== 'topics' && <section><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-bold text-slate-900 dark:text-white">Tags</h3><p className="mt-0.5 text-[11px] text-slate-500">Choose independent skill or technique tags.</p></div><Tags className="h-5 w-5 text-violet-600" /></div>
            <SelectorPanel query={tagSearch} setQuery={setTagSearch} placeholder="Search thousands of tags" items={tags} total={tagTotal} selected={selectedTags} loading={loading} countKey="questionCount" onToggle={(id) => toggle('tagIds', id)} onSelectVisible={() => setDraft((current) => ({ ...current, tagIds: Array.from(new Set([...(current.tagIds || []), ...tags.map(idOf)])) }))} onClear={() => setDraft((current) => ({ ...current, tagIds: [] }))} empty="No controlled tags yet. Add tags during coding-question creation." />
            {selectedTagItems.length > 0 && <SelectedChips items={selectedTagItems} onRemove={(id) => toggle('tagIds', id)} tone="violet" />}
            {selectedTags.size > 1 && <Select label="Selected-tag rule" value={draft.tagMatch || 'any'} onChange={(tagMatch) => setDraft((current) => ({ ...current, tagMatch }))} options={[["any", 'Match any selected tag'], ['all', 'Match every selected tag']]} />}
          </section>}
        </div>
      </section>}

      {classificationEnabled && filterMode === 'combined' && hasTopicCondition && hasTagCondition && <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-900/60 dark:bg-violet-950/20"><h3 className="text-sm font-bold text-slate-900 dark:text-white">Topic–tag relationship</h3><div className="mt-3 grid grid-cols-2 gap-2">{[['all', 'Match both groups', 'Topic AND tag'], ['any', 'Match either group', 'Topic OR tag']].map(([value, label, detail]) => <button key={value} type="button" onClick={() => setDraft((current) => ({ ...current, classificationMatch: value }))} className={`rounded-xl border px-3 py-2.5 text-left ${String(draft.classificationMatch || 'all') === value ? 'border-violet-300 bg-white text-violet-700 shadow-sm dark:border-violet-700 dark:bg-gray-900 dark:text-violet-300' : 'border-violet-100 text-slate-600 dark:border-violet-900 dark:text-gray-300'}`}><span className="block text-xs font-bold">{label}</span><span className="mt-0.5 block text-[10px] opacity-70">{detail}</span></button>)}</div></section>}

      <details className="rounded-2xl border border-slate-200 p-4 dark:border-gray-700"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold text-slate-900 dark:text-white">More filters <ChevronDown className="h-4 w-4 text-slate-400" /></summary><div className="mt-4 grid gap-3 sm:grid-cols-2"><Select label="Difficulty" value={draft.difficulty || ''} onChange={(difficulty) => setDraft((current) => ({ ...current, difficulty }))} options={[["", 'All levels'], ...availableDifficulties.map((value) => [value, value])]} /><Select label="Status" value={draft.status || ''} onChange={(status) => setDraft((current) => ({ ...current, status }))} options={[["", 'All statuses'], ['published', 'Published'], ['draft', 'Draft'], ['hidden', 'Hidden'], ['archived', 'Archived']]} /><Select label="Visibility" value={draft.visibility || ''} onChange={(visibility) => setDraft((current) => ({ ...current, visibility }))} options={[["", 'All visibility'], ['public', 'Public'], ['private', 'Private']]} /><Select label="Assessment" value={draft.sourceAssessmentId || ''} onChange={(sourceAssessmentId) => setDraft((current) => ({ ...current, sourceAssessmentId }))} options={[["", 'All assessments'], ...availableAssessments.map((item) => [item.id, item.title])]} /></div></details>
    </div>
    <footer className="border-t border-slate-200 p-4 dark:border-gray-700"><p className="mb-3 text-[11px] text-slate-500"><span className="font-bold text-slate-700 dark:text-gray-200">Active logic:</span> {activeLogic}.</p><div className="flex gap-3"><button type="button" onClick={reset} className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 dark:border-gray-700 dark:text-gray-300">Reset page filters</button><button type="button" onClick={() => { const allTopicsSelected = topicTotal > 0 && selectedTopics.size >= topicTotal && String(draft.topicMatch || 'any') === 'any'; const allTagsSelected = tagTotal > 0 && selectedTags.size >= tagTotal && String(draft.tagMatch || 'any') === 'any'; const next = { ...draft, topicIds: allTopicsSelected ? [] : Array.from(selectedTopics), tagIds: allTagsSelected ? [] : Array.from(selectedTags), topicLabels: allTopicsSelected ? [] : selectedTopicItems.map((item) => ({ id: idOf(item), name: item.name })), tagLabels: allTagsSelected ? [] : selectedTagItems.map((item) => ({ id: idOf(item), name: item.name })) }; delete next.topicMode; onApply(next); onClose(); }} className="h-10 flex-1 rounded-xl bg-sky-600 px-4 text-xs font-bold text-white hover:bg-sky-500">Show matching questions</button></div></footer>
  </aside></>;
}

function SelectorPanel({ query, setQuery, placeholder, items, total, selected, loading, countKey, onToggle, onSelectVisible, onClear, empty = 'No matching topics.' }) {
  return <div className="mt-3"><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-800" /></div><div className="mt-2 flex items-center justify-between px-1 text-[10px]"><span className="font-semibold text-slate-400">{selected.size} selected · {total} found</span><span className="flex gap-3"><button type="button" onClick={onSelectVisible} disabled={!items.length} className="font-bold text-sky-600 disabled:opacity-40">Select loaded</button><button type="button" onClick={onClear} disabled={!selected.size} className="font-bold text-slate-500 disabled:opacity-40">Clear</button></span></div><div className="mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 p-1 dark:border-gray-700">{loading ? <p className="p-5 text-center text-xs text-slate-500">Searching…</p> : items.length ? items.map((item) => { const id = idOf(item); const active = selected.has(id); return <button key={id} type="button" onClick={() => onToggle(id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${active ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800'}`}><span className="min-w-0 flex-1 truncate">{item.name}</span><span className="text-[10px] text-slate-400">{item[countKey] || 0}</span>{active && <Check className="h-4 w-4" />}</button>; }) : <p className="p-5 text-center text-xs text-slate-500">{empty}</p>}</div>{total > RESULT_LIMIT && <p className="mt-2 text-[10px] text-slate-400">Showing the best {RESULT_LIMIT} results. Type more characters to narrow the list.</p>}</div>;
}

function SelectedChips({ items, onRemove, tone }) { const colors = tone === 'violet' ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300' : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300'; return <div className="mt-3 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{items.map((item) => <span key={idOf(item)} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${colors}`}>{item.name}<button type="button" onClick={() => onRemove(idOf(item))} aria-label={`Remove ${item.name}`}><X className="h-3 w-3" /></button></span>)}</div>; }
function Select({ label, value, onChange, options }) { return <label className="grid gap-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal dark:border-gray-700 dark:bg-gray-800">{options.map(([optionValue, optionLabel]) => <option key={optionValue || 'all'} value={optionValue}>{optionLabel}</option>)}</select></label>; }
