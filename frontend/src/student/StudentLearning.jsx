import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, BookOpen, Users, X, GraduationCap } from 'lucide-react';
import { api } from '../utils/api';
import socketService from '../utils/socket';
import { useToast } from '../components/CustomToast';
import { useNavigate } from 'react-router-dom';

export default function StudentLearning() {
  const toast = useToast();
  const [semesters, setSemesters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [expandedSubjects, setExpandedSubjects] = useState({});
  const navigate = useNavigate();

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
    setSelectedSemester(semester);
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
    navigate(`/student/learning/${encodeURIComponent(semesterName)}/${encodeURIComponent(subjectName)}/${coordinator.coordinatorId}`, {
      state: {
        semesterId: coordinator.semesterId,
        subjectId: coordinator.subjectId,
        coordinatorName: coordinator.coordinatorName,
        coordinatorId: coordinator.coordinatorId
      }
    });
  };

  // Semester card colors
  const cardColors = [
    'from-blue-500 to-blue-600',
    'from-purple-500 to-purple-600',
    'from-pink-500 to-pink-600',
    'from-indigo-500 to-indigo-600',
    'from-cyan-500 to-cyan-600',
    'from-teal-500 to-teal-600',
    'from-green-500 to-green-600',
    'from-yellow-500 to-yellow-600',
    'from-orange-500 to-orange-600',
    'from-red-500 to-red-600',
  ];

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
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-20 px-4 pb-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-slate-800 dark:text-gray-100 mb-1">
            Learning Modules
          </h1>
          <p className="text-sm text-slate-600 dark:text-gray-400">
            Select a semester to view available subjects and teachers
          </p>
        </motion.div>

        {/* Semesters Card Grid */}
        {semesters.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-slate-50 dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-12 text-center"
          >
            <div className="w-16 h-16 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-8 h-8 text-slate-400 dark:text-gray-500" />
            </div>
            <p className="text-sm text-slate-600 dark:text-gray-300 font-medium">No courses available yet</p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {semesters.map((semester, idx) => (
              <motion.div
                key={semester.semesterName}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => handleSemesterClick(semester)}
                className="group cursor-pointer"
              >
                <div className="relative h-36 bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 overflow-hidden border-2 border-slate-200 dark:border-gray-700 hover:border-sky-400 dark:hover:border-sky-500">
                  {/* Subtle corner accent */}
                  <div className="absolute top-0 right-0 w-20 h-20 bg-sky-50 dark:bg-sky-900/20 rounded-bl-full"></div>
                  
                  {/* Content */}
                  <div className="relative h-full p-4 flex flex-col justify-between">
                    <div>
                      <div className="w-11 h-11 bg-sky-100 dark:bg-sky-900/40 rounded-lg flex items-center justify-center mb-3 group-hover:bg-sky-200 dark:group-hover:bg-sky-800/60 transition-colors">
                        <GraduationCap className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                      </div>
                      <h2 className="text-base font-bold text-slate-800 dark:text-gray-100 mb-1">
                        {semester.semesterName}
                      </h2>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 dark:text-gray-300 text-xs">
                      <span className="font-medium px-2 py-1 bg-slate-100 dark:bg-gray-700 rounded">
                        {semester.subjects.length} {semester.subjects.length === 1 ? 'Subject' : 'Subjects'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-sky-500 group-hover:translate-x-0.5 transition-transform" />
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
                <div className="sticky top-0 bg-white dark:bg-gray-800 px-5 py-4 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800 dark:text-gray-100">
                      {selectedSemester.semesterName}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">
                      {selectedSemester.subjects.length} {selectedSemester.subjects.length === 1 ? 'subject' : 'subjects'} available
                    </p>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-600 dark:text-gray-400" />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="overflow-y-auto max-h-[calc(75vh-80px)] p-4">
                  {selectedSemester.subjects.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="w-14 h-14 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                        <BookOpen className="w-7 h-7 text-slate-400 dark:text-gray-500" />
                      </div>
                      <p className="text-sm text-slate-600 dark:text-gray-300 font-medium">No subjects available</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
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
                              className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-gray-600 transition-colors"
                            >
                              <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                                <div className="w-9 h-9 bg-sky-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                  <BookOpen className="w-4 h-4 text-white" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <h3 className="font-semibold text-slate-800 dark:text-gray-100 text-sm truncate">
                                    {subject.subjectName}
                                  </h3>
                                  {subject.subjectDescription && (
                                    <p className="text-xs text-slate-500 dark:text-gray-300 mt-0.5 truncate">
                                      {subject.subjectDescription}
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center space-x-2 flex-shrink-0 ml-3">
                                <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 rounded-full text-xs font-medium">
                                  {subject.coordinators.length} {subject.coordinators.length === 1 ? 'Teacher' : 'Teachers'}
                                </span>
                                {expandedSubjects[subjectKey] ? (
                                  <ChevronDown className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-slate-400 dark:text-gray-500" />
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
                                  <div className="p-3 space-y-2 bg-white dark:bg-gray-800">
                                    {subject.coordinators.map((coordinator) => (
                                      <motion.button
                                        key={coordinator.coordinatorId}
                                        whileHover={{ scale: 1.01 }}
                                        whileTap={{ scale: 0.99 }}
                                        onClick={() => handleTeacherClick(selectedSemester.semesterName, subject.subjectName, coordinator)}
                                        className="w-full flex items-center justify-between p-3 bg-slate-50 dark:bg-gray-700 rounded-lg hover:bg-sky-50 dark:hover:bg-gray-600 border border-slate-200 dark:border-gray-600 hover:border-sky-300 dark:hover:border-sky-600 transition-all group"
                                      >
                                        <div className="flex items-center space-x-2.5">
                                          <div className="w-9 h-9 bg-sky-500 rounded-full flex items-center justify-center text-white font-semibold text-sm shadow-sm">
                                            {coordinator.coordinatorName?.charAt(0).toUpperCase() || 'T'}
                                          </div>
                                          <div className="text-left">
                                            <p className="font-semibold text-slate-800 dark:text-gray-100 text-sm">
                                              {coordinator.coordinatorName || 'Teacher'}
                                            </p>
                                            <p className="text-xs text-slate-500 dark:text-gray-300">
                                              Click to view content
                                            </p>
                                          </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-slate-400 dark:text-gray-500 group-hover:text-sky-600 dark:group-hover:text-sky-400 group-hover:translate-x-0.5 transition-all" />
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
    </div>
  );
}
