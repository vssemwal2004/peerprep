import React, { useId, useMemo } from "react";
import { Calendar, Clock } from "lucide-react";

function toLocalDateTimeValue(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return "";
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hours = String(parsed.getHours()).padStart(2, "0");
    const minutes = String(parsed.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  return "";
}

function ceilToNextMinute(date) {
  const next = new Date(date.getTime());
  next.setSeconds(0, 0);
  if (date.getSeconds() !== 0 || date.getMilliseconds() !== 0) {
    next.setMinutes(next.getMinutes() + 1);
  }
  return next;
}

function toInputMinValue(value) {
  if (value) return toLocalDateTimeValue(value);
  return toLocalDateTimeValue(ceilToNextMinute(new Date()).toISOString());
}

export default function DateTimePicker({
  value,
  onChange,
  min,
  max,
  placeholder = "Select date and time",
  className = "",
  disabled = false,
  enableTime = true,
}) {
  const inputId = useId();
  const normalizedValue = useMemo(() => toLocalDateTimeValue(value), [value]);
  const normalizedMin = useMemo(() => toInputMinValue(min), [min]);
  const normalizedMax = useMemo(() => toLocalDateTimeValue(max), [max]);

  const handleChange = (event) => {
    const nextValue = event.target.value || "";
    onChange(nextValue);
  };

  return (
    <div className={`relative ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 dark:text-gray-500">
        {enableTime ? <Clock className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
      </div>
      <input
        id={inputId}
        type={enableTime ? "datetime-local" : "date"}
        value={normalizedValue}
        onChange={handleChange}
        min={normalizedMin}
        max={normalizedMax || undefined}
        disabled={disabled}
        step={enableTime ? 60 : undefined}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-700 shadow-sm outline-none transition-colors focus:border-sky-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:disabled:bg-gray-800 dark:disabled:text-gray-500"
      />
    </div>
  );
}
