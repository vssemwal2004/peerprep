import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Award, BookOpen, CalendarDays, Check, Clock3, Code2, Flag, LockKeyhole, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { computeAwards } from '../profile/achievements';
import { getLearnerLevel } from '../profileBadge';
import { api } from '../../utils/api';
import { CodingStartIllustration } from '../dashboard/DashboardIllustrations';
import './studentEngagement.css';

const finite = (value) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const date = (value, options) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleDateString(undefined, { timeZone: 'Asia/Kolkata', ...options }) : '';
};
const edition = (kind, key) => date(`${key}${kind === 'monthly' ? '-01' : ''}T12:00:00Z`, kind === 'monthly' ? { month: 'short', year: 'numeric' } : { month: 'short', day: 'numeric' });

export function BadgeEmblem({ mark, earned = false, className = '' }) {
  return <svg viewBox="0 0 72 82" fill="none" className={`engagement-emblem ${earned ? 'is-earned' : ''} ${className}`} aria-hidden="true" focusable="false">
    <path d="m23 51-6 25 17-8 6 10 9-27" className="engagement-ribbon" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="m48 51 7 25-17-8-6 10-8-27" className="engagement-ribbon" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="m36 4 25 14v29L36 62 11 47V18L36 4Z" className="engagement-shield" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="m36 11 19 11v21L36 54 17 43V22l19-11Z" className="engagement-shield-inner" strokeWidth="1" />
    {mark ? <text x="36" y="38" textAnchor="middle" fontSize="19" fontWeight="600" fill="currentColor">{mark}</text> : <path d="m36 23 3.1 6.2 6.9 1-5 4.8 1.2 6.8-6.2-3.2-6.2 3.2 1.2-6.8-5-4.8 6.9-1L36 23Z" fill="currentColor" opacity=".8" />}
  </svg>;
}

function Card({ title, icon: Icon, action, children, className = '', loading = false }) {
  return <section className={`student-engagement ${className}`} aria-busy={loading}>
    <header className="engagement-card-heading"><h2>{Icon && <span className="engagement-heading-icon"><Icon size={16} aria-hidden="true" /></span>}{title}</h2>{action}</header>
    {children}
  </section>;
}

function Loading() { return <div className="engagement-loading" aria-label="Loading challenges" />; }
function Failure({ onRetry }) {
  return <div className="engagement-failure" role="status"><span>Progress unavailable</span><button type="button" onClick={onRetry}><RefreshCw size={12} aria-hidden="true" />Retry</button></div>;
}

