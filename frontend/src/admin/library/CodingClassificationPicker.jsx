import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, Search, Tag, X } from 'lucide-react';
import { api } from '../../utils/api';

const idOf = (value) => String(value?._id || value || '');

export default function CodingClassificationPicker({ topicIds = [], tagIds = [], onTopicsChange, onTagsChange }) {
  const rootRef = useRef(null);
  const [topics, setTopics] = useState([]);
  const [tags, setTags] = useState([]);
  const [open, setOpen] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const [topicData, tagData] = await Promise.all([
        api.listCodingTopics({ skipCache: refresh || undefined }),
        api.listCodingTags({ skipCache: refresh || undefined }),
      ]);
      setTopics(topicData.topics || []);
      setTags(tagData.tags || []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load topics and tags.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(''); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const selectedTopicIds = useMemo(() => new Set(topicIds.map(String)), [topicIds]);
  const selectedTopics = topics.filter((topic) => selectedTopicIds.has(idOf(topic)));
  const selectedTagIds = useMemo(() => new Set(tagIds.map(String)), [tagIds]);
  const selectedTags = tags.filter((tag) => selectedTagIds.has(idOf(tag)));
  const source = open === 'topic' ? topics : tags;
  const normalizedQuery = query.trim().toLowerCase();
  const matches = source.filter((item) => !normalizedQuery || String(item.name).toLowerCase().includes(normalizedQuery));
  const exactExists = source.some((item) => String(item.name).trim().toLowerCase() === normalizedQuery);

  const toggle = (kind) => {
    setOpen((current) => current === kind ? '' : kind);
    setQuery('');
    setError('');
  };

  const selectTag = (id) => {
    const next = new Set(selectedTagIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onTagsChange(Array.from(next));
  };

  const selectTopic = (id) => {
    const next = new Set(selectedTopicIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    onTopicsChange(Array.from(next));
  };

  const create = async () => {
    const name = query.replace(/\s+/g, ' ').trim();
    if (!name || exactExists) return;
    setCreating(true);
    setError('');
    try {
      if (open === 'topic') {
        const data = await api.createCodingTopic({ name });
        setTopics((current) => [...current, data.topic].sort((a, b) => a.name.localeCompare(b.name)));
        onTopicsChange([...selectedTopicIds, idOf(data.topic)]);
      } else {
        const data = await api.createCodingTag({ name });
        setTags((current) => [...current, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
        onTagsChange([...selectedTagIds, idOf(data.tag)]);
      }
      setQuery('');
    } catch (requestError) {
      setError(requestError.message || `Unable to create ${open}.`);
    } finally {
      setCreating(false);
    }
  };

  const dropdown = (kind) => open === kind && (
    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
      <div className="relative border-b border-slate-100 p-2 dark:border-gray-800"><Search className="pointer-events-none absolute left-5 top-4 h-4 w-4 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search or add ${kind}`} className="h-9 w-full rounded-lg bg-slate-50 pl-9 pr-3 text-sm outline-none ring-sky-400 focus:ring-1 dark:bg-gray-800" /></div>
      <div className="max-h-60 overflow-y-auto p-1.5">
        {loading ? <p className="p-4 text-center text-xs text-slate-500">Loading…</p> : matches.map((item) => {
          const id = idOf(item);
          const selected = kind === 'topic' ? selectedTopicIds.has(id) : selectedTagIds.has(id);
          return <button key={id} type="button" onClick={() => { if (kind === 'topic') selectTopic(id); else selectTag(id); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${selected ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' : 'text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800'}`}><span className="min-w-0 flex-1 truncate">{item.name}</span>{kind === 'tag' && <span className="text-[10px] text-slate-400">{item.questionCount || 0}</span>}{selected && <Check className="h-4 w-4" />}</button>;
        })}
        {!loading && normalizedQuery && !exactExists && <button type="button" onClick={create} disabled={creating} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950/30">{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add “{query.trim()}”</button>}
        {!loading && !matches.length && !normalizedQuery && <p className="p-4 text-center text-xs text-slate-500">Start typing to add the first {kind}.</p>}
      </div>
    </div>
  );

  return <div ref={rootRef} className="grid gap-4 md:grid-cols-2">
    <div className="relative">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">Topics <span className="text-rose-500">*</span> <span className="font-normal text-slate-400">(one or more)</span></label>
      <button type="button" onClick={() => toggle('topic')} className={`flex min-h-11 w-full items-center rounded-xl border bg-white px-3 text-left text-sm dark:bg-gray-800 ${selectedTopics.length ? 'border-slate-200 text-slate-800 dark:border-gray-700 dark:text-white' : 'border-rose-300 text-slate-400 dark:border-rose-800'}`}><span className="min-w-0 flex-1 truncate">{selectedTopics.length ? `${selectedTopics.length} topic${selectedTopics.length === 1 ? '' : 's'} selected` : 'Select or add topics'}</span><ChevronDown className="h-4 w-4" /></button>
      {dropdown('topic')}
    </div>
    <div className="relative">
      <label className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-gray-300">Tags <span className="font-normal text-slate-400">(optional, multiple)</span></label>
      <button type="button" onClick={() => toggle('tag')} className="flex min-h-11 w-full items-center rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"><Tag className="mr-2 h-4 w-4 text-slate-400" /><span className="min-w-0 flex-1 truncate">{selectedTags.length ? `${selectedTags.length} tag${selectedTags.length === 1 ? '' : 's'} selected` : 'Select or add tags'}</span><ChevronDown className="h-4 w-4" /></button>
      {dropdown('tag')}
    </div>
    {(selectedTopics.length > 0 || selectedTags.length > 0) && <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
      <div className="flex flex-wrap gap-2">{selectedTopics.map((topic) => <span key={idOf(topic)} className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300">{topic.name}<button type="button" onClick={() => selectTopic(idOf(topic))} aria-label={`Remove ${topic.name}`}><X className="h-3 w-3" /></button></span>)}</div>
      <div className="flex flex-wrap gap-2">{selectedTags.map((tag) => <span key={idOf(tag)} className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">{tag.name}<button type="button" onClick={() => selectTag(idOf(tag))} aria-label={`Remove ${tag.name}`}><X className="h-3 w-3" /></button></span>)}</div>
    </div>}
    {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300 md:col-span-2">{error}</div>}
  </div>;
}
