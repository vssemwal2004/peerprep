/* eslint-disable no-unused-vars */
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import { 
  CheckCircle, 
  AlertCircle, 
  ArrowLeft, 
  Download, 
  Clock, 
  Users, 
  Search, 
  Calendar, 
  X, 
  Menu,
  FileText,
  BarChart3,
  Link2,
  Archive,
  RefreshCw,
  UserCheck,
  MoreVertical,
  Send,
  UserMinus
} from 'lucide-react';

// Event Card Component
const EventCard = ({ event, isActive, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={{ x: 6 }}
    transition={{ type: "spring", stiffness: 420, damping: 30 }}
    className={`p-3 rounded-lg bg-white dark:bg-gray-800 border transition-all duration-200 cursor-pointer ${
      isActive 
        ? "border-sky-500 dark:border-sky-400 ring-1 ring-sky-500 dark:ring-sky-400 bg-sky-50 dark:bg-sky-900/30" 
        : "border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-700"
    }`}
    onClick={onClick}
  >
    <div className="flex items-start gap-2">
      <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold text-slate-800 dark:text-white text-sm truncate">{event.name}</h3>
        <div className="text-xs text-slate-600 dark:text-white mt-1">
          <p>{new Date(event.startDate).toLocaleDateString()}</p>
        </div>
        {event.coordinatorName && (
          <div className="mt-1 text-xs text-slate-500 dark:text-white">
            <span className="font-medium">Coordinator:</span> {event.coordinatorName}
          </div>
        )}
        {event.isSpecial && (
          <span className="inline-block mt-1 text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
            Special
          </span>
        )}
      </div>
    </div>
  </motion.div>
);

// Stat Card Component
const StatCard = ({ icon: Icon, label, value, color = "indigo" }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.8 }}
    animate={{ opacity: 1, scale: 1 }}
    className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700"
  >
    <div className="flex items-center gap-2">
      <div className={`p-1.5 rounded bg-${color}-50`}>
        <Icon className={`w-3 h-3 text-${color}-600`} />
      </div>
      <div>
        <div className="text-xs text-slate-500 dark:text-white">{label}</div>
        <div className="font-semibold text-slate-800 dark:text-white text-sm">{value}</div>
      </div>
    </div>
  </motion.div>
);

// Pair Card Component
const PairCard = ({ pair, index }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay: 0.5 + index * 0.1 }}
    className="rounded-2xl border border-slate-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:hover:border-sky-700"
  >
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0 rounded-xl bg-indigo-50 p-3 dark:bg-indigo-950/30">
            <div className="truncate text-sm font-bold text-indigo-800 dark:text-indigo-300">
              {pair.interviewer?.name || pair.interviewer?.email}
            </div>
            <div className="mt-1 truncate text-xs text-slate-500 dark:text-gray-400">{pair.interviewer?.studentId || pair.interviewer?.email || 'No details'}</div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Mentor</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-gray-600 dark:bg-gray-700">→</div>
          <div className="min-w-0 rounded-xl bg-sky-50 p-3 dark:bg-sky-950/30">
            <div className="truncate text-sm font-bold text-sky-800 dark:text-sky-300">
              {pair.interviewee?.name || pair.interviewee?.email}
            </div>
            <div className="mt-1 truncate text-xs text-slate-500 dark:text-gray-400">{pair.interviewee?.studentId || pair.interviewee?.email || 'No details'}</div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">Candidate</div>
          </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-gray-700 dark:text-gray-300">
        <span className={`rounded-full px-2.5 py-1 font-semibold ${
          pair.status === 'completed' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
          pair.status === 'scheduled' ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300' :
          'bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300'
        }`}>
          {pair.status || (pair.scheduledAt ? 'Scheduled' : 'Pending')}
        </span>
        
        {pair.scheduledAt && (
          <span className="flex items-center gap-0.5">
            <Clock className="w-3 h-3" />
            {new Date(pair.scheduledAt).toLocaleString()}
          </span>
        )}
        
        {pair.meetingLink && (
          <a
            href={pair.meetingLink}
            className="flex items-center gap-0.5 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 underline"
            target="_blank"
            rel="noreferrer"
          >
            <Link2 className="w-3 h-3" />
            Meeting
          </a>
        )}
      </div>
    </div>
  </motion.div>
);

