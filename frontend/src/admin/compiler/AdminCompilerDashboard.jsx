import { lazy, Suspense, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, FileCode2, LayoutDashboard, PlusSquare, TerminalSquare } from 'lucide-react';

const CompilerOverview = lazy(() => import('./CompilerOverview'));
const CreateProblem = lazy(() => import('./CreateProblem'));
const ProblemManagement = lazy(() => import('./ProblemManagement'));
const CompilerAnalytics = lazy(() => import('./CompilerAnalytics'));
const AdminTestCompiler = lazy(() => import('./AdminTestCompiler'));

const LoadingBlock = () => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-gray-700 dark:bg-gray-900">
    Loading module...
  </div>
);
export default function AdminCompilerDashboard() {
  const location = useLocation();
  const pathname = location.pathname;
  const isPreviewRoute = pathname.includes('/preview');

  const rolePrefix = pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';

  const sections = useMemo(() => ([
    { key: 'overview', label: 'Overview', caption: 'Health and recent activity', to: `${rolePrefix}/compiler`, Icon: LayoutDashboard },
    { key: 'create', label: 'Create Problem', caption: 'Author and publish', to: `${rolePrefix}/compiler/create`, Icon: PlusSquare },
    { key: 'management', label: 'Problem Management', caption: 'Edit, test, and publish', to: `${rolePrefix}/compiler/problems`, Icon: FileCode2 },
    { key: 'preview', label: 'Preview', caption: 'Student-like validation', to: `${rolePrefix}/compiler/problems`, Icon: TerminalSquare },
    { key: 'analytics', label: 'Analytics', caption: 'Attempts and performance', to: `${rolePrefix}/compiler/analytics`, Icon: BarChart3 },
  ]), [rolePrefix]);

  const activeSection = pathname.includes('/compiler/create')
    ? 'create'
    : pathname.includes('/compiler/analytics')
      ? 'analytics'
      : pathname.includes('/preview')
        ? 'preview'
        : pathname.includes('/edit') || pathname.includes('/compiler/problems')
          ? 'management'
          : 'overview';

  const sectionMeta = sections.find((section) => section.key === activeSection);

  const showHeaderCard = !pathname.includes('/compiler/problems') && !pathname.includes('/preview');

  const renderContent = () => {
    if (pathname.includes('/compiler/create') || pathname.includes('/edit')) return <CreateProblem />;
    if (pathname.includes('/preview')) return <AdminTestCompiler />;
    if (pathname.includes('/compiler/problems')) return <ProblemManagement />;
    if (pathname.includes('/compiler/analytics')) return <CompilerAnalytics />;
    return <CompilerOverview />;
  };

  return (
    <div className="min-h-screen bg-white pt-20 dark:bg-gray-900">
      <div>
        <div className={isPreviewRoute ? 'p-0' : 'px-4 py-5 sm:px-6 lg:px-8'}>
          {showHeaderCard ? (
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-gray-500">{rolePrefix === '/coordinator' ? 'Coordinator' : 'Admin'} Compiler Module</p>
                  <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-gray-100">{sectionMeta?.label}</h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-gray-400">{sectionMeta?.caption}</p>
                </div>
                <div className="flex flex-wrap gap-2 md:hidden">
                  {sections.map((section) => (
                    <Link key={section.key} to={section.to} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${activeSection === section.key ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'}`}>{section.label}</Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="pt-1" />
          )}
          <Suspense fallback={<LoadingBlock />}><div>{renderContent()}</div></Suspense>
        </div>
      </div>
    </div>
  );
}





