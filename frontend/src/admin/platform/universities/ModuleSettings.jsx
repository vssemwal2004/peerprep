import { useId } from 'react';
import { permissionOn } from '../progressionMath';
import { Switch } from './primitives';
import { LEARNING_SOURCES, visibleModules } from './universityModel';
import { selectClass } from './styles';

/**
 * Module switches and the learning data source, shared by the defaults tab and a university's
 * "Modules & access" tab. Each change is saved immediately by the caller; `busy` names the
 * control currently saving (a module key or 'source:learning') so only that one shows progress.
 */
export default function ModuleSettings({ scope, defaults, permissions, sources, onToggle, onSource, busy = '', disabled = false }) {
  const sourceId = useId();
  const learningSource = sources?.learning || 'university';
  const sourceHint = LEARNING_SOURCES.find((option) => option.value === learningSource)?.hint;
  return <div className="space-y-5">
    <fieldset>
      <legend className="sr-only">Modules enabled for {scope}</legend>
      <ul className="grid gap-3 md:grid-cols-2">
        {visibleModules(defaults).map((module) => {
          const on = permissionOn(permissions, module.key);
          return <li key={module.key} className={`rounded-xl border p-3.5 transition ${on ? 'border-sky-200 bg-sky-50/40 dark:border-sky-500/25 dark:bg-sky-500/5' : 'border-slate-200 bg-white dark:border-zinc-800 dark:bg-zinc-900/40'}`}>
            <Switch label={module.label} description={module.description} checked={on} busy={busy === module.key} disabled={disabled || Boolean(busy)}
              onChange={(value) => onToggle(module.key, value)} />
          </li>;
        })}
      </ul>
    </fieldset>
    <div className="max-w-md">
      <label htmlFor={sourceId} className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-zinc-200">Learning data source</label>
      <select id={sourceId} className={selectClass} value={learningSource} disabled={disabled || Boolean(busy)} aria-busy={busy === 'source:learning' || undefined} aria-describedby={`${sourceId}-hint`}
        onChange={(event) => onSource('learning', event.target.value)}>
        {LEARNING_SOURCES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <p id={`${sourceId}-hint`} className="mt-1 text-[12px] text-slate-500 dark:text-zinc-400">{busy === 'source:learning' ? 'Saving…' : sourceHint}</p>
    </div>
  </div>;
}
