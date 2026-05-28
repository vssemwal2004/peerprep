// AI Proctoring placeholder - implementation will be added in later steps.
export const DEFAULT_AI_PROCTORING_SETTINGS = {
  enabled: false,
  detectMobile: true,
  detectMultiplePersons: true,
  detectNoFace: true,
  detectFaceOutOfFrame: true,
  detectLookingAway: true,
  detectionIntervalMs: 1500,
  ignoreLimit: 5,
  violationCooldownSec: 20,
  criticalAutoFlag: true,
};

export function normalizeAiProctoringSettings(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_AI_PROCTORING_SETTINGS,
    ...source,
  };
}

function Toggle({ value, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${value ? 'bg-sky-600' : 'bg-slate-300 dark:bg-gray-600'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function NumberInput({ value, onChange, min, max, placeholder, unit, disabled = false }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))}
        placeholder={placeholder}
        className="w-24 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:disabled:bg-gray-800/60 dark:disabled:text-gray-500"
      />
      {unit && <span className="text-xs text-slate-400">{unit}</span>}
    </div>
  );
}

function FieldRow({ label, children, disabled = false }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={`text-xs ${disabled ? 'text-slate-400 dark:text-gray-500' : 'text-slate-600 dark:text-gray-300'}`}>
        {label}
      </span>
      {children}
    </div>
  );
}

export default function AIProctoringSettings({ value, onChange, disabled = false }) {
  const settings = normalizeAiProctoringSettings(value);
  const update = (key, nextValue) => {
    onChange?.({
      ...settings,
      [key]: nextValue,
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-[11px] leading-5 text-slate-600 dark:border-sky-900/30 dark:bg-sky-900/10 dark:text-gray-300">
        AI Proctoring runs inside the student browser during assessment. It does not upload live video. Only confirmed violations are sent to the server.
      </div>

      <FieldRow label="Detect mobile phone" disabled={disabled}>
        <Toggle value={Boolean(settings.detectMobile)} onChange={(next) => update('detectMobile', next)} disabled={disabled} />
      </FieldRow>
      <FieldRow label="Detect multiple persons" disabled={disabled}>
        <Toggle value={Boolean(settings.detectMultiplePersons)} onChange={(next) => update('detectMultiplePersons', next)} disabled={disabled} />
      </FieldRow>
      <FieldRow label="Detect no face" disabled={disabled}>
        <Toggle value={Boolean(settings.detectNoFace)} onChange={(next) => update('detectNoFace', next)} disabled={disabled} />
      </FieldRow>
      <FieldRow label="Detect face out of frame" disabled={disabled}>
        <Toggle value={Boolean(settings.detectFaceOutOfFrame)} onChange={(next) => update('detectFaceOutOfFrame', next)} disabled={disabled} />
      </FieldRow>
      <FieldRow label="Detect looking away" disabled={disabled}>
        <Toggle value={Boolean(settings.detectLookingAway)} onChange={(next) => update('detectLookingAway', next)} disabled={disabled} />
      </FieldRow>
      <FieldRow label="Detection interval" disabled={disabled}>
        <NumberInput
          value={settings.detectionIntervalMs}
          onChange={(next) => update('detectionIntervalMs', next)}
          min={1000}
          max={5000}
          placeholder="1500"
          unit="ms"
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="Ignore limit" disabled={disabled}>
        <NumberInput
          value={settings.ignoreLimit}
          onChange={(next) => update('ignoreLimit', next)}
          min={0}
          max={50}
          placeholder="5"
          unit="violations"
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="Violation cooldown" disabled={disabled}>
        <NumberInput
          value={settings.violationCooldownSec}
          onChange={(next) => update('violationCooldownSec', next)}
          min={5}
          max={120}
          placeholder="20"
          unit="sec"
          disabled={disabled}
        />
      </FieldRow>
      <FieldRow label="Mark serious AI violations as high risk" disabled={disabled}>
        <Toggle value={Boolean(settings.criticalAutoFlag)} onChange={(next) => update('criticalAutoFlag', next)} disabled={disabled} />
      </FieldRow>
    </div>
  );
}
