import { Blocks, Copy } from 'lucide-react';
import { api } from '../../../utils/api';
import { MODULES } from '../universityModel';
import { Button, Card, Field, Switch, helper, inputClass } from '../ui';
import { buildProgressionPayload, normalizeProgression } from '../../platform/progressionMath';

/** Which parts of PeerPrep this university's students and staff can use. */
export default function ModulesTab({ university, run, busy }) {
  const id = university.universityId;
  const copyAsDefaults = () => run('defaults', () => api.updateUniversityDefaults({
    permissions: university.permissions, sources: university.sources,
    ...(university.progression ? { progression: buildProgressionPayload(normalizeProgression(university.progression)) } : {}),
  }), 'New universities will now start with these modules.');
  return (
    <div className="space-y-5">
      <Card id="modules-title" title="Modules" icon={Blocks} description="Turning a module off hides it for everyone at this university straight away; its data is kept."
        actions={<Button variant="secondary" icon={Copy} busy={busy === 'defaults'} onClick={copyAsDefaults}>Use as new-university defaults</Button>}>
        <ul className="grid gap-3 md:grid-cols-2">
          {MODULES.map((module) => {
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
