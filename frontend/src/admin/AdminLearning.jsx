import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import socketService from '../utils/socket';
import { ChevronDown, ChevronRight, BookOpen, X, GraduationCap, Edit2, Trash2, Plus, Save } from 'lucide-react';
import { useToast } from '../components/CustomToast';
import { useNavigate } from 'react-router-dom';

export default function AdminLearning() {
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [editingSemester, setEditingSemester] = useState(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    loadSemesters();
  }, []);

  // Socket.IO real-time synchronization
  useEffect(() => {
    socketService.connect();

    const handleLearningUpdate = (data) => {

      loadSemesters();
    };

    socketService.on('learning-updated', handleLearningUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
    };
  }, []);

  const loadSemesters = async () => {
    try {
      setLoading(true);
      const data = await api.getAllSemestersForStudent();
      
      // Sort semesters by number (Semester 1, Semester 2, etc.)
      const sortedSemesters = data.sort((a, b) => {
        const numA = parseInt(a.semesterName.match(/\d+/)?.[0] || '999');
        const numB = parseInt(b.semesterName.match(/\d+/)?.[0] || '999');
        return numA - numB;
      });
      
      setSemesters(sortedSemesters);
    } catch (error) {
      console.error('Error loading semesters:', error);
      toast.error('Failed to load semesters');
    } finally {
      setLoading(false);
    }
  };

  const handleSemesterClick = (semester) => {
    if (!editMode) {
      setSelectedSemester(semester);
    }
  };

  const closeModal = () => {
    setSelectedSemester(null);
    setExpandedSubjects({});
  };

  const toggleSubject = (subjectKey) => {
    setExpandedSubjects(prev => ({
      ...prev,
      [subjectKey]: !prev[subjectKey]
    }));
  };

  const handleTeacherClick = (semesterName, subjectName, coordinator) => {
    navigate(`/admin/learning/${encodeURIComponent(semesterName)}/${encodeURIComponent(subjectName)}/${coordinator.coordinatorId}`, {
      state: {
        semesterId: coordinator.semesterId,
        subjectId: coordinator.subjectId,
        coordinatorName: coordinator.coordinatorName,
        coordinatorId: coordinator.coordinatorId
      }
    });
  };

  const handleDeleteSemester = async (semester, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${semester.semesterName}" and all its content?`)) return;
    try {
      const semesterId = semester.semesterId || semester._id;
      await api.deleteSemester(semesterId);
      toast.success('Semester deleted');
      loadSemesters();
    } catch (err) {
      console.error('Failed to delete semester:', err);
      toast.error('Failed to delete semester');
    }
  };

  const handleUpdateSemester = async (semester) => {
    if (!editingSemester.semesterName.trim()) {
      toast.error('Semester name is required');
      return;
    }
    try {
      const semesterId = semester.semesterId || semester._id;
      await api.updateSemester(semesterId, {
        semesterName: editingSemester.semesterName,
        semesterDescription: editingSemester.semesterDescription
      });
      toast.success('Semester updated');
      setEditingSemester(null);
      loadSemesters();
    } catch (err) {
      console.error('Failed to update semester:', err);
      toast.error('Failed to update semester');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 pt-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-sky-500"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20 px-3 sm:px-4 pb-8">
      <div className="max-w-7xl mx-auto">
        {/* Header with Edit Toggle */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white mb-0.5">
              Learning Modules
            </h1>
            <p className="text-xs text-slate-500 dark:text-white">
              Manage all semesters, subjects, and teachers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shadow-sm ${
                editMode
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              {editMode ? (
                <>
                  <X className="w-3.5 h-3.5" />
                  Done
                </>
              ) : (
                <>
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Semesters Card Grid */}
        {semesters.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-12 text-center"
          >
            <div className="w-14 h-14 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2.5">
              <BookOpen className="w-7 h-7 text-slate-400 dark:text-gray-500" />
            </div>
            <p className="text-xs text-slate-600 dark:text-gray-400 font-medium">No courses available yet</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {semesters.map((semester, idx) => (
              <motion.div
                key={semester.semesterName}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => handleSemesterClick(semester)}
                className="group cursor-pointer relative"
              >
                {/* Edit Mode Controls */}
                {editMode && (
                  <div className="absolute top-1.5 right-1.5 flex gap-1 z-10" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setEditingSemester(semester)}
                      className="p-1 bg-white dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-sky-900 border border-slate-200 dark:border-gray-700 rounded-md transition-colors shadow-sm"
                      title="Edit"
                    >
                      <Edit2 className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                    </button>
                    <button
                      onClick={(e) => handleDeleteSemester(semester, e)}
                      className="p-1 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900 border border-slate-200 dark:border-gray-700 rounded-md transition-colors shadow-sm"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3 text-red-600 dark:text-red-400" />
                    </button>
                  </div>
                )}

                <div className="relative h-32 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden border-2 border-slate-200 dark:border-gray-700 hover:border-sky-400 dark:hover:border-sky-500">
                  {/* Subtle corner accent */}
                  <div className="absolute top-0 right-0 w-16 h-16 bg-sky-50 dark:bg-sky-900/20 rounded-bl-full"></div>
                  
                  {/* Content */}
                  <div className="relative h-full p-3 flex flex-col justify-between">
                    <div>
                      <div className="w-9 h-9 bg-sky-100 dark:bg-sky-900/40 rounded-lg flex items-center justify-center mb-2 group-hover:bg-sky-200 dark:group-hover:bg-sky-800/60 transition-colors">
                        <GraduationCap className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <h2 className="text-sm font-bold text-slate-800 dark:text-gray-100 mb-0.5">
                        {semester.semesterName}
                      </h2>
                      {semester.semesterDescription && (
                        <p className="text-slate-500 dark:text-gray-400 text-[10px] line-clamp-2 leading-tight">
                          {semester.semesterDescription}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-gray-400 text-[10px]">
                      <span className="font-medium px-1.5 py-0.5 bg-slate-100 dark:bg-gray-700 rounded text-[10px]">
                        {semester.subjects.length} {semester.subjects.length === 1 ? 'Subject' : 'Subjects'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-sky-500 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Subject Modal Popup */}
      <AnimatePresence>
        {selectedSemester && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeModal}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-xl max-h-[75vh] overflow-hidden border border-slate-200 dark:border-gray-700">
                {/* Modal Header */}
                <div className="sticky top-0 bg-white dark:bg-gray-800 px-4 py-3 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-slate-800 dark:text-gray-100">
                      {selectedSemester.semesterName}
                    </h2>
                    <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5">
                      {selectedSemester.subjects.length} {selectedSemester.subjects.length === 1 ? 'subject' : 'subjects'} available
                    </p>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-600 dark:text-gray-400" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="overflow-y-auto max-h-[calc(75vh-80px)] p-3">
                  {selectedSemester.subjects.length === 0 ? (
                    <div className="text-center py-10">
                      <div className="w-12 h-12 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-2">
                        <BookOpen className="w-6 h-6 text-slate-400 dark:text-gray-500" />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-gray-400 font-medium">No subjects available</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedSemester.subjects.map((subject) => {
                        const subjectKey = `${selectedSemester.semesterName}-${subject.subjectName}`;
                        return (
                          <div
                            key={subjectKey}
                            className="bg-slate-50 dark:bg-gray-700 rounded-lg overflow-hidden border border-slate-200 dark:border-gray-600"
                          >
                            {/* Subject Header */}
                            <div
                              onClick={() => toggleSubject(subjectKey)}
                              className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-slate-100 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="flex items-center space-x-2 flex-1 min-w-0">
                                <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <BookOpen className="w-3.5 h-3.5 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-xs truncate">
                                    {subject.subjectName}
                                  </h3>
                                  {subject.subjectDescription && (
                                    <p className="text-[10px] text-slate-500 dark:text-gray-400 mt-0.5 truncate">
                                      {subject.subjectDescription}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-1.5 flex-shrink-0 ml-2">
                                <span className="px-1.5 py-0.5 bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 rounded-full text-[10px] font-medium">
                                  {subject.coordinators.length} {subject.coordinators.length === 1 ? 'Teacher' : 'Teachers'}
                                </span>
                                {expandedSubjects[subjectKey] ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-gray-500" />
                                )}
                              </div>
                            </div>

                            {/* Teachers List */}
                            <AnimatePresence>
                              {expandedSubjects[subjectKey] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="border-t border-slate-200 dark:border-gray-600"
                                >
                                  <div className="p-2 space-y-1.5 bg-white dark:bg-gray-800">
                                    {subject.coordinators.map((coordinator) => (
                                      <motion.button
                                        key={coordinator.coordinatorId}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => handleTeacherClick(selectedSemester.semesterName, subject.subjectName, coordinator)}
                                        className="w-full flex items-center justify-between p-2 bg-slate-50 dark:bg-gray-700 rounded-md hover:bg-sky-50 dark:hover:bg-gray-600 border border-slate-200 dark:border-gray-600 hover:border-sky-300 dark:hover:border-sky-600 transition-all group"
                                      >
                                        <div className="flex items-center space-x-2">
                                          {coordinator.avatarUrl ? (
                                            <img
                                              src={coordinator.avatarUrl}
                                              alt={coordinator.coordinatorName || 'Teacher'}
                                              className="w-7 h-7 rounded-full object-cover border border-sky-200 dark:border-sky-700 shadow-sm"
                                            />
                                          ) : (
                                            <div className="w-7 h-7 bg-sky-500 rounded-full flex items-center justify-center text-white font-semibold text-xs shadow-sm">
                                              {coordinator.coordinatorName?.charAt(0).toUpperCase() || 'T'}
                                            </div>
                                          )}
                                          <div className="text-left">
                                            <p className="font-semibold text-slate-800 dark:text-gray-100 text-xs">
                                              {coordinator.coordinatorName || 'Teacher'}
                                            </p>
                                            <p className="text-[10px] text-slate-500 dark:text-gray-400">
                                              Click to view content
                                            </p>
                                          </div>
                                        </div>
                                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-gray-500 group-hover:text-sky-600 dark:group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all" />
                                      </motion.button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Edit Semester Modal */}
      <AnimatePresence>
        {editingSemester && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingSemester(null)}
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-4 border border-slate-200 dark:border-gray-700">
                <h3 className="text-base font-bold mb-3 text-slate-800 dark:text-gray-100">Edit Semester</h3>
                <input
                  type="text"
                  value={editingSemester.semesterName}
                  onChange={(e) => setEditingSemester({ ...editingSemester, semesterName: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-gray-600 rounded-md mb-2 text-xs text-slate-800 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  placeholder="Semester name"
                />
                <textarea
                  value={editingSemester.semesterDescription || ''}
                  onChange={(e) => setEditingSemester({ ...editingSemester, semesterDescription: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-gray-600 rounded-md mb-3 text-xs text-slate-800 dark:text-gray-100 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 resize-none"
                  rows="3"
                  placeholder="Description (optional)"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateSemester(editingSemester)}
                    className="flex-1 flex items-center justify-center gap-1 bg-sky-500 text-white px-3 py-1.5 rounded-md hover:bg-sky-600 text-xs font-medium transition-colors"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save
                  </button>
                  <button
                    onClick={() => setEditingSemester(null)}
                    className="flex-1 flex items-center justify-center gap-1 bg-slate-200 dark:bg-gray-700 text-slate-700 dark:text-gray-300 px-3 py-1.5 rounded-md hover:bg-slate-300 dark:hover:bg-gray-600 text-xs font-medium transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
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
