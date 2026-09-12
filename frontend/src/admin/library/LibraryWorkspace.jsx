import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlignLeft,
  BarChart3,
  BookOpenCheck,
  Braces,
  ChevronRight,
  CircleDot,
  Code2,
  FileCode2,
  HelpCircle,
  LayoutDashboard,
  Library,
  ListChecks,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import QuestionLibrary from '../QuestionLibrary';
import { useAuth } from '../../context/AuthContext';
import { hasPermission } from '../coordinatorPermissions';
import { api } from '../../utils/api';

const AddQuestionToLibrary = lazy(() => import('../AddQuestionToLibrary'));
const CompilerOverview = lazy(() => import('../compiler/CompilerOverview'));
const CreateProblem = lazy(() => import('../compiler/CreateProblem'));
const ProblemManagement = lazy(() => import('../compiler/ProblemManagement'));
const CompilerAnalytics = lazy(() => import('../compiler/CompilerAnalytics'));
const AdminTestCompiler = lazy(() => import('../compiler/AdminTestCompiler'));

const LoadingPanel = () => (
  <div className="flex min-h-[360px] items-center justify-center text-sm text-slate-500 dark:text-gray-400">
    Loading library workspace...
  </div>
);

const questionTypes = [
  { type: 'all', label: 'All questions', description: 'Every reusable question', Icon: Library },
  { type: 'coding', label: 'Coding', description: 'Judge-ready problems', Icon: Code2 },
  { type: 'mcq', label: 'Multiple choice', description: 'Single or multiple answer', Icon: ListChecks },
  { type: 'short', label: 'Short answer', description: 'Written responses', Icon: AlignLeft },
  { type: 'one_line', label: 'One word', description: 'Concise responses', Icon: CircleDot },
];

function LibraryBackdrop() {
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-gray-800">
        <div>
          <div className="h-6 w-48 rounded bg-slate-100 dark:bg-gray-800" />
          <div className="mt-2 h-3 w-72 rounded bg-slate-100 dark:bg-gray-800" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-sky-100 dark:bg-sky-900/30" />
      </div>
      <div className="h-11 rounded-xl border border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-900" />
      {[0, 1, 2, 3, 4].map((item) => (
        <div key={item} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <div className="h-4 w-2/5 rounded bg-slate-100 dark:bg-gray-800" />
          <div className="mt-3 h-3 w-4/5 rounded bg-slate-100 dark:bg-gray-800" />
        </div>
      ))}
    </div>
  );
}

function CreateTypeDrawer({ onClose, onSelect, canCreateGeneral, canCreateCoding }) {
  const options = [
    { type: 'mcq', label: 'Multiple choice', description: 'Create a single or multiple-answer question.', Icon: ListChecks },
    { type: 'short', label: 'Short answer', description: 'Create a descriptive written-answer question.', Icon: AlignLeft },
    { type: 'one_line', label: 'One word', description: 'Create an exact single-token answer question.', Icon: CircleDot },
    { type: 'coding', label: 'Coding problem', description: 'Add test cases, languages, templates and judge validation.', Icon: Braces },
  ];

  return (
    <>
      <button type="button" aria-label="Close question type drawer" className="fixed inset-0 z-[70] bg-slate-950/35 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-[71] flex h-dvh w-full max-w-[430px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-gray-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">Question library</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">Choose question type</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Select the format you want to create.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {canCreateGeneral && <>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">General</div>
            <div className="space-y-3">
              {options.slice(0, 3).map(({ type, label, description, Icon }) => (
              <button key={type} type="button" onClick={() => onSelect(type)} className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-sky-300 hover:bg-sky-50/50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-sky-700 dark:hover:bg-sky-900/10">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 group-hover:bg-sky-100 group-hover:text-sky-700 dark:bg-gray-800 dark:text-gray-300 dark:group-hover:bg-sky-900/40 dark:group-hover:text-sky-300"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-gray-400">{description}</span></span>
                <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-sky-600" />
              </button>
              ))}
            </div>
          </>}

          {canCreateCoding && <>
            <div className={`${canCreateGeneral ? 'mt-7' : ''} mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400`}>Coding</div>
            {options.slice(3).map(({ type, label, description, Icon }) => (
            <button key={type} type="button" onClick={() => onSelect(type)} className="group flex w-full items-center gap-4 rounded-2xl border border-sky-200 bg-sky-50/60 p-4 text-left transition hover:border-sky-400 hover:bg-sky-50 dark:border-sky-900/60 dark:bg-sky-900/10 dark:hover:border-sky-700">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 dark:text-white">{label}</span><span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-gray-400">{description}</span></span>
              <ChevronRight className="h-4 w-4 text-sky-400 transition group-hover:translate-x-0.5 group-hover:text-sky-700" />
            </button>
            ))}
          </>}

          <div className="mt-6 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            Every published question is saved here and can be reused across assessments.
          </div>
        </div>
      </aside>
    </>
  );
}

