import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../utils/api';
import InterviewWorkspaceNav from '../components/interviews/InterviewWorkspaceNav';
import InterviewDirectory from '../components/interviews/InterviewDirectory';
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
  Link2,
  RefreshCw,
  UserCheck,
  MoreVertical,
  Send,
  UserMinus,
  Trash2
} from 'lucide-react';

// Main Component
export default function EventDetail() {
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
  const [participants, setParticipants] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [globalParticipantMenuOpen, setGlobalParticipantMenuOpen] = useState(false);
  const [participantMenuId, setParticipantMenuId] = useState('');
  const [activeDataView, setActiveDataView] = useState('students');

  const getBasePath = useCallback(() => {
    if (location.pathname.startsWith('/admin/interviews/one-to-one/past')) return '/admin/interviews/one-to-one/past';
    if (location.pathname.startsWith('/admin/interviews/one-to-one/scheduled')) return '/admin/interviews/one-to-one/scheduled';
    if (location.pathname.startsWith('/admin/interviews/one-to-one')) return '/admin/interviews/one-to-one';
    if (location.pathname.startsWith('/admin/interviews/past')) return '/admin/interviews/past';
    if (location.pathname.startsWith('/admin/interviews/scheduled')) return '/admin/interviews/scheduled';
    if (location.pathname.startsWith('/admin/interviews')) return '/admin/interviews';
    return '/admin/interviews/one-to-one';
  }, [location.pathname]);

  const load = useCallback(async (eventId = id) => {
    const version = ++requestVersion.current;
    let eventsLoaded = false;
    try {
      setLoading(true);
      setMsg('');
      setEventsError(false);
      const allEvents = await api.listEvents({ view: 'dashboard', page: 1, limit: 50 });
      if (version !== requestVersion.current) return;
      setEvents(allEvents.events || []);
      eventsLoaded = true;

      let targetEventId = eventId;
      const isValidObjectId = (val) => /^[0-9a-fA-F]{24}$/.test(val || '');

      if (!targetEventId || targetEventId.startsWith(':') || !isValidObjectId(targetEventId)) {
        targetEventId = '';
      }

      if (targetEventId) {
        const [ev, an, pr, assigned] = await Promise.all([
          api.getEvent(targetEventId),
          api.getEventAnalytics(targetEventId),
          api.listPairs(targetEventId),
          api.listEventParticipants(targetEventId),
        ]);
        if (version !== requestVersion.current) return;
        setEvent(ev);
        setAnalytics(an);
        setPairs(pr);
        setParticipants(assigned);
        setSelectedParticipantIds([]);
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
      setParticipants([]);
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
      refreshTimer = window.setTimeout(() => load(id), 1800);
    }
    load(id);
    return () => {
      requestVersion.current += 1;
      window.clearTimeout(noticeTimer);
      window.clearTimeout(refreshTimer);
    };
  }, [id, load, location.state?.eventCreated]);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/admin/interviews/one-to-one/past') || path.startsWith('/admin/interviews/past')) {
      setEventTab('previous');
    } else if (path.startsWith('/admin/interviews/one-to-one/scheduled') || path.startsWith('/admin/interviews/scheduled')) {
      setEventTab('upcoming');
    } else if (path.startsWith('/admin/interviews')) {
      setEventTab(new URLSearchParams(location.search).get('status') === 'active' ? 'active' : 'all');
    } else if (path.startsWith('/admin/event')) {
      setEventTab('all');
    }
  }, [location.pathname, location.search]);

  const backPath = getBasePath();

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
    const basePath = getBasePath();
    navigate(eventId ? `${basePath}/${eventId}` : basePath);
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

  const handleDelete = async () => {
    if (!activeEventId || !window.confirm('Are you sure delete this interview? Cancellation mail will be sent to all eligible students.')) return;
    try {
      setActionBusy(true);
      const result = await api.deleteEvent(
        activeEventId,
        `Due to some reason, this interview has been cancelled by ${event?.createdBy?.name || 'admin'}.`,
      );
      setMsg(result.message || 'Interview deleted successfully');

      navigate(getBasePath(), { replace: true });
    } catch (error) {
      setMsg(error.message || 'Unable to delete interview');
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
      <InterviewWorkspaceNav limited events={events} loading>
        <div role="status" className="mx-auto max-w-[1600px] px-6 py-16 text-center text-sm text-slate-500 dark:text-gray-400">Loading interviews…</div>
      </InterviewWorkspaceNav>
    );
  }

  return (
    <InterviewWorkspaceNav limited events={events} error={eventsError}>
      {eventCreatedMsg && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-6 py-2 rounded-lg shadow-lg z-50 text-base font-semibold">
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
                <InterviewDirectory onChanged={() => { api.listEvents({ view: 'dashboard', page: 1, limit: 50 }).then((data) => setEvents(data.events || [])).catch(() => setEventsError(true)); }} search={searchQuery} onSearchChange={setSearchQuery} view={eventTab} onViewChange={(view) => {
                  setEventTab(view);
                  const root = '/admin/interviews/one-to-one';
                  navigate(view === 'upcoming' ? root + '/scheduled' : view === 'previous' ? root + '/past' : view === 'active' ? root + '?status=active' : root);
                }} onSelect={handleEventSelect} />
              ) : event ? (
                <div className="space-y-3 sm:space-y-4">
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                          <h2 className="text-lg sm:text-xl font-semibold text-slate-800 dark:text-gray-100">{event.name}</h2>
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
                      onClick={handleDelete}
                      className="ml-auto flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-gray-800 dark:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>

                  {/* Analytics */}
                  {analytics && (
                    <div className="rounded-xl bg-slate-50 p-4 dark:bg-gray-950">
                      <h3 className="font-medium text-slate-800 dark:text-gray-100 mb-3 flex items-center gap-1.5 text-sm">
                        <BarChart3 className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                        Interview Analytics
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                        <StatCard icon={UserCheck} label="Assigned" value={participants.filter((item) => item.assignmentStatus === 'assigned').length} />
                        <StatCard icon={Users} label="Joined" value={analytics.joined} />
                        <StatCard icon={Link2} label="Pairs" value={analytics.pairs} />
                        <StatCard icon={Calendar} label="Scheduled" value={analytics.scheduled} />
                        <StatCard icon={FileText} label="Feedback" value={analytics.feedbackSubmissions} />
                        <StatCard icon={BarChart3} label="Avg Score" value={analytics.averageScore} />
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
                        <p className="text-xs text-slate-500 dark:text-gray-400">Invitation emails queue automatically. Resend when required.</p>
                      </div>
                      <div className="relative">
                        <button data-platform-menu-trigger aria-expanded={globalParticipantMenuOpen} type="button" onClick={() => setGlobalParticipantMenuOpen((open) => !open)} className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700" aria-label="Participant bulk actions">
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {globalParticipantMenuOpen && (
                          <div data-platform-action-menu className="absolute right-0 top-11 z-20 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-800">
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
                                    <button data-platform-menu-trigger aria-expanded={participantMenuId === item._id} type="button" onClick={() => setParticipantMenuId((current) => current === item._id ? '' : item._id)} className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-gray-700"><MoreVertical className="h-4 w-4" /></button>
                                    {participantMenuId === item._id && (
                                      <div data-platform-action-menu className="absolute right-8 top-8 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl dark:border-gray-700 dark:bg-gray-800">
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

                    </div>
                    {pairs.length === 0 ? (
                      <div className="text-center py-4 text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-gray-700 rounded border border-slate-300 dark:border-gray-600 text-sm">
                        No pairs available for this event.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                          {pairs.map((pair) => (
                            <PairCard key={pair._id} pair={pair} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
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
    </InterviewWorkspaceNav>
  );
}
