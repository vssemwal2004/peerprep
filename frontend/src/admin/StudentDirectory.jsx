/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, ChevronLeft, ChevronRight, ClipboardCopy, Download, Edit2, Eye, FileDown, Filter, Loader2, Mail, MoreVertical, Save, Search, Trash2, UserX, Users, X } from "lucide-react";
import ContributionCalendar from "../components/ContributionCalendar";
import { useToast } from "../components/CustomToast";
import {
  deriveStudentFacets,
  filterStudentsLocally,
  mergeFilterOptions,
  mergeSemesterOptions,
} from "../utils/semesterOptions";

const EMPTY_FILTERS = {
  semester: '',
  branch: '',
  course: '',
  college: '',
  group: '',
  coordinator: '',
  credentialEmailStatus: '',
  platformActivity: '',
  credentialEligibility: '',
  accountStatus: '',
};

export default function StudentDirectory() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const uploadBatchId = searchParams.get('uploadBatchId') || '';
  const uploadBatchName = searchParams.get('batchName') || '';
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
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [isExporting, setIsExporting] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [managedSemesters, setManagedSemesters] = useState([]);
  const [facets, setFacets] = useState({});
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0, limit: 25 });
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [selectedStudentMap, setSelectedStudentMap] = useState({});
  const [activeRowMenuId, setActiveRowMenuId] = useState(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isSelectingAllFiltered, setIsSelectingAllFiltered] = useState(false);
  const [sendingCredentialIds, setSendingCredentialIds] = useState(new Set());
  const loadRequestRef = useRef(0);
  const credentialRefreshTimersRef = useRef([]);
  const filterPanelRef = useRef(null);
  const rowActionMenuRef = useRef(null);
  const bulkMenuRef = useRef(null);
  
  // State for detailed videos/courses modals
  const [showVideosModal, setShowVideosModal] = useState(false);
  const [showCoursesModal, setShowCoursesModal] = useState(false);
  const [videosWatched, setVideosWatched] = useState([]);
  const [coursesEnrolled, setCoursesEnrolled] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);

  const fallbackFacets = useMemo(() => deriveStudentFacets(students), [students]);
  const semesterOptions = useMemo(() => mergeSemesterOptions(
    managedSemesters,
    facets.semesters,
    fallbackFacets.semesters,
  ), [managedSemesters, facets.semesters, fallbackFacets.semesters]);
  const filterOptions = useMemo(() => ({
    branches: mergeFilterOptions(facets.branches, fallbackFacets.branches),
    courses: mergeFilterOptions(facets.courses, fallbackFacets.courses),
    colleges: mergeFilterOptions(facets.colleges, fallbackFacets.colleges),
    groups: mergeFilterOptions(facets.groups, fallbackFacets.groups),
    coordinators: mergeFilterOptions(facets.coordinators, fallbackFacets.coordinators),
  }), [facets, fallbackFacets]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const advancedFilterDefinitions = [
    {
      key: 'platformActivity',
      label: 'Platform activity',
      allLabel: 'All students',
      options: [
        { value: 'active', label: 'Active students (logged in)' },
        { value: 'never_logged_in', label: 'Never logged in' },
      ],
    },
    {
      key: 'credentialEligibility',
      label: 'Credential eligibility',
      allLabel: 'All eligibility states',
      options: [
        { value: 'eligible', label: 'Can send credentials' },
        { value: 'ineligible', label: 'Cannot send credentials' },
      ],
    },
    {
      key: 'accountStatus',
      label: 'Account status',
      allLabel: 'All account statuses',
      options: [
        { value: 'active', label: 'Enabled accounts' },
        { value: 'disabled', label: 'Disabled accounts' },
      ],
    },
    {
      key: 'credentialEmailStatus',
      label: 'Credential mail',
      allLabel: 'All mail statuses',
      options: [
        { value: 'sent', label: 'Mail sent' },
        { value: 'not_sent', label: 'Not sent / failed' },
        { value: 'unconfirmed', label: 'Historical status unconfirmed' },
      ],
    },
    { key: 'branch', label: 'Branch', allLabel: 'All branches', options: filterOptions.branches },
    { key: 'course', label: 'Course', allLabel: 'All courses', options: filterOptions.courses },
    { key: 'college', label: 'College', allLabel: 'All colleges', options: filterOptions.colleges },
    { key: 'group', label: 'Group', allLabel: 'All groups', options: filterOptions.groups },
    { key: 'coordinator', label: 'Coordinator', allLabel: 'All coordinators', options: filterOptions.coordinators },
  ];

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let mounted = true;
    api.getAllSemestersForStudent()
      .then((data) => {
        if (mounted) setManagedSemesters(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (mounted) setManagedSemesters([]);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!showFilters) return undefined;
    const handleOutsideClick = (event) => {
      if (!filterPanelRef.current?.contains(event.target)) setShowFilters(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showFilters]);

  useEffect(() => {
    if (!activeRowMenuId && !showBulkMenu) return undefined;
    const handleOutsideClick = (event) => {
      if (activeRowMenuId && rowActionMenuRef.current && !rowActionMenuRef.current.contains(event.target)) {
        setActiveRowMenuId(null);
      }
      if (showBulkMenu && bulkMenuRef.current && !bulkMenuRef.current.contains(event.target)) {
        setShowBulkMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [activeRowMenuId, showBulkMenu]);

  useEffect(() => {
    if (!selectedStudentIds.size || !filteredStudents.length) return;
    setSelectedStudentMap((current) => {
      let changed = false;
      const next = { ...current };
      filteredStudents.forEach((student) => {
        const id = String(student._id || '');
        if (id && selectedStudentIds.has(id) && next[id] !== student) {
          next[id] = student;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [filteredStudents, selectedStudentIds]);

  useEffect(() => {
    loadData();
    // loadData uses a request revision guard to ignore stale search responses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sortOrder, filters, currentPage, itemsPerPage, debouncedSearch, uploadBatchId]);

  useEffect(() => () => {
    credentialRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
  }, []);

  const totalPages = pagination.pages || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedStudents = filteredStudents;
  const pageStudentIds = useMemo(
    () => paginatedStudents.map((student) => String(student._id || '')).filter(Boolean),
    [paginatedStudents],
  );
  const selectedCount = selectedStudentIds.size;
  const selectedStudents = useMemo(
    () => Array.from(selectedStudentIds).map((id) => selectedStudentMap[id]).filter(Boolean),
    [selectedStudentIds, selectedStudentMap],
  );
  const selectedCredentialIds = useMemo(
    () => selectedStudents.filter((student) => student.canResendCredentials).map((student) => String(student._id)),
    [selectedStudents],
  );
  const selectedCredentialSkippedCount = Math.max(0, selectedCount - selectedCredentialIds.length);
  const isSendingCredentials = sendingCredentialIds.size > 0;
  const allPageSelected = pageStudentIds.length > 0 && pageStudentIds.every((id) => selectedStudentIds.has(id));
  const somePageSelected = pageStudentIds.some((id) => selectedStudentIds.has(id));

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const loadData = async () => {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;
    setIsLoading(true);
    setError("");
    try {
      if (activeTab === "students") {
        const data = await api.listAllStudents({
          search: debouncedSearch,
          sortOrder,
          ...filters,
          uploadBatchId,
          page: currentPage,
          limit: itemsPerPage,
        });
        if (loadRequestRef.current !== requestId) return;
        const responseStudents = Array.isArray(data.students) ? data.students : [];
        setStudents(responseStudents);
        setFacets((current) => data.facets || (Object.keys(current).length > 0 ? current : deriveStudentFacets(responseStudents)));

        let nextStudents = responseStudents;
        let nextPagination = data.pagination;
        if (!nextPagination) {
          const locallyFiltered = filterStudentsLocally(responseStudents, { search: debouncedSearch, ...filters });
          const pages = Math.max(1, Math.ceil(locallyFiltered.length / itemsPerPage));
          const page = Math.min(currentPage, pages);
          const offset = (page - 1) * itemsPerPage;
          nextStudents = locallyFiltered.slice(offset, offset + itemsPerPage);
          nextPagination = { page, pages, total: locallyFiltered.length, limit: itemsPerPage };
        }
        setFilteredStudents(nextStudents);
        setPagination(nextPagination);
        if (nextPagination.page !== currentPage) setCurrentPage(nextPagination.page);
      } else {
        const data = await api.listAllSpecialStudents('', sortOrder);
        if (loadRequestRef.current !== requestId) return;
        setSpecialStudents(data.students || []);
        setFilteredStudents(data.students || []);
        setPagination({ page: 1, pages: 1, total: data.count || data.students?.length || 0, limit: itemsPerPage });
      }
    } catch (err) {
      if (loadRequestRef.current === requestId) {
        setError(err.message || "Failed to load students");
      }
    } finally {
      if (loadRequestRef.current === requestId) setIsLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    clearSelection();
    setDebouncedSearch(searchQuery.trim());
    setCurrentPage(1);
  };

  const clearSearch = () => {
    clearSelection();
    setSearchQuery("");
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const updateFilter = (key, value) => {
    clearSelection();
    setFilters((current) => ({ ...current, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    clearSelection();
    setFilters(EMPTY_FILTERS);
    setCurrentPage(1);
    setShowFilters(false);
  };

  const clearSelection = () => {
    setSelectedStudentIds(new Set());
    setSelectedStudentMap({});
    setShowBulkMenu(false);
  };

  const toggleStudentSelection = (student, event) => {
    event?.stopPropagation();
    const id = String(student?._id || '');
    if (!id) return;

    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectedStudentMap((current) => {
      if (selectedStudentIds.has(id)) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: student };
    });
  };

  const toggleSelectPage = () => {
    if (!pageStudentIds.length) return;
    setSelectedStudentIds((current) => {
      const next = new Set(current);
      if (allPageSelected) {
        pageStudentIds.forEach((id) => next.delete(id));
      } else {
        pageStudentIds.forEach((id) => next.add(id));
      }
      return next;
    });
    setSelectedStudentMap((current) => {
      const next = { ...current };
      if (allPageSelected) {
        pageStudentIds.forEach((id) => delete next[id]);
      } else {
        paginatedStudents.forEach((student) => {
          const id = String(student._id || '');
          if (id) next[id] = student;
        });
      }
      return next;
    });
    setShowBulkMenu(false);
  };

  const selectAllFilteredStudents = async () => {
    try {
      setIsSelectingAllFiltered(true);
      const data = await api.listAllStudents({
        search: debouncedSearch,
        sortOrder,
        ...filters,
        uploadBatchId,
      });
      const matchingStudents = data.students || [];
      setSelectedStudentIds(new Set(matchingStudents.map((student) => String(student._id))));
      setSelectedStudentMap(Object.fromEntries(matchingStudents.map((student) => [String(student._id), student])));
      setShowBulkMenu(false);
      toast.success(`All ${matchingStudents.length} matching student${matchingStudents.length === 1 ? '' : 's'} selected.`);
    } catch (error) {
      toast.error(error.message || 'Failed to select filtered students.');
    } finally {
      setIsSelectingAllFiltered(false);
    }
  };

  const openStudentProfile = (student) => {
    navigate(`/admin/students/${student._id}`);
  };

  const handleCopyStudentValue = async (student, value, label, event) => {
    event?.stopPropagation();
    setActiveRowMenuId(null);
    const text = String(value || '').trim();
    if (!text) {
      toast.error(`${label} is not available.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
    } catch {
      toast.error(`Failed to copy ${label.toLowerCase()}.`);
    }
  };

  const handleSendCredentials = async (studentIds, event) => {
    event?.stopPropagation();
    setActiveRowMenuId(null);
    setShowBulkMenu(false);
    const ids = [...new Set(studentIds.map(String))];
    if (!ids.length) {
      toast.error('Select at least one eligible student.');
      return;
    }

    setSendingCredentialIds((current) => new Set([...current, ...ids]));
    try {
      const result = await api.resendStudentCredentials(ids);
      if (result.queued) toast.success(result.message);
      if (result.skipped) toast.error(`${result.skipped} student${result.skipped === 1 ? ' is' : 's are'} no longer eligible.`);
      await loadData();
      credentialRefreshTimersRef.current.forEach((timer) => clearTimeout(timer));
      credentialRefreshTimersRef.current = [3000, 8000, 15000, 30000].map((delay) => (
        setTimeout(() => loadData(), delay)
      ));
    } catch (err) {
      toast.error(err.message || 'Failed to send credential email.');
    } finally {
      setSendingCredentialIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
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
    setActiveRowMenuId(null);
    
    if (!confirm(`Are you sure you want to delete ${student.name}? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await api.deleteStudent(student._id);
      const deletedId = String(student._id || '');
      setSelectedStudentIds((current) => {
        if (!deletedId || !current.has(deletedId)) return current;
        const next = new Set(current);
        next.delete(deletedId);
        return next;
      });
      setSelectedStudentMap((current) => {
        if (!deletedId || !current[deletedId]) return current;
        const next = { ...current };
        delete next[deletedId];
        return next;
      });
      await loadData();
      toast.success(`Student ${student.name} has been deleted successfully.`);
    } catch (err) {
      toast.error(err.message || 'Failed to delete student');
    }
  };

  const handleEditStudent = (student, e) => {
    e.stopPropagation(); // Prevent row click from opening profile
    setActiveRowMenuId(null);
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

  const exportSingleStudentData = async (student, statsOverride = null) => {
    const s = student;
    let stats = statsOverride;
    if (!stats) {
      try { const d = await api.getStudentStatsByAdmin(s._id); stats = d.stats; } catch { /* export can continue without optional stats */ }
    }
    const rows = [
      ['Name','Student ID','Email','Course','Branch','College','Semester','Group','Coordinator','Courses Enrolled','Videos Watched','Problems Solved'],
      [s.name, s.studentId, s.email, s.course, s.branch, s.college, s.semester, s.group, s.teacherId,
       stats?.totalCoursesEnrolled ?? '', stats?.totalVideosWatched ?? '', stats?.problemsSolved ?? '']
    ];
    downloadCsv(rows, `student_${s.studentId || s._id}_${new Date().toISOString().slice(0,10)}.csv`);
    toast.success('Student data downloaded!');
  };

  const handleDownloadStudentData = async () => {
    if (!selectedStudent) return;
    await exportSingleStudentData(selectedStudent, studentStats);
  };

  const handleDownloadStudentRow = async (student, event) => {
    event?.stopPropagation();
    setActiveRowMenuId(null);
    await exportSingleStudentData(student);
  };

  const handleExportSelected = () => {
    if (!selectedStudents.length) {
      toast.error('Select at least one student to export.');
      return;
    }
    const rows = [
      ['Name', 'Student ID', 'Email', 'Course', 'Branch', 'College', 'Semester', 'Group', 'Coordinator'],
      ...selectedStudents.map((student) => [
        student.name,
        student.studentId,
        student.email,
        student.course,
        student.branch,
        student.college,
        student.semester,
        student.group,
        student.teacherId,
      ]),
    ];
    downloadCsv(rows, `selected-students-${new Date().toISOString().slice(0,10)}.csv`);
    setShowBulkMenu(false);
    toast.success(`${selectedStudents.length} selected student${selectedStudents.length === 1 ? '' : 's'} exported.`);
  };

  const handleBulkDeleteStudents = async () => {
    const ids = Array.from(selectedStudentIds);
    if (!ids.length) {
      toast.error('Select at least one student to delete.');
      return;
    }
    if (!confirm(`Delete ${ids.length} selected student${ids.length === 1 ? '' : 's'}? This action cannot be undone.`)) {
      setShowBulkMenu(false);
      return;
    }

    setIsBulkDeleting(true);
    setShowBulkMenu(false);
    try {
      const result = await api.bulkDeleteStudents(ids);
      clearSelection();
      await loadData();
      toast.success(`${result.deleted || ids.length} selected student${(result.deleted || ids.length) === 1 ? '' : 's'} deleted.`);
    } catch (err) {
      toast.error(err.message || 'Failed to delete selected students');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const result = await api.exportStudentsCsv({
        search: searchQuery.trim(),
        sortOrder,
        ...filters,
        uploadBatchId,
      });
      toast.success(`${result.count || pagination.total} matching student${(result.count || pagination.total) === 1 ? '' : 's'} exported.`);
    } catch (err) {
      toast.error(err.message || 'Failed to export students');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 pt-20 dark:bg-gray-950 flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex-1 w-full mx-auto px-3 py-3"
      >
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-slate-200 dark:border-gray-700 p-3 shadow-sm">
          
          {/* Header Section with Search and Sort */}
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 mb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${
                activeTab === "students" ? "bg-emerald-100 dark:bg-emerald-900" : "bg-indigo-100 dark:bg-indigo-900"
              }`}>
                <Users className={`w-4 h-4 ${
                  activeTab === "students" ? "text-emerald-600" : "text-indigo-600"
                }`} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-slate-900 dark:text-white">
                  {activeTab === "students" ? (uploadBatchName || "Student Database") : "Special Event Students"}
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-gray-400">
                  {pagination.total.toLocaleString()} {uploadBatchId ? 'students in this bulk list' : (debouncedSearch || activeFilterCount > 0 ? 'matching students' : 'registered students')}
                </p>
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
              <form onSubmit={handleSearch} className="min-w-[240px] flex-1 xl:max-w-sm">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name, ID, email, branch, course..."
                    value={searchQuery}
                    onChange={(e) => { clearSelection(); setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-9 text-xs text-slate-700 shadow-sm outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-900/40"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={clearSearch}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-slate-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      <X className="w-3 h-3 text-slate-500" />
                    </button>
                  )}
                </div>
              </form>

              <div className="relative min-w-[160px]">
                <Filter className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <select
                  value={filters.semester}
                  onChange={(event) => updateFilter('semester', event.target.value)}
                  className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs font-semibold text-slate-700 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-900/40"
                  aria-label="Filter by semester"
                >
                  <option value="">All semesters</option>
                  {semesterOptions.map((semester) => (
                    <option key={semester.value} value={semester.value}>
                      {semester.label}{Number.isFinite(semester.count) ? ` (${semester.count})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div ref={filterPanelRef} className="relative">
                <button
                  type="button"
                  onClick={() => setShowFilters((open) => !open)}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-semibold shadow-sm transition-colors ${showFilters || activeFilterCount > (filters.semester ? 1 : 0) ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'}`}
                  aria-expanded={showFilters}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-sky-600 px-1 text-[9px] text-white">{activeFilterCount}</span>
                  )}
                </button>

                {showFilters && (
                  <div className="absolute right-0 top-11 z-30 w-[min(680px,calc(100vw-7rem))] rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">Filter students</div>
                      </div>
                      <button
                        type="button"
                        onClick={clearFilters}
                        disabled={activeFilterCount === 0}
                        className="text-[10px] font-semibold text-sky-700 disabled:opacity-40 dark:text-sky-300"
                      >
                        Clear all
                      </button>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {advancedFilterDefinitions.map((definition) => (
                        <label key={definition.key} className="min-w-0">
                          <span className="mb-1 block text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-400">{definition.label}</span>
                          <select
                            value={filters[definition.key]}
                            onChange={(event) => updateFilter(definition.key, event.target.value)}
                            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          >
                            <option value="">{definition.allLabel}</option>
                            {definition.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}{Number.isFinite(option.count) ? ` (${option.count})` : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <select
                value={sortOrder}
                onChange={(e) => { clearSelection(); setSortOrder(e.target.value); setCurrentPage(1); }}
                className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:ring-sky-900/40"
                aria-label="Sort students"
              >
                <option value="asc">Oldest first</option>
                <option value="desc">Newest first</option>
              </select>

              <button
                onClick={handleExportCsv}
                disabled={isExporting || isLoading}
                title="Export the currently searched and filtered students"
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
              >
                {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isExporting ? 'Exporting...' : 'Export results'}
              </button>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-sky-500" aria-label="Loading students" />}
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
                {searchQuery || activeFilterCount > 0
                  ? "Try adjusting the current filters"
                  : "No students have been registered yet"}
              </p>
            </div>
          ) : (
            // Students Table (no tabs, clear and scannable)
            <div>
              <div className="mb-2 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50/70 px-2.5 py-2 dark:border-gray-700 dark:bg-gray-800/70 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    data-platform-menu-trigger
                    aria-expanded={showBulkMenu}
                    type="button"
                    onClick={toggleSelectPage}
                    disabled={!pageStudentIds.length}
                    className={`inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      allPageSelected
                        ? 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/30 dark:text-sky-300'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <span className={`flex h-4 w-4 items-center justify-center rounded border ${
                      allPageSelected || somePageSelected
                        ? 'border-sky-600 bg-sky-600 text-white'
                        : 'border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-800'
                    }`}>
                      {allPageSelected ? <CheckSquare className="h-3 w-3" /> : somePageSelected ? <span className="h-0.5 w-2 rounded bg-white" /> : null}
                    </span>
                    {allPageSelected ? 'Page selected' : 'Select page'}
                  </button>
                  <span className="text-xs font-medium text-slate-500 dark:text-gray-400">
                    {selectedCount > 0
                      ? `${selectedCount} selected`
                      : `${pageStudentIds.length} visible on this page`}
                  </span>
                  {selectedCount > 0 && selectedCount < pagination.total && (
                    <button
                      type="button"
                      onClick={selectAllFilteredStudents}
                      disabled={isSelectingAllFiltered}
                      className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
                    >
                      {isSelectingAllFiltered && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Select all {pagination.total.toLocaleString()} matching
                    </button>
                  )}
                  {selectedCount > 0 && selectedCount === pagination.total && (
                    <span className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      All {pagination.total.toLocaleString()} matching selected
                    </span>
                  )}
                  {selectedCount > 0 && (
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-xs font-semibold text-slate-500 transition hover:text-slate-800 dark:text-gray-400 dark:hover:text-gray-100"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div ref={bulkMenuRef} className="relative self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setShowBulkMenu((open) => !open)}
                    disabled={isBulkDeleting || isSendingCredentials}
                    title="Bulk actions"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    {isBulkDeleting || isSendingCredentials ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                  </button>

                  {showBulkMenu && (
                    <div className="absolute right-0 top-9 z-40 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900">
                      <button
                        type="button"
                        onClick={selectAllFilteredStudents}
                        disabled={isSelectingAllFiltered || pagination.total === 0}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-indigo-700 transition hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/30"
                      >
                        {isSelectingAllFiltered ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" />}
                        Select all {pagination.total.toLocaleString()} matching
                      </button>
                      <button
                        type="button"
                        onClick={handleExportSelected}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                      >
                        <FileDown className="h-4 w-4 text-emerald-600" />
                        Export selected CSV
                      </button>
                      <button
                        type="button"
                        onClick={(event) => handleSendCredentials(selectedCredentialIds, event)}
                        disabled={!selectedCredentialIds.length}
                        title={!selectedCredentialIds.length ? 'Only students who have never logged in and have no credential email currently pending are eligible' : undefined}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-sky-700 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-45 dark:text-sky-300 dark:hover:bg-sky-950/30"
                      >
                        <Mail className="h-4 w-4" />
                        <span className="min-w-0">
                          <span className="block">Send credential mail</span>
                          <span className="block text-[10px] font-normal opacity-75">
                            {selectedCredentialIds.length} eligible of {selectedCount} selected
                          </span>
                        </span>
                      </button>
                      {selectedCredentialSkippedCount > 0 && (
                        <div className="mx-2 mb-1 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] leading-4 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                          {selectedCredentialSkippedCount} skipped: already logged in or credential email currently pending.
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleBulkDeleteStudents}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                      >
                        <UserX className="h-4 w-4" />
                        Delete selected
                      </button>
                      <button
                        type="button"
                        onClick={clearSelection}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <X className="h-4 w-4" />
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 dark:border-gray-700">
              <table className="min-w-full divide-y divide-slate-200" style={{ '--serial-start': startIndex }}>
                <thead className="bg-slate-50 dark:bg-gray-700">
                  <tr>
                    <th scope="col" className="w-10 px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={toggleSelectPage}
                        aria-label={allPageSelected ? 'Unselect visible students' : 'Select visible students'}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800"
                      />
                    </th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Student</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Email</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Branch</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Course</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Semester</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Group</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">College</th>
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Coordinator</th>
                    {activeTab === "students" && (
                      <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Status</th>
                    )}
                    <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Credential Mail</th>
                    {activeTab === "students" && (
                      <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-slate-500 dark:text-gray-300">Actions</th>
                    )}
                    {activeTab === "special" && (
                      <th scope="col" className="px-4 py-2 text-left text-xs font-semibold tracking-wider text-slate-600 dark:text-white">Special Events</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                  {paginatedStudents.map((s) => {
                    const initial = s.name?.charAt(0)?.toUpperCase() || "?";
                    const studentId = String(s._id || '');
                    const isSelected = selectedStudentIds.has(studentId);
                    return (
                      <tr key={s._id} className={`${isSelected ? 'bg-sky-50/70 dark:bg-sky-950/20' : ''} hover:bg-slate-50 dark:hover:bg-gray-700`}>
                        <td className="px-3 py-1.5 align-middle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(event) => toggleStudentSelection(s, event)}
                            onClick={(event) => event.stopPropagation()}
                            aria-label={`Select ${s.name || 'student'}`}
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 dark:border-gray-600 dark:bg-gray-800"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-2 min-w-[190px]">
                            {s.avatarUrl ? (
                              <img 
                                src={s.avatarUrl} 
                                alt={s.name} 
                                className="h-7 w-7 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold text-xs ${
                                activeTab === "students" ? "bg-sky-100 text-sky-700" : "bg-indigo-100 text-indigo-700"
                              }`}>
                                {initial}
                              </div>
                            )}
                            <div className="max-w-[220px] leading-tight">
                              <button
                                onClick={() => openStudentProfile(s)}
                                className="block max-w-full truncate text-left text-xs font-semibold text-slate-900 transition-colors hover:text-sky-600 dark:text-white dark:hover:text-sky-400"
                              >
                                {s.name || "Unknown"}
                              </button>
                              <div className="truncate text-[10px] text-slate-500 dark:text-gray-400">{s.studentId || "N/A"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="max-w-[230px] px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300"><span className="block truncate">{s.email || "-"}</span></td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{s.branch || "-"}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{s.course || "-"}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{s.semester ? `Sem ${s.semester}` : "-"}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{s.group || "-"}</td>
                        <td className="max-w-[180px] px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300"><span className="block truncate">{s.college || "-"}</span></td>
                        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-gray-300">{s.teacherId || "-"}</td>
                        {activeTab === "students" && (
                          <td className="px-3 py-1.5 text-xs">
                            {s.loginStatus === 'active' ? (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />Awaiting login
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-1.5 text-xs">
                          {s.credentialEmailStatus === 'sent' ? (
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Sent</span>
                          ) : s.credentialEmailStatus === 'pending' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"><Loader2 className="h-3 w-3 animate-spin" />Sending</span>
                          ) : s.credentialEmailStatus === 'failed' ? (
                            <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">Failed</span>
                          ) : s.credentialEmailStatus === 'unconfirmed' ? (
                            <span title="This email may have been sent before delivery tracking was added" className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Unconfirmed</span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-gray-700 dark:text-gray-300">Not sent</span>
                          )}
                        </td>
                        {activeTab === "students" && (
                          <td className="px-3 py-1.5">
                            <div
                              ref={activeRowMenuId === studentId ? rowActionMenuRef : null}
                              className="relative flex items-center justify-end"
                            >
                              <button
                                data-platform-menu-trigger
                                aria-expanded={activeRowMenuId === studentId}
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setShowBulkMenu(false);
                                  setActiveRowMenuId((current) => current === studentId ? null : studentId);
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
                                title="Student actions"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </button>

                              {activeRowMenuId === studentId && (
                                <div data-platform-action-menu className="absolute right-0 top-8 z-40 w-52 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-left shadow-xl dark:border-gray-700 dark:bg-gray-900">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      setActiveRowMenuId(null);
                                      openStudentProfile(s);
                                    }}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    <Eye className="h-4 w-4 text-sky-600" />
                                    View profile
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => handleEditStudent(s, event)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    <Edit2 className="h-4 w-4 text-blue-600" />
                                    Edit details
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => handleCopyStudentValue(s, s.email, 'Email', event)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    <ClipboardCopy className="h-4 w-4 text-slate-500" />
                                    Copy email
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => handleCopyStudentValue(s, s.studentId, 'Student ID', event)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    <ClipboardCopy className="h-4 w-4 text-slate-500" />
                                    Copy student ID
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => handleDownloadStudentRow(s, event)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:text-gray-200 dark:hover:bg-gray-800"
                                  >
                                    <FileDown className="h-4 w-4 text-emerald-600" />
                                    Download data
                                  </button>
                                  {s.canResendCredentials && s.loginStatus !== 'active' && (
                                    <button
                                      type="button"
                                      onClick={(event) => handleSendCredentials([studentId], event)}
                                      disabled={sendingCredentialIds.has(studentId)}
                                      className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-50 disabled:opacity-50 dark:text-sky-300 dark:hover:bg-sky-950/30"
                                    >
                                      {sendingCredentialIds.has(studentId)
                                        ? <Loader2 className="h-4 w-4 animate-spin" />
                                        : <Mail className="h-4 w-4" />}
                                      Send credential mail
                                    </button>
                                  )}
                                  <div className="my-1 border-t border-slate-100 dark:border-gray-800" />
                                  <button
                                    type="button"
                                    onClick={(event) => handleDeleteStudent(s, event)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Delete student
                                  </button>
                                </div>
                              )}
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
              <div className="mt-3 flex flex-col items-center justify-between gap-2 px-1 sm:flex-row">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-gray-400">
                  <span>Show</span>
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  <span>
                    {startIndex + 1}-{Math.min(endIndex, pagination.total)} of {pagination.total.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="min-w-24 text-center text-xs font-medium text-slate-600 dark:text-gray-300">Page {currentPage} of {totalPages}</span>

                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
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
