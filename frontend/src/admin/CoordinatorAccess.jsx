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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
      active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200'
    }`}>{active ? 'Active' : 'Disabled'}</span>
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
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Access Control
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Coordinator Access</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">Choose a coordinator and manage exactly which existing platform features they can access.</p>
          </div>
          <Link to="/admin/coordinator-overview" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
            <Users className="h-4 w-4" />
            Overview
          </Link>
        </div>

        <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-900 lg:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search coordinators by name, email, role, or ID..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:ring-sky-400/10" />
            {query ? <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button> : null}
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-gray-950 dark:text-slate-200">
            <option value="all">All status</option>
            <option value="active">Active only</option>
            <option value="disabled">Disabled only</option>
          </select>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-gray-900">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-white/10 dark:bg-gray-900">
            <ShieldCheck className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">No coordinators found</h3>
            <p className="mt-2 text-sm text-slate-500">Create a coordinator before assigning access.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900">
            <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
              <h2 className="text-base font-bold text-slate-950 dark:text-white">Coordinator Access Matrix</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Structured table for role, status, permission count, coding access, and last permission update.</p>
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full divide-y divide-slate-100 dark:divide-white/10">
              <thead className="bg-slate-50 dark:bg-white/[0.04]">
                <tr>
                  {['Coordinator', 'Email', 'Phone', 'Department', 'Role', 'Status', 'Permissions', 'Coding Access', 'Last Updated', 'Action'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {filtered.map((coordinator) => (
                  <tr key={coordinator._id} onClick={() => navigate(`/admin/coordinator-access/${coordinator._id}`)} className="cursor-pointer transition hover:bg-sky-50/70 dark:hover:bg-sky-400/10">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sm font-bold text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">{(coordinator.name || '?').charAt(0).toUpperCase()}</div>
                        <div>
                          <div className="font-bold text-slate-950 dark:text-white">{coordinator.name || 'Unnamed'}</div>
                          <div className="text-xs font-semibold text-slate-500">{coordinator.coordinatorId || '-'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{coordinator.email || '-'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{coordinator.phone || '-'}</td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{coordinator.department || '-'}</td>
                    <td className="px-4 py-3 text-sm font-semibold capitalize text-slate-600 dark:text-slate-300">{coordinator.role || 'coordinator'}</td>
                    <td className="px-4 py-3"><Status active={coordinator.isActive !== false} /></td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-950 dark:text-white">{coordinator.permissionCount || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                        hasCodingAccess(coordinator)
                          ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200'
                          : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
                      }`}>
                        {hasCodingAccess(coordinator) ? 'Enabled' : 'Off'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-slate-500">{formatDate(coordinator.lastPermissionUpdatedAt || coordinator.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <button className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        Manage Access
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
