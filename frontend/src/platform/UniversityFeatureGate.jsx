import { Link, useLocation } from 'react-router-dom';
import { PageSkeleton } from '../components/Skeletons';
import { useUniversityPolicy } from './UniversityPolicyContext';
import { isUniversityDeployment } from './universityPermissions';

export default function UniversityFeatureGate({ role, children }) {
  const location = useLocation();
  const { status, refresh, allowsPath } = useUniversityPolicy();
  if (!isUniversityDeployment) return children;
  if (status === 'loading') return <PageSkeleton />;
  if (status === 'error') return <div className="mx-auto max-w-xl p-8 text-center">
    <h1 className="text-xl font-semibold">University access is unavailable</h1>
    <p className="mt-2 text-sm text-slate-500">The university permissions could not be loaded. Please retry.</p>
    <button type="button" onClick={refresh} className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Retry</button>
  </div>;
  if (!allowsPath(location.pathname, role, location.search)) {
    const home = role === 'admin' ? '/admin/overview' : role === 'coordinator' ? '/coordinator/overview' : '/student/dashboard';
    return <div className="mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-semibold">Module unavailable</h1>
      <p className="mt-2 text-sm text-slate-500">This module is not enabled for your university.</p>
      <Link to={home} className="mt-4 inline-block rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white">Go to overview</Link>
    </div>;
  }
  return children;
}
