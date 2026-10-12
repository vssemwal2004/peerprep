import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Building2, Check, ClipboardList, Flame, Gauge, GraduationCap, Layers, LibraryBig, Rocket, Save, Sparkles, Tags, Trash2, TriangleAlert, Users, X, Zap,
} from 'lucide-react';
import { api } from '../../utils/api';
import QuestCard from '../../student/quests/QuestCard';
import { QUEST_CATEGORIES, QUEST_THEMES } from '../../student/quests/questTheme';
import { Chips, DifficultyPill, MixBar, MultiSelect, Notice, Page, PageHeader, SelectMenu, StatusPill, card, inputClass, primaryButton, secondaryButton } from './ui';
import { plural } from './format';
import { QUICKPREP_ROOT, quickPrepLibraryUrl } from './useQuickPrepActions';

const STEPS = [
  { key: 'details', label: 'Details', hint: 'Name, type, companies and topics', icon: ClipboardList },
  { key: 'questions', label: 'Questions', hint: 'Pick from the library and order them', icon: LibraryBig },
  { key: 'publish', label: 'Audience & publish', hint: 'Who sees it and what they earn', icon: Rocket },
];
const SEMESTERS = [1, 2, 3, 4, 5, 6, 7, 8];
const XP_PRESETS = [25, 50, 100, 200];
const blank = { title: '', description: '', category: 'company', companies: [], topics: [], difficulties: [], theme: 'sky', rewardXp: 50, badgeTitle: '', semesters: [], items: [], status: 'draft' };
const toForm = (quest) => ({ ...blank, ...Object.fromEntries(Object.keys(blank).map((key) => [key, quest[key] ?? blank[key]])), companies: quest.companies || [] });
const itemPayload = (items) => items.map(({ source, problemId, section }) => ({ source, problemId, section: section || '' }));
const detailsPayload = (form) => ({ title: form.title, description: form.description, category: form.category, companies: form.companies, topics: form.topics, difficulties: form.difficulties, theme: form.theme });