export default function LibraryWorkspace({ view = 'questions' }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { id: routeItemId = '' } = useParams();
  const codingProblemId = routeItemId;
  const [searchParams] = useSearchParams();
  const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
  const [questionCounts, setQuestionCounts] = useState({ all: 0, coding: 0, mcq: 0, short: 0, one_line: 0 });
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const libraryRoot = `${rolePrefix}/library`;
  const selectedType = searchParams.get('type') || 'all';
  const mode = searchParams.get('mode') || 'library';
  const canViewQuestions = hasPermission(user, 'coordinator.library.view');
  const canCreateGeneral = hasPermission(user, 'coordinator.library.create');
  const canViewCoding = hasPermission(user, 'coordinator.compiler.view');
  const canCreateCoding = hasPermission(user, 'coordinator.compiler.create');
  const canManageCoding = hasPermission(user, 'coordinator.compiler.manage');
  const canViewCodingAnalytics = hasPermission(user, 'coordinator.compiler.analytics');

  const updateQuestionCounts = useCallback((entries = []) => {
    const next = { all: 0, coding: 0, mcq: 0, short: 0, one_line: 0 };
    let explicitAllCount = null;
    let calculatedAllCount = 0;
    entries.forEach((entry) => {
      if (!entry?.type) return;
      const count = Number(entry.count) || 0;
      if (entry.type === 'all') explicitAllCount = count;
      else {
        if (Object.hasOwn(next, entry.type)) next[entry.type] = count;
        calculatedAllCount += count;
      }
    });
    next.all = explicitAllCount ?? calculatedAllCount;
    setQuestionCounts(next);
  }, []);

  useEffect(() => {
    if (!canViewQuestions || view === 'questions') return undefined;
    let active = true;
    api.listLibraryQuestions({ page: 1, limit: 1, skipCache: true })
      .then((data) => {
        if (active) updateQuestionCounts(data.filters?.categories || []);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [canViewQuestions, updateQuestionCounts, view]);

  const assessmentContext = useMemo(() => {
    if (mode !== 'assessment') return undefined;
    return {
      tempId: searchParams.get('tempId'),
      assessmentKey: searchParams.get('assessment'),
      sectionIndex: searchParams.get('section') ? parseInt(searchParams.get('section'), 10) : 0,
      questionIndex: searchParams.get('question') ? parseInt(searchParams.get('question'), 10) : 0,
      returnTo: searchParams.get('return'),
    };
  }, [mode, searchParams]);

  const codingItems = [
    canViewCoding && { id: 'coding-overview', label: 'Coding overview', Icon: LayoutDashboard, to: `${libraryRoot}/coding/overview` },
    canManageCoding && { id: 'coding-problems', label: 'Problem management', Icon: FileCode2, to: `${libraryRoot}/coding/problems` },
    canViewCodingAnalytics && { id: 'coding-analytics', label: 'Coding analytics', Icon: BarChart3, to: `${libraryRoot}/coding/analytics` },
  ].filter(Boolean);

  const editorQuery = searchParams.toString();
  const editorRoute = `${libraryRoot}/coding/create${editorQuery ? `?${editorQuery}` : ''}`;
  const requestedReturnTo = typeof location.state?.returnTo === 'string' && location.state.returnTo.startsWith(rolePrefix)
    ? location.state.returnTo
    : '';
  const closeTarget = mode === 'assessment' && assessmentContext?.returnTo
    ? assessmentContext.returnTo
    : (requestedReturnTo || libraryRoot);

  const handleCreateType = (type) => {
    setTypeDrawerOpen(false);
    if (type === 'coding') {
      navigate(`${libraryRoot}/coding/create`);
      return;
    }
    navigate(`${libraryRoot}/create?type=${type}`);
  };

  const isDrawerView = ['create-question', 'edit-question', 'create-coding', 'edit-coding', 'preview-coding'].includes(view);

  useEffect(() => {
    if (!typeDrawerOpen && !isDrawerView) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isDrawerView, typeDrawerOpen]);

  const title = view === 'coding-overview'
    ? 'Coding overview'
    : view === 'coding-problems'
      ? 'Problem management'
      : view === 'coding-analytics'
        ? 'Coding analytics'
        : 'Question library';
  const selectedQuestionLabel = questionTypes.find((item) => item.type === selectedType)?.label || 'Question';
  const drawerTitle = view === 'create-question'
    ? `Create ${selectedQuestionLabel.toLowerCase()} question`
    : view === 'edit-question'
      ? `Edit ${selectedQuestionLabel.toLowerCase()} question`
    : view === 'edit-coding'
      ? 'Edit coding problem'
      : view === 'preview-coding'
        ? 'Validate coding problem'
        : 'Create coding problem';

  const renderMainContent = () => {
    if (view === 'coding-overview') return <CompilerOverview />;
    if (view === 'coding-problems') return <ProblemManagement />;
    if (view === 'coding-analytics') return <CompilerAnalytics />;
    return <QuestionLibrary embedded onCategoryCountsChange={updateQuestionCounts} />;
  };

  const renderDrawerContent = () => {
    if (view === 'create-question') return <AddQuestionToLibrary embedded />;
    if (view === 'edit-question') return <AddQuestionToLibrary embedded editQuestionId={routeItemId} />;
    if (view === 'preview-coding') {
      return <AdminTestCompiler
        backTo={mode === 'assessment' ? editorRoute : (requestedReturnTo || `${libraryRoot}/coding/problems`)}
        editTo={mode === 'assessment' ? editorRoute : `${libraryRoot}/coding/${codingProblemId}/edit`}
        backLabel={mode === 'assessment' ? 'Back to editor' : 'Back to library'}
      />;
    }
    return <CreateProblem mode={mode} assessmentContext={assessmentContext} />;
  };

  return (
    <div className="min-h-screen bg-white pt-[var(--app-navbar-height,5rem)] font-['Manrope'] dark:bg-gray-900">
      <div className="grid min-h-[calc(100vh-var(--app-navbar-height,5rem))] md:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-slate-50/60 md:block dark:border-gray-800 dark:bg-gray-950/30">
          <div className="sticky top-[var(--app-navbar-height,5rem)] flex h-[calc(100vh-var(--app-navbar-height,5rem))] flex-col overflow-y-auto px-3 py-5">
            <div className="px-3 pb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white"><Library className="h-5 w-5" /></div>
              <h2 className="mt-3 text-sm font-bold text-slate-950 dark:text-white">Question Library</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-gray-400">Create, organize and reuse assessment content.</p>
            </div>

            {canViewQuestions && <div className="border-t border-slate-200 pt-3 dark:border-gray-800">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Question bank</p>
              <nav className="space-y-1">
                {questionTypes.map(({ type, label, Icon }) => {
                  const active = view === 'questions' && selectedType === type;
                  const to = type === 'all' ? libraryRoot : `${libraryRoot}?type=${type}`;
                  return (
                    <Link key={type} to={to} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${active ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}>
                      <Icon className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className={`shrink-0 text-[11px] tabular-nums ${active ? 'text-sky-600 dark:text-sky-300' : 'text-slate-400 dark:text-gray-500'}`}>({questionCounts[type].toLocaleString()})</span>
                    </Link>
                  );
                })}
              </nav>
            </div>}

            {codingItems.length > 0 && <div className="mt-5 border-t border-slate-200 pt-3 dark:border-gray-800">
              <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Coding workspace</p>
              <nav className="space-y-1">
                {codingItems.map(({ id, label, Icon, to }) => (
                  <Link key={id} to={to} className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${view === id ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'text-slate-600 hover:bg-white hover:text-slate-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'}`}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
            </div>}

            <div className="mt-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white"><HelpCircle className="h-4 w-4 text-sky-600" /> Library tip</div>
              <p className="mt-1.5 text-[11px] leading-4 text-slate-500 dark:text-gray-400">Use tags and difficulty filters to find reusable questions faster.</p>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-slate-50 px-4 py-3 md:hidden dark:border-gray-800 dark:bg-gray-950/40" aria-label="Library sections">
            {canViewQuestions && questionTypes.map(({ type, label, Icon }) => {
              const active = view === 'questions' && selectedType === type;
              const to = type === 'all' ? libraryRoot : `${libraryRoot}?type=${type}`;
              return (
                <Link key={type} to={to} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'bg-white text-slate-600 dark:bg-gray-900 dark:text-gray-300'}`}>
                  <Icon className="h-4 w-4" /><span>{label}</span><span className="text-[11px] tabular-nums text-slate-400">({questionCounts[type].toLocaleString()})</span>
                </Link>
              );
            })}
            {codingItems.map(({ id, label, Icon, to }) => (
              <Link key={id} to={to} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${view === id ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' : 'bg-white text-slate-600 dark:bg-gray-900 dark:text-gray-300'}`}>
                <Icon className="h-4 w-4" />{label}
              </Link>
            ))}
          </nav>
          <header className="sticky top-[var(--app-navbar-height,5rem)] z-20 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8 dark:border-gray-800 dark:bg-gray-900/95">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-400"><BookOpenCheck className="h-3.5 w-3.5" /> Library <ChevronRight className="h-3 w-3" /> <span className="text-slate-600 dark:text-gray-300">{title}</span></div>
                <h1 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{title}</h1>
              </div>
              {(canCreateGeneral || canCreateCoding) && <button type="button" onClick={() => setTypeDrawerOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500">
                <Plus className="h-4 w-4" /> Create question
              </button>}
            </div>
          </header>

          <div className="px-4 py-5 sm:px-6 lg:px-8">
            <Suspense fallback={<LoadingPanel />}>
              {isDrawerView ? <LibraryBackdrop /> : renderMainContent()}
            </Suspense>
          </div>
        </main>
      </div>

      {typeDrawerOpen && <CreateTypeDrawer onClose={() => setTypeDrawerOpen(false)} onSelect={handleCreateType} canCreateGeneral={canCreateGeneral} canCreateCoding={canCreateCoding} />}

      {isDrawerView && (
        <>
          <button type="button" aria-label="Close question editor" className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-[1px]" onClick={() => navigate(closeTarget)} />
          <section className="fixed inset-y-0 right-0 z-[91] flex h-dvh w-full flex-col overflow-hidden border-l border-slate-200 bg-slate-50 shadow-2xl lg:w-[86vw] xl:max-w-[1480px] dark:border-gray-700 dark:bg-gray-950">
            <div className="z-30 flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3 dark:border-gray-800 dark:bg-gray-900">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">Question library</p>
                <h2 className="mt-0.5 text-base font-bold text-slate-950 dark:text-white">{drawerTitle}</h2>
              </div>
              <button type="button" onClick={() => navigate(closeTarget)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
              <Suspense fallback={<LoadingPanel />}>{renderDrawerContent()}</Suspense>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
