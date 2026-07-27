import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useCallback, useRef } from "react";
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/CustomToast';
import AdminLayout from './admin/AdminLayout';
import { LandingPageSkeleton, NavbarSkeleton, PageSkeleton, DashboardSkeleton } from './components/Skeletons';
import { useAuth } from './context/AuthContext';
import { hasPermission } from './admin/coordinatorPermissions';

// Lazy-load navbars to keep them out of the main bundle
const StudentNavbar = lazy(() => import('./components/StudentNavbar').then(m => ({ default: m.StudentNavbar })));
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
const StudentProtectedRoute = lazy(() => import("./student/StudentProtectedRoute"));
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
const StudentAnalytics = lazy(() => import("./student/StudentAnalytics"));

// Admin Pages
const AdminProtectedRoute = lazy(() => import("./admin/AdminProtectedRoute"));
const AdminOverview = lazy(() => import("./admin/AdminOverview"));
const AdminLearning = lazy(() => import("./admin/AdminLearning"));
const AdminLearningDetail = lazy(() => import("./admin/AdminLearningDetail"));
const StudentOnboarding = lazy(() => import("./admin/StudentOnboarding"));
const StudentDirectory = lazy(() => import("./admin/StudentDirectory"));
const AdminStudentProfile = lazy(() => import("./admin/AdminStudentProfile"));
const EventManagement = lazy(() => import("./admin/EventManagement"));
const EventDetail = lazy(() => import("./admin/EventDetail"));
const FeedbackReview = lazy(() => import("./admin/FeedbackReview"));
const CoordinatorOnboarding = lazy(() => import("./admin/CoordinatorOnboarding"));
const CoordinatorDirectory = lazy(() => import("./admin/CoordinatorDirectory"));
const AdminChangePassword = lazy(() => import("./admin/AdminChangePassword"));
const AdminActivity = lazy(() => import("./admin/AdminActivity"));
const AdminCompilerDashboard = lazy(() => import("./admin/compiler/AdminCompilerDashboard"));
const AdminCompanyInsights = lazy(() => import("./admin/AdminCompanyInsights"));
const AdminCompanyBenchmarkAdd = lazy(() => import("./admin/AdminCompanyBenchmarkAdd"));
const AssessmentDashboard = lazy(() => import("./admin/AssessmentDashboard"));
const CreateAssessment = lazy(() => import("./admin/CreateAssessment"));
const AssessmentReports = lazy(() => import("./admin/AssessmentReports"));
const QuestionLibrary = lazy(() => import("./admin/QuestionLibrary"));
const AddQuestionToLibrary = lazy(() => import("./admin/AddQuestionToLibrary"));
const SelectProblemFromLibrary = lazy(() => import("./admin/assessment/SelectProblemFromLibrary"));
const AdminAssessmentPreview = lazy(() => import("./admin/assessment/AdminAssessmentPreview"));
const AdminEmailTemplates = lazy(() => import("./admin/EmailTemplates"));
const StudentPromotion = lazy(() => import("./admin/StudentPromotion"));
const AnnouncementCreate = lazy(() => import("./admin/AnnouncementCreate"));
const AnnouncementManage = lazy(() => import("./admin/AnnouncementManage"));
const CoordinatorOverview = lazy(() => import("./admin/CoordinatorOverview"));
const CoordinatorAccess = lazy(() => import("./admin/CoordinatorAccess"));
const CoordinatorAccessDetails = lazy(() => import("./admin/CoordinatorAccessDetails"));

// Coordinator Pages
const CoordinatorProtectedRoute = lazy(() => import("./coordinator/CoordinatorProtectedRoute"));
const CoordinatorStudents = lazy(() => import("./coordinator/CoordinatorStudents"));
const CoordinatorChangePassword = lazy(() => import("./coordinator/CoordinatorChangePassword"));
const CoordinatorEventDetail = lazy(() => import("./coordinator/CoordinatorEventDetail"));
const CoordinatorProfile = lazy(() => import("./coordinator/CoordinatorProfile"));
const SemesterManagement = lazy(() => import("./coordinator/SemesterManagement"));
const CoordinatorFeedback = lazy(() => import("./coordinator/CoordinatorFeedback"));
const CoordinatorActivity = lazy(() => import("./coordinator/CoordinatorActivity"));
const CoordinatorDatabase = lazy(() => import("./coordinator/CoordinatorDatabase"));

const gradientBg = "bg-white";

