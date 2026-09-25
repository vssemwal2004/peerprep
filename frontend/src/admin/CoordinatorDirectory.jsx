import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpDown, CheckSquare, Edit2, Eye, Loader2, Lock, Mail, MoreVertical, Search, ShieldCheck, ToggleLeft, ToggleRight, Trash2, UserPlus, Users, X } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const pageSizes = [10, 25, 50, 100];

function formatDate(value) {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusPill({ active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
      active
        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-amber-400'}`} />
      {active ? 'Active' : 'Disabled'}
    </span>
  );
}

function CoordinatorActionMenu({ coordinator, onEdit, onToggle, onView, onAccess, onDelete, onMail }) {
  const generatedId = useId();
  const menuId = `coordinator-actions-${generatedId.replace(/:/g, '')}`;
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const active = coordinator.isActive !== false;
  const action = (callback) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
    callback(coordinator);
  };

  const toggleMenu = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(8, Math.min(window.innerWidth - 216, rect.right - 208)),
        maxHeight: Math.max(160, window.innerHeight - rect.bottom - 16),
      });
    }
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener('mousedown', closeOutside);
    window.addEventListener('resize', closeOnViewportChange);
    window.addEventListener('scroll', closeOnViewportChange, true);
    return () => {
      document.removeEventListener('mousedown', closeOutside);
      window.removeEventListener('resize', closeOnViewportChange);
      window.removeEventListener('scroll', closeOnViewportChange, true);
    };
  }, [open]);

  return (
    <div className="relative">
      <button ref={buttonRef} data-platform-menu-trigger type="button" onClick={toggleMenu} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white" aria-label={`Actions for ${coordinator.name || coordinator.email}`} aria-haspopup="menu" aria-controls={menuId} aria-expanded={open}><MoreVertical className="h-4 w-4" /></button>
      {open && createPortal(
        <div id={menuId} ref={menuRef} data-platform-action-menu data-dropdown-direction="down" role="menu" style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} className="fixed z-[1000] w-52 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <button role="menuitem" type="button" onClick={action(onView)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"><Eye className="h-4 w-4 text-sky-600" />View details</button>
          <button role="menuitem" type="button" onClick={action(onEdit)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"><Edit2 className="h-4 w-4 text-blue-600" />Edit details</button>
          <button role="menuitem" type="button" onClick={action(onAccess)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"><ShieldCheck className="h-4 w-4 text-violet-600" />Manage access</button>
          <button role="menuitem" type="button" onClick={action(onMail)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/30"><Mail className="h-4 w-4" />{coordinator.credentialEmailStatus === 'sent' ? 'Resend credentials' : 'Send credentials'}</button>
          <button role="menuitem" type="button" onClick={action(onToggle)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800">{active ? <ToggleRight className="h-4 w-4 text-amber-600" /> : <ToggleLeft className="h-4 w-4 text-emerald-600" />}{active ? 'Deactivate account' : 'Activate account'}</button>
          <div className="my-1 border-t border-slate-100 dark:border-white/10" />
          <button role="menuitem" type="button" onClick={action(onDelete)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"><Trash2 className="h-4 w-4" />Delete coordinator</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function CoordinatorCard({ coordinator, checked, onCheck, onEdit, onToggle, onView, onAccess, onDelete, onMail }) {
  const active = coordinator.isActive !== false;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-gray-900 lg:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <input type="checkbox" checked={checked} onChange={onCheck} aria-label={`Select ${coordinator.name || coordinator.email}`} className="h-4 w-4 rounded border-slate-300" />
        <button type="button" onClick={() => onView(coordinator)} className="flex min-w-0 items-center gap-3 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sm font-bold text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
            {(coordinator.name || coordinator.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{coordinator.name || 'Unnamed coordinator'}</p>
            <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{coordinator.email}</p>
          </div>
        </button></div>
        <div className="flex items-center gap-2"><StatusPill active={active} /><CoordinatorActionMenu coordinator={coordinator} onView={onView} onEdit={onEdit} onAccess={onAccess} onToggle={onToggle} onDelete={onDelete} onMail={onMail} /></div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
          <div className="text-lg font-bold text-slate-950 dark:text-white">{coordinator.permissionCount || 0}</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Permissions</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-white/[0.04]">
          <div className="truncate text-sm font-bold text-slate-950 dark:text-white">{formatDate(coordinator.lastActive)}</div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Last Active</div>
        </div>
      </div>
    </div>
  );
}

export default function CoordinatorDirectory() {
  const toast = useToast();
  const navigate = useNavigate();
  const [coordinators, setCoordinators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [masterData, setMasterData] = useState([]);
  const [saving, setSaving] = useState(false);
  const [selectedCoordinatorIds, setSelectedCoordinatorIds] = useState(new Set());
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAllCoordinators();
      setCoordinators(data.coordinators || []);
    } catch (err) {
      setError(err.message || 'Failed to load coordinators.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    api.listMasterData({ activeOnly: true })
      .then((data) => setMasterData(data.entries || []))
      .catch(() => setError('Could not load academic master data.'));
  }, []);

  const departmentOptions = useMemo(() => masterData.filter((entry) => entry.category === 'branch'), [masterData]);
  const collegeOptions = useMemo(() => masterData.filter((entry) => entry.category === 'campus'), [masterData]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const list = coordinators.filter((coordinator) => {
      const matchesText = !text || [coordinator.name, coordinator.email, coordinator.phone, coordinator.coordinatorId, coordinator.department, coordinator.college]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text));
      const active = coordinator.isActive !== false;
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? active : !active);
      return matchesText && matchesStatus;
    });

    return list.sort((a, b) => {
      const left = sortBy === 'permissionCount' ? Number(a.permissionCount || 0) : String(a[sortBy] || '').toLowerCase();
      const right = sortBy === 'permissionCount' ? Number(b.permissionCount || 0) : String(b[sortBy] || '').toLowerCase();
      if (left < right) return sortDir === 'asc' ? -1 : 1;
      if (left > right) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [coordinators, query, statusFilter, sortBy, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, sortBy, sortDir, pageSize]);

  const toggleStatus = async (coordinator) => {
    const active = coordinator.isActive !== false;
    if (!confirm(`${active ? 'Disable' : 'Enable'} ${coordinator.name || coordinator.email}?`)) return;
    try {
      const result = await api.updateCoordinatorStatus(coordinator._id, !active);
      setCoordinators((current) => current.map((item) => item._id === coordinator._id ? { ...item, isActive: result.isActive, status: result.status } : item));
      toast.success(`Coordinator ${result.status}.`);
    } catch (err) {
      toast.error(err.message || 'Failed to update coordinator status.');
    }
  };

  const deleteCoordinator = async (coordinator) => {
    if (!confirm(`Permanently delete ${coordinator.name || coordinator.email}? Use this only when the coordinator has no resources that need reassignment.`)) return;
    try {
      await api.deleteCoordinator(coordinator._id);
      setCoordinators((current) => current.filter((item) => item._id !== coordinator._id));
      toast.success('Coordinator deleted.');
    } catch (err) {
      toast.error(err.message || 'Failed to delete coordinator.');
    }
  };

  const sendCoordinatorMail = async (coordinator) => {
    try {
      const result = await api.resendCoordinatorCredentials([coordinator._id]);
      setCoordinators((current) => current.map((item) => item._id === coordinator._id ? { ...item, credentialEmailStatus: 'pending' } : item));
      toast.success(`${result.queued || 0} coordinator credential email queued.`);
    } catch (err) {
      toast.error(err.message || 'Failed to queue coordinator credentials.');
    }
  };

  const sendSelectedCoordinatorMail = async () => {
    const ids = [...selectedCoordinatorIds];
    if (!ids.length) return toast.error('Select at least one coordinator.');
    try {
      const result = await api.resendCoordinatorCredentials(ids);
      setCoordinators((current) => current.map((item) => selectedCoordinatorIds.has(String(item._id)) ? { ...item, credentialEmailStatus: 'pending' } : item));
      setBulkMenuOpen(false);
      toast.success(`${result.queued || 0} coordinator credential email(s) queued.`);
    } catch (err) {
      toast.error(err.message || 'Failed to queue coordinator credentials.');
    }
  };

  const updateSelectedStatus = async (isActive) => {
    const selectedItems = coordinators.filter((item) => selectedCoordinatorIds.has(String(item._id)) && (item.isActive !== false) !== isActive);
    if (!selectedItems.length) return toast.error(`No selected coordinators need to be ${isActive ? 'activated' : 'deactivated'}.`);
    if (!confirm(`${isActive ? 'Activate' : 'Deactivate'} ${selectedItems.length} selected coordinator account(s)?`)) return;
    setBulkWorking(true);
    setBulkMenuOpen(false);
    const results = await Promise.allSettled(selectedItems.map((item) => api.updateCoordinatorStatus(item._id, isActive)));
    const succeeded = new Set(selectedItems.filter((_, index) => results[index].status === 'fulfilled').map((item) => String(item._id)));
    setCoordinators((current) => current.map((item) => succeeded.has(String(item._id)) ? { ...item, isActive, status: isActive ? 'active' : 'disabled' } : item));
    setBulkWorking(false);
    const failed = results.length - succeeded.size;
    if (succeeded.size) toast.success(`${succeeded.size} coordinator account(s) ${isActive ? 'activated' : 'deactivated'}.`);
    if (failed) toast.error(`${failed} coordinator account(s) could not be updated.`);
  };

  const deleteSelectedCoordinators = async () => {
    const selectedItems = coordinators.filter((item) => selectedCoordinatorIds.has(String(item._id)));
    if (!selectedItems.length) return toast.error('Select at least one coordinator.');
    if (!confirm(`Permanently delete ${selectedItems.length} selected coordinator(s)? Coordinators with assigned students or interviews will be kept.`)) return;
    setBulkWorking(true);
    setBulkMenuOpen(false);
    const results = await Promise.allSettled(selectedItems.map((item) => api.deleteCoordinator(item._id)));
    const deletedIds = new Set(selectedItems.filter((_, index) => results[index].status === 'fulfilled').map((item) => String(item._id)));
    setCoordinators((current) => current.filter((item) => !deletedIds.has(String(item._id))));
    setSelectedCoordinatorIds((current) => new Set([...current].filter((id) => !deletedIds.has(id))));
    setBulkWorking(false);
    const failed = results.length - deletedIds.size;
    if (deletedIds.size) toast.success(`${deletedIds.size} coordinator(s) deleted.`);
    if (failed) toast.error(`${failed} coordinator(s) could not be deleted because they still own assigned records.`);
  };

  const startEdit = (coordinator) => {
    setEditing(coordinator);
    setEditForm({
      coordinatorName: coordinator.name || '',
      coordinatorEmail: coordinator.email || '',
      phone: coordinator.phone || '',
      department: coordinator.department || '',
      college: coordinator.college || '',
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.updateCoordinator(editing._id, editForm);
      setCoordinators((current) => current.map((item) => item._id === editing._id ? {
        ...item,
        name: editForm.coordinatorName,
        email: editForm.coordinatorEmail,
        phone: editForm.phone,
        department: editForm.department,
        college: editForm.college,
      } : item));
      setEditing(null);
      toast.success('Coordinator updated.');
    } catch (err) {
      toast.error(err.message || 'Failed to update coordinator.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60 dark:bg-gray-950">
      <div className="mx-auto w-full flex-1 px-3 py-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div data-page-header className="mb-3 flex flex-col gap-3 bg-white py-1 dark:bg-gray-900 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-emerald-100 dark:bg-emerald-900">
                <Users className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 dark:text-white">Coordinator Database</h1>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">{filtered.length.toLocaleString()} {query || statusFilter !== 'all' ? 'matching coordinators' : 'registered coordinators'}</p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[240px] flex-1 xl:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, ID, email, phone..." className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-xs text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200" />
                {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 transition-colors hover:bg-slate-100 dark:hover:bg-gray-600"><X className="h-3 w-3 text-slate-500" /></button> : null}
              </div>
              <select aria-label="Filter coordinator status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <option value="all">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option>
              </select>
              <select aria-label="Sort coordinators by" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <option value="createdAt">Recently added</option><option value="name">Name</option><option value="email">Email</option><option value="permissionCount">Permissions</option><option value="lastActive">Last active</option>
              </select>
              <button type="button" title="Change sort direction" onClick={() => setSortDir((value) => value === 'asc' ? 'desc' : 'asc')} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <ArrowUpDown className="h-3.5 w-3.5" />{sortDir === 'asc' ? 'Ascending' : 'Descending'}
              </button>
              <Link to="/admin/coordinators" className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700">
                <UserPlus className="h-4 w-4" />Add coordinator
              </Link>
            </div>
          </div>

        {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">{error}</div> : null}

        <div className="mb-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-800/70">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setSelectedCoordinatorIds((current) => { const next = new Set(current); const allSelected = pageItems.length > 0 && pageItems.every((item) => next.has(String(item._id))); pageItems.forEach((item) => { const key = String(item._id); if (allSelected) next.delete(key); else next.add(key); }); return next; })} className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
              <CheckSquare className="h-3.5 w-3.5 text-sky-600" />Select page
            </button>
            <span className="text-xs font-medium text-slate-500 dark:text-gray-400">{selectedCoordinatorIds.size ? `${selectedCoordinatorIds.size} selected` : `${pageItems.length} visible on this page`}</span>
            {selectedCoordinatorIds.size > 0 && <button type="button" onClick={() => setSelectedCoordinatorIds(new Set())} className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-gray-400">Clear</button>}
          </div>
          <div className="relative">
            <button type="button" onClick={() => setBulkMenuOpen((open) => !open)} disabled={bulkWorking} aria-label="Coordinator bulk actions" aria-expanded={bulkMenuOpen} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">{bulkWorking ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}</button>
            {bulkMenuOpen && <div data-platform-action-menu className="absolute right-0 top-9 z-50 w-60 rounded-md border border-slate-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900">
              <button type="button" onClick={() => { setSelectedCoordinatorIds(new Set(filtered.map((item) => String(item._id)))); setBulkMenuOpen(false); }} className="w-full px-3 py-2 text-left text-xs font-medium hover:bg-slate-50 dark:hover:bg-gray-800">Select all {filtered.length} filtered</button>
              <button type="button" onClick={sendSelectedCoordinatorMail} disabled={!selectedCoordinatorIds.size} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-300"><Mail className="h-4 w-4" />Send/Resend selected</button>
              <button type="button" onClick={() => updateSelectedStatus(false)} disabled={!selectedCoordinatorIds.size} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-40 dark:text-amber-300"><ToggleRight className="h-4 w-4" />Deactivate selected</button>
              <button type="button" onClick={() => updateSelectedStatus(true)} disabled={!selectedCoordinatorIds.size} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-300"><ToggleLeft className="h-4 w-4" />Activate selected</button>
              <div className="my-1 border-t border-slate-100 dark:border-white/10" />
              <button type="button" onClick={deleteSelectedCoordinators} disabled={!selectedCoordinatorIds.size} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:text-rose-300"><Trash2 className="h-4 w-4" />Delete selected</button>
            </div>}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-gray-900">
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-white/10 dark:bg-gray-900">
            <Users className="mx-auto h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">No coordinators found</h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Adjust the search or create a new coordinator.</p>
          </div>
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {pageItems.map((coordinator) => (
                <CoordinatorCard key={coordinator._id} coordinator={coordinator} checked={selectedCoordinatorIds.has(String(coordinator._id))} onCheck={() => setSelectedCoordinatorIds((current) => { const next = new Set(current); const key = String(coordinator._id); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onView={setSelected} onEdit={startEdit} onToggle={toggleStatus} onDelete={deleteCoordinator} onMail={sendCoordinatorMail} onAccess={(item) => navigate(`/admin/coordinator-access/${item._id}`)} />
              ))}
            </div>

            <div className="hidden overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 dark:border-gray-700 lg:block">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 dark:bg-gray-700">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left"><input type="checkbox" aria-label="Select all coordinators on this page" checked={pageItems.length > 0 && pageItems.every((item) => selectedCoordinatorIds.has(String(item._id)))} onChange={(event) => setSelectedCoordinatorIds((current) => { const next = new Set(current); pageItems.forEach((item) => { const key = String(item._id); if (event.target.checked) next.add(key); else next.delete(key); }); return next; })} className="h-4 w-4 rounded border-slate-300 text-sky-600" /></th>
                    {['Name', 'Email', 'Phone', 'Role', 'Status', 'Permissions', 'Last Active', 'Actions'].map((heading) => (
                      <th key={heading} className={`px-3 py-2 text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300 ${heading === 'Actions' ? 'text-right' : 'text-left'}`}>{heading}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {pageItems.map((coordinator) => {
                    const active = coordinator.isActive !== false;
                    return (
                      <tr key={coordinator._id} className={`${selectedCoordinatorIds.has(String(coordinator._id)) ? 'bg-sky-50/70 dark:bg-sky-950/20' : ''} hover:bg-slate-50 dark:hover:bg-gray-700`}>
                        <td className="px-3 py-1.5"><input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-sky-600" checked={selectedCoordinatorIds.has(String(coordinator._id))} onChange={() => setSelectedCoordinatorIds((current) => { const next = new Set(current); const key = String(coordinator._id); if (next.has(key)) next.delete(key); else next.add(key); return next; })} /></td>
                        <td className="px-3 py-1.5">
                          <button onClick={() => setSelected(coordinator)} className="flex min-w-[190px] items-center gap-2 text-left">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">{(coordinator.name || '?').charAt(0).toUpperCase()}</div>
                            <div className="max-w-[220px] leading-tight">
                              <div className="truncate text-xs font-semibold text-slate-900 hover:text-sky-600 dark:text-white">{coordinator.name || 'Unnamed'}</div>
                              <div className="truncate font-mono text-[10px] font-semibold tabular-nums tracking-wider text-slate-500">ID {coordinator.coordinatorId || '-'}</div>
                            </div>
                          </button>
                        </td>
                        <td className="max-w-[230px] px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300"><span className="block truncate">{coordinator.email || '-'}</span></td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{coordinator.phone || '-'}</td>
                        <td className="px-3 py-1.5 text-xs capitalize text-slate-600 dark:text-gray-300">{coordinator.role || 'coordinator'}</td>
                        <td className="px-3 py-1.5"><StatusPill active={active} /></td>
                        <td className="px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white">{coordinator.permissionCount || 0}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{formatDate(coordinator.lastActive)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <CoordinatorActionMenu coordinator={coordinator} onView={setSelected} onEdit={startEdit} onAccess={(item) => navigate(`/admin/coordinator-access/${item._id}`)} onToggle={toggleStatus} onDelete={deleteCoordinator} onMail={sendCoordinatorMail} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-slate-500 dark:text-gray-400">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filtered.length)} of {filtered.length}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))} className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-medium dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {pageSizes.map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
                <button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">Previous</button>
                <span className="px-2 text-xs font-semibold text-slate-600 dark:text-gray-300">{page} / {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="h-8 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-200">Next</button>
              </div>
            </div>
          </>
        )}

        {selected ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
            <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-950 dark:text-white">{selected.name || 'Coordinator'}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{selected.email}</p>
                </div>
                <button onClick={() => setSelected(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ['Coordinator ID', selected.coordinatorId || '-'],
                  ['Phone', selected.phone || '-'],
                  ['Department', selected.department || '-'],
                  ['College', selected.college || '-'],
                  ['Students Assigned', selected.studentsAssigned ?? 0],
                  ['Events Created', selected.eventsCreated?.total ?? 0],
                  ['Assigned Permissions', selected.permissionCount || 0],
                  ['Last Active', formatDate(selected.lastActive)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]">
                    <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
                    <div className="mt-2 text-sm font-bold text-slate-950 dark:text-white">{value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => navigate(`/admin/coordinator-access/${selected._id}`)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"><ShieldCheck className="h-4 w-4" />Manage Access</button>
              </div>
            </div>
          </div>
        ) : null}

        {editing ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onClick={() => !saving && setEditing(null)}>
            <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-gray-900" onClick={(event) => event.stopPropagation()}>
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-950 dark:text-white">Edit Coordinator</h2>
                <button onClick={() => !saving && setEditing(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ['coordinatorName', 'Name'],
                  ['coordinatorEmail', 'Email'],
                  ['phone', 'Phone'],
                ].map(([key, label]) => (
                  <label key={key} className={key === 'college' ? 'sm:col-span-2' : ''}>
                    <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
                    <input value={editForm[key] || ''} onChange={(event) => setEditForm((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-white/10 dark:bg-gray-950 dark:text-white" />
                  </label>
                ))}
                <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Teacher ID</span><input value={editing.coordinatorId || ''} readOnly inputMode="numeric" className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-sm font-bold tabular-nums tracking-widest text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300" /><span className="mt-1 block text-[11px] text-slate-400">Unique five-digit number generated automatically.</span></label>
                <label><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Department</span><select value={editForm.department || ''} onChange={(event) => setEditForm((current) => ({ ...current, department: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-white/10 dark:bg-gray-950 dark:text-white"><option value="">Select department</option>{departmentOptions.map((entry) => <option key={entry._id} value={entry.name}>{entry.name}</option>)}</select></label>
                <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">College</span><select value={editForm.college || ''} onChange={(event) => setEditForm((current) => ({ ...current, college: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 dark:border-white/10 dark:bg-gray-950 dark:text-white"><option value="">Select college / campus</option>{collegeOptions.map((entry) => <option key={entry._id} value={entry.name}>{entry.name}</option>)}</select></label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setEditing(null)} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 dark:border-white/10 dark:text-slate-200">Cancel</button>
                <button onClick={saveEdit} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-400 dark:bg-white dark:text-slate-950">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </div>
      </div>
    </div>
  );
}
