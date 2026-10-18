import { useEffect, useId, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, RefreshCw, Sparkles, Trophy, Zap } from 'lucide-react';
import useChallengeHub from './engagement/useChallengeHub';
import { useAuth } from '../context/AuthContext';
import { publishRanking } from './prepScore/rankingStore';
import ChallengeArtwork, { ChallengeGlyph } from './engagement/ChallengeArtwork';
import ChallengePlanBoard from './engagement/ChallengePlanBoard';
import './engagement/challengeStudio.css';

const PERIODS = [['daily', 'Daily', 'A little, every day'], ['weekly', 'Weekly', 'Find your rhythm'], ['monthly', 'Monthly', 'See how far you go']];
const integer = value => Math.max(0, Number(value) || 0).toLocaleString('en-IN');

function MonthCalendar({ data, accepted }) {
  const today = data.daily?.periodKey || new Date(new Date(data.generatedAt).getTime() + 3.5 * 3600000).toISOString().slice(0, 10);
  const month = data.month?.key || today.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const dayCount = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const days = new Map((data.month?.dailyPlans || []).map(day => [day.dayKey, day]));
  const monthName = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const completedDays = [...days.values()].filter(day => day.completed).length;
  return <section className="challenge-calendar" id="challenge-month" aria-labelledby="challenge-month-title">
    <div className="challenge-aside-heading"><span><CalendarDays size={15} />YOUR JOURNEY</span><span className="challenge-calendar__count">{completedDays} wins</span></div>
    <h2 id="challenge-month-title">{monthName}</h2>
    <div className="challenge-calendar__grid" aria-label={`${monthName} daily challenge calendar`}>
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={index} className="challenge-calendar__weekday">{day}</span>)}
      {Array.from({ length: start.getUTCDay() }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {Array.from({ length: dayCount }, (_, index) => {
        const dayKey = `${month}-${String(index + 1).padStart(2, '0')}`;
        const plan = days.get(dayKey);
        const isAccepted = plan?.acceptedAt || accepted[`daily:${dayKey}`];
        const state = plan?.completed ? 'Completed' : dayKey > today ? 'Upcoming' : !plan ? 'No assigned challenge' : dayKey < today ? 'Not completed' : isAccepted ? 'Accepted' : 'Ready for today';
        return <span key={dayKey} title={`${dayKey}: ${state}`} aria-label={`${dayKey}: ${state}`} className={`challenge-calendar__day ${dayKey === today ? 'is-today' : ''} ${plan?.completed ? 'is-complete' : dayKey > today ? 'is-future' : ''}`}>{plan?.completed ? <><Check size={13} /><small>{index + 1}</small></> : index + 1}</span>;
      })}
    </div>
    <div className="challenge-calendar__legend"><span><i />Completed</span><span><i />Today</span></div>
    <p>New daily missions arrive as you grow.</p>
  </section>;
}

export default function StudentChallenges() {
  const { section, ranking, rankingError, refresh, hasAccess } = useChallengeHub();
  const { user } = useAuth();
  // The header's Prep Score chip shows the ranking this page loaded (no extra request).
  useEffect(() => { publishRanking(user?._id || user?.id, ranking); }, [ranking, user]);
  const [params, setParams] = useSearchParams();
  const [accepted, setAccepted] = useState({});
  const tab = PERIODS.some(([kind]) => kind === params.get('period')) ? params.get('period') : 'daily';
  const id = useId();
  const data = section.data;
  const select = (kind, focus = false) => {
    setParams(previous => { const next = new URLSearchParams(previous); next.set('period', kind); return next; });
    if (focus) document.getElementById(`${id}-${kind}`)?.focus();
  };
  const plans = data ? { daily: data.daily, ...Object.fromEntries((data.periods || []).map(plan => [plan.kind, plan])) } : {};
  const plan = plans[tab];
  const localReceipt = accepted[`${tab}:${plan?.periodKey}`];
  const currentPlan = plan && localReceipt ? { ...plan, acceptedAt: plan.acceptedAt || localReceipt } : plan;
  return <div className="challenge-studio">
    <div className="challenge-studio__inner">
      <header className="challenge-page-heading"><h1><Sparkles size={20} />Challenges</h1><button type="button" onClick={refresh} disabled={section.loading || !hasAccess} className="challenge-refresh"><RefreshCw size={14} className={section.loading ? 'animate-spin motion-reduce:animate-none' : ''} />Refresh progress</button></header>
      <section className="challenge-hero" aria-label="Your challenge journey">
        <svg className="challenge-hero__curves" viewBox="0 0 1200 270" preserveAspectRatio="none" aria-hidden="true"><path d="M480-70C640 190 1000-120 1280 120v180H420C580 200 340 30 480-70Z" fill="white" opacity=".035" /><path d="M720-50C500 130 1100 260 1290 100" stroke="white" strokeWidth="1" opacity=".16" fill="none" /><path d="M-90 230C260 30 400 420 780 190S1090 150 1270 210" fill="none" stroke="#67e8f9" strokeWidth="60" opacity=".06" /></svg>
        <div className="challenge-hero__copy"><span className="challenge-hero__eyebrow"><span />BUILT AROUND YOU</span><h2>Small steps.<br /><span>Big possibilities.</span></h2><p>Your pace. Your path. Your next win.</p></div>
        <ChallengeArtwork className="challenge-hero__art" />
        <div className="challenge-hero__stats">
          <div><Zap size={16} /><span><small>Challenge XP</small><strong>{data ? integer(data.lifetime.points) : '—'}</strong></span></div>
          <div><Trophy size={16} /><span><small>University rank</small><strong>{ranking?.rank ? `#${ranking.rank} / ${ranking.totalStudents}` : rankingError ? 'Unavailable' : section.loading ? '—' : 'Not ranked yet'}</strong></span></div>
          <div><Sparkles size={16} /><span><small>{data?.level?.title || 'Current level'}</small><strong>{data ? `Level ${data.level.level}` : '—'}</strong></span></div>
        </div>
      </section>
      {!hasAccess ? <section className="challenge-empty"><ChallengeGlyph kind="weekly" /><h2>Challenges are not available</h2><p>Your university has not enabled any challenge-supported modules. Ask your administrator about access.</p></section> : <div className="challenge-layout">
        <div className="challenge-main">
          <div role="tablist" aria-label="Challenge schedule" className="challenge-schedules" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const position = PERIODS.findIndex(([kind]) => kind === tab);
            select(PERIODS[event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (position + (event.key === 'ArrowLeft' ? 2 : 1)) % 3][0], true);
          }}>{PERIODS.map(([kind, label, hint]) => <button key={kind} id={`${id}-${kind}`} role="tab" type="button" aria-selected={tab === kind} aria-controls={`${id}-panel`} tabIndex={tab === kind ? 0 : -1} onClick={() => select(kind)} className={`challenge-schedule challenge-schedule--${kind}`}><span className="challenge-schedule__label">{label}</span><ChallengeGlyph kind={kind} /><span className="challenge-schedule__hint">{hint}</span><span className="challenge-schedule__reward">{plans[kind]?.goals?.length ? `${plans[kind].earned || plans[kind].completed ? 'Earned' : 'Earn'} ${plans[kind].rewardPoints} XP` : section.loading ? 'Loading…' : 'View plan'}<ArrowRight size={13} /></span></button>)}</div>
          {section.error && <div className="challenge-notice" role="alert">{data ? 'Showing last synced progress. ' : ''}{section.error}<button onClick={refresh}>Retry challenges</button></div>}
          <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
            {!data && section.loading ? <div className="challenge-loading" role="status"><span className="sr-only">Loading challenges</span><div /><div /><div /></div>
              : data ? <ChallengePlanBoard key={`${tab}:${plan?.periodKey}`} data={data} plan={currentPlan} kind={tab} error={section.error} onAccepted={result => { if (result.acceptedAt) setAccepted(previous => ({ ...previous, [`${result.kind}:${result.periodKey}`]: result.acceptedAt })); }} />
                : <section className="challenge-empty"><ChallengeGlyph kind={tab} /><h2>Your plan is taking a little longer.</h2><p>Use Refresh to try again. Your progress is safe.</p></section>}
          </div>
        </div>
        <aside className="challenge-aside" aria-label="Monthly progress">
          {data && <MonthCalendar data={data} accepted={accepted} />}
          <section className="challenge-collection"><ChallengeGlyph kind="monthly" /><p className="challenge-eyebrow">MAKE IT A COLLECTION</p><h2>Little wins.<br />Lasting achievements.</h2><Link to="/student/profile#badges">Explore your badges<ArrowRight size={15} /></Link><svg viewBox="0 0 300 80" aria-hidden="true"><path d="M0 60C80-30 160 140 300 10v70H0Z" fill="currentColor" /></svg></section>
          <details className="challenge-rules"><summary>How do rewards work?</summary><p>Finish the core and one choice for daily XP; finish every goal for weekly/monthly XP. Stretch is optional.</p><p>Every verified XP adds 1 university score point. Rank also depends on other students. {ranking ? `Your total score: ${integer(ranking.score)}.` : ''}</p><p>Plans reset at 2 AM IST. Missed days never remove earned XP.</p></details>
        </aside>
      </div>}
    </div>
  </div>;
}
