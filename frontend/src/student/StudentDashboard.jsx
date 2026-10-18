import { useEffect, useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import RequirePasswordChange from './RequirePasswordChange';
import CodingProgress from './profile/CodingProgress';
import useStudentDashboardData from './dashboard/useStudentDashboardData';
import AnnouncementBar from './dashboard/AnnouncementBar';
import useDismissedAnnouncement from './dashboard/useDismissedAnnouncement';
import GreetingHeader from './dashboard/GreetingHeader';
import ContinueSection from './dashboard/ContinueSection';
import TodayCard from './dashboard/TodayCard';
import CodingSheets from './dashboard/CodingSheets';
import { PracticeSuggestions } from './dashboard/DiscoverySections';
import { AnnouncementsCard, ComingUpCard, RankCard } from './dashboard/RailCards';
import { card, CardTitle, TitleIcon, Unavailable } from './dashboard/ui';
import BadgeShelf from './dashboard/BadgeShelf';
import { badgeShelfData, getGreeting, getUpcomingItems, getWeekActivity, numeric, sortAnnouncements } from './dashboard/dashboardUtils';
import AchievementCelebration from './engagement/AchievementCelebration';
import { publishRanking } from './prepScore/rankingStore';

// The student shell's sticky header is 64px tall plus a 1px border. The rail sticks 16px below
// it and is capped to the viewport, so only the main column scrolls on large screens.
const railPosition = 'lg:sticky lg:top-[81px] lg:max-h-[calc(100dvh-97px)] lg:overflow-y-auto lg:overscroll-contain';
const rise = (step, className = '') => ({ className: `dashboard-rise ${className}`.trim(), style: { '--rise': step } });

function dashboardNudge({ data, loading, firstSession, week, daily, resumeItems, canQuestions }) {
  if (loading || !data) return null;
  if (firstSession) return 'Pick a starting point below to begin.';
  const streak = numeric(data.coding?.streak?.current);
  const activeToday = week[week.length - 1]?.count > 0;
  if (streak > 0 && !activeToday) return `One problem today keeps your ${streak}-day streak alive.`;
  if (streak > 0) return `${streak}-day streak and counting. Good to see you back.`;
  if (canQuestions && daily?.problem && !daily.completed) return `Today's challenge is worth +${numeric(daily.rewardPoints)} XP.`;
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
  const canInterviews = allowsPath('/student/ai-interviews', 'student');
  const sections = useStudentDashboardData({ userId: user?._id || user?.id, canQuestions, canLearning, canEvents, canAssessments, canInterviews });
  const [dismissedNotice, dismissNotice] = useDismissedAnnouncement();
  const [allNotices, setAllNotices] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const progress = sections.dashboard;
  const data = progress.data;
  // The header's Prep Score chip shows the ranking this page loaded (no extra request).
  useEffect(() => { publishRanking(user?._id || user?.id, data?.ranking); }, [data?.ranking, user]);
  const permittedItems = (items) => (Array.isArray(items) ? items : []).filter((item) => item.href && allowsPath(item.href.split('?')[0], 'student'));
  const resumeItems = permittedItems(data?.resumeItems).filter((item) => item.type === 'coding' || item.type === 'quest' ? canQuestions : item.type === 'learning' && canLearning);
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
  const showChallenges = canQuestions || canLearning || canAssessments || canEvents || canInterviews;
  const showDaily = showChallenges && (canQuestions || sections.engagement.data?.version === 2);
  const showPractice = canQuestions && (progress.loading || progress.error || suggestions.length > 0);
  const showResume = !firstSession && (canQuestions || canLearning) && (progress.loading || progress.error || resumeItems.length > 0);
  const showToday = canQuestions || canLearning || showDaily;
  const shelf = badgeShelfData(sections.engagement.error ? null : sections.engagement.data, data?.ranking);
  const nudge = sections.engagement.data?.version === 2
    ? sections.engagement.data.daily?.completed ? 'Today’s challenge is done. Your progress is saved.' : 'Your daily challenge is ready. One problem keeps your streak going.'
    : dashboardNudge({ data, loading: progress.loading, firstSession, week, daily: sections.engagement.data?.daily, resumeItems, canQuestions });

  return <RequirePasswordChange user={user}>
    <div className="student-dashboard min-h-[calc(100dvh-65px)] bg-[#f6f7f9] bg-[radial-gradient(1100px_520px_at_12%_-180px,rgba(14,165,233,0.08),transparent_70%),radial-gradient(900px_420px_at_88%_-200px,rgba(139,92,246,0.05),transparent_70%)] bg-no-repeat font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:bg-none dark:text-zinc-100">
      {showNoticeBar && <div className="mx-auto max-w-[1360px] px-4 pt-5 sm:px-6 lg:px-10">
        <AnnouncementBar announcement={notices[0]} total={notices.length} now={now} onView={viewNotices} onDismiss={() => dismissNotice(notices[0]._id)} />
      </div>}
      <div className={`mx-auto grid max-w-[1360px] grid-cols-1 gap-x-8 gap-y-8 px-4 py-6 [grid-template-areas:'head'_'rail'_'body'] sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:px-10 lg:[grid-template-areas:'head_rail'_'body_rail'] xl:grid-cols-[minmax(0,1fr)_356px] ${showNoticeBar ? 'lg:pb-8 lg:pt-6' : 'lg:py-8'}`}>
        <div className="min-w-0 space-y-7 [grid-area:head]">
          <GreetingHeader greeting={getGreeting(now)} name={name} nudge={nudge} section={progress}
            firstSession={firstSession} canQuestions={canQuestions} canLearning={canLearning} onRetry={sections.refresh}
            aside={!progress.error && <BadgeShelf shelf={shelf} loading={progress.loading || sections.engagement.loading} />} />
          {(showResume || showToday) && <div className={`grid grid-cols-1 items-stretch gap-4 ${showResume && showToday ? 'xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]' : ''}`}>
            {showResume && <ContinueSection items={resumeItems} section={progress} now={now} onRetry={sections.refresh} {...rise(1)} />}
            {showToday && <TodayCard now={now} week={week} streak={data?.coding?.streak} loading={progress.loading} engagement={sections.engagement}
              showDaily={showDaily} fallbackProblem={suggestions[0]} onRetry={sections.refresh} {...rise(2)} />}
          </div>}
        </div>

        <aside aria-label="Your progress and priorities" className={`grid min-w-0 grid-cols-1 content-start gap-3 [grid-area:rail] sm:grid-cols-2 lg:grid-cols-1 lg:self-start ${railPosition}`}>
          {showNotices && <AnnouncementsCard items={notices} section={sections.announcements} onRetry={sections.refresh} now={now}
            showAll={allNotices} onToggleAll={() => setAllNotices((value) => !value)} />}
          {canQuestions && (progress.error
            ? <section aria-labelledby="coding-error-title" className={`p-4 ${card}`}><CardTitle id="coding-error-title" title="Coding progress" icon={Gauge} tone="sky" /><Unavailable className="mt-3" message="Coding progress could not be loaded." onRetry={sections.refresh} /></section>
            : <CodingProgress {...(data?.coding || {})} compact loading={progress.loading} description={null} titleIcon={<TitleIcon icon={Gauge} tone="sky" />}
              className="!rounded-2xl !border-[#e9eaee] !p-4 !shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:!border-white/[0.07]" />)}
          <RankCard ranking={data?.ranking} loading={progress.loading} error={progress.error} onRetry={sections.refresh} />
          {(canEvents || canAssessments) && <ComingUpCard items={upcoming} loading={dueLoading} error={dueError} onRetry={sections.refresh} canAssessments={canAssessments} canEvents={canEvents} />}
        </aside>

        <div className="min-w-0 space-y-8 [grid-area:body]" data-dashboard-main>
          {canQuestions && <CodingSheets />}
          {showPractice && <div {...rise(4)}><PracticeSuggestions problems={suggestions} section={progress} onRetry={sections.refresh} /></div>}
        </div>
      </div>
      <AchievementCelebration revision={sections.engagement.data?.generatedAt} enabled={!sections.engagement.error && sections.engagement.data?.version === 2} />
    </div>
  </RequirePasswordChange>;
}
