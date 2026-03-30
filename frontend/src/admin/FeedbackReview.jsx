/* eslint-disable no-unused-vars */
import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Filter, 
  RefreshCw, 
  GraduationCap, 
  Download, 
  Search,
  User,
  Users,
  FileText,
  School,
  Star,
  MessageSquare,
  X,
  Calendar,
  ChevronRight
} from 'lucide-react';

// Feedback Card Component for Mobile
const FeedbackCard = ({ feedback, onMarksClick, onCommentsClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3 space-y-2"
  >
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <h3 className="font-semibold text-slate-800 dark:text-white text-sm">{feedback.event}</h3>
        <p className="text-xs text-slate-500 dark:text-white mt-0.5">
          {new Date(feedback.submittedAt).toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onMarksClick?.(feedback)}
        className="flex items-center gap-1 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded cursor-pointer hover:bg-sky-100 dark:hover:bg-sky-900/60"
      >
        <Star className="w-3 h-3 text-sky-500 dark:text-sky-400" />
        <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">{(feedback.totalMarks ?? (feedback.marks <= 25 ? feedback.marks : Math.round((feedback.marks || 0) * 25 / 100)))}/25</span>
      </button>
    </div>

    <div className="grid grid-cols-1 gap-1.5 text-sm">
      <div className="flex items-center gap-1.5">
        <User className="w-3 h-3 text-emerald-500" />
        <div>
          <div className="text-xs text-slate-500 dark:text-white">Mentor</div>
          <div className="font-medium text-slate-800 dark:text-white text-sm">{feedback.interviewer}</div>
        </div>
      </div>
      
      <div className="flex items-center gap-1.5">
        <Users className="w-3 h-3 text-indigo-500" />
        <div>
          <div className="text-xs text-slate-500 dark:text-white">Candidate</div>
          <div className="font-medium text-slate-800 dark:text-white text-sm">{feedback.interviewee}</div>
        </div>
      </div>

      {feedback.intervieweeCollege && (
        <div className="flex items-center gap-1.5">
          <School className="w-3 h-3 text-amber-500" />
          <div>
            <div className="text-xs text-slate-500 dark:text-white">College</div>
            <div className="font-medium text-slate-800 dark:text-white text-sm">{feedback.intervieweeCollege}</div>
          </div>
        </div>
      )}
    </div>

    {feedback.comments && (
      <button
        type="button"
        onClick={() => onCommentsClick?.(feedback)}
        className="bg-slate-50 dark:bg-gray-700 rounded p-2 w-full text-left hover:bg-slate-100 dark:hover:bg-gray-600 cursor-pointer"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <MessageSquare className="w-3 h-3 text-slate-500 dark:text-white" />
          <div className="text-xs font-semibold text-slate-600 dark:text-white">Comments</div>
        </div>
        <p className="text-sm text-slate-700 dark:text-white line-clamp-2">{feedback.comments}</p>
      </button>
    )}
  </motion.div>
);

// Main Component
export default function FeedbackReview() {
  const [feedback, setFeedback] = useState([]);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [college, setCollege] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef(null);

  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [dialogMode, setDialogMode] = useState(null); // 'marks' | 'comments'

  const loadEvents = async () => {
    try { 
      const ev = await api.listEvents(); 
      setEvents(ev); 
    } catch (error) {
      console.error('Failed to load events:', error);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (selectedEventId) qs.set('eventId', selectedEventId);
      if (college) qs.set('college', college.trim());
      const list = await api.listFeedback(qs.toString());
      setFeedback(list);
      setMsg(list.length ? '' : 'No feedback records found');
    } catch (e) {
      setMsg(e.message || 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [selectedEventId, college]);

  useEffect(() => { 
    loadEvents(); 
  }, []);

  useEffect(() => { 
    load(); 
  }, [load]);

  const handleEventClick = (eventId) => {
    setSelectedEventId(eventId);
    setCollege('');
  };

  const reset = () => { 
    setSelectedEventId(''); 
    setCollege(''); 
    setTimeout(load, 0); 
  };

  const downloadCsv = async () => {
    try {
      const qs = new URLSearchParams();
      if (selectedEventId) qs.set('eventId', selectedEventId);
      if (college) qs.set('college', college.trim());
      const csv = await api.exportFilteredFeedbackCsv(qs.toString());
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const eventName = selectedEventId 
        ? events.find(e => e._id === selectedEventId)?.name || 'feedback'
        : 'all_feedback';
      a.download = `${eventName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`; 
      a.click();
      URL.revokeObjectURL(url);
      setMsg('CSV exported successfully');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { 
      setMsg(e.message || 'Failed to export CSV'); 
      setTimeout(() => setMsg(''), 3000);
    }
  };

  // Resizable sidebar logic
  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (e) => {
      if (isResizing) {
        const newWidth = e.clientX;
        if (newWidth >= 200 && newWidth <= 500) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      return () => {
        window.removeEventListener('mousemove', resize);
        window.removeEventListener('mouseup', stopResizing);
      };
    }
  }, [isResizing, resize, stopResizing]);

  const stats = {
    total: feedback.length,
    averageScore: feedback.length > 0 
      ? (
          feedback.reduce((sum, f) => {
            const baseMarks = f.totalMarks ?? (f.marks <= 25 ? f.marks : (f.marks || 0) * 25 / 100);
            return sum + (parseFloat(baseMarks) || 0);
          }, 0) / feedback.length
        ).toFixed(1)
      : 0,
    uniqueColleges: new Set(feedback.filter(f => f.intervieweeCollege).map(f => f.intervieweeCollege)).size
  };

  const selectedEvent = events.find(e => e._id === selectedEventId);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col lg:flex-row pt-14">
      {/* Left Sidebar - Events List (hidden on mobile by default) */}
      <div
        ref={sidebarRef}
        style={{ width: typeof window !== 'undefined' && window.innerWidth >= 1024 ? `${sidebarWidth}px` : '100%', height: 'auto' }}
        className="bg-white dark:bg-gray-800 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-gray-700 flex flex-col relative lg:h-[calc(100vh-3.5rem)]"
      >
        {/* Sidebar Header */}
        <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-1 sm:mb-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-sky-500 dark:bg-sky-600 rounded-lg flex items-center justify-center">
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
            </div>
            <h2 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-white">Events</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-white hidden sm:block">Select an event to view feedback</p>
        </div>

        {/* Events List */}
        <div className="flex-1 overflow-y-auto lg:overflow-x-hidden p-2 sm:p-3 space-y-2 flex lg:flex-col gap-2 overflow-x-auto">
          {/* All Events Option */}
          <motion.button
            onClick={() => handleEventClick('')}
            className={`w-full min-w-[140px] lg:min-w-0 text-left p-2 sm:p-3 rounded-lg border transition-all ${
              selectedEventId === ''
                ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 shadow-sm'
                : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:border-sky-200 dark:hover:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  All Events
                </h3>
                <p className="text-xs text-slate-500 dark:text-white mt-0.5">
                  View all feedback
                </p>
              </div>
              {selectedEventId === '' && (
                <ChevronRight className="w-4 h-4 text-sky-500 flex-shrink-0" />
              )}
            </div>
          </motion.button>

          {/* Individual Events */}
          {events.map((event, idx) => (
            <motion.button
              key={event._id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => handleEventClick(event._id)}
              className={`w-full min-w-[140px] lg:min-w-0 text-left p-2 sm:p-3 rounded-lg border transition-all ${
                selectedEventId === event._id
                  ? 'bg-sky-50 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 shadow-sm'
                  : 'bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:border-sky-200 dark:hover:border-sky-700 hover:bg-sky-50 dark:hover:bg-sky-900/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {event.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-white mt-0.5">
                    {new Date(event.startDate).toLocaleDateString()}
                  </p>
                </div>
                {selectedEventId === event._id && (
                  <ChevronRight className="w-4 h-4 text-sky-500 flex-shrink-0" />
                )}
              </div>
            </motion.button>
          ))}
        </div>

        {/* Resize Handle - only visible on desktop */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-sky-400 dark:hover:bg-sky-600 transition-colors hidden lg:block"
          onMouseDown={startResizing}
          style={{ cursor: isResizing ? 'col-resize' : 'ew-resize' }}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden lg:h-[calc(100vh-3.5rem)]">
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 sm:mb-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-800 dark:bg-indigo-600 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-gray-100">
                    {selectedEvent ? selectedEvent.name : 'All Feedback'}
                  </h1>
                  <p className="text-slate-600 dark:text-gray-400 text-xs sm:text-sm hidden sm:block">
                    {selectedEvent 
                      ? `Reviews for ${selectedEvent.name}`
                      : 'Review and analyze all interview feedback'
                    }
                  </p>
                </div>
              </div>
            
              {/* Stats */}
              <div className="flex gap-3 sm:gap-4">
                <div className="text-center">
                  <div className="text-base sm:text-lg font-semibold text-sky-600 dark:text-sky-400">{stats.total}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400">Total</div>
                </div>
                <div className="text-center">
                  <div className="text-base sm:text-lg font-semibold text-emerald-600 dark:text-emerald-400">{stats.averageScore}/25</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400">Avg Score</div>
                </div>
                <div className="text-center">
                  <div className="text-base sm:text-lg font-semibold text-indigo-600 dark:text-indigo-400">{stats.uniqueColleges}</div>
                  <div className="text-xs text-slate-500 dark:text-gray-400">Colleges</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Filters Section */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-700 p-4 mb-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-slate-700 dark:text-gray-300 mb-1">
                  Candidate College
                </label>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-500" />
                  <input 
                    value={college}
                    onChange={(e) => setCollege(e.target.value)}
                    placeholder="Search by college name..."
                    className="w-full bg-white dark:bg-gray-800 border border-slate-300 dark:border-gray-600 rounded-lg pl-7 pr-7 py-2 text-slate-700 dark:text-gray-100 text-sm focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-sky-500 dark:focus:border-sky-600 placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                  {college && (
                    <button
                      type="button"
                      onClick={() => setCollege('')}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="px-3 py-1.5 bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-200 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Clear Filters
                </button>

                <button
                  type="button"
                  onClick={load}
                  disabled={loading}
                  className="px-3 py-1.5 bg-white dark:bg-gray-700 border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-200 rounded-lg font-medium text-sm flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-gray-600 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  {loading ? 'Loading...' : 'Refresh'}
                </button>

                <button
                  type="button"
                  onClick={downloadCsv}
                  className="px-3 py-1.5 bg-emerald-500 dark:bg-emerald-600 text-white rounded-lg font-medium text-sm flex items-center gap-1 hover:bg-emerald-600 dark:hover:bg-emerald-700 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  Download CSV
                </button>
              </div>
            </div>
          </motion.div>

          {/* Message */}
          <AnimatePresence>
            {msg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className={`p-2 rounded-lg mb-3 text-sm ${
                  msg.includes('success') 
                    ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' 
                    : 'bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border border-sky-200 dark:border-sky-700'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  {msg}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <RefreshCw className="w-6 h-6 text-sky-500 animate-spin" />
            </div>
          ) : (
            <>
              {/* Mobile View - Cards */}
              <div className="lg:hidden space-y-2">
                {feedback.length === 0 ? (
                  <div className="text-center py-8 text-slate-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-slate-300 dark:border-gray-700">
                    <GraduationCap className="w-8 h-8 text-slate-400 dark:text-gray-500 mx-auto mb-2" />
                    <p className="text-sm">No feedback records found</p>
                    <p className="text-xs mt-0.5">Try adjusting your filters</p>
                  </div>
                ) : (
                  feedback.map((f, index) => (
                    <FeedbackCard
                      key={f.id || index}
                      feedback={f}
                      onMarksClick={(fb) => {
                        setSelectedFeedback(fb);
                        setDialogMode('marks');
                      }}
                      onCommentsClick={(fb) => {
                        setSelectedFeedback(fb);
                        setDialogMode('comments');
                      }}
                    />
                  ))
                )}
              </div>

              {/* Desktop View - Table */}
              <div className="hidden lg:block">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 overflow-hidden"
                >
                  {feedback.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 dark:text-gray-400">
                      <GraduationCap className="w-12 h-12 text-slate-400 dark:text-gray-500 mx-auto mb-2" />
                      <p className="text-sm">No feedback records found</p>
                      <p className="text-xs mt-0.5">Try adjusting your search filters or select a different event</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-gray-700 border-b border-slate-200 dark:border-gray-600">
                          <tr>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 dark:text-gray-300 uppercase tracking-wider">
                              Event
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              Mentor
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              Candidate
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              College
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              Marks
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              Comments
                            </th>
                            <th className="py-2 px-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                              Submitted
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-gray-700">
                          {feedback.map((f, index) => (
                            <motion.tr
                              key={f.id || index}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: index * 0.05 }}
                              className="hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              <td className="py-2 px-3 text-sm font-medium text-slate-900 dark:text-gray-100">
                                {f.event}
                              </td>
                              <td className="py-2 px-3 text-sm text-slate-700 dark:text-gray-300">
                                {f.interviewer}
                              </td>
                              <td className="py-2 px-3 text-sm text-slate-700 dark:text-gray-300">
                                {f.interviewee}
                              </td>
                              <td className="py-2 px-3 text-sm text-slate-700 dark:text-gray-300">
                                {f.intervieweeCollege || '-'}
                              </td>
                              <td className="py-2 px-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFeedback(f);
                                    setDialogMode('marks');
                                  }}
                                  className="flex items-center gap-1 hover:bg-slate-100 dark:hover:bg-gray-700 px-2 py-1 rounded cursor-pointer"
                                >
                                  <Star className="w-3 h-3 text-amber-500" />
                                  <span className="text-sm font-semibold text-slate-800 dark:text-gray-200">
                                    {(f.totalMarks ?? (f.marks <= 25 ? f.marks : Math.round((f.marks || 0) * 25 / 100)))}/25
                                  </span>
                                </button>
                              </td>
                              <td className="py-2 px-3 text-sm text-slate-700 dark:text-gray-300 max-w-xs">
                                {f.comments ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedFeedback(f);
                                      setDialogMode('comments');
                                    }}
                                    className="w-full text-left hover:bg-slate-100 dark:hover:bg-gray-700 px-2 py-1 rounded cursor-pointer"
                                  >
                                    <div className="truncate">{f.comments}</div>
                                  </button>
                                ) : (
                                  <span className="text-slate-400 dark:text-gray-500">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-sm text-slate-500 dark:text-gray-400">
                                {new Date(f.submittedAt).toLocaleDateString()}
                              </td>
                            </motion.tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail Dialog for Marks Distribution / Full Comments */}
      <AnimatePresence>
        {selectedFeedback && dialogMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-slate-200 dark:border-gray-700 max-w-md w-full mx-4"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  {dialogMode === 'marks' ? (
                    <Star className="w-4 h-4 text-amber-500" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-sky-500" />
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {dialogMode === 'marks' ? 'Marks Distribution' : 'Full Comments'}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-gray-400">
                      {selectedFeedback.interviewee} · {selectedFeedback.event}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFeedback(null);
                    setDialogMode(null);
                  }}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700"
                >
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>

              <div className="px-4 py-3">
                {dialogMode === 'marks' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700 dark:text-gray-200">Total</span>
                      <span className="font-semibold text-sky-600 dark:text-sky-400">
                        {(selectedFeedback.totalMarks ?? (selectedFeedback.marks <= 25 ? selectedFeedback.marks : Math.round((selectedFeedback.marks || 0) * 25 / 100)))}/25
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs">
                      {[{
                        key: 'integrity',
                        label: 'Integrity and Ethical Behavior',
                      }, {
                        key: 'communication',
                        label: 'Communication Skills',
                      }, {
                        key: 'preparedness',
                        label: 'Preparedness and Initiative',
                      }, {
                        key: 'problemSolving',
                        label: 'Problem Solving and Learning Ability',
                      }, {
                        key: 'attitude',
                        label: 'Attitude and Respect',
                      }].map((item) => (
                        <div
                          key={item.key}
                          className="flex items-center justify-between bg-slate-50 dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded px-3 py-1.5"
                        >
                          <span className="text-slate-700 dark:text-gray-200 mr-2 flex-1">
                            {item.label}
                          </span>
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {selectedFeedback[item.key] ?? '-'} / 5
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-800 dark:text-gray-100 whitespace-pre-wrap max-h-80 overflow-y-auto">
                    {selectedFeedback.comments || 'No comments provided.'}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}