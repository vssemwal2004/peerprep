import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Award, Building2, CalendarDays, CircleCheck, Download, Eye, EyeOff, Gauge, GraduationCap, Layers, LibraryBig, Pencil, Rocket, Sparkles, Tags, TriangleAlert, Users, UsersRound,
} from 'lucide-react';
import { api } from '../../utils/api';
import { questCategory, questTheme } from '../../student/quests/questTheme';
import { Chips, DifficultyPill, MixBar, Notice, Page, Breadcrumbs, ProgressBar, RowMenu, SearchBox, Segmented, StatCard, StatusPill, card, secondaryButton } from './ui';
import { formatDate, plural, timeAgo } from './format';
import useQuickPrepActions, { QUICKPREP_ROOT, quickPrepLibraryUrl } from './useQuickPrepActions';

const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');

/** Why students can or cannot see this QuickPrep, in plain words. */
function visibility(quest, summary) {
  const issues = [];
  if (quest.status !== 'published') issues.push(quest.status === 'archived' ? 'It is archived. Restore and publish it to show it again.' : 'It is a draft. Publish it to show it to students.');
  if (!quest.questionCount) issues.push('It has no available questions. Add questions from the library.');
  if (summary.audience === 0) issues.push(quest.semesters?.length ? `No active students are in semester ${quest.semesters.join(', ')}. Widen the audience.` : 'There are no active full-access students yet.');
  return issues;
}

