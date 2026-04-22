import { useState, useEffect, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Search, RefreshCw, ChevronLeft, ChevronRight, Filter, X, Activity } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const actionTypeColors = {
  CREATE: 'text-green-600 dark:text-green-400',
  UPDATE: 'text-blue-600 dark:text-blue-400',
  DELETE: 'text-red-600 dark:text-red-400',
  LOGIN: 'text-sky-600 dark:text-sky-400',
  LOGOUT: 'text-gray-600 dark:text-gray-400',
  PASSWORD_CHANGE: 'text-yellow-600 dark:text-yellow-400',
  EXPORT: 'text-sky-600 dark:text-sky-400',
  UPLOAD: 'text-indigo-600 dark:text-indigo-400',
  DOWNLOAD: 'text-cyan-600 dark:text-cyan-400',
  SCHEDULE: 'text-orange-600 dark:text-orange-400',
  BULK_CREATE: 'text-emerald-600 dark:text-emerald-400',
  BULK_UPDATE: 'text-teal-600 dark:text-teal-400',
  BULK_DELETE: 'text-rose-600 dark:text-rose-400',
  REORDER: 'text-violet-600 dark:text-violet-400'
};

export default function CoordinatorActivity() {
  const toast = useToast();
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalActivities, setTotalActivities] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    actionType: '',
    targetType: '',
    startDate: '',
    endDate: ''
  });

  const loadActivities = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20'
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }
      
      if (filters.actionType) {
        params.append('actionType', filters.actionType);
      }
      
      if (filters.targetType) {
        params.append('targetType', filters.targetType);
      }
      
      if (filters.startDate) {
        params.append('startDate', filters.startDate);
      }
      
      if (filters.endDate) {
        params.append('endDate', filters.endDate);
      }

      const response = await api.getActivities(params.toString());
      setActivities(response.activities);
      setTotalPages(response.pagination.pages);
      setTotalActivities(response.pagination.total);
    } catch (error) {
      console.error('Failed to load activities:', error);
      toast.error('Failed to load activity log');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, searchQuery, filters, toast]);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  const handleRefresh = () => {
    loadActivities(true);
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearchQuery(searchInput);
    setPage(1);
  };
  
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  };
  
  const clearFilters = () => {
    setFilters({
      actionType: '',
      targetType: '',
      startDate: '',
      endDate: ''
    });
    setPage(1);
  };
  
  const hasActiveFilters = filters.actionType || filters.targetType || filters.startDate || filters.endDate;

  const handleExport = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/activity/export?${params}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `coordinator-activity-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Activity log exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export activity log');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = date.toDateString() === today.toDateString();
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    if (isToday) {
      return `Today, ${time}`;
    } else if (isYesterday) {
      return `Yesterday, ${time}`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    }
  };

  const formatChangeLines = (changes) => {
    if (!changes || typeof changes !== 'object') return [];
    const lines = [];
    for (const [key, value] of Object.entries(changes)) {
      if (!value || typeof value !== 'object') continue;
      const hasFrom = Object.prototype.hasOwnProperty.call(value, 'from');
      const hasTo = Object.prototype.hasOwnProperty.call(value, 'to');
      if (!hasFrom && !hasTo) continue;

      const toDisplay = (v) => {
        if (v === null || v === undefined) return '—';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') return String(v);
        if (typeof v === 'string') return v.length > 48 ? `${v.slice(0, 45)}…` : v;
        try {
          const s = JSON.stringify(v);
          return s.length > 48 ? `${s.slice(0, 45)}…` : s;
        } catch {
          return String(v);
        }
      };

      const from = hasFrom ? value.from : undefined;
      const to = hasTo ? value.to : undefined;
      lines.push(`${key}: ${toDisplay(from)} → ${toDisplay(to)}`);
    }
    return lines;
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20">
      <div className="px-4 py-5 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-gray-500">Coordinator Module</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-gray-100">Activity Log</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-500 dark:text-gray-400">
                Track and monitor all your activities across the platform — assessments, library, compiler, announcements, and more.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 dark:border-sky-800 dark:bg-sky-900/20">
                <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">{totalActivities} Total</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Bar */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search activities..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                />
              </div>
            </form>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl transition-colors ${
                  hasActiveFilters 
                    ? 'bg-sky-600 text-white hover:bg-sky-700' 
                    : 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-100 hover:bg-slate-200 dark:hover:bg-gray-800/80'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="bg-white dark:bg-gray-900 text-sky-600 dark:text-sky-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-100 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-800/80 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">{exporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Action Type Filter */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        Action Type
                      </label>
                      <select
                        value={filters.actionType}
                        onChange={(e) => handleFilterChange('actionType', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                      >
                        <option value="">All Actions</option>
                        <option value="CREATE">Create</option>
                        <option value="UPDATE">Update</option>
                        <option value="DELETE">Delete</option>
                        <option value="BULK_CREATE">Bulk Create</option>
                        <option value="BULK_UPDATE">Bulk Update</option>
                        <option value="BULK_DELETE">Bulk Delete</option>
                        <option value="UPLOAD">Upload</option>
                        <option value="DOWNLOAD">Download</option>
                        <option value="EXPORT">Export</option>
                        <option value="LOGIN">Login</option>
                        <option value="LOGOUT">Logout</option>
                        <option value="PASSWORD_CHANGE">Password Change</option>
                        <option value="SCHEDULE">Schedule</option>
                        <option value="REORDER">Reorder</option>
                      </select>
                    </div>

                    {/* Target Type Filter */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        Target Type
                      </label>
                      <select
                        value={filters.targetType}
                        onChange={(e) => handleFilterChange('targetType', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                      >
                        <option value="">All Targets</option>
                        <option value="STUDENT">Student</option>
                        <option value="EVENT">Event</option>
                        <option value="SUBJECT">Subject</option>
                        <option value="CHAPTER">Chapter</option>
                        <option value="TOPIC">Topic</option>
                        <option value="SEMESTER">Semester</option>
                        <option value="ANNOUNCEMENT">Announcement</option>
                        <option value="ASSESSMENT">Assessment</option>
                        <option value="ASSESSMENT_RULE">Assessment Rule</option>
                        <option value="QUESTION_LIBRARY">Question Library</option>
                        <option value="COMPILER_PROBLEM">Compiler Problem</option>
                        <option value="COMPANY_BENCHMARK">Company Benchmark</option>
                        <option value="FEEDBACK">Feedback</option>
                        <option value="PROFILE">Profile</option>
                        <option value="SYSTEM">System</option>
                      </select>
                    </div>

                    {/* Start Date Filter */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => handleFilterChange('startDate', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                      />
                    </div>

                    {/* End Date Filter */}
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => handleFilterChange('endDate', e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition-colors focus:border-sky-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-sky-500 dark:focus:bg-gray-900"
                      />
                    </div>
                  </div>

                  {/* Clear Filters Button */}
                  {hasActiveFilters && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-100 rounded-xl hover:bg-slate-200 dark:hover:bg-gray-800/80 transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Clear Filters
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results Info */}
          {!loading && (
            <div className="mt-3 text-sm text-slate-600 dark:text-gray-400">
              Showing {activities.length} of {totalActivities} activities
              {hasActiveFilters && <span className="ml-1 text-sky-600 dark:text-sky-400">(filtered)</span>}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-20">
              <Activity className="mx-auto h-12 w-12 text-slate-300 dark:text-gray-600 mb-4" />
              <p className="text-slate-500 dark:text-gray-400 text-lg font-medium">
                {searchQuery ? 'No activities found matching your search' : 'No activities recorded yet'}
              </p>
              <p className="mt-1 text-sm text-slate-400 dark:text-gray-500">Your platform activities will appear here.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm dark:divide-gray-700">
                  <thead className="bg-slate-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Date & Time</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Email ID</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Action</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Target</th>
                      <th className="px-4 py-3 text-left font-semibold text-slate-500 dark:text-gray-400">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                    <AnimatePresence mode="popLayout">
                      {activities.map((activity, index) => (
                        <motion.tr
                          key={activity._id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.2, delay: index * 0.02 }}
                          className="hover:bg-slate-50 dark:hover:bg-gray-800/60 transition-colors"
                        >
                          {/* Date & Time */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm font-medium text-slate-800 dark:text-gray-100">
                              {formatDate(activity.createdAt)}
                            </div>
                          </td>

                          {/* Email ID */}
                          <td className="px-4 py-4">
                            <div className="text-sm text-slate-800 dark:text-gray-100">
                              {activity.userEmail}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-gray-400 capitalize">
                              {activity.userRole}
                            </div>
                          </td>

                          {/* Action */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${actionTypeColors[activity.actionType] || 'text-slate-600 dark:text-gray-400'}`}>
                              {activity.actionType}
                            </span>
                          </td>

                          {/* Target */}
                          <td className="px-4 py-4 whitespace-nowrap">
                            <div className="text-sm text-slate-800 dark:text-gray-100">
                              {activity.targetType || '-'}
                            </div>
                            {activity.targetId && (
                              <div className="text-xs text-slate-500 dark:text-gray-400 truncate max-w-[120px]">
                                {activity.targetId}
                              </div>
                            )}
                          </td>

                          {/* Description */}
                          <td className="px-4 py-4">
                            <div className="text-sm text-slate-700 dark:text-gray-200 max-w-md">
                              <div>{activity.description}</div>
                              {(() => {
                                const lines = formatChangeLines(activity.changes);
                                if (!lines.length) return null;
                                const shown = lines.slice(0, 3);
                                const remaining = lines.length - shown.length;
                                return (
                                  <div className="mt-1 space-y-0.5 text-xs text-slate-500 dark:text-gray-400">
                                    {shown.map((l) => (
                                      <div key={l} className="truncate">{l}</div>
                                    ))}
                                    {remaining > 0 && (
                                      <div className="text-slate-400 dark:text-gray-500">+{remaining} more changes</div>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/50 text-sm text-slate-500 dark:text-gray-400">
                  <p>Page {page} of {totalPages}</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
                    >
                      <ChevronLeft className="w-4 h-4 inline" /> Previous
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700"
                    >
                      Next <ChevronRight className="w-4 h-4 inline" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
