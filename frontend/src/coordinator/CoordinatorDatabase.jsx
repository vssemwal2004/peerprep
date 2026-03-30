import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import {
  BookOpen, Calendar, Loader2, AlertCircle, ChevronRight, Star,
  FileText, Video, Link as LinkIcon, CheckCircle, Menu, Database as DatabaseIcon,
  ExternalLink, Youtube
} from 'lucide-react';

const difficultyColors = {
  'easy': 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  'easy-medium': 'bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300',
  'medium': 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  'medium-hard': 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  'hard': 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
};

export default function CoordinatorDatabase() {
  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState(null);
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [error, setError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState('wide');

  useEffect(() => {
    loadSemesters();
  }, []);

  const loadSemesters = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listSemesters();
      // Handle different response formats
      let semesterList = [];
      if (Array.isArray(data)) {
        semesterList = data;
      } else if (data && Array.isArray(data.semesters)) {
        semesterList = data.semesters;
      } else if (data && Array.isArray(data.data)) {
        semesterList = data.data;
      }
      
      // Filter semesters that have at least one subject with data
      const semestersWithData = semesterList.filter(sem => 
        Array.isArray(sem.subjects) && sem.subjects.length > 0
      );
      
      setSemesters(semestersWithData);
      if (semestersWithData.length > 0 && !selectedSemester) {
        setSelectedSemester(semestersWithData[0]);
      }
    } catch (err) {
      console.error('Failed to load semesters:', err);
      setError('Failed to load registered courses. Please try again.');
      setSemesters([]); // Ensure semesters is always an array
    } finally {
      setLoading(false);
    }
  };

  const getSidebarWidthClass = () => {
    if (!isSidebarOpen) return 'w-0';
    switch (sidebarWidth) {
      case 'narrow': return 'w-64';
      case 'wide': return 'w-80';
      case 'extra-wide': return 'w-96';
      default: return 'w-80';
    }
  };

  const cycleSidebarWidth = () => {
    if (sidebarWidth === 'narrow') setSidebarWidth('wide');
    else if (sidebarWidth === 'wide') setSidebarWidth('extra-wide');
    else setSidebarWidth('narrow');
  };

  const handleSelectSemester = (semester) => {
    setSelectedSemester(semester);
    setExpandedSubjects(new Set());
    setExpandedChapters(new Set());
  };

  const toggleSubject = (subjectId) => {
    setExpandedSubjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(subjectId)) {
        newSet.delete(subjectId);
      } else {
        newSet.add(subjectId);
      }
      return newSet;
    });
  };

  const toggleChapter = (chapterId) => {
    setExpandedChapters(prev => {
      const newSet = new Set(prev);
      if (newSet.has(chapterId)) {
        newSet.delete(chapterId);
      } else {
        newSet.add(chapterId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen text-lg text-slate-800 dark:text-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-sky-500 dark:text-sky-400 animate-spin mx-auto mb-4" />
          <p className="text-lg text-slate-700 dark:text-gray-300 font-medium">Loading registered courses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-16">
      <div className="flex h-[calc(100vh-4rem)]">
        {/* LEFT SIDEBAR - Registered Courses */}
        <div className={`${getSidebarWidthClass()} transition-all duration-300 overflow-hidden border-r border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm`}>
          <div className="h-full flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                    <DatabaseIcon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Registered Courses</h2>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={cycleSidebarWidth}
                    className="p-2 bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                    title="Adjust Width"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-gray-400 font-medium">{semesters.length} course{semesters.length !== 1 ? 's' : ''} registered</p>
            </div>

            {/* Semester List */}
            <div className="flex-1 overflow-y-auto p-4">
              {!Array.isArray(semesters) || semesters.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-3">
                    <DatabaseIcon className="w-8 h-8 text-slate-400 dark:text-gray-500" />
                  </div>
                  <p className="text-slate-500 dark:text-gray-400 text-sm font-medium mb-1">No Courses Yet</p>
                  <p className="text-xs text-slate-400 dark:text-gray-500">Create a learning module to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {semesters.map((semester) => (
                    <button
                      key={semester._id}
                      onClick={() => handleSelectSemester(semester)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedSemester?._id === semester._id
                          ? 'bg-sky-50 dark:bg-sky-900/20 border-2 border-sky-500 dark:border-sky-400 shadow-sm'
                          : 'bg-slate-50 dark:bg-gray-700 border-2 border-transparent hover:border-slate-200 dark:hover:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-600'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className={`w-4 h-4 ${
                          selectedSemester?._id === semester._id
                            ? 'text-sky-600 dark:text-sky-400'
                            : 'text-slate-600 dark:text-gray-400'
                        }`} />
                        <span className={`font-semibold text-sm ${
                          selectedSemester?._id === semester._id
                            ? 'text-sky-700 dark:text-sky-300'
                            : 'text-slate-700 dark:text-gray-300'
                        }`}>
                          {semester.semesterName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full ${
                          selectedSemester?._id === semester._id
                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                            : 'bg-slate-200 dark:bg-gray-600 text-slate-600 dark:text-gray-400'
                        }`}>
                          {semester.subjects?.length || 0} Subject{semester.subjects?.length !== 1 ? 's' : ''}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full ${
                          selectedSemester?._id === semester._id
                            ? 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                            : 'bg-slate-200 dark:bg-gray-600 text-slate-600 dark:text-gray-400'
                        }`}>
                          {semester.subjects?.reduce((acc, s) => acc + (s.chapters?.length || 0), 0) || 0} Chapter{semester.subjects?.reduce((acc, s) => acc + (s.chapters?.length || 0), 0) !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MAIN CONTENT - Course Details */}
        <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                  className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-colors border border-slate-200 dark:border-gray-700"
                  title={isSidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                >
                  {isSidebarOpen ? <ChevronRight className="w-5 h-5 text-slate-600 dark:text-gray-400" /> : <Menu className="w-5 h-5 text-slate-600 dark:text-gray-400" />}
                </button>
                <div className="w-12 h-12 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-800 dark:text-gray-100">
                    {selectedSemester ? selectedSemester.semesterName : 'Select a Course'}
                  </h1>
                  {selectedSemester?.semesterDescription && (
                    <p className="text-sm text-slate-600 dark:text-gray-400 font-medium mt-0.5">{selectedSemester.semesterDescription}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Content */}
            {!selectedSemester ? (
              <div className="text-center py-20 text-slate-500 dark:text-gray-400">
                <div className="w-20 h-20 rounded-full bg-slate-100 dark:bg-gray-700 flex items-center justify-center mx-auto mb-4">
                  <DatabaseIcon className="w-10 h-10 text-slate-400 dark:text-gray-500" />
                </div>
                <p className="text-lg font-semibold text-slate-700 dark:text-gray-300 mb-1">No Course Selected</p>
                <p className="text-sm text-slate-500 dark:text-gray-400">Choose a course from the sidebar to view details</p>
              </div>
            ) : error ? (
              <div className="text-center py-20">
                <AlertCircle className="w-12 h-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
                <p className="text-lg text-red-600 dark:text-red-400 font-medium">{error}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Course Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">{selectedSemester.subjects?.length || 0}</p>
                        <p className="text-xs text-slate-600 dark:text-gray-400 font-medium">Total Subjects</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                        <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">
                          {selectedSemester.subjects?.reduce((acc, s) => acc + (s.chapters?.length || 0), 0) || 0}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-gray-400 font-medium">Total Chapters</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-slate-900 dark:text-gray-100">
                          {selectedSemester.subjects?.reduce((acc, s) => 
                            acc + (s.chapters?.reduce((chAcc, ch) => chAcc + (ch.topics?.length || 0), 0) || 0), 0
                          ) || 0}
                        </p>
                        <p className="text-xs text-slate-600 dark:text-gray-400 font-medium">Total Topics</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Subjects List */}
                {Array.isArray(selectedSemester.subjects) && selectedSemester.subjects.length > 0 ? (
                  <div className="space-y-4">
                    {selectedSemester.subjects.map((subject) => (
                      <SubjectCard
                        key={subject._id}
                        subject={subject}
                        isExpanded={expandedSubjects.has(subject._id)}
                        onToggle={() => toggleSubject(subject._id)}
                        expandedChapters={expandedChapters}
                        toggleChapter={toggleChapter}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 p-12 text-center">
                    <BookOpen className="w-14 h-14 text-slate-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-slate-500 dark:text-gray-400 font-medium">No subjects in this course yet</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SubjectCard({ subject, isExpanded, onToggle, expandedChapters, toggleChapter }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden"
    >
      <div
        className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100 mb-1">{subject.subjectName}</h3>
              {subject.subjectDescription && (
                <p className="text-slate-600 dark:text-gray-400 text-sm mb-2">{subject.subjectDescription}</p>
              )}
              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-500 dark:text-gray-400 font-medium">
                  {subject.chapters?.length || 0} chapter{subject.chapters?.length !== 1 ? 's' : ''}
                </span>
                <span className="text-slate-400 dark:text-gray-500">•</span>
                <span className="text-slate-500 dark:text-gray-400 font-medium">
                  {subject.chapters?.reduce((acc, ch) => acc + (ch.topics?.length || 0), 0) || 0} topic{subject.chapters?.reduce((acc, ch) => acc + (ch.topics?.length || 0), 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
              className="p-2 rounded-lg bg-slate-100 dark:bg-gray-700"
            >
              <ChevronRight className="w-5 h-5 text-slate-600 dark:text-gray-400" />
            </motion.div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-200 dark:border-gray-700"
          >
            <div className="p-4 bg-slate-50 dark:bg-gray-900 space-y-3">
              {Array.isArray(subject.chapters) && subject.chapters.length > 0 ? (
                subject.chapters.map((chapter) => (
                  <ChapterCard
                    key={chapter._id}
                    chapter={chapter}
                    isExpanded={expandedChapters.has(chapter._id)}
                    onToggle={() => toggleChapter(chapter._id)}
                  />
                ))
              ) : (
                <div className="text-center py-6">
                  <FileText className="w-10 h-10 text-slate-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-slate-500 dark:text-gray-400 text-sm">No chapters in this subject</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ChapterCard({ chapter, isExpanded, onToggle }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
      <div
        className="p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="text-base font-semibold text-slate-800 dark:text-gray-100 mb-1">{chapter.chapterName}</h4>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={`w-3 h-3 ${i < chapter.importanceLevel ? 'text-amber-500' : 'text-slate-300 dark:text-gray-600'}`}
                    fill={i < chapter.importanceLevel ? 'currentColor' : 'none'}
                  />
                ))}
              </div>
              <span className="text-xs text-slate-500 dark:text-gray-400 font-medium">
                ({chapter.topics?.length || 0} topics)
              </span>
            </div>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="p-1.5 rounded bg-slate-100 dark:bg-gray-700"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-gray-400" />
          </motion.div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-200 dark:border-gray-700"
          >
            <div className="p-3 bg-slate-50 dark:bg-gray-900">
              {Array.isArray(chapter.topics) && chapter.topics.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col style={{ width: '25%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '11%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '8%' }} />
                      <col style={{ width: '8%' }} />
                    </colgroup>
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-gray-700">
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Topic</th>
                        <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Problem Link</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Importance</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Difficulty</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Video</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                        <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Questions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900">
                      {chapter.topics.map((topic, idx) => (
                        <TopicRow
                          key={topic._id || idx}
                          topic={topic}
                          isLastRow={idx === chapter.topics.length - 1}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-slate-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-slate-500 dark:text-gray-400 text-xs">No topics in this chapter</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopicRow({ topic, isLastRow }) {
  const getDifficultyBadge = (difficulty) => {
    const colors = difficultyColors[difficulty] || difficultyColors['medium'];
    return (
      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${colors}`}>
        {difficulty}
      </span>
    );
  };

  return (
    <tr className={`border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors ${!isLastRow ? '' : 'border-b-0'}`}>
      {/* Topic Name */}
      <td className="py-3 px-4">
        <span className="text-sm font-medium text-slate-800 dark:text-gray-200">
          {topic.topicName}
        </span>
      </td>

      {/* Problem Link */}
      <td className="py-3 px-4">
        {topic.problemLink ? (
          <a
            href={topic.problemLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Solve
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-xs text-slate-400 dark:text-gray-500">No link</span>
        )}
      </td>

      {/* Importance */}
      <td className="py-3 px-4">
        <div className="flex items-center justify-center gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`w-3.5 h-3.5 ${
                i < (topic.importanceLevel || 3)
                  ? 'text-yellow-500 fill-yellow-500'
                  : 'text-slate-300 dark:text-gray-600'
              }`}
            />
          ))}
        </div>
      </td>

      {/* Difficulty */}
      <td className="py-3 px-4 text-center">
        {getDifficultyBadge(topic.difficultyLevel || topic.difficulty)}
      </td>

      {/* Video */}
      <td className="py-3 px-4 text-center">
        {topic.topicVideoLink ? (
          <a
            href={topic.topicVideoLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-9 h-9 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
            title="Watch Video"
          >
            <Youtube className="w-5 h-5" />
          </a>
        ) : (
          <span className="text-slate-300 dark:text-gray-600">—</span>
        )}
      </td>

      {/* Notes PDF */}
      <td className="py-3 px-4 text-center">
        {topic.notesPDF ? (
          <a
            href={topic.notesPDF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
            title="View Notes"
          >
            <FileText className="w-5 h-5" />
          </a>
        ) : (
          <span className="text-slate-300 dark:text-gray-600">—</span>
        )}
      </td>

      {/* Question PDF */}
      <td className="py-3 px-4 text-center">
        {topic.questionPDF ? (
          <a
            href={topic.questionPDF}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-9 h-9 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors shadow-sm"
            title="View Questions"
          >
            <FileText className="w-5 h-5" />
          </a>
        ) : (
          <span className="text-slate-300 dark:text-gray-600">—</span>
        )}
      </td>
    </tr>
  );
}
