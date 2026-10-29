import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, AlertCircle, ArrowRight, BellRing, BookOpen, Bot, Building2, CalendarClock, Check, CheckCircle2, ClipboardList, Code2, Coins,
  Database, FileQuestion, Gauge, Image, Layers, Library, Mail, Plus, RefreshCw, Route, Sparkles, Trophy, UserX, Users, X,
} from 'lucide-react';
import { api } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { ActivityTrendChart, BandChart, BarRows, DonutChart, StackedBars } from './charts';
import { CardHeader, CardLink, EmptyHint, Glass, KpiTile, MiniStat, OverviewShell, Segmented, SkeletonRows, ToneDot } from './ui';
import { AssessmentPanel, CodingPanel, InterviewPanel, LearningPanel, TodayRow } from './OverviewDashboard';
import { MODULE_META, formatNumber, greeting, linksFor, pendingRows, percent, relativeTime, weekChange, whenLabel } from './overviewModel';
import { MODULES, STATUS_META, actionLabel, universityHealth } from '../admin/universities/universityModel';
import UniversityBadge from '../admin/universities/UniversityBadge';

const SERIES = ['coding', 'assessments', 'interviews', 'learning'];
const STATUS_COLORS = { live: '#10b981', expiring: '#f59e0b', scheduled: '#0284c7', expired: '#e11d48', disabled: '#94a3b8' };
const STATUS_TONE = { live: 'emerald', expiring: 'amber', scheduled: 'sky', expired: 'rose', disabled: 'slate' };
const DIFFICULTY_COLORS = { easy: '#10b981', medium: '#f59e0b', hard: '#e11d48' };
const COIN_SERIES = [
  { key: 'issued', label: 'Issued by Master Admin', color: '#0284c7' },
  { key: 'shared', label: 'Passed to students', color: '#10b981' },
  { key: 'spent', label: 'Spent', color: '#f59e0b' },
  { key: 'refunded', label: 'Refunded', color: '#94a3b8' },
];
const SECTIONS = [
  { id: 'engagement', label: 'Engagement' },
  { id: 'universities', label: 'Universities' },
  { id: 'content', label: 'Content library' },
  { id: 'scoring', label: 'Prep Score & Coins' },
  { id: 'activity', label: 'Activity' },
];
const ADMIN_LINKS = linksFor('admin');
const MODULE_SHORT = { learning: 'Learn', assessments: 'Tests', questions: 'Code', events: 'Peer', interviews: 'AI', resumes: 'CV' };
const titleCase = (value) => String(value || '').replace(/[_-]/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());

function StatusPill({ status }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-900/[0.04] px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/[0.06] dark:text-slate-200">
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />{(STATUS_META[status] || STATUS_META.live).label}
    </span>
  );
}

function SetupCheck({ ok, label, Icon }) {
  return (
    <span title={`${label}: ${ok ? 'connected' : 'missing'}`} aria-label={`${label}: ${ok ? 'connected' : 'missing'}`}
      className={`relative inline-flex h-7 w-7 items-center justify-center rounded-lg ${ok ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-rose-50 text-rose-500 dark:bg-rose-400/10 dark:text-rose-300'}`}>
      <Icon className="h-3.5 w-3.5" />
      <span className={`absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full text-white ${ok ? 'bg-emerald-500' : 'bg-rose-500'}`}>
        {ok ? <Check className="h-2 w-2" strokeWidth={4} /> : <X className="h-2 w-2" strokeWidth={4} />}
      </span>
    </span>
  );
}