// Search and Filter Component
const EventSearchFilter = ({ searchQuery, setSearchQuery, eventTab, setEventTab }) => (
  <div className="space-y-3">
    <div className="relative">
      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-500 dark:text-gray-400" />
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search interviews..."
        className="w-full bg-slate-50 dark:bg-gray-700 border border-slate-300 dark:border-gray-600 pl-7 pr-7 py-2 rounded-lg focus:ring-1 focus:ring-sky-500 dark:focus:ring-sky-600 focus:border-sky-500 dark:focus:border-sky-600 text-slate-700 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-gray-400"
      />
      {searchQuery && (
        <button
          onClick={() => setSearchQuery("")}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
    
    <div className="flex gap-1 bg-slate-100 dark:bg-gray-700 p-1 rounded">
      {['all', 'active', 'upcoming', 'previous'].map(tab => (
        <button
          key={tab}
          onClick={() => setEventTab(tab)}
          className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${
            eventTab === tab
              ? 'bg-white dark:bg-gray-800 text-sky-600 dark:text-sky-400 shadow-sm'
              : 'text-slate-600 dark:text-white hover:text-slate-800 dark:hover:text-white'
          }`}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      ))}
    </div>
  </div>
);

// Main Component
export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [eventCreatedMsg, setEventCreatedMsg] = useState("");
  const [event, setEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [activeEventId, setActiveEventId] = useState(id);
  const [searchQuery, setSearchQuery] = useState("");
  const [pairs, setPairs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [eventTab, setEventTab] = useState('all');
  const [participants, setParticipants] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [globalParticipantMenuOpen, setGlobalParticipantMenuOpen] = useState(false);
  const [participantMenuId, setParticipantMenuId] = useState('');
  const [activeDataView, setActiveDataView] = useState('students');

  const getBasePath = useCallback(() => {
    if (location.pathname.startsWith('/admin/interviews/past')) return '/admin/interviews/past';
    if (location.pathname.startsWith('/admin/interviews/scheduled')) return '/admin/interviews/scheduled';
    if (location.pathname.startsWith('/admin/interviews')) return '/admin/interviews';
    return '/admin/event';
  }, [location.pathname]);

  const load = useCallback(async (eventId) => {
    try {
      setLoading(true);
      setMsg('');
      const [allEvents] = await Promise.all([api.listEvents()]);
      setEvents(allEvents);

      let targetEventId = eventId || id;
      const isValidObjectId = (val) => /^[0-9a-fA-F]{24}$/.test(val || '');
      
      if (!targetEventId || targetEventId.startsWith(':') || !isValidObjectId(targetEventId)) {
        targetEventId = '';
      }

      if (!targetEventId && allEvents.length > 0) {
        targetEventId = allEvents[0]._id;
        setActiveEventId(targetEventId);
        const basePath = getBasePath();
        navigate(`${basePath}/${targetEventId}`, { replace: true });
      }

      if (targetEventId) {
        const [ev, an, pr, assigned] = await Promise.all([
          api.getEvent(targetEventId),
          api.getEventAnalytics(targetEventId),
          api.listPairs(targetEventId),
          api.listEventParticipants(targetEventId),
        ]);
        setEvent(ev);
        setAnalytics(an);
        setPairs(pr);
        setParticipants(assigned);
        setSelectedParticipantIds([]);
      } else {
        setEvent(null);
        setAnalytics(null);
        setPairs([]);
        setMsg('No interviews available. Please create one first.');
      }
    } catch (e) {
      setMsg(e.message || 'Failed to load event data');
      setEvent(null);
      setAnalytics(null);
      setPairs([]);
      setParticipants([]);
    } finally {
      setLoading(false);
    }
  }, [getBasePath, id, navigate]);

  useEffect(() => {
    if (window.history.state && window.history.state.usr && window.history.state.usr.eventCreated) {
      setEventCreatedMsg("Interview created successfully!");
      setTimeout(() => setEventCreatedMsg(""), 4000);
      // General interview assignment is finalized in the background immediately
      // after creation; refresh once so the new participant roster appears.
      setTimeout(() => load(activeEventId), 1800);
    }
    load(activeEventId);
  }, [activeEventId, load]);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/admin/interviews/past')) {
      setEventTab('previous');
    } else if (path.startsWith('/admin/interviews/scheduled')) {
      setEventTab('upcoming');
    } else if (path.startsWith('/admin/interviews')) {
      setEventTab('all');
    } else if (path.startsWith('/admin/event')) {
      setEventTab('all');
    }
  }, [location.pathname]);

  const listTitle = eventTab === 'previous' ? 'Past Interviews' : eventTab === 'upcoming' ? 'Scheduled Interviews' : 'Interviews';
  const backPath = getBasePath();

  // Filter events based on tab and search
  const now = new Date();
  const filteredEvents = events.filter(e => {
    const nameMatch = e.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!nameMatch) return false;
    if (eventTab === 'all') return true;
    if (eventTab === 'active') return new Date(e.startDate) <= now && new Date(e.endDate) >= now;
    if (eventTab === 'upcoming') return new Date(e.startDate) > now;
    if (eventTab === 'previous') return new Date(e.endDate) < now;
    return true;
  });

  const handleExportCsv = async () => {
    try {
      const csv = await api.exportParticipantsCsv(activeEventId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `participants_${activeEventId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('CSV exported successfully');
    } catch (e) {
      setMsg(e.message);
    }
  };

  const handleEventSelect = (eventId) => {
    setActiveEventId(eventId);
    const basePath = getBasePath();
    navigate(`${basePath}/${eventId}`);
    setIsMobileSidebarOpen(false);
  };

  const handleStatusChange = async (status) => {
    if (!activeEventId || status === event?.status) return;
    try {
      setActionBusy(true);
      await api.updateEventStatus(activeEventId, status);
      setMsg(`Interview moved to ${status} successfully`);
      await load(activeEventId);
    } catch (error) {
      setMsg(error.message || 'Unable to update interview status');
    } finally {
      setActionBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!activeEventId || !window.confirm('Archive this interview? Its audit history will be preserved.')) return;
    try {
      setActionBusy(true);
      await api.archiveEvent(activeEventId);
      setMsg('Interview archived successfully');
      setActiveEventId('');
      await load('');
    } catch (error) {
      setMsg(error.message || 'Unable to archive interview');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendInvitations = async (studentIds = []) => {
    try {
      setActionBusy(true);
      const result = await api.sendEventInvitations(activeEventId, studentIds);
      setMsg(result.message || 'Invitation emails queued successfully');
      setGlobalParticipantMenuOpen(false);
      setParticipantMenuId('');
      setTimeout(() => load(activeEventId), 600);
    } catch (error) {
      setMsg(error.message || 'Unable to send interview emails');
    } finally {
      setActionBusy(false);
    }
  };

  const handleRemoveParticipant = async (studentId) => {
    if (!window.confirm('Remove this student from the interview?')) return;
    try {
      setActionBusy(true);
      await api.removeEventParticipant(activeEventId, studentId, 'Removed by admin');
      setMsg('Student removed successfully');
      await load(activeEventId);
    } catch (error) {
      setMsg(error.message || 'Unable to remove student');
    } finally {
      setActionBusy(false);
      setParticipantMenuId('');
    }
  };

  const msgLower = msg ? msg.toLowerCase() : '';
  const isSuccessMsg = msgLower.includes('success') || msgLower.includes('created');
  const isInfoMsg = msgLower.includes('no scheduled interviews') || msgLower.includes('no interviews available') || msgLower.includes('no interviews found');

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center pt-20">
        <div className="text-slate-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-20">
      {eventCreatedMsg && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-6 py-2 rounded-lg shadow-lg z-50 text-base font-semibold">
          {eventCreatedMsg}
        </div>
      )}
      <div className="flex-1 w-full max-w-full mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-slate-200 dark:border-gray-700">
            <h1 className="text-lg font-semibold text-slate-800 dark:text-white">{listTitle}</h1>
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="p-1.5 rounded bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600"
            >
              {isMobileSidebarOpen ? <X className="w-4 h-4 dark:text-white" /> : <Menu className="w-4 h-4 dark:text-white" />}
            </button>
          </div>

          {/* Sidebar */}
          <AnimatePresence>
                  {(isMobileSidebarOpen || window.innerWidth >= 1024) && (
              <motion.div
                initial={{ x: window.innerWidth < 1024 ? "-100%" : 0 }}
                animate={{ x: 0 }}
                exit={{ x: window.innerWidth < 1024 ? "-100%" : 0 }}
                className={`lg:block lg:w-80 ${
                  window.innerWidth < 1024 
                    ? "fixed inset-0 top-20 z-30 bg-white p-4 overflow-y-auto" 
                    : "relative"
                }`}
              >
                <motion.div
                  whileHover={{ x: 8 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-4 h-[calc(100vh-8rem)] overflow-y-auto"
                >
                  <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-3">{listTitle}</h2>
                  
                  <EventSearchFilter 
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    eventTab={eventTab}
                    setEventTab={setEventTab}
                  />

                  <div className="mt-3 space-y-2">
                    {filteredEvents.length === 0 ? (
                      <div className="text-slate-500 dark:text-white text-sm text-center py-4">
                        No interviews found
                      </div>
                    ) : (
                      filteredEvents.map((e, idx) => (
                        <EventCard
                          key={e._id}
                          event={e}
                          isActive={activeEventId === e._id}
                          onClick={() => handleEventSelect(e._id)}
                        />
                      ))
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>          {/* Main Content */}
          <div className="flex-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3 sm:p-4 h-[calc(100vh-8rem)] overflow-y-auto">
              {event ? (
                <div className="space-y-3 sm:space-y-4">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <h1 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-gray-100">{event.name}</h1>
                          <span className="w-fit rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                            {event.status || 'published'}
                          </span>
                          {(event.startDate || event.endDate) && (
                            <div className="text-xs sm:text-sm text-slate-500 dark:text-gray-400 flex flex-col sm:flex-row sm:gap-2">
                              {event.startDate && (
                                <span>Starts: {new Date(event.startDate).toLocaleString()}</span>
                              )}
                              {event.endDate && (
                                <span>Ends: {new Date(event.endDate).toLocaleString()}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <p className="text-slate-600 dark:text-gray-400 text-xs sm:text-sm mt-0.5">{event.description}</p>
                      </div>
                    <Link
                      to={backPath}
                      className="flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 text-sm self-start sm:self-auto"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back to Interviews
                    </Link>
                  </div>

                  {/* Event Controls */}
                  

                  {/* Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                    <button
                      onClick={handleExportCsv}
                      className="px-3 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg font-medium text-sm hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                    <select
                      value={event.status || 'published'}
                      disabled={actionBusy}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      aria-label="Interview lifecycle status"
                    >
                      {['draft', 'scheduled', 'published', 'live', 'completed', 'cancelled'].map((status) => (
                        <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => load(activeEventId)}
                      className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${actionBusy ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleArchive}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-gray-800 dark:text-rose-300"
                    >
                      <Archive className="h-3.5 w-3.5" />
                      Archive
                    </button>
                  </div>

                  {/* Analytics */}
                  {analytics && (
                    <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                      <h3 className="font-medium text-slate-800 dark:text-gray-100 mb-3 flex items-center gap-1.5 text-sm">
                        <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        Interview Analytics
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                        <StatCard icon={UserCheck} label="Assigned" value={participants.filter((item) => item.assignmentStatus === 'assigned').length} color="indigo" />
                        <StatCard icon={Users} label="Joined" value={analytics.joined} color="sky" />
                        <StatCard icon={Link2} label="Pairs" value={analytics.pairs} color="emerald" />
                        <StatCard icon={Calendar} label="Scheduled" value={analytics.scheduled} color="indigo" />
                        <StatCard icon={FileText} label="Feedback" value={analytics.feedbackSubmissions} color="amber" />
                        <StatCard icon={BarChart3} label="Avg Score" value={analytics.averageScore} color="rose" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 dark:border-gray-700 dark:bg-gray-900/50">
                    <button
                      type="button"
                      onClick={() => setActiveDataView('students')}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition ${activeDataView === 'students' ? 'bg-white text-sky-700 shadow-sm ring-1 ring-slate-200 dark:bg-gray-800 dark:text-sky-300 dark:ring-gray-700' : 'text-slate-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-800/60'}`}
                    >
                      <span className="flex items-center gap-3"><UserCheck className="h-5 w-5" /><span><span className="block text-sm font-bold">Assigned Students</span><span className="mt-0.5 block text-xs font-medium opacity-70">Student directory and mail access</span></span></span>
                      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-700 dark:bg-sky-950/50 dark:text-sky-300">{participants.filter((item) => item.assignmentStatus === 'assigned').length}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDataView('pairs')}
                      className={`flex items-center justify-between rounded-xl px-4 py-3 text-left transition ${activeDataView === 'pairs' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200 dark:bg-gray-800 dark:text-emerald-300 dark:ring-gray-700' : 'text-slate-600 hover:bg-white/70 dark:text-gray-300 dark:hover:bg-gray-800/60'}`}
                    >
                      <span className="flex items-center gap-3"><Link2 className="h-5 w-5" /><span><span className="block text-sm font-bold">Interview Pairs</span><span className="mt-0.5 block text-xs font-medium opacity-70">Mentor and candidate mapping</span></span></span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{pairs.length}</span>
                    </button>
                  </div>

                  {activeDataView === 'students' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3 dark:border-gray-700">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Assigned Students</h3>
                        <p className="text-xs text-slate-500 dark:text-gray-400">Emails are manual. Send once, or resend when required.</p>
                      </div>
                      <div className="relative">
                        <button type="button" onClick={() => setGlobalParticipantMenuOpen((open) => !open)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700" aria-label="Participant bulk actions">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {globalParticipantMenuOpen && (
                          <div className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                            <button type="button" onClick={() => setSelectedParticipantIds(participants.filter((item) => item.assignmentStatus === 'assigned').map((item) => String(item.studentId?._id)))} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:text-white dark:hover:bg-gray-700">Select all students</button>
                            <button type="button" disabled={!selectedParticipantIds.length || actionBusy} onClick={() => handleSendInvitations(selectedParticipantIds)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:text-sky-300 dark:hover:bg-gray-700"><Send className="h-3.5 w-3.5" />Send/Resend selected ({selectedParticipantIds.length})</button>
                            <button type="button" disabled={actionBusy} onClick={() => handleSendInvitations([])} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40 dark:text-indigo-300 dark:hover:bg-gray-700"><Send className="h-3.5 w-3.5" />Send/Resend all</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="max-h-[32rem] overflow-auto">
                      {participants.filter((item) => item.assignmentStatus === 'assigned').length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-500">No students assigned.</div>
                      ) : (
                        <table className="w-full min-w-[960px] text-left text-xs">
                          <thead className="sticky top-0 bg-slate-50 text-slate-500 dark:bg-gray-900 dark:text-gray-400">
                            <tr>
                              <th className="w-14 px-4 py-3">
                                <input
                                  type="checkbox"
                                  aria-label="Select all assigned students"
                                  checked={participants.filter((item) => item.assignmentStatus === 'assigned').length > 0 && selectedParticipantIds.length === participants.filter((item) => item.assignmentStatus === 'assigned').length}
                                  onChange={(event) => setSelectedParticipantIds(event.target.checked ? participants.filter((item) => item.assignmentStatus === 'assigned').map((item) => String(item.studentId?._id)).filter(Boolean) : [])}
                                  className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                />
                              </th>
                              <th className="px-4 py-3">Student details</th>
                              <th className="px-4 py-3">Academic details</th>
                              <th className="px-4 py-3">Coordinator group</th>
                              <th className="px-4 py-3">Mail status</th>
                              <th className="px-4 py-3">Participation</th>
                              <th className="px-4 py-3 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {participants.filter((item) => item.assignmentStatus === 'assigned').map((item) => {
                              const student = item.studentId || {};
                              const studentId = String(student._id || '');
                              return (
                                <tr key={item._id} className={`border-t border-slate-100 transition hover:bg-sky-50/40 dark:border-gray-700 dark:hover:bg-sky-950/10 ${selectedParticipantIds.includes(studentId) ? 'bg-sky-50/60 dark:bg-sky-950/20' : ''}`}>
                                  <td className="px-4 py-4"><input className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" type="checkbox" checked={selectedParticipantIds.includes(studentId)} onChange={() => setSelectedParticipantIds((current) => current.includes(studentId) ? current.filter((id) => id !== studentId) : [...current, studentId])} /></td>
                                  <td className="px-4 py-4"><div className="font-bold text-slate-900 dark:text-white">{student.name || 'Unnamed student'}</div><div className="mt-1 text-slate-500">{student.studentId || 'No registration ID'}</div><div className="mt-0.5 text-slate-500">{student.email || 'No email'}</div></td>
                                  <td className="px-4 py-4 text-slate-600 dark:text-gray-300"><div className="font-semibold text-slate-800 dark:text-gray-200">Semester {student.semester || '-'}</div><div className="mt-1">{student.course || 'Course not set'} · {student.branch || 'Branch not set'}</div><div className="mt-0.5 text-slate-400">{student.college || 'College not set'}</div></td>
                                  <td className="px-4 py-4 text-slate-600 dark:text-gray-300"><div className="font-semibold">{student.group || 'No group'}</div></td>
                                  <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 font-semibold ${item.invitationStatus === 'sent' ? 'bg-emerald-50 text-emerald-700' : item.invitationStatus === 'failed' ? 'bg-rose-50 text-rose-700' : item.invitationStatus === 'pending' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{item.invitationStatus === 'sent' ? 'Sent' : item.invitationStatus === 'failed' ? 'Failed' : item.invitationStatus === 'pending' ? 'Queued' : 'Not sent'}</span></td>
                                  <td className="px-4 py-4 text-slate-600 dark:text-gray-300"><span className={`inline-flex items-center gap-1.5 font-semibold ${item.joinedAt ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}><span className={`h-2 w-2 rounded-full ${item.joinedAt ? 'bg-emerald-500' : 'bg-slate-300'}`} />{item.joinedAt ? 'Joined' : 'Not joined'}</span></td>
                                  <td className="relative px-4 py-4 text-right">
                                    <button type="button" onClick={() => setParticipantMenuId((current) => current === item._id ? '' : item._id)} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-gray-700"><MoreVertical className="h-4 w-4" /></button>
                                    {participantMenuId === item._id && (
                                      <div className="absolute right-8 top-8 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-800">
                                        <button type="button" disabled={actionBusy} onClick={() => handleSendInvitations([studentId])} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-semibold text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-gray-700"><Send className="h-3.5 w-3.5" />{item.invitationStatus === 'sent' ? 'Resend mail' : 'Send mail'}</button>
                                        <button type="button" disabled={actionBusy} onClick={() => handleRemoveParticipant(studentId)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-gray-700"><UserMinus className="h-3.5 w-3.5" />Remove student</button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Pairs Section */}
                  {activeDataView === 'pairs' && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-5 dark:border-gray-700 dark:bg-gray-900/30">
                    <div className="mb-4">
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">Interview Pairs</h3>
                      <p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">Each card clearly maps the mentor to the candidate with scheduling status.</p>
                    </div>
                    {pairs.length === 0 ? (
                      <div className="text-center py-4 text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-gray-700 rounded border border-slate-300 dark:border-gray-600 text-sm">
                        No pairs available for this event.
                      </div>
                    ) : (
                      <div className="max-h-[34rem] overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          {pairs.map((pair, idx) => (
                            <PairCard key={pair._id} pair={pair} index={idx} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="w-12 h-12 text-indigo-600 dark:text-indigo-400 mb-3" />
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100 mb-1">No Interview Selected</h3>
                  <p className="text-slate-600 dark:text-gray-400 text-sm max-w-md mb-3">
                    {msg || 'Select an interview from the sidebar or create a new one to get started.'}
                  </p>
                  <Link
                    to="/admin/event"
                    className="px-4 py-2 bg-sky-500 dark:bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-600 dark:hover:bg-sky-700 transition-colors text-sm"
                  >
                    Create New Interview
                  </Link>
                </div>
              )}

              {/* Message Alert */}
              <AnimatePresence>
                {msg && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className={`flex items-center justify-center p-2 rounded-lg mt-3 text-sm ${
                      isSuccessMsg
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : isInfoMsg
                          ? 'bg-slate-50 text-slate-700 border border-slate-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {isSuccessMsg ? (
                      <CheckCircle className="w-3 h-3 mr-1" />
                    ) : (
                      <AlertCircle className="w-3 h-3 mr-1" />
                    )}
                    {msg}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
