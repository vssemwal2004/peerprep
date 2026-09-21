import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from '../components/Skeletons';

export default function StudentProtectedRoute({ children }) {
  const { user, loading, authChecked } = useAuth();
  const location = useLocation();

  // Show skeleton while auth is being checked (streaming loading)
  if (loading || !authChecked) {
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

  return children;
}