function SectionTitle({ id, title, subtitle }) {
  return (
    <div id={id} className="mb-3 mt-8 scroll-mt-20 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-950 dark:text-white">{title}</h2>
        {subtitle ? <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function UsageBar({ used, limit }) {
  if (limit == null) return <span className="text-[11px] text-slate-400">No limit set</span>;
  const share = percent(used, limit);
  const color = share >= 90 ? '#e11d48' : share >= 70 ? '#f59e0b' : '#0284c7';
  return (
    <div className="min-w-[110px]">
      <div className="mb-1 flex justify-between text-[11px] tabular-nums text-slate-500 dark:text-slate-400"><span className="font-semibold text-slate-900 dark:text-white">{formatNumber(used)}</span><span>of {formatNumber(limit)}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-900/[0.06] dark:bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.min(100, share)}%`, backgroundColor: color }} /></div>
    </div>
  );
}

export default function PlatformOverview() {
  const { user } = useAuth();
  const [overview, setOverview] = useState(null);
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('attention');

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    const [base, live] = await Promise.allSettled([api.platformOverview(), api.platformInsights({ refresh })]);
    if (base.status === 'fulfilled') setOverview(base.value);
    if (live.status === 'fulfilled') setInsights(live.value);
    if (base.status === 'rejected' || live.status === 'rejected') setError((base.reason || live.reason)?.message || 'Some platform figures could not be loaded.');
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const model = useMemo(() => {
    const registrations = overview?.universities || [];
    const byId = new Map(registrations.map((university) => [university.universityId, university]));
    const health = new Map(registrations.map((university) => [university.universityId, universityHealth(university)]));
    const rows = (insights?.universities || []).map((row) => ({ ...row, registration: byId.get(row.universityId) || {}, health: health.get(row.universityId) || universityHealth({ active: row.active }) }));
    const connected = rows.filter((row) => row.reachable);
    const workspace = insights?.workspace || null;
    const central = insights?.central || null;

    // One 14-day series: the main database plus every connected university, matched by date.
    const days = workspace?.trend?.map((day) => day.date) || connected[0]?.trend?.map((day) => day.date) || [];
    const trend = days.map((date) => {
      const point = { date };
      for (const key of SERIES) {
        point[key] = (workspace?.trend?.find((day) => day.date === date)?.[key] || 0)
          + connected.reduce((total, row) => total + (row.trend?.find((day) => day.date === date)?.[key] || 0), 0);
      }
      point.logins = workspace?.trend?.find((day) => day.date === date)?.logins || 0;
      return point;
    });
    const totals = trend.map((day) => SERIES.reduce((total, key) => total + day[key], 0));
    const universityStudents = connected.reduce((total, row) => total + row.students, 0);
    const mainStudents = workspace?.people?.students || 0;
    const statusCounts = Object.keys(STATUS_META).map((status) => ({ status, value: [...health.values()].filter((item) => item.status === status).length }));

    const attention = [
      ...rows.filter((row) => row.reason === 'no_database').map((row) => ({ key: `db-${row.universityId}`, tone: 'rose', label: `${row.name}: database not connected`, to: `/admin/universities/${encodeURIComponent(row.universityId)}?tab=connections` })),
      ...rows.filter((row) => row.reason === 'unreachable').map((row) => ({ key: `down-${row.universityId}`, tone: 'rose', label: `${row.name}: database could not be read`, to: `/admin/universities/${encodeURIComponent(row.universityId)}?tab=connections` })),
      ...registrations.flatMap((university) => {
        const item = health.get(university.universityId);
        const issues = item.issues.filter((issue) => issue !== 'Database not connected');
        const timing = item.status === 'expiring' ? [`service ends in ${item.daysLeft} days`] : item.status === 'expired' ? ['service period has ended'] : [];
        return [...timing, ...issues].slice(0, 2).map((issue, index) => ({ key: `${university.universityId}-${index}`, tone: STATUS_TONE[item.status] === 'emerald' ? 'amber' : STATUS_TONE[item.status], label: `${university.name}: ${issue.charAt(0).toLowerCase()}${issue.slice(1)}`, to: `/admin/universities/${encodeURIComponent(university.universityId)}` }));
      }),
      central && central.prepScore.version == null && { key: 'prep-policy', tone: 'amber', label: 'Prep Score policy not published yet: default values are in use', to: '/admin/settings/prep-score-adjustment' },
      central?.prepScore.draftPending && { key: 'prep-draft', tone: 'sky', label: 'A Prep Score draft is waiting to be published', to: '/admin/settings/prep-score-adjustment' },
      central && central.coins.pricedFeatures === 0 && { key: 'pricing', tone: 'slate', label: 'No Prep Coin prices set: every paid feature is free', to: '/admin/settings/prep-coin-pricing' },
      central?.mail.failed > 0 && { key: 'mail', tone: 'rose', label: `${central.mail.failed} email${central.mail.failed === 1 ? '' : 's'} failed in 30 days`, to: '/admin/email-queue' },
      ...pendingRows(workspace?.pending, ADMIN_LINKS).map((row) => ({ ...row, label: `Main database: ${row.label.charAt(0).toLowerCase()}${row.label.slice(1)}` })),
    ].filter(Boolean);

    const renewals = registrations
      .map((university) => ({ university, health: health.get(university.universityId) }))
      .filter((item) => item.health.daysLeft !== null)
      .sort((a, b) => a.health.daysLeft - b.health.daysLeft)
      .slice(0, 5);

    return {
      registrations, rows, connected, workspace, central, trend, totals, statusCounts, attention, renewals,
      mainStudents, universityStudents,
      students: mainStudents + universityStudents,
      activeWeek: (workspace?.people?.activeWeek || 0) + connected.reduce((total, row) => total + row.activeWeek, 0),
      live: statusCounts.find((item) => item.status === 'live')?.value || 0,
      notSetUp: rows.filter((row) => !row.reachable).length,
      codingSubmissions: trend.reduce((total, day) => total + day.coding, 0),
      coinsHeld: registrations.reduce((total, university) => total + (university.coinBalance || 0), 0),
      adoption: MODULES.map((module) => ({ label: module.label, value: registrations.filter((university) => university.permissions?.[module.key]).length })),
    };
  }, [overview, insights]);

  const sortedRows = useMemo(() => [...model.rows].sort((a, b) => {
    if (sortBy === 'students') return (b.students || 0) - (a.students || 0);
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    const weight = (row) => (row.reachable ? 0 : 2) + (row.health.needsAttention ? 1 : 0);
    return weight(b) - weight(a) || a.name.localeCompare(b.name);
  }), [model.rows, sortBy]);

  const showSkeleton = loading && !insights;
  const ws = model.workspace;
  const central = model.central;
  const firstName = user?.name?.split(' ')[0] || 'Admin';
  const problems = central?.content.problems;
  const publishedProblemTotal = problems ? problems.byDifficulty.reduce((total, row) => total + row.count, 0) : 0;
  const problemTotal = Number(problems?.published || 0) + Number(problems?.draft || 0);

  const kpis = [
    { label: 'Total students', value: formatNumber(model.students), helper: `${formatNumber(model.mainStudents)} main · ${formatNumber(model.universityStudents)} universities`, Icon: Users, color: '#0284c7', to: '/admin/students' },
    { label: 'Active this week', value: formatNumber(model.activeWeek), helper: `${percent(model.activeWeek, model.students)}% of students`, Icon: Activity, color: '#10b981', trend: model.totals, delta: weekChange(model.totals) },
    { label: 'Not signed in yet', value: formatNumber(ws?.pending?.notActivated), helper: 'Main database accounts', Icon: UserX, color: '#e11d48', to: '/admin/students' },
    { label: 'Coding submissions', value: formatNumber(model.codingSubmissions), helper: ws?.coding?.acceptanceRate != null ? `${Math.round(ws.coding.acceptanceRate)}% accepted · 14 days` : 'Last 14 days', Icon: Code2, color: MODULE_META.coding.color, trend: model.trend.map((day) => day.coding), delta: weekChange(model.trend.map((day) => day.coding)), to: '/admin/analysis?source=coding' },
    { label: 'Average Prep Score', value: ws?.prepScore?.average ?? '—', helper: `${formatNumber(ws?.prepScore?.scored)} scored · ${central?.prepScore.version ? `policy v${central.prepScore.version}` : 'default policy'}`, Icon: Gauge, color: '#0ea5e9', to: '/admin/analysis' },
    {
      label: 'Coding problems', value: formatNumber(problemTotal), helper: problems ? `${formatNumber(problems.published)} published · ${formatNumber(problems.draft)} drafts` : 'Shared catalogue', Icon: FileQuestion, color: '#d97706', to: '/admin/library/coding/problems',
      footer: problems ? (
        <div className="flex h-2 overflow-hidden rounded-full" aria-label="Problems by difficulty">
          {problems.byDifficulty.map((row) => <span key={row.difficulty} title={`${titleCase(row.difficulty)}: ${formatNumber(row.count)}`} style={{ width: `${percent(row.count, publishedProblemTotal)}%`, backgroundColor: DIFFICULTY_COLORS[row.difficulty] }} />)}
        </div>
      ) : null,
    },
    { label: 'Library questions', value: formatNumber(central?.content.questions.total), helper: (central?.content.questions.byType || []).slice(0, 3).map((row) => `${titleCase(row.type)} ${formatNumber(row.count)}`).join(' · ') || 'Shared catalogue', Icon: Library, color: '#059669', to: '/admin/library' },
    { label: 'Universities live', value: `${model.live} / ${model.registrations.length}`, helper: model.notSetUp ? `${model.notSetUp} without a working database` : 'All connected', Icon: Building2, color: model.notSetUp ? '#e11d48' : '#10b981', to: '/admin/universities/all' },
  ];

  return (
    <OverviewShell>
      <Glass as="header" className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300"><Sparkles className="h-3.5 w-3.5" />Master Admin · Platform command centre</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{greeting()}, {firstName}</h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Students, universities, content and Prep Coins across PeerPrep{insights ? ` · updated ${relativeTime(insights.generatedAt)}` : ''}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/admin/universities/new" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-sky-600 px-3.5 text-xs font-semibold text-white shadow-sm shadow-sky-600/20 transition hover:bg-sky-700"><Plus className="h-4 w-4" />Add university</Link>
            <Link to="/admin/quickprep/new" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200"><Route className="h-4 w-4" />New QuickPrep</Link>
            <Link to="/admin/assessment/create" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200"><ClipboardList className="h-4 w-4" />New assessment</Link>
            <button type="button" onClick={() => load(true)} aria-label="Refresh overview" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-600 transition hover:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-300"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>
        <nav aria-label="Overview sections" className="mt-4 flex gap-1 overflow-x-auto border-t border-slate-100 pt-3 [scrollbar-width:none] dark:border-white/5 [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((section) => (
            <a key={section.id} href={`#${section.id}`} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-900/[0.05] hover:text-slate-950 dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white">{section.label}</a>
          ))}
        </nav>
      </Glass>

      {error ? <div className="mt-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div> : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => <KpiTile key={kpi.label} {...kpi} loading={showSkeleton} />)}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-8">
          <CardHeader title="Needs attention" subtitle="Open items across the platform, most urgent first" Icon={BellRing} />
          {showSkeleton ? <SkeletonRows rows={4} /> : model.attention.length ? (
            <ul className="grid gap-1.5 md:grid-cols-2">
              {model.attention.slice(0, 10).map((item) => (
                <li key={item.key}>
                  <Link to={item.to} className="group flex items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-xs text-slate-700 transition hover:border-slate-200 hover:bg-white/70 dark:text-slate-200 dark:hover:border-white/10 dark:hover:bg-white/[0.04]">
                    <ToneDot tone={item.tone} /><span className="min-w-0 flex-1">{item.label}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-xs font-medium text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" />Nothing needs your attention.</div>}
        </Glass>
        <Glass className="p-5 xl:col-span-4">
          <CardHeader title="Accounts" subtitle="Main database and universities" Icon={Users} />
          <DonutChart
            centre={formatNumber(model.students + (central?.accounts.coordinators || 0) + (central?.accounts.admins || 0))}
            caption="accounts"
            slices={[
              { label: 'Students (main)', value: model.mainStudents, color: '#0284c7' },
              { label: 'Students (universities)', value: model.universityStudents, color: '#38bdf8' },
              { label: 'Coordinators', value: (central?.accounts.coordinators || 0) + model.connected.reduce((total, row) => total + row.coordinators, 0), color: '#10b981' },
              { label: 'Admins', value: central?.accounts.admins || 0, color: '#f59e0b' },
            ]}
          />
        </Glass>
      </div>

      <SectionTitle id="engagement" title="Engagement" subtitle="What students did over the last 14 days" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-8">
          <CardHeader title="Student activity" subtitle="Main database plus every connected university" Icon={Activity} action={<CardLink to="/admin/activity">Activity log</CardLink>} />
          {showSkeleton ? <div className="h-[260px] animate-pulse rounded-xl bg-slate-200/60 dark:bg-white/[0.05]" /> : <ActivityTrendChart data={model.trend} series={SERIES} />}
        </Glass>
        <Glass className="p-5 xl:col-span-4">
          <CardHeader title="Today at a glance" subtitle="Compared with yesterday" Icon={CalendarClock} />
          {showSkeleton ? <SkeletonRows rows={4} /> : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {SERIES.map((key) => <TodayRow key={key} label={MODULE_META[key].label} color={MODULE_META[key].color} today={model.trend.at(-1)?.[key] || 0} yesterday={model.trend.at(-2)?.[key] || 0} />)}
              <TodayRow label="Student sign-ins" color={MODULE_META.logins.color} today={model.trend.at(-1)?.logins || 0} yesterday={model.trend.at(-2)?.logins || 0} />
            </ul>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <MiniStat label="Active today" value={formatNumber(ws?.people?.activeToday)} tone="text-emerald-600 dark:text-emerald-300" />
            <MiniStat label="Joined in 30 days" value={formatNumber((ws?.people?.newStudents || 0) + model.connected.reduce((total, row) => total + row.newStudents, 0))} />
          </div>
        </Glass>
      </div>
      {ws ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {ws.coding ? <CodingPanel coding={ws.coding} links={ADMIN_LINKS} /> : null}
          {ws.assessments ? <AssessmentPanel assessments={ws.assessments} links={ADMIN_LINKS} /> : null}
          {ws.mockInterviews || ws.aiInterviews ? <InterviewPanel mock={ws.mockInterviews} ai={ws.aiInterviews} links={ADMIN_LINKS} /> : null}
          {ws.learning ? <LearningPanel learning={ws.learning} students={ws.people.students} links={ADMIN_LINKS} /> : null}
        </div>
      ) : null}

      <SectionTitle id="universities" title="Universities" subtitle="Setup, usage and service period of every university" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-9">
          <CardHeader title="University health" subtitle="Connections, account limits and engagement" Icon={Building2}
            action={<Segmented label="Sort universities" value={sortBy} onChange={setSortBy} options={[{ value: 'attention', label: 'Needs attention' }, { value: 'students', label: 'Students' }, { value: 'name', label: 'Name' }]} />} />
          {showSkeleton ? <SkeletonRows rows={4} /> : sortedRows.length ? (
            <div className="-mx-2 overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-xs">
                <thead>
                  <tr className="text-[11px] text-slate-500 dark:text-slate-400">
                    {['University', 'Status', 'Students', 'Active · 7 days', 'Modules', 'Setup', 'Service ends', ''].map((heading) => <th key={heading} className="px-2 pb-2 font-medium">{heading}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {sortedRows.map((row) => {
                    const registration = row.registration;
                    const page = `/admin/universities/${encodeURIComponent(row.universityId)}`;
                    const left = row.health.daysLeft;
                    return (
                      <tr key={row.universityId} className="align-middle transition hover:bg-slate-900/[0.02] dark:hover:bg-white/[0.03]">
                        <td className="px-2 py-3">
                          <Link to={page} className="flex items-center gap-2.5">
                            <UniversityBadge university={{ name: row.name, logo: row.logo ? { url: row.logo } : null }} size="sm" />
                            <span className="min-w-0"><span className="block truncate font-semibold text-slate-900 dark:text-white">{row.name}</span><span className="block truncate text-[11px] text-slate-500">{row.universityId}</span></span>
                          </Link>
                        </td>
                        <td className="px-2 py-3"><StatusPill status={row.health.status} /></td>
                        {row.reachable ? (
                          <>
                            <td className="px-2 py-3"><UsageBar used={row.students} limit={row.studentLimit} /></td>
                            <td className="px-2 py-3 tabular-nums"><span className="font-semibold text-slate-900 dark:text-white">{percent(row.activeWeek, row.students)}%</span><span className="text-slate-500"> · {formatNumber(row.activeWeek)}</span></td>
                          </>
                        ) : (
                          <td colSpan={2} className="px-2 py-3">
                            <Link to={`${page}?tab=connections`} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-400/10 dark:text-rose-200">
                              <Database className="h-3.5 w-3.5" />{row.reason === 'no_database' ? 'Database not connected · Connect' : 'Database could not be read · Check'}
                            </Link>
                          </td>
                        )}
                        <td className="px-2 py-3">
                          <div className="flex flex-wrap gap-1">
                            {MODULES.map((module) => (
                              <span key={module.key} title={`${module.label}: ${row.modules?.[module.key] ? 'on' : 'off'}`} className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${row.modules?.[module.key] ? 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-200' : 'bg-slate-900/[0.03] text-slate-400 line-through dark:bg-white/[0.03]'}`}>{MODULE_SHORT[module.key]}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex gap-1">
                            <SetupCheck ok={Boolean(registration.dbConfigured)} label="Database" Icon={Database} />
                            <SetupCheck ok={Boolean(registration.judgeConfigured)} label="Code judge" Icon={Code2} />
                            <SetupCheck ok={Boolean(registration.interviewConfigured)} label="AI interview service" Icon={Bot} />
                            <SetupCheck ok={Boolean(registration.logo?.url)} label="Logo" Icon={Image} />
                          </div>
                        </td>
                        <td className="px-2 py-3 whitespace-nowrap text-[11px]">
                          {left == null ? <span className="text-slate-400">Not set</span> : <span className={left < 0 ? 'font-semibold text-rose-600' : left <= 30 ? 'font-semibold text-amber-600' : 'text-slate-600 dark:text-slate-300'}>{left < 0 ? `Ended ${Math.abs(left)}d ago` : `${left} days`}<span className="block text-slate-400">{registration.serviceEndDate}</span></span>}
                        </td>
                        <td className="px-2 py-3 text-right"><Link to={page} aria-label={`Manage ${row.name}`} className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-700 dark:hover:bg-sky-400/10"><ArrowRight className="h-4 w-4" /></Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <EmptyHint action={<CardLink to="/admin/universities/new">Add the first university</CardLink>}>No universities yet.</EmptyHint>}
        </Glass>
        <div className="grid gap-4 xl:col-span-3">
          <Glass className="p-5">
            <CardHeader title="Service status" Icon={Layers} />
            {overview ? (
              <DonutChart size={120} centre={formatNumber(model.registrations.length)} caption="universities"
                slices={model.statusCounts.filter((item) => item.value).map((item) => ({ label: STATUS_META[item.status].label, value: item.value, color: STATUS_COLORS[item.status] }))} />
            ) : <SkeletonRows rows={3} />}
          </Glass>
          <Glass className="p-5">
            <CardHeader title="Renewals" subtitle="Service periods ending first" Icon={CalendarClock} />
            {model.renewals.length ? (
              <ul className="space-y-2">
                {model.renewals.map(({ university, health }) => (
                  <li key={university.universityId}>
                    <Link to={`/admin/universities/${encodeURIComponent(university.universityId)}?tab=plan`} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate font-medium text-slate-800 dark:text-slate-100">{university.name}</span>
                      <span className={`shrink-0 tabular-nums ${health.daysLeft < 0 ? 'text-rose-600' : health.daysLeft <= 30 ? 'text-amber-600' : 'text-slate-500'}`}>{health.daysLeft < 0 ? 'Ended' : `${health.daysLeft}d`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-500 dark:text-slate-400">No service dates set yet.</p>}
          </Glass>
        </div>
      </div>
      <Glass className="mt-4 p-5">
        <CardHeader title="Module adoption" subtitle="How many universities have each module switched on" Icon={Layers} action={<CardLink to="/admin/universities/defaults">Defaults</CardLink>} />
        <div className="grid gap-x-8 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
          {model.adoption.map((row) => (
            <BarRows key={row.label} rows={[{ label: row.label, value: row.value, max: Math.max(1, model.registrations.length), color: '#0284c7', hint: `${row.value} of ${model.registrations.length}` }]} />
          ))}
        </div>
      </Glass>

      <SectionTitle id="content" title="Content library" subtitle="Everything PeerPrep shares with universities" />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Glass className="p-5">
          <CardHeader title="Coding problems" subtitle="Published problems by difficulty" Icon={Code2} action={<CardLink to="/admin/library/coding/problems">Manage</CardLink>} />
          {problems ? (
            <DonutChart centre={formatNumber(problems.published)} caption="published"
              slices={problems.byDifficulty.map((row) => ({ label: titleCase(row.difficulty), value: row.count, color: DIFFICULTY_COLORS[row.difficulty] }))} />
          ) : <SkeletonRows rows={3} />}
        </Glass>
        <Glass className="p-5">
          <CardHeader title="Question library" subtitle="Shared questions by type" Icon={Library} action={<CardLink to="/admin/library">Open</CardLink>} />
          {central ? (central.content.questions.byType.length
            ? <BarRows rows={central.content.questions.byType.slice(0, 6).map((row) => ({ label: titleCase(row.type), value: row.count, color: '#059669' }))} />
            : <EmptyHint>No shared questions yet.</EmptyHint>) : <SkeletonRows rows={3} />}
        </Glass>
        <Glass className="p-5">
          <CardHeader title="Programs" subtitle="Assessments, QuickPreps and interviews" Icon={BookOpen} />
          <div className="grid grid-cols-2 gap-2">
            <Link to="/admin/assessment"><MiniStat label="Assessments" value={formatNumber(central?.content.assessments.published)} /></Link>
            <Link to="/admin/universities/assessments"><MiniStat label="Shared with universities" value={formatNumber(central?.content.assessments.shared)} /></Link>
            <Link to="/admin/quickprep"><MiniStat label="QuickPreps live" value={formatNumber(central?.content.quickPreps.published)} /></Link>
            <Link to="/admin/ai-interviews"><MiniStat label="AI interviews" value={formatNumber(central?.content.aiInterviews)} /></Link>
            <Link to="/admin/learning"><MiniStat label="Learning semesters" value={formatNumber(central?.content.learningSemesters)} /></Link>
            <MiniStat label="Question assignments" value={formatNumber(central?.content.sharedQuestions.assignments)} />
          </div>
        </Glass>
      </div>

      <SectionTitle id="scoring" title="Prep Score & Prep Coins" subtitle="Ranking policy, top students and the coin economy" />
      <div className="grid gap-4 xl:grid-cols-12">
        <Glass className="p-5 xl:col-span-4">
          <CardHeader title="Prep Score" subtitle={central?.prepScore.version ? `Policy v${central.prepScore.version} · published ${relativeTime(central.prepScore.publishedAt)}` : 'Default policy · not yet published'} Icon={Gauge} action={<CardLink to="/admin/settings/prep-score-adjustment">Adjust</CardLink>} />
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Average" value={ws?.prepScore?.average ?? '—'} tone="text-sky-700 dark:text-sky-300" />
            <MiniStat label="Highest" value={ws?.prepScore?.highest ?? '—'} />
            <MiniStat label="Scored" value={formatNumber(ws?.prepScore?.scored)} />
          </div>
          {ws?.prepScore?.bands?.length ? (
            <div className="mt-4">
              <p className="mb-1 text-xs text-slate-500 dark:text-slate-400">Students by score range</p>
              <BandChart bars={ws.prepScore.bands.map((band) => ({ label: `${band.from}–${band.to}`, value: band.students }))} color="#0ea5e9" height={140} />
            </div>
          ) : null}
          {central?.prepScore.calculating ? <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-[11px] font-medium text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">Scores are being recalculated for a new policy.</p> : null}
        </Glass>
        <Glass className="p-5 xl:col-span-3">
          <CardHeader title="Top students" subtitle="Main database, by Prep Score" Icon={Trophy} />
          {ws?.prepScore?.top?.length ? (
            <ol className="space-y-1">
              {ws.prepScore.top.map((student, index) => (
                <li key={student.id}>
                  <Link to={`/admin/students/${student.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5 transition hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05]">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${index === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200' : 'bg-slate-900/[0.05] text-slate-600 dark:bg-white/[0.06] dark:text-slate-300'}`}>{index + 1}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-slate-900 dark:text-white">{student.name}</span><span className="block truncate text-[11px] text-slate-500">{student.rollNumber}</span></span>
                    <span className="text-sm font-semibold tabular-nums text-sky-700 dark:text-sky-300">{student.score}</span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : <EmptyHint>No Prep Scores yet.</EmptyHint>}
        </Glass>
        <Glass className="p-5 xl:col-span-5">
          <CardHeader title="Prep Coin flow" subtitle="Daily coin movements, last 30 days" Icon={Coins} action={<CardLink to="/admin/wallet">Wallet</CardLink>} />
          {central ? <StackedBars data={central.coins.trend} series={COIN_SERIES} height={170} /> : <SkeletonRows rows={3} />}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Held by universities" value={formatNumber(model.coinsHeld)} />
            <Link to="/admin/settings/prep-coin-pricing"><MiniStat label="Paid features" value={`${central?.coins.pricedFeatures ?? 0} / ${central?.coins.features ?? 0}`} /></Link>
            <MiniStat label="Charges · 30 days" value={formatNumber(central?.coins.charges.captured)} />
            <MiniStat label="Refunds · 30 days" value={formatNumber(central?.coins.charges.refunded)} />
          </div>
        </Glass>
      </div>

      <SectionTitle id="activity" title="Activity" subtitle="Latest changes and system health" />
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Glass className="p-5">
          <CardHeader title="Platform changes" subtitle="Universities, policies and prices" Icon={Activity} action={<CardLink to="/admin/universities/activity">All</CardLink>} />
          {!overview ? <SkeletonRows /> : overview.audit?.length ? (
            <ul className="space-y-2.5">
              {overview.audit.slice(0, 7).map((entry) => (
                <li key={entry._id} className="flex items-start gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs text-slate-800 dark:text-slate-100">{actionLabel(entry.action)}</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{entry.universityId || 'Platform'} · {relativeTime(entry.createdAt)}</span></span>
                </li>
              ))}
            </ul>
          ) : <EmptyHint>No changes yet.</EmptyHint>}
        </Glass>
        <Glass className="p-5">
          <CardHeader title="Admin and coordinator actions" subtitle="Main database" Icon={Users} action={<CardLink to="/admin/activity">All</CardLink>} />
          {ws?.recent?.length ? (
            <ul className="space-y-2.5">
              {ws.recent.slice(0, 7).map((entry) => (
                <li key={entry.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-50 text-[10px] font-bold uppercase text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">{(entry.actor || '?').slice(0, 2)}</span>
                  <span className="min-w-0 flex-1"><span className="line-clamp-1 text-xs text-slate-800 dark:text-slate-100">{entry.title}</span><span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{entry.actor}{entry.at ? ` · ${relativeTime(entry.at)}` : ''}</span></span>
                </li>
              ))}
            </ul>
          ) : showSkeleton ? <SkeletonRows /> : <EmptyHint>No recent actions.</EmptyHint>}
        </Glass>
        <Glass className="p-5">
          <CardHeader title="System health" subtitle="Email delivery and upcoming work" Icon={Mail} action={<CardLink to="/admin/email-queue">Email queue</CardLink>} />
          <div className="grid grid-cols-3 gap-2">
            <MiniStat label="Sent · 30 days" value={formatNumber(central?.mail.sent)} tone="text-emerald-600 dark:text-emerald-300" />
            <MiniStat label="Waiting" value={formatNumber(central?.mail.queued)} />
            <MiniStat label="Failed" value={formatNumber(central?.mail.failed)} tone={central?.mail.failed ? 'text-rose-600 dark:text-rose-300' : undefined} />
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold text-slate-700 dark:text-slate-200">Coming up</p>
          {ws?.upcoming?.length ? (
            <ul className="space-y-1.5">
              {ws.upcoming.slice(0, 4).map((item) => (
                <li key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-slate-800 dark:text-slate-100">{item.title}</span>
                  <span className={`shrink-0 text-[11px] ${item.live ? 'font-semibold text-emerald-600' : 'text-slate-500'}`}>{whenLabel(item)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-slate-500 dark:text-slate-400">No assessments or interviews scheduled.</p>}
        </Glass>
      </div>
    </OverviewShell>
  );
}
