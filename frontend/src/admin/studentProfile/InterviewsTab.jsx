import { CheckCircle2, MessageSquare, ShieldCheck, Star, Trophy, UserRound, Users } from 'lucide-react';
import { Card, EmptyRow, Pill, ProgressBar } from '../../student/profile/ui';
import { ListRow, MetricTile, SubHeading } from './shared';
import { fmtDateTime, num, plural } from './utils';

const RUBRIC = [
  { key: 'avgCommunication', entryKey: 'communication', label: 'Communication' },
  { key: 'avgProblemSolving', entryKey: 'problemSolving', label: 'Problem solving' },
  { key: 'avgPreparedness', entryKey: 'preparedness', label: 'Preparedness' },
  { key: 'avgAttitude', entryKey: 'attitude', label: 'Attitude' },
  { key: 'avgIntegrity', entryKey: 'integrity', label: 'Integrity' },
];

const PIPELINE = [
  { key: 'completed', label: 'Completed', bar: 'bg-emerald-500' },
  { key: 'scheduled', label: 'Scheduled', bar: 'bg-sky-500' },
  { key: 'pending', label: 'Pending', bar: 'bg-amber-500' },
  { key: 'rejected', label: 'Rejected', bar: 'bg-rose-500' },
];

export default function InterviewsTab({ stats }) {
  const metrics = stats?.interviewMetrics || {};
  const feedback = stats?.recentFeedback || [];
  const feedbackReceived = num(metrics.feedbackReceived);
  const totalPairs = num(metrics.totalPairs);
  const pipelineTotal = PIPELINE.reduce((sum, item) => sum + num(metrics[item.key]), 0);
  const hasRoleSplit = metrics.asInterviewer !== undefined || metrics.asInterviewee !== undefined;

  return (
    <div className="space-y-4">
      <Card id="interview-overview" title="Interviews and feedback" description="Participation, received feedback and review quality" icon={<MessageSquare className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
          <MetricTile
            icon={<UserRound className="h-3.5 w-3.5" />}
            tone="sky"
            label="Total interviews"
            value={totalPairs}
            helper={hasRoleSplit ? `${num(metrics.asInterviewer)} as interviewer · ${num(metrics.asInterviewee)} as interviewee` : 'All assigned interview pairs'}
          />
          <MetricTile
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            tone="emerald"
            label="Completed"
            value={num(metrics.completed)}
            helper={`${num(metrics.scheduled)} scheduled, ${num(metrics.pending)} pending`}
          />
          <MetricTile
            icon={<ShieldCheck className="h-3.5 w-3.5" />}
            tone="amber"
            label="Feedback received"
            value={feedbackReceived}
            helper={`${num(metrics.feedbackGiven)} feedback forms submitted by student`}
          />
          <MetricTile
            icon={<Trophy className="h-3.5 w-3.5" />}
            tone="rose"
            label="Average interview score"
            value={feedbackReceived > 0 ? `${Math.round(num(metrics.avgScore))}%` : '—'}
            helper={metrics.latestFeedbackAt ? `Latest ${fmtDateTime(metrics.latestFeedbackAt)}` : 'No feedback yet'}
          />
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="min-w-0">
            <SubHeading aside={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{plural(pipelineTotal, 'pair')}</span>}>Interview status</SubHeading>
            {pipelineTotal === 0 ? (
              <EmptyRow message="No interview pairs assigned yet." />
            ) : (
              <>
                <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
                  {PIPELINE.filter((item) => num(metrics[item.key]) > 0).map((item) => (
                    <span key={item.key} className={item.bar} style={{ width: `${(num(metrics[item.key]) / pipelineTotal) * 100}%` }} />
                  ))}
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {PIPELINE.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-2">
                      <dt className="flex items-center gap-2 text-slate-700 dark:text-zinc-300">
                        <span className={`h-2 w-2 rounded-full ${item.bar}`} aria-hidden="true" />
                        {item.label}
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-900 dark:text-zinc-100">{num(metrics[item.key])}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <div className="mt-3 space-y-0.5 text-[11px] text-slate-500 dark:text-zinc-400">
              {metrics.latestInterviewAt ? <p>Latest interview activity: {fmtDateTime(metrics.latestInterviewAt)}</p> : null}
              {metrics.latestFeedbackGivenAt ? <p>Last feedback given by student: {fmtDateTime(metrics.latestFeedbackGivenAt)}</p> : null}
            </div>
          </div>

          <div className="min-w-0">
            <SubHeading aside={<span className="text-[11px] text-slate-500 dark:text-zinc-400">Average out of 5</span>}>Rubric averages</SubHeading>
            {feedbackReceived === 0 ? (
              <EmptyRow message="Rubric averages appear after the first feedback." />
            ) : (
              <ul className="space-y-2">
                {RUBRIC.map((item) => {
                  const value = num(metrics[item.key]);
                  return (
                    <li key={item.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-700 dark:text-zinc-300">{item.label}</span>
                        <span className="tabular-nums text-slate-500 dark:text-zinc-400"><span className="font-semibold text-slate-900 dark:text-zinc-100">{value.toFixed(1)}</span>/5</span>
                      </div>
                      <ProgressBar value={value} max={5} colorClass="bg-indigo-500" label={`${item.label}: ${value.toFixed(1)} out of 5`} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Card>

      <Card
        id="recent-feedback"
        title="Recent feedback"
        description="Latest reviews received from interviewers"
        icon={<Users className="h-4 w-4" />}
        action={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{feedback.length}</span>}
      >
        {feedback.length === 0 ? (
          <EmptyRow message="No interview feedback records found for this student." />
        ) : (
          <ul className="space-y-2">
            {feedback.map((entry, index) => {
              const rubric = RUBRIC.filter((item) => num(entry[item.entryKey]) > 0);
              return (
                <ListRow
                  key={`${entry.fromName}-${entry.createdAt}-${index}`}
                  title={entry.fromName || 'Unknown reviewer'}
                  meta={`${entry.eventName || 'Interview'} · ${fmtDateTime(entry.createdAt)}`}
                  aside={<Pill className="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">{num(entry.marks)} / 100</Pill>}
                >
                  {entry.comments ? <p className="mt-2 break-words text-[13px] leading-relaxed text-slate-600 [overflow-wrap:anywhere] dark:text-zinc-300">{entry.comments}</p> : null}
                  {entry.suggestions ? (
                    <p className="mt-1.5 break-words text-xs text-slate-500 [overflow-wrap:anywhere] dark:text-zinc-400">
                      <span className="font-medium text-slate-600 dark:text-zinc-300">Suggestion: </span>
                      {entry.suggestions}
                    </p>
                  ) : null}
                  {rubric.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {rubric.map((item) => (
                        <span key={item.key} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">
                          <Star className="h-3 w-3 text-amber-500" aria-hidden="true" />
                          {item.label} {num(entry[item.entryKey])}/5
                        </span>
                      ))}
                    </div>
                  ) : null}
                </ListRow>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
