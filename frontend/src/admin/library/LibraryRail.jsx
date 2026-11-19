import { Link } from 'react-router-dom';
import { FilePenLine, HelpCircle, Library } from 'lucide-react';
import { RAIL_PANEL_WIDTH, RAIL_WIDTH, useHoverRail } from '../../components/useHoverRail';

const ROW = 'group relative flex h-10 items-center rounded-xl text-[13px] transition-colors duration-200';
const TILE = 'absolute left-[3px] flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-200';

/** One rail row: the icon tile never moves; label and count slide in with the panel. */
function RailLink({ to, label, Icon, count, active, tone = 'sky', open, reveal }) {
  const activeTone = tone === 'amber'
    ? { row: 'text-amber-800 dark:text-amber-300', bg: 'bg-amber-100/80 dark:bg-amber-900/30', tile: 'bg-amber-500 text-white', count: 'text-amber-700 dark:text-amber-300' }
    : { row: 'text-sky-700 dark:text-sky-300', bg: 'bg-sky-100/80 dark:bg-sky-900/30', tile: 'bg-sky-600 text-white', count: 'text-sky-700 dark:text-sky-300' };
  return (
    <Link
      to={to}
      aria-label={count === undefined ? label : `${label} (${count.toLocaleString()})`}
      aria-current={active ? 'page' : undefined}
      title={open ? undefined : count === undefined ? label : `${label} · ${count.toLocaleString()}`}
      className={`${ROW} ${active
        ? `font-semibold ${activeTone.row} ${open ? `${activeTone.bg} shadow-sm` : ''}`
        : `font-medium text-slate-600 hover:text-slate-900 dark:text-gray-300 dark:hover:text-white ${open ? 'hover:bg-white dark:hover:bg-slate-800' : ''}`}`}
    >
      <span className={`${TILE} ${active ? `${activeTone.tile} shadow-sm` : 'bg-white/70 text-slate-500 group-hover:text-sky-700 dark:bg-slate-800 dark:text-gray-400'}`}>
        <Icon className="h-4 w-4" strokeWidth={1.9} />
      </span>
      <span className={`ml-11 min-w-0 flex-1 truncate whitespace-nowrap ${reveal}`}>{label}</span>
      {count !== undefined && (
        <span className={`mr-2.5 text-xs tabular-nums ${active ? activeTone.count : 'text-slate-400 dark:text-gray-500'} ${reveal}`}>{count.toLocaleString()}</span>
      )}
    </Link>
  );
}

/**
 * Prep Library side panel: an icon rail that slides open over the page on hover (0.8 s, like the
 * global sidebar) and slides closed when the pointer leaves. Shown from the md breakpoint; phones
 * use the chip row above the list instead.
 */
export default function LibraryRail({
  title, subtitle, canViewQuestions, questionTypes, isTypeActive, typeUrl, typeCounts,
  showDrafts, draftsActive, draftsUrl, draftCount, codingItems, codingTitle, activeView,
}) {
  const { open, railProps, reveal } = useHoverRail('(min-width: 768px)');

  return (
    <aside className="relative hidden md:block" style={{ width: RAIL_WIDTH }} aria-label="Library sections">
      {/* A sticky element is its own stacking context, so the layer must be set here: above the
          page's sticky table headers (z-40/50), below its drawers and modals (z-60 and up). */}
      <div className="sticky top-[var(--app-navbar-height,5rem)] z-[55] h-[calc(100vh-var(--app-navbar-height,5rem))]">
        <div
          {...railProps}
          style={{ width: open ? RAIL_PANEL_WIDTH : RAIL_WIDTH }}
          className={`absolute inset-y-0 left-0 z-50 overflow-hidden border-r border-sky-100 bg-[#f3f8fd] transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-sky-950 dark:bg-slate-950 ${
            open ? 'shadow-[10px_0_32px_rgba(14,165,233,0.12)] dark:shadow-black/40' : 'shadow-[4px_0_20px_rgba(14,165,233,0.06)]'
          }`}
        >
          <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden px-2.5 py-4 [scrollbar-width:thin]" style={{ width: RAIL_PANEL_WIDTH }}>
            <div className="relative min-h-[3.25rem] pb-3">
              <span className={`${TILE} top-0 bg-sky-600 text-white shadow-sm`}><Library className="h-4 w-4" strokeWidth={1.9} /></span>
              <div className={`ml-11 min-w-0 ${reveal}`}>
                <h2 className="truncate text-[13px] font-bold leading-8 text-slate-950 dark:text-white">{title}</h2>
                <p className="-mt-1 text-[11px] leading-4 text-slate-500 dark:text-gray-400">{subtitle}</p>
              </div>
            </div>

            {canViewQuestions && (
              <section className="border-t border-sky-100 pt-3 dark:border-sky-950">
                <p className={`mb-2 h-4 whitespace-nowrap px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 ${reveal}`}>Question bank</p>
                <nav className="space-y-1">
                  {questionTypes.map(({ type, label, Icon }) => (
                    <RailLink key={type} to={typeUrl(type)} label={label} Icon={Icon} count={typeCounts[type]} active={isTypeActive(type)} open={open} reveal={reveal} />
                  ))}
                  {showDrafts && (
                    <RailLink to={draftsUrl} label="Drafts" Icon={FilePenLine} count={draftCount} active={draftsActive} tone="amber" open={open} reveal={reveal} />
                  )}
                </nav>
              </section>
            )}

            {codingItems.length > 0 && (
              <section className="mt-4 border-t border-sky-100 pt-3 dark:border-sky-950">
                <p className={`mb-2 h-4 whitespace-nowrap px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 ${reveal}`}>{codingTitle}</p>
                <nav className="space-y-1">
                  {codingItems.map(({ id, label, Icon, to }) => (
                    <RailLink key={id} to={to} label={label} Icon={Icon} active={activeView === id} open={open} reveal={reveal} />
                  ))}
                </nav>
              </section>
            )}

            <div className={`relative mt-auto rounded-xl border p-2 transition-colors duration-300 ${open ? 'border-sky-100 bg-white dark:border-sky-950 dark:bg-slate-900' : 'border-transparent'}`}>
              <span className={`${TILE} left-[1px] top-1.5 bg-white/70 text-sky-600 dark:bg-slate-800`} title={open ? undefined : 'Library tip: use tags and difficulty filters to find reusable questions faster.'}>
                <HelpCircle className="h-4 w-4" strokeWidth={1.9} />
              </span>
              <div className={`ml-9 min-h-8 ${reveal}`}>
                <p className="text-xs font-bold leading-8 text-slate-800 dark:text-white">Library tip</p>
                <p className="text-[11px] leading-4 text-slate-500 dark:text-gray-400">Use tags and difficulty filters to find reusable questions faster.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
