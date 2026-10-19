import { SlidersHorizontal } from 'lucide-react';
import { api } from '../../utils/api';
import ProgressionEditor from '../platform/ProgressionEditor';
import { useAction, useUniversities } from './useUniversities';
import { MODULES } from './universityModel';
import { Card, Field, LoadingBlock, Notice, PageHeader, pageShell, Switch, helper, inputClass } from './ui';

/** The starting setup for every university added from now on; existing universities are unchanged. */
export default function UniversityDefaults() {
  const { defaults, loading, error, reload } = useUniversities();
  const { busy, message, run } = useAction(reload);
  if (loading) return <LoadingBlock label="Loading defaults…" />;
  return (
    <div className={`${pageShell} max-w-5xl`}>
      <PageHeader title="New-university defaults" description="Every new university starts with these settings. Changing them never changes a university that already exists; adjust those on each university's page." />
      {(error || message) && <Notice tone={error ? 'danger' : message.tone}>{error || message.text}</Notice>}
      {defaults && (
        <>
          <Card id="default-modules-title" title="Modules" icon={SlidersHorizontal}>
            <ul className="grid gap-3 md:grid-cols-2">
              {MODULES.map((module) => {
                const on = defaults.permissions?.[module.key] === true;
                return (
                  <li key={module.key} className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                    <span><span className="block text-sm font-semibold text-slate-900 dark:text-white">{module.label}</span><span className={helper}>{module.description}</span></span>
                    <Switch checked={on} label={`${module.label} for new universities`} disabled={Boolean(busy)}
                      onChange={(next) => run(module.key, () => api.updateUniversityDefaults({ permissions: { [module.key]: next } }), `New universities will start with ${module.label} ${next ? 'on' : 'off'}.`)} />
                  </li>
                );
              })}
            </ul>
          </Card>
          <Card id="default-source-title" title="Learning content">
            <Field label="Learning content source" className="max-w-sm">
              <select className={inputClass} value={defaults.sources?.learning || 'university'} disabled={Boolean(busy)}
                onChange={(event) => run('source', () => api.updateUniversityDefaults({ sources: { learning: event.target.value } }), 'Default learning content source saved.')}>
                <option value="university">University's own curriculum</option>
                <option value="shared">Shared PeerPrep curriculum</option>
              </select>
            </Field>
          </Card>
          {defaults.progression && (
            <Card id="default-progression-title" title="Level progression" description="How quickly students move up levels at a new university.">
              <ProgressionEditor defaultOpen scopeLabel="new universities" stored={defaults.progression} permissions={defaults.permissions} disabled={Boolean(busy)}
                onSave={(body) => api.updateUniversityDefaults(body)} onSaved={reload} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