function BadgeCollection({ data }) {
  const [badges, setBadges] = useState(data.badges || []);
  const [cursor, setCursor] = useState(data.badgesCursor || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const version = useRef(0);
  useEffect(() => {
    version.current += 1;
    setBadges(data.badges || []); setCursor(data.badgesCursor || null); setLoading(false); setError(false);
    return () => { version.current += 1; };
  }, [data.badges, data.badgesCursor]);
  const more = async () => {
    if (!cursor || loading) return;
    const requestVersion = version.current;
    setLoading(true); setError(false);
    try {
      const result = await api.getStudentChallengeBadges(cursor);
      if (requestVersion !== version.current) return;
      setBadges((previous) => [...new Map([...previous, ...(result.badges || [])].map((badge) => [badge.id, badge])).values()]);
      setCursor(result.nextCursor || null);
    } catch { if (requestVersion === version.current) setError(true); }
    finally { if (requestVersion === version.current) setLoading(false); }
  };
  return <details className="engagement-collection" id="challenge-collection"><summary>Collected editions <span>{data.lifetime.badges}</span></summary><div className="engagement-collected-badges">{badges.map((badge) => <div key={badge.id} title={`${badge.title} · earned ${date(badge.earnedAt, { month: 'short', day: 'numeric', year: 'numeric' })}`}><BadgeEmblem mark={badge.kind === 'weekly' ? 'W' : 'M'} earned /><strong>{edition(badge.kind, badge.periodKey)}</strong><span>{badge.kind === 'weekly' ? 'Weekly' : 'Monthly'}</span></div>)}</div>{cursor && <button type="button" className="engagement-text-link engagement-more-editions" onClick={more} disabled={loading}>{loading ? 'Loading…' : error ? 'Retry older editions' : 'More editions'}<ArrowRight size={12} aria-hidden="true" /></button>}{error && <p role="status">Older editions could not be loaded.</p>}<p>Earned editions stay in your collection.</p></details>;
}

export function LevelBadgesCard({ ranking, loading = false, error = false, section, onRetry, onOpenGallery, className = '' }) {
  const hasMetrics = Boolean(ranking?.levelMetrics && ranking?.badgeMetrics);
  const level = hasMetrics ? getLearnerLevel(ranking.levelMetrics) : null;
  const awards = hasMetrics ? computeAwards(ranking.badgeMetrics) : null;
  const badges = finite(awards?.earnedCount) + finite(section?.data?.lifetime?.badges ?? ranking?.challengeBadges);
  const featured = awards ? [...awards.awards.filter((award) => award.earned).slice(-2), ...awards.awards.filter((award) => !award.earned).sort((a, b) => b.progress - a.progress)].slice(0, 3) : [];
  const action = onOpenGallery
    ? <button type="button" className="engagement-text-link" onClick={() => onOpenGallery('awards')}>All badges<ArrowUpRight size={12} aria-hidden="true" /></button>
    : <Link to="/student/profile" className="engagement-text-link">My badges<ArrowUpRight size={12} aria-hidden="true" /></Link>;
  return <Card title="Level & badges" icon={Award} action={action} loading={loading} className={`engagement-level-card ${className}`}>
    {loading ? <Loading /> : error || !hasMetrics ? <Failure onRetry={onRetry} /> : <>
      <div className="engagement-level-header">
        <BadgeEmblem mark={level.level} earned />
        <div><span className="engagement-kicker">Level {level.level} of {level.totalLevels}</span><h3>{level.title}</h3><p>{badges} {badges === 1 ? 'badge' : 'badges'} earned</p></div>
      </div>
      <div className="engagement-level-track" role="progressbar" aria-label="Next level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level.progress)}><span style={{ width: `${level.progress}%` }} /></div>
      <div className="engagement-level-caption"><span>{level.next ? `Next: ${level.next.title}` : 'Highest level reached'}</span><strong>{Math.round(level.progress)}%</strong></div>
      <div className="engagement-badge-preview">{featured.map((award) => <div key={award.id} className={`engagement-small-badge ${award.earned ? 'is-earned' : ''}`}>
        <BadgeEmblem earned={award.earned} />
        <strong>{award.title}</strong>
        <span>{award.earned ? <><Check size={10} aria-hidden="true" />Earned</> : <><LockKeyhole size={9} aria-hidden="true" />{Math.min(award.value, award.target)}/{award.target}</>}</span>
      </div>)}</div>
    </>}
  </Card>;
}

export function DailyChallengeCard({ section, onRetry, autoRefresh = true }) {
  const [now, setNow] = useState(() => Date.now());
  const retryRef = useRef(onRetry);
  retryRef.current = onRetry;
  const deadline = new Date(section?.data?.daily?.endsAt || '').getTime();
  useEffect(() => {
    if (!Number.isFinite(deadline)) return undefined;
    let expired = false;
    const timer = setInterval(() => {
      const timestamp = Date.now();
      setNow(timestamp);
      if (autoRefresh && !expired && timestamp >= deadline) { expired = true; retryRef.current?.(); }
    }, 60000);
    return () => clearInterval(timer);
  }, [deadline, autoRefresh]);
  const daily = section?.data?.daily;
  const minutes = Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 60000)) : 0;
  const remaining = `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return <Card title="Daily challenge" icon={Sparkles} action={<span className="engagement-today-tag">TODAY</span>} className={`engagement-daily-card ${daily?.completed ? 'is-completed' : ''}`} loading={section?.loading}>
    {section?.loading ? <Loading /> : section?.error || !section?.data ? <Failure onRetry={onRetry} /> : !daily?.problem ? <div className="engagement-daily-empty"><CodingStartIllustration /><p>{daily?.enabled === false ? 'Daily challenge is paused' : 'New challenge coming soon'}</p></div> : <>
      <div className="engagement-daily-meta"><span className={`engagement-difficulty difficulty-${String(daily.problem.difficulty).toLowerCase()}`}>{daily.problem.difficulty}</span><span className="engagement-reward">+{daily.rewardPoints} rank points</span></div>
      <div className="engagement-daily-question"><span className="engagement-code-tile"><Code2 size={25} strokeWidth={1.5} aria-hidden="true" /></span><h3 className="engagement-daily-title">{daily.problem.title}</h3></div>
      <div className="engagement-daily-status">{daily.completed ? <span><Check size={13} aria-hidden="true" />Completed today</span> : <span><Clock3 size={12} aria-hidden="true" />{remaining} left</span>}<span>2 AM IST reset</span></div>
      <Link className={`engagement-primary-link ${daily.completed ? 'is-completed' : ''}`} to={daily.problem.href}>{daily.completed ? 'Review solution' : 'Solve challenge'}<ArrowRight size={14} aria-hidden="true" /></Link>
    </>}
  </Card>;
}

export function ChallengeGoalsCard({ section, onRetry, canQuestions = true, canLearning = true }) {
  const tabsId = useId();
  const [tab, setTab] = useState('weekly');
  const tabsRef = useRef(null);
  const period = section?.data?.periods?.find((entry) => entry.kind === tab);
  const earned = section?.data?.badges || [];
  const permitted = (href) => href === '/problems' ? canQuestions : href === '/student/learning' && canLearning;
  const next = period?.goals?.find((goal) => !goal.completed && !goal.paused && permitted(goal.href));
  const changeTab = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 'weekly' : event.key === 'End' ? 'monthly' : tab === 'weekly' ? 'monthly' : 'weekly';
    setTab(target);
    tabsRef.current?.querySelector(`[data-period="${target}"]`)?.focus();
  };
  return <Card title="Your challenges" icon={tab === 'weekly' ? Flag : Trophy} className={`engagement-goals-card engagement-period-${tab}`} loading={section?.loading}>
    <div className="engagement-period-tabs" role="tablist" aria-label="Challenge period" ref={tabsRef} onKeyDown={changeTab}>
      {['weekly', 'monthly'].map((kind) => <button key={kind} type="button" data-period={kind} role="tab" id={`${tabsId}-${kind}`} aria-controls={`${tabsId}-panel`} aria-selected={tab === kind} tabIndex={tab === kind ? 0 : -1} onClick={() => setTab(kind)}>{kind === 'weekly' ? 'This week' : 'This month'}</button>)}
    </div>
    {section?.loading ? <Loading /> : section?.error || !section?.data ? <Failure onRetry={onRetry} /> : !period ? <div className="engagement-goals-empty"><BadgeEmblem /><span>Explore a subject or question to begin</span></div> : <div role="tabpanel" id={`${tabsId}-panel`} aria-labelledby={`${tabsId}-${tab}`}>
      <div className="engagement-period-header"><BadgeEmblem mark={tab === 'weekly' ? 'W' : 'M'} earned={period.earned} /><div><h3>{period.title}</h3><p>{edition(tab, period.periodKey)}{tab === 'weekly' ? ' week' : ' edition'}</p></div><span className="engagement-reward">+{period.rewardPoints}<small>rank points</small></span></div>
      <div className="engagement-goals">{period.goals.map((goal) => {
        const Icon = goal.completed ? Check : goal.paused ? LockKeyhole : goal.metric === 'coding' ? Code2 : goal.metric === 'learning' ? BookOpen : CalendarDays;
        return <div key={goal.metric} className={`engagement-goal ${goal.completed ? 'is-completed' : ''}`}>
          <div className="engagement-goal-line"><Icon size={13} aria-hidden="true" /><span>{goal.label}</span><strong>{goal.paused ? 'Paused' : `${goal.value}/${goal.target}`}</strong></div>
          <div className="engagement-goal-track" role="progressbar" aria-label={`${tab} ${goal.label} progress`} aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={Math.min(goal.value, goal.target)}><span style={{ width: `${goal.progress}%` }} /></div>
        </div>;
      })}</div>
      <div className="engagement-period-footer">{period.earned ? <span className="engagement-earned-caption"><Check size={13} aria-hidden="true" />Badge collected</span> : next ? <Link className="engagement-text-link" to={next.href}>Keep going<ArrowRight size={13} aria-hidden="true" /></Link> : <span className="engagement-muted">{period.paused ? 'Waiting for university access' : 'One practice day at a time'}</span>}<span>Resets {date(period.endsAt, { month: 'short', day: 'numeric' })}</span></div>
    </div>}
    {earned.length > 0 && <BadgeCollection data={section.data} />}
    {section?.data?.rules && <details className="engagement-rules"><summary>How rewards work</summary><p>{section.data.rules}</p></details>}
    {section?.data?.newAwards?.length > 0 && <p className="engagement-award-update" role="status"><Check size={12} aria-hidden="true" />{section.data.newAwards.length === 1 ? 'Challenge reward earned' : `${section.data.newAwards.length} challenge rewards earned`} · +{section.data.newAwards.reduce((sum, award) => sum + finite(award.rewardPoints), 0)} rank points</p>}
  </Card>;
}
