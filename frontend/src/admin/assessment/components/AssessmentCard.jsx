export default function AssessmentCard({ label, value, helper, Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-gray-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-gray-100">{value}</p>
          {helper && <p className="mt-1 text-xs text-slate-400 dark:text-gray-500">{helper}</p>}
        </div>
        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
