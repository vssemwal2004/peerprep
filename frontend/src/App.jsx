import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { lazy as reactLazy, Suspense, useEffect, useCallback, useLayoutEffect, useRef, useState } from "react";
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/CustomToast';
import AdminLayout from './admin/AdminLayout';
import AdminProtectedRoute from './admin/AdminProtectedRoute';
import CoordinatorProtectedRoute from './coordinator/CoordinatorProtectedRoute';
import StudentProtectedRoute from './student/StudentProtectedRoute';
import { LandingPageSkeleton, PageSkeleton, DashboardSkeleton } from './components/Skeletons';
import { useAuth } from './context/AuthContext';
import { hasPermission } from './admin/coordinatorPermissions';
import PopupDismissManager from './components/PopupDismissManager';
import GlobalSidebar from './components/GlobalSidebar';
import { getSidebarWidth } from './components/sidebarLayout';

// Lazy-load navbars to keep them out of the main bundle
const CoordinatorLayout = lazy(() => import('./coordinator/CoordinatorLayout'));
const Footer = lazy(() => import('./components/Footer').then(m => ({ default: m.Footer })));

// Lazy load all route components for code splitting
// Auth & Public Pages
const LandingPage = lazy(() => import("./pages/LandingPage"));
const StudentLogin = lazy(() => import("./auth/StudentLogin"));
const ResetPassword = lazy(() => import("./auth/ResetPassword"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions"));
const ContactUs = lazy(() => import("./pages/ContactUs"));

// Student Pages
const StudentDashboard = lazy(() => import("./student/StudentDashboard"));
const StudentInterview = lazy(() => import("./student/StudentInterview"));
const ChangePassword = lazy(() => import("./student/ChangePassword"));
const SessionAndFeedback = lazy(() => import("./student/SessionAndFeedback"));
const FeedbackForm = lazy(() => import("./student/FeedbackForm"));
const StudentLearning = lazy(() => import("./student/StudentLearning"));
const LearningDetail = lazy(() => import("./student/LearningDetail"));
const StudentProfile = lazy(() => import("./student/StudentProfile"));
const HelpAndSupport = lazy(() => import("./student/HelpAndSupport"));
const ProblemsPage = lazy(() => import("./student/ProblemsPage"));
const ProblemSolver = lazy(() => import("./student/ProblemSolver"));
const StudentAssessmentList = lazy(() => import("./student/StudentAssessmentList"));
const AssessmentReportsPage = lazy(() => import("./student/AssessmentReportsPage"));
const AssessmentHistoryPage = lazy(() => import("./student/AssessmentHistoryPage"));
const AssessmentAttempt = lazy(() => import("./student/AssessmentAttempt"));
const AssessmentFeedbackPage = lazy(() => import("./student/AssessmentFeedbackPage"));
const StudentAnalytics = lazy(() => import("./student/StudentAnalytics"));
const StudentResume = lazy(() => import("./student/StudentResume"));

// Admin Pages
const AdminOverview = lazy(() => import("./admin/AdminOverview"));
const AdminLearning = lazy(() => import("./admin/AdminLearning"));
const AdminLearningDetail = lazy(() => import("./admin/AdminLearningDetail"));
const StudentOnboarding = lazy(() => import("./admin/StudentOnboarding"));
const StudentDirectory = lazy(() => import("./admin/StudentDirectory"));
const StudentBulkLists = lazy(() => import("./admin/StudentBulkLists"));
const BulkUploads = lazy(() => import("./admin/BulkUploads"));
const AdminStudentProfile = lazy(() => import("./admin/AdminStudentProfile"));
const EventManagement = lazy(() => import("./admin/EventManagement"));
const EventDetail = lazy(() => import("./admin/EventDetail"));
const FeedbackReview = lazy(() => import("./admin/FeedbackReview"));
const AIInterviewsPlaceholder = lazy(() => import("./components/interviews/AIInterviewsPlaceholder"));
const AIInterviewWorkspace = lazy(() => import('./admin/ai-interviews/AIInterviewWorkspace'));
const CoordinatorOnboarding = lazy(() => import("./admin/CoordinatorOnboarding"));
const CoordinatorDirectory = lazy(() => import("./admin/CoordinatorDirectory"));
const AdminChangePassword = lazy(() => import("./admin/AdminChangePassword"));
const AdminActivity = lazy(() => import("./admin/AdminActivity"));
const LibraryWorkspace = lazy(() => import("./admin/library/LibraryWorkspace"));
const AdminCompanyInsights = lazy(() => import("./admin/AdminCompanyInsights"));
const AdminCompanyBenchmarkAdd = lazy(() => import("./admin/AdminCompanyBenchmarkAdd"));
const AssessmentDashboard = lazy(() => import("./admin/AssessmentDashboard"));
const CreateAssessment = lazy(() => import("./admin/CreateAssessment"));
const AssessmentReports = lazy(() => import("./admin/AssessmentReports"));
const AssessmentFeedback = lazy(() => import("./admin/AssessmentFeedback"));
const SelectProblemFromLibrary = lazy(() => import("./admin/assessment/SelectProblemFromLibrary"));
const AdminAssessmentPreview = lazy(() => import("./admin/assessment/AdminAssessmentPreview"));
const AdminEmailTemplates = lazy(() => import("./admin/EmailTemplates"));
const AdminEmailQueue = lazy(() => import("./admin/AdminEmailQueue"));
const StudentPromotion = lazy(() => import("./admin/StudentPromotion"));
const MasterData = lazy(() => import("./admin/MasterData"));
const AnnouncementCreate = lazy(() => import("./admin/AnnouncementCreate"));
const AnnouncementManage = lazy(() => import("./admin/AnnouncementManage"));
const CoordinatorOverview = lazy(() => import("./admin/CoordinatorOverview"));
const CoordinatorAccess = lazy(() => import("./admin/CoordinatorAccess"));
const CoordinatorAccessDetails = lazy(() => import("./admin/CoordinatorAccessDetails"));
const StudentResumeView = lazy(() => import("./admin/StudentResumeView"));

// Coordinator Pages
const CoordinatorStudents = lazy(() => import("./coordinator/CoordinatorStudents"));
const CoordinatorChangePassword = lazy(() => import("./coordinator/CoordinatorChangePassword"));
const CoordinatorEventDetail = lazy(() => import("./coordinator/CoordinatorEventDetail"));
const CoordinatorProfile = lazy(() => import("./coordinator/CoordinatorProfile"));
const SemesterManagement = lazy(() => import("./coordinator/SemesterManagement"));
const CoordinatorFeedback = lazy(() => import("./coordinator/CoordinatorFeedback"));
const CoordinatorActivity = lazy(() => import("./coordinator/CoordinatorActivity"));
const CoordinatorDatabase = lazy(() => import("./coordinator/CoordinatorDatabase"));
const CoordinatorDashboard = lazy(() => import("./coordinator/CoordinatorDashboard"));

const gradientBg = "bg-white";
const LAZY_IMPORT_RETRY_KEY = 'peerprep:lazy-import-retry';

// Recover automatically when a deployment or Vite dependency refresh leaves
// the current tab holding an obsolete dynamic-module URL. One guarded reload
// fetches the current module graph without creating a reload loop.
function lazy(loader) {
  return reactLazy(async () => {
    try {
      const module = await loader();
      window.sessionStorage.removeItem(LAZY_IMPORT_RETRY_KEY);
      return module;
    } catch (error) {
      const message = String(error?.message || error || '');
      const isStaleModule = /failed to fetch dynamically imported module|outdated optimize dep|importing a module script failed/i.test(message);
      const retrySignature = `${window.location.pathname}${window.location.search}`;
      if (isStaleModule && window.sessionStorage.getItem(LAZY_IMPORT_RETRY_KEY) !== retrySignature) {
        window.sessionStorage.setItem(LAZY_IMPORT_RETRY_KEY, retrySignature);
        window.location.reload();
        return new Promise(() => {});
      }
      throw error;
    }
  });
}

/**
 * RoutePrefetcher - Preloads chunks for the current user's role
 * 
 * When a user navigates to a role's pages, we prefetch the most likely
 * next pages they'll visit. This eliminates loading delays on subsequent
 * navigation within the same role.
 */
function RoutePrefetcher() {
  const location = useLocation();
  const { user } = useAuth();
  const prefetched = useRef({ studentFull: false, studentAssessment: false, admin: false, coordinator: false });

  const canPrefetch = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return true;
    if (connection.saveData) return false;
    const effectiveType = connection.effectiveType || '';
    return effectiveType !== 'slow-2g' && effectiveType !== '2g';
  };

  const prefetchStudentRoutes = useCallback(() => {
    import("./student/StudentAssessmentList");
    import("./student/AssessmentReportsPage");
    import("./student/AssessmentHistoryPage");
    if (user?.accessScope !== 'assessment_only') {
      import("./student/StudentDashboard");
      import("./student/StudentInterview");
      import("./student/ProblemsPage");
    }
  }, [user?.accessScope]);

  const prefetchAdminRoutes = useCallback(() => {
    import("./admin/AssessmentDashboard");
    import("./admin/library/LibraryWorkspace");
    import("./admin/StudentDirectory");
  }, []);

  const prefetchCoordinatorRoutes = useCallback(() => {
    import("./coordinator/CoordinatorStudents");
  }, []);

  useEffect(() => {
    // Prefetch based on current path - use requestIdleCallback so it doesn't
    // block the main render
    const prefetch = () => {
      if (!canPrefetch()) return;
      if (location.pathname.startsWith('/student/') || location.pathname.startsWith('/problems')) {
        if (!user || location.pathname === '/student/change-password') return;
        const prefetchKey = user.accessScope === 'assessment_only' ? 'studentAssessment' : 'studentFull';
        if (prefetched.current[prefetchKey]) return;
        prefetched.current[prefetchKey] = true;
        prefetchStudentRoutes();
      } else if (location.pathname.startsWith('/admin/')) {
        if (prefetched.current.admin) return;
        prefetched.current.admin = true;
        prefetchAdminRoutes();
      } else if (location.pathname.startsWith('/coordinator')) {
        if (prefetched.current.coordinator) return;
        prefetched.current.coordinator = true;
        prefetchCoordinatorRoutes();
      }
    };

    // Let the current page finish its data requests and first interactive
    // paint before downloading likely next-route chunks.
    let idleId;
    const delayId = window.setTimeout(() => {
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(prefetch, { timeout: 3000 });
      else prefetch();
    }, 1500);
    return () => {
      window.clearTimeout(delayId);
      if (idleId && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
    };
  }, [location.pathname, user, prefetchStudentRoutes, prefetchAdminRoutes, prefetchCoordinatorRoutes]);

  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelector("main")?.focus({ preventScroll: true });
  }, [pathname]);

  return null;
}