/**
 * RoutePrefetcher - Preloads chunks for the current user's role
 * 
 * When a user navigates to a role's pages, we prefetch the most likely
 * next pages they'll visit. This eliminates loading delays on subsequent
 * navigation within the same role.
 */
function RoutePrefetcher() {
  const location = useLocation();
  const prefetched = useRef({ student: false, admin: false, coordinator: false });

  const canPrefetch = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return true;
    if (connection.saveData) return false;
    const effectiveType = connection.effectiveType || '';
    return effectiveType !== 'slow-2g' && effectiveType !== '2g';
  };

  const prefetchStudentRoutes = useCallback(() => {
    import("./student/StudentDashboard");
    import("./student/StudentInterview");
    import("./student/ProblemsPage");
    import("./student/StudentAssessmentList");
    import("./student/AssessmentReportsPage");
    import("./student/AssessmentHistoryPage");
  }, []);

  const prefetchAdminRoutes = useCallback(() => {
    import("./admin/AssessmentDashboard");
    import("./admin/compiler/AdminCompilerDashboard");
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
        if (prefetched.current.student) return;
        prefetched.current.student = true;
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

    if ('requestIdleCallback' in window) {
      requestIdleCallback(prefetch);
    } else {
      setTimeout(prefetch, 200);
    }
  }, [location.pathname, prefetchStudentRoutes, prefetchAdminRoutes, prefetchCoordinatorRoutes]);

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

