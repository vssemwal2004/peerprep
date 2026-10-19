import { useCallback } from 'react';
import OverviewDashboard from '../overview/OverviewDashboard';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../admin/coordinatorPermissions';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import { isUniversityDeployment, pathAllowed } from '../platform/universityPermissions';

// Same overview as the university admin; the server limits it to this coordinator's permissions and students.
export default function CoordinatorDashboard() {
  const { user } = useAuth();
  const { permissions } = useUniversityPolicy();
  const allowPath = useCallback((to) => !isUniversityDeployment || pathAllowed(to, permissions, 'coordinator'), [permissions]);
  const can = useCallback((permission) => hasPermission(user, permission), [user]);
  return <OverviewDashboard role="coordinator" allowPath={allowPath} can={can} />;
}
