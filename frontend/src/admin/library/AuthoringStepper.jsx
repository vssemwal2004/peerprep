import { Check } from 'lucide-react';

export default function AuthoringStepper({ steps, activeKey, completed = {}, onChange }) {
  const activeIndex = Math.max(0, steps.findIndex((step) => step.key === activeKey));
  const inset = 100 / (steps.length * 2);
  const progress = steps.length > 1 ? (activeIndex / (steps.length - 1)) * 100 : 100;

  return (
    <nav aria-label="Question creation progress" className="relative px-1 py-2">
      <div
        className="absolute top-7 h-0.5 bg-slate-200 dark:bg-gray-700"
        style={{ left: `${inset}%`, right: `${inset}%` }}
      >
        <div className="h-full bg-sky-500 transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map(({ key, label, shortLabel, Icon }, index) => {
          const active = key === activeKey;
          const done = Boolean(completed[key]) || index < activeIndex;
          const reached = active || done;
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'step' : undefined}
              onClick={() => onChange?.(key)}
              className="group flex min-w-0 flex-col items-center gap-2 px-1 text-center"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white transition-colors dark:bg-gray-900 ${
                active
                  ? 'border-sky-500 text-sky-600 shadow-[0_0_0_4px_rgba(14,165,233,0.12)] dark:text-sky-300'
                  : done
                    ? 'border-sky-500 bg-sky-500 text-white dark:bg-sky-500'
                    : 'border-slate-200 text-slate-400 group-hover:border-sky-300 group-hover:text-sky-600 dark:border-gray-700 dark:text-gray-500'
              }`}>
                {done && !active ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
              </span>
              <span className={`min-w-0 text-[11px] font-semibold sm:text-xs ${reached ? 'text-sky-700 dark:text-sky-300' : 'text-slate-500 dark:text-gray-400'}`}>
                <span className="hidden sm:inline">{label}</span>
                <span className="sm:hidden">{shortLabel || label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
