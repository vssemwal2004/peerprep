import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DashboardSkeleton } from '../components/Skeletons';
import UniversityFeatureGate from '../platform/UniversityFeatureGate';

export default function CoordinatorProtectedRoute({ children }) {
  const { user, loading, authChecked, sessionEnded } = useAuth();

  // Show skeleton while auth is being checked, and under "Your session has expired" (no redirect until OK)
  if (loading || !authChecked || (sessionEnded && !user)) {
    return <DashboardSkeleton />;
  }

  // Not authenticated or wrong role
  if (!user || user.role !== 'coordinator') {
    return <Navigate to="/student" replace />;
  }

  return <UniversityFeatureGate role="coordinator">{children}</UniversityFeatureGate>;
}
