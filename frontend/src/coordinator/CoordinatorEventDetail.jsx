import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import InterviewWorkspaceNav from '../components/interviews/InterviewWorkspaceNav';
import InterviewBrowser from '../components/interviews/InterviewBrowser';
import { InterviewStat as StatCard, InterviewPair as PairCard } from '../components/interviews/InterviewSummary';
import {
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Download,
  Users,
  Calendar,
  FileText,
  BarChart3,
  Link2
} from 'lucide-react';

// Main Component
export default function CoordinatorEventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [eventCreatedMsg, setEventCreatedMsg] = useState("");
  const [event, setEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventsError, setEventsError] = useState(false);
  const activeEventId = id;
  const requestVersion = useRef(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [pairs, setPairs] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [eventTab, setEventTab] = useState('all');

  const getBasePath = useCallback(() => {
    if (location.pathname.startsWith('/coordinator/interviews/one-to-one/past')) return '/coordinator/interviews/one-to-one/past';
    if (location.pathname.startsWith('/coordinator/interviews/one-to-one/scheduled')) return '/coordinator/interviews/one-to-one/scheduled';
    if (location.pathname.startsWith('/coordinator/interviews/one-to-one')) return '/coordinator/interviews/one-to-one';
    if (location.pathname.startsWith('/coordinator/interviews/past')) return '/coordinator/interviews/past';
    if (location.pathname.startsWith('/coordinator/interviews/scheduled')) return '/coordinator/interviews/scheduled';
    return '/coordinator/interviews';
  }, [location.pathname]);

  const load = useCallback(async (eventId = id) => {
    const version = ++requestVersion.current;
    let eventsLoaded = false;
    try {
      setLoading(true);
      setMsg('');
      setEventsError(false);
      const [allEvents] = await Promise.all([api.listEvents()]);
      if (version !== requestVersion.current) return;
      setEvents(allEvents);
      eventsLoaded = true;

      let targetEventId = eventId;
      const isValidObjectId = (val) => /^[0-9a-fA-F]{24}$/.test(val || '');

      if (!targetEventId || targetEventId.startsWith(':') || !isValidObjectId(targetEventId)) {
        targetEventId = '';
      }

      if (targetEventId) {
        const [ev, an, pr] = await Promise.all([
          api.getEvent(targetEventId),
          api.getEventAnalytics(targetEventId),
          api.listPairs(targetEventId),
        ]);
        if (version !== requestVersion.current) return;
        setEvent(ev);
        setAnalytics(an);
        setPairs(pr);
      } else {
        setEvent(null);
        setAnalytics(null);
        setPairs([]);
        setMsg('');
      }
    } catch (e) {
      if (version !== requestVersion.current) return;
      setMsg(e.message || 'Failed to load event data');
      setEventsError(!eventsLoaded);
      setEvent(null);
      setAnalytics(null);
      setPairs([]);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let noticeTimer;
    let refreshTimer;
    if (location.state?.eventCreated) {
      setEventCreatedMsg('Interview created successfully!');
      noticeTimer = window.setTimeout(() => setEventCreatedMsg(''), 4000);

    }
    load(id);
    return () => {
      requestVersion.current += 1;
      window.clearTimeout(noticeTimer);
      window.clearTimeout(refreshTimer);
    };
  }, [id, load, location.state?.eventCreated]);

  useEffect(() => {
    if (location.pathname.startsWith('/coordinator/interviews/one-to-one/past') || location.pathname.startsWith('/coordinator/interviews/past')) {
      setEventTab('previous');
    } else if (location.pathname.startsWith('/coordinator/interviews/one-to-one/scheduled') || location.pathname.startsWith('/coordinator/interviews/scheduled')) {
      setEventTab('upcoming');
    } else {
      setEventTab(new URLSearchParams(location.search).get('status') === 'active' ? 'active' : 'all');
    }
  }, [location.pathname, location.search]);


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
    navigate(eventId ? `${getBasePath()}/${eventId}` : getBasePath());
  };

  const msgLower = msg ? msg.toLowerCase() : '';
  const isSuccessMsg = msgLower.includes('success') || msgLower.includes('created');
  const isInfoMsg = msgLower.includes('no scheduled interviews') || msgLower.includes('no interviews available') || msgLower.includes('no interviews found');

  if (loading) {
    return (
      <InterviewWorkspaceNav events={events} loading>
        <div role="status" className="mx-auto max-w-[1600px] px-6 py-16 text-center text-sm text-slate-500 dark:text-gray-400">Loading interviews…</div>
      </InterviewWorkspaceNav>
    );
  }

  return (
    <InterviewWorkspaceNav events={events} error={eventsError}>
      {eventCreatedMsg && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-6 py-2 rounded-lg shadow-lg z-50 text-base font-semibold">
          {eventCreatedMsg}
        </div>
      )}
      <div className="flex-1 w-full max-w-[1600px] mx-auto px-4 py-4 sm:px-6">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="min-w-0">
            <div className={id ? "rounded-xl border border-slate-200 bg-white p-4 sm:p-5 dark:border-gray-800 dark:bg-gray-900" : ""}>
              {!id && msg && !isSuccessMsg ? (
                <div role="alert" className="flex justify-center py-8"><button type="button" onClick={() => load()} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-sky-600 dark:border-gray-700 dark:text-sky-400">Retry loading interviews</button></div>
              ) : !id ? (
                <InterviewBrowser events={events} search={searchQuery} onSearchChange={setSearchQuery} view={eventTab} onViewChange={(view) => {
                  setEventTab(view);
                  const root = '/coordinator/interviews/one-to-one';
                  navigate(view === 'upcoming' ? root + '/scheduled' : view === 'previous' ? root + '/past' : view === 'active' ? root + '?status=active' : root);
                }} onSelect={handleEventSelect} />
              ) : event ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100">{event.name}</h2>
                        {(event.startDate || event.endDate) && (
                          <div className="text-sm text-slate-500 dark:text-gray-400">
                            {event.startDate && (
                              <span className="mr-2">Starts: {new Date(event.startDate).toLocaleString()}</span>
                            )}
                            {event.endDate && (
                              <span>Ends: {new Date(event.endDate).toLocaleString()}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="text-slate-600 dark:text-gray-400 text-sm mt-0.5">{event.description}</p>
                    </div>
                    <Link
                      to={getBasePath()}
                      className="flex items-center gap-1 text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 text-sm"
                    >
                      <ArrowLeft className="w-3 h-3" />
                      Back to Interviews
                    </Link>
                  </div>

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
                    <div className="rounded-xl bg-slate-50 p-4 dark:bg-gray-950">
                      <h3 className="font-medium text-slate-800 dark:text-gray-100 mb-3 flex items-center gap-1.5 text-sm">
                        <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        Interview Analytics
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                        <StatCard icon={Users} label="Joined" value={analytics.joined} />
                        <StatCard icon={Link2} label="Pairs" value={analytics.pairs} />
                        <StatCard icon={Calendar} label="Scheduled" value={analytics.scheduled} />
                        <StatCard icon={FileText} label="Feedback" value={analytics.feedbackSubmissions} />
                        <StatCard icon={BarChart3} label="Avg Score" value={analytics.averageScore} />
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
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                          {pairs.map((pair) => (
                            <PairCard key={pair._id} pair={pair} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-sm text-slate-500 dark:text-gray-400">Interview could not be loaded.</div>
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
                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : isInfoMsg
                          ? 'bg-slate-50 dark:bg-gray-800 text-slate-700 dark:text-gray-200 border border-slate-200 dark:border-gray-600'
                          : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
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
    </InterviewWorkspaceNav>
  );
}
