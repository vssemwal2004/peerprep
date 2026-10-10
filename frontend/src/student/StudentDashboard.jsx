import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChevronRight, Clock3, Code2, Cpu, Database, Megaphone, Network, Play, RefreshCw, Sigma } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import RequirePasswordChange from './RequirePasswordChange';
import CodingProgress from './profile/CodingProgress';
import UniversityRankCard from './profile/UniversityRankCard';
import { ChallengeGoalsCard, DailyChallengeCard, LevelBadgesCard } from './engagement/EngagementCards';
import useStudentDashboardData from './dashboard/useStudentDashboardData';
import { CodingStartIllustration, LearningStartIllustration, QuietAnnouncementsIllustration, QuietScheduleIllustration } from './dashboard/DashboardIllustrations';
import { formatRelativeTime, formatSchedule, formatWatchTime, getGreeting, getUpcomingItems, getWeekActivity } from './dashboard/dashboardUtils';
import './dashboard/studentDashboard.css';

const numeric = (value) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : 0;

function SectionHeading({ id, title, description, action, icon: Icon, tone = 'sky' }) {
  return <header className="dashboard-section-heading">
    <div className="dashboard-section-heading-copy">
      <div className="dashboard-section-title-line"><h2 id={id}>{Icon && <i className={`dashboard-heading-icon tone-${tone}`}><Icon size={16} aria-hidden="true" /></i>}{title}</h2><span aria-hidden="true" /></div>
      {description && <p>{description}</p>}
    </div>
    {action}
  </header>;
}

function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`dashboard-skeleton ${className}`} />;
}

function Unavailable({ message, onRetry }) {
  return <div role="status" className="dashboard-unavailable">
    <p>{message}</p>
    <button type="button" onClick={onRetry}><RefreshCw size={13} aria-hidden="true" />Retry</button>
  </div>;
}

function StartGuide({ canQuestions, canLearning, title = 'Start here' }) {
  if (!canQuestions && !canLearning) return null;
  return <section aria-labelledby="start-guide-title" className="dashboard-start-guide">
    <SectionHeading id="start-guide-title" title={title} />
    <div className="dashboard-start-grid">
      {canQuestions && <Link to="/problems" className="dashboard-start-card dashboard-start-coding">
        <CodingStartIllustration className="dashboard-start-art" />
        <div className="dashboard-start-copy"><h3>Start coding</h3><span>Explore questions<ArrowRight size={14} aria-hidden="true" /></span></div>
      </Link>}
      {canLearning && <Link to="/student/learning" className="dashboard-start-card dashboard-start-learning">
        <LearningStartIllustration className="dashboard-start-art" />
        <div className="dashboard-start-copy"><h3>Start learning</h3><span>Explore subjects<ArrowRight size={14} aria-hidden="true" /></span></div>
      </Link>}
    </div>
  </section>;
}

function Overview({ data, section, now, canQuestions, canLearning, onRetry }) {
  const week = getWeekActivity(data?.activityByDate || {}, now);
  const activeDays = week.filter((day) => day.count > 0).length;
  const metrics = [
    ...(canQuestions ? [{ label: 'Problems solved', value: data?.coding?.totalSolved, href: '/problems' }] : []),
    ...(canLearning ? [{ label: 'Topics completed', value: data?.learning?.completedTopics, href: '/student/learning' }] : []),
  ];
  return section.error ? <Unavailable message="Your progress could not be loaded." onRetry={onRetry} /> : <div className="dashboard-overview" aria-label="Your progress at a glance">
    {metrics.map((metric) => <Link key={metric.label} to={metric.href} className="dashboard-overview-metric">
      <span className="dashboard-metric-value">{section.loading ? <Skeleton className="dashboard-skeleton-number" /> : metric.value == null ? '—' : numeric(metric.value).toLocaleString()}</span>
      <span className="dashboard-metric-label">{metric.label}<ArrowUpRight size={12} aria-hidden="true" /></span>
    </Link>)}
    <div className="dashboard-overview-week">
      <span className="dashboard-metric-value">{section.loading ? '—' : activeDays}<small> / 7</small></span>
      <span className="dashboard-metric-label">Active days, last 7</span>
      <div className="dashboard-week-dots" role="img" aria-label={section.loading ? 'Loading weekly activity' : week.map((day) => `${day.fullLabel}: ${day.count} activities`).join(', ')}>
        {week.map((day) => <span key={day.key} className={!section.loading && day.count > 0 ? 'is-active' : ''} title={`${day.fullLabel}: ${day.count} activities`} />)}
      </div>
    </div>
  </div>;
}

function ResumeItem({ item, now, featured = false }) {
  const isCoding = item.type === 'coding';
  const Icon = isCoding ? Code2 : item.contentType === 'video' ? Play : BookOpen;
  const hasWatchProgress = !isCoding && item.contentType === 'video' && item.durationSeconds > 0 && item.progressPercent != null && Number.isFinite(Number(item.progressPercent));
  const progress = hasWatchProgress ? Math.max(0, Math.min(100, Number(item.progressPercent))) : null;
  return <Link to={item.href} state={item.state} className={`dashboard-resume-item ${featured ? 'dashboard-resume-featured' : ''}`}>
    <span className="dashboard-content-icon"><Icon size={featured ? 22 : 18} aria-hidden="true" /></span>
    <div className="dashboard-resume-copy">
      <div className="dashboard-item-eyebrow"><span>{isCoding ? 'Coding' : item.contentType === 'notes' ? 'Notes' : item.contentType === 'questions' ? 'Questions' : 'Video'}</span><span>{formatRelativeTime(item.updatedAt, now)}</span></div>
      <h3>{item.title}</h3>
      {item.subtitle && <p>{item.subtitle}</p>}
      {featured && <div className="dashboard-resume-bottom">
        <span className="dashboard-resume-action">Resume<ArrowRight size={14} aria-hidden="true" /></span>
        {isCoding ? <span className="dashboard-resume-status">Unsolved</span> : item.contentType === 'video' && item.watchedSeconds > 0 && <span className="dashboard-resume-status">{formatWatchTime(item.watchedSeconds)} watched{item.durationSeconds > 0 ? ` / ${formatWatchTime(item.durationSeconds)}` : ''}</span>}
      </div>}
      {hasWatchProgress && featured && <div className="dashboard-resume-progress" role="progressbar" aria-label={`${item.title} watch progress`} aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>}
    </div>
    {!featured && <ArrowUpRight size={15} className="dashboard-item-arrow" aria-hidden="true" />}
  </Link>;
}

function ContinueSection({ items, section, now, onRetry, canQuestions, canLearning }) {
  if (!section.loading && !section.error && !items.length) return <StartGuide canQuestions={canQuestions} canLearning={canLearning} title="Choose your next step" />;
  return <section aria-labelledby="continue-title" className="dashboard-main-section">
    <SectionHeading id="continue-title" title="Continue where you left off" icon={Play} tone="mint" />
    {section.loading ? <div aria-label="Loading recent progress"><Skeleton className="dashboard-skeleton-resume" /></div> : section.error ? <Unavailable message="Your recent progress could not be loaded." onRetry={onRetry} /> : items.length ? <>
      <ResumeItem item={items[0]} now={now} featured />
      {items.length > 1 && <div className="dashboard-recent-list">{items.slice(1, 4).map((item) => <ResumeItem key={item.id} item={item} now={now} />)}</div>}
    </> : null}
  </section>;
}

function SubjectMark({ title }) {
  const name = String(title || '').toLowerCase();
  const Icon = /database|dbms|sql/.test(name) ? Database
    : /network|communication/.test(name) ? Network
      : /operating|architecture|hardware/.test(name) ? Cpu
        : /math|calculus|statistic|algebra/.test(name) ? Sigma
          : /algorithm|programming|data structure|coding/.test(name) ? Code2 : BookOpen;
  const tone = Icon === Database ? 'lavender' : Icon === Network ? 'sky' : Icon === Cpu ? 'amber' : Icon === Sigma ? 'coral' : Icon === Code2 ? 'mint' : 'lavender';
  return <span className={`dashboard-subject-icon tone-${tone}`}><Icon size={21} strokeWidth={1.5} aria-hidden="true" /></span>;
}

