import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  BarChart3,
  Users,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  BookOpen,
  UserX,
  Search,
  TrendingUp,
  AlertTriangle,
  Download
} from 'lucide-react';
import { api } from '../utils/api';

export default function LearningAnalyticsModal({ isOpen, onClose, semesterId, subjectId, subjectName }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedChapters, setExpandedChapters] = useState({});
  const [expandedTopics, setExpandedTopics] = useState({});
  const [activeTab, setActiveTab] = useState('overview'); // overview | chapters
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotVisited, setShowNotVisited] = useState({});

  useEffect(() => {
    if (isOpen && semesterId && subjectId) {
      loadAnalytics();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, semesterId, subjectId]);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getSubjectAnalytics(semesterId, subjectId);
      setAnalytics(data);
    } catch (e) {
      console.error('Failed to load analytics:', e);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const toggleChapter = (chapterId) => {
    setExpandedChapters(prev => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  const toggleTopic = (topicId) => {
    setExpandedTopics(prev => ({ ...prev, [topicId]: !prev[topicId] }));
  };

  const toggleNotVisited = (key) => {
    setShowNotVisited(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const filterStudents = (students) => {
    if (!searchQuery) return students;
    const q = searchQuery.toLowerCase();
    return students.filter(s =>
      (s.name && s.name.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q)) ||
      (s.studentId && s.studentId.toLowerCase().includes(q))
    );
  };

  const formatTime = (seconds) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const downloadNotStartedCsv = () => {
    if (!analytics?.notStartedStudents?.length) return;
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ['Student Name', 'Student ID', 'Email', 'Semester', 'Course', 'Branch'],
      ...analytics.notStartedStudents.map(s => [
        s.name || '', s.studentId || '', s.email || '',
        s.semester || '', s.course || '', s.branch || ''
      ])
    ];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `not_started_${(analytics.subjectName || subjectName || 'subject').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTopicNotWatchedCsv = (chapterName, topicName, students) => {
    if (!students?.length) return;
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = [
      ['Student Name', 'Student ID', 'Email', 'Semester', 'Course', 'Branch'],
      ...students.map(s => [
        s.name || '', s.studentId || '', s.email || '',
        s.semester || '', s.course || '', s.branch || ''
      ])
    ];
    const csv = rows.map(r => r.map(esc).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `not_watched_${topicName.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.4 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-sky-200 dark:border-gray-700 flex flex-col">
              {/* Header */}
              <div className="sticky top-0 bg-gradient-to-r from-sky-500 to-sky-600 px-4 sm:px-6 py-4 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
                    <BarChart3 className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-white">
                      Video Analytics
                    </h2>
                    <p className="text-sm text-white/90 font-medium">
                      {subjectName || analytics?.subjectName || 'Subject'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onClose}
                    className="p-2.5 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-24">
                    <div className="text-center">
                      <div className="animate-spin rounded-full h-12 w-12 border-3 border-sky-100 border-t-sky-500 mx-auto mb-4"></div>
                      <p className="text-sm text-slate-600 dark:text-gray-400 font-medium">Loading analytics data...</p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center py-24">
                    <div className="text-center">
                      <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-sm text-red-500 font-medium mb-4">{error}</p>
                      <button onClick={loadAnalytics} className="px-5 py-2.5 bg-sky-500 text-white rounded-lg text-sm font-medium hover:bg-sky-600 shadow-sm transition-colors">
                        Try Again
                      </button>
                    </div>
                  </div>
                ) : analytics ? (
                  <div className="p-5 sm:p-7 space-y-6">
                    {/* Overview Stats Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/30 dark:to-sky-800/30 rounded-xl p-4 border border-sky-200 dark:border-sky-700">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-9 h-9 bg-sky-500 rounded-lg flex items-center justify-center">
                            <Users className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-sky-700 dark:text-sky-300 uppercase tracking-wide">Total Students</span>
                        </div>
                        <p className="text-3xl font-bold text-sky-900 dark:text-sky-100">{analytics.totalStudents}</p>
                      </div>

                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/30 dark:to-emerald-800/30 rounded-xl p-4 border border-emerald-200 dark:border-emerald-700">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-9 h-9 bg-emerald-500 rounded-lg flex items-center justify-center">
                            <Eye className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">Watched Videos</span>
                        </div>
                        <p className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">{analytics.activeStudents}</p>
                      </div>

                      <div className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/30 rounded-xl p-4 border border-amber-200 dark:border-amber-700">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-9 h-9 bg-amber-500 rounded-lg flex items-center justify-center">
                            <BookOpen className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">Total Chapters</span>
                        </div>
                        <p className="text-3xl font-bold text-amber-900 dark:text-amber-100">{analytics.totalChapters}</p>
                      </div>

                      <div className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/30 dark:to-red-800/30 rounded-xl p-4 border border-red-200 dark:border-red-700">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-9 h-9 bg-red-500 rounded-lg flex items-center justify-center">
                            <UserX className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-red-700 dark:text-red-300 uppercase tracking-wide">Not Started</span>
                        </div>
                        <p className="text-3xl font-bold text-red-900 dark:text-red-100">{analytics.notStartedCount}</p>
                      </div>
                    </div>

                    {/* Engagement Progress Bar */}
                    <div className="bg-white dark:bg-gray-700/50 rounded-xl p-5 border border-sky-200 dark:border-gray-600 shadow-sm">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                          <span className="text-sm font-semibold text-slate-700 dark:text-gray-200">Overall Engagement</span>
                        </div>
                        <span className="text-lg font-bold text-sky-600 dark:text-sky-400">
                          {analytics.totalStudents > 0 ? Math.round((analytics.activeStudents / analytics.totalStudents) * 100) : 0}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-gray-600 rounded-full h-3">
                        <div
                          className="bg-gradient-to-r from-sky-500 to-sky-600 h-3 rounded-full transition-all duration-500 shadow-sm"
                          style={{ width: `${analytics.totalStudents > 0 ? Math.round((analytics.activeStudents / analytics.totalStudents) * 100) : 0}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-gray-400 mt-2">
                        <span className="font-semibold text-sky-600 dark:text-sky-400">{analytics.activeStudents}</span> out of <span className="font-semibold">{analytics.totalStudents}</span> students have watched videos
                      </p>
                    </div>

                    {/* Tab Switcher */}
                    <div className="flex items-center gap-2 bg-sky-50 dark:bg-gray-700 rounded-xl p-1.5 border border-sky-100 dark:border-gray-600">
                      <button
                        onClick={() => setActiveTab('overview')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                          activeTab === 'overview'
                            ? 'bg-sky-500 text-white shadow-md'
                            : 'text-slate-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400'
                        }`}
                      >
                        <TrendingUp className="w-4 h-4" />
                        Quick Overview
                      </button>
                      <button
                        onClick={() => setActiveTab('chapters')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                          activeTab === 'chapters'
                            ? 'bg-sky-500 text-white shadow-md'
                            : 'text-slate-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400'
                        }`}
                      >
                        <BookOpen className="w-4 h-4" />
                        Detailed View
                      </button>
                    </div>

                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-sky-400 dark:text-sky-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by student name, email, or ID..."
                        className="w-full pl-12 pr-4 py-3 bg-white dark:bg-gray-700 border-2 border-slate-200 dark:border-gray-600 rounded-xl text-sm text-slate-800 dark:text-gray-200 placeholder-slate-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-sky-400 focus:border-sky-400 outline-none transition-all"
                      />
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'overview' ? (
                      /* Chapter Overview */
                      <div className="space-y-4">
                        {analytics.chapters.map((chapter, idx) => {
                          const viewPercent = analytics.totalStudents > 0
                            ? Math.round((chapter.viewedByCount / analytics.totalStudents) * 100) : 0;
                          const completePercent = analytics.totalStudents > 0
                            ? Math.round((chapter.completedByCount / analytics.totalStudents) * 100) : 0;

                          return (
                            <div key={chapter.chapterId} className="bg-white dark:bg-gray-700/50 rounded-xl border-2 border-sky-100 dark:border-gray-600 overflow-hidden hover:border-sky-300 dark:hover:border-sky-700 transition-all">
                              <div className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex items-start gap-3">
                                    <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                                      <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                                    </div>
                                    <div>
                                      <h3 className="text-base font-bold text-slate-800 dark:text-gray-100 mb-1">
                                        Chapter {idx + 1}: {chapter.chapterName}
                                      </h3>
                                      <span className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30 px-2.5 py-1 rounded-full font-medium">
                                        <BookOpen className="w-3 h-3" />
                                        {chapter.totalTopics} Topics
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Progress Bars */}
                                <div className="space-y-3">
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                                        <Eye className="w-4 h-4" /> Students Who Watched
                                      </span>
                                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{chapter.viewedByCount} / {analytics.totalStudents} ({viewPercent}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-gray-600 rounded-full h-2.5">
                                      <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-2.5 rounded-full transition-all duration-500 shadow-sm" style={{ width: `${viewPercent}%` }} />
                                    </div>
                                  </div>
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4" /> Completed All Topics
                                      </span>
                                      <span className="text-sm font-bold text-sky-700 dark:text-sky-300">{chapter.completedByCount} / {analytics.totalStudents} ({completePercent}%)</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-gray-600 rounded-full h-2.5">
                                      <div className="bg-gradient-to-r from-sky-400 to-sky-500 h-2.5 rounded-full transition-all duration-500 shadow-sm" style={{ width: `${completePercent}%` }} />
                                    </div>
                                  </div>
                                </div>

                                {/* Not Visited Toggle */}
                                {chapter.notViewedStudents.length > 0 && (
                                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-gray-600">
                                    <button
                                      onClick={() => toggleNotVisited(`chapter-${chapter.chapterId}`)}
                                      className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-semibold transition-colors"
                                    >
                                      <UserX className="w-4 h-4" />
                                      {chapter.notViewedCount} students haven't watched this chapter
                                      {showNotVisited[`chapter-${chapter.chapterId}`] ? (
                                        <ChevronDown className="w-4 h-4" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4" />
                                      )}
                                    </button>
                                    <AnimatePresence>
                                      {showNotVisited[`chapter-${chapter.chapterId}`] && (
                                        <motion.div
                                          initial={{ height: 0, opacity: 0 }}
                                          animate={{ height: 'auto', opacity: 1 }}
                                          exit={{ height: 0, opacity: 0 }}
                                          className="overflow-hidden"
                                        >
                                          <div className="mt-3 bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                                            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-3">Students who haven't started:</p>
                                            <div className="flex flex-wrap gap-2">
                                              {filterStudents(chapter.notViewedStudents).map(student => (
                                                <span
                                                  key={student._id}
                                                  className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 rounded-lg text-xs font-medium text-slate-700 dark:text-gray-300 hover:shadow-sm transition-shadow"
                                                  title={`${student.email} | Semester ${student.semester || 'N/A'}`}
                                                >
                                                  <span className="w-5 h-5 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center text-[10px] font-bold text-red-600 dark:text-red-300 mr-2">
                                                    {student.name?.charAt(0)?.toUpperCase() || '?'}
                                                  </span>
                                                  {student.name || student.email}
                                                </span>
                                              ))}
                                              {filterStudents(chapter.notViewedStudents).length === 0 && (
                                                <p className="text-xs text-slate-500 dark:text-gray-400">No matching students found</p>
                                              )}
                                            </div>
                                          </div>
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* Detailed Chapter & Topic Analytics */
                      <div className="space-y-4">
                        {analytics.chapters.map((chapter) => (
                          <div key={chapter.chapterId} className="bg-white dark:bg-gray-700/50 rounded-xl border-2 border-sky-100 dark:border-gray-600 overflow-hidden">
                            {/* Chapter Header */}
                            <button
                              onClick={() => toggleChapter(chapter.chapterId)}
                              className="w-full flex items-center justify-between p-5 hover:bg-sky-50 dark:hover:bg-gray-600/50 transition-colors"
                            >
                              <div className="flex items-center gap-3">
                                {expandedChapters[chapter.chapterId] ? (
                                  <ChevronDown className="w-5 h-5 text-sky-500 dark:text-sky-400" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-sky-500 dark:text-sky-400" />
                                )}
                                <div className="w-10 h-10 bg-sky-100 dark:bg-sky-900/40 rounded-lg flex items-center justify-center">
                                  <BookOpen className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                                </div>
                                <div className="text-left">
                                  <h3 className="text-base font-bold text-slate-800 dark:text-gray-100">
                                    {chapter.chapterName}
                                  </h3>
                                  <p className="text-xs text-slate-500 dark:text-gray-400">
                                    {chapter.totalTopics} topics • {chapter.viewedByCount} watched • {chapter.completedByCount} completed
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="hidden sm:inline px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full text-xs font-semibold">
                                  {chapter.viewedByCount} viewed
                                </span>
                                <span className="hidden sm:inline px-2.5 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-full text-xs font-semibold">
                                  {chapter.notViewedCount} not started
                                </span>
                              </div>
                            </button>

                            {/* Topics */}
                            <AnimatePresence>
                              {expandedChapters[chapter.chapterId] && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t-2 border-sky-100 dark:border-gray-600"
                                >
                                  <div className="p-4 sm:p-5 space-y-3">
                                    {chapter.topics.map((topic, topicIdx) => (
                                      <div
                                        key={topic.topicId}
                                        className="bg-sky-50 dark:bg-gray-800 rounded-lg border border-sky-200 dark:border-gray-600 overflow-hidden hover:border-sky-300 dark:hover:border-sky-700 transition-all"
                                      >
                                        {/* Topic Header */}
                                        <button
                                          onClick={() => toggleTopic(topic.topicId)}
                                          className="w-full flex items-center justify-between p-4 hover:bg-sky-100 dark:hover:bg-gray-700 transition-colors"
                                        >
                                          <div className="flex items-center gap-2.5">
                                            {expandedTopics[topic.topicId] ? (
                                              <ChevronDown className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                                            ) : (
                                              <ChevronRight className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                                            )}
                                            <span className="text-sm font-semibold text-slate-800 dark:text-gray-200">
                                              Topic {topicIdx + 1}: {topic.topicName}
                                            </span>
                                            {topic.difficultyLevel && (
                                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                                topic.difficultyLevel === 'easy' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' :
                                                topic.difficultyLevel === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300' :
                                                topic.difficultyLevel === 'hard' ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300' :
                                                'bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400'
                                              }`}>
                                                {topic.difficultyLevel}
                                              </span>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-3 text-xs font-semibold">
                                            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                              <Eye className="w-4 h-4" /> {topic.viewedCount}
                                            </span>
                                            <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400">
                                              <CheckCircle2 className="w-4 h-4" /> {topic.completedCount}
                                            </span>
                                            <span className="flex items-center gap-1 text-red-500 dark:text-red-400">
                                              <EyeOff className="w-4 h-4" /> {topic.notViewedCount}
                                            </span>
                                          </div>
                                        </button>

                                        {/* Topic Details */}
                                        <AnimatePresence>
                                          {expandedTopics[topic.topicId] && (
                                            <motion.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: 'auto', opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              className="border-t border-sky-200 dark:border-gray-600"
                                            >
                                              <div className="p-4 space-y-4">
                                                {/* Viewed Students */}
                                                {topic.viewedStudents.length > 0 && (
                                                  <div>
                                                    <h5 className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                                                      <div className="w-6 h-6 bg-emerald-100 dark:bg-emerald-900/40 rounded-md flex items-center justify-center">
                                                        <Eye className="w-3.5 h-3.5" />
                                                      </div>
                                                      Students Who Watched ({topic.viewedCount})
                                                    </h5>
                                                    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-600">
                                                      <table className="w-full text-xs bg-white dark:bg-gray-800">
                                                        <thead>
                                                          <tr className="bg-slate-50 dark:bg-gray-700 border-b border-slate-200 dark:border-gray-600">
                                                            <th className="text-left py-3 px-3 text-slate-600 dark:text-gray-300 font-semibold">Student Name</th>
                                                            <th className="text-left py-3 px-3 text-slate-600 dark:text-gray-300 font-semibold hidden sm:table-cell">Email</th>
                                                            <th className="text-center py-3 px-3 text-slate-600 dark:text-gray-300 font-semibold">Status</th>
                                                            <th className="text-center py-3 px-3 text-slate-600 dark:text-gray-300 font-semibold hidden md:table-cell">Watch Time</th>
                                                            <th className="text-right py-3 px-3 text-slate-600 dark:text-gray-300 font-semibold">Last Watched</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody>
                                                          {filterStudents(topic.viewedStudents).map(student => (
                                                            <tr key={student._id} className="border-b border-slate-100 dark:border-gray-700 last:border-0 hover:bg-sky-50 dark:hover:bg-gray-700/50 transition-colors">
                                                              <td className="py-3 px-3">
                                                                <div className="flex items-center gap-2">
                                                                  <span className="w-7 h-7 bg-sky-100 dark:bg-sky-800 rounded-full flex items-center justify-center text-[10px] font-bold text-sky-600 dark:text-sky-300 flex-shrink-0">
                                                                    {student.name?.charAt(0)?.toUpperCase() || '?'}
                                                                  </span>
                                                                  <span className="font-semibold text-slate-800 dark:text-gray-200 truncate max-w-[150px]">{student.name}</span>
                                                                </div>
                                                              </td>
                                                              <td className="py-3 px-3 text-slate-600 dark:text-gray-400 truncate max-w-[180px] hidden sm:table-cell">{student.email}</td>
                                                              <td className="py-3 px-3 text-center">
                                                                {student.completed ? (
                                                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-full text-[10px] font-bold">
                                                                    <CheckCircle2 className="w-3 h-3" /> Completed
                                                                  </span>
                                                                ) : (
                                                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full text-[10px] font-bold">
                                                                    <Clock className="w-3 h-3" /> In Progress
                                                                  </span>
                                                                )}
                                                              </td>
                                                              <td className="py-3 px-3 text-center text-slate-700 dark:text-gray-300 font-semibold hidden md:table-cell">
                                                                {formatTime(student.videoWatchedSeconds)}
                                                              </td>
                                                              <td className="py-3 px-3 text-right text-slate-500 dark:text-gray-400 text-[10px] whitespace-nowrap">
                                                                {formatDate(student.lastAccessedAt)}
                                                              </td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                      {filterStudents(topic.viewedStudents).length === 0 && (
                                                        <p className="text-xs text-slate-400 dark:text-gray-500 text-center py-4">No matching students found</p>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}

                                                {/* Not Viewed Students */}
                                                {topic.notViewedStudents.length > 0 && (
                                                  <div>
                                                    <button
                                                      onClick={() => toggleNotVisited(`topic-${topic.topicId}`)}
                                                      className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-bold uppercase tracking-wide mb-3 transition-colors"
                                                    >
                                                      <div className="w-6 h-6 bg-red-100 dark:bg-red-900/40 rounded-md flex items-center justify-center">
                                                        <EyeOff className="w-3.5 h-3.5" />
                                                      </div>
                                                      Students Who Haven't Watched ({topic.notViewedCount})
                                                      {showNotVisited[`topic-${topic.topicId}`] ? (
                                                        <ChevronDown className="w-4 h-4" />
                                                      ) : (
                                                        <ChevronRight className="w-4 h-4" />
                                                      )}
                                                    </button>
                                                    <AnimatePresence>
                                                      {showNotVisited[`topic-${topic.topicId}`] && (
                                                        <motion.div
                                                          initial={{ height: 0, opacity: 0 }}
                                                          animate={{ height: 'auto', opacity: 1 }}
                                                          exit={{ height: 0, opacity: 0 }}
                                                          className="overflow-hidden"
                                                        >
                                                          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                                                            <div className="flex flex-wrap gap-2">
                                                              {filterStudents(topic.notViewedStudents).map(student => (
                                                                <span
                                                                  key={student._id}
                                                                  className="inline-flex items-center px-3 py-1.5 bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 rounded-lg text-xs font-medium text-slate-700 dark:text-gray-300 hover:shadow-sm transition-shadow"
                                                                  title={`${student.email} | Semester ${student.semester || 'N/A'} | ${student.course || ''} | ${student.branch || ''}`}
                                                                >
                                                                  <span className="w-5 h-5 bg-red-100 dark:bg-red-800 rounded-full flex items-center justify-center text-[10px] font-bold text-red-600 dark:text-red-300 mr-2 flex-shrink-0">
                                                                    {student.name?.charAt(0)?.toUpperCase() || '?'}
                                                                  </span>
                                                                  {student.name || student.email}
                                                                </span>
                                                              ))}
                                                              {filterStudents(topic.notViewedStudents).length === 0 && (
                                                                <p className="text-xs text-slate-500 dark:text-gray-400">No matching students found</p>
                                                              )}
                                                            </div>
                                                            {/* Download button — bottom right */}
                                                            <div className="flex justify-end mt-3">
                                                              <button
                                                                onClick={() => downloadTopicNotWatchedCsv(chapter.chapterName, topic.topicName, topic.notViewedStudents)}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                                                              >
                                                                <Download className="w-3.5 h-3.5" />
                                                                Download List
                                                              </button>
                                                            </div>
                                                          </div>
                                                        </motion.div>
                                                      )}
                                                    </AnimatePresence>
                                                  </div>
                                                )}

                                                {topic.viewedStudents.length === 0 && topic.notViewedStudents.length === 0 && (
                                                  <p className="text-sm text-slate-400 dark:text-gray-500 text-center py-4">No student data available for this topic</p>
                                                )}
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Subject-level Not Started Students */}
                    {analytics.notStartedStudents?.length > 0 && (
                      <div className="bg-white dark:bg-gray-700/50 rounded-xl border-2 border-red-200 dark:border-red-800 overflow-hidden hover:border-red-300 dark:hover:border-red-700 transition-all">
                        <button
                          onClick={() => toggleNotVisited('subject-not-started')}
                          className="w-full flex items-center justify-between p-5 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-11 h-11 bg-red-100 dark:bg-red-900/40 rounded-lg flex items-center justify-center">
                              <UserX className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <div className="text-left">
                              <h3 className="text-base font-bold text-red-700 dark:text-red-300">
                                Students Who Haven't Started This Subject
                              </h3>
                              <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                                {analytics.notStartedCount} students have not watched any videos yet
                              </p>
                            </div>
                          </div>
                          {showNotVisited['subject-not-started'] ? (
                            <ChevronDown className="w-5 h-5 text-red-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-red-500" />
                          )}
                        </button>
                        <AnimatePresence>
                          {showNotVisited['subject-not-started'] && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="border-t-2 border-red-200 dark:border-red-800 overflow-hidden"
                            >
                              <div className="p-5">
                                <div className="flex flex-wrap gap-2.5">
                                  {filterStudents(analytics.notStartedStudents).map(student => (
                                    <span
                                      key={student._id}
                                      className="inline-flex items-center px-4 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-sm font-medium text-slate-700 dark:text-gray-300 hover:shadow-md transition-shadow"
                                      title={`${student.email} | Semester ${student.semester || 'N/A'}`}
                                    >
                                      <span className="w-6 h-6 bg-red-200 dark:bg-red-800 rounded-full flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-300 mr-2 flex-shrink-0">
                                        {student.name?.charAt(0)?.toUpperCase() || '?'}
                                      </span>
                                      {student.name || student.email}
                                      {student.studentId && (
                                        <span className="ml-2 text-xs text-red-500 dark:text-red-400">({student.studentId})</span>
                                      )}
                                    </span>
                                  ))}
                                  {filterStudents(analytics.notStartedStudents).length === 0 && (
                                    <p className="text-sm text-slate-500 dark:text-gray-400">No matching students found</p>
                                  )}
                                </div>
                                {/* Download button — bottom right */}
                                <div className="flex justify-end mt-4">
                                  <button
                                    onClick={downloadNotStartedCsv}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                                  >
                                    <Download className="w-3.5 h-3.5" />
                                    Download List
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
