import { useMemo } from 'react';
import { Award, ClipboardList, History, MessageSquare, PlayCircle, Sparkles, Trophy } from 'lucide-react';
import { Card, EmptyRow } from '../../student/profile/ui';
import CodingProgress from '../../student/profile/CodingProgress';
import BadgesCard from '../../student/profile/BadgesCard';
import PeerPrepProgress from '../../student/profile/PeerPrepProgress';
import { DifficultyPill } from './shared';
import { fmtDate, fmtRelative, num, timeOf } from './utils';

const TIMELINE_ICONS = {
  solved: { icon: Trophy, className: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  assessment: { icon: ClipboardList, className: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300' },
  feedback: { icon: MessageSquare, className: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300' },
  video: { icon: PlayCircle, className: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300' },
};

const TIMELINE_LIMIT = 6;

/** Merges the dated records the page already loaded into one newest-first feed. */
function buildTimeline({ stats, videos }) {
  const items = [
    ...(stats?.recentSolvedProblems || []).map((problem, index) => ({
      key: `solved-${index}`,
      type: 'solved',
      at: problem.acceptedAt,
      title: `Solved ${problem.title || 'a problem'}`,
      aside: <DifficultyPill difficulty={problem.difficulty} />,
    })),
    ...(stats?.recentAssessments || []).map((entry, index) => ({
      key: `assessment-${index}`,
      type: 'assessment',
      at: entry.submittedAt,
      // percent = score / maxMarks; raw marks are never labelled as a percentage.
      title: entry.percent !== null && entry.percent !== undefined
        ? `Submitted an assessment · ${Math.round(num(entry.percent))}% score`
        : `Submitted an assessment · ${Math.round(num(entry.score))} marks`,
    })),
    ...(stats?.recentFeedback || []).map((entry, index) => ({
      key: `feedback-${index}`,
      type: 'feedback',
      at: entry.createdAt,
      title: `Interview feedback from ${entry.fromName || 'a reviewer'} · ${num(entry.marks)}/100`,
    })),
    ...videos.slice(0, 10).map((video, index) => ({
      key: `video-${index}`,
      type: 'video',
      at: video.watchedDate,
      title: `Watched ${video.videoTitle || 'a video'}`,
    })),
  ];
  return items.filter((item) => timeOf(item.at) > 0).sort((a, b) => timeOf(b.at) - timeOf(a.at)).slice(0, TIMELINE_LIMIT);
}

function TimelineCard({ timeline, className = '' }) {
  return (
    <Card
      id="recent-timeline"
      title="Recent timeline"
      description="Latest events across the platform"
      icon={<History className="h-4 w-4" />}
      className={className}
    >
      {timeline.length === 0 ? (
        <EmptyRow message="No dated activity recorded yet." />
      ) : (
        <ol className="relative space-y-0.5">
          {timeline.map((item) => {
            const { icon: Icon, className: tone } = TIMELINE_ICONS[item.type];
            return (
              <li key={item.key} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`} aria-hidden="true">
                  <Icon className="h-3 w-3" />
                </span>
                <p className="min-w-0 flex-1 truncate text-[13px] text-slate-700 dark:text-zinc-200" title={item.title}>{item.title}</p>
                {item.aside ? <span className="hidden shrink-0 sm:inline-flex">{item.aside}</span> : null}
                <time dateTime={new Date(item.at).toISOString()} title={fmtDate(item.at)} className="shrink-0 text-[11px] tabular-nums text-slate-400 dark:text-zinc-500">
                  {fmtRelative(item.at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function MilestonesCard({ learnerProgress, awards }) {
  if (!learnerProgress) return null;
  const earnedWithDates = awards.awards
    .filter((award) => award.earned && learnerProgress.awardDates.has(award.id))
    .map((award) => ({ ...award, earnedAt: learnerProgress.awardDates.get(award.id) }))
    .sort((a, b) => timeOf(b.earnedAt) - timeOf(a.earnedAt));
  if (learnerProgress.levelHistory.length === 0 && earnedWithDates.length === 0) return null;

  return (
    <Card id="learner-progress" title="Milestones" description="When this student reached each level and award" icon={<Sparkles className="h-4 w-4" />}>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="min-w-0">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Levels</h3>
          {learnerProgress.levelHistory.length === 0 ? (
            <EmptyRow message="No level changes recorded yet." />
          ) : (
            <ol className="relative space-y-2.5 border-l border-slate-200 pl-4 dark:border-zinc-700">
              {learnerProgress.levelHistory.map((entry, index) => (
                <li key={`${entry.level}-${entry.achievedAt}-${index}`} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-sky-500 ring-2 ring-white dark:ring-[#242424]" aria-hidden="true" />
                  <p className="text-[13px] font-medium text-slate-900 dark:text-zinc-100">
                    Level {entry.level}{entry.title ? ` · ${entry.title}` : ''}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400">Reached {fmtDate(entry.achievedAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Awards earned</h3>
          {earnedWithDates.length === 0 ? (
            <EmptyRow message="No award dates recorded yet." />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-zinc-800">
              {earnedWithDates.map((award) => (
                <li key={award.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                  <span className="flex min-w-0 items-center gap-2 text-slate-700 dark:text-zinc-300">
                    <Award className="h-3.5 w-3.5 shrink-0 text-sky-500" aria-hidden="true" />
                    <span className="truncate">{award.title}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500 dark:text-zinc-400">{fmtDate(award.earnedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {learnerProgress.celebratedLevel !== null ? (
        <p className="mt-3 text-[11px] text-slate-400 dark:text-zinc-500">
          Level-up celebration last shown to the student for level {learnerProgress.celebratedLevel}.
        </p>
      ) : null}
    </Card>
  );
}

/**
 * Same card system as the student's own profile (Coding progress | Badges, PeerPrep progress |
 * Timeline) so admins and students read identical visuals. Headline KPIs live in the strip above.
 */
export default function OverviewTab({
  stats,
  videos,
  activity,
  overallCoding,
  streak,
  level,
  awards,
  rawLearnerProgress,
  learnerProgress,
  onOpenGallery,
  peerPrep,
}) {
  const timeline = useMemo(() => buildTimeline({ stats, videos }), [stats, videos]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <CodingProgress
          className="h-full"
          totalSolved={overallCoding.totalSolved}
          totalProblems={overallCoding.attempted}
          easySolved={overallCoding.easySolved}
          mediumSolved={overallCoding.mediumSolved}
          hardSolved={overallCoding.hardSolved}
          attemptedProblems={overallCoding.attempted}
          streak={streak}
          activity={activity}
          description="Solved of attempted problems, by difficulty"
          action={null}
        />
        <BadgesCard
          className="h-full"
          level={level}
          awards={awards}
          learnerProgress={rawLearnerProgress}
          onOpenGallery={onOpenGallery}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <PeerPrepProgress className="h-full" {...peerPrep} />
        <TimelineCard className="h-full" timeline={timeline} />
      </div>

      <MilestonesCard learnerProgress={learnerProgress} awards={awards} />
    </div>
  );
}
