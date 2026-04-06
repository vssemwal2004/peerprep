import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageSkeleton } from '../components/Skeletons';

export default function StudentProtectedRoute({ children }) {
  const { user, loading, authChecked } = useAuth();

  // Show skeleton while auth is being checked (streaming loading)
  if (loading || !authChecked) {
    return <PageSkeleton />;
  }

  // Not authenticated or wrong role
  if (!user || user.role !== 'student') {
    return <Navigate to="/student" replace />;
  }

  return children;
}
