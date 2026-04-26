/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, Loader2, X, Trash2, Edit2, Save, Download } from "lucide-react";
import Fuse from "fuse.js";
import ContributionCalendar from "../components/ContributionCalendar";
import { useToast } from "../components/CustomToast";

export default function StudentDirectory() {
  const navigate = useNavigate();
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [specialStudents, setSpecialStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("students"); // "students" or "special"
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [studentStats, setStudentStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [eventsStudent, setEventsStudent] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [isExporting, setIsExporting] = useState(false);
  
  // State for detailed videos/courses modals
  const [showVideosModal, setShowVideosModal] = useState(false);
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  const [videosWatched, setVideosWatched] = useState([]);
  const [coursesEnrolled, setCoursesEnrolled] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  // Configure Fuse.js for optimized fuzzy search
  const currentStudents = activeTab === "students" ? students : specialStudents;
  
  const fuse = useMemo(() => {
    return new Fuse(currentStudents, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'studentId', weight: 2 },
        { name: 'email', weight: 1.5 },
        { name: 'branch', weight: 1 },
        { name: 'course', weight: 1 },
        { name: 'college', weight: 0.8 }
      ],
      threshold: 0.4, // More forgiving for variations like B.Tech vs btech
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      useExtendedSearch: true,
      // Case insensitive and removes special characters for matching
      getFn: (obj, path) => {
        const value = Fuse.config.getFn(obj, path);
        if (typeof value === 'string') {
          // Normalize: lowercase, remove dots, spaces, and special chars
          return value.toLowerCase().replace(/[.\s-]/g, '');
        }
        return value;
      }
    });
  }, [currentStudents]);

  useEffect(() => {
    loadData();
  }, [activeTab, sortOrder]);

  useEffect(() => {
    // Use Fuse.js for optimized fuzzy search
    if (!searchQuery.trim()) {
      setFilteredStudents(currentStudents);
    } else {
      // Normalize search query to match getFn normalization
      const normalizedQuery = searchQuery.toLowerCase().replace(/[.\s-]/g, '');
      const results = fuse.search(normalizedQuery);
      // Extract the items from Fuse results
      const filtered = results.map(result => result.item);
      setFilteredStudents(filtered);
    }
    setCurrentPage(1); // Reset to first page on search
  }, [searchQuery, currentStudents, fuse]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStudents = filteredStudents.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadData = async () => {
    setIsLoading(true);
    setError("");
    setSearchQuery(""); // Clear search when switching tabs
    try {
      if (activeTab === "students") {
        const data = await api.listAllStudents('', sortOrder);
        setStudents(data.students || []);
        setFilteredStudents(data.students || []);
      } else {
        const data = await api.listAllSpecialStudents('', sortOrder);
        setSpecialStudents(data.students || []);
        setFilteredStudents(data.students || []);
      }
    } catch (err) {
      setError(err.message || "Failed to load students");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    // Search is now handled by the useEffect with Fuse.js
    // No need for server-side search since we have all students loaded
  };

  const clearSearch = () => {
    setSearchQuery("");
    loadData();
  };

  const openStudentProfile = (student) => {
    navigate(`/admin/students/${student._id}`);
  };

  const loadStudentActivity = async (studentId) => {
    setLoadingActivity(true);
    try {
      const data = await api.getStudentActivityByAdmin(studentId);
      setActivity(data.activityByDate || {});
      setActivityStats(data.stats || null);
    } catch (e) {
      console.error('Failed to load student activity:', e);
      // Fall back to empty activity
      setActivity({});
      setActivityStats(null);
    } finally {
      setLoadingActivity(false);
    }
  };

  const loadStudentStats = async (studentId) => {
    setLoadingStats(true);
    try {
      const data = await api.getStudentStatsByAdmin(studentId);
      setStudentStats(data.stats || null);
    } catch (e) {
      console.error('Failed to load student stats:', e);
      setStudentStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setTimeout(() => {
      setSelectedStudent(null);
      setActivity({});
      setActivityStats(null);
      setStudentStats(null);
      setVideosWatched([]);
      setCoursesEnrolled([]);
    }, 300);
  };

  const handleShowVideosWatched = async () => {
    if (!selectedStudent) return;
    
    setShowVideosModal(true);
    setLoadingVideos(true);
    try {
      const data = await api.getStudentVideosWatchedByAdmin(selectedStudent._id);
      setVideosWatched(data.videos || []);
    } catch (e) {
      console.error('Failed to load videos watched:', e);
      setVideosWatched([]);
      toast.error('Failed to load videos watched');
    } finally {
      setLoadingVideos(false);
    }
  };

  const handleShowCoursesEnrolled = async () => {
    if (!selectedStudent) return;
    
    setShowCoursesModal(true);
    setLoadingCourses(true);
    try {
      const data = await api.getStudentCoursesEnrolledByAdmin(selectedStudent._id);
      setCoursesEnrolled(data.courses || []);
    } catch (e) {
      console.error('Failed to load courses enrolled:', e);
      setCoursesEnrolled([]);
      toast.error('Failed to load courses enrolled');
    } finally {
      setLoadingCourses(false);
    }
  };

  const closeVideosModal = () => {
    setShowVideosModal(false);
    setVideosWatched([]);
  };

  const closeCoursesModal = () => {
    setShowCoursesModal(false);
    setCoursesEnrolled([]);
  };

  const handleDeleteStudent = async (student, e) => {
    e.stopPropagation(); // Prevent row click from opening profile
    
    if (!confirm(`Are you sure you want to delete ${student.name}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await api.deleteStudent(student._id);
      
      // Remove from local state
      if (activeTab === "students") {
        setStudents(prev => prev.filter(s => s._id !== student._id));
      } else {
        setSpecialStudents(prev => prev.filter(s => s._id !== student._id));
      }
      setFilteredStudents(prev => prev.filter(s => s._id !== student._id));
      
      // Show success message
      toast.success(`Student ${student.name} has been deleted successfully.`);
    } catch (err) {
      toast.error(err.message || 'Failed to delete student');
    }
  };

  const handleEditStudent = (student, e) => {
    e.stopPropagation(); // Prevent row click from opening profile
    setEditingStudent(student);
    setEditForm({
      name: student.name || '',
      email: student.email || '',
      studentId: student.studentId || '',
      course: student.course || '',
      branch: student.branch || '',
      college: student.college || '',
      bio: student.bio || '',
      linkedinUrl: student.linkedinUrl || '',
      githubUrl: student.githubUrl || '',
      portfolioUrl: student.portfolioUrl || '',
      semester: student.semester || '',
      group: student.group || '',
      teacherId: student.teacherId || ''
    });
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;
    
    setIsSaving(true);
    try {
      const updated = await api.updateStudent(editingStudent._id, editForm);
      const updatedStudent = updated?.student || { ...editingStudent, ...editForm };
      
      // Update local state
      const updateList = (list) => list.map(s => 
        s._id === editingStudent._id ? { ...s, ...updatedStudent } : s
      );
      
      if (activeTab === "students") {
        setStudents(updateList);
      } else {
        setSpecialStudents(updateList);
      }
      setFilteredStudents(updateList);
      
      setEditingStudent(null);
      setEditForm({});
      toast.success(`Student ${editForm.name} updated successfully!`);
    } catch (err) {
      toast.error(err.message || 'Failed to update student');
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingStudent(null);
    setEditForm({});
  };

  // ── CSV helpers ──────────────────────────────────────────────────
  const downloadCsv = (rows, filename) => {
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStudentData = async () => {
    if (!selectedStudent) return;
    const s = selectedStudent;
    let stats = studentStats;
    if (!stats) {
      try { const d = await api.getStudentStatsByAdmin(s._id); stats = d.stats; } catch (_) {}
    }
    const rows = [
      ['Name','Student ID','Email','Course','Branch','College','Semester','Group','Coordinator','Courses Enrolled','Videos Watched','Problems Solved'],
      [s.name, s.studentId, s.email, s.course, s.branch, s.college, s.semester, s.group, s.teacherId,
       stats?.totalCoursesEnrolled ?? '', stats?.totalVideosWatched ?? '', stats?.problemsSolved ?? '']
    ];
    downloadCsv(rows, `student_${s.studentId || s._id}_${new Date().toISOString().slice(0,10)}.csv`);
    toast.success('Student data downloaded!');
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      await api.exportStudentsCsv();
      toast.success('Students exported successfully!');
    } catch (err) {
      toast.error(err.message || 'Failed to export students');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex-1 w-full mx-auto px-4 py-6"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3 sm:p-4 lg:p-6">
          {/* Tabs */}
          <div className="flex items-center gap-2 mb-6 border-b border-slate-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab("students")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "students"
                  ? "border-emerald-500 dark:border-emerald-400 text-emerald-600 dark:text-emerald-400"
                  : "border-transparent text-slate-600 dark:text-white hover:text-slate-800 dark:hover:text-white"
              }`}
            >
              Students
            </button>
          </div>
          
          {/* Header Section with Search and Sort */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                activeTab === "students" ? "bg-emerald-100 dark:bg-emerald-900" : "bg-indigo-100 dark:bg-indigo-900"
              }`}>
                <Users className={`w-5 h-5 sm:w-6 sm:h-6 ${
                  activeTab === "students" ? "text-emerald-600" : "text-indigo-600"
                }`} />
              </div>
              <div>
                <h2 className="text-lg sm:text-xl lg:text-2xl font-semibold text-slate-800 dark:text-white">
                  {activeTab === "students" ? "Student Database" : "Special Event Students"}
                </h2>
                <p className="text-slate-600 dark:text-white text-xs sm:text-sm hidden sm:block">
                  {activeTab === "students" 
                    ? "View and search all registered students" 
                    : "View students from special events"}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Export CSV Button */}
              <button
                onClick={handleExportCsv}
                disabled={isExporting}
                className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg transition-colors"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>

              {/* Sort Order Dropdown */}
              <div className="flex flex-col">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600 focus:border-emerald-500 dark:focus:border-emerald-600 text-slate-700 dark:text-white bg-white dark:bg-gray-700 cursor-pointer"
                >
                  <option value="asc">Oldest First</option>
                  <option value="desc">Newest First</option>
                </select>
                <p className="text-xs text-slate-500 dark:text-white mt-1 ml-1 hidden sm:block">
                  Sort by creation date
                </p>
              </div>

              {/* Compact Search Bar */}
              <form onSubmit={handleSearch} className="w-full sm:w-64 lg:w-80">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search students..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600 focus:border-emerald-500 dark:focus:border-emerald-600 text-slate-700 dark:text-white bg-white dark:bg-gray-700 placeholder:text-gray-400 dark:placeholder:text-gray-400"
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
                <p className="text-xs text-slate-500 dark:text-white mt-1 ml-1 hidden lg:block">
                  Search by name, ID, email, branch, course, or college
                </p>
              </form>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-50 dark:bg-gray-700 rounded-lg border border-slate-200 dark:border-gray-600">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-slate-600 dark:text-white" />
                <span className="text-xs sm:text-sm font-medium text-slate-700 dark:text-white">
                  Total {activeTab === "students" ? "Students" : "Special Students"}: <span className={`font-semibold ${
                    activeTab === "students" ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-600 dark:text-indigo-400"
                  }`}>{currentStudents.length}</span>
                </span>
              </div>
              {searchQuery && (
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm text-slate-600 dark:text-white">
                    Showing: <span className="font-semibold text-slate-800 dark:text-white">{filteredStudents.length}</span> results
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Loading State */}
          {isLoading && students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
              <p className="text-slate-600 dark:text-white">Loading students...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-white mb-2">No students found</h3>
              <p className="text-slate-500 dark:text-white text-sm">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "No students have been registered yet"}
              </p>
            </div>
          ) : (
            // Students Table (no tabs, clear and scannable)
            <div>
              <div className="mb-3 px-2">
                <p className="text-sm text-slate-600 dark:text-white flex items-center gap-2">
                  <span className="font-medium text-sky-600 dark:text-sky-400">💡 Tip:</span>
                  Click on a student's name to open their full analytics profile
                </p>
              </div>
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Student</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Email</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Branch</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Course</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Semester</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Group</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">College</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Coordinator Assigned</th>
                    {activeTab === "students" && (
                      <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Actions</th>
                    )}
                    {activeTab === "special" && (
                      <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Special Events</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {paginatedStudents.map((s) => {
                    const initial = s.name?.charAt(0)?.toUpperCase() || "?";
                    return (
                      <tr key={s._id} className="hover:bg-slate-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3 min-w-[220px]">
                            {s.avatarUrl ? (
                              <img 
                                src={s.avatarUrl} 
                                alt={s.name} 
                                className="w-8 h-8 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                                activeTab === "students" ? "bg-sky-100 text-sky-700" : "bg-indigo-100 text-indigo-700"
                              }`}>
                                {initial}
                              </div>
                            )}
                            <div className="max-w-[280px]">
                              <button
                                onClick={() => openStudentProfile(s)}
                                className="font-medium text-slate-900 dark:text-white hover:text-sky-600 dark:hover:text-sky-400 truncate text-sm transition-colors text-left"
                              >
                                {s.name || "Unknown"}
                              </button>
                              <div className="text-xs text-slate-500 dark:text-white truncate">{s.studentId || "N/A"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-slate-700 dark:text-white max-w-[260px] text-sm"><span className="truncate block">{s.email || "-"}</span></td>
                        <td className="px-4 py-2 text-slate-700 dark:text-white text-sm">{s.branch || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-white text-sm">{s.course || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-white text-sm">{s.semester || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-white text-sm">{s.group || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-white text-sm max-w-[200px]"><span className="truncate block">{s.college || "-"}</span></td>
                        <td className="px-4 py-2 text-slate-700 dark:text-white text-sm">{s.teacherId || "-"}</td>
                        {activeTab === "students" && (
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => handleEditStudent(s, e)}
                                className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                title="Edit student"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={(e) => handleDeleteStudent(s, e)}
                                className="p-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Delete student"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                        {activeTab === "special" && (
                          <td className="px-4 py-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); setEventsStudent(s); }}
                              className="px-3 py-1.5 text-xs font-medium rounded-full bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800 transition-colors"
                            >
                              See Events
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredStudents.length > 0 && (
              <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-white">
                  <span>Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-slate-700 dark:text-white focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    Showing {startIndex + 1}-{Math.min(endIndex, filteredStudents.length)} of {filteredStudents.length}
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
                                ? 'bg-sky-600 dark:bg-sky-500 text-white'
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

      {/* Student Profile Modal */}
      <AnimatePresence>
        {showModal && selectedStudent && (
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
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {selectedStudent.avatarUrl ? (
                      <img
                        src={selectedStudent.avatarUrl}
                        alt={selectedStudent.name}
                        className="w-10 h-10 rounded-full object-cover border-2 border-white/60 shadow"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-lg border-2 border-white/40">
                        {selectedStudent.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                    )}
                    <div>
                      <h3 className="text-base font-bold text-white leading-tight">{selectedStudent.name || "Unknown"}</h3>
                      <p className="text-xs text-sky-100">{selectedStudent.studentId || "N/A"} · {selectedStudent.course || ""} · Sem {selectedStudent.semester || "?"}</p>
                    </div>
                  </div>
                  <button onClick={closeModal} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-3">

                  {/* Info Grid — 4 columns */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: "Name",                value: selectedStudent.name },
                      { label: "Student ID",          value: selectedStudent.studentId },
                      { label: "Course",              value: selectedStudent.course },
                      { label: "Branch",              value: selectedStudent.branch },
                      { label: "Email",               value: selectedStudent.email },
                      { label: "College",             value: selectedStudent.college },
                      { label: "Semester",            value: selectedStudent.semester },
                      { label: "Group",               value: selectedStudent.group },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-50 dark:bg-gray-700/60 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-gray-400">{label}</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5 truncate">{value || "—"}</p>
                      </div>
                    ))}
                  </div>

                  {/* Coordinator row */}
                  <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg px-3 py-2 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-500">Coordinator Assigned</span>
                    <span className="text-xs font-bold text-sky-700 dark:text-sky-300 ml-1">{selectedStudent.teacherId || "Not Assigned"}</span>
                  </div>

                  {/* Special Event Info */}
                  {activeTab === "special" && selectedStudent.eventId && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Event ID</p>
                        <p className="text-xs font-semibold text-slate-800 dark:text-white mt-0.5">{selectedStudent.eventId}</p>
                      </div>
                    </div>
                  )}

                  {/* Stats Row */}
                  {loadingStats ? (
                    <div className="grid grid-cols-3 gap-2">
                      {[1,2,3].map(i => <div key={i} className="h-14 animate-pulse bg-slate-100 dark:bg-gray-700 rounded-lg" />)}
                    </div>
                  ) : studentStats ? (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={handleShowCoursesEnrolled}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 hover:from-blue-100 hover:to-indigo-100 transition-all text-left"
                      >
                        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{studentStats.totalCoursesEnrolled || 0}</p>
                          <p className="text-[10px] text-slate-500 dark:text-gray-400">Courses Enrolled</p>
                        </div>
                      </button>
                      <button
                        onClick={handleShowVideosWatched}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800 hover:from-red-100 hover:to-pink-100 transition-all text-left"
                      >
                        <div className="w-7 h-7 rounded-md bg-red-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{studentStats.totalVideosWatched || 0}</p>
                          <p className="text-[10px] text-slate-500 dark:text-gray-400">Videos Watched</p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                        <div className="w-7 h-7 rounded-md bg-green-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{studentStats.problemsSolved || 0}</p>
                          <p className="text-[10px] text-slate-500 dark:text-gray-400">Problems Solved</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Contribution Calendar */}
                  <div className="rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600 p-3">
                    {loadingActivity ? (
                      <div className="text-center py-4 text-xs text-slate-400">Loading activity...</div>
                    ) : (
                      <ContributionCalendar
                        activity={activity}
                        stats={activityStats}
                        title="Student Activity"
                      />
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      onClick={handleDownloadStudentData}
                      className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download Data
                    </button>
                    <button
                      onClick={closeModal}
                      className="px-4 py-1.5 bg-slate-800 dark:bg-gray-600 text-white text-sm rounded-lg hover:bg-slate-700 dark:hover:bg-gray-500 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Student Modal */}
      <AnimatePresence>
        {editingStudent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={cancelEdit}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-semibold text-slate-800 dark:text-gray-100">Edit Student</h2>
                    <button
                      onClick={cancelEdit}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-600 dark:text-gray-400" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Name</label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Email</label>
                      <input
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Student ID</label>
                      <input
                        type="text"
                        value={editForm.studentId}
                        onChange={(e) => setEditForm({ ...editForm, studentId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Course</label>
                      <input
                        type="text"
                        value={editForm.course}
                        onChange={(e) => setEditForm({ ...editForm, course: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Branch</label>
                      <input
                        type="text"
                        value={editForm.branch}
                        onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">College</label>
                      <input
                        type="text"
                        value={editForm.college}
                        onChange={(e) => setEditForm({ ...editForm, college: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Bio</label>
                      <textarea
                        rows="4"
                        value={editForm.bio || ''}
                        onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent resize-none"
                        placeholder="Professional student summary, coding focus, or target role"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">LinkedIn URL</label>
                      <input
                        type="url"
                        value={editForm.linkedinUrl || ''}
                        onChange={(e) => setEditForm({ ...editForm, linkedinUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">GitHub URL</label>
                      <input
                        type="url"
                        value={editForm.githubUrl || ''}
                        onChange={(e) => setEditForm({ ...editForm, githubUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Portfolio URL</label>
                      <input
                        type="url"
                        value={editForm.portfolioUrl || ''}
                        onChange={(e) => setEditForm({ ...editForm, portfolioUrl: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Semester</label>
                      <input
                        type="number"
                        min="1"
                        max="8"
                        value={editForm.semester}
                        onChange={(e) => setEditForm({ ...editForm, semester: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Group</label>
                      <input
                        type="text"
                        value={editForm.group}
                        onChange={(e) => setEditForm({ ...editForm, group: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Coordinator ID(s)</label>
                      <input
                        type="text"
                        value={editForm.teacherId}
                        onChange={(e) => setEditForm({ ...editForm, teacherId: e.target.value })}
                        placeholder="COO1 or COO1,COO2"
                        className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 focus:border-transparent"
                      />
                      <span className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">Comma-separated for multiple coordinators</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 mt-6">
                    <button
                      onClick={cancelEdit}
                      disabled={isSaving}
                      className="px-4 py-2 text-slate-700 dark:text-gray-300 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateStudent}
                      disabled={isSaving}
                      className="px-4 py-2 bg-sky-500 dark:bg-sky-600 text-white hover:bg-sky-600 dark:hover:bg-sky-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Special Student Events Modal - centered with blurred background */}
      {eventsStudent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          {/* Light blurred backdrop */}
          <div
            className="absolute inset-0 bg-slate-200/60 dark:bg-black/40 backdrop-blur-sm"
            onClick={() => setEventsStudent(null)}
          />
          {/* Modal card */}
          <div className="relative z-50 w-full max-w-2xl mx-4 rounded-xl bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-gray-700">
              <div>
                <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                  Special Events for {eventsStudent.name || 'Student'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-300">
                  Showing all special events this student has been invited to.
                </p>
              </div>
              <button
                onClick={() => setEventsStudent(null)}
                className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-3 max-h-80 overflow-y-auto">
              {Array.isArray(eventsStudent.specialEvents) && eventsStudent.specialEvents.length > 0 ? (
                <table className="min-w-full text-xs divide-y divide-slate-200 dark:divide-gray-700">
                  <thead className="bg-slate-50 dark:bg-gray-700/60">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-gray-200">Event Name</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-gray-200">Created On</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-gray-200">Created By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                    {eventsStudent.specialEvents.map((ev) => {
                      if (!ev) return null;
                      const createdAt = ev.createdAt ? new Date(ev.createdAt) : null;
                      const createdOnLabel = createdAt ? createdAt.toLocaleDateString() : '-';
                      const createdByLabel = ev.createdBy || (ev.coordinatorId ? 'Coordinator' : 'Admin');
                      return (
                        <tr key={ev._id || `${ev.name}-${createdOnLabel}`}>
                          <td className="px-3 py-2 text-slate-800 dark:text-gray-100 whitespace-nowrap">{ev.name || '-'}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-gray-200 whitespace-nowrap">{createdOnLabel}</td>
                          <td className="px-3 py-2 text-slate-700 dark:text-gray-200 whitespace-nowrap">{createdByLabel}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-slate-500 dark:text-gray-300">
                  This student has not been added to any special events yet.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Videos Watched Detail Modal */}
      <AnimatePresence>
        {showVideosModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeVideosModal}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            />
            <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-gray-700">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-800 dark:text-gray-100">
                      Videos Watched
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-gray-300 mt-1">
                      {selectedStudent?.name} - Detailed video watch history
                    </p>
                  </div>
                  <button
                    onClick={closeVideosModal}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-600 dark:text-gray-400" />
                  </button>
                </div>

                <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
                  {loadingVideos ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                      <span className="ml-2 text-slate-600 dark:text-gray-400">Loading videos...</span>
                    </div>
                  ) : videosWatched.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-gray-700">
                        <thead className="bg-slate-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-gray-300 uppercase tracking-wider">
                              Video Title
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-gray-300 uppercase tracking-wider">
                              Watch Time
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-gray-300 uppercase tracking-wider">
                              Date & Time Watched
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-slate-200 dark:divide-gray-700">
                          {videosWatched.map((video, index) => {
                            const watchedDate = video.watchedDate 
                              ? new Date(video.watchedDate).toLocaleString('en-US', {
                                  year: 'numeric',
                                  month: 'short', 
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'Unknown date';
                            
                            return (
                              <tr key={index} className="hover:bg-slate-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {video.videoTitle || 'Untitled Video'}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                                    {video.subjectName} • {video.chapterName}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-slate-900 dark:text-white font-medium">
                                    {video.durationDisplay || (video.duration > 0 ? `${video.duration}m` : '—')}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-slate-900 dark:text-white">
                                    {watchedDate}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-slate-600 dark:text-gray-400">No videos watched yet</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Courses Enrolled Detail Modal */}
      <AnimatePresence>
        {showCoursesModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCoursesModal}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60]"
            />
            <div className="fixed inset-0 flex items-center justify-center z-[60] p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-gray-700">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-800 dark:text-gray-100">
                      Courses Enrolled
                    </h2>
                    <p className="text-sm text-slate-600 dark:text-gray-300 mt-1">
                      {selectedStudent?.name} - All enrolled courses and progress
                    </p>
                  </div>
                  <button
                    onClick={closeCoursesModal}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-600 dark:text-gray-400" />
                  </button>
                </div>

                <div className="p-6 max-h-[calc(90vh-140px)] overflow-y-auto">
                  {loadingCourses ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
                      <span className="ml-2 text-slate-600 dark:text-gray-400">Loading courses...</span>
                    </div>
                  ) : coursesEnrolled.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-slate-200 dark:divide-gray-700">
                        <thead className="bg-slate-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-gray-300 uppercase tracking-wider">
                              Course Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-gray-300 uppercase tracking-wider">
                              Enrollment Date
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-slate-700 dark:text-gray-300 uppercase tracking-wider">
                              Progress Status
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-slate-200 dark:divide-gray-700">
                          {coursesEnrolled.map((course, index) => {
                            const enrollmentDate = course.enrollmentDate 
                              ? new Date(course.enrollmentDate).toLocaleDateString('en-US', {
                                  year: 'numeric',
                                  month: 'short', 
                                  day: 'numeric'
                                })
                              : 'Unknown date';
                            
                            const progressColor = 
                              course.progressPercentage === 100 ? 'text-green-600 dark:text-green-400' :
                              course.progressPercentage >= 50 ? 'text-blue-600 dark:text-blue-400' :
                              course.progressPercentage > 0 ? 'text-yellow-600 dark:text-yellow-400' :
                              'text-slate-500 dark:text-gray-400';
                            
                            return (
                              <tr key={index} className="hover:bg-slate-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4">
                                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                                    {course.courseName || 'Untitled Course'}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                                    {course.semesterName}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="text-sm text-slate-900 dark:text-white">
                                    {enrollmentDate}
                                  </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  <div className="flex flex-col gap-1">
                                    <div className={`text-sm font-medium ${progressColor}`}>
                                      {course.progressStatus || 'Not Started'}
                                    </div>
                                    <div className="w-full bg-slate-200 dark:bg-gray-700 rounded-full h-2">
                                      <div 
                                        className={`h-2 rounded-full transition-all ${
                                          course.progressPercentage === 100 ? 'bg-green-600' :
                                          course.progressPercentage >= 50 ? 'bg-blue-600' :
                                          course.progressPercentage > 0 ? 'bg-yellow-600' :
                                          'bg-slate-400'
                                        }`}
                                        style={{ width: `${course.progressPercentage || 0}%` }}
                                      ></div>
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-gray-400">
                                      {course.completedTopics || 0} / {course.totalTopics || 0} topics ({course.progressPercentage || 0}%)
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-slate-600 dark:text-gray-400">No courses enrolled yet</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
