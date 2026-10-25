import { useId, useState } from 'react';
import { Calendar, Clock } from 'lucide-react';

const LOCAL_MINUTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toLocalMinute(value) {
  if (!value) return '';
  // Wall-clock strings pass through unchanged, so no timezone (or DST gap) can shift them.
  if (typeof value === 'string' && LOCAL_MINUTE.test(value)) return value;
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
  if (typeof value === 'string' && LOCAL_DATE.test(value)) return value;
  return toLocalMinute(value).slice(0, 10);
}

function describe(value, enableTime) {
  const date = new Date(enableTime ? value : `${value}T00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, enableTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

/** The first problem with a picker value, or ''. */
function dateTimeRangeError(value, { minimum, maximum, nowMinimum, enableTime = true } = {}) {
  if (!value) return '';
  if (nowMinimum && value < nowMinimum && (!minimum || minimum <= nowMinimum)) return enableTime ? 'Choose a time in the future.' : 'Choose today or a later date.';
  if (minimum && value < minimum) return `Choose ${enableTime ? 'a time' : 'a date'} on or after ${describe(minimum, enableTime)}.`;
  if (maximum && value > maximum) return `Choose ${enableTime ? 'a time' : 'a date'} on or before ${describe(maximum, enableTime)}.`;
  return '';
}

/**
 * Native date(-time) input. Every edit reaches onChange, including out-of-range values, and the
 * range problem is shown inline instead of the input silently snapping back; callers keep
 * validating before they save. onChange still receives the raw 'YYYY-MM-DDTHH:mm' (or
 * 'YYYY-MM-DD') string in the browser's local time.
 */
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
  onValidityChange,
}) {
  const messageId = useId();
  const normalizeValue = enableTime ? toLocalMinute : toLocalDate;
  // "Now" is fixed when the picker mounts, so a value that was valid does not turn invalid as time passes.
  const [mountedAt] = useState(() => new Date());
  const [touched, setTouched] = useState(false);
  const nowMinimum = allowPast ? '' : normalizeValue(mountedAt);
  const suppliedMinimum = normalizeValue(min);
  const effectiveMinimum = [nowMinimum, suppliedMinimum].filter(Boolean).sort().at(-1) || undefined;
  const effectiveMaximum = normalizeValue(max) || undefined;
  const normalizedValue = normalizeValue(value);
  // A saved value loaded from the server is not flagged until the user edits it.
  const error = touched && !disabled
    ? dateTimeRangeError(normalizedValue, { minimum: suppliedMinimum, maximum: effectiveMaximum, nowMinimum, enableTime })
    : '';

  const handleChange = (event) => {
    const nextValue = event.target.value;
    setTouched(true);
    onValidityChange?.(!dateTimeRangeError(nextValue, { minimum: suppliedMinimum, maximum: effectiveMaximum, nowMinimum, enableTime }));
    onChange(nextValue);
  };

  const Icon = enableTime ? Clock : Calendar;

  return (
    <div>
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
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? messageId : undefined}
          title={placeholder}
          className={`h-11 w-full rounded-lg border bg-white py-2 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:bg-gray-900 dark:text-gray-100 dark:disabled:bg-gray-800 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100 dark:border-rose-700 dark:focus:ring-rose-900/30' : 'border-slate-200 focus:border-sky-400 focus:ring-sky-100 dark:border-gray-700 dark:focus:ring-sky-900/30'} ${className}`}
        />
        {!normalizedValue && (
          <span className="pointer-events-none absolute left-10 top-1/2 -translate-y-1/2 bg-white pr-2 text-sm text-slate-400 dark:bg-gray-900 dark:text-gray-500">
            {placeholder}
          </span>
        )}
      </div>
      {error && (
        <p id={messageId} role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}
    </div>
  );
}
