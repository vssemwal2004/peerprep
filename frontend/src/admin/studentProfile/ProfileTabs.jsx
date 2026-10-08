import { useRef } from 'react';
import { panelId, tabId } from './utils';

// Inset ring: the tab strip scrolls sideways (overflow clips both axes), so an outer ring + offset
// would be cut off.
const TAB_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500/70';

/**
 * Accessible tab bar (WAI-ARIA tabs pattern: roving tabindex, arrow/Home/End keys).
 * It is sticky at the top of the content column so the sections stay one click away; on narrow
 * screens it scrolls sideways inside itself with the scrollbar hidden.
 */
export default function ProfileTabs({ tabs, active, onChange, barRef }) {
  const buttonRefs = useRef({});

  const focusTab = (index) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    onChange(tab.id);
    buttonRefs.current[tab.id]?.focus();
  };

  const onKeyDown = (event, index) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); focusTab(index + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); focusTab(index - 1); }
    if (event.key === 'Home') { event.preventDefault(); focusTab(0); }
    if (event.key === 'End') { event.preventDefault(); focusTab(tabs.length - 1); }
  };

  // Sticks to the top of the scroll area with a solid backdrop so cards scroll cleanly beneath it.
  return (
    <div ref={barRef} className="sticky top-0 z-20 -mx-1 bg-white/95 px-1 backdrop-blur dark:bg-[#1a1a1a]/95">
      <div className="border-b border-slate-200 dark:border-zinc-800">
        <div
          role="tablist"
          aria-label="Student profile sections"
          className="flex gap-1 overflow-x-auto px-0.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((tab, index) => {
            const selected = tab.id === active;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                ref={(node) => { buttonRefs.current[tab.id] = node; }}
                id={tabId(tab.id)}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? panelId(tab.id) : undefined}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab.id)}
                onKeyDown={(event) => onKeyDown(event, index)}
                className={`relative inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${selected
                  ? 'border-sky-600 text-sky-700 dark:border-sky-400 dark:text-sky-300'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100'} ${TAB_FOCUS}`}
              >
                {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                {tab.label}
                {tab.count !== undefined && tab.count !== null ? (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-semibold tabular-nums ${selected
                      ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                      : 'bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400'}`}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
