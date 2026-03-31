import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, FileCode2, LayoutDashboard, PlusSquare, TerminalSquare } from 'lucide-react';
import CompilerSidebar from './CompilerSidebar';
import CompilerOverview from './CompilerOverview';
import CreateProblem from './CreateProblem';
import ProblemManagement from './ProblemManagement';
import CompilerAnalytics from './CompilerAnalytics';
import AdminTestCompiler from './AdminTestCompiler';

export default function AdminCompilerDashboard() {
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(false);

  const sections = useMemo(() => ([
    { key: 'overview', label: 'Overview', caption: 'Health and recent activity', to: '/admin/compiler', Icon: LayoutDashboard },
    { key: 'create', label: 'Create Problem', caption: 'Author and publish', to: '/admin/compiler/create', Icon: PlusSquare },
    { key: 'management', label: 'Problem Management', caption: 'Edit, test, and publish', to: '/admin/compiler/problems', Icon: FileCode2 },
    { key: 'preview', label: 'Preview', caption: 'Student-like validation', to: '/admin/compiler/problems', Icon: TerminalSquare },
    { key: 'analytics', label: 'Analytics', caption: 'Attempts and performance', to: '/admin/compiler/analytics', Icon: BarChart3 },
  ]), []);

  const pathname = location.pathname;
  const activeSection = pathname.startsWith('/admin/compiler/create')
    ? 'create'
    : pathname.startsWith('/admin/compiler/analytics')
      ? 'analytics'
      : pathname.includes('/preview')
        ? 'preview'
        : pathname.includes('/edit') || pathname.startsWith('/admin/compiler/problems')
          ? 'management'
          : 'overview';

  const sectionMeta = sections.find((section) => section.key === activeSection);

  const renderContent = () => {
    if (pathname.startsWith('/admin/compiler/create') || pathname.includes('/edit')) return <CreateProblem />;
    if (pathname.includes('/preview')) return <AdminTestCompiler />;
    if (pathname.startsWith('/admin/compiler/problems')) return <ProblemManagement />;
    if (pathname.startsWith('/admin/compiler/analytics')) return <CompilerAnalytics />;
    return <CompilerOverview />;
  };

  return (
    <div className="min-h-screen bg-white pt-16 dark:bg-gray-900">
      <CompilerSidebar items={sections} activeSection={activeSection} isExpanded={isExpanded} onExpand={() => setIsExpanded(true)} onCollapse={() => setIsExpanded(false)} />

      <div className={`transition-all duration-300 ${isExpanded ? 'md:pl-[272px]' : 'md:pl-[80px]'}`}>
        <div className="px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-gray-500">Admin Compiler Module</p>
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
          <div>{renderContent()}</div>
        </div>
      </div>
    </div>
  );
}