function LearningSubjects({ subjects, section, onRetry }) {
  if (!section.loading && !section.error && !subjects.length) return null;
  return <section aria-labelledby="learning-paths-title" className="dashboard-main-section">
    <SectionHeading id="learning-paths-title" title="Explore your learning" icon={BookOpen} tone="lavender" action={<Link className="dashboard-section-link" to="/student/learning">All subjects<ArrowUpRight size={13} aria-hidden="true" /></Link>} />
    {section.loading ? <div className="dashboard-learning-grid">{[0, 1].map((value) => <Skeleton key={value} className="dashboard-skeleton-subject" />)}</div> : section.error ? <Unavailable message="Your learning subjects could not be loaded." onRetry={onRetry} /> : <div className="dashboard-learning-grid">
      {subjects.slice(0, 3).map((subject) => {
        const completed = numeric(subject.completedTopics);
        const total = Math.max(completed, numeric(subject.totalTopics));
        const progress = total ? Math.min(100, Math.round(completed / total * 100)) : 0;
        return <Link key={subject.id} to={subject.href} state={subject.state} className="dashboard-subject">
          <div className="dashboard-subject-top"><SubjectMark title={subject.title} /><span>{subject.semesterName}</span></div>
          <h3>{subject.title}</h3>
          <p><BookOpen size={12} aria-hidden="true" />{total.toLocaleString()} {total === 1 ? 'topic' : 'topics'}{completed > 0 && <><span aria-hidden="true">·</span>{completed} completed</>}</p>
          <div className="dashboard-subject-progress" role="progressbar" aria-label={`${subject.title} completion`} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progress}%` }} /></div>
          <div className="dashboard-subject-bottom"><span>{completed ? progress === 100 ? 'Review subject' : 'Continue subject' : 'Explore subject'}</span><ArrowRight size={14} aria-hidden="true" /></div>
        </Link>;
      })}
    </div>}
  </section>;
}

function PracticeSuggestions({ problems, section, onRetry }) {
  if (!section.loading && !section.error && !problems.length) return null;
  return <section aria-labelledby="practice-next-title" className="dashboard-main-section">
    <SectionHeading id="practice-next-title" title="Next in practice" icon={Code2} tone="coral" action={<Link className="dashboard-section-link" to="/problems">All questions<ArrowUpRight size={13} aria-hidden="true" /></Link>} />
    {section.loading ? <Skeleton className="dashboard-skeleton-practice" /> : section.error ? <Unavailable message="Practice suggestions could not be loaded." onRetry={onRetry} /> : <div className="dashboard-practice-list">
      {problems.slice(0, 3).map((problem, index) => <Link key={problem.id} to={problem.href} className="dashboard-practice-row">
        <span className="dashboard-practice-number">{String(index + 1).padStart(2, '0')}</span>
        <div className="dashboard-practice-copy"><h3>{problem.title}</h3><span>{problem.source === 'shared' ? 'Shared collection' : 'University collection'}</span></div>
        <span className={`dashboard-difficulty dashboard-difficulty-${String(problem.difficulty).toLowerCase()}`}>{problem.difficulty}</span>
        <ArrowUpRight size={16} className="dashboard-item-arrow" aria-hidden="true" />
      </Link>)}
    </div>}
  </section>;
}

function ComingUp({ items, loading, error, onRetry, canAssessments, canEvents }) {
  return <section aria-labelledby="coming-up-title" className="dashboard-rail-section">
    <SectionHeading id="coming-up-title" title="Coming up" icon={CalendarDays} />
    {error && <Unavailable message="Some upcoming items could not be loaded." onRetry={onRetry} />}
    {loading && !items.length ? <Skeleton className="dashboard-skeleton-upcoming" /> : items.length ? <div className="dashboard-upcoming-list">{items.slice(0, 3).map((item) => <Link key={item.id} to={item.href} className="dashboard-upcoming-item">
      <span className={`dashboard-upcoming-marker ${item.available ? 'is-available' : ''}`} aria-hidden="true" />
      <div><span className="dashboard-upcoming-type">{item.label}</span><h3>{item.title}</h3><p><Clock3 size={11} aria-hidden="true" />{item.timeLabel} {formatSchedule(item.time)}</p></div>
      <ChevronRight size={14} className="dashboard-item-arrow" aria-hidden="true" />
    </Link>)}</div> : !error && <div className="dashboard-quiet-state"><QuietScheduleIllustration /><p>Nothing scheduled yet</p></div>}
    <div className="dashboard-rail-links">{canAssessments && <Link to="/student/assessments">Assessments<ArrowUpRight size={12} aria-hidden="true" /></Link>}{canEvents && <Link to="/student/interview">Interviews<ArrowUpRight size={12} aria-hidden="true" /></Link>}</div>
  </section>;
}

function Announcements({ section, onRetry, now }) {
  const [showAll, setShowAll] = useState(false);
  const announcements = [...(section.data || [])].sort((a, b) => ({ high: 0, normal: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, normal: 1, low: 2 }[b.priority] ?? 1) || new Date(b.createdAt) - new Date(a.createdAt));
  const visible = showAll ? announcements : announcements.slice(0, 3);
  return <section aria-labelledby="announcements-title" className="dashboard-rail-section dashboard-announcements-section">
    <SectionHeading id="announcements-title" title="Announcements" icon={Megaphone} tone="coral" />
    {section.loading ? <Skeleton className="dashboard-skeleton-upcoming" /> : section.error ? <Unavailable message="Announcements could not be loaded." onRetry={onRetry} /> : !announcements.length ? <div className="dashboard-quiet-state"><QuietAnnouncementsIllustration /><p>No new announcements</p></div> : <div className="dashboard-announcement-list">{visible.map((announcement) => <article key={announcement._id} className="dashboard-announcement">
      <div className="dashboard-announcement-meta"><span className={announcement.priority === 'high' || announcement.type === 'alert' ? 'is-important' : ''}>{announcement.priority === 'high' ? 'Important' : announcement.type === 'alert' ? 'Notice' : announcement.type === 'motivation' ? 'From your university' : 'University update'}</span><time dateTime={announcement.createdAt}>{formatRelativeTime(announcement.createdAt, now)}</time></div>
      <h3>{announcement.title}</h3>
      {String(announcement.message || '').length > 180 ? <details><summary><span>{String(announcement.message).slice(0, 115)}… </span><strong>Read announcement</strong></summary><p>{announcement.message}</p></details> : <p>{announcement.message}</p>}
    </article>)}</div>}
    {announcements.length > 3 && <button type="button" className="dashboard-section-link" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : `View all ${announcements.length} announcements`}<ArrowRight size={12} aria-hidden="true" /></button>}
  </section>;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { allowsPath } = useUniversityPolicy();
  const canQuestions = allowsPath('/problems', 'student');
  const canLearning = allowsPath('/student/learning', 'student');
  const canAssessments = allowsPath('/student/assessments', 'student');
  const canEvents = allowsPath('/student/interview', 'student');
  const sections = useStudentDashboardData({ userId: user?._id || user?.id, canQuestions, canLearning, canEvents, canAssessments });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const data = sections.dashboard.data;
  const permittedItems = (items) => (Array.isArray(items) ? items : []).filter((item) => item.href && allowsPath(item.href.split('?')[0], 'student'));
  const resumeItems = permittedItems(data?.resumeItems).filter((item) => item.type === 'coding' ? canQuestions : item.type === 'learning' && canLearning);
  const subjects = canLearning ? permittedItems(data?.learningSubjects) : [];
  const suggestions = canQuestions ? permittedItems(data?.suggestedPractice) : [];
  const upcoming = useMemo(() => getUpcomingItems(canAssessments ? sections.assessments.data || [] : [], canEvents ? sections.events.data || [] : [], now), [canAssessments, canEvents, sections.assessments.data, sections.events.data, now]);
  const firstName = String(user?.name || 'Student').trim().split(/\s+/)[0] || 'Student';
  const urgentNotice = sections.announcements.data?.some((item) => item.priority === 'high' || item.type === 'alert');
  const dueLoading = canAssessments && sections.assessments.loading || canEvents && sections.events.loading;
  const dueError = canAssessments && sections.assessments.error || canEvents && sections.events.error;
  const hasRail = canQuestions || canEvents || canAssessments;
  const firstSession = Boolean(data) && !sections.dashboard.loading && !sections.dashboard.error && !resumeItems.length && !data.ranking?.hasProgress && numeric(data.coding?.totalSolved) === 0 && numeric(data.learning?.completedTopics) === 0 && numeric(data.ranking?.score) === 0;

  return <RequirePasswordChange user={user}>
    <div className="student-dashboard">
      <div className={`dashboard-layout ${hasRail ? canQuestions ? '' : 'dashboard-layout-no-coding' : 'dashboard-layout-single'}`}>
        <header className="dashboard-greeting">
            <div className="dashboard-greeting-top"><span>STUDENT HOME</span><span><CalendarDays size={12} aria-hidden="true" />{now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
            <h1>{getGreeting(now)}, <span>{firstName}<svg viewBox="0 0 120 10" preserveAspectRatio="none" fill="none" aria-hidden="true"><path d="M2 6C27 2 68 2 118 5M12 9C42 6 72 5 106 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span></h1>
            <div className="dashboard-greeting-subline"><Link to="/student/profile">My profile<ArrowUpRight size={13} aria-hidden="true" /></Link></div>
            {firstSession ? <StartGuide canQuestions={canQuestions} canLearning={canLearning} /> : <Overview data={data} section={sections.dashboard} now={now} canQuestions={canQuestions} canLearning={canLearning} onRetry={sections.refresh} />}
        </header>

        {canQuestions && <aside className="dashboard-coding" aria-label="Your coding progress">
          {sections.dashboard.error ? <section className="dashboard-coding-error"><SectionHeading title="Coding progress" /><Unavailable message="Coding progress could not be loaded." onRetry={sections.refresh} /></section> : <CodingProgress {...(data?.coding || {})} compact loading={sections.dashboard.loading} description={null} />}
        </aside>}

        <div className="dashboard-main" data-dashboard-main>
          {!firstSession && (canQuestions || canLearning) && <ContinueSection items={resumeItems} section={sections.dashboard} now={now} onRetry={sections.refresh} canQuestions={canQuestions} canLearning={canLearning} />}

          <div className="dashboard-rank-section">{sections.dashboard.error ? <Unavailable message="Your university rank could not be loaded." onRetry={sections.refresh} /> : <UniversityRankCard ranking={data?.ranking} loading={sections.dashboard.loading} variant="wide" />}</div>

          {(canQuestions || canLearning) && <div className="dashboard-engagement-grid">
            <LevelBadgesCard ranking={data?.ranking} loading={sections.dashboard.loading} error={sections.dashboard.error} section={sections.engagement} onRetry={sections.refresh} />
            <ChallengeGoalsCard section={sections.engagement} onRetry={sections.refresh} canQuestions={canQuestions} canLearning={canLearning} />
          </div>}

          {canLearning && <LearningSubjects subjects={subjects} section={sections.dashboard} onRetry={sections.refresh} />}
          {canQuestions && <PracticeSuggestions problems={suggestions} section={sections.dashboard} onRetry={sections.refresh} />}

          {!hasRail && <Announcements section={sections.announcements} onRetry={sections.refresh} now={now} />}
        </div>

        {hasRail && <aside className="dashboard-rail" aria-label="Your progress and priorities">
          {urgentNotice && <Announcements section={sections.announcements} onRetry={sections.refresh} now={now} />}
          {canQuestions && <DailyChallengeCard section={sections.engagement} onRetry={sections.refresh} autoRefresh={false} />}
          {(canEvents || canAssessments) && <ComingUp items={upcoming} loading={dueLoading} error={dueError} onRetry={sections.refresh} canAssessments={canAssessments} canEvents={canEvents} />}
          {!urgentNotice && <Announcements section={sections.announcements} onRetry={sections.refresh} now={now} />}
        </aside>}
        <footer className="dashboard-footer"><button type="button" onClick={sections.refresh}><RefreshCw size={12} aria-hidden="true" />Refresh dashboard</button></footer>
      </div>
    </div>
  </RequirePasswordChange>;
}