function toCsv(rows) {
  const cell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

/** Admin "View": the QuickPrep's setup, who can see it, and how every student and question is doing. */
export default function QuickPrepView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('questions');
  const load = useCallback(async () => {
    try { setData(await api.getQuestInsights(id)); setError(''); }
    catch (cause) { setError(cause.message || 'This QuickPrep could not load.'); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  const { actionsFor, setStatus, busyId, message, setMessage } = useQuickPrepActions({
    onChanged: load,
    onRemoved: (result) => { if (result.deleted) navigate(QUICKPREP_ROOT, { replace: true }); },
  });
  const notice = location.state?.notice;

  if (error && !data) return <Page><Breadcrumbs items={[{ label: 'QuickPrep', to: QUICKPREP_ROOT }, { label: 'Not found' }]} /><Notice tone="error">{error} <Link to={QUICKPREP_ROOT} className="font-semibold underline">Back to all QuickPreps</Link></Notice></Page>;
  if (!data) return <Page><div className="h-44 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse rounded-2xl bg-slate-200 dark:bg-zinc-800" />)}</div></Page>;

  const { quest, summary, students, questions } = data;
  const theme = questTheme(quest.theme);
  const type = questCategory(quest.category);
  const TypeIcon = type.icon;
  const issues = visibility(quest, summary);
  const reach = summary.audience ? Math.round((summary.started / summary.audience) * 100) : 0;

  return <Page>
    <Breadcrumbs items={[{ label: 'QuickPrep', to: QUICKPREP_ROOT }, { label: quest.title }]} />
    {notice && !message && <Notice tone="success">{notice}</Notice>}
    {message && <Notice tone={message.tone} onClose={() => setMessage(null)}>{message.text}</Notice>}

    <section className={`${card} overflow-hidden`} aria-labelledby="quickprep-title">
      <div className={`relative overflow-hidden bg-gradient-to-br ${theme.band} px-5 py-6 text-white sm:px-6`}>
        <TypeIcon className="absolute -bottom-8 -right-4 h-44 w-44 rotate-[-10deg] text-white/10" strokeWidth={1.2} aria-hidden="true" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset ring-white/25"><TypeIcon className="h-3.5 w-3.5" aria-hidden="true" />{type.label}</span>
              <span className="rounded-full bg-white px-0.5"><StatusPill status={quest.status} /></span>
            </div>
            <h1 id="quickprep-title" className="mt-3 text-[26px] font-semibold tracking-[-0.02em]">{quest.title}</h1>
            {quest.description && <p className="mt-1.5 text-sm leading-relaxed text-white/85">{quest.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`${QUICKPREP_ROOT}/${quest.id}/edit`} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold ring-1 ring-inset ring-white/30 transition hover:bg-white/25"><Pencil className="h-4 w-4" />Edit</Link>
            <Link to={quickPrepLibraryUrl(quest)} className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold ring-1 ring-inset ring-white/30 transition hover:bg-white/25"><LibraryBig className="h-4 w-4" />Add questions</Link>
            {quest.status === 'published'
              ? <button type="button" disabled={busyId === quest.id} onClick={() => setStatus(quest, 'draft')} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"><EyeOff className="h-4 w-4" />Unpublish</button>
              : <button type="button" disabled={busyId === quest.id || !quest.questionCount} onClick={() => setStatus(quest, 'published')} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100 disabled:opacity-60"><Rocket className="h-4 w-4" />Publish</button>}
            <span className="rounded-xl bg-white"><RowMenu name={quest.title} actions={actionsFor(quest, { includeView: false })} /></span>
          </div>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-4 px-5 py-4 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><Building2 className="h-3.5 w-3.5" />Companies</dt><dd className="mt-1"><Chips values={quest.companies} max={4} empty="All companies" /></dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><Tags className="h-3.5 w-3.5" />Topics</dt><dd className="mt-1"><Chips values={quest.topics} max={4} empty="All topics" /></dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><GraduationCap className="h-3.5 w-3.5" />Audience</dt><dd className="mt-1 font-semibold">{quest.semesters?.length ? `Semester ${quest.semesters.join(', ')}` : 'All semesters'} <span className="font-normal text-slate-500">· {plural(summary.audience, 'student')}</span></dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><Award className="h-3.5 w-3.5" />Reward</dt><dd className="mt-1 font-semibold">{quest.rewardXp} XP <span className="font-normal text-slate-500">· {quest.badgeTitle || `${quest.title} Finisher`}</span></dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Created</dt><dd className="mt-1">{formatDate(quest.createdAt)}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><Rocket className="h-3.5 w-3.5" />Published</dt><dd className="mt-1">{quest.publishedAt ? formatDate(quest.publishedAt) : 'Not yet'}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><Eye className="h-3.5 w-3.5" />Student link</dt><dd className="mt-1 font-mono text-[12.5px] text-slate-600 dark:text-zinc-300">/student/quickprep/{quest.slug}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-[12px] font-medium text-slate-500"><Layers className="h-3.5 w-3.5" />Difficulty mix</dt><dd className="mt-1.5"><MixBar difficulty={quest.difficulty} /></dd></div>
      </dl>
    </section>

    {issues.length ? <Notice tone="warning">
      <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-4 w-4" />Students cannot see this QuickPrep yet</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-6">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
    </Notice> : <Notice tone="info"><span className="inline-flex items-center gap-1.5"><Eye className="h-4 w-4" />Live: {plural(summary.audience, 'student')} can see it on their QuickPrep page{quest.unavailableCount ? `. ${plural(quest.unavailableCount, 'question')} unpublished in the library ${quest.unavailableCount === 1 ? 'is' : 'are'} hidden.` : '.'}</span></Notice>}

    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatCard icon={Layers} label="Questions" value={quest.questionCount} hint={quest.unavailableCount ? `${quest.unavailableCount} unavailable` : 'All available'} tone="sky" />
      <StatCard icon={UsersRound} label="Audience" value={summary.audience} hint="Students who can see it" tone="slate" />
      <StatCard icon={Users} label="Started" value={summary.started} hint={`${reach}% of audience`} tone="violet" />
      <StatCard icon={CircleCheck} label="Completed" value={summary.completed} hint={`${summary.completionRate}% of starters`} tone="emerald" />
      <StatCard icon={Gauge} label="Avg. progress" value={`${summary.averageProgress}%`} hint={`${summary.inProgress} in progress`} tone="amber" />
      <StatCard icon={Sparkles} label="XP awarded" value={summary.xpAwarded} hint={`${quest.rewardXp} XP each`} tone="rose" />
    </div>

    <section className={card} aria-label="Details">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-zinc-800">
        <Segmented label="Show" value={tab} onChange={setTab} options={[{ value: 'questions', label: 'Questions', count: questions.length }, { value: 'students', label: 'Students', count: students.length }]} />
      </div>
      {tab === 'questions' ? <QuestionsTable questions={questions} started={summary.started} quest={quest} /> : <StudentsTable students={students} title={quest.title} />}
    </section>
  </Page>;
}

function QuestionsTable({ questions, started, quest }) {
  if (!questions.length) return <div className="px-6 py-12 text-center text-sm text-slate-500">No questions yet. <Link to={quickPrepLibraryUrl(quest)} className="font-semibold text-sky-700 underline dark:text-sky-300">Add from the library</Link></div>;
  return <div className="overflow-x-auto">
    <table className="w-full min-w-[920px] text-left text-sm">
      <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
        <tr>
          <th scope="col" className="w-12 py-3 pl-4">#</th>
          <th scope="col" className="px-3 py-3">Question</th>
          <th scope="col" className="px-3 py-3">Section</th>
          <th scope="col" className="px-3 py-3">Difficulty</th>
          <th scope="col" className="px-3 py-3">Topics</th>
          <th scope="col" className="px-3 py-3 text-right">Solved by</th>
          <th scope="col" className="px-3 py-3 text-right">Attempting</th>
          <th scope="col" className="w-44 py-3 pl-3 pr-4">Solve rate</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
        {questions.map((question) => <tr key={question.key} className="transition hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
          <td className="py-3 pl-4 text-[12.5px] tabular-nums text-slate-400">{question.position}</td>
          <td className="px-3 py-3"><p className={`max-w-[20rem] truncate font-medium ${question.available ? '' : 'text-slate-400 line-through'}`}>{question.title}</p><p className="text-[11.5px] text-slate-400">{!question.available ? 'Unpublished in the library' : question.source === 'shared' ? 'Shared catalog' : 'University library'}</p></td>
          <td className="px-3 py-3 text-[12.5px] text-slate-600 dark:text-zinc-300">{question.section || <span className="text-slate-400">—</span>}</td>
          <td className="px-3 py-3"><DifficultyPill difficulty={question.difficulty} /></td>
          <td className="px-3 py-3"><Chips values={question.tags} /></td>
          <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{question.solvedBy}</td>
          <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{question.attemptedBy}</td>
          <td className="py-3 pl-3 pr-4">{started ? <ProgressBar value={question.solveRate} tone="bg-emerald-500" label={`Solve rate for ${question.title}`} /> : <span className="text-xs text-slate-400">No starters yet</span>}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function StudentsTable({ students, title }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('progress');
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = students.filter((student) => (filter === 'all' || (filter === 'completed' ? student.completedAt : !student.completedAt))
      && (!term || `${student.name} ${student.rollNumber}`.toLowerCase().includes(term)));
    const by = { progress: (a, b) => b.progress - a.progress, recent: (a, b) => new Date(b.lastViewedAt || b.startedAt || 0) - new Date(a.lastViewedAt || a.startedAt || 0), name: (a, b) => a.name.localeCompare(b.name) };
    return [...list].sort(by[sort]);
  }, [students, search, filter, sort]);
  const exportCsv = () => {
    const csv = toCsv([['Name', 'Roll number', 'Semester', 'Solved', 'Attempted', 'Total', 'Progress %', 'Started', 'Last active', 'Completed'],
      ...rows.map((row) => [row.name, row.rollNumber, row.semester ?? '', row.solved, row.attempted, row.total, row.progress, formatDate(row.startedAt), row.lastViewedAt ? formatDate(row.lastViewedAt) : '', row.completedAt ? formatDate(row.completedAt) : ''])]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase()}-students.csv`; link.click();
    URL.revokeObjectURL(url);
  };
  if (!students.length) return <div className="px-6 py-12 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" /><p className="mt-2 text-sm font-semibold">No students have started yet</p><p className="text-[13px] text-slate-500">A student appears here when they start it or open one of its questions.</p></div>;
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 dark:border-zinc-800">
      <SearchBox value={search} onChange={setSearch} placeholder="Search by name or roll number" label="Search students" />
      <Segmented label="Status" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'progress', label: 'In progress' }, { value: 'completed', label: 'Completed' }]} />
      <label className="sr-only" htmlFor="student-sort">Sort by</label>
      <select id="student-sort" value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium dark:border-zinc-700 dark:bg-zinc-900">
        <option value="progress">Most progress</option><option value="recent">Recently active</option><option value="name">Name A–Z</option>
      </select>
      <button type="button" onClick={exportCsv} className={secondaryButton}><Download className="h-4 w-4" />Export CSV</button>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left text-sm">
        <thead className="bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-zinc-900/60 dark:text-zinc-400">
          <tr>
            <th scope="col" className="py-3 pl-4 pr-3">Student</th>
            <th scope="col" className="px-3 py-3">Semester</th>
            <th scope="col" className="w-48 px-3 py-3">Progress</th>
            <th scope="col" className="px-3 py-3 text-right">Solved</th>
            <th scope="col" className="px-3 py-3 text-right">Attempted</th>
            <th scope="col" className="px-3 py-3">Started</th>
            <th scope="col" className="px-3 py-3">Last active</th>
            <th scope="col" className="py-3 pl-3 pr-4">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {rows.map((student) => <tr key={student.id} className="transition hover:bg-slate-50/70 dark:hover:bg-zinc-800/40">
            <td className="py-3 pl-4 pr-3"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 text-[11.5px] font-semibold text-white">{initials(student.name)}</span><div className="min-w-0"><p className="truncate font-semibold">{student.name}</p><p className="text-[11.5px] text-slate-400">{student.rollNumber || '—'}</p></div></div></td>
            <td className="px-3 py-3 tabular-nums">{student.semester ?? '—'}</td>
            <td className="px-3 py-3"><ProgressBar value={student.progress} tone={student.completedAt ? 'bg-emerald-500' : 'bg-sky-500'} label={`${student.name} progress`} /></td>
            <td className="px-3 py-3 text-right font-semibold tabular-nums">{student.solved}<span className="font-normal text-slate-400">/{student.total}</span></td>
            <td className="px-3 py-3 text-right tabular-nums text-amber-600 dark:text-amber-400">{student.attempted}</td>
            <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-slate-500">{formatDate(student.startedAt)}</td>
            <td className="whitespace-nowrap px-3 py-3 text-[12.5px] text-slate-500">{timeAgo(student.lastViewedAt)}</td>
            <td className="py-3 pl-3 pr-4">{student.completedAt
              ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"><CircleCheck className="h-3 w-3" />Completed {formatDate(student.completedAt)}</span>
              : <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11.5px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">In progress</span>}</td>
          </tr>)}
        </tbody>
      </table>
      {!rows.length && <p className="px-4 py-10 text-center text-sm text-slate-500">No students match.</p>}
    </div>
  </>;
}
