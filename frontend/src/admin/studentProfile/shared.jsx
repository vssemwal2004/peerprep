import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Search } from 'lucide-react';
import { Pill } from '../../student/profile/ui';
import { STATUS_TONE_CLASSES, difficultyTone, focusRing, statusMeta } from '../../student/profile/format';

export function StatusPill({ status, createdAt }) {
  const meta = statusMeta(status, createdAt);
  return <Pill className={STATUS_TONE_CLASSES[meta.tone] || STATUS_TONE_CLASSES.neutral}>{meta.label}</Pill>;
}

export function DifficultyPill({ difficulty }) {
  if (!difficulty) return null;
  return <Pill className={difficultyTone(difficulty)}>{difficulty}</Pill>;
}

/** Dash for a value that does not exist yet (never shown as 0). */
export function Muted() {
  return (
    <span className="text-slate-300 dark:text-zinc-600">
      <span aria-hidden="true">—</span>
      <span className="sr-only">Not available</span>
    </span>
  );
}

/** Small uppercase label used to split a card into sub-sections. */
export function SubHeading({ children, aside }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{children}</h3>
      {aside}
    </div>
  );
}

const ICON_TONES = {
  sky: 'text-sky-500 dark:text-sky-400',
  emerald: 'text-emerald-500 dark:text-emerald-400',
  amber: 'text-amber-500 dark:text-amber-400',
  rose: 'text-rose-500 dark:text-rose-400',
  violet: 'text-violet-500 dark:text-violet-400',
  indigo: 'text-indigo-500 dark:text-indigo-400',
  orange: 'text-orange-500 dark:text-orange-400',
};

function StatBody({ icon, label, value, helper, tone }) {
  return (
    <>
      <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-zinc-400">
        {icon ? <span className={`shrink-0 ${ICON_TONES[tone] || ICON_TONES.sky}`} aria-hidden="true">{icon}</span> : null}
        <span className="truncate" title={typeof label === 'string' ? label : undefined}>{label}</span>
      </p>
      <div className="mt-1 truncate text-[17px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900 dark:text-zinc-50">{value}</div>
      {helper ? (
        <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-zinc-500" title={typeof helper === 'string' ? helper : undefined}>{helper}</div>
      ) : null}
    </>
  );
}

/** Bordered metric tile; used for metric grids inside tab cards. */
export function MetricTile({ icon, label, value, helper, tone = 'sky' }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200/70 bg-white px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/30">
      <StatBody icon={icon} label={label} value={value} helper={helper} tone={tone} />
    </div>
  );
}

/**
 * One bordered strip of stats separated by hairlines (gap-px over a tinted background), so it
 * reads as a single structured row instead of a pile of separate boxes. Pick `cols` so the item
 * count fills every row (an empty cell would show the hairline tint).
 */
export function StatStrip({ items, cols = 'grid-cols-2 sm:grid-cols-4', label }) {
  return (
    <ul aria-label={label} className={`grid gap-px overflow-hidden rounded-lg border border-slate-200/80 bg-slate-200/70 dark:border-zinc-800 dark:bg-zinc-800 ${cols}`}>
      {items.map((item) => (
        <li key={item.label} className="min-w-0 bg-white px-3.5 py-3 dark:bg-[#242424]">
          <StatBody icon={item.icon} label={item.label} value={item.value} helper={item.helper} tone={item.tone} />
        </li>
      ))}
    </ul>
  );
}

/** Legend row: a colored swatch beside text-colored labels (identity is never color alone). */
export function ChartLegend({ items }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600 dark:text-zinc-300">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartTooltipBox({ title, rows }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-slate-500 dark:text-zinc-400">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-1.5 tabular-nums text-slate-900 dark:text-zinc-50">
          {row.color ? <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: row.color }} aria-hidden="true" /> : null}
          <span className="text-slate-500 dark:text-zinc-400">{row.label}</span>
          <span className="font-semibold">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