/** Create or edit a QuickPrep in three steps; questions come from the library page between steps 1 and 3. */
export default function QuickPrepWizard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const step = id && STEPS.some((entry) => entry.key === params.get('step')) ? params.get('step') : 'details';
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState(null);
  const [taxonomy, setTaxonomy] = useState({ companies: [], topics: [], loading: true });
  const [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(() => {
    if (!params.has('added')) return null;
    const added = Number(params.get('added')) || 0;
    const skipped = Number(params.get('skipped')) || 0;
    return { tone: added ? 'success' : 'warning', text: `${plural(added, 'question')} added from the library.${skipped ? ` ${plural(skipped, 'selected question')} could not be added; the library showed why.` : ''}` };
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try { const { quest } = await api.getAdminQuest(id); setSaved(quest); setForm(toForm(quest)); }
    catch (cause) { setMessage({ tone: 'error', text: cause.message || 'This QuickPrep could not load.' }); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let live = true;
    api.getQuestTaxonomy().then((result) => { if (live) setTaxonomy({ ...result, loading: false }); }).catch(() => { if (live) setTaxonomy((previous) => ({ ...previous, loading: false })); });
    return () => { live = false; };
  }, []);

  const set = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  const goTo = (key) => { setMessage(null); const next = new URLSearchParams(); next.set('step', key); setParams(next, { replace: true }); window.scrollTo?.({ top: 0, behavior: 'smooth' }); };
  const itemsDirty = saved && JSON.stringify(itemPayload(form.items)) !== JSON.stringify(itemPayload(saved.items));

  const save = async (body, success) => {
    setBusy(true); setMessage(null);
    try {
      const { quest } = await api.updateQuest(id, body);
      setSaved(quest); setForm(toForm(quest));
      if (success) setMessage({ tone: 'success', text: success });
      return quest;
    } catch (cause) { setMessage({ tone: 'error', text: cause.message || 'Changes could not be saved.' }); return null; }
    finally { setBusy(false); }
  };

  const saveDetails = async () => {
    if (form.title.trim().length < 3) { setMessage({ tone: 'error', text: 'Give the QuickPrep a name of at least 3 characters.' }); return; }
    if (!id) {
      setBusy(true); setMessage(null);
      try {
        const { quest } = await api.createQuest({ ...detailsPayload(form), rewardXp: form.rewardXp, status: 'draft', items: [] });
        navigate(`${QUICKPREP_ROOT}/${quest.id}/edit?step=questions`, { replace: true });
      } catch (cause) { setMessage({ tone: 'error', text: cause.message || 'The QuickPrep could not be created.' }); }
      finally { setBusy(false); }
      return;
    }
    if (await save(detailsPayload(form))) goTo('questions');
  };
  const saveQuestions = async (next) => {
    if (itemsDirty && !await save({ items: itemPayload(form.items) }, next ? null : 'Question order and sections saved.')) return;
    if (next) goTo(next);
  };
  const openLibrary = async () => {
    if (itemsDirty && !await save({ items: itemPayload(form.items) })) return;
    navigate(quickPrepLibraryUrl({ id, title: form.title }));
  };
  const finish = async (status) => {
    const quest = await save({ ...detailsPayload(form), items: itemPayload(form.items), rewardXp: Number(form.rewardXp), badgeTitle: form.badgeTitle, semesters: form.semesters, status });
    if (quest) navigate(`${QUICKPREP_ROOT}/${quest.id}`, { state: { notice: status === 'published' ? `“${quest.title}” is live for students.` : `“${quest.title}” saved as a draft.` } });
  };

  const stepIndex = STEPS.findIndex((entry) => entry.key === step);
  const reachable = (key) => key === 'details' || Boolean(id);
  const preview = useMemo(() => {
    const available = form.items.filter((item) => item.available !== false);
    const difficulty = available.reduce((mix, item) => { if (mix[item.difficulty] !== undefined) mix[item.difficulty] += 1; return mix; }, { Easy: 0, Medium: 0, Hard: 0 });
    return { id: 'preview', slug: saved?.slug || 'preview', title: form.title || 'Your QuickPrep name', description: form.description, category: form.category, company: form.companies[0] || '', companies: form.companies, topics: form.topics,
      theme: form.theme, rewardXp: Number(form.rewardXp) || 0, badge: { title: form.badgeTitle || `${form.title || 'QuickPrep'} Finisher` }, total: available.length, solved: 0, difficulty, started: false };
  }, [form, saved]);

  if (loading) return <Page><div className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" /><div className="h-96 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" /></Page>;

  return <Page>
    <PageHeader icon={Zap} title={id ? `Edit ${saved?.title || 'QuickPrep'}` : 'Create QuickPrep'}
      crumbs={[{ label: 'QuickPrep', to: QUICKPREP_ROOT }, ...(id ? [{ label: saved?.title || 'QuickPrep', to: `${QUICKPREP_ROOT}/${id}` }] : []), { label: id ? 'Edit' : 'Create' }]}
      description="Three short steps: describe it, add questions from the library, then choose who sees it and publish."
      actions={saved && <StatusPill status={saved.status} />} />

    <nav aria-label="QuickPrep steps" className={`${card} p-2`}>
      <ol className="grid gap-1 sm:grid-cols-3">
        {STEPS.map((entry, index) => {
          const active = entry.key === step;
          const done = index < stepIndex || (entry.key === 'details' && Boolean(id) && !active) || (entry.key === 'questions' && (saved?.questionCount || 0) > 0 && !active);
          const Icon = entry.icon;
          return <li key={entry.key}>
            <button type="button" disabled={!reachable(entry.key)} aria-current={active ? 'step' : undefined} onClick={() => (entry.key === 'questions' && step === 'questions' ? null : step === 'questions' ? saveQuestions(entry.key) : goTo(entry.key))}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? 'bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-500/10 dark:ring-sky-500/30' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${active ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30' : done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                {done && !active ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Step {index + 1}</span>
                <span className={`block truncate text-sm font-semibold ${active ? 'text-sky-800 dark:text-sky-200' : 'text-slate-800 dark:text-zinc-100'}`}>{entry.label}</span>
                <span className="hidden truncate text-[12px] text-slate-500 lg:block dark:text-zinc-400">{entry.hint}</span>
              </span>
            </button>
          </li>;
        })}
      </ol>
    </nav>

    {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}

    {step === 'details' && <DetailsStep form={form} set={set} taxonomy={taxonomy} preview={preview} busy={busy} onNext={saveDetails} onCancel={() => navigate(id ? `${QUICKPREP_ROOT}/${id}` : QUICKPREP_ROOT)} isNew={!id} />}
    {step === 'questions' && <QuestionsStep form={form} set={set} dirty={itemsDirty} busy={busy} onLibrary={openLibrary} onSave={() => saveQuestions(null)} onBack={() => saveQuestions('details')} onNext={() => saveQuestions('publish')} />}
    {step === 'publish' && <PublishStep form={form} set={set} saved={saved} preview={preview} busy={busy} onBack={() => goTo('questions')} onFinish={finish} />}
  </Page>;
}

function Field({ label, hint, children, required }) {
  return <label className="block">
    <span className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px] font-semibold text-slate-700 dark:text-zinc-200">{label}{required && <span className="text-rose-500" aria-hidden="true">*</span>}{hint && <span className="ml-auto text-[11.5px] font-normal text-slate-400">{hint}</span>}</span>
    {children}
  </label>;
}

function StepFooter({ children }) {
  return <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 dark:border-zinc-800 dark:bg-[#1a1a1a]/90">{children}</div>;
}

function DetailsStep({ form, set, taxonomy, preview, busy, onNext, onCancel, isNew }) {
  return <>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className={`${card} space-y-5 p-5`} aria-labelledby="details-title">
        <div>
          <h2 id="details-title" className="text-base font-semibold">Details</h2>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">Students see the name, description, companies and topics on the QuickPrep card.</p>
        </div>
        <Field label="Name" hint={`${form.title.length}/80`} required><input value={form.title} maxLength={80} onChange={(event) => set('title', event.target.value)} placeholder="e.g. Amazon Top 50 or 75 Hard" className={inputClass} /></Field>
        <Field label="Description" hint={`${form.description.length}/600`}><textarea value={form.description} maxLength={600} rows={3} onChange={(event) => set('description', event.target.value)} placeholder="What students practise here and how to approach it." className={`${inputClass} resize-y`} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <SelectMenu label="Type" options={QUEST_CATEGORIES} value={form.category} onChange={(value) => set('category', value)} />
          <MultiSelect label="Companies" icon={Building2} allLabel="All companies" placeholder="Search companies" options={taxonomy.companies} value={form.companies} onChange={(value) => set('companies', value)} loading={taxonomy.loading} />
          <MultiSelect label="Topics" icon={Tags} allLabel="All topics" placeholder="Search topics" options={taxonomy.topics} value={form.topics} onChange={(value) => set('topics', value)} loading={taxonomy.loading} />
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Difficulty focus</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Difficulty focus">
              {['Easy', 'Medium', 'Hard'].map((level) => {
                const on = form.difficulties.includes(level);
                return <button key={level} type="button" aria-pressed={on} onClick={() => set('difficulties', on ? form.difficulties.filter((value) => value !== level) : [...form.difficulties, level])}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${on ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-300'}`}>
                  <Flame className={`h-3.5 w-3.5 ${level === 'Easy' ? 'text-emerald-500' : level === 'Medium' ? 'text-amber-500' : 'text-rose-500'}`} aria-hidden="true" />{level}
                </button>;
              })}
            </div>
            <p className="mt-1.5 text-[11.5px] text-slate-400">{form.difficulties.length ? 'Shown to students as the focus of this QuickPrep.' : 'All levels.'}</p>
          </div>
        </div>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Card colour</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Card colour">
            {Object.entries(QUEST_THEMES).map(([name, theme]) => <button key={name} type="button" role="radio" aria-checked={form.theme === name} aria-label={name} onClick={() => set('theme', name)}
              className={`h-9 w-14 rounded-xl bg-gradient-to-br ${theme.band} transition ${form.theme === name ? 'ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-zinc-900' : 'opacity-80 hover:opacity-100'}`}>
              {form.theme === name && <Check className="mx-auto h-4 w-4 text-white" strokeWidth={3} aria-hidden="true" />}
            </button>)}
          </div>
        </div>
        <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">Companies and topics come from published library questions and describe this QuickPrep to students. In the next step, use the Question Library’s search and filters to pick matching questions.</p>
      </section>
      <PreviewPanel preview={preview} />
    </div>
    <StepFooter>
      <button type="button" onClick={onCancel} className={secondaryButton}>Cancel</button>
      <button type="button" onClick={onNext} disabled={busy} className={primaryButton}>{busy ? 'Saving…' : isNew ? 'Create & add questions' : 'Save & continue'}<ArrowRight className="h-4 w-4" /></button>
    </StepFooter>
  </>;
}

function PreviewPanel({ preview }) {
  return <aside className="space-y-3 lg:sticky lg:top-4 lg:self-start" aria-label="Student preview">
    <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Student preview</p>
    <QuestCard quest={preview} preview />
    <p className="text-[12px] text-slate-500 dark:text-zinc-400">This is how the card appears on the student QuickPrep page and dashboard.</p>
  </aside>;
}

function QuestionsStep({ form, set, dirty, busy, onLibrary, onSave, onBack, onNext }) {
  const [selected, setSelected] = useState(() => new Set());
  const [section, setSection] = useState('');
  const items = form.items;
  const sections = [...new Set(items.map((item) => item.section).filter(Boolean))];
  const available = items.filter((item) => item.available !== false);
  const difficulty = available.reduce((mix, item) => { if (mix[item.difficulty] !== undefined) mix[item.difficulty] += 1; return mix; }, { Easy: 0, Medium: 0, Hard: 0 });
  const tally = (pick) => Object.entries(available.flatMap(pick).reduce((acc, value) => ({ ...acc, [value]: (acc[value] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  const topics = tally((item) => item.tags || []);
  const companies = tally((item) => item.companies || []);
  const update = (next) => set('items', next);
  const move = (index, delta) => { const next = [...items]; const [entry] = next.splice(index, 1); next.splice(index + delta, 0, entry); update(next); };
  const keyOf = (item) => `${item.source}:${item.problemId}`;
  const toggle = (key) => setSelected((previous) => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const allSelected = items.length > 0 && items.every((item) => selected.has(keyOf(item)));

  return <>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <SummaryTile icon={Layers} label="Questions" value={available.length} hint={items.length > available.length ? `${items.length - available.length} unavailable` : 'Ready for students'} />
      <div className={`${card} p-4`}><p className="text-[12px] font-medium text-slate-500">Difficulty mix</p><div className="mt-3"><MixBar difficulty={difficulty} /></div></div>
      <div className={`${card} p-4`}><p className="mb-2 text-[12px] font-medium text-slate-500">Topics covered</p><Chips values={topics} max={3} icon={Tags} empty="None yet" /></div>
      <div className={`${card} p-4`}><p className="mb-2 text-[12px] font-medium text-slate-500">Companies covered</p><Chips values={companies} max={3} icon={Building2} empty="None yet" /></div>
    </div>

    <section className={card} aria-labelledby="questions-title">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-zinc-800">
        <div className="mr-auto">
          <h2 id="questions-title" className="text-base font-semibold">Questions <span className="text-slate-400">({items.length})</span></h2>
          <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Students solve them in this order. Group them with sections such as “Week 1”.</p>
        </div>
        {dirty && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Unsaved changes</span>}
        {dirty && <button type="button" onClick={onSave} disabled={busy} className={secondaryButton}><Save className="h-4 w-4" />Save</button>}
        <button type="button" onClick={onLibrary} disabled={busy} className={primaryButton}><LibraryBig className="h-4 w-4" />Add questions from library</button>
      </div>

      {selected.size > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-sky-100 bg-sky-50/70 px-4 py-2.5 text-sm dark:border-sky-500/20 dark:bg-sky-500/10">
        <span className="font-semibold text-sky-800 dark:text-sky-200">{selected.size} selected</span>
        <input value={section} onChange={(event) => setSection(event.target.value)} list="quickprep-sections" placeholder="Section name, e.g. Week 1" className="w-52 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-sm dark:border-sky-500/30 dark:bg-zinc-900" aria-label="Section for selected questions" />
        <button type="button" onClick={() => { update(items.map((item) => (selected.has(keyOf(item)) ? { ...item, section: section.trim() } : item))); setSelected(new Set()); setSection(''); }} className="rounded-lg bg-sky-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-sky-700">Set section</button>
        <button type="button" onClick={() => { update(items.filter((item) => !selected.has(keyOf(item)))); setSelected(new Set()); }} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 className="h-3.5 w-3.5" />Remove</button>
        <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-[13px] font-semibold text-slate-500 hover:underline">Clear selection</button>
      </div>}
      <datalist id="quickprep-sections">{sections.map((name) => <option key={name} value={name} />)}</datalist>

      {!items.length ? <div className="px-6 py-14 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300"><LibraryBig className="h-7 w-7" aria-hidden="true" /></span>
        <h3 className="mt-3 font-semibold">No questions yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500 dark:text-zinc-400">Open the library, tick the questions you want and choose “Add to QuickPrep”. They will appear here to order and group.</p>
        <button type="button" onClick={onLibrary} className={`${primaryButton} mt-5`}><LibraryBig className="h-4 w-4" />Open library</button>
      </div>
        : <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
              <tr>
                <th scope="col" className="w-10 py-3 pl-4"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map(keyOf)))} aria-label="Select all questions" className="h-4 w-4 rounded accent-sky-600" /></th>
                <th scope="col" className="w-10 px-2 py-3">#</th>
                <th scope="col" className="px-3 py-3">Question</th>
                <th scope="col" className="px-3 py-3">Difficulty</th>
                <th scope="col" className="px-3 py-3">Topics</th>
                <th scope="col" className="px-3 py-3">Companies</th>
                <th scope="col" className="w-44 px-3 py-3">Section</th>
                <th scope="col" className="py-3 pl-3 pr-4 text-right">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {items.map((item, index) => {
                const key = keyOf(item);
                return <tr key={key} className={`transition hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 ${selected.has(key) ? 'bg-sky-50/50 dark:bg-sky-500/5' : ''}`}>
                  <td className="py-2.5 pl-4"><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} aria-label={`Select ${item.title}`} className="h-4 w-4 rounded accent-sky-600" /></td>
                  <td className="px-2 py-2.5 text-[12.5px] tabular-nums text-slate-400">{index + 1}</td>
                  <td className="px-3 py-2.5">
                    <p className={`max-w-[18rem] truncate font-medium ${item.available === false ? 'text-slate-400 line-through' : 'text-slate-800 dark:text-zinc-100'}`}>{item.title}</p>
                    <p className="text-[11.5px] text-slate-400">{item.available === false ? <span className="inline-flex items-center gap-1 text-amber-600"><TriangleAlert className="h-3 w-3" />Unpublished in the library; hidden from students</span> : item.source === 'shared' ? 'Shared catalog' : 'University library'}</p>
                  </td>
                  <td className="px-3 py-2.5"><DifficultyPill difficulty={item.difficulty} /></td>
                  <td className="px-3 py-2.5"><Chips values={item.tags || []} /></td>
                  <td className="px-3 py-2.5"><Chips values={item.companies || []} /></td>
                  <td className="px-3 py-2.5"><input value={item.section || ''} list="quickprep-sections" onChange={(event) => update(items.map((entry, position) => (position === index ? { ...entry, section: event.target.value } : entry)))} placeholder="No section" aria-label={`Section for ${item.title}`} className="w-full rounded-lg border border-transparent bg-slate-50 px-2.5 py-1.5 text-[13px] outline-none hover:border-slate-200 focus:border-sky-400 focus:bg-white dark:bg-zinc-900 dark:hover:border-zinc-700" /></td>
                  <td className="py-2.5 pl-3 pr-4">
                    <div className="flex justify-end gap-0.5">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${item.title} up`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-800"><ArrowUp className="h-4 w-4" /></button>
                      <button type="button" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${item.title} down`} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-zinc-800"><ArrowDown className="h-4 w-4" /></button>
                      <button type="button" onClick={() => update(items.filter((_, position) => position !== index))} aria-label={`Remove ${item.title}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><X className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>}
    </section>
    <StepFooter>
      <button type="button" onClick={onBack} disabled={busy} className={secondaryButton}><ArrowLeft className="h-4 w-4" />Details</button>
      <button type="button" onClick={onNext} disabled={busy || !available.length} title={available.length ? undefined : 'Add at least one question'} className={primaryButton}>{busy ? 'Saving…' : 'Continue to publish'}<ArrowRight className="h-4 w-4" /></button>
    </StepFooter>
  </>;
}

function SummaryTile({ icon: Icon, label, value, hint }) {
  return <div className={`${card} flex items-center gap-3 p-4`}>
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md shadow-sky-500/25"><Icon className="h-5 w-5" aria-hidden="true" /></span>
    <div><p className="text-[12px] font-medium text-slate-500">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-[11px] text-slate-400">{hint}</p>}</div>
  </div>;
}

function PublishStep({ form, set, saved, preview, busy, onBack, onFinish }) {
  const all = !form.semesters.length;
  const checks = [
    { ok: form.title.trim().length >= 3, label: 'Name set', detail: form.title || 'Missing' },
    { ok: preview.total > 0, label: 'Questions ready', detail: `${plural(preview.total, 'question')} visible to students` },
    { ok: !(saved?.unavailableCount > 0), warn: true, label: 'All questions available', detail: saved?.unavailableCount ? `${saved.unavailableCount} unpublished in the library will be hidden` : 'Every question is published' },
    saved?.central
      ? { ok: true, warn: true, label: 'Students can see it', detail: 'Delivered to every university with coding enabled' }
      : { ok: (saved?.audience ?? 1) > 0, warn: true, label: 'Students can see it', detail: saved?.audience !== null && saved?.audience !== undefined ? `${plural(saved.audience, 'student')} in the saved audience` : 'Counted after saving' },
  ];
  const ready = checks.filter((check) => !check.warn).every((check) => check.ok);
  const published = saved?.status === 'published';
  return <>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <section className={`${card} space-y-4 p-5`} aria-labelledby="audience-title">
          <div><h2 id="audience-title" className="flex items-center gap-2 text-base font-semibold"><GraduationCap className="h-4 w-4 text-sky-600" />Audience</h2><p className="text-[13px] text-slate-500 dark:text-zinc-400">Choose which semesters see this QuickPrep. Students outside them will not see it at all.</p></div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Semesters">
            <button type="button" aria-pressed={all} onClick={() => set('semesters', [])} className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${all ? 'border-sky-500 bg-sky-600 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-300'}`}>All semesters</button>
            {SEMESTERS.map((semester) => {
              const on = form.semesters.includes(semester);
              return <button key={semester} type="button" aria-pressed={on} onClick={() => set('semesters', on ? form.semesters.filter((value) => value !== semester) : [...form.semesters, semester].sort((a, b) => a - b))}
                className={`min-w-[3rem] rounded-xl border px-3 py-2 text-sm font-semibold transition ${on ? 'border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300' : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-zinc-700 dark:text-zinc-300'}`}>Sem {semester}</button>;
            })}
          </div>
        </section>
        <section className={`${card} grid gap-4 p-5 md:grid-cols-2`} aria-labelledby="reward-title">
          <h2 id="reward-title" className="flex items-center gap-2 text-base font-semibold md:col-span-2"><Sparkles className="h-4 w-4 text-amber-500" />Completion reward</h2>
          <div>
            <Field label="XP on completion" hint="0–1000"><input type="number" min={0} max={1000} value={form.rewardXp} onChange={(event) => set('rewardXp', event.target.value)} className={inputClass} /></Field>
            <div className="mt-2 flex gap-1.5">{XP_PRESETS.map((value) => <button key={value} type="button" onClick={() => set('rewardXp', value)} className={`rounded-lg px-2.5 py-1 text-[12px] font-semibold ${Number(form.rewardXp) === value ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-zinc-800 dark:text-zinc-300'}`}>{value}</button>)}</div>
          </div>
          <Field label="Badge name" hint="Optional"><input value={form.badgeTitle} maxLength={60} onChange={(event) => set('badgeTitle', event.target.value)} placeholder={`${form.title || 'QuickPrep'} Finisher`} className={inputClass} /></Field>
          <p className="text-[12.5px] text-slate-500 md:col-span-2 dark:text-zinc-400">XP counts toward the student’s level and rank. The badge joins their profile collection the moment they solve every question.</p>
        </section>
        <section className={`${card} p-5`} aria-labelledby="checks-title">
          <h2 id="checks-title" className="flex items-center gap-2 text-base font-semibold"><Gauge className="h-4 w-4 text-sky-600" />Ready to publish?</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-zinc-800">
            {checks.map((check) => <li key={check.label} className="flex items-center gap-3 py-2.5">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${check.ok ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15' : check.warn ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/15' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/15'}`}>{check.ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <TriangleAlert className="h-3.5 w-3.5" />}</span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{check.label}</span><span className="block truncate text-[12.5px] text-slate-500 dark:text-zinc-400">{check.detail}</span></span>
            </li>)}
          </ul>
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600 dark:bg-zinc-900/60 dark:text-zinc-300">
            <Users className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span><strong className="font-semibold">{form.companies.length ? form.companies.join(', ') : 'All companies'}</strong> · {form.topics.length ? form.topics.join(', ') : 'All topics'} · {all ? 'All semesters' : `Semester ${form.semesters.join(', ')}`}</span>
          </div>
        </section>
      </div>
      <PreviewPanel preview={preview} />
    </div>
    <StepFooter>
      <button type="button" onClick={onBack} disabled={busy} className={secondaryButton}><ArrowLeft className="h-4 w-4" />Questions</button>
      <div className="flex flex-wrap gap-2">
        {!published && <button type="button" onClick={() => onFinish('draft')} disabled={busy} className={secondaryButton}><Save className="h-4 w-4" />Save as draft</button>}
        {published && <button type="button" onClick={() => onFinish('draft')} disabled={busy} className={secondaryButton}>Unpublish</button>}
        <button type="button" onClick={() => onFinish('published')} disabled={busy || !ready} className={primaryButton}><Rocket className="h-4 w-4" />{busy ? 'Saving…' : published ? 'Save changes' : 'Publish'}</button>
      </div>
    </StepFooter>
  </>;
}
