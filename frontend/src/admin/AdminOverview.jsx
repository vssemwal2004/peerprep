import { useCallback } from 'react';
import OverviewDashboard from '../overview/OverviewDashboard';
import PlatformOverview from '../overview/PlatformOverview';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import { isUniversityDeployment, pathAllowed } from '../platform/universityPermissions';

// The Master Admin sees every university; a university admin sees only their university's licensed modules.
export default function AdminOverview() {
  const { permissions } = useUniversityPolicy();
  const allowPath = useCallback((to) => !isUniversityDeployment || pathAllowed(to, permissions, 'admin'), [permissions]);
  if (!isUniversityDeployment) return <PlatformOverview />;
  return <OverviewDashboard role="admin" allowPath={allowPath} />;
}
