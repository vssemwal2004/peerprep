import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import RequirePasswordChange from './RequirePasswordChange';
import CodingProgress from './profile/CodingProgress';
import useStudentDashboardData from './dashboard/useStudentDashboardData';
import AnnouncementBar from './dashboard/AnnouncementBar';
import useDismissedAnnouncement from './dashboard/useDismissedAnnouncement';
import GreetingHeader from './dashboard/GreetingHeader';
import ContinueSection from './dashboard/ContinueSection';
import ChallengeGoals from './dashboard/ChallengeGoals';
import { LearningSubjects, PracticeSuggestions } from './dashboard/DiscoverySections';
import { AnnouncementsCard, ComingUpCard, DailyChallengeCard, RankCard } from './dashboard/RailCards';
import { Code2 } from 'lucide-react';
import { card, CardTitle, TitleIcon, Unavailable } from './dashboard/ui';
import { getGreeting, getUpcomingItems, getWeekActivity, numeric, sortAnnouncements } from './dashboard/dashboardUtils';

// The student shell's sticky header is 64px tall plus a 1px border. The rail sticks 16px below
// it and is capped to the viewport, so only the main column scrolls on large screens.
const railPosition = 'lg:sticky lg:top-[81px] lg:max-h-[calc(100dvh-97px)] lg:overflow-y-auto lg:overscroll-contain';

