import { useState } from 'react';
import { BookOpenCheck, Clock3, Layers3, PlayCircle } from 'lucide-react';
import { Card, EmptyRow, Pill, ProgressBar } from '../../student/profile/ui';
import { ListRow, MetricTile, ShowMoreButton } from './shared';
import { fmtDate, fmtDateTime, num } from './utils';

const PAGE = 10;

const COURSE_STATUS_TONES = {
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30',
  'In Progress': 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30',
  Started: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30',
  'Not Started': 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700',
};

export default function LearningTab({ stats, activityStats, courses, videos, learning }) {
  const [showAllCourses, setShowAllCourses] = useState(false);
  const [showAllVideos, setShowAllVideos] = useState(false);
  const visibleCourses = showAllCourses ? courses : courses.slice(0, PAGE);
  const visibleVideos = showAllVideos ? videos : videos.slice(0, PAGE);
  const videosTotal = num(activityStats?.totalVideosTotal);

  return (
    <div className="space-y-4">
      <Card id="learning-summary" title="Learning summary" description="Assigned courses and video learning" icon={<BookOpenCheck className="h-4 w-4" />}>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 2xl:grid-cols-4">
          <MetricTile icon={<Layers3 className="h-3.5 w-3.5" />} tone="rose" label="Courses enrolled" value={num(stats?.totalCoursesEnrolled)} helper="Assigned learning tracks" />
          <MetricTile
            icon={<PlayCircle className="h-3.5 w-3.5" />}
            tone="amber"
            label="Videos watched"
            value={num(stats?.totalVideosWatched)}
            helper={videosTotal > 0 ? `of ${videosTotal} videos in curriculum` : 'Distinct learning videos'}
          />
          <MetricTile icon={<Clock3 className="h-3.5 w-3.5" />} tone="sky" label="Watch time" value={`${num(stats?.totalWatchTimeHours)} hrs`} helper="Learning time consumed" />
          <MetricTile
            icon={<BookOpenCheck className="h-3.5 w-3.5" />}
            tone="violet"
            label={learning.label}
            value={learning.percent !== null ? `${Math.round(learning.percent)}%` : '—'}
            helper={learning.percent !== null ? learning.detail : 'No course progress yet'}
          />
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card
          id="courses-enrolled"
          title="Courses enrolled"
          description="Course access and topic progress"
          icon={<Layers3 className="h-4 w-4" />}
          action={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{courses.length}</span>}
        >
          {courses.length === 0 ? (
            <EmptyRow message="No course enrollments found." />
          ) : (
            <>
              <ul className="space-y-2">
                {visibleCourses.map((course, index) => {
                  const percent = num(course.progressPercentage);
                  const status = course.progressStatus || 'Not Started';
                  const topics = num(course.totalTopics) > 0 ? `${num(course.completedTopics)}/${num(course.totalTopics)} topics` : null;
                  const meta = [
                    course.semesterName || 'Semester not set',
                    `Enrolled ${course.enrollmentDate ? fmtDate(course.enrollmentDate) : 'date unknown'}`,
                    course.lastAccessed ? `Last opened ${fmtDate(course.lastAccessed)}` : null,
                  ].filter(Boolean).join(' · ');
                  return (
                    <ListRow
                      key={`${course.courseName || 'course'}-${index}`}
                      title={course.courseName || 'Untitled Course'}
                      meta={meta}
                      aside={<Pill className={COURSE_STATUS_TONES[status] || COURSE_STATUS_TONES['Not Started']}>{status}</Pill>}
                    >
                      <div className="mt-2 flex items-center gap-2">
                        <ProgressBar value={percent} className="h-1.5 flex-1" colorClass="bg-violet-500" label={`${course.courseName || 'Course'} progress ${percent}%`} />
                        <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">
                          {percent}%{topics ? ` · ${topics}` : ''}
                        </span>
                      </div>
                    </ListRow>
                  );
                })}
              </ul>
              <ShowMoreButton expanded={showAllCourses} total={courses.length} visible={PAGE} onToggle={() => setShowAllCourses((value) => !value)} noun="courses" />
            </>
          )}
        </Card>

        <Card
          id="recent-videos"
          title="Recent videos watched"
          description="Latest learning content consumed"
          icon={<PlayCircle className="h-4 w-4" />}
          action={<span className="text-[11px] tabular-nums text-slate-500 dark:text-zinc-400">{videos.length}</span>}
        >
          {videos.length === 0 ? (
            <EmptyRow message="No watched videos found." />
          ) : (
            <>
              <ul className="space-y-2">
                {visibleVideos.map((video, index) => (
                  <ListRow
                    key={`${video.topicId || video.videoTitle || 'video'}-${index}`}
                    title={video.videoTitle || 'Untitled Video'}
                    meta={`${video.subjectName || 'Subject'} · ${video.chapterName || 'Chapter'} · ${video.watchedDate ? fmtDateTime(video.watchedDate) : 'Date unknown'}`}
                    aside={(
                      <Pill className="bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30">
                        <Clock3 className="h-3 w-3" aria-hidden="true" />
                        {video.durationDisplay || '0m'}
                      </Pill>
                    )}
                  />
                ))}
              </ul>
              <ShowMoreButton expanded={showAllVideos} total={videos.length} visible={PAGE} onToggle={() => setShowAllVideos((value) => !value)} noun="videos" />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
