export default function AssessmentModuleLayout({ title, children }) {
  return (
    <div className="h-screen overflow-hidden bg-slate-50 font-sans text-slate-950 transition-colors dark:bg-gray-950 dark:text-white">
      <div className="mx-auto flex h-full min-h-0 max-w-[1680px] flex-col">
        <div data-page-header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
            <h1 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h1>
        </div>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">{children}</main>
      </div>
    </div>
  );
}
