import { BookOpen, ClipboardCheck, Code2, MessagesSquare } from 'lucide-react';
import { LEVELS } from './engine';
import { card, helperText, inputClass, LevelSelect, NumberField, sectionTitle, Toggle } from './fields';

const ICONS = { coding: Code2, assessment: ClipboardCheck, interview: MessagesSquare, learning: BookOpen };
const ACTIVITIES = {
  problemSolved: { label: 'Problem solved', detail: 'Each distinct problem accepted in practice. Content level: the problem\'s difficulty.' },
  assessmentCompleted: { label: 'Test passed', detail: 'A marked test at or above the pass mark. Content level: from its questions\' difficulty, weighted by marks.' },
  mockCompleted: { label: 'Mock interview passed', detail: 'Feedback at or above the pass mark. Mock interviews have no difficulty of their own.' },
  aiCompleted: { label: 'AI interview completed', detail: 'A verified completion. Content level: the interview\'s difficulty.' },
  videoCompleted: { label: 'Topic completed', detail: 'Topic video watched to the completion percentage. Content level: the topic\'s difficulty level.' },
};
const TOPIC_LEVELS = [['easy', 'Easy'], ['easy-medium', 'Easy–Medium'], ['medium', 'Medium'], ['medium-hard', 'Medium–Hard'], ['hard', 'Hard']];
const POINT_SYMBOLS = { Easy: 'e', Medium: 'm', Hard: 'h' };

function ActivityRow({ activityKey, activity, onChange }) {
  const meta = ACTIVITIES[activityKey];
  const fixedOnly = activityKey === 'mockCompleted';
  return (
    <div className={`rounded-xl border p-4 ${activity.enabled ? 'border-slate-200 dark:border-slate-700' : 'border-dashed border-slate-300 opacity-70 dark:border-slate-700'}`}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-semibold text-slate-900 dark:text-white">{meta.label}</p><p className={`mt-0.5 ${helperText}`}>{meta.detail}</p></div>
        <Toggle checked={activity.enabled} onChange={(value) => onChange('enabled', value)} label={`Count ${meta.label}`} />
      </div>
      {activity.enabled && (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <NumberField compact label="Counts as" value={activity.units} min={0} max={100} step={0.5} suffix="×" onChange={(value) => onChange('units', value)} />
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Level from
            <select className={`${inputClass} mt-1 py-1.5`} value={activity.levelSource} disabled={fixedOnly} onChange={(event) => onChange('levelSource', event.target.value)}>
              <option value="content">Content's own level</option>
              <option value="fixed">One fixed level</option>
            </select>
          </label>
          <LevelSelect label={activity.levelSource === 'fixed' ? 'Fixed level' : 'If content has none'} value={activity.level} onChange={(value) => onChange('level', value)} />
        </div>
      )}
    </div>
  );
}

/** Weight, points and activity rules for one module. */
export default function ModuleCard({ moduleKey, label, symbol, module, update }) {
  const Icon = ICONS[moduleKey];
  const set = (path, value) => update(['modules', moduleKey, ...path], value);
  return (
    <section className={card} aria-labelledby={`module-${moduleKey}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"><Icon className="h-4 w-4" aria-hidden="true" /></span>
          <div><h2 id={`module-${moduleKey}`} className={sectionTitle}>{label}</h2><p className={helperText}>Module score <var className="font-mono not-italic">{symbol}</var></p></div>
        </div>
        <div className="w-28"><NumberField compact label="Weight" symbol="W" value={module.weight} min={0} max={100} step={0.5} onChange={(value) => set(['weight'], value)} /></div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {LEVELS.map((level) => <NumberField key={level} compact label={level} symbol={POINT_SYMBOLS[level]} value={module.points[level]} min={0.01} max={1000} step={0.5} suffix="pts" onChange={(value) => set(['points', level], value)} />)}
      </div>

      {(module.passPercent !== undefined || module.completionPercent !== undefined) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {module.passPercent !== undefined && <NumberField compact label="Pass mark" symbol="p" value={module.passPercent} min={0} max={100} suffix="%" onChange={(value) => set(['passPercent'], value)} helper={moduleKey === 'interview' ? 'Mock interviews below this earn nothing' : 'Tests below this earn nothing'} />}
          {module.completionPercent !== undefined && <NumberField compact label="Video completion" symbol="v" value={module.completionPercent} min={1} max={100} suffix="%" onChange={(value) => set(['completionPercent'], value)} helper="Share of a topic video watched before it counts" />}
        </div>
      )}

      {module.topicLevels && (
        <div className="mt-3">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Topic difficulty → level</p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {TOPIC_LEVELS.map(([key, name]) => (
              <label key={key} className={`block ${helperText}`}>{name}
                <select className={`${inputClass} mt-1 py-1.5`} value={module.topicLevels[key]} onChange={(event) => set(['topicLevels', key], event.target.value)}>
                  {LEVELS.map((level) => <option key={level}>{level}</option>)}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {Object.entries(module.activities).map(([activityKey, activity]) => (
          <ActivityRow key={activityKey} activityKey={activityKey} activity={activity} onChange={(field, value) => set(['activities', activityKey, field], value)} />
        ))}
      </div>
    </section>
  );
}