function dashboardNudge({ data, loading, firstSession, week, daily, resumeItems, canQuestions }) {
  if (loading || !data) return null;
  if (firstSession) return 'Pick a starting point below to begin.';
  const streak = numeric(data.coding?.streak?.current);
  const activeToday = week[week.length - 1]?.count > 0;
  if (streak > 0 && !activeToday) return `One problem today keeps your ${streak}-day streak alive.`;
  if (streak > 0) return `${streak}-day streak and counting. Good to see you back.`;
  if (canQuestions && daily?.problem && !daily.completed) return `Today's challenge is worth +${numeric(daily.rewardPoints)} points.`;
  if (resumeItems[0]) return 'Pick up right where you stopped.';
  return 'One problem or one lesson today keeps you moving.';
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { allowsPath } = useUniversityPolicy();
  const canQuestions = allowsPath('/problems', 'student');
  const canLearning = allowsPath('/student/learning', 'student');
  const canAssessments = allowsPath('/student/assessments', 'student');
  const canEvents = allowsPath('/student/interview', 'student');
  const sections = useStudentDashboardData({ userId: user?._id || user?.id, canQuestions, canLearning, canEvents, canAssessments });
  const [dismissedNotice, dismissNotice] = useDismissedAnnouncement();
  const [allNotices, setAllNotices] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const progress = sections.dashboard;
  const data = progress.data;
  const permittedItems = (items) => (Array.isArray(items) ? items : []).filter((item) => item.href && allowsPath(item.href.split('?')[0], 'student'));
  const resumeItems = permittedItems(data?.resumeItems).filter((item) => item.type === 'coding' ? canQuestions : item.type === 'learning' && canLearning);
  const subjects = canLearning ? permittedItems(data?.learningSubjects) : [];
  const suggestions = canQuestions ? permittedItems(data?.suggestedPractice) : [];
  const upcoming = useMemo(() => getUpcomingItems(canAssessments ? sections.assessments.data || [] : [], canEvents ? sections.events.data || [] : [], now), [canAssessments, canEvents, sections.assessments.data, sections.events.data, now]);
  const week = getWeekActivity(data?.activityByDate || {}, now);
  const name = String(user?.name || '').trim().replace(/\s+/g, ' ') || 'Student';
  const firstSession = Boolean(data) && !progress.loading && !progress.error && !resumeItems.length && !data.ranking?.hasProgress
    && numeric(data.coding?.totalSolved) === 0 && numeric(data.learning?.completedTopics) === 0 && numeric(data.ranking?.score) === 0;
  const notices = sortAnnouncements(sections.announcements.data || []);
  const showNoticeBar = Boolean(notices[0]) && notices[0]._id !== dismissedNotice;
  const showNotices = notices.length > 0 || Boolean(sections.announcements.error);
  const viewNotices = () => {
    setAllNotices(true);
    requestAnimationFrame(() => {
      const target = document.getElementById('dashboard-announcements');
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      target?.focus({ preventScroll: true });
    });
  };
  const dueLoading = (canAssessments && sections.assessments.loading) || (canEvents && sections.events.loading);
  const dueError = (canAssessments && sections.assessments.error) || (canEvents && sections.events.error);
  const showChallenges = canQuestions || canLearning;
  const showPractice = canQuestions && (progress.loading || progress.error || suggestions.length > 0);
  const nudge = dashboardNudge({ data, loading: progress.loading, firstSession, week, daily: sections.engagement.data?.daily, resumeItems, canQuestions });

  return <RequirePasswordChange user={user}>
    <div className="student-dashboard min-h-[calc(100dvh-65px)] bg-[#f7f7f9] bg-[radial-gradient(1200px_480px_at_18%_-160px,rgba(14,165,233,0.07),transparent_70%)] bg-no-repeat font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:bg-none dark:text-zinc-100">
      {showNoticeBar && <div className="mx-auto max-w-[1360px] px-4 pt-5 sm:px-6 lg:px-10">
        <AnnouncementBar announcement={notices[0]} total={notices.length} now={now} onView={viewNotices} onDismiss={() => dismissNotice(notices[0]._id)} />
      </div>}
      <div className={`mx-auto grid max-w-[1360px] grid-cols-1 gap-x-8 gap-y-8 px-4 py-6 [grid-template-areas:'head'_'rail'_'body'] sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:px-10 lg:[grid-template-areas:'head_rail'_'body_rail'] xl:grid-cols-[minmax(0,1fr)_356px] ${showNoticeBar ? 'lg:pb-8 lg:pt-6' : 'lg:py-8'}`}>
        <div className="min-w-0 space-y-8 [grid-area:head]">
          <GreetingHeader greeting={getGreeting(now)} name={name} nudge={nudge} section={progress}
            firstSession={firstSession} canQuestions={canQuestions} canLearning={canLearning} onRetry={sections.refresh} />
          {!firstSession && (canQuestions || canLearning) && (progress.loading || progress.error || resumeItems.length > 0)
            && <ContinueSection items={resumeItems} section={progress} now={now} onRetry={sections.refresh} />}
        </div>

        <aside aria-label="Your progress and priorities" className={`grid min-w-0 grid-cols-1 content-start gap-3 [grid-area:rail] sm:grid-cols-2 lg:grid-cols-1 lg:self-start ${railPosition}`}>
          {showNotices && <AnnouncementsCard items={notices} section={sections.announcements} onRetry={sections.refresh} now={now}
            showAll={allNotices} onToggleAll={() => setAllNotices((value) => !value)} />}
          {canQuestions && (progress.error
            ? <section aria-labelledby="coding-error-title" className={`p-4 ${card}`}><CardTitle id="coding-error-title" title="Coding progress" icon={Code2} tone="sky" /><Unavailable className="mt-3" message="Coding progress could not be loaded." onRetry={sections.refresh} /></section>
            : <CodingProgress {...(data?.coding || {})} compact loading={progress.loading} description={null} titleIcon={<TitleIcon icon={Code2} tone="sky" />}
              className="!rounded-2xl !border-[#e9eaee] !p-4 !shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:!border-white/[0.07]" />)}
          <RankCard ranking={data?.ranking} loading={progress.loading} error={progress.error} onRetry={sections.refresh} />
          {canQuestions && <DailyChallengeCard section={sections.engagement} onRetry={sections.refresh} />}
          {(canEvents || canAssessments) && <ComingUpCard items={upcoming} loading={dueLoading} error={dueError} onRetry={sections.refresh} canAssessments={canAssessments} canEvents={canEvents} />}
        </aside>

        <div className="min-w-0 space-y-8 [grid-area:body]" data-dashboard-main>
          {(showChallenges || showPractice) && <div className={`grid grid-cols-1 gap-4 ${showChallenges && showPractice ? 'xl:grid-cols-2' : ''}`}>
            {showChallenges && <ChallengeGoals section={sections.engagement} onRetry={sections.refresh} canQuestions={canQuestions} canLearning={canLearning} />}
            {canQuestions && <PracticeSuggestions problems={suggestions} section={progress} onRetry={sections.refresh} />}
          </div>}
          {canLearning && <LearningSubjects subjects={subjects} section={progress} onRetry={sections.refresh} />}
        </div>
      </div>
    </div>
  </RequirePasswordChange>;
}
