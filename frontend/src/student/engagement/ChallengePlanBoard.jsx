import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock3, LockKeyhole, Sparkles } from 'lucide-react';
import { useUniversityPolicy } from '../../platform/UniversityPolicyContext';
import { MISSION_MODULES } from './missionAccess';
import { dailyGoalStatus, dailyPlanProgress } from './dailyChallengeModel';
import { ChallengeGlyph } from './ChallengeArtwork';
import ChallengeAcceptance from './ChallengeAcceptance';

const LABELS = { coding: 'Coding', learning: 'Learning', assessments: 'Assessment', interviews: 'AI interview', events: 'Peer interview', momentum: 'Active days' };
const TITLES = { daily: 'Today’s adventure', weekly: 'Build your momentum', monthly: 'Make this month count' };

function MissionTile({ goal, disabled, index }) {
  const status = dailyGoalStatus(goal);
  const target = Math.max(1, Number(goal.target) || 1);
  const value = goal.completed ? target : Math.min(target, Math.max(0, Number(goal.value) || 0));
  const title = goal.title || goal.label;
  return <li className={`challenge-task challenge-task--${goal.domain} challenge-task--${status}`}>
    <svg viewBox="0 0 170 100" className="challenge-task__curve" aria-hidden="true"><path d="M170 0v100C80 100 117 10 0 0Z" fill="currentColor" /></svg>
    <div className="challenge-task__top"><ChallengeGlyph kind={goal.domain} className="challenge-task__icon" /><span className={`challenge-status challenge-status--${status}`}>{status === 'completed' ? <Check size={11} /> : status === 'paused' ? <LockKeyhole size={11} /> : <span className="challenge-status__dot" />}{status === 'completed' ? 'Completed' : status === 'paused' ? 'Paused' : 'Pending'}</span></div>
    <p className="challenge-task__category">{LABELS[goal.domain] || 'Practice'}<span>{String(index + 1).padStart(2, '0')}</span></p>
    <h3>{title}</h3>
    <div className="challenge-task__meta">{goal.difficulty && <span>{goal.difficulty}</span>}{goal.minutes > 0 && <span><Clock3 size={11} />{goal.minutes} min</span>}{goal.slot === 'stretch' && <span className="challenge-task__bonus">+{goal.rewardXp || 0} XP</span>}</div>
    <div className="challenge-task__bottom"><div className="challenge-task__progress"><div role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={target} aria-valuenow={value}><span style={{ width: `${value / target * 100}%` }} /></div><span>{value}/{target}</span></div>
      {!disabled && !goal.completed && !goal.paused && goal.href && <Link to={goal.href} aria-label={`${value ? 'Continue' : 'Start'}: ${title}`}>{value ? 'Continue' : 'Start'}<ArrowRight size={13} /></Link>}
      {goal.completed && <Check size={16} className="challenge-task__done" />}
    </div>
    {goal.paused ? <p className="challenge-task__explanation">Content unavailable. Earned progress is safe.</p> : goal.reason && <details className="challenge-task__reason"><summary>Why this mission?</summary><p>{goal.reason}</p></details>}
  </li>;
}

export default function ChallengePlanBoard({ data, plan, kind, error, onAccepted }) {
  const { allowsModule, allowsPath } = useUniversityPolicy();
  const [filter, setFilter] = useState('all');
  const goals = (plan?.goals || []).filter(goal => (goal.domain === 'momentum' || allowsModule(MISSION_MODULES[goal.domain])) && (!goal.href || allowsPath(goal.href, 'student')));
  const accessChanged = goals.length !== (plan?.goals?.length || 0);
  const enabled = data?.enabled && !error && !accessChanged && !plan?.paused;
  const completed = Boolean(plan?.earned || plan?.completed);
  const counts = { all: goals.length, pending: 0, completed: 0, paused: 0 };
  goals.forEach(goal => { counts[dailyGoalStatus(goal)]++; });
  const progress = kind === 'daily' ? dailyPlanProgress(goals) : {
    total: goals.length,
    completed: counts.completed,
    percent: goals.length ? Math.round(goals.reduce((sum, goal) => sum + (goal.completed ? 1 : Math.min(1, Math.max(0, Number(goal.value) || 0) / Math.max(1, Number(goal.target) || 1))), 0) / goals.length * 100) : 0,
  };
  const visible = goals.filter(goal => filter === 'all' || dailyGoalStatus(goal) === filter);
  const groups = kind === 'daily' ? [
    ['core', 'Today’s problem', 'Picked for you'],
    ['choice', 'Pick your path', 'Complete any one'],
    ['stretch', 'Go a little further', 'Optional bonus'],
  ] : [['all', 'Your milestones', 'Complete every goal']];
  if (!data?.enabled || !goals.length) return <section className="challenge-empty" role="status"><ChallengeGlyph kind={kind} /><h2>{data?.enabled === false ? 'A little pause, not a stop.' : 'Your next adventure is on its way.'}</h2><p>{data?.enabled === false ? 'Your university has paused challenges. Your earned progress stays safe.' : 'New missions appear when suitable content is available in your enabled modules.'}</p></section>;
  return <section className="challenge-board">
    <div className="challenge-board__heading"><div><p className="challenge-eyebrow"><Sparkles size={12} />YOUR PERSONAL PLAN</p><h2>{TITLES[kind]}</h2></div><span className={`challenge-reward ${completed ? 'challenge-reward--earned' : ''}`}>{completed ? <Check size={13} /> : <Sparkles size={13} />}{completed ? 'Earned' : 'Earn'} {plan.rewardPoints} XP</span></div>
    {(plan.paused || accessChanged) && <p role="status" className="challenge-notice">This plan is paused after an access or content change. Earned progress is safe.</p>}
    <div className="challenge-board__tools">
      <div className="challenge-plan-progress"><div><span>{completed ? 'Plan complete. Nicely done!' : `${progress.completed}/${progress.total} required steps`}</span><strong>{progress.percent}%</strong></div><div role="progressbar" aria-label={`${kind} plan progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}><span style={{ width: `${progress.percent}%` }} /></div></div>
      <ChallengeAcceptance plan={plan} kind={kind} enabled={enabled} compact onAccepted={onAccepted} nextHref={goals.find(goal => !goal.completed && !goal.paused && goal.slot !== 'stretch' && goal.href)?.href} />
    </div>
    <div className="challenge-filters" role="group" aria-label="Filter challenge tasks">{['all', 'pending', 'completed', ...(counts.paused ? ['paused'] : [])].map(status => <button key={status} type="button" aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'all' ? 'All missions' : status === 'pending' ? 'Pending' : status === 'completed' ? 'Completed' : 'Paused'}<span>{counts[status]}</span></button>)}</div>
    <div className="sr-only" aria-live="polite">{visible.length} {filter === 'all' ? '' : filter} missions shown.</div>
    {visible.length ? groups.map(([slot, title, hint]) => {
      const items = slot === 'all' ? visible : visible.filter(goal => goal.slot === slot);
      return items.length ? <div key={slot} className="challenge-task-group"><div className="challenge-task-group__label"><h3>{title}</h3><span>{hint}</span></div><ul className={`challenge-task-grid ${items.length === 1 ? 'challenge-task-grid--single' : ''}`}>{items.map(goal => <MissionTile key={goal.id} goal={goal} disabled={!enabled} index={goals.indexOf(goal)} />)}</ul></div> : null;
    }) : <p className="challenge-filter-empty">{filter === 'completed' ? 'Your first win is waiting. You’ve got this.' : 'Nothing here right now. Explore your other missions.'}</p>}
    <p className="challenge-board__note"><Clock3 size={12} />{kind === 'daily' ? 'One personal problem a day.' : 'Every milestone counts toward this plan.'} A new one arrives at 2 AM IST.</p>
  </section>;
}
