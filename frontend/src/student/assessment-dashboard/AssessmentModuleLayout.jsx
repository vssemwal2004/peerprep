export default function AssessmentModuleLayout({ title, children }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-950 transition-colors dark:bg-gray-950 dark:text-white">
      <div className="mx-auto min-h-[calc(100vh-4rem)] max-w-[1680px]">
        <div className="min-w-0">
          <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900 sm:px-5">
            <h1 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h1>
          </div>

          <main className="p-3 sm:p-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
