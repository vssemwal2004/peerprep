import { useEffect, useRef } from "react";
import { settingsPanelId, settingsTabId } from "./tabs";

const BADGE_TONES = {
  on: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30",
  warn: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30",
};

/**
 * Sub-tabs of the ANVI settings step: one horizontal bar, like the Assessment "Settings" sub-tabs.
 * Each tab is an icon and a short label, a red dot when it holds an error and, where it matters,
 * a tiny badge. On narrow screens the bar scrolls sideways with snap.
 * tabs: { id, short, Icon }; status: { [id]: { error, badge, summary } }.
 */
export default function SettingsTabs({ tabs, active, status = {}, onSelect }) {
  const listRef = useRef(null);
  // Keep the selected tab in view when the bar scrolls.
  useEffect(() => {
    const list = listRef.current;
    const button = list?.querySelector(`[data-settings-tab="${active}"]`);
    if (!list || !button || list.scrollWidth <= list.clientWidth) return;
    const left = button.offsetLeft - list.offsetLeft;
    if (left < list.scrollLeft || left + button.offsetWidth > list.scrollLeft + list.clientWidth)
      list.scrollTo?.({ left: Math.max(0, left - 16), behavior: "smooth" });
  }, [active]);
  const move = (event, index) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    let next = null;
    if (event.key in keys) next = (index + keys[event.key] + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    onSelect(tabs[next].id);
    document.getElementById(settingsTabId(tabs[next].id))?.focus();
  };
  return (
    // Sticky under the page header while the panel scrolls; the page colour keeps cards from showing through.
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
      <div
        ref={listRef}
        role="tablist"
        aria-label="ANVI setting categories"
        data-settings-tabs
        className="-mb-px flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-6 lg:overflow-visible [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(({ id, short, Icon }, index) => {
          const selected = id === active;
          const { error, badge, summary } = status[id] || {};
          return (
            <button
              key={id}
              id={settingsTabId(id)}
              type="button"
              role="tab"
              data-settings-tab={id}
              aria-selected={selected}
              aria-controls={settingsPanelId(id)}
              tabIndex={selected ? 0 : -1}
              title={summary}
              onClick={() => onSelect(id)}
              onKeyDown={(event) => move(event, index)}
              className={`relative flex min-h-12 shrink-0 snap-start items-center gap-2 whitespace-nowrap border-b-2 px-4 text-sm transition-colors lg:justify-center lg:px-2 focus-visible:rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 ${selected ? "border-sky-600 font-semibold text-sky-700 dark:border-sky-400 dark:text-sky-300" : "border-transparent font-medium text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-100"}`}
            >
              <Icon size={16} aria-hidden="true" className="shrink-0" />
              {short}
              {badge && (
                <span
                  data-tab-status
                  className={`rounded-full px-1.5 py-px text-[10px] font-semibold leading-4 ring-1 ring-inset ${BADGE_TONES[badge.tone] || BADGE_TONES.on}`}
                >
                  {badge.text}
                </span>
              )}
              {error && (
                <>
                  <span data-tab-error aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                  <span className="sr-only">(needs a fix)</span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
