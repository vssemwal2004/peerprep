import { useState, useEffect, useCallback } from 'react';
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Search, RefreshCw, ChevronLeft, ChevronRight, Filter, X, Users } from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';

const actionTypeColors = {
  CREATE: 'text-green-600 dark:text-green-400',
  UPDATE: 'text-blue-600 dark:text-blue-400',
  DELETE: 'text-red-600 dark:text-red-400',
  LOGIN: 'text-purple-600 dark:text-purple-400',
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
        }
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex min-h-screen">
        {/* Left Sidebar - Fixed with independent scroll */}
        <div className="activity-sidebar w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 sticky top-0 h-screen overflow-y-auto" style={{
          scrollbarWidth: 'thin',
          scrollbarColor: '#9ca3af #f3f4f6'
        }}>
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Activity Logs
            </h2>
            
            {/* My Activities - Always Selected */}
            <div className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-purple-600 text-white">
              <Users className="w-5 h-5" />
              <span className="font-medium">My Activities</span>
            </div>
            
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Note:</strong> You can only view your own activity log. Admins have access to view all coordinator activities.
              </p>
            </div>
          </div>
        </div>
        
        {/* Right Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-screen">
          <div className="p-6">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                My Activity Log
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                View and monitor your activities on the platform
              </p>
            </div>

        {/* Top Bar */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
            {/* Search Bar */}
            <form onSubmit={handleSearch} className="flex-1 w-full sm:w-auto">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search activities..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
            </form>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  hasActiveFilters 
                    ? 'bg-purple-600 text-white hover:bg-purple-700' 
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                    Active
                  </span>
                )}
              </button>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
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
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Action Type Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Action Type
                      </label>
                      <select
                        value={filters.actionType}
                        onChange={(e) => handleFilterChange('actionType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
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
                        <option value="PASSWORD_CHANGE">Password Change</option>
                        <option value="SCHEDULE">Schedule</option>
                        <option value="REORDER">Reorder</option>
                      </select>
                    </div>

                    {/* Target Type Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Target Type
                      </label>
                      <select
                        value={filters.targetType}
                        onChange={(e) => handleFilterChange('targetType', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      >
                        <option value="">All Targets</option>
                        <option value="STUDENT">Student</option>
                        <option value="EVENT">Event</option>
                        <option value="SUBJECT">Subject</option>
                        <option value="CHAPTER">Chapter</option>
                        <option value="TOPIC">Topic</option>
                        <option value="SEMESTER">Semester</option>
                        <option value="FEEDBACK">Feedback</option>
                        <option value="PROFILE">Profile</option>
                        <option value="SYSTEM">System</option>
                      </select>
                    </div>

                    {/* Start Date Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={filters.startDate}
                        onChange={(e) => handleFilterChange('startDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>

                    {/* End Date Filter */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={filters.endDate}
                        onChange={(e) => handleFilterChange('endDate', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>

                  {/* Clear Filters Button */}
                  {hasActiveFilters && (
                    <div className="mt-3 flex justify-end">
                      <button
                        onClick={clearFilters}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-white rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
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
            <div className="mt-3 text-sm text-gray-600 dark:text-white">
              Showing {activities.length} of {totalActivities} activities
              {hasActiveFilters && <span className="ml-1 text-purple-600 dark:text-purple-400">(filtered)</span>}
            </div>
          )}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                {searchQuery ? 'No activities found matching your search' : 'No activities recorded yet'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Date & Time
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Email ID
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Target
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">
                        Description
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    <AnimatePresence mode="popLayout">
                      {activities.map((activity, index) => (
                        <motion.tr
                          key={activity._id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ duration: 0.2, delay: index * 0.02 }}
                          className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                        >
                          {/* Date & Time */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {formatDate(activity.createdAt)}
                            </div>
                          </td>

                          {/* Email ID */}
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {activity.userEmail}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                              {activity.userRole}
                            </div>
                          </td>

                          {/* Action */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`text-sm font-medium ${actionTypeColors[activity.actionType] || 'text-gray-600 dark:text-gray-400'}`}>
                              {activity.actionType}
                            </span>
                          </td>

                          {/* Target */}
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900 dark:text-white">
                              {activity.targetType || '-'}
                            </div>
                          </td>

                          {/* Description */}
                          <td className="px-6 py-4">
                            <div className="text-sm text-gray-700 dark:text-gray-300 max-w-md">
                              {activity.description}
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
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    Page {page} of {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="inline-flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="inline-flex items-center gap-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
          </div>
        </div>
      </div>
    </div>
  );
}