// Hide the HTML global-loader once React has mounted and rendered
function useHideGlobalLoader() {
  useEffect(() => {
    const loader = document.getElementById('global-loader');
    if (!loader) return;
    // rAF ensures the browser has painted at least one frame before we hide
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        loader.classList.add('fade-out');
        setTimeout(() => loader.remove(), 300);
      });
    });
  }, []);
}

function AdminShell({ children, layout = true }) {
  return (
    <AdminProtectedRoute>
      <Suspense fallback={<DashboardSkeleton />}>
        {layout ? <AdminLayout>{children}</AdminLayout> : children}
      </Suspense>
    </AdminProtectedRoute>
  );
}

function CoordinatorAccessDenied() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-950">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-400/20 dark:bg-gray-900">
          <h1 className="text-xl font-bold text-slate-950 dark:text-white">Access not assigned</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
            Your admin has not enabled this coordinator feature for your account yet.
          </p>
        </div>
      </div>
    </div>
  );
}

function CoordinatorShell({ children, layout = true, permission }) {
  const { user } = useAuth();
  const content = permission && !hasPermission(user, permission)
    ? <CoordinatorAccessDenied />
    : children;

  return (
    <CoordinatorProtectedRoute>
      <Suspense fallback={<DashboardSkeleton />}>
        {layout ? <CoordinatorLayout>{content}</CoordinatorLayout> : content}
      </Suspense>
    </CoordinatorProtectedRoute>
  );
}

