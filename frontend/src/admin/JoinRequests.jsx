/* eslint-disable no-unused-vars */
import { useEffect, useState, useCallback } from 'react';
import { api } from '../utils/api';
import { AdminNavbar } from '../components/AdminNavbar';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ClipboardList, Search, Filter, RefreshCw, CheckCircle, XCircle, Clock,
  User, Mail, Building2, BookOpen, GitBranch, GraduationCap, UserPlus,
  ChevronDown, X, Loader2, AlertCircle, Users, Hash
} from 'lucide-react';

// Status badge component
const StatusBadge = ({ status }) => {
  const config = {
    pending: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', icon: Clock, label: 'Pending' },
    approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircle, label: 'Approved' },
    rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: XCircle, label: 'Rejected' },
  };
  const c = config[status] || config.pending;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <Icon className="w-3 h-3" />
      {c.label}
    </span>
  );
};

// Mobile card component
const RequestCard = ({ request, onApprove, onReject }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 space-y-3"
  >
    <div className="flex items-start justify-between">
      <div>
        <h3 className="font-semibold text-slate-900 dark:text-white text-sm">{request.name}</h3>
        <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">{request.email}</p>
      </div>
      <StatusBadge status={request.status} />
    </div>

    <div className="grid grid-cols-2 gap-2 text-xs">
      <div className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300">
        <Building2 className="w-3 h-3 text-indigo-500" />
        <span className="truncate">{request.university}</span>
      </div>
      <div className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300">
        <BookOpen className="w-3 h-3 text-sky-500" />
        <span className="truncate">{request.course}</span>
      </div>
      <div className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300">
        <GitBranch className="w-3 h-3 text-emerald-500" />
        <span className="truncate">{request.branch}</span>
      </div>
      <div className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300">
        <GraduationCap className="w-3 h-3 text-amber-500" />
        <span>Sem {request.semester}</span>
      </div>
      {request.studentId && (
        <div className="flex items-center gap-1.5 text-slate-600 dark:text-gray-300">
          <Hash className="w-3 h-3 text-purple-500" />
          <span className="font-medium">{request.studentId}</span>
        </div>
      )}
    </div>

    <div className="text-xs text-slate-400 dark:text-gray-500">
      {new Date(request.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    </div>

    {request.status === 'pending' && (
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onApprove(request)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Add Student
        </button>
        <button
          onClick={() => onReject(request)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-700/50"
        >
          <XCircle className="w-3.5 h-3.5" />
          Reject
        </button>
      </div>
    )}

    {request.status === 'approved' && request.studentId && (
      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2 text-xs text-green-700 dark:text-green-300 border border-green-200 dark:border-green-700/50">
        Student ID: <span className="font-bold">{request.studentId}</span>
        {request.teacherId && <> · Coordinator: <span className="font-bold">{request.teacherId}</span></>}
      </div>
    )}

    {request.status === 'rejected' && request.rejectionReason && (
      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700/50">
        Reason: {request.rejectionReason}
      </div>
    )}
  </motion.div>
);

// Approve Modal
const ApproveModal = ({ request, onClose, onConfirm, loading }) => {
  const [teacherId, setTeacherId] = useState('');
  const [group, setGroup] = useState('');
  const [studentId, setStudentId] = useState(request.studentId || '');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!teacherId.trim()) {
      setError('Coordinator (Teacher ID) is required');
      return;
    }
    onConfirm({ teacherId: teacherId.trim(), group: group.trim() || undefined, studentId: studentId.trim() || undefined });
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden"
      >
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-gray-700 dark:to-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-green-600 dark:text-green-400" />
            Approve & Add Student
          </h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Create account for {request.name}</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Student info summary */}
          <div className="bg-sky-50 dark:bg-sky-900/20 rounded-xl p-3 space-y-1.5 border border-sky-200 dark:border-sky-700/50">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-gray-400">Name</span>
              <span className="font-semibold text-slate-900 dark:text-gray-100">{request.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-gray-400">Email</span>
              <span className="font-semibold text-slate-900 dark:text-gray-100">{request.email}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-gray-400">University</span>
              <span className="font-semibold text-slate-900 dark:text-gray-100">{request.university}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500 dark:text-gray-400">Semester</span>
              <span className="font-semibold text-slate-900 dark:text-gray-100">{request.semester}</span>
            </div>
          </div>

          {/* Coordinator ID (required) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-1">
              Coordinator Code <span className="text-red-500">*</span>
            </label>
            <input
              value={teacherId}
              onChange={e => { setTeacherId(e.target.value); setError(''); }}
              placeholder="e.g., COORD001"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-gray-500">Coordinator ID to assign the student to</p>
          </div>

          {/* Student ID (optional) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-1">
              Student ID <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              placeholder="Auto-generated if empty"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          {/* Group (optional) */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-1">
              Group <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              value={group}
              onChange={e => setGroup(e.target.value)}
              placeholder="e.g., A, B, C"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-700/50">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-xl font-semibold text-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            {loading ? 'Creating...' : 'Add Student'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// Reject Modal
const RejectModal = ({ request, onClose, onConfirm, loading }) => {
  const [reason, setReason] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden"
      >
        <div className="bg-gradient-to-r from-red-50 to-orange-50 dark:from-gray-700 dark:to-gray-700 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            Reject Request
          </h3>
          <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Reject {request.name}'s join request</p>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-gray-300 mb-1">
              Reason <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a reason for rejection..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm resize-none"
            />
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white dark:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-xl font-semibold text-sm border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-semibold text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
            {loading ? 'Rejecting...' : 'Reject Request'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default function JoinRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [approveModal, setApproveModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [total, setTotal] = useState(0);

  const fetchRequests = useCallback(async (showRefresh = false) => {
    try {
      if (showRefresh) setRefreshing(true); else setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const res = await api.listJoinRequests(params.toString());
      setRequests(res.requests || []);
      setTotal(res.total || 0);
    } catch (err) {
      showToast('Failed to load join requests', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleApprove = async (data) => {
    if (!approveModal) return;
    setActionLoading(true);
    try {
      const res = await api.approveJoinRequest(approveModal._id, data);
      showToast(`Student ${approveModal.name} approved successfully!`);
      setApproveModal(null);
      fetchRequests(true);
    } catch (err) {
      showToast(err.message || 'Failed to approve request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason) => {
    if (!rejectModal) return;
    setActionLoading(true);
    try {
      await api.rejectJoinRequest(rejectModal._id, reason);
      showToast(`Request from ${rejectModal.name} rejected`);
      setRejectModal(null);
      fetchRequests(true);
    } catch (err) {
      showToast(err.message || 'Failed to reject request', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const statusTabs = [
    { value: 'pending', label: 'Pending', icon: Clock, color: 'amber' },
    { value: 'approved', label: 'Approved', icon: CheckCircle, color: 'green' },
    { value: 'rejected', label: 'Rejected', icon: XCircle, color: 'red' },
    { value: '', label: 'All', icon: ClipboardList, color: 'sky' },
  ];

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminNavbar />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
            className={`fixed top-20 right-4 z-[80] px-4 py-3 rounded-xl shadow-xl border text-sm font-medium flex items-center gap-2 ${
              toast.type === 'error'
                ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/50 text-red-700 dark:text-red-300'
                : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700/50 text-green-700 dark:text-green-300'
            }`}
          >
            {toast.type === 'error' ? <AlertCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals */}
      <AnimatePresence>
        {approveModal && (
          <ApproveModal
            request={approveModal}
            onClose={() => setApproveModal(null)}
            onConfirm={handleApprove}
            loading={actionLoading}
          />
        )}
        {rejectModal && (
          <RejectModal
            request={rejectModal}
            onClose={() => setRejectModal(null)}
            onConfirm={handleReject}
            loading={actionLoading}
          />
        )}
      </AnimatePresence>

      <div className="pt-16 sm:pt-20 px-3 sm:px-6 lg:px-8 max-w-7xl mx-auto pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                Join Requests
              </h1>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                {total} total
              </p>
            </div>
            <button
              onClick={() => fetchRequests(true)}
              disabled={refreshing}
              className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200 rounded-lg font-semibold text-xs border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 mb-4 shadow-sm"
        >
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Status tabs */}
            <div className="flex gap-0.5 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5 flex-wrap">
              {statusTabs.map(tab => {
                const Icon = tab.icon;
                const isActive = statusFilter === tab.value;
                return (
                  <button
                    key={tab.value}
                    onClick={() => setStatusFilter(tab.value)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-white dark:bg-gray-600 text-slate-900 dark:text-gray-100 shadow-sm'
                        : 'text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by name, email, university..."
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-slate-900 dark:text-gray-100 placeholder-slate-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-sky-500 text-xs"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
          >
            <ClipboardList className="w-12 h-12 text-slate-300 dark:text-gray-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-600 dark:text-gray-400">No Requests Found</h3>
            <p className="text-sm text-slate-400 dark:text-gray-500 mt-1">
              {statusFilter ? `No ${statusFilter} requests` : 'No join requests yet'}
            </p>
          </motion.div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="block lg:hidden space-y-3">
              {requests.map(req => (
                <RequestCard
                  key={req._id}
                  request={req}
                  onApprove={() => setApproveModal(req)}
                  onReject={() => setRejectModal(req)}
                />
              ))}
            </div>

            {/* Desktop Table */}
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="hidden lg:block bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm"
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">University</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Course / Branch</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Sem</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Student ID</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {requests.map((req, i) => (
                      <motion.tr
                        key={req._id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {req.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 dark:text-gray-100 truncate">{req.name}</p>
                              <p className="text-xs text-slate-500 dark:text-gray-400 truncate">{req.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-gray-300 max-w-[180px] truncate">{req.university}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-700 dark:text-gray-300">{req.course}</p>
                          <p className="text-xs text-slate-400 dark:text-gray-500">{req.branch}</p>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700 dark:text-gray-300">{req.semester}</td>
                        <td className="px-4 py-3 text-sm text-slate-700 dark:text-gray-300">
                          {req.studentId ? (
                            <span className="font-mono font-medium">{req.studentId}</span>
                          ) : (
                            <span className="text-slate-400 dark:text-gray-500 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center"><StatusBadge status={req.status} /></td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-gray-400 whitespace-nowrap">
                          {new Date(req.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {req.status === 'pending' ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => setApproveModal(req)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors"
                              >
                                <UserPlus className="w-3 h-3" />
                                Add
                              </button>
                              <button
                                onClick={() => setRejectModal(req)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-700/50"
                              >
                                <XCircle className="w-3 h-3" />
                                Reject
                              </button>
                            </div>
                          ) : req.status === 'approved' && req.studentId ? (
                            <span className="text-xs text-green-600 dark:text-green-400 font-medium">ID: {req.studentId}</span>
                          ) : req.status === 'rejected' ? (
                            <span className="text-xs text-red-500 dark:text-red-400">—</span>
                          ) : null}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
