import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertTriangle, BarChart3, BriefcaseBusiness, CalendarDays, CheckCircle2, Code2, Loader2, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { api } from '../utils/api';
import { defaultCoordinatorPermissions } from './coordinatorPermissions';

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusPill({ active }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
      active
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200'
        : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200'
    }`}>
      {active ? 'Active' : 'Disabled'}
    </span>
  );
}

function Metric({ label, value, helper, Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{helper}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function hasCodingAccess(coordinator) {
  const permissions = Array.isArray(coordinator.permissions) ? coordinator.permissions : defaultCoordinatorPermissions;
  return permissions.some((permission) => permission.startsWith('coordinator.compiler.'));
}

function getPermissionCount(coordinator) {
  if (typeof coordinator.permissionCount === 'number') return coordinator.permissionCount;
  const permissions = Array.isArray(coordinator.permissions) ? coordinator.permissions : defaultCoordinatorPermissions;
  return permissions.length;
}

function getDaysSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86400000));
}

function getCoordinatorSignal(coordinator) {
  const totalPermissions = coordinator.totalPermissionCount || defaultCoordinatorPermissions.length;
  const permissionCount = getPermissionCount(coordinator);
  const students = coordinator.studentsAssigned ?? 0;
  const events = coordinator.eventsCreated?.total ?? 0;
  const inactiveDays = getDaysSince(coordinator.lastActive || coordinator.updatedAt);

  if (coordinator.isActive === false) {
    return {
      label: 'Disabled',
      tone: 'rose',
      reason: 'Account is disabled',
      action: 'Enable or keep blocked',
    };
  }

  if (permissionCount < Math.ceil(totalPermissions * 0.45)) {
    return {
      label: 'Access Review',
      tone: 'amber',
      reason: 'Low permission access',
      action: 'Review permissions',
    };
  }

  if (inactiveDays !== null && inactiveDays > 14) {
    return {
      label: 'Inactive',
      tone: 'amber',
      reason: `${inactiveDays} days since activity`,
      action: 'Follow up',
    };
  }

  if (students === 0 && events === 0) {
    return {
      label: 'No Workload',
      tone: 'slate',
      reason: 'No students or events assigned',
      action: 'Assign work',
    };
  }

  return {
    label: 'Ready',
    tone: 'emerald',
    reason: 'Access and workload look healthy',
    action: 'Monitor',
  };
}

function SignalPill({ signal }) {
  const styles = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
    rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200',
    slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300',
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${styles[signal.tone] || styles.slate}`}>
      {signal.label}
    </span>
  );
}