function AppContent() {
  useHideGlobalLoader();
  const location = useLocation();
  const { user } = useAuth();
  const [isStudentSidebarExpanded, setIsStudentSidebarExpanded] = useState(false);
  const isAssessmentModuleAlias = /^\/(assessments|assessment-reports|assessment-history)(\/)?$/.test(location.pathname);
  const isProblemSolver = /^\/problems\/[^/]+$/.test(location.pathname);
  const isMain = location.pathname === "/";
  const isStudentLogin = location.pathname === "/student";
  const isResetPassword = location.pathname === "/reset-password";
  const isPublicPage = location.pathname === "/privacy" || location.pathname === "/terms" || location.pathname === "/contact";
  const isFeedbackForm = location.pathname.startsWith("/student/feedback/");
  const isAssessmentAttempt = location.pathname.startsWith("/student/assessment/");
  const isChangePassword = location.pathname === "/student/change-password" || location.pathname === "/admin/change-password" || location.pathname === "/coordinator/change-password";
  const isStudentProblems = location.pathname.startsWith("/problems");
  const isStudentDashboard = (location.pathname.startsWith("/student/") || isStudentProblems || isAssessmentModuleAlias) && !isStudentLogin && !isFeedbackForm && !isChangePassword;
  const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/');
  const isAssessmentPreview = location.pathname.startsWith("/admin/assessment/preview/");
  const isResumePage = location.pathname === "/student/resume" || /\/(admin|coordinator)\/students\/[^/]+\/resume$/.test(location.pathname);
  const isCoordinator = location.pathname.startsWith("/coordinator");
  const isStudentShell = user?.role === 'student'
    && (location.pathname.startsWith('/student/') || isStudentProblems || isAssessmentModuleAlias)
    && !isFeedbackForm
    && !isAssessmentAttempt
    && !isProblemSolver;
  const isLoginPage = isMain || isStudentLogin || isResetPassword;
  return (
    <div
      className={`${isStudentShell ? 'h-screen overflow-hidden' : 'min-h-screen'} w-full flex flex-col`}
      style={isStudentShell ? { '--admin-sidebar-width': getSidebarWidth(isStudentSidebarExpanded), '--app-navbar-height': '0rem' } : undefined}
    >
      <RoutePrefetcher />
      <ScrollToTop />
      <PopupDismissManager />
      {/* Navbar: Renders independently with its own Suspense boundary.
          Shows NavbarSkeleton briefly instead of nothing, so the page structure
          streams in progressively (navbar skeleton â†’ navbar â†’ content skeleton â†’ content) */}
      {isStudentShell && (
        <GlobalSidebar
          role="student"
          isExpanded={isStudentSidebarExpanded}
          onExpand={() => setIsStudentSidebarExpanded(true)}
          onCollapse={() => setIsStudentSidebarExpanded(false)}
        />
      )}
     
      {/* Main content: Each route section gets a role-appropriate skeleton.
          This is the "streaming rendering" pattern - the page structure appears 
          immediately as skeleton shapes, then real content swaps in when loaded */}
      <main data-app-scroll-container={isStudentShell ? true : undefined} tabIndex="-1" className={gradientBg + ` dark:bg-gray-900 flex-grow outline-none transition-[padding] duration-[800ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${isStudentShell ? 'h-screen min-h-0 overflow-y-auto overscroll-contain' : ''}`} style={isStudentShell ? { paddingLeft: 'var(--admin-sidebar-width)' } : undefined}>
        <Suspense fallback={
          isMain ? <LandingPageSkeleton /> :
          isAdmin ? <DashboardSkeleton /> :
          isCoordinator ? <DashboardSkeleton /> :
          isStudentDashboard ? <PageSkeleton /> :
          <div className="min-h-screen" /> /* minimal fallback for public pages */
        }>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/student" element={<StudentLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />
            <Route path="/terms" element={<TermsAndConditions />} />
            <Route path="/contact" element={<ContactUs />} />
        
        {/* Student Routes - Protected */}
        <Route path="/student/change-password" element={<StudentProtectedRoute><ChangePassword /></StudentProtectedRoute>} />
        <Route path="/student/profile" element={<StudentProtectedRoute><StudentProfile /></StudentProtectedRoute>} />
        <Route path="/student/resume" element={<StudentProtectedRoute><StudentResume /></StudentProtectedRoute>} />
        <Route path="/student/dashboard" element={<StudentProtectedRoute><StudentDashboard /></StudentProtectedRoute>} />
        <Route path="/student/interview" element={<StudentProtectedRoute><StudentInterview /></StudentProtectedRoute>} />
        <Route path="/student/session" element={<StudentProtectedRoute><SessionAndFeedback /></StudentProtectedRoute>} />
        <Route path="/student/feedback/:pairId" element={<StudentProtectedRoute><FeedbackForm /></StudentProtectedRoute>} />
        <Route path="/student/learning" element={<StudentProtectedRoute><StudentLearning /></StudentProtectedRoute>} />
        <Route path="/student/learning/:semester/:subject/:teacherId" element={<StudentProtectedRoute><LearningDetail /></StudentProtectedRoute>} />
        <Route path="/student/help" element={<StudentProtectedRoute><HelpAndSupport /></StudentProtectedRoute>} />
        <Route path="/student/assessments" element={<StudentProtectedRoute><StudentAssessmentList /></StudentProtectedRoute>} />
        <Route path="/student/assessment-reports" element={<StudentProtectedRoute><AssessmentReportsPage /></StudentProtectedRoute>} />
        <Route path="/student/assessment-history" element={<StudentProtectedRoute><AssessmentHistoryPage /></StudentProtectedRoute>} />
        <Route path="/student/assessment/:id/feedback" element={<StudentProtectedRoute><AssessmentFeedbackPage /></StudentProtectedRoute>} />
        <Route path="/assessments" element={<StudentProtectedRoute><StudentAssessmentList /></StudentProtectedRoute>} />
        <Route path="/assessment-reports" element={<StudentProtectedRoute><AssessmentReportsPage /></StudentProtectedRoute>} />
        <Route path="/assessment-history" element={<StudentProtectedRoute><AssessmentHistoryPage /></StudentProtectedRoute>} />
        <Route path="/student/assessment/:id" element={<StudentProtectedRoute><AssessmentAttempt /></StudentProtectedRoute>} />
        <Route path="/student/analytics" element={<StudentProtectedRoute><StudentAnalytics /></StudentProtectedRoute>} />
        <Route path="/student/analytics/:section" element={<StudentProtectedRoute><StudentAnalytics /></StudentProtectedRoute>} />
        <Route path="/student/analysis" element={<StudentProtectedRoute><StudentAnalytics /></StudentProtectedRoute>} />
        <Route path="/student/analysis/:section" element={<StudentProtectedRoute><StudentAnalytics /></StudentProtectedRoute>} />
        <Route path="/problems" element={<StudentProtectedRoute><ProblemsPage /></StudentProtectedRoute>} />
        <Route path="/problems/:id" element={<StudentProtectedRoute><ProblemSolver /></StudentProtectedRoute>} />
        
        {/* Admin Routes - Protected */}
        <Route path="/admin" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/overview" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/dashboard" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/onboarding" element={<AdminShell><StudentOnboarding /></AdminShell>} />
        <Route path="/admin/students" element={<AdminShell><StudentDirectory /></AdminShell>} />
        <Route path="/admin/students/bulk-lists" element={<AdminShell><StudentBulkLists /></AdminShell>} />
        <Route path="/admin/students/:studentId" element={<AdminShell><AdminStudentProfile /></AdminShell>} />
        <Route path="/admin/students/:studentId/resume" element={<AdminShell><StudentResumeView /></AdminShell>} />
        <Route path="/admin/coordinator-directory" element={<AdminShell><CoordinatorDirectory /></AdminShell>} />
        <Route path="/admin/coordinators" element={<AdminShell><CoordinatorOnboarding /></AdminShell>} />
        <Route path="/admin/coordinator-overview" element={<AdminShell><CoordinatorOverview /></AdminShell>} />
        <Route path="/admin/coordinator-access" element={<AdminShell><CoordinatorAccess /></AdminShell>} />
        <Route path="/admin/coordinator-access/:coordinatorId" element={<AdminShell><CoordinatorAccessDetails /></AdminShell>} />
        <Route path="/admin/event" element={<AdminShell><EventManagement /></AdminShell>} />
        <Route path="/admin/event/create" element={<AdminShell><EventManagement /></AdminShell>} />
        <Route path="/admin/event/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews" element={<Navigate to="/admin/interviews/one-to-one" replace />} />
        <Route path="/admin/interviews/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/one-to-one" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/one-to-one/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/one-to-one/scheduled" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/one-to-one/scheduled/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/one-to-one/past" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/one-to-one/past/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/scheduled" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/scheduled/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/past" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/past/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/feedback" element={<AdminShell><FeedbackReview /></AdminShell>} />
        <Route path="/admin/ai-interviews/*" element={<AdminShell><AIInterviewWorkspace /></AdminShell>} />
        <Route path="/admin/change-password" element={<AdminShell><AdminChangePassword /></AdminShell>} />
        <Route path="/admin/learning" element={<AdminShell><AdminLearning /></AdminShell>} />
        <Route path="/admin/learning/:semester/:subject/:teacherId" element={<AdminShell><AdminLearningDetail /></AdminShell>} />
        <Route path="/admin/activity" element={<AdminShell><AdminActivity /></AdminShell>} />
        <Route path="/admin/assessment" element={<AdminShell><AssessmentDashboard /></AdminShell>} />
        <Route path="/admin/assessment/create" element={<AdminShell><CreateAssessment /></AdminShell>} />
        <Route path="/admin/assessment/:id" element={<AdminShell><CreateAssessment viewOnly /></AdminShell>} />
        <Route path="/admin/assessment/:id/edit" element={<AdminShell><CreateAssessment /></AdminShell>} />
        <Route path="/admin/assessment/reports" element={<AdminShell><AssessmentReports /></AdminShell>} />
        <Route path="/admin/assessment-feedback" element={<AdminShell><AssessmentFeedback /></AdminShell>} />
        <Route path="/admin/library" element={<AdminShell><LibraryWorkspace view="questions" /></AdminShell>} />
        <Route path="/admin/library/create" element={<AdminShell><LibraryWorkspace view="create-question" /></AdminShell>} />
        <Route path="/admin/library/add-question" element={<AdminShell><LibraryWorkspace view="create-question" /></AdminShell>} />
        <Route path="/admin/library/question/:id/edit" element={<AdminShell><LibraryWorkspace view="edit-question" /></AdminShell>} />
        <Route path="/admin/library/coding/overview" element={<Navigate to="/admin/library/coding/problems" replace />} />
        <Route path="/admin/library/coding/create" element={<AdminShell><LibraryWorkspace view="create-coding" /></AdminShell>} />
        <Route path="/admin/library/coding/problems" element={<AdminShell><LibraryWorkspace view="coding-problems" /></AdminShell>} />
        <Route path="/admin/library/coding/:id/edit" element={<AdminShell><LibraryWorkspace view="edit-coding" /></AdminShell>} />
        <Route path="/admin/library/coding/:id/preview" element={<AdminShell><LibraryWorkspace view="preview-coding" /></AdminShell>} />
        <Route path="/admin/library/coding/analytics" element={<AdminShell><LibraryWorkspace view="coding-analytics" /></AdminShell>} />
        <Route path="/admin/assessment/select-problem" element={<AdminShell><SelectProblemFromLibrary /></AdminShell>} />
        <Route path="/admin/assessment/preview/:id" element={<AdminShell layout={false}><AdminAssessmentPreview /></AdminShell>} />
        <Route path="/admin/compiler" element={<Navigate to="/admin/library/coding/problems" replace />} />
        <Route path="/admin/compiler/create" element={<AdminShell><LibraryWorkspace view="create-coding" /></AdminShell>} />
        <Route path="/admin/compiler/problems" element={<AdminShell><LibraryWorkspace view="coding-problems" /></AdminShell>} />
        <Route path="/admin/compiler/:id/edit" element={<AdminShell><LibraryWorkspace view="edit-coding" /></AdminShell>} />
        <Route path="/admin/compiler/:id/preview" element={<AdminShell><LibraryWorkspace view="preview-coding" /></AdminShell>} />
        <Route path="/admin/compiler/analytics" element={<AdminShell><LibraryWorkspace view="coding-analytics" /></AdminShell>} />
        <Route path="/admin/company-insights" element={<AdminShell><AdminCompanyInsights /></AdminShell>} />
        <Route path="/admin/company-insights/add" element={<AdminShell><AdminCompanyBenchmarkAdd /></AdminShell>} />
        <Route path="/admin/settings/email-templates" element={<AdminShell><AdminEmailTemplates /></AdminShell>} />
        <Route path="/admin/settings/master-data" element={<AdminShell><MasterData /></AdminShell>} />
        <Route path="/admin/settings/master-data/:category" element={<AdminShell><MasterData /></AdminShell>} />
        <Route path="/admin/settings/bulk-uploads" element={<AdminShell><BulkUploads /></AdminShell>} />
        <Route path="/admin/email-queue" element={<AdminShell><AdminEmailQueue /></AdminShell>} />
        <Route path="/admin/settings/promote-students" element={<AdminShell><StudentPromotion /></AdminShell>} />
        <Route path="/admin/announcements/add" element={<AdminShell><AnnouncementCreate /></AdminShell>} />
        <Route path="/admin/announcements/manage" element={<AdminShell><AnnouncementManage /></AdminShell>} />
        
        {/* Coordinator Routes - Protected */}
        <Route path="/coordinator/overview" element={<CoordinatorShell permission="coordinator.dashboard.overview"><CoordinatorDashboard /></CoordinatorShell>} />
        <Route path="/coordinator" element={<Navigate to="/coordinator/overview" replace />} />
        <Route path="/coordinator/interviews" element={<Navigate to="/coordinator/interviews/one-to-one" replace />} />
        <Route path="/coordinator/interviews/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/one-to-one" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/one-to-one/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/one-to-one/scheduled" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/one-to-one/scheduled/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/one-to-one/past" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/one-to-one/past/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/scheduled" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/scheduled/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/past" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews/past/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/event/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/students" element={<CoordinatorShell permission="coordinator.students.view"><CoordinatorStudents /></CoordinatorShell>} />
        <Route path="/coordinator/onboarding" element={<CoordinatorShell permission="coordinator.students.create"><StudentOnboarding /></CoordinatorShell>} />
        <Route path="/coordinator/students/bulk-lists" element={<CoordinatorShell permission="coordinator.students.bulk-lists"><StudentBulkLists /></CoordinatorShell>} />
        <Route path="/coordinator/students/:studentId" element={<CoordinatorShell permission="coordinator.students.profile"><AdminStudentProfile /></CoordinatorShell>} />
        <Route path="/coordinator/students/:studentId/resume" element={<CoordinatorShell permission="coordinator.students.profile"><StudentResumeView /></CoordinatorShell>} />
        <Route path="/coordinator/subjects" element={<CoordinatorShell permission="coordinator.learning.manage"><SemesterManagement /></CoordinatorShell>} />
        <Route path="/coordinator/database" element={<CoordinatorShell permission="coordinator.courses.view"><CoordinatorDatabase /></CoordinatorShell>} />
        <Route path="/coordinator/feedback" element={<CoordinatorShell permission="coordinator.feedback.view"><CoordinatorFeedback /></CoordinatorShell>} />
        <Route path="/coordinator/event/create" element={<CoordinatorShell permission="coordinator.interviews.create"><EventManagement /></CoordinatorShell>} />
        <Route path="/coordinator/ai-interviews" element={<CoordinatorShell permission="coordinator.interviews.view"><AIInterviewsPlaceholder /></CoordinatorShell>} />
        <Route path="/coordinator/profile" element={<CoordinatorShell permission="coordinator.profile.manage"><CoordinatorProfile /></CoordinatorShell>} />
        <Route path="/coordinator/change-password" element={<CoordinatorShell permission="coordinator.profile.manage"><CoordinatorChangePassword /></CoordinatorShell>} />
        <Route path="/coordinator/activity" element={<CoordinatorShell permission="coordinator.activity.view"><CoordinatorActivity /></CoordinatorShell>} />
        <Route path="/coordinator/settings/promote-students" element={<CoordinatorShell permission="coordinator.students.promote"><StudentPromotion /></CoordinatorShell>} />
        
        {/* Extended Coordinator Features */}
        <Route path="/coordinator/assessment" element={<CoordinatorShell permission="coordinator.assessment.view"><AssessmentDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/create" element={<CoordinatorShell permission="coordinator.assessment.create"><CreateAssessment /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/:id" element={<CoordinatorShell permission="coordinator.assessment.view"><CreateAssessment viewOnly /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/:id/edit" element={<CoordinatorShell permission="coordinator.assessment.edit"><CreateAssessment /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/reports" element={<CoordinatorShell permission="coordinator.assessment.reports"><AssessmentReports /></CoordinatorShell>} />
        <Route path="/coordinator/assessment-feedback" element={<CoordinatorShell permission="coordinator.assessment.feedback"><AssessmentFeedback /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/select-problem" element={<CoordinatorShell permission="coordinator.assessment.create"><SelectProblemFromLibrary /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/preview/:id" element={<CoordinatorShell layout={false} permission="coordinator.assessment.edit"><AdminAssessmentPreview /></CoordinatorShell>} />
        <Route path="/coordinator/library" element={<CoordinatorShell permission="coordinator.library.view"><LibraryWorkspace view="questions" /></CoordinatorShell>} />
        <Route path="/coordinator/library/create" element={<CoordinatorShell permission="coordinator.library.create"><LibraryWorkspace view="create-question" /></CoordinatorShell>} />
        <Route path="/coordinator/library/add-question" element={<CoordinatorShell permission="coordinator.library.create"><LibraryWorkspace view="create-question" /></CoordinatorShell>} />
        <Route path="/coordinator/library/question/:id/edit" element={<CoordinatorShell permission="coordinator.library.create"><LibraryWorkspace view="edit-question" /></CoordinatorShell>} />
        <Route path="/coordinator/library/coding/overview" element={<Navigate to="/coordinator/library/coding/problems" replace />} />
        <Route path="/coordinator/library/coding/create" element={<CoordinatorShell permission="coordinator.compiler.create"><LibraryWorkspace view="create-coding" /></CoordinatorShell>} />
        <Route path="/coordinator/library/coding/problems" element={<CoordinatorShell permission="coordinator.compiler.manage"><LibraryWorkspace view="coding-problems" /></CoordinatorShell>} />
        <Route path="/coordinator/library/coding/:id/edit" element={<CoordinatorShell permission="coordinator.compiler.manage"><LibraryWorkspace view="edit-coding" /></CoordinatorShell>} />
        <Route path="/coordinator/library/coding/:id/preview" element={<CoordinatorShell permission="coordinator.compiler.manage"><LibraryWorkspace view="preview-coding" /></CoordinatorShell>} />
        <Route path="/coordinator/library/coding/analytics" element={<CoordinatorShell permission="coordinator.compiler.analytics"><LibraryWorkspace view="coding-analytics" /></CoordinatorShell>} />
        <Route path="/coordinator/announcements/add" element={<CoordinatorShell permission="coordinator.announcements.create"><AnnouncementCreate /></CoordinatorShell>} />
        <Route path="/coordinator/announcements/manage" element={<CoordinatorShell permission="coordinator.announcements.manage"><AnnouncementManage /></CoordinatorShell>} />
        <Route path="/coordinator/compiler" element={<Navigate to="/coordinator/library/coding/problems" replace />} />
        <Route path="/coordinator/compiler/create" element={<CoordinatorShell permission="coordinator.compiler.create"><LibraryWorkspace view="create-coding" /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/problems" element={<CoordinatorShell permission="coordinator.compiler.manage"><LibraryWorkspace view="coding-problems" /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/:id/edit" element={<CoordinatorShell permission="coordinator.compiler.manage"><LibraryWorkspace view="edit-coding" /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/:id/preview" element={<CoordinatorShell permission="coordinator.compiler.manage"><LibraryWorkspace view="preview-coding" /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/analytics" element={<CoordinatorShell permission="coordinator.compiler.analytics"><LibraryWorkspace view="coding-analytics" /></CoordinatorShell>} />
        <Route path="/coordinator/company-insights" element={<CoordinatorShell permission="coordinator.company.view"><AdminCompanyInsights /></CoordinatorShell>} />
        <Route path="/coordinator/company-insights/add" element={<CoordinatorShell permission="coordinator.company.create"><AdminCompanyBenchmarkAdd /></CoordinatorShell>} />
        <Route path="/coordinator/settings/email-templates" element={<CoordinatorShell permission="coordinator.email-templates.manage"><AdminEmailTemplates /></CoordinatorShell>} />
        <Route path="/coordinator/settings/master-data" element={<CoordinatorShell permission="coordinator.master-data.manage"><MasterData /></CoordinatorShell>} />
        <Route path="/coordinator/settings/master-data/:category" element={<CoordinatorShell permission="coordinator.master-data.manage"><MasterData /></CoordinatorShell>} />
        <Route path="/coordinator/email-queue" element={<CoordinatorShell permission="coordinator.email-queue.manage"><AdminEmailQueue /></CoordinatorShell>} />
          </Routes>
        </Suspense>
      </main>
      
      {user?.role !== 'student' && !location.pathname.startsWith('/student/') && !isStudentProblems && !isAssessmentModuleAlias && !isAdmin && !isCoordinator && !isLoginPage && !isFeedbackForm && !isPublicPage && !isProblemSolver && !isAssessmentPreview && !isAssessmentAttempt && !isResumePage && (
        <Suspense fallback={null}><Footer /></Suspense>
      )}
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;



