function DailyTooltip({ active, payload, unit }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <ChartTooltipBox title={point.full} rows={[{ label: unit, value: point.count }]} />;
}

/** Single-series daily bar chart (no legend needed; the heading names the series). */
export function DailyBarChart({ data, unit = 'Activities', label, height = 'h-36' }) {
  return (
    <div className={`${height} w-full`} role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -28 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-100 dark:text-zinc-800" />
          <XAxis dataKey="tick" interval={6} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} width={36} />
          <Tooltip content={<DailyTooltip unit={unit} />} cursor={{ fill: 'rgba(14,165,233,0.08)' }} />
          <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={14} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SearchInput({ value, onChange, label, placeholder = 'Search problems' }) {
  return (
    <label className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-zinc-500" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={`h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2.5 text-xs text-slate-800 placeholder:text-slate-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 sm:w-48 ${focusRing}`}
      />
    </label>
  );
}

export function SegmentedFilter({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${value === option
            ? 'bg-white text-sky-700 shadow-sm dark:bg-zinc-800 dark:text-sky-300'
            : 'text-slate-500 hover:text-slate-800 dark:text-zinc-400 dark:hover:text-zinc-100'} ${focusRing}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/**
 * Compact table with a sticky header. Long lists scroll inside a bounded, keyboard-focusable
 * region. Columns marked `hideOnMobile` only appear from `xl` (the content column beside the
 * profile sidebar is too narrow for their fixed widths before that); below `xl` their content is
 * repeated under the title via `mobileMeta`, so the table never scrolls sideways.
 */
export function DataTable({ caption, columns, rows, rowKey, mobileMeta, maxHeight = 'max-h-[420px]' }) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={caption}
      className={`overflow-y-auto overflow-x-hidden rounded-lg border border-slate-100 [scrollbar-width:thin] dark:border-zinc-800 ${maxHeight} ${focusRing}`}
    >
      <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-400 ${column.hideOnMobile ? 'hidden xl:table-cell' : ''} ${column.align === 'right' ? 'text-right' : ''} ${column.width || ''}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="transition-colors hover:bg-sky-50/50 dark:hover:bg-sky-500/5">
              {columns.map((column, columnIndex) => (
                <td
                  key={column.key}
                  className={`border-b border-slate-100 px-3 py-2 align-middle text-slate-700 dark:border-zinc-800/80 dark:text-zinc-300 ${column.hideOnMobile ? 'hidden xl:table-cell' : ''} ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {column.render(row, index)}
                  {columnIndex === 0 && mobileMeta ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 xl:hidden">{mobileMeta(row)}</div>
                  ) : null}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TitleCell({ title, sub }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-slate-900 dark:text-zinc-100" title={title}>{title}</p>
      {sub ? <p className="truncate text-[11px] text-slate-500 dark:text-zinc-400">{sub}</p> : null}
    </div>
  );
}

export function ShowMoreButton({ expanded, total, visible, onToggle, noun = 'items' }) {
  if (total <= visible && !expanded) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`mt-2 w-full rounded-lg border border-dashed border-slate-200 py-1.5 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-50 dark:border-zinc-700 dark:text-sky-300 dark:hover:bg-sky-500/10 ${focusRing}`}
    >
      {expanded ? 'Show fewer' : `Show all ${total} ${noun}`}
    </button>
  );
}

/** Generic list row used for feeds (recent solved, submissions, feedback, courses, videos). */
export function ListRow({ title, meta, aside, children }) {
  return (
    <li className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 transition-colors hover:border-sky-200 hover:bg-sky-50/40 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-sky-500/30 dark:hover:bg-sky-500/5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-slate-900 dark:text-zinc-100" title={typeof title === 'string' ? title : undefined}>{title}</p>
          {meta ? <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-zinc-400">{meta}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 flex-wrap items-center gap-1.5">{aside}</div> : null}
      </div>
      {children}
    </li>
  );
}
