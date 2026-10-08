import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CheckCircle2, Code2, History, ListChecks, Target, Trophy } from 'lucide-react';
import { Card, EmptyRow, ProgressBar } from '../../student/profile/ui';
import { STATUS_BAR_COLORS, formatPercent, formatRuntime, languageLabel, statusMeta } from '../../student/profile/format';
import {
  ChartLegend,
  ChartTooltipBox,
  DataTable,
  DifficultyPill,
  ListRow,
  SearchInput,
  SegmentedFilter,
  StatStrip,
  StatusPill,
  SubHeading,
  TitleCell,
} from './shared';
import { fmtDateTime, num, nullableNum, plural } from './utils';

const DIFFICULTY_FILTERS = ['All', 'Easy', 'Medium', 'Hard'];
// Validated two-series pair (light + dark surfaces): accepted vs other attempts.
const ACCEPTED_COLOR = '#0284c7';
const OTHER_COLOR = '#d97706';

function filterProblems(list, query, difficulty) {
  const needle = query.trim().toLowerCase();
  return list.filter((problem) => (
    (difficulty === 'All' || problem.difficulty === difficulty)
    && (!needle || String(problem.title || '').toLowerCase().includes(needle))
  ));
}

/** Compact coding numbers. The solved gauge lives on Overview, so it is not repeated here. */
function CodingSummaryCard({ codingTotals, acceptance, stats }) {
  const { totalSolved, totalProblems, easySolved, mediumSolved, hardSolved, scoped } = codingTotals;
  const acceptedSubmissions = nullableNum(stats?.acceptedSubmissions);
  // Scoped (coordinator) totals get a success rate from the same scoped payload as the tile.
  const questionSuccess = scoped
    ? (totalProblems > 0 ? Math.round((totalSolved / totalProblems) * 1000) / 10 : null)
    : nullableNum(stats?.questionSuccessRate);

  const items = [
    {
      label: scoped ? 'Solved · your problems' : 'Problems solved',
      icon: <Trophy className="h-3.5 w-3.5" />,
      tone: 'emerald',
      value: (
        <>
          {totalSolved}
          {totalProblems > 0 ? <span className="text-xs font-medium text-slate-400 dark:text-zinc-500"> / {totalProblems}</span> : null}
        </>
      ),
      helper: (
        <span className="tabular-nums">
          <span className="text-teal-600 dark:text-teal-400">E {easySolved}</span>
          {' · '}
          <span className="text-amber-600 dark:text-amber-400">M {mediumSolved}</span>
          {' · '}
          <span className="text-rose-600 dark:text-rose-400">H {hardSolved}</span>
        </span>
      ),
    },
    {
      label: 'Total attempts',
      icon: <Code2 className="h-3.5 w-3.5" />,
      tone: 'sky',
      value: acceptance.total,
      helper: !stats && scoped ? 'Submissions in your problems' : 'All submissions',
    },
    {
      label: 'Accepted',
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      tone: 'emerald',
      value: acceptedSubmissions ?? '—',
      helper: acceptance.rate !== null ? `${formatPercent(acceptance.rate)} acceptance` : 'No submissions yet',
    },
    {
      label: 'Problem success',
      icon: <Target className="h-3.5 w-3.5" />,
      tone: 'amber',
      value: questionSuccess !== null ? formatPercent(questionSuccess) : '—',
      helper: scoped ? 'Solved / attempted · your problems' : 'Solved / attempted',
    },
  ];

  return (
    <Card id="coding-summary" title="Coding summary" description="Attempts, results and difficulty split" icon={<Code2 className="h-4 w-4" />}>
      <StatStrip items={items} cols="grid-cols-2 lg:grid-cols-4" label="Coding summary" />
    </Card>
  );
}

