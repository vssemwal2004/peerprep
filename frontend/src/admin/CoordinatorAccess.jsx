import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, Search, ShieldCheck, SlidersHorizontal, Users, X } from 'lucide-react';
import { api } from '../utils/api';
import { defaultCoordinatorPermissions } from './coordinatorPermissions';

function formatDate(value) {
  if (!value) return 'Not updated';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not updated';
  return date.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Status({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
      active
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    }`}><span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-400'}`} />{active ? 'Active' : 'Disabled'}</span>
  );
}

function hasCodingAccess(coordinator) {
  const permissions = Array.isArray(coordinator.permissions) ? coordinator.permissions : defaultCoordinatorPermissions;
  return permissions.some((permission) => permission.startsWith('coordinator.compiler.'));
}

export default function CoordinatorAccess() {
  const navigate = useNavigate();
  const [coordinators, setCoordinators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.listAllCoordinators();
        if (mounted) setCoordinators(data.coordinators || []);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return coordinators.filter((coordinator) => {
      const active = coordinator.isActive !== false;
      const matchesStatus = status === 'all' || (status === 'active' ? active : !active);
      const matchesSearch = !text || [coordinator.name, coordinator.email, coordinator.role, coordinator.coordinatorId, coordinator.phone, coordinator.department]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(text));
      return matchesStatus && matchesSearch;
    });
  }, [coordinators, query, status]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60 dark:bg-gray-950">
      <div className="mx-auto w-full flex-1 px-3 py-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-violet-100 dark:bg-violet-900/50">
                <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-300" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 dark:text-white">Coordinator Access</h1>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">{filtered.length.toLocaleString()} {query || status !== 'all' ? 'matching coordinators' : 'coordinators available for access management'}</p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[260px] flex-1 xl:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, email, phone..." className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-xs text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
                {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-slate-100 dark:hover:bg-gray-600"><X className="h-3 w-3 text-slate-500" /></button> : null}
              </div>
              <select aria-label="Filter coordinator status" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="disabled">Disabled only</option>
          </select>
              <Link to="/admin/coordinator-overview" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <Users className="h-4 w-4" />Overview
              </Link>
            </div>
          </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-12 text-center dark:border-gray-700">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">No coordinators found</h3>
            <p className="mt-2 text-sm text-slate-500">Create a coordinator before assigning access.</p>
          </div>
        ) : (
          <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 dark:border-gray-700">
            <table className="w-full min-w-[1050px] divide-y divide-slate-200">
              <thead className="bg-slate-50 dark:bg-gray-700">
                <tr>
                  {['Coordinator', 'Email', 'Phone', 'Department', 'Role', 'Status', 'Permissions', 'Coding Access', 'Last Updated', 'Action'].map((heading) => (
                    <th key={heading} className={`px-3 py-2 text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300 ${heading === 'Action' ? 'text-right' : 'text-left'}`}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {filtered.map((coordinator) => (
                  <tr key={coordinator._id} onClick={() => navigate(`/admin/coordinator-access/${coordinator._id}`)} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700">
                    <td className="px-3 py-1.5">
                      <div className="flex min-w-[190px] items-center gap-2">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">{(coordinator.name || '?').charAt(0).toUpperCase()}</div>
                        <div className="max-w-[220px] leading-tight">
                          <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">{coordinator.name || 'Unnamed'}</div>
                          <div className="truncate text-[10px] text-slate-500">{coordinator.coordinatorId || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="max-w-[230px] px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300"><span className="block truncate">{coordinator.email || '-'}</span></td>
                    <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{coordinator.phone || '-'}</td>
                    <td className="max-w-[160px] px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300"><span className="block truncate">{coordinator.department || '-'}</span></td>
                    <td className="px-3 py-1.5 text-xs capitalize text-slate-600 dark:text-gray-300">{coordinator.role || 'coordinator'}</td>
                    <td className="px-3 py-1.5"><Status active={coordinator.isActive !== false} /></td>
                    <td className="px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white">{coordinator.permissionCount || 0}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        hasCodingAccess(coordinator)
                          ? 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}>
                        {hasCodingAccess(coordinator) ? 'Enabled' : 'Off'}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{formatDate(coordinator.lastPermissionUpdatedAt || coordinator.updatedAt)}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button type="button" onClick={(event) => { event.stopPropagation(); navigate(`/admin/coordinator-access/${coordinator._id}`); }} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-900 px-2.5 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-950">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Manage
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
