import { BookOpen, ClipboardList, Layers, MessageSquare, PlayCircle } from 'lucide-react';
import { Card, RingGauge } from './ui';
import { formatPercent } from './format';

function TrackTile({ icon, title, ringValue, ringColor, ringLabel, value, meta, empty }) {
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2 dark:border-zinc-800">
      <RingGauge value={empty ? 0 : ringValue} size={40} stroke={4} color={ringColor} label={ringLabel}>
        <span className={empty ? 'text-slate-300 dark:text-zinc-600' : ''} style={empty ? undefined : { color: ringColor }} aria-hidden="true">
          {icon}
        </span>
      </RingGauge>
      <div className="min-w-0">
        <h3 className="truncate text-[11px] font-medium text-slate-500 dark:text-zinc-400">{title}</h3>
        <p className={`text-[15px] font-semibold leading-tight tracking-tight tabular-nums ${empty ? 'text-slate-300 dark:text-zinc-600' : 'text-slate-900 dark:text-zinc-50'}`}>
          {value}
        </p>
        <p className="truncate text-[11px] text-slate-400 dark:text-zinc-500" title={meta}>{meta}</p>
      </div>
    </li>
  );
}

export default function PeerPrepProgress({ assessments, interviews, learning, content, visible = {}, className = '' }) {
  const hasAssessmentScore = assessments.attempts > 0 && assessments.avgScore !== null;
  const hasInterviewScore = interviews.total > 0;
  const videosPercent = content.videosTotal > 0 ? (content.videosWatched / content.videosTotal) * 100 : 0;

  return (
    <Card
      id="peerprep-progress"
      title="PeerPrep Progress"
      description="Your enabled modules"
      icon={<Layers className="h-4 w-4" />}
      className={className}
    >
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.assessments !== false && <TrackTile
          icon={<ClipboardList className="h-4 w-4" />}
          title="Assessments"
          ringValue={assessments.avgScore}
          ringColor="#f59e0b"
          ringLabel={hasAssessmentScore ? `Assessment average ${formatPercent(assessments.avgScore)}` : 'No assessments yet'}
          value={hasAssessmentScore ? formatPercent(assessments.avgScore) : '—'}
          meta={assessments.attempts > 0
            ? `${assessments.attempts} ${assessments.attempts === 1 ? 'attempt' : 'attempts'}${assessments.highestScore !== null ? ` · best ${formatPercent(assessments.highestScore)}` : ''}`
            : 'Not taken yet'}
          empty={!hasAssessmentScore}
        />}
        {visible.interviews !== false && <TrackTile
          icon={<MessageSquare className="h-4 w-4" />}
          title="Interview feedback"
          ringValue={interviews.avgScore}
          ringColor="#6366f1"
          ringLabel={hasInterviewScore ? `Interview average ${Math.round(interviews.avgScore)} out of 100` : 'No interview feedback yet'}
          value={hasInterviewScore ? `${Math.round(interviews.avgScore)}/100` : '—'}
          meta={hasInterviewScore
            ? `${interviews.total} ${interviews.total === 1 ? 'report' : 'reports'}`
            : 'No feedback yet'}
          empty={!hasInterviewScore}
        />}
        {visible.learning !== false && <TrackTile
          icon={<BookOpen className="h-4 w-4" />}
          title="Learning modules"
          ringValue={learning.completionPercent}
          ringColor="#10b981"
          ringLabel={`Learning modules ${formatPercent(learning.completionPercent, 0)} complete`}
          value={formatPercent(learning.completionPercent, 0)}
          meta={learning.totalTopics > 0
            ? `${learning.completedTopics} of ${learning.totalTopics} topics`
            : `${learning.completedTopics} topics done`}
          empty={learning.completionPercent <= 0}
        />}
        {visible.learning !== false && <TrackTile
          icon={<PlayCircle className="h-4 w-4" />}
          title="Videos watched"
          ringValue={videosPercent}
          ringColor="#8b5cf6"
          ringLabel={`${content.videosWatched} videos watched`}
          value={content.videosTotal > 0 ? `${content.videosWatched}/${content.videosTotal}` : content.videosWatched}
          meta={[
            `${content.coursesEnrolled} ${content.coursesEnrolled === 1 ? 'course' : 'courses'}`,
            content.watchTimeHours > 0 ? `${content.watchTimeHours} h watched` : null,
          ].filter(Boolean).join(' · ')}
          empty={content.videosWatched <= 0}
        />}
      </ul>

    </Card>
  );
}
