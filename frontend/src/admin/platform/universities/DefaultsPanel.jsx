import { Info } from 'lucide-react';
import { api } from '../../../utils/api';
import ProgressionEditor from '../ProgressionEditor';
import ModuleSettings from './ModuleSettings';
import { SectionCard } from './primitives';
import { MODULES, supportsProgression } from './universityModel';

const label = (key) => MODULES.find((module) => module.key === key)?.label || key;

/** Template applied when a university is created. Changing it never changes existing universities. */
export default function DefaultsPanel({ defaults, run, busyIn, refresh }) {
  if (!defaults) return null;
  const busy = busyIn('defaults:');
  return <div className="space-y-4">
    <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>These settings are copied into each <strong>new</strong> university when it is created. Existing universities keep their own settings; change them from each university's <em>Modules &amp; access</em> tab, or use <em>Use as new default</em> to copy one university's settings here.</p>
    </div>
    <SectionCard title="Modules for new universities" description="Turn a module off to hide it, and block its API routes, for universities created from now on.">
      <ModuleSettings scope="new universities" defaults={defaults} permissions={defaults.permissions} sources={defaults.sources} busy={busy}
        onToggle={(key, value) => run(`defaults:${key}`, () => api.updateUniversityDefaults({ permissions: { [key]: value } }), `${label(key)} ${value ? 'enabled' : 'disabled'} for new universities.`)}
        onSource={(source, value) => run(`defaults:source:${source}`, () => api.updateUniversityDefaults({ sources: { [source]: value } }), 'Learning data source updated for new universities.')} />
    </SectionCard>
    {supportsProgression(defaults) && <SectionCard title="Progression" description="Levels, XP and awards used by new universities.">
      <ProgressionEditor scopeLabel="the platform defaults" stored={defaults.progression} permissions={defaults.permissions} disabled={Boolean(busy)} defaultOpen
        onSave={(body) => api.updateUniversityDefaults(body)} onSaved={refresh} />
    </SectionCard>}
  </div>;
}
