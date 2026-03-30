import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DashboardSkeleton } from '../components/Skeletons';

export default function AdminProtectedRoute({ children }) {
  const { user, loading, authChecked } = useAuth();

  // Show skeleton while auth is being checked (streaming loading)
  if (loading || !authChecked) {
    return <DashboardSkeleton />;
  }

  // Not authenticated or wrong role
  if (!user || user.role !== 'admin') {
    return <Navigate to="/student" replace />;
  }

  return children;
}