function AppContent() {
  useHideGlobalLoader();
  const location = useLocation();
  const { user } = useAuth();
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
  const isCoordinator = location.pathname.startsWith("/coordinator");
  const isLoginPage = isMain || isStudentLogin || isResetPassword;
  const AdminShell = ({ children, layout = true }) => (
    <AdminProtectedRoute>
      {layout ? <AdminLayout>{children}</AdminLayout> : children}
    </AdminProtectedRoute>
  );

  const CoordinatorAccessDenied = () => (
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
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

  const CoordinatorShell = ({ children, layout = true, permission }) => (
    <CoordinatorProtectedRoute>
      {permission && !hasPermission(user, permission)
        ? (layout ? <CoordinatorLayout><CoordinatorAccessDenied /></CoordinatorLayout> : <CoordinatorAccessDenied />)
        : (layout ? <CoordinatorLayout>{children}</CoordinatorLayout> : children)}
    </CoordinatorProtectedRoute>
  );

  return (
    <div className="min-h-screen w-full flex flex-col">
      <RoutePrefetcher />
      {/* Navbar: Renders independently with its own Suspense boundary.
          Shows NavbarSkeleton briefly instead of nothing, so the page structure
          streams in progressively (navbar skeleton â†’ navbar â†’ content skeleton â†’ content) */}
      {!isFeedbackForm && !isPublicPage && !isAssessmentPreview && !isAssessmentAttempt && (
        <Suspense fallback={isStudentDashboard ? <NavbarSkeleton /> : null}>
          {(isStudentDashboard && !isProblemSolver) ? <StudentNavbar /> : null}
        </Suspense>
      )}
     
      {/* Main content: Each route section gets a role-appropriate skeleton.
          This is the "streaming rendering" pattern - the page structure appears 
          immediately as skeleton shapes, then real content swaps in when loaded */}
      <main className={gradientBg + " dark:bg-gray-900 flex-grow"}>
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
        <Route path="/assessments" element={<StudentProtectedRoute><StudentAssessmentList /></StudentProtectedRoute>} />
        <Route path="/assessment-reports" element={<StudentProtectedRoute><AssessmentReportsPage /></StudentProtectedRoute>} />
        <Route path="/assessment-history" element={<StudentProtectedRoute><AssessmentHistoryPage /></StudentProtectedRoute>} />
        <Route path="/student/assessment/:id" element={<StudentProtectedRoute><AssessmentAttempt /></StudentProtectedRoute>} />
        <Route path="/student/analytics" element={<StudentProtectedRoute><StudentAnalytics /></StudentProtectedRoute>} />
        <Route path="/student/analysis" element={<StudentProtectedRoute><StudentAnalytics /></StudentProtectedRoute>} />
        <Route path="/problems" element={<StudentProtectedRoute><ProblemsPage /></StudentProtectedRoute>} />
        <Route path="/problems/:id" element={<StudentProtectedRoute><ProblemSolver /></StudentProtectedRoute>} />
        
        {/* Admin Routes - Protected */}
        <Route path="/admin" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/overview" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/dashboard" element={<AdminShell><AdminOverview /></AdminShell>} />
        <Route path="/admin/onboarding" element={<AdminShell><StudentOnboarding /></AdminShell>} />
        <Route path="/admin/students" element={<AdminShell><StudentDirectory /></AdminShell>} />
        <Route path="/admin/students/:studentId" element={<AdminShell><AdminStudentProfile /></AdminShell>} />
        <Route path="/admin/coordinator-directory" element={<AdminShell><CoordinatorDirectory /></AdminShell>} />
        <Route path="/admin/coordinators" element={<AdminShell><CoordinatorOnboarding /></AdminShell>} />
        <Route path="/admin/coordinator-overview" element={<AdminShell><CoordinatorOverview /></AdminShell>} />
        <Route path="/admin/coordinator-access" element={<AdminShell><CoordinatorAccess /></AdminShell>} />
        <Route path="/admin/coordinator-access/:coordinatorId" element={<AdminShell><CoordinatorAccessDetails /></AdminShell>} />
        <Route path="/admin/event" element={<AdminShell><EventManagement /></AdminShell>} />
        <Route path="/admin/event/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/scheduled" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/scheduled/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/past" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/interviews/past/:id" element={<AdminShell><EventDetail /></AdminShell>} />
        <Route path="/admin/feedback" element={<AdminShell><FeedbackReview /></AdminShell>} />
        <Route path="/admin/change-password" element={<AdminShell><AdminChangePassword /></AdminShell>} />
        <Route path="/admin/learning" element={<AdminShell><AdminLearning /></AdminShell>} />
        <Route path="/admin/learning/:semester/:subject/:teacherId" element={<AdminShell><AdminLearningDetail /></AdminShell>} />
        <Route path="/admin/activity" element={<AdminShell><AdminActivity /></AdminShell>} />
        <Route path="/admin/assessment" element={<AdminShell><AssessmentDashboard /></AdminShell>} />
        <Route path="/admin/assessment/create" element={<AdminShell><CreateAssessment /></AdminShell>} />
        <Route path="/admin/assessment/:id/edit" element={<AdminShell><CreateAssessment /></AdminShell>} />
        <Route path="/admin/assessment/reports" element={<AdminShell><AssessmentReports /></AdminShell>} />
        <Route path="/admin/library" element={<AdminShell><QuestionLibrary /></AdminShell>} />
        <Route path="/admin/library/add-question" element={<AdminShell><AddQuestionToLibrary /></AdminShell>} />
        <Route path="/admin/assessment/select-problem" element={<AdminShell><SelectProblemFromLibrary /></AdminShell>} />
        <Route path="/admin/assessment/preview/:id" element={<AdminShell layout={false}><AdminAssessmentPreview /></AdminShell>} />
        <Route path="/admin/compiler" element={<AdminShell><AdminCompilerDashboard /></AdminShell>} />
        <Route path="/admin/compiler/create" element={<AdminShell><AdminCompilerDashboard /></AdminShell>} />
        <Route path="/admin/compiler/problems" element={<AdminShell><AdminCompilerDashboard /></AdminShell>} />
        <Route path="/admin/compiler/:id/edit" element={<AdminShell><AdminCompilerDashboard /></AdminShell>} />
        <Route path="/admin/compiler/:id/preview" element={<AdminShell><AdminCompilerDashboard /></AdminShell>} />
        <Route path="/admin/compiler/analytics" element={<AdminShell><AdminCompilerDashboard /></AdminShell>} />
        <Route path="/admin/company-insights" element={<AdminShell><AdminCompanyInsights /></AdminShell>} />
        <Route path="/admin/company-insights/add" element={<AdminShell><AdminCompanyBenchmarkAdd /></AdminShell>} />
        <Route path="/admin/settings/email-templates" element={<AdminShell><AdminEmailTemplates /></AdminShell>} />
        <Route path="/admin/settings/promote-students" element={<AdminShell><StudentPromotion /></AdminShell>} />
        <Route path="/admin/announcements/add" element={<AdminShell><AnnouncementCreate /></AdminShell>} />
        <Route path="/admin/announcements/manage" element={<AdminShell><AnnouncementManage /></AdminShell>} />
        
        {/* Coordinator Routes - Protected */}
        <Route path="/coordinator/overview" element={<CoordinatorShell permission="coordinator.dashboard.overview"><AdminOverview /></CoordinatorShell>} />
        <Route path="/coordinator" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/interviews" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/event/:id" element={<CoordinatorShell permission="coordinator.interviews.view"><CoordinatorEventDetail /></CoordinatorShell>} />
        <Route path="/coordinator/students" element={<CoordinatorShell permission="coordinator.students.view"><CoordinatorStudents /></CoordinatorShell>} />
        <Route path="/coordinator/students/:studentId" element={<CoordinatorShell permission="coordinator.students.profile"><AdminStudentProfile /></CoordinatorShell>} />
        <Route path="/coordinator/subjects" element={<CoordinatorShell permission="coordinator.learning.manage"><SemesterManagement /></CoordinatorShell>} />
        <Route path="/coordinator/database" element={<CoordinatorShell permission="coordinator.courses.view"><CoordinatorDatabase /></CoordinatorShell>} />
        <Route path="/coordinator/feedback" element={<CoordinatorShell permission="coordinator.feedback.view"><CoordinatorFeedback /></CoordinatorShell>} />
        <Route path="/coordinator/event/create" element={<CoordinatorShell permission="coordinator.interviews.create"><EventManagement /></CoordinatorShell>} />
        <Route path="/coordinator/profile" element={<CoordinatorShell permission="coordinator.profile.manage"><CoordinatorProfile /></CoordinatorShell>} />
        <Route path="/coordinator/change-password" element={<CoordinatorShell permission="coordinator.profile.manage"><CoordinatorChangePassword /></CoordinatorShell>} />
        <Route path="/coordinator/activity" element={<CoordinatorShell permission="coordinator.activity.view"><CoordinatorActivity /></CoordinatorShell>} />
        <Route path="/coordinator/settings/promote-students" element={<CoordinatorShell permission="coordinator.students.promote"><StudentPromotion /></CoordinatorShell>} />
        
        {/* Extended Coordinator Features */}
        <Route path="/coordinator/assessment" element={<CoordinatorShell permission="coordinator.assessment.view"><AssessmentDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/create" element={<CoordinatorShell permission="coordinator.assessment.create"><CreateAssessment /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/:id/edit" element={<CoordinatorShell permission="coordinator.assessment.edit"><CreateAssessment /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/reports" element={<CoordinatorShell permission="coordinator.assessment.reports"><AssessmentReports /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/select-problem" element={<CoordinatorShell permission="coordinator.assessment.create"><SelectProblemFromLibrary /></CoordinatorShell>} />
        <Route path="/coordinator/assessment/preview/:id" element={<CoordinatorShell layout={false} permission="coordinator.assessment.edit"><AdminAssessmentPreview /></CoordinatorShell>} />
        <Route path="/coordinator/library" element={<CoordinatorShell permission="coordinator.library.view"><QuestionLibrary /></CoordinatorShell>} />
        <Route path="/coordinator/library/add-question" element={<CoordinatorShell permission="coordinator.library.create"><AddQuestionToLibrary /></CoordinatorShell>} />
        <Route path="/coordinator/announcements/add" element={<CoordinatorShell permission="coordinator.announcements.create"><AnnouncementCreate /></CoordinatorShell>} />
        <Route path="/coordinator/announcements/manage" element={<CoordinatorShell permission="coordinator.announcements.manage"><AnnouncementManage /></CoordinatorShell>} />
        <Route path="/coordinator/compiler" element={<CoordinatorShell permission="coordinator.compiler.view"><AdminCompilerDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/create" element={<CoordinatorShell permission="coordinator.compiler.create"><AdminCompilerDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/problems" element={<CoordinatorShell permission="coordinator.compiler.manage"><AdminCompilerDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/:id/edit" element={<CoordinatorShell permission="coordinator.compiler.manage"><AdminCompilerDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/:id/preview" element={<CoordinatorShell permission="coordinator.compiler.manage"><AdminCompilerDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/compiler/analytics" element={<CoordinatorShell permission="coordinator.compiler.analytics"><AdminCompilerDashboard /></CoordinatorShell>} />
        <Route path="/coordinator/company-insights" element={<CoordinatorShell permission="coordinator.company.view"><AdminCompanyInsights /></CoordinatorShell>} />
        <Route path="/coordinator/company-insights/add" element={<CoordinatorShell permission="coordinator.company.create"><AdminCompanyBenchmarkAdd /></CoordinatorShell>} />
          </Routes>
        </Suspense>
      </main>
      
      {!isAdmin && !isLoginPage && !isFeedbackForm && !isPublicPage && !isProblemSolver && !isAssessmentPreview && !isAssessmentAttempt && (
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



































