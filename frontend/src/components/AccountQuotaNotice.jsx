import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { isUniversityDeployment } from '../platform/universityPermissions';

export default function AccountQuotaNotice({ role }) {
  const [quota, setQuota] = useState(null);
  const [error, setError] = useState('');

  async function refresh() {
    setError('');
    try { setQuota(await api.universityAccountLimits()); }
    catch (failure) { setError(failure.message || 'Account limits are unavailable'); }
  }

  useEffect(() => { if (isUniversityDeployment) void refresh(); }, []);
  if (!isUniversityDeployment) return null;
  const used = quota?.[role === 'student' ? 'students' : 'coordinators'];
  const limit = quota?.[role === 'student' ? 'studentLimit' : 'coordinatorLimit'];
  return <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-slate-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-slate-200">
    <span>{error || (quota ? `${role === 'student' ? 'Student' : 'Coordinator'} accounts: ${used.toLocaleString()} ${limit == null ? '(no limit set yet)' : `of ${limit.toLocaleString()} used${used >= limit ? ' · limit reached' : ''}`}` : 'Loading account limit…')}</span>
    <button type="button" className="font-semibold text-sky-700 underline dark:text-sky-300" onClick={refresh}>Refresh</button>
  </div>;
}
