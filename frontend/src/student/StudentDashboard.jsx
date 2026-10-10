import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import RequirePasswordChange from './RequirePasswordChange';
import CodingProgress from './profile/CodingProgress';
import useStickySidebar from './profile/useStickySidebar';
import useStudentDashboardData from './dashboard/useStudentDashboardData';
import GreetingHeader from './dashboard/GreetingHeader';
import ContinueSection from './dashboard/ContinueSection';
import ChallengeGoals from './dashboard/ChallengeGoals';
import { LearningSubjects, PracticeSuggestions } from './dashboard/DiscoverySections';
import { AnnouncementsCard, ComingUpCard, DailyChallengeCard, RankCard } from './dashboard/RailCards';
import { card, CardTitle, Unavailable } from './dashboard/ui';
import { getGreeting, getUpcomingItems, getWeekActivity, isImportantAnnouncement, numeric } from './dashboard/dashboardUtils';

// The student shell's sticky header is 64px tall plus a 1px border.
const HEADER_OFFSET = 65;

function dashboardNudge({ data, loading, firstSession, week, daily, resumeItems, canQuestions }) {
  if (loading || !data) return null;
  if (firstSession) return 'Pick a starting point below. Your streak, progress and university rank build from your first solved problem or lesson.';
  const streak = numeric(data.coding?.streak?.current);
  const activeToday = week[week.length - 1]?.count > 0;
  if (streak > 0 && !activeToday) return `Your ${streak}-day streak is waiting. One accepted solution or lesson today keeps it going.`;
  if (streak > 0) return `You have practised today: ${streak}-day streak and counting.`;
  if (canQuestions && daily?.problem && !daily.completed) return `Today's challenge is “${daily.problem.title}”, worth +${numeric(daily.rewardPoints)} rank points.`;
  if (resumeItems[0]) return `Pick up “${resumeItems[0].title}” where you left off.`;
  return 'One problem or one lesson today is enough to keep moving.';
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { allowsPath } = useUniversityPolicy();
  const canQuestions = allowsPath('/problems', 'student');
  const canLearning = allowsPath('/student/learning', 'student');
  const canAssessments = allowsPath('/student/assessments', 'student');
  const canEvents = allowsPath('/student/interview', 'student');
  const sections = useStudentDashboardData({ userId: user?._id || user?.id, canQuestions, canLearning, canEvents, canAssessments });
  const rail = useStickySidebar(HEADER_OFFSET);
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
  const firstName = String(user?.name || 'Student').trim().split(/\s+/)[0] || 'Student';
  const firstSession = Boolean(data) && !progress.loading && !progress.error && !resumeItems.length && !data.ranking?.hasProgress
    && numeric(data.coding?.totalSolved) === 0 && numeric(data.learning?.completedTopics) === 0 && numeric(data.ranking?.score) === 0;
  const urgentNotice = Boolean(sections.announcements.data?.some(isImportantAnnouncement));
  const dueLoading = (canAssessments && sections.assessments.loading) || (canEvents && sections.events.loading);
  const dueError = (canAssessments && sections.assessments.error) || (canEvents && sections.events.error);
  const showChallenges = canQuestions || canLearning;
  const showPractice = canQuestions && (progress.loading || progress.error || suggestions.length > 0);
  const nudge = dashboardNudge({ data, loading: progress.loading, firstSession, week, daily: sections.engagement.data?.daily, resumeItems, canQuestions });
  const announcementsCard = <AnnouncementsCard section={sections.announcements} onRetry={sections.refresh} now={now} />;

  return <RequirePasswordChange user={user}>
    <div className="student-dashboard min-h-[calc(100dvh-65px)] bg-[#f7f8fa] font-jakarta text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-x-6 gap-y-6 px-4 py-5 [grid-template-areas:'head'_'rail'_'body'] sm:px-6 lg:grid-cols-[minmax(0,1fr)_336px] lg:grid-rows-[auto_1fr] lg:px-8 lg:py-6 lg:[grid-template-areas:'head_rail'_'body_rail'] xl:grid-cols-[minmax(0,1fr)_352px]">
        <div className="min-w-0 space-y-6 [grid-area:head]">
          <GreetingHeader greeting={getGreeting(now)} firstName={firstName} now={now} nudge={nudge} data={data} section={progress} week={week}
            firstSession={firstSession} canQuestions={canQuestions} canLearning={canLearning} onRetry={sections.refresh} />
          {!firstSession && (canQuestions || canLearning) && (progress.loading || progress.error || resumeItems.length > 0)
            && <ContinueSection items={resumeItems} section={progress} now={now} onRetry={sections.refresh} />}
        </div>

        <aside ref={rail.ref} style={rail.style} aria-label="Your progress and priorities" className="grid min-w-0 grid-cols-1 content-start gap-3 [grid-area:rail] sm:grid-cols-2 lg:sticky lg:grid-cols-1 lg:self-start">
          {canQuestions && (progress.error
            ? <section aria-labelledby="coding-error-title" className={`p-4 ${card}`}><CardTitle id="coding-error-title" title="Coding progress" /><Unavailable className="mt-3" message="Coding progress could not be loaded." onRetry={sections.refresh} /></section>
            : <CodingProgress {...(data?.coding || {})} compact loading={progress.loading} description={null} showActivity={false} />)}
          {urgentNotice && announcementsCard}
          <RankCard ranking={data?.ranking} loading={progress.loading} error={progress.error} onRetry={sections.refresh} />
          {canQuestions && <DailyChallengeCard section={sections.engagement} onRetry={sections.refresh} />}
          {(canEvents || canAssessments) && <ComingUpCard items={upcoming} loading={dueLoading} error={dueError} onRetry={sections.refresh} canAssessments={canAssessments} canEvents={canEvents} />}
          {!urgentNotice && announcementsCard}
        </aside>

        <div className="min-w-0 space-y-6 [grid-area:body]" data-dashboard-main>
          {(showChallenges || showPractice) && <div className={`grid grid-cols-1 gap-3 ${showChallenges && showPractice ? 'xl:grid-cols-2' : ''}`}>
            {showChallenges && <ChallengeGoals section={sections.engagement} onRetry={sections.refresh} canQuestions={canQuestions} canLearning={canLearning} />}
            {canQuestions && <PracticeSuggestions problems={suggestions} section={progress} onRetry={sections.refresh} />}
          </div>}
          {canLearning && <LearningSubjects subjects={subjects} section={progress} onRetry={sections.refresh} />}
        </div>
      </div>
    </div>
  </RequirePasswordChange>;
}
