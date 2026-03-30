/* eslint-disable no-unused-vars */
import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
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
  Link2
} from 'lucide-react';

// Event Card Component
const EventCard = ({ event, isActive, onClick }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
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
    className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 hover:shadow-sm transition-all duration-200"
  >
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="font-medium text-indigo-700 dark:text-indigo-400 text-sm truncate">
              {pair.interviewer?.name || pair.interviewer?.email}
            </div>
            <div className="text-xs text-slate-500 dark:text-white">Mentor</div>
          </div>
          
          <div className="text-slate-400 dark:text-white flex-shrink-0 text-xs">→</div>
          
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sky-700 dark:text-sky-400 text-sm truncate">
              {pair.interviewee?.name || pair.interviewee?.email}
            </div>
            <div className="text-xs text-slate-500 dark:text-white">Candidate</div>
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-1 text-xs text-slate-600 dark:text-white border-t border-slate-200 dark:border-gray-700 pt-1.5">
        <span className={`px-1.5 py-0.5 rounded ${
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
        placeholder="Search scheduled interviews..."
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
        navigate(`/admin/event/${targetEventId}`, { replace: true });
      }

      if (targetEventId) {
        const [ev, an, pr] = await Promise.all([
          api.getEvent(targetEventId),
          api.getEventAnalytics(targetEventId),
          api.listPairs(targetEventId),
        ]);
        setEvent(ev);
        setAnalytics(an);
        setPairs(pr);
      } else {
        setEvent(null);
        setAnalytics(null);
        setPairs([]);
                setMsg('No scheduled interviews available. Please create one first.');
      }
    } catch (e) {
      setMsg(e.message || 'Failed to load event data');
      setEvent(null);
      setAnalytics(null);
      setPairs([]);
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    if (window.history.state && window.history.state.usr && window.history.state.usr.eventCreated) {
      setEventCreatedMsg("Interview created successfully!");
      setTimeout(() => setEventCreatedMsg(""), 4000);
    }
    load(activeEventId);
  }, [activeEventId, load]);

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
    navigate(`/admin/event/${eventId}`);
    setIsMobileSidebarOpen(false);
  };

  const msgLower = msg ? msg.toLowerCase() : '';
  const isSuccessMsg = msgLower.includes('success') || msgLower.includes('created');
  const isInfoMsg = msgLower.includes('no scheduled interviews') || msgLower.includes('no interviews available') || msgLower.includes('no interviews found');

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center pt-16">
        <div className="text-slate-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-16">
      {eventCreatedMsg && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-6 py-2 rounded-lg shadow-lg z-50 text-base font-semibold">
          {eventCreatedMsg}
        </div>
      )}
      <div className="flex-1 w-full max-w-full mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-3 border border-slate-200 dark:border-gray-700">
                        <h1 className="text-lg font-semibold text-slate-800 dark:text-white">Scheduled Interviews</h1>
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
                    ? "fixed inset-0 top-16 z-30 bg-white p-4 overflow-y-auto" 
                    : "relative"
                }`}
              >
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-4 h-[calc(100vh-8rem)] overflow-y-auto">
                                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-3">Scheduled Interviews</h2>
                  
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
                </div>
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
                      to="/admin/event"
                      className="flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 text-sm self-start sm:self-auto"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back to Interviews
                    </Link>
                  </div>

                  {/* Event Controls */}
                  

                  {/* Quick Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportCsv}
                      className="px-3 py-2 bg-slate-600 dark:bg-slate-700 text-white rounded-lg font-medium text-sm hover:bg-slate-700 dark:hover:bg-slate-800 transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Export CSV
                    </button>
                  </div>

                  {/* Analytics */}
                  {analytics && (
                    <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                      <h3 className="font-medium text-slate-800 dark:text-gray-100 mb-3 flex items-center gap-1.5 text-sm">
                        <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        Interview Analytics
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        <StatCard icon={Users} label="Joined" value={analytics.joined} color="sky" />
                        <StatCard icon={Link2} label="Pairs" value={analytics.pairs} color="emerald" />
                        <StatCard icon={Calendar} label="Scheduled" value={analytics.scheduled} color="indigo" />
                        <StatCard icon={FileText} label="Feedback" value={analytics.feedbackSubmissions} color="amber" />
                        <StatCard icon={BarChart3} label="Avg Score" value={analytics.averageScore} color="rose" />
                      </div>
                    </div>
                  )}

                  {/* Pairs Section */}
                  <div>
                    <h3 className="font-medium text-slate-800 dark:text-gray-100 mb-2 text-sm">Interview Pairs</h3>
                    {pairs.length === 0 ? (
                      <div className="text-center py-4 text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-gray-700 rounded border border-slate-300 dark:border-gray-600 text-sm">
                        No pairs available for this event.
                      </div>
                    ) : (
                      <div className="max-h-80 overflow-y-auto pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {pairs.map((pair, idx) => (
                            <PairCard key={pair._id} pair={pair} index={idx} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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