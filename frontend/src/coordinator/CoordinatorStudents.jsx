/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo } from "react";
import { api } from "../utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Users, Loader2, X, Download } from "lucide-react";
import Fuse from "fuse.js";
import ContributionCalendar from "../components/ContributionCalendar";

export default function CoordinatorStudents() {
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activity, setActivity] = useState({});
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState([]);
  const [activityStats, setActivityStats] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  
  // State for detailed videos/courses modals and stats
  const [studentStats, setStudentStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showVideosModal, setShowVideosModal] = useState(false);
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  const [videosWatched, setVideosWatched] = useState([]);
  const [coursesEnrolled, setCoursesEnrolled] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  // Configure Fuse.js for optimized fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(students, {
      keys: [
        { name: 'name', weight: 2 },
        { name: 'studentId', weight: 2 },
        { name: 'email', weight: 1.5 },
        { name: 'branch', weight: 1 },
        { name: 'course', weight: 1 },
        { name: 'college', weight: 0.8 }
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
      useExtendedSearch: true,
      getFn: (obj, path) => {
        const value = Fuse.config.getFn(obj, path);
        if (typeof value === 'string') {
          return value.toLowerCase().replace(/[.\s-]/g, '');
        }
        return value;
      }
    });
  }, [students]);

  useEffect(() => {
    fetchStudents();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStudents(students);
    } else {
      const normalizedQuery = searchQuery.toLowerCase().replace(/[.\s-]/g, '');
      const results = fuse.search(normalizedQuery);
      const filtered = results.map(result => result.item);
      setFilteredStudents(filtered);
    }
  }, [searchQuery, students, fuse]);

  const fetchStudents = async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = await api.listAllStudents();
      setStudents(data.students || []);
      setFilteredStudents(data.students || []);
    } catch (err) {
      setError(err.message || "Failed to load students");
      console.error("Error fetching students:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
  };

  const clearSearch = () => {
    setSearchQuery("");
    fetchStudents();
  };

  const openStudentProfile = async (student) => {
    setSelectedStudent(student);
    setShowModal(true);
    setSelectedYear(new Date().getFullYear());
    
    // Load real activity data for current year and stats
    await loadStudentActivity(student._id, new Date().getFullYear());
    await loadStudentStats(student._id);
  };

  const loadStudentActivity = async (studentId, year) => {
    setLoadingActivity(true);
    try {
      const data = await api.getStudentActivityByAdmin(studentId, year);
      setActivity(data.activityByDate || {});
      setAvailableYears(data.availableYears || []);
      setActivityStats(data.stats || null);
    } catch (e) {
      console.error('Failed to load student activity:', e);
      setActivity({});
      setAvailableYears([]);
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

  const handleYearChange = async (year) => {
    setSelectedYear(year);
    if (selectedStudent && selectedStudent._id) {
      await loadStudentActivity(selectedStudent._id, year);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setTimeout(() => {
      setSelectedStudent(null);
      setActivity({});
      setAvailableYears([]);
      setActivityStats(null);
      setStudentStats(null);
      setSelectedYear(new Date().getFullYear());
      setVideosWatched([]);
      setCoursesEnrolled([]);
    }, 300);
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
      ['Name','Student ID','Email','Course','Branch','College','Semester','Group','Coordinator','Courses Enrolled','Videos Watched'],
      [s.name, s.studentId, s.email, s.course, s.branch, s.college, s.semester, s.group, s.teacherId,
       stats?.totalCoursesEnrolled ?? '', stats?.totalVideosWatched ?? '']
    ];
    downloadCsv(rows, `student_${s.studentId || s._id}_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const handleDownloadAllStudents = () => {
    if (!students.length) return;
    setIsDownloadingAll(true);
    try {
      const rows = [
        ['Name','Student ID','Email','Course','Branch','College','Semester','Group','Coordinator'],
        ...students.map(s => [s.name, s.studentId, s.email, s.course, s.branch, s.college, s.semester, s.group, s.teacherId])
      ];
      downloadCsv(rows, `my_students_${new Date().toISOString().slice(0,10)}.csv`);
    } finally {
      setIsDownloadingAll(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col pt-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex-1 w-full max-w-7xl mx-auto px-4 py-6"
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-6">
          {/* Header Section with Search */}
          <div className="flex items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center bg-emerald-100 dark:bg-emerald-900">
                <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-slate-800 dark:text-gray-100">
                  My Students
                </h2>
                <p className="text-slate-600 dark:text-gray-400 text-sm">
                  View and manage students assigned to you
                </p>
              </div>
            </div>

            {/* Compact Search Bar */}
            <div className="flex items-center gap-2">
              {/* Download All Students */}
              <button
                onClick={handleDownloadAllStudents}
                disabled={isDownloadingAll || !students.length}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg transition-colors whitespace-nowrap"
              >
                {isDownloadingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download All
              </button>
              <form onSubmit={handleSearch} className="w-80">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder="Search students..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-9 py-2 text-sm border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-600 focus:border-emerald-500 dark:focus:border-emerald-600 text-slate-700 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 dark:hover:bg-gray-600 rounded transition-colors"
                  >
                    <X className="w-3 h-3 text-slate-500 dark:text-gray-400" />
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 ml-1">
                Search by name, ID, email, branch, course, or college
              </p>
            </form>
            </div>
          </div>

          {/* Stats */}
          <div className="mb-6 p-4 bg-slate-50 dark:bg-gray-700 rounded-lg border border-slate-200 dark:border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-600 dark:text-gray-300" />
                <span className="text-sm font-medium text-slate-700 dark:text-gray-200">
                  Total Students: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{students.length}</span>
                </span>
              </div>
              {searchQuery && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-600 dark:text-gray-300">
                    Showing: <span className="font-semibold text-slate-800 dark:text-gray-100">{filteredStudents.length}</span> results
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
              className="mb-4 p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Loading State */}
          {isLoading && students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400 animate-spin mb-4" />
              <p className="text-slate-600 dark:text-gray-400">Loading students...</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-slate-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 dark:text-gray-200 mb-2">No students found</h3>
              <p className="text-slate-500 dark:text-gray-400 text-sm">
                {searchQuery
                  ? "Try adjusting your search query"
                  : "No students have been assigned to you yet"}
              </p>
            </div>
          ) : (
            // Students Table
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-slate-200 dark:divide-gray-700">
                <thead className="bg-slate-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Student</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Email</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Branch</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Course</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Semester</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Group</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">College</th>
                    <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-gray-300">Coordinator Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {filteredStudents.map((s) => {
                    const initial = s.name?.charAt(0)?.toUpperCase() || "?";
                    return (
                      <tr key={s._id} className="hover:bg-slate-50 dark:hover:bg-gray-700 cursor-pointer" onClick={() => openStudentProfile(s)}>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-3 min-w-[220px]">
                            {s.avatarUrl ? (
                              <img
                                src={s.avatarUrl}
                                alt={s.name || initial}
                                className="w-8 h-8 rounded-full object-cover border border-sky-200 dark:border-sky-700"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300">
                                {initial}
                              </div>
                            )}
                            <div className="max-w-[280px]">
                              <button onClick={() => openStudentProfile(s)} className="font-medium text-emerald-600 dark:text-emerald-400 truncate text-sm hover:underline text-left">{s.name || "Unknown"}</button>
                              <div className="text-xs text-slate-500 dark:text-gray-400 truncate">{s.studentId || "N/A"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-slate-700 dark:text-gray-300 max-w-[260px] text-sm"><span className="truncate block">{s.email || "-"}</span></td>
                        <td className="px-4 py-2 text-slate-700 dark:text-gray-300 text-sm">{s.branch || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-gray-400 text-sm">{s.course || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-gray-400 text-sm">{s.semester || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-gray-400 text-sm">{s.group || "-"}</td>
                        <td className="px-4 py-2 text-slate-600 dark:text-gray-400 text-sm max-w-[200px]"><span className="truncate block">{s.college || "-"}</span></td>
                        <td className="px-4 py-2 text-slate-700 dark:text-gray-300 text-sm">{s.teacherId || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
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

                  {/* Stats Row */}
                  {loadingStats ? (
                    <div className="grid grid-cols-2 gap-2">
                      {[1,2].map(i => <div key={i} className="h-14 animate-pulse bg-slate-100 dark:bg-gray-700 rounded-lg" />)}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleShowCoursesEnrolled}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 hover:from-blue-100 hover:to-indigo-100 transition-all text-left"
                      >
                        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{studentStats?.totalCoursesEnrolled || 0}</p>
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
                          <p className="text-sm font-bold text-slate-800 dark:text-white">{studentStats?.totalVideosWatched || 0}</p>
                          <p className="text-[10px] text-slate-500 dark:text-gray-400">Videos Watched</p>
                        </div>
                      </button>
                    </div>
                  )}

                  {/* Contribution Calendar */}
                  <div className="rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600 p-3">
                    {loadingActivity ? (
                      <div className="text-center py-4 text-xs text-slate-400">Loading activity...</div>
                    ) : (
                      <ContributionCalendar
                        activityByDate={activity}
                        title="Student Activity"
                        year={selectedYear}
                        availableYears={availableYears}
                        onYearChange={handleYearChange}
                        showYearFilter={true}
                        stats={activityStats}
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

      {/* Videos Watched Modal */}
      <AnimatePresence>
        {showVideosModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
              onClick={closeVideosModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Videos Watched</h3>
                  <button
                    onClick={closeVideosModal}
                    className="text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto max-h-[60vh] p-6">
                  {videosWatched.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-gray-400">No videos watched yet</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-gray-700">
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Video Title</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Subject</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Watch Time</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Watched On</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videosWatched.map((video, index) => (
                          <tr key={index} className="border-b border-slate-100 dark:border-gray-700">
                            <td className="py-3 px-4 text-slate-800 dark:text-gray-100">{video.videoTitle || 'Unknown Video'}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-gray-300">{video.subjectName || 'Unknown Subject'}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-gray-300">{video.durationDisplay || (video.duration > 0 ? `${video.duration}m` : '—')}</td>
                            <td className="py-3 px-4 text-slate-600 dark:text-gray-300">
                              {video.watchedDate ? `${new Date(video.watchedDate).toLocaleDateString()} at ${new Date(video.watchedDate).toLocaleTimeString()}` : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Courses Enrolled Modal */}
      <AnimatePresence>
        {showCoursesModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
              onClick={closeCoursesModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-0 z-[70] flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Courses Enrolled</h3>
                  <button
                    onClick={closeCoursesModal}
                    className="text-slate-500 hover:text-slate-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto max-h-[60vh] p-6">
                  {coursesEnrolled.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-gray-400">No courses enrolled yet</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-gray-700">
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Course Name</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Progress</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-slate-600 dark:text-gray-300">Enrolled On</th>
                        </tr>
                      </thead>
                      <tbody>
                        {coursesEnrolled.map((course, index) => (
                          <tr key={index} className="border-b border-slate-100 dark:border-gray-700">
                            <td className="py-3 px-4 text-slate-800 dark:text-gray-100">{course.courseName || 'Unknown Course'}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <div className="w-24 h-2 bg-slate-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-green-500 rounded-full" 
                                    style={{ width: `${course.progressPercentage || 0}%` }}
                                  />
                                </div>
                                <span className="text-sm text-slate-600 dark:text-gray-300">{course.progressPercentage || 0}%</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-gray-300">
                              {course.enrollmentDate ? new Date(course.enrollmentDate).toLocaleDateString() : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