function OutcomesCard({ stats, compiler, stacked = false }) {
  const breakdown = useMemo(() => {
    const source = stats?.statusBreakdown && Object.keys(stats.statusBreakdown).length
      ? stats.statusBreakdown
      : (compiler?.statusBreakdown || {});
    const merged = new Map();
    Object.entries(source).forEach(([status, count]) => {
      const meta = statusMeta(status);
      const current = merged.get(meta.label) || { label: meta.label, tone: meta.tone, count: 0 };
      current.count += num(count);
      merged.set(meta.label, current);
    });
    return [...merged.values()].filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  }, [compiler?.statusBreakdown, stats?.statusBreakdown]);
  const total = breakdown.reduce((sum, item) => sum + item.count, 0);
  const languages = Array.isArray(stats?.languagesUsed) ? stats.languagesUsed : [];
  const languageTotal = languages.reduce((sum, item) => sum + num(item.count), 0);

  return (
    <Card id="coding-outcomes" title="Submission outcomes" description="Result mix and languages used" icon={<BarChart3 className="h-4 w-4" />}>
      <div className={`grid gap-5 ${stacked ? '' : 'md:grid-cols-2'}`}>
        <div className="min-w-0">
          <SubHeading aside={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{plural(total, 'submission')}</span>}>Results</SubHeading>
          {total === 0 ? (
            <EmptyRow message="No submissions yet." />
          ) : (
            <>
              <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                {breakdown.map((item) => (
                  <span key={item.label} className={STATUS_BAR_COLORS[item.tone] || STATUS_BAR_COLORS.neutral} style={{ width: `${(item.count / total) * 100}%` }} title={`${item.label}: ${item.count}`} />
                ))}
              </div>
              <ul className="mt-3 space-y-1.5">
                {breakdown.map((item) => (
                  <li key={item.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-zinc-300">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_BAR_COLORS[item.tone] || STATUS_BAR_COLORS.neutral}`} aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500 dark:text-zinc-400">
                      <span className="font-semibold text-slate-900 dark:text-zinc-100">{item.count}</span> · {formatPercent((item.count / total) * 100, 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div className="min-w-0">
          <SubHeading aside={stats?.mostUsedLanguage ? <span className="text-[11px] text-slate-500 dark:text-zinc-400">Mostly {languageLabel(stats.mostUsedLanguage)}</span> : null}>
            Languages
          </SubHeading>
          {languages.length === 0 ? (
            <EmptyRow message="No language usage yet." />
          ) : (
            <ul className="space-y-2.5">
              {languages.map((item) => (
                <li key={item.language}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-zinc-300">{languageLabel(item.language)}</span>
                    <span className="tabular-nums text-slate-500 dark:text-zinc-400">{plural(num(item.count), 'submission')}</span>
                  </div>
                  <ProgressBar value={num(item.count)} max={languageTotal} label={`${languageLabel(item.language)}: ${num(item.count)} submissions`} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltipBox
      title={point.full}
      rows={[
        { label: 'Attempts', value: point.count },
        { label: 'Accepted', value: point.accepted, color: ACCEPTED_COLOR },
        { label: 'Other results', value: point.other, color: OTHER_COLOR },
      ]}
    />
  );
}

function TrendCard({ compiler }) {
  const data = useMemo(() => (Array.isArray(compiler?.performanceTrend) ? compiler.performanceTrend : []).map((entry) => {
    const date = new Date(`${entry.date}T00:00:00Z`);
    const count = num(entry.count);
    const accepted = Math.min(num(entry.accepted), count);
    return {
      key: entry.date,
      count,
      accepted,
      other: Math.max(count - accepted, 0),
      tick: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }),
      full: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    };
  }), [compiler?.performanceTrend]);
  if (data.length === 0) return null;
  const totals = data.reduce((acc, point) => ({ count: acc.count + point.count, accepted: acc.accepted + point.accepted }), { count: 0, accepted: 0 });

  return (
    <Card
      id="coding-trend"
      title="Submissions · last 30 days"
      description={`${plural(totals.count, 'attempt')}, ${totals.accepted} accepted`}
      icon={<Target className="h-4 w-4" />}
    >
      {totals.count === 0 ? (
        <EmptyRow message="No submissions in the last 30 days." />
      ) : (
        <>
        <div className="mb-2">
          <ChartLegend items={[{ label: 'Accepted', color: ACCEPTED_COLOR }, { label: 'Other results', color: OTHER_COLOR }]} />
        </div>
        <div className="h-44 w-full" role="img" aria-label={`Daily submissions for the last 30 days: ${totals.count} attempts, ${totals.accepted} accepted`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -28 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-100 dark:text-zinc-800" />
              <XAxis dataKey="tick" interval={6} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} width={36} />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
              <Bar dataKey="accepted" stackId="attempts" fill={ACCEPTED_COLOR} maxBarSize={14} isAnimationActive={false} />
              <Bar dataKey="other" stackId="attempts" fill={OTHER_COLOR} radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        </>
      )}
    </Card>
  );
}

function RecentSolvedCard({ problems, allProblems = false }) {
  return (
    <Card id="recent-solved" title="Recent solved questions" description={allProblems ? 'Latest accepted · all problems' : 'Latest accepted milestones'} icon={<Trophy className="h-4 w-4" />}>
      {problems.length === 0 ? (
        <EmptyRow message="This student has not solved any problems yet." />
      ) : (
        <ul className="space-y-2">
          {problems.map((problem, index) => (
            <ListRow
              key={`${problem.title}-${index}`}
              title={problem.title || 'Untitled Problem'}
              meta={`Solved ${fmtDateTime(problem.acceptedAt)}`}
              aside={<DifficultyPill difficulty={problem.difficulty} />}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentSubmissionsCard({ submissions, allProblems = false }) {
  return (
    <Card id="recent-submissions" title="Recent submissions" description={allProblems ? 'Latest attempts · all problems' : 'Latest attempts with result and runtime'} icon={<History className="h-4 w-4" />}>
      {submissions.length === 0 ? (
        <EmptyRow message="Submission history will appear once the student starts solving problems." />
      ) : (
        <ul className="space-y-2">
          {submissions.map((submission, index) => {
            const runtime = formatRuntime(submission.executionTimeMs, submission.status);
            const meta = [
              submission.language ? languageLabel(submission.language) : null,
              runtime,
              fmtDateTime(submission.createdAt),
            ].filter(Boolean).join(' · ');
            return (
              <ListRow
                key={`${submission.problemTitle}-${submission.createdAt}-${index}`}
                title={submission.problemTitle || 'Untitled Problem'}
                meta={meta}
                aside={(
                  <>
                    {submission.mode === 'run' ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">Run</span>
                    ) : null}
                    <DifficultyPill difficulty={submission.difficulty} />
                    <StatusPill status={submission.status} createdAt={submission.createdAt} />
                  </>
                )}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ProblemTableCard({ id, title, description, icon, problems, variant }) {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('All');
  const filtered = useMemo(() => filterProblems(problems, query, difficulty), [difficulty, problems, query]);

  const columns = variant === 'attempted'
    ? [
      { key: 'title', label: 'Problem', render: (row) => <TitleCell title={row.title || 'Untitled Problem'} /> },
      { key: 'difficulty', label: 'Difficulty', width: 'w-24', hideOnMobile: true, render: (row) => <DifficultyPill difficulty={row.difficulty} /> },
      { key: 'attempts', label: 'Attempts', width: 'w-20', align: 'right', hideOnMobile: true, render: (row) => num(row.attempts) },
      { key: 'status', label: 'Last result', width: 'w-32', render: (row) => <StatusPill status={row.lastStatus} createdAt={row.lastSubmittedAt} /> },
      { key: 'date', label: 'Last activity', width: 'w-36', hideOnMobile: true, render: (row) => <span className="text-xs text-slate-500 dark:text-zinc-400">{fmtDateTime(row.lastSubmittedAt)}</span> },
    ]
    : [
      { key: 'title', label: 'Problem', render: (row) => <TitleCell title={row.title || 'Untitled Problem'} /> },
      { key: 'difficulty', label: 'Difficulty', width: 'w-24', hideOnMobile: true, render: (row) => <DifficultyPill difficulty={row.difficulty} /> },
      { key: 'date', label: 'Solved on', width: 'w-40', hideOnMobile: true, render: (row) => <span className="text-xs text-slate-500 dark:text-zinc-400">{fmtDateTime(row.acceptedAt)}</span> },
    ];

  const mobileMeta = (row) => (
    <>
      <DifficultyPill difficulty={row.difficulty} />
      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
        {variant === 'attempted'
          ? `${plural(num(row.attempts), 'attempt')} · ${fmtDateTime(row.lastSubmittedAt)}`
          : `Solved ${fmtDateTime(row.acceptedAt)}`}
      </span>
    </>
  );

  return (
    <Card
      id={id}
      title={title}
      description={description}
      icon={icon}
      action={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{filtered.length === problems.length ? problems.length : `${filtered.length} of ${problems.length}`}</span>}
    >
      {problems.length === 0 ? (
        <EmptyRow message={variant === 'attempted' ? 'No attempted problems yet.' : 'No solved problems yet.'} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} label={`Search ${title.toLowerCase()}`} />
            <SegmentedFilter options={DIFFICULTY_FILTERS} value={difficulty} onChange={setDifficulty} label="Filter by difficulty" />
          </div>
          {filtered.length === 0 ? (
            <EmptyRow message="No problems match these filters." />
          ) : (
            <DataTable
              caption={title}
              columns={columns}
              rows={filtered}
              rowKey={(row, index) => `${row.problemId || row.title}-${index}`}
              mobileMeta={mobileMeta}
            />
          )}
        </>
      )}
    </Card>
  );
}

function SubmissionHistoryCard({ history }) {
  const columns = [
    { key: 'title', label: 'Problem', render: (row) => <TitleCell title={row.problemTitle || 'Untitled Problem'} /> },
    { key: 'language', label: 'Language', width: 'w-28', hideOnMobile: true, render: (row) => (row.language ? languageLabel(row.language) : '—') },
    { key: 'status', label: 'Result', width: 'w-32', render: (row) => <StatusPill status={row.status} createdAt={row.createdAt} /> },
    { key: 'runtime', label: 'Runtime', width: 'w-24', align: 'right', hideOnMobile: true, render: (row) => formatRuntime(row.executionTimeMs, row.status) || <span className="text-slate-300 dark:text-zinc-600">—</span> },
    { key: 'date', label: 'Submitted', width: 'w-36', hideOnMobile: true, render: (row) => <span className="text-xs text-slate-500 dark:text-zinc-400">{fmtDateTime(row.createdAt)}</span> },
  ];
  const mobileMeta = (row) => {
    const runtime = formatRuntime(row.executionTimeMs, row.status);
    return (
      <span className="text-[11px] text-slate-500 dark:text-zinc-400">
        {[row.language ? languageLabel(row.language) : null, runtime, fmtDateTime(row.createdAt)].filter(Boolean).join(' · ')}
      </span>
    );
  };
  return (
    <Card
      id="submission-history"
      title="Submission history"
      description="Up to the 50 most recent submissions"
      icon={<ListChecks className="h-4 w-4" />}
      action={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{history.length}</span>}
    >
      {history.length === 0 ? (
        <EmptyRow message="No submissions recorded yet." />
      ) : (
        <DataTable
          caption="Submission history"
          columns={columns}
          rows={history}
          rowKey={(row, index) => `${row._id || row.problemTitle}-${index}`}
          mobileMeta={mobileMeta}
        />
      )}
    </Card>
  );
}

export default function CodingTab({ stats, compiler, codingTotals, acceptance }) {
  const recentSolved = stats?.recentSolvedProblems || [];
  const recentSubmissions = stats?.recentSubmissions || compiler?.submissionHistory || [];
  const attemptedProblems = compiler?.attemptedProblems || [];
  const solvedProblems = compiler?.solvedProblems || [];
  const history = compiler?.submissionHistory || [];
  const hasTrend = Array.isArray(compiler?.performanceTrend) && compiler.performanceTrend.length > 0;

  return (
    <div className="space-y-4">
      <CodingSummaryCard codingTotals={codingTotals} acceptance={acceptance} stats={stats} />
      <div className={`grid gap-4 ${hasTrend ? 'xl:grid-cols-2' : ''}`}>
        <OutcomesCard stats={stats} compiler={compiler} stacked={hasTrend} />
        <TrendCard compiler={compiler} />
      </div>
      {/* The full tables below already list solved problems and submissions. The short recent
          lists (all problems, runs included) are shown when those tables are missing or are
          limited to a coordinator's own problems. */}
      {!compiler || codingTotals.scoped ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <RecentSolvedCard problems={recentSolved} allProblems={codingTotals.scoped} />
          <RecentSubmissionsCard submissions={recentSubmissions} allProblems={codingTotals.scoped} />
        </div>
      ) : null}
      {!compiler ? (
        <EmptyRow icon={<CheckCircle2 className="h-3.5 w-3.5" />} message="Per-problem coding analytics could not be loaded for your account, so the problem lists below may be empty." />
      ) : null}
      <ProblemTableCard
        id="attempted-problems"
        title="Attempted problems"
        description="Every problem this student has interacted with"
        icon={<Target className="h-4 w-4" />}
        problems={attemptedProblems}
        variant="attempted"
      />
      <ProblemTableCard
        id="solved-problems"
        title="Solved problems"
        description="Problems solved successfully"
        icon={<CheckCircle2 className="h-4 w-4" />}
        problems={solvedProblems}
        variant="solved"
      />
      {compiler ? <SubmissionHistoryCard history={history} /> : null}
    </div>
  );
}
