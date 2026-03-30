/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo } from "react";
import { api } from "../utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, Loader2, X, Trash2, Edit2, Save } from "lucide-react";
import Fuse from "fuse.js";
import ContributionCalendar from "../components/ContributionCalendar";
import { useToast } from "../components/CustomToast";

export default function CoordinatorDirectory() {
  const toast = useToast();
  const [coordinators, setCoordinators] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCoordinator, setSelectedCoordinator] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activity, setActivity] = useState({});
  const [editingCoordinator, setEditingCoordinator] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const fuse = useMemo(() => {
    return new Fuse(coordinators, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'coordinatorId', weight: 2 },
        { name: 'email', weight: 1.5 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      getFn: (obj, path) => {
        const value = Fuse.config.getFn(obj, path);
        if (typeof value === 'string') {
          return value.toLowerCase().replace(/[.\s-]/g, '');
        }
        return value;
      }
    });
  }, [coordinators]);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFiltered(coordinators);
    } else {
      const normalizedQuery = searchQuery.toLowerCase().replace(/[.\s-]/g, '');
      const results = fuse.search(normalizedQuery);
      setFiltered(results.map(r => r.item));
    }
    setCurrentPage(1); // Reset to first page on search
  }, [searchQuery, coordinators, fuse]);

  // Calculate pagination
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCoordinators = filtered.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await api.listAllCoordinators();
      const list = data.coordinators || [];
      setCoordinators(list);
      setFiltered(list);
    } catch (err) {
      setError(err.message || "Failed to load coordinators");
    } finally {
      setIsLoading(false);
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setFiltered(coordinators);
  };

  const openCoordinatorProfile = (coordinator) => {
    setSelectedCoordinator(coordinator);
    setShowModal(true);
    
    // Generate placeholder activity data
    const map = {};
    const today = new Date();
    for (let i = 0; i < 180; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const v = Math.random() < 0.25 ? Math.floor(Math.random() * 6) : 0;
      if (v) map[key] = v;
    }
    setActivity(map);
  };

  const closeModal = () => {
    setShowModal(false);
    setTimeout(() => {
      setSelectedCoordinator(null);
      setActivity({});
    }, 300);
  };

  // Edit Coordinator Modal actions
  const handleChangeEdit = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleDeleteCoordinator = async (coord, e) => {
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete coordinator ${coord.name || coord.email}? This action cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteCoordinator(coord._id);
      setCoordinators(prev => prev.filter(c => c._id !== coord._id));
      setFiltered(prev => prev.filter(c => c._id !== coord._id));
      toast.success(`Coordinator ${coord.name || coord.email} deleted successfully.`);
    } catch (err) {
      toast.error(err.message || 'Failed to delete coordinator');
    }
  };

  const handleEditCoordinator = (coord, e) => {
    e.stopPropagation();
    setEditingCoordinator(coord);
    setEditForm({
      coordinatorName: coord.name || '',
      coordinatorEmail: coord.email || '',
      coordinatorID: coord.coordinatorId || '',
    });
  };

  const handleUpdateCoordinator = async () => {
    if (!editingCoordinator) return;

    setIsSaving(true);
    try {
      await api.updateCoordinator(editingCoordinator._id, editForm);

      const updateList = (list) => list.map(c =>
        c._id === editingCoordinator._id
          ? { ...c, name: editForm.coordinatorName, email: editForm.coordinatorEmail, coordinatorId: editForm.coordinatorID }
          : c
      );

      setCoordinators(updateList);
      setFiltered(updateList);

      setEditingCoordinator(null);
      setEditForm({});
      toast.success(`Coordinator ${editForm.coordinatorName} updated successfully.`);
    } catch (err) {
      toast.error(err.message || 'Failed to update coordinator');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex-1 w-full max-w-7xl mx-auto px-4 py-6"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3 sm:p-4 lg:p-6">
          {/* Header Section with Search */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-slate-800 dark:text-white">Coordinator Database</h2>
                <p className="text-slate-600 dark:text-white text-xs sm:text-sm hidden sm:block">View and search all coordinators</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="w-full sm:w-64 lg:w-80">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search coordinators..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-600 focus:border-indigo-500 dark:focus:border-indigo-600 text-slate-700 dark:text-white bg-white dark:bg-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 dark:hover:bg-gray-600 rounded transition-colors"
                  >
                    <X className="w-3 h-3 text-slate-500" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-white mt-1 ml-1 hidden lg:block">Search by name, coordinator ID, or email</p>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-50 dark:bg-gray-700 rounded-lg border border-slate-200 dark:border-gray-600">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-white" />
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-white">
                  Total Coordinators: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{coordinators.length}</span>
                </span>
              </div>
              {searchQuery && (
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-slate-600 dark:text-gray-400">
                    Showing: <span className="font-semibold text-slate-800 dark:text-gray-200">{filtered.length}</span> results
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Loading / Empty / Table */}
          {isLoading && coordinators.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
              <p className="text-slate-600 dark:text-gray-400">Loading coordinators...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-gray-300 mb-2">No coordinators found</h3>
              <p className="text-slate-500 dark:text-gray-400 text-sm">{searchQuery ? "Try adjusting your search query" : "No coordinators have been added yet"}</p>
            </div>
          ) : (
            <div>
              <div className="mb-3 px-2">
                <p className="text-sm text-slate-600 dark:text-gray-400 flex items-center gap-2">
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">💡 Tip:</span>
                  Click on a coordinator's name to view their detailed profile
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Coordinator</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Events Created</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Students Assigned</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Created</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {paginatedCoordinators.map((c) => {
                    const initial = c.name?.charAt(0)?.toUpperCase() || "?";
                    const registered = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "-";
                    return (
                      <tr key={c._id || c.email} className="hover:bg-slate-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3 min-w-[220px]">
                            {c.avatarUrl ? (
                              <img 
                                src={c.avatarUrl} 
                                alt={c.name} 
                                className="w-8 h-8 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-semibold text-sm">
                                {initial}
                              </div>
                            )}
                            <div className="max-w-[280px]">
                              <button
                                onClick={() => openCoordinatorProfile(c)}
                                className="font-medium text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 truncate text-sm transition-colors text-left"
                              >
                                {c.name || "Unknown"}
                              </button>
                              <div className="text-xs text-slate-500 dark:text-white truncate">{c.coordinatorId || "N/A"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-slate-700 dark:text-white max-w-[260px] text-sm">
                          <span className="truncate block">{c.email || "-"}</span>
                        </td>
                        <td className="px-4 py-2 text-slate-700 dark:text-white text-sm">
                          {c.eventsCreated ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="font-medium text-slate-900 dark:text-white">
                                {c.eventsCreated.total} Total
                              </span>
                              <span className="text-xs text-slate-500 dark:text-white">
                                {c.eventsCreated.regular} Regular, {c.eventsCreated.special} Special
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 dark:text-white">0</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-slate-700 dark:text-white text-sm">{c.studentsAssigned ?? 0}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-white text-sm">{registered}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => handleEditCoordinator(c, e)}
                              className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                              title="Edit coordinator"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteCoordinator(c, e)}
                              className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                              title="Delete coordinator"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filtered.length > 0 && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-white">
                  <span>Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    Showing {startIndex + 1}-{Math.min(endIndex, filtered.length)} of {filtered.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  
                  <div className="flex items-center gap-1">
                    {[...Array(totalPages)].map((_, i) => {
                      const page = i + 1;
                      // Show first page, last page, current page, and pages around current
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            onClick={() => handlePageChange(page)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                              currentPage === page
                                ? 'bg-indigo-600 dark:bg-indigo-500 text-white'
                                : 'border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-gray-700'
                            }`}
                          >
                            {page}
                          </button>
                        );
                      } else if (page === currentPage - 2 || page === currentPage + 2) {
                        return <span key={page} className="px-2 text-slate-500 dark:text-gray-400">...</span>;
                      }
                      return null;
                    })}
                  </div>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-700 dark:text-white hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
            </div>
          )}
        </div>
      </motion.div>

      {/* Coordinator Profile Modal */}
      <AnimatePresence>
        {showModal && selectedCoordinator && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 bg-black/50 dark:bg-black/70 backdrop-blur-sm z-50"
            />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={closeModal}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              >
                {/* Header */}
                <div className="sticky top-0 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-gray-700 dark:to-gray-700 border-b border-slate-200 dark:border-gray-600 px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    {selectedCoordinator.avatarUrl ? (
                      <img 
                        src={selectedCoordinator.avatarUrl} 
                        alt={selectedCoordinator.name} 
                        className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md"
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-2xl border-2 border-white shadow-md">
                        {selectedCoordinator.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div>
                      <h3 className="text-xl font-semibold text-slate-800 dark:text-white">{selectedCoordinator.name || "Unknown"}</h3>
                      <p className="text-sm text-slate-600 dark:text-white">{selectedCoordinator.coordinatorId || "N/A"}</p>
                    </div>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-slate-200 dark:hover:bg-gray-600 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-600 dark:text-white" />
                  </button>
                </div>

                {/* Content */}
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Information */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-white mb-3 uppercase tracking-wide">Personal Information</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Name</label>
                          <div className="mt-1 text-slate-800 dark:text-white font-medium">{selectedCoordinator.name || "-"}</div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Coordinator ID</label>
                          <div className="mt-1 text-slate-800 dark:text-white font-medium">{selectedCoordinator.coordinatorId || "-"}</div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Email</label>
                          <div className="mt-1 text-slate-800 dark:text-white">{selectedCoordinator.email || "-"}</div>
                        </div>
                      </div>
                    </div>

                    {/* Statistics */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-white mb-3 uppercase tracking-wide">Statistics</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Events Created</label>
                          {selectedCoordinator.eventsCreated ? (
                            <div className="mt-1">
                              <div className="text-slate-800 dark:text-white font-medium">{selectedCoordinator.eventsCreated.total} Total</div>
                              <div className="text-xs text-slate-600 dark:text-white">{selectedCoordinator.eventsCreated.regular} Regular, {selectedCoordinator.eventsCreated.special} Special</div>
                            </div>
                          ) : (
                            <div className="mt-1 text-slate-800 dark:text-white">0</div>
                          )}
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Students Assigned</label>
                          <div className="mt-1 text-slate-800 dark:text-white font-medium">{selectedCoordinator.studentsAssigned ?? 0}</div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Registered On</label>
                          <div className="mt-1 text-slate-800 dark:text-white">{selectedCoordinator.createdAt ? new Date(selectedCoordinator.createdAt).toLocaleDateString() : "-"}</div>
                        </div>
                      </div>
                    </div>

                    {/* Institution */}
                    <div>
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-white mb-3 uppercase tracking-wide">Institution</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">Department</label>
                          <div className="mt-1 text-slate-800 dark:text-white">{selectedCoordinator.department || "-"}</div>
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 dark:text-white">College</label>
                          <div className="mt-1 text-slate-800 dark:text-white">{selectedCoordinator.college || "-"}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-slate-50 dark:bg-gray-700 border-t border-slate-200 dark:border-gray-600 px-6 py-4 flex justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 bg-slate-800 dark:bg-gray-600 text-white rounded-lg hover:bg-slate-700 dark:hover:bg-gray-500 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Coordinator Modal */}
      <AnimatePresence>
        {editingCoordinator && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
              onClick={() => { if (!isSaving) { setEditingCoordinator(null); setEditForm({}); } }}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={() => { if (!isSaving) { setEditingCoordinator(null); setEditForm({}); } }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-gray-700"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-white">Edit Coordinator</h3>
                  <button
                    onClick={() => { if (!isSaving) { setEditingCoordinator(null); setEditForm({}); } }}
                    className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-gray-700"
                  >
                    <X className="w-4 h-4 text-slate-600 dark:text-white" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-gray-300 mb-1">Name</label>
                    <input
                      type="text"
                      value={editForm.coordinatorName || ''}
                      onChange={(e) => handleChangeEdit('coordinatorName', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-gray-300 mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.coordinatorEmail || ''}
                      onChange={(e) => handleChangeEdit('coordinatorEmail', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-gray-300 mb-1">Coordinator ID</label>
                    <input
                      type="text"
                      value={editForm.coordinatorID || ''}
                      onChange={(e) => handleChangeEdit('coordinatorID', e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { if (!isSaving) { setEditingCoordinator(null); setEditForm({}); } }}
                    className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateCoordinator}
                    disabled={isSaving}
                    className={`px-4 py-2 text-sm font-medium rounded-lg text-white flex items-center gap-2 ${
                      isSaving ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    <Save className="w-4 h-4" />
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