export default function CoordinatorOverview() {
  const [coordinators, setCoordinators] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const model = useMemo(() => {
    const active = coordinators.filter((item) => item.isActive !== false);
    const disabled = coordinators.filter((item) => item.isActive === false);
    const codingEnabled = coordinators.filter(hasCodingAccess);
    const recentlyAdded = [...coordinators].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 6);

    const readinessRows = coordinators.map((coordinator) => {
      const students = coordinator.studentsAssigned ?? 0;
      const events = coordinator.eventsCreated?.total ?? 0;
      const permissionCount = getPermissionCount(coordinator);
      const totalPermissions = coordinator.totalPermissionCount || defaultCoordinatorPermissions.length;
      const workloadScore = students + events;
      const signal = getCoordinatorSignal(coordinator);

      return {
        ...coordinator,
        students,
        events,
        permissionCount,
        totalPermissions,
        workloadScore,
        signal,
      };
    }).sort((a, b) => {
      const priority = { rose: 0, amber: 1, slate: 2, emerald: 3 };
      return (priority[a.signal.tone] ?? 9) - (priority[b.signal.tone] ?? 9) || b.workloadScore - a.workloadScore;
    });

    const needsReview = readinessRows.filter((item) => ['rose', 'amber'].includes(item.signal.tone));
    const noWorkload = readinessRows.filter((item) => item.signal.label === 'No Workload');
    const highWorkload = readinessRows.filter((item) => item.workloadScore >= 8 && item.isActive !== false);
    const ready = readinessRows.filter((item) => item.signal.label === 'Ready');

    return { active, disabled, codingEnabled, recentlyAdded, readinessRows, needsReview, noWorkload, highWorkload, ready };
  }, [coordinators]);

  return (
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
              <BarChart3 className="h-3.5 w-3.5" />
              Coordinator Control
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Coordinator Overview</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              A clean operational view of coordinator readiness, workload, coding access, and access actions.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/admin/coordinators" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
              <UserPlus className="h-4 w-4" />
              Add Coordinator
            </Link>
            <Link to="/admin/coordinator-access" className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950">
              <ShieldCheck className="h-4 w-4" />
              Manage Access
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-gray-900">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Metric label="Total Coordinators" value={coordinators.length} helper="All coordinator accounts" Icon={Users} />
              <Metric label="Active" value={model.active.length} helper={`${model.disabled.length} disabled`} Icon={ShieldCheck} />
              <Metric label="Coding Access" value={model.codingEnabled.length} helper="Compiler module enabled" Icon={Code2} />
              <Metric label="Recently Added" value={model.recentlyAdded.length} helper="Latest coordinator accounts" Icon={CalendarDays} />
            </div>

            <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
                <h2 className="text-base font-bold text-slate-950 dark:text-white">Coordinator Operations Table</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Individual coordinator status, load, access count, coding access, and last activity.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-[980px] w-full divide-y divide-slate-100 dark:divide-white/10">
                  <thead className="bg-slate-50 dark:bg-white/[0.04]">
                    <tr>
                      {['Coordinator', 'Email', 'Status', 'Students', 'Events', 'Permissions', 'Coding Access', 'Last Active', 'Action'].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {coordinators.map((coordinator) => (
                      <tr key={coordinator._id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-950 dark:text-white">{coordinator.name || 'Unnamed coordinator'}</div>
                          <div className="text-xs font-semibold text-slate-500">{coordinator.coordinatorId || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-slate-600 dark:text-slate-300">{coordinator.email || '-'}</td>
                        <td className="px-4 py-3"><StatusPill active={coordinator.isActive !== false} /></td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-950 dark:text-white">{coordinator.studentsAssigned ?? 0}</td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-950 dark:text-white">{coordinator.eventsCreated?.total ?? 0}</td>
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
                        <td className="px-4 py-3 text-sm font-semibold text-slate-500">{formatDate(coordinator.lastActive || coordinator.updatedAt)}</td>
                        <td className="px-4 py-3">
                          <Link to={`/admin/coordinator-access/${coordinator._id}`} className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:text-slate-200">
                            Access
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900">
              <div className="border-b border-slate-100 px-5 py-4 dark:border-white/10">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-950 dark:text-white">Coordinator Readiness & Workload</h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Smart action queue based on account status, permissions, assigned students, events, coding access, and last activity.</p>
                  </div>
                  <Link to="/admin/coordinator-access" className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
                    <ShieldCheck className="h-4 w-4" />
                    Open Access Matrix
                  </Link>
                </div>
              </div>

              <div className="grid gap-3 border-b border-slate-100 p-4 dark:border-white/10 md:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Need Review', value: model.needsReview.length, helper: 'Disabled, inactive, or limited access', Icon: AlertTriangle, tone: 'amber' },
                  { label: 'Ready to Operate', value: model.ready.length, helper: 'Healthy access and active workload', Icon: CheckCircle2, tone: 'emerald' },
                  { label: 'No Workload', value: model.noWorkload.length, helper: 'No students or events assigned', Icon: BriefcaseBusiness, tone: 'slate' },
                  { label: 'High Workload', value: model.highWorkload.length, helper: '8+ combined students/events', Icon: Activity, tone: 'sky' },
                ].map(({ label, value, helper, Icon, tone }) => {
                  const toneClass = {
                    amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200',
                    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200',
                    slate: 'border-slate-200 bg-slate-50 text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300',
                    sky: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200',
                  }[tone];

                  return (
                    <div key={label} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
                          <p className="mt-2 text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{helper}</p>
                        </div>
                        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${toneClass}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-[1040px] w-full divide-y divide-slate-100 dark:divide-white/10">
                  <thead className="bg-slate-50 dark:bg-white/[0.04]">
                    <tr>
                      {['Priority', 'Coordinator', 'Access Readiness', 'Workload', 'Coding', 'Last Active', 'Status', 'Recommended Action', 'Manage'].map((heading) => (
                        <th key={heading} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{heading}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                    {model.readinessRows.map((coordinator, index) => {
                      const accessPercent = coordinator.totalPermissions ? Math.round((coordinator.permissionCount / coordinator.totalPermissions) * 100) : 0;
                      return (
                        <tr key={coordinator._id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                          <td className="px-4 py-3 text-sm font-bold text-slate-500">#{index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-950 dark:text-white">{coordinator.name || 'Unnamed coordinator'}</div>
                            <div className="text-xs font-semibold text-slate-500">{coordinator.email || coordinator.coordinatorId || '-'}</div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex min-w-[190px] items-center gap-3">
                              <div className="h-2 w-24 rounded-full bg-slate-100 dark:bg-white/10">
                                <div className={`h-2 rounded-full ${accessPercent < 45 ? 'bg-amber-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(accessPercent, 100)}%` }} />
                              </div>
                              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{coordinator.permissionCount}/{coordinator.totalPermissions}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-bold text-slate-950 dark:text-white">{coordinator.students} students</div>
                            <div className="text-xs font-semibold text-slate-500">{coordinator.events} events</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                              hasCodingAccess(coordinator)
                                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200'
                                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300'
                            }`}>
                              {hasCodingAccess(coordinator) ? 'Enabled' : 'Off'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-slate-500">{formatDate(coordinator.lastActive || coordinator.updatedAt)}</td>
                          <td className="px-4 py-3">
                            <SignalPill signal={coordinator.signal} />
                            <div className="mt-1 text-xs font-semibold text-slate-500">{coordinator.signal.reason}</div>
                          </td>
                          <td className="px-4 py-3 text-sm font-bold text-slate-700 dark:text-slate-200">{coordinator.signal.action}</td>
                          <td className="px-4 py-3">
                            <Link to={`/admin/coordinator-access/${coordinator._id}`} className="inline-flex items-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:text-slate-200">
                              Access
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
