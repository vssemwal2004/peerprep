import { useEffect, useState } from 'react';
import { Blocks, CalendarRange, Copy } from 'lucide-react';
import { api } from '../../../utils/api';
import { MODULES } from '../universityModel';
import { Button, Card, Field, Switch, helper, inputClass } from '../ui';
import { buildProgressionPayload, normalizeProgression } from '../../platform/progressionMath';

/** Which parts of PeerPrep this university's students and staff can use. */
export default function ModulesTab({ university, run, busy }) {
  const id = university.universityId;
  const [prepMockStartDate, setPrepMockStartDate] = useState(university.prepMockStartDate || '');
  const [prepMockEndDate, setPrepMockEndDate] = useState(university.prepMockEndDate || '');
  useEffect(() => {
    setPrepMockStartDate(university.prepMockStartDate || '');
    setPrepMockEndDate(university.prepMockEndDate || '');
  }, [id, university.prepMockStartDate, university.prepMockEndDate]);
  const prepMockGranted = university.permissions?.prepmock === true;
  const accessStatus = university.prepMockAccessStatus;
  const datesValid = Boolean(prepMockStartDate && prepMockEndDate && prepMockEndDate >= prepMockStartDate);
  const datesChanged = prepMockStartDate !== (university.prepMockStartDate || '')
    || prepMockEndDate !== (university.prepMockEndDate || '');
  const copyAsDefaults = () => run('defaults', () => api.updateUniversityDefaults({
    permissions: { ...university.permissions, prepmock: false }, sources: university.sources,
    ...(university.progression ? { progression: buildProgressionPayload(normalizeProgression(university.progression)) } : {}),
  }), 'New universities will now start with these modules.');
  return (
    <div className="space-y-5">
      <Card id="modules-title" title="Modules" icon={Blocks} description="Turning a module off hides it for everyone at this university straight away; its data is kept."
        actions={<Button variant="secondary" icon={Copy} busy={busy === 'defaults'} onClick={copyAsDefaults}>Use as new-university defaults</Button>}>
        <ul className="grid gap-3 md:grid-cols-2">
          {MODULES.filter((module) => module.key !== 'prepmock').map((module) => {
            const on = university.permissions?.[module.key] === true;
            return (
              <li key={module.key} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">{module.label}</span><span className={helper}>{module.description}</span></span>
                <Switch checked={on} label={`${module.label} for ${university.name}`} disabled={Boolean(busy)}
                  onChange={(next) => run(`module-${module.key}`, () => api.updateUniversity(id, { permissions: { [module.key]: next } }), `${module.label} turned ${next ? 'on' : 'off'}.`)} />
              </li>
            );
          })}
        </ul>
      </Card>
      <Card id="prepmock-access-title" title="PrepMock access" icon={CalendarRange}
        description="All published mocks become available automatically to this university’s uploaded PrepMock students during this date range. The end date is inclusive.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Starts" required><input className={inputClass} type="date" value={prepMockStartDate} onChange={(event) => setPrepMockStartDate(event.target.value)} /></Field>
          <Field label="Ends (inclusive)" required><input className={inputClass} type="date" value={prepMockEndDate} onChange={(event) => setPrepMockEndDate(event.target.value)} /></Field>
        </div>
        {prepMockStartDate && prepMockEndDate && prepMockEndDate < prepMockStartDate
          && <p role="alert" className="mt-2 text-xs font-medium text-rose-600">The end date must be on or after the start date.</p>}
        <p className={`mt-3 ${helper}`}>{prepMockGranted
          ? !university.prepMockStartDate || !university.prepMockEndDate ? 'Dates are required before students can use PrepMock.'
            : `${accessStatus === 'active' ? 'Active' : accessStatus === 'upcoming' ? 'Upcoming' : accessStatus === 'expired' ? 'Expired' : 'Unavailable'}: ${university.prepMockStartDate} through ${university.prepMockEndDate}.`
          : 'Access is off. Uploaded students and their results are kept.'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button busy={busy === 'prepmock-access'} disabled={Boolean(busy) || !datesValid || (prepMockGranted && !datesChanged)}
            onClick={() => run('prepmock-access', () => api.updateUniversity(id, { prepMockStartDate, prepMockEndDate,
              permissions: { prepmock: true } }), 'PrepMock access dates saved.')}>
            {prepMockGranted ? 'Save access dates' : 'Enable PrepMock access'}
          </Button>
          {prepMockGranted && <Button variant="secondary" busy={busy === 'prepmock-disable'} disabled={Boolean(busy)}
            onClick={() => run('prepmock-disable', () => api.updateUniversity(id, { permissions: { prepmock: false } }), 'PrepMock access turned off.')}>
            Disable access
          </Button>}
        </div>
      </Card>
      <Card id="sources-title" title="Learning content" description="Where this university's semesters and topics come from.">
        <Field label="Learning content source" className="max-w-sm" hint="Shared uses PeerPrep's central curriculum; University uses the curriculum its own coordinators build.">
          <select className={inputClass} value={university.sources?.learning || 'university'} disabled={Boolean(busy)}
            onChange={(event) => run('source', () => api.updateUniversity(id, { sources: { learning: event.target.value } }), 'Learning content source saved.')}>
            <option value="university">University's own curriculum</option>
            <option value="shared">Shared PeerPrep curriculum</option>
          </select>
        </Field>
      </Card>
    </div>
  );
}
