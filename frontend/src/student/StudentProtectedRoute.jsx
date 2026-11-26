import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from '../components/Skeletons';
import UniversityFeatureGate from '../platform/UniversityFeatureGate';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import { featureForStudentPath, firstStudentFeaturePath, hasStudentFeature } from './studentFeatureAccess';

export default function StudentProtectedRoute({ children }) {
  const { user, loading, authChecked, sessionEnded } = useAuth();
  const location = useLocation();
  const { status: universityStatus, allowsPath } = useUniversityPolicy();

  // Show skeleton while auth is being checked, and under "Your session has expired" (no redirect until OK)
  if (loading || !authChecked || (sessionEnded && !user)) {
    return <PageSkeleton />;
  }

  // Not authenticated or wrong role
  if (!user || user.role !== 'student') {
    return <Navigate to="/student" replace />;
  }

  if (user.accessScope === 'assessment_only') {
    const assessmentPath = location.pathname === '/student/assessments'
      || location.pathname === '/assessments'
      || location.pathname === '/student/assessment-reports'
      || location.pathname === '/assessment-reports'
      || location.pathname === '/student/assessment-history'
      || location.pathname === '/assessment-history'
      || location.pathname === '/student/change-password'
      || location.pathname.startsWith('/student/assessment/');
    if (!assessmentPath) return <Navigate to="/student/assessments" replace />;
  }

  const requestedFeature = featureForStudentPath(location.pathname);
  // A test attempt or its feedback page can be a Prep Assessment test or a company mock (Prep Mock);
  // the server checks which one this test needs.
  const allowed = requestedFeature === 'assessments' && location.pathname.startsWith('/student/assessment/')
    ? ['assessments', 'prep_mock'] : [requestedFeature];
  if (requestedFeature && !allowed.some((feature) => hasStudentFeature(user, feature))) {
    return <Navigate to={firstStudentFeaturePath(user, (path) => allowsPath(path, 'student'))} replace state={{ accessDenied: requestedFeature }} />;
  }

  if (universityStatus === 'ready' && requestedFeature && !allowsPath(location.pathname, 'student', location.search)) {
    return <Navigate to={firstStudentFeaturePath(user, (path) => allowsPath(path, 'student'))} replace
      state={{ accessDenied: requestedFeature }} />;
  }

  return <UniversityFeatureGate role="student">{children}</UniversityFeatureGate>;
}
