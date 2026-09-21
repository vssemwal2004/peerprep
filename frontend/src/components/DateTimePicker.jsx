import { Calendar, Clock } from 'lucide-react';

function toLocalMinute(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toLocalDate(value) {
  return toLocalMinute(value).slice(0, 10);
}

export default function DateTimePicker({
  value,
  onChange,
  min,
  max,
  placeholder = 'Select date and time',
  className = '',
  disabled = false,
  enableTime = true,
  allowPast = false,
}) {
  const normalizeValue = enableTime ? toLocalMinute : toLocalDate;
  const nowMinimum = allowPast ? '' : normalizeValue(new Date());
  const suppliedMinimum = normalizeValue(min);
  const effectiveMinimum = [nowMinimum, suppliedMinimum].filter(Boolean).sort().at(-1) || undefined;
  const effectiveMaximum = normalizeValue(max) || undefined;
  const normalizedValue = normalizeValue(value);

  const handleChange = (event) => {
    const nextValue = event.target.value;
    if (effectiveMinimum && nextValue && nextValue < effectiveMinimum) return;
    if (effectiveMaximum && nextValue && nextValue > effectiveMaximum) return;
    onChange(nextValue);
  };

  const Icon = enableTime ? Clock : Calendar;

  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type={enableTime ? 'datetime-local' : 'date'}
        value={normalizedValue}
        min={effectiveMinimum}
        max={effectiveMaximum}
        onChange={handleChange}
        disabled={disabled}
        aria-label={placeholder}
        title={placeholder}
        className={`h-11 w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:focus:ring-sky-900/30 dark:disabled:bg-gray-800 ${className}`}
      />
      {!normalizedValue && (
        <span className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 bg-white pr-2 text-sm text-slate-400 dark:bg-gray-900 dark:text-gray-500">
          {placeholder}
        </span>
      )}
    </div>
  );
}
