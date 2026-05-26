import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, History, Loader2, RotateCcw, Save, Search, ShieldCheck, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { coordinatorPermissionCategories, coordinatorPermissions, defaultCoordinatorPermissions, normalizePermissions } from './coordinatorPermissions';

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString([], { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative h-6 w-11 rounded-full transition ${checked ? 'bg-sky-600' : 'bg-slate-300 dark:bg-white/20'}`}
      aria-pressed={checked}
    >
      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-gray-900">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-950 dark:text-white">{value}</div>
    </div>
  );
}

export default function CoordinatorAccessDetails() {
  const { coordinatorId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [coordinator, setCoordinator] = useState(null);
  const [selected, setSelected] = useState([]);
  const [initial, setInitial] = useState([]);
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [activePhase, setActivePhase] = useState('all');
  const [accessFilter, setAccessFilter] = useState('all');
  const [showHistory, setShowHistory] = useState(false);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await api.getCoordinatorAccess(coordinatorId);
        if (!mounted) return;
        const permissions = normalizePermissions(data.coordinator?.permissions);
        setCoordinator(data.coordinator);
        setSelected(permissions);
        setInitial(permissions);
        setHistory(data.history || []);
      } catch (err) {
        toast.error(err.message || 'Failed to load coordinator access.');
        navigate('/admin/coordinator-access');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [coordinatorId, navigate, toast]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const dirty = useMemo(() => selected.length !== initial.length || selected.some((permission) => !initial.includes(permission)), [selected, initial]);

  const phaseStats = useMemo(() => coordinatorPermissionCategories.map((category) => {
    const total = category.permissions.length;
    const enabled = category.permissions.filter((permission) => selectedSet.has(permission.key)).length;
    return { ...category, total, enabled };
  }), [selectedSet]);

  const visibleCategories = useMemo(() => {
    const text = query.trim().toLowerCase();
    return coordinatorPermissionCategories
      .filter((category) => activePhase === 'all' || category.id === activePhase)
      .map((category) => ({
        ...category,
        permissions: category.permissions.filter((permission) => {
          const enabled = selectedSet.has(permission.key);
          const matchesFilter = accessFilter === 'all' || (accessFilter === 'enabled' ? enabled : !enabled);
          const matchesText = !text || [permission.name, permission.description, permission.accessType, permission.usage, category.label]
            .some((value) => String(value).toLowerCase().includes(text));
          return matchesFilter && matchesText;
        }),
      }))
      .filter((category) => category.permissions.length);
  }, [activePhase, accessFilter, query, selectedSet]);

  const togglePermission = (key) => {
    setSelected((current) => current.includes(key)
      ? current.filter((permission) => permission !== key)
      : [...current, key]);
  };

  const setCategory = (category, enabled) => {
    const keys = category.permissions.map((permission) => permission.key);
    setSelected((current) => {
      const next = new Set(current);
      keys.forEach((key) => enabled ? next.add(key) : next.delete(key));
      return [...next];
    });
  };

  const save = async (note = 'Manual permission update') => {
    setSaving(true);
    try {
      const data = await api.updateCoordinatorAccess(coordinatorId, { permissions: selected, note });
      const permissions = normalizePermissions(data.coordinator?.permissions);
      setSelected(permissions);
      setInitial(permissions);
      setHistory(data.history || []);
      toast.success('Coordinator permissions updated.');
    } catch (err) {
      toast.error(err.message || 'Failed to save permissions.');
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  const applyCritical = () => {
    if (!confirm) return;
    if (confirm.type === 'select-all') setSelected(defaultCoordinatorPermissions);
    if (confirm.type === 'reset') setSelected(initial);
    if (confirm.type === 'clear') setSelected([]);
    setConfirm(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
        <div className="mx-auto flex min-h-[420px] max-w-7xl items-center justify-center px-4 py-6">
          <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
        </div>
      </div>
    );
  }

  const enabledCount = selected.length;
  const totalCount = coordinatorPermissions.length;
  const accessPercent = Math.round((enabledCount / Math.max(totalCount, 1)) * 100);

  return (
    <div className="min-h-screen bg-slate-50 pt-20 dark:bg-gray-950">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link to="/admin/coordinator-access" className="mb-3 inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-sky-700 dark:text-slate-400">
              <ArrowLeft className="h-4 w-4" />
              Back to Coordinator Access
            </Link>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Coordinator Permission Control
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{coordinator?.name || 'Coordinator Access'}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Admin can enable or restrict each PeerPrep coordinator feature by phase. Default access is all current coordinator-capable admin features.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowHistory(true)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
              <History className="h-4 w-4" />
              History
            </button>
            <button disabled={!dirty || saving} onClick={() => save()} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-white dark:text-slate-950">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save Changes
            </button>
          </div>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Stat label="Coordinator ID" value={coordinator?.coordinatorId || '-'} />
          <Stat label="Status" value={coordinator?.status || (coordinator?.isActive === false ? 'disabled' : 'active')} />
          <Stat label="Enabled Permissions" value={`${enabledCount} / ${totalCount}`} />
          <Stat label="Access Coverage" value={`${accessPercent}%`} />
        </div>

        <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-900">
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-950 dark:text-white">Access Phases</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick one phase to edit. Use All Modules for a full access matrix.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setConfirm({ type: 'select-all', title: 'Select all permissions?', text: 'This enables every current coordinator-capable admin feature.' })} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-gray-950 dark:text-slate-200">Select All</button>
              <button onClick={() => setConfirm({ type: 'reset', title: 'Reset permissions?', text: 'This restores the last saved permission state.' })} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:bg-gray-950 dark:text-slate-200"><RotateCcw className="h-3.5 w-3.5" />Reset</button>
              <button onClick={() => setConfirm({ type: 'clear', title: 'Disable all permissions?', text: 'The coordinator will lose access to all feature routes after save.' })} className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200">Clear</button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <button
              onClick={() => setActivePhase('all')}
              className={`rounded-xl border p-3 text-left transition ${activePhase === 'all' ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 dark:border-white/10 dark:bg-gray-950 dark:text-slate-200'}`}
            >
              <div className="text-sm font-bold">All Modules</div>
              <div className="mt-1 text-xs font-semibold opacity-75">{enabledCount}/{totalCount} enabled</div>
            </button>
            {phaseStats.map((category) => {
              const Icon = category.icon;
              return (
                <button
                  key={category.id}
                  onClick={() => setActivePhase(category.id)}
                  className={`rounded-xl border p-3 text-left transition ${activePhase === category.id ? 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-100' : 'border-slate-200 bg-white text-slate-700 hover:border-sky-200 dark:border-white/10 dark:bg-gray-950 dark:text-slate-200'}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    <span className="truncate text-sm font-bold">{category.shortLabel || category.label}</span>
                  </div>
                  <div className="mt-1 text-xs font-semibold opacity-75">{category.enabled}/{category.total} enabled</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-900 lg:grid-cols-[1fr_180px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search permission name, usage, route, or access type..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-9 text-sm font-semibold text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-gray-950 dark:text-white dark:focus:ring-sky-400/10" />
            {query ? <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="h-4 w-4" /></button> : null}
          </div>
          <select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-gray-950 dark:text-slate-200">
            <option value="all">All access</option>
            <option value="enabled">Enabled only</option>
            <option value="disabled">Disabled only</option>
          </select>
        </section>

        <div className="space-y-5">
          {visibleCategories.length ? visibleCategories.map((category) => {
            const categoryKeys = category.permissions.map((permission) => permission.key);
            const enabledInCategory = category.permissions.filter((permission) => selectedSet.has(permission.key)).length;
            const allEnabled = categoryKeys.length > 0 && enabledInCategory === categoryKeys.length;
            const Icon = category.icon;

            return (
              <section key={category.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-gray-900">
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-slate-950 dark:text-white">{category.label}</h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{category.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-400">{enabledInCategory}/{category.permissions.length} in view</span>
                    <button onClick={() => setCategory(category, !allEnabled)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-sky-200 hover:text-sky-700 dark:border-white/10 dark:text-slate-200">
                      {allEnabled ? 'Disable Phase' : 'Enable Phase'}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[1080px] w-full divide-y divide-slate-100 dark:divide-white/10">
                    <thead className="bg-slate-50 dark:bg-white/[0.04]">
                      <tr>
                        {['Access', 'Feature', 'Access Type', 'Admin Meaning', 'Coordinator Usage', 'Routes'].map((heading) => (
                          <th key={heading} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                      {category.permissions.map((permission) => {
                        const enabled = selectedSet.has(permission.key);
                        return (
                          <tr key={permission.key} className={enabled ? 'bg-sky-50/40 dark:bg-sky-400/5' : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'}>
                            <td className="px-4 py-3">
                              <Toggle checked={enabled} onChange={() => togglePermission(permission.key)} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-bold text-slate-950 dark:text-white">{permission.name}</div>
                              <div className="mt-1 text-[11px] font-semibold text-slate-400">{permission.key}</div>
                            </td>
                            <td className="px-4 py-3">
                              <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:border-white/10 dark:bg-gray-950 dark:text-slate-300">
                                {permission.accessType}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{permission.description}</td>
                            <td className="px-4 py-3 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-400">{permission.usage}</td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                              {permission.routes?.length ? permission.routes.join(', ') : 'Internal'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          }) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-semibold text-slate-500 dark:border-white/10 dark:bg-gray-900">
              No permissions match the selected phase and filter.
            </div>
          )}
        </div>
      </div>

      {confirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">{confirm.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">{confirm.text}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">Cancel</button>
              <button onClick={applyCritical} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"><Check className="h-4 w-4" />Confirm</button>
            </div>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-2xl dark:border-white/10 dark:bg-gray-900">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Permission Update History</h2>
            <button onClick={() => setShowHistory(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
            <table className="min-w-full divide-y divide-slate-100 dark:divide-white/10">
              <thead className="bg-slate-50 dark:bg-white/[0.04]">
                <tr>
                  {['Updated At', 'Changed By', 'Before', 'After'].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                {history.length ? history.map((entry, index) => (
                  <tr key={`${entry.createdAt}-${index}`}>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500">{formatDate(entry.createdAt)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500">{entry.changedByEmail || 'Admin'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">{entry.previousPermissions?.length || 0}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200">{entry.nextPermissions?.length || 0}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No permission changes recorded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
