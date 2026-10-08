import { Code2, GraduationCap, Layers3, ListTree, Users } from 'lucide-react';
import ActivitySection from '../../student/profile/ActivitySection';
import { Card } from '../../student/profile/ui';
import { StatStrip } from './shared';
import { num } from './utils';

const STRIP_COLS = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
};

/**
 * Heatmap first (year view with a 30-day toggle, same component as the student profile), then a
 * single breakdown strip. Streak and active days are already in the snapshot above, so they are
 * not repeated here.
 */
export default function ActivityTab({ activity, activityStats }) {
  const breakdown = [
    { key: 'totalActivities', label: 'Total activities', icon: <Layers3 className="h-3.5 w-3.5" />, tone: 'violet', helper: 'Tracked actions this year' },
    { key: 'totalCompilerSubmissions', label: 'Coding submissions', icon: <Code2 className="h-3.5 w-3.5" />, tone: 'sky', helper: 'Runs and submits' },
    { key: 'totalSessions', label: 'Interview sessions', icon: <Users className="h-3.5 w-3.5" />, tone: 'indigo', helper: 'Peer interview activity' },
    { key: 'totalCompletions', label: 'Topic completions', icon: <GraduationCap className="h-3.5 w-3.5" />, tone: 'emerald', helper: 'Learning topics finished' },
  ]
    .filter((item) => activityStats?.[item.key] !== undefined && activityStats?.[item.key] !== null)
    .map((item) => ({ ...item, value: num(activityStats[item.key]) }));

  return (
    <div className="space-y-4">
      <ActivitySection activity={activity} activityStats={activityStats} loading={false} />

      {breakdown.length > 0 ? (
        <Card id="activity-breakdown" title="Activity breakdown" description="What this student did on the platform over the last year" icon={<ListTree className="h-4 w-4" />}>
          <StatStrip items={breakdown} cols={STRIP_COLS[breakdown.length]} label="Activity breakdown" />
        </Card>
      ) : null}
    </div>
  );
}
