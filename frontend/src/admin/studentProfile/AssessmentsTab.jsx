import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BookOpen, CheckCircle2, ClipboardList, ShieldCheck, TrendingUp, Trophy } from 'lucide-react';
import { Card, EmptyRow, Pill, ProgressBar } from '../../student/profile/ui';
import { ChartTooltipBox, ListRow, MetricTile } from './shared';
import { fmtDate, fmtDateTime, nullableNum, num, timeOf } from './utils';

const SCORE_COLOR = '#0284c7';

/** "72%" when the percent of max marks is known, otherwise raw marks (never a fake percentage). */
function scoreLabel(percent, rawScore) {
  if (percent !== null) return `${Math.round(percent)}%`;
  if (rawScore !== null) return `${Math.round(rawScore)} marks`;
  return '—';
}

function ScoreTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <ChartTooltipBox
      title={point.full}
      rows={[
        { label: 'Score', value: `${point.score}%`, color: SCORE_COLOR },
        { label: 'Accuracy', value: `${point.accuracy}%` },
      ]}
    />
  );
}

export default function AssessmentsTab({ stats }) {
  const metrics = stats?.assessmentMetrics || {};
  const recent = useMemo(() => stats?.recentAssessments || [], [stats?.recentAssessments]);
  const attempts = num(metrics.attempts);
  const avgPercent = nullableNum(metrics.normalizedAvgScore);
  const bestPercent = nullableNum(metrics.normalizedHighestScore);

  // Oldest -> newest for the chart; only attempts with a known percent are plotted (0-100 axis).
  const chartData = useMemo(() => [...recent]
    .filter((entry) => nullableNum(entry.percent) !== null)
    .sort((a, b) => timeOf(a.submittedAt) - timeOf(b.submittedAt))
    .map((entry, index) => ({
      key: `${entry.assessmentId || 'assessment'}-${index}`,
      score: Math.round(num(entry.percent)),
      accuracy: Math.round(num(entry.accuracy)),
      tick: fmtDate(entry.submittedAt, `#${index + 1}`).replace(/, \d{4}$/, ''),
      full: fmtDateTime(entry.submittedAt, 'Date unknown'),
    })), [recent]);

  return (
    <div className="space-y-4">
      <Card id="assessment-performance" title="Assessment performance" description="Formal assessment attempts and scoring" icon={<ClipboardList className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile icon={<BookOpen className="h-3.5 w-3.5" />} tone="amber" label="Attempts" value={attempts} helper="Submitted assessments" />
          <MetricTile
            icon={<Trophy className="h-3.5 w-3.5" />}
            tone="emerald"
            label="Average score"
            value={attempts > 0 ? scoreLabel(avgPercent, nullableNum(metrics.avgScore)) : '—'}
            helper={avgPercent !== null ? 'Percent of max marks' : 'Across submitted assessments'}
          />
          <MetricTile
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            tone="sky"
            label="Average accuracy"
            value={attempts > 0 ? `${Math.round(num(metrics.avgAccuracy))}%` : '—'}
            helper="Question correctness rate"
          />
          <MetricTile
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone="rose"
            label="Highest score"
            value={attempts > 0 ? scoreLabel(bestPercent, nullableNum(metrics.highestScore)) : '—'}
            helper={metrics.latestSubmittedAt ? `Latest ${fmtDateTime(metrics.latestSubmittedAt)}` : 'No assessments yet'}
          />
        </div>
      </Card>

      {chartData.length >= 2 ? (
        <Card id="assessment-trend" title="Recent scores" description={`Last ${chartData.length} submitted assessments, oldest first`} icon={<TrendingUp className="h-4 w-4" />}>
          <div className="h-40 w-full" role="img" aria-label={`Scores of the last ${chartData.length} assessments: ${chartData.map((point) => `${point.score}%`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: -28 }}>
                <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-100 dark:text-zinc-800" />
                <XAxis dataKey="tick" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} width={36} />
                <Tooltip content={<ScoreTooltip />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
                <Bar dataKey="score" fill={SCORE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <Card id="recent-assessments" title="Latest submissions" description="Most recent submitted assessments" icon={<BookOpen className="h-4 w-4" />}>
        {recent.length === 0 ? (
          <EmptyRow message="No assessment submissions available yet." />
        ) : (
          <ul className="space-y-2">
            {recent.map((entry, index) => {
              const percent = nullableNum(entry.percent);
              const marks = nullableNum(entry.score);
              const maxMarks = nullableNum(entry.maxMarks);
              return (
                <ListRow
                  key={`${entry.assessmentId || 'assessment'}-${index}`}
                  title={`Assessment attempt ${index + 1}`}
                  meta={`Submitted ${fmtDateTime(entry.submittedAt)}${marks !== null && maxMarks !== null ? ` · ${marks}/${maxMarks} marks` : ''}`}
                  aside={(
                    <>
                      <Pill className="bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30">Score {scoreLabel(percent, marks)}</Pill>
                      <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">Accuracy {Math.round(num(entry.accuracy))}%</Pill>
                    </>
                  )}
                >
                  {percent !== null ? <ProgressBar value={percent} className="mt-2 h-1" label={`Score ${Math.round(percent)}%`} /> : null}
                </ListRow>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
