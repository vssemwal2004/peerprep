import { useEffect, useRef, useState } from 'react';
import { CalendarRange, Coins, Users } from 'lucide-react';
import { api } from '../../../utils/api';
import { daysLeft } from '../universityModel';
import { Button, Card, Field, helper, inputClass } from '../ui';

function Usage({ label, used, limit }) {
  const share = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const tone = share >= 100 ? 'bg-rose-500' : share >= 85 ? 'bg-amber-500' : 'bg-sky-500';
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-medium text-slate-800 dark:text-slate-200">{label}</span><span className="tabular-nums text-slate-600 dark:text-slate-300">{used.toLocaleString()} of {limit ?? '—'}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${tone}`} style={{ width: `${share}%` }} /></div>
    </div>
  );
}

/** Service period, account limits with live usage, and the university's Prep Coin wallet. */
export default function PlanTab({ university, run, busy }) {
  const id = university.universityId;
  const [start, setStart] = useState(university.serviceStartDate || '');
  const [end, setEnd] = useState(university.serviceEndDate || '');
  const [coordinatorLimit, setCoordinatorLimit] = useState(String(university.coordinatorLimit ?? ''));
  const [studentLimit, setStudentLimit] = useState(String(university.studentLimit ?? ''));
  const [assessmentStudentLimit, setAssessmentStudentLimit] = useState(String(university.assessmentStudentLimit ?? ''));
  const [prepMockStudentLimit, setPrepMockStudentLimit] = useState(String(university.prepMockStudentLimit ?? 0));
  const [counts, setCounts] = useState(null);
  const [countError, setCountError] = useState('');
  const [topUp, setTopUp] = useState('');
  const topUpRequest = useRef(null);
  const left = daysLeft(university);

  useEffect(() => {
    let live = true;
    api.universityAccountCounts(id).then((value) => { if (live) setCounts(value); }).catch((error) => { if (live) setCountError(error.message || 'Current usage is unavailable.'); });
    return () => { live = false; };
  }, [id, university.coordinatorLimit, university.studentLimit, university.assessmentStudentLimit, university.prepMockStudentLimit]);

  const datesChanged = start !== (university.serviceStartDate || '') || end !== (university.serviceEndDate || '');
  const limitsChanged = coordinatorLimit !== String(university.coordinatorLimit ?? '') || studentLimit !== String(university.studentLimit ?? '') || assessmentStudentLimit !== String(university.assessmentStudentLimit ?? '') || prepMockStudentLimit !== String(university.prepMockStudentLimit ?? 0);
  const refreshCounts = () => api.universityAccountCounts(id).then(setCounts).catch((error) => setCountError(error.message || 'Current usage is unavailable.'));
  const whole = (value) => /^\d+$/.test(value);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card id="service-title" title="Service period" icon={CalendarRange} description={left === null ? 'Students can sign in only within the service period.' : left < 0 ? 'The service period has ended: students cannot sign in.' : `Students can sign in for ${left} more day${left === 1 ? '' : 's'}.`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts"><input className={inputClass} type="date" value={start} onChange={(event) => setStart(event.target.value)} /></Field>
          <Field label="Ends (inclusive)"><input className={inputClass} type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
        </div>
        {start && end && end < start && <p className="mt-2 text-xs font-medium text-rose-600">The service must end after it starts.</p>}
        <Button className="mt-4" busy={busy === 'dates'} disabled={!datesChanged || !start || !end || end < start}
          onClick={() => run('dates', () => api.updateUniversity(id, { serviceStartDate: start, serviceEndDate: end }), 'Service period saved.')}>Save service period</Button>
      </Card>

      <Card id="limits-title" title="Account and assessment limits" icon={Users} description="Account limits control new accounts. Assessment places count every student added to a published university assessment, including existing students and the same student in another assessment.">
        <div className="space-y-3">
          {counts ? <><Usage label="Coordinators" used={counts.coordinators} limit={university.coordinatorLimit} /><Usage label="Students" used={counts.students} limit={university.studentLimit} /><Usage label="Assessment student places" used={counts.assessmentStudentUsed ?? 0} limit={counts.assessmentStudentLimit} /><Usage label="PrepMock students" used={counts.prepMockStudents ?? 0} limit={university.prepMockStudentLimit ?? 0} /></>
            : <p className={helper}>{countError || 'Checking current usage…'}</p>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Maximum coordinators"><input className={inputClass} type="number" min="0" step="1" value={coordinatorLimit} onChange={(event) => setCoordinatorLimit(event.target.value)} /></Field>
          <Field label="Maximum students"><input className={inputClass} type="number" min="0" step="1" value={studentLimit} onChange={(event) => setStudentLimit(event.target.value)} /></Field>
          <Field label="Assessment student places"><input className={inputClass} type="number" min="0" step="1" value={assessmentStudentLimit} onChange={(event) => setAssessmentStudentLimit(event.target.value)} placeholder="Set a limit" /></Field>
          <Field label="PrepMock student limit"><input className={inputClass} type="number" min="0" step="1" value={prepMockStudentLimit} onChange={(event) => setPrepMockStudentLimit(event.target.value)} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button busy={busy === 'limits'} disabled={!limitsChanged || !whole(coordinatorLimit) || !whole(studentLimit) || !whole(assessmentStudentLimit) || !whole(prepMockStudentLimit)}
            onClick={async () => { const result = await run('limits', () => api.updateUniversity(id, { coordinatorLimit: Number(coordinatorLimit), studentLimit: Number(studentLimit), assessmentStudentLimit: Number(assessmentStudentLimit), prepMockStudentLimit: Number(prepMockStudentLimit) }), 'Limits saved.'); if (result) refreshCounts(); }}>Save limits</Button>
          <Button variant="secondary" busy={busy === 'reset-assessment-quota'} disabled={!counts || !counts.assessmentStudentUsed}
            onClick={async () => { if (!window.confirm('Reset assessment student places used to zero? Existing assessment assignments and reports will stay in place.')) return; const result = await run('reset-assessment-quota', () => api.resetUniversityAssessmentQuota(id), 'Assessment student quota reset.'); if (result) refreshCounts(); }}>Reset assessment quota</Button>
        </div>
      </Card>

      <Card id="wallet-title" data-guide="unid-wallet" title="University wallet" icon={Coins} className="lg:col-span-2" description="The university admin passes these Prep Coins to coordinators, who pass them to students.">
        <div className="flex flex-wrap items-end gap-6">
          <div><p className={helper}>Balance</p><p className="text-3xl font-bold tabular-nums text-slate-950 dark:text-white">{Number(university.coinBalance || 0).toLocaleString()}</p></div>
          <Field label="Add Prep Coins" className="w-48"><input className={inputClass} type="number" min="1" step="1" value={topUp} onChange={(event) => { topUpRequest.current = null; setTopUp(event.target.value); }} placeholder="e.g. 500" /></Field>
          <Button busy={busy === 'topup'} disabled={!/^[1-9]\d*$/.test(topUp)} onClick={() => run('topup', async () => {
            topUpRequest.current ||= crypto.randomUUID();
            await api.topUpUniversityCoins(id, { amount: Number(topUp), requestId: topUpRequest.current });
            topUpRequest.current = null;
            setTopUp('');
          }, `${Number(topUp).toLocaleString()} Prep Coins added.`)}>Add coins</Button>
        </div>
      </Card>
    </div>
  );
}
