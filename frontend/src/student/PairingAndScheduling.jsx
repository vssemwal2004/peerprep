/* eslint-disable no-unused-vars */
import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { api } from "../utils/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Users,
  X,
  User,
  UserCheck,
} from "lucide-react";
import DateTimePicker from "../components/DateTimePicker";

export default function PairingAndScheduling() {
  const [events, setEvents] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [selectedPair, setSelectedPair] = useState(null);
  // Single input field for proposing one slot at a time
  const [slotInput, setSlotInput] = useState("");
  const [message, setMessage] = useState("");
  const [me, setMe] = useState(null);
  const [currentProposals, setCurrentProposals] = useState({
    mine: [],
    partner: [],
    minePast: [],
    partnerPast: [],
    common: null,
  });
  const [selectedToAccept, setSelectedToAccept] = useState("");
  const [meetingLinkEnabled, setMeetingLinkEnabled] = useState(false);
  const [timeUntilEnable, setTimeUntilEnable] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPastDropdown, setShowPastDropdown] = useState(false);
  const pastDropdownRef = useRef(null);

  // Derive propose button disabled reason for small UI hint
  const proposeDisabledReason = useMemo(() => {
    if (!selectedPair) return 'Select a pair to propose a time.';
    if (isLocked) return 'Interview already scheduled.';
    const myActiveCount = Array.isArray(currentProposals?.mine) ? currentProposals.mine.length : 0;
    const partnerActiveCount = Array.isArray(currentProposals?.partner) ? currentProposals.partner.length : 0;
    const myPastCount = Array.isArray(currentProposals?.minePast) ? currentProposals.minePast.length : 0;
    const partnerPastCount = Array.isArray(currentProposals?.partnerPast) ? currentProposals.partnerPast.length : 0;
    const combinedAttempts = myActiveCount + myPastCount + partnerActiveCount + partnerPastCount;
    if (!slotInput) return 'Select a time to propose.';
    if (combinedAttempts >= 6) return 'Maximum of 6 combined proposals reached (3 per participant)';
    if (myActiveCount > 0) return 'You already have a pending proposal; wait for a response.';
    if (partnerActiveCount > 0) return 'Your partner has a pending proposal; accept or reject it first.';
    return null;
  }, [selectedPair, isLocked, slotInput, currentProposals]);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Decode token first (synchronous)
        try {
          const t = localStorage.getItem("token");
          if (t) {
            const raw = t.split(".")?.[1];
            if (raw) {
              const payload = JSON.parse(atob(raw));
              const id = payload.sub || payload.id || payload.userId || null;
              const fallbackId = localStorage.getItem("userId") || null;
              setMe({
                id: id || fallbackId,
                role: payload.role,
                email: payload.email,
                name: payload.name,
              });
            }
          }
        } catch (e) {
          console.warn("Failed to decode token payload", e);
        }

        // Fetch events
        const evs = await api.listEvents();
        setEvents(evs);
        
        // Fetch all pairs in parallel for better performance
        const pairPromises = evs.map(ev => api.listPairs(ev._id));
        const pairResults = await Promise.all(pairPromises);
        
        // Flatten and combine pairs with their events
        const allPairs = [];
        pairResults.forEach((prs, index) => {
          allPairs.push(...prs.map((p) => ({ ...p, event: evs[index] })));
        });
        
        setPairs(allPairs);
      } catch (err) {
        console.error(err);
        setMessage("Failed to load pairs.");
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const isInterviewer = useMemo(() => {
    if (!selectedPair || !me) return false;
    const interviewer = selectedPair.interviewer;
    const interviewerId = interviewer?._id || interviewer;
    if (!interviewerId) return false;
    if (me.id && String(interviewerId) === String(me.id)) return true;
    if (me.email && interviewer?.email && interviewer.email === me.email)
      return true;
    return false;
  }, [selectedPair, me]);

  const isLocked = selectedPair?.status === "scheduled";
  
  // Check if scheduled time has expired
  const isScheduledTimeExpired = useMemo(() => {
    if (!selectedPair?.scheduledAt) return false;
    return new Date(selectedPair.scheduledAt).getTime() <= Date.now();
  }, [selectedPair?.scheduledAt]);

  const interviewerSlots = useMemo(() => {
    if (!currentProposals) return [];
    return isInterviewer
      ? currentProposals.mine || []
      : currentProposals.partner || [];
  }, [currentProposals, isInterviewer]);

  const intervieweeSlots = useMemo(() => {
    if (!currentProposals) return [];
    return isInterviewer
      ? currentProposals.partner || []
      : currentProposals.mine || [];
  }, [currentProposals, isInterviewer]);

  useEffect(() => {
    const fetch = async () => {
      setCurrentProposals({ mine: [], partner: [], minePast: [], partnerPast: [], common: null });
      setSelectedToAccept("");
      setShowPastDropdown(false);
      if (!selectedPair) return;
      try {
        const res = await api.proposeSlots(selectedPair._id, []);
        setCurrentProposals(res);
      } catch {
        // ignore
      }
    };
    fetch();
  }, [selectedPair]);

  // Close past dropdown when clicking outside or when sidebar opens
  useEffect(() => {
    function handleClickOutside(e) {
      if (!pastDropdownRef.current) return;
      if (!pastDropdownRef.current.contains(e.target)) {
        setShowPastDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    let timer;
    if (!selectedPair?.scheduledAt) {
      setMeetingLinkEnabled(false);
      setTimeUntilEnable(null);
      return;
    }
    const scheduled = new Date(selectedPair.scheduledAt).getTime();
    const enableAt = scheduled - 30 * 60 * 1000;

    function tick() {
      const now = Date.now();
      if (now >= enableAt) {
        setMeetingLinkEnabled(true);
        setTimeUntilEnable(0);
      } else {
        setMeetingLinkEnabled(false);
        setTimeUntilEnable(enableAt - now);
      }
    }

    tick();
    timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [selectedPair?.scheduledAt]);

  // Removed: useEffect that was causing flickering by resetting selectedToAccept

  const handlePropose = async () => {
    setMessage("");
    
    // Prevent double submission
    if (isLoading) {
      setMessage("Processing... Please wait.");
      return;
    }
    setIsLoading(true);
    
    function parseLocalDateTime(value) {
      if (!value) return NaN;
      const [datePart, timePart] = String(value).split("T");
      if (!datePart || !timePart) return NaN;
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) return NaN;
      return new Date(y, m - 1, d, hh, mm).getTime();
    }

    // Prepare a single ISO slot from the input
    const value = slotInput;
    const isoSlots = [];
    if (value) {
      if (String(value).endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(String(value))) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) isoSlots.push(d.toISOString());
      } else {
        const t = parseLocalDateTime(value);
        if (!isNaN(t)) isoSlots.push(new Date(t).toISOString());
      }
    }
    if (!selectedPair || isoSlots.length === 0) {
      setMessage("Please select a pair and input a valid time.");
      setIsLoading(false);
      return;
    }
    // Validate slots against event boundaries
    try {
      const ev = selectedPair.event || {};
      const startBoundary = ev.startDate
        ? new Date(ev.startDate).getTime()
        : null;
      const endBoundary = ev.endDate ? new Date(ev.endDate).getTime() : null;
      const parsed = isoSlots.map((s) => new Date(s));
      if (parsed.some((d) => isNaN(d.getTime()))) {
        setMessage("One or more slots are invalid");
        setIsLoading(false);
        return;
      }
      if (startBoundary && parsed.some((d) => d.getTime() < startBoundary)) {
        setMessage("One or more slots are before the event start");
        setIsLoading(false);
        return;
      }
      if (endBoundary && parsed.some((d) => d.getTime() > endBoundary)) {
        setMessage("One or more slots are after the event end");
        setIsLoading(false);
        return;
      }
    } catch (e) {
      // ignore parsing errors handled above
    }
    // Unified max 3 slots rule for both roles
    // One at a time input; backend caps total to 3 across submissions
    // Time window + future validation (defensive; server enforces too)
    const nowTs = Date.now();
    for (const iso of isoSlots) {
      const d = new Date(iso);
      if (d.getTime() <= nowTs) {
        setMessage("Cannot propose past slot");
        setIsLoading(false);
        return;
      }
      const h = d.getHours();
      if (h < 10 || h >= 22) {
        setMessage("Slots must be between 10:00 and 22:00");
        setIsLoading(false);
        return;
      }
    }
    try {
      const res = await api.proposeSlots(selectedPair._id, isoSlots);
      // Immediate UI update with response data
      setCurrentProposals(res);
      if (res.common)
        setMessage(
          `Common slot found: ${new Date(res.common).toLocaleString()}`
        );
      else setMessage("Slots proposed. Waiting for partner.");
      setSlotInput("");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Removed Add Slot: single input field approach

  const removeSlot = (idx) => {
    setSlots((s) => s.filter((_, i) => i !== idx));
  };

  const handleConfirm = async (dt, link) => {
    if (!selectedPair) return;
    if (isLoading) {
      setMessage("Processing... Please wait.");
      return;
    }
    setIsLoading(true);
    try {
      const iso = dt && dt.includes("T") ? new Date(dt).toISOString() : dt;
      await api.confirmSlot(selectedPair._id, iso, link);
      setMessage("Scheduled successfully!");
      
      // Immediately fetch updated proposals for instant UI feedback
      const proposalUpdate = await api.proposeSlots(selectedPair._id, []);
      setCurrentProposals(proposalUpdate);
      
      // Fetch updated pairs in parallel for better performance
      const pairPromises = events.map(ev => api.listPairs(ev._id));
      const pairResults = await Promise.all(pairPromises);
      
      const updated = [];
      pairResults.forEach((prs, index) => {
        updated.push(...prs.map((p) => ({ ...p, event: events[index] })));
      });
      
      setPairs(updated);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPair) return;
    if (isLoading) {
      setMessage("Processing... Please wait.");
      return;
    }
    setIsLoading(true);
    try {
      await api.rejectSlots(selectedPair._id);
      setMessage("Latest proposal rejected. You may propose a new time if allowed.");
      
      // Immediately fetch updated proposals for instant UI feedback
      const proposalUpdate = await api.proposeSlots(selectedPair._id, []);
      setCurrentProposals(proposalUpdate);
      
      // Fetch updated pairs in parallel for better performance
      const pairPromises = events.map(ev => api.listPairs(ev._id));
      const pairResults = await Promise.all(pairPromises);
      
      const updated = [];
      pairResults.forEach((prs, index) => {
        updated.push(...prs.map((p) => ({ ...p, event: events[index] })));
      });
      
      setPairs(updated);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventStatus = (event) => {
    const now = new Date();
    const start = new Date(event.startDate);
    const end = new Date(event.endDate);

    if (now >= start && now <= end) return "active";
    if (now < start) return "upcoming";
    return "completed";
  };

  const getUserRoleInPair = (pair) => {
    if (!me || !pair) return null;

    const interviewerId = pair.interviewer?._id || pair.interviewer;
    const intervieweeId = pair.interviewee?._id || pair.interviewee;

    if (me.id && String(interviewerId) === String(me.id)) return "interviewer";
    if (me.id && String(intervieweeId) === String(me.id)) return "interviewee";
    if (me.email && pair.interviewer?.email === me.email) return "interviewer";
    if (me.email && pair.interviewee?.email === me.email) return "interviewee";

    return null;
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col pt-16">
      <div className="flex-1 w-full mx-auto px-4 py-4">
        <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] gap-3">
          {/* Desktop Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden lg:block lg:w-96"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-4 h-full overflow-y-auto">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-4">
                Interview Pairs
              </h2>
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 dark:border-sky-500 mb-3"></div>
                  <p className="text-slate-500 dark:text-gray-400 text-sm">Loading pairs...</p>
                </div>
              ) : pairs.length === 0 ? (
                <div className="text-slate-500 dark:text-gray-400 text-sm text-center py-6">
                  No pairs found
                </div>
              ) : (
                <div className="space-y-2">
                  {pairs.map((p, idx) => {
                    const userRole = getUserRoleInPair(p);
                    const eventStatus = getEventStatus(p.event);
                    const isActive = eventStatus === "active";
                    const isUpcoming = eventStatus === "upcoming";

                    return (
                      <motion.div
                        key={p._id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        className={`py-2 px-3 rounded-lg border transition-colors cursor-pointer ${
                          selectedPair?._id === p._id
                            ? "border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/20"
                            : "border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600"
                        }`}
                        onClick={() => setSelectedPair(p)}
                      >
                        <div className="flex items-start gap-2">
                          <div
                            className={`p-1 rounded ${
                              userRole === "interviewer"
                                ? "bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400"
                                : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                            }`}
                          >
                            {userRole === "interviewer" ? (
                              <User className="w-3 h-3" />
                            ) : (
                              <UserCheck className="w-3 h-3" />
                            )}
                          </div>

                          <div className="flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-slate-900 dark:text-gray-100 text-sm truncate">
                                {p.event.name}
                              </p>
                              <div className="text-right space-y-3">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    isActive
                                      ? "bg-emerald-100 text-emerald-800"
                                      : isUpcoming
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {isActive
                                    ? "Active"
                                    : isUpcoming
                                    ? "Upcoming"
                                    : "Completed"}
                                </span>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    p.status === "scheduled"
                                      ? "bg-emerald-100 text-emerald-800"
                                      : p.status === "rejected"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-slate-100 text-slate-700"
                                  }`}
                                >
                                  {p.status || "Pending"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-1">
                              <span
                                className={`text-xs px-2 py-0.5 rounded ${
                                  userRole === "interviewer"
                                    ? "bg-sky-100 text-sky-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                You are{" "}
                                {userRole === "interviewer"
                                  ? "Interviewer"
                                  : "Interviewee"}
                              </span>
                            </div>

                            <div className="text-xs text-slate-700 mt-2 truncate">
                              {p.interviewer?.name || p.interviewer?.email} ➜{" "}
                              {p.interviewee?.name || p.interviewee?.email}
                            </div>

                            {p.scheduledAt && (
                              <div className="mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500 dark:text-gray-400" />
                                <span className="text-xs text-slate-600 dark:text-gray-300">
                                  {new Date(p.scheduledAt).toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>

          {/* Mobile Sidebar Toggle */}
          <div className="lg:hidden sticky top-16 z-20 bg-white dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 py-3 px-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-gray-100">
              Interview Pairs
            </h2>
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="p-1.5 rounded bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700"
            >
              {isMobileSidebarOpen ? (
                <X className="w-4 h-4 text-slate-600 dark:text-gray-300" />
              ) : (
                <Users className="w-4 h-4 text-sky-500 dark:text-sky-400" />
              )}
            </button>
          </div>

          {/* Mobile Sidebar Overlay */}
          <AnimatePresence>
            {isMobileSidebarOpen && (
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                className="lg:hidden fixed inset-0 top-28 z-30 bg-white dark:bg-gray-900 p-4 overflow-y-auto"
              >
                <div className="space-y-2">
                  {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600 dark:border-sky-500 mb-3"></div>
                      <p className="text-slate-500 dark:text-gray-400 text-sm">Loading pairs...</p>
                    </div>
                  ) : pairs.length === 0 ? (
                    <div className="text-slate-500 dark:text-gray-400 text-sm text-center py-6">
                      No pairs found
                    </div>
                  ) : (
                    pairs.map((p) => {
                      const userRole = getUserRoleInPair(p);
                      const eventStatus = getEventStatus(p.event);
                      const isActive = eventStatus === "active";
                      const isUpcoming = eventStatus === "upcoming";

                      return (
                        <div
                          key={p._id}
                          className="py-2 px-3 rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-700 cursor-pointer"
                          onClick={() => {
                            setSelectedPair(p);
                            setIsMobileSidebarOpen(false);
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div
                              className={`p-1 rounded ${
                                userRole === "interviewer"
                                  ? "bg-sky-100 dark:bg-sky-900/40 text-sky-600 dark:text-sky-400"
                                  : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {userRole === "interviewer" ? (
                                <User className="w-3 h-3" />
                              ) : (
                                <UserCheck className="w-3 h-3" />
                              )}
                            </div>

                            <div className="flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-slate-900 text-sm truncate">
                                  {p.event.name}
                                </p>
                                <div className="text-right space-y-2">
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      isActive
                                        ? "bg-emerald-100 text-emerald-800"
                                        : isUpcoming
                                        ? "bg-amber-100 text-amber-800"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {isActive
                                      ? "Active"
                                      : isUpcoming
                                      ? "Upcoming"
                                      : "Completed"}
                                  </span>
                                  <span
                                    className={`text-xs px-2 py-0.5 rounded ${
                                      p.status === "scheduled"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : p.status === "rejected"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-slate-100 text-slate-700"
                                    }`}
                                  >
                                    {p.status || "Pending"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-1">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded ${
                                    userRole === "interviewer"
                                      ? "bg-sky-100 text-sky-800"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  You are{" "}
                                  {userRole === "interviewer"
                                    ? "Interviewer"
                                    : "Interviewee"}
                                </span>
                              </div>

                              <div className="text-xs text-slate-700 mt-2 truncate">
                                {p.interviewer?.name || p.interviewer?.email} ➜{" "}
                                {p.interviewee?.name || p.interviewee?.email}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex-1"
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-6 h-full overflow-y-auto">
              {selectedPair ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h2 className="text-xl font-semibold text-slate-900 dark:text-gray-100 mb-2">
                        {selectedPair.interviewer?.name ||
                          selectedPair.interviewer?.email}{" "}
                        ➜{" "}
                        {selectedPair.interviewee?.name ||
                          selectedPair.interviewee?.email}
                      </h2>

                      <div className="flex flex-wrap gap-2 mb-3">
                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            isInterviewer
                              ? "bg-sky-100 dark:bg-sky-900/40 text-sky-800 dark:text-sky-300"
                              : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                          }`}
                        >
                          You are the{" "}
                          {isInterviewer ? "Interviewer" : "Interviewee"}
                        </span>

                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            getEventStatus(selectedPair.event) === "active"
                              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                              : getEventStatus(selectedPair.event) ===
                                "upcoming"
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"
                              : "bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300"
                          }`}
                        >
                          Event:{" "}
                          {getEventStatus(selectedPair.event)
                            .charAt(0)
                            .toUpperCase() +
                            getEventStatus(selectedPair.event).slice(1)}
                        </span>

                        <span
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            selectedPair.status === "scheduled"
                              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
                              : selectedPair.status === "rejected"
                              ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400"
                              : "bg-slate-100 dark:bg-gray-700 text-slate-700 dark:text-gray-300"
                          }`}
                        >
                          {selectedPair.status || "Pending"}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedPair(null)}
                      className="p-1.5 rounded bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 lg:hidden"
                    >
                      <X className="w-4 h-4 text-slate-600 dark:text-gray-300" />
                    </button>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-gray-300 leading-relaxed">
                    Interviewer proposes available time slots. Interviewee can accept a proposed slot 
                    or suggest up to 3 alternative time slots for consideration.
                  </p>

                  {isLocked && (
                    isScheduledTimeExpired ? (
                      /* Expired Scheduled Time */
                      <div className="bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-red-900/20 dark:via-orange-900/20 dark:to-amber-900/20 border-2 border-red-300 dark:border-red-700 rounded-lg p-5 shadow-md">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/40">
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          </div>
                          <div className="flex-1">
                            <div className="font-semibold text-red-900 dark:text-red-300 mb-1">Your scheduled time has expired.</div>
                            <div className="text-sm text-red-700 dark:text-red-400 mb-3">Please propose a new time.</div>
                            {selectedPair?.scheduledAt && (
                              <div className="bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-red-200 dark:border-red-700 inline-flex items-center gap-2">
                                <Clock className="w-4 h-4 text-slate-500 dark:text-gray-400" />
                                <span className="text-sm text-slate-700 dark:text-gray-300 line-through">
                                  {new Date(selectedPair.scheduledAt).toLocaleString()}
                                </span>
                                <span className="text-[10px] font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded">Expired</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Active Scheduled Time */
                      <div className="p-4 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-sm flex items-start">
                        <CheckCircle className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="font-medium">
                            Interview scheduled and confirmed
                          </div>
                          {selectedPair?.scheduledAt && (
                            <div className="text-emerald-800 mt-1 flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {new Date(
                                selectedPair.scheduledAt
                              ).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  )}

                  <div className="space-y-4">
                    {/* Single Date Input Section */}
                    <div className="max-w-md space-y-3">
                      <h3 className="font-medium text-slate-900 text-sm">
                        Propose a Time
                      </h3>
                      <div className="flex items-center gap-3 flex-wrap">
                        <DateTimePicker
                          value={slotInput}
                          onChange={(isoDateTime) => {
                            const v = isoDateTime;
                            const ev = selectedPair?.event || {};
                            const toLocal = (val) => {
                              if (!val) return "";
                              if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val))
                                return val;
                              const d = new Date(val);
                              if (isNaN(d.getTime())) return "";
                              const pad = (n) => String(n).padStart(2, "0");
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            };
                            const startLocal = ev.startDate ? toLocal(ev.startDate) : null;
                            const endLocal = ev.endDate ? toLocal(ev.endDate) : null;
                            if (startLocal && v < startLocal) {
                              setMessage("Selected time is before event start - adjusted to event start time");
                              setSlotInput(startLocal);
                              return;
                            }
                            if (endLocal && v > endLocal) {
                              setMessage("Selected time is after event end - adjusted to event end time");
                              setSlotInput(endLocal);
                              return;
                            }
                            setSlotInput(v);
                          }}
                          min={selectedPair?.event?.startDate}
                          max={selectedPair?.event?.endDate}
                          placeholder="Select interview time"
                          className="flex-1 text-sm"
                          disabled={isLocked}
                        />
                        {/* Past Time Slots Toggle */}
                        <div className="relative" ref={pastDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setShowPastDropdown((v) => !v)}
                            className="px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm flex items-center gap-2 text-slate-700 dark:text-gray-200"
                          >
                            Past Time Slots
                            {(() => {
                              const count = Array.isArray(currentProposals?.pastTimeSlots)
                                ? currentProposals.pastTimeSlots.length
                                : ((currentProposals?.minePastEntries || []).length + (currentProposals?.partnerPastEntries || []).length);
                              return (
                                <span className="inline-flex items-center justify-center text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 dark:bg-slate-600 text-white min-w-[20px]">
                                  {count}
                                </span>
                              );
                            })()}
                          </button>
                          {showPastDropdown && (
                            <div className="absolute left-0 mt-2 w-80 z-10 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-md">
                              <div className="p-3">
                                <div className="text-xs font-semibold text-slate-700 dark:text-gray-200 mb-1">Past Time Slots</div>
                                <div className="text-[10px] text-slate-500 dark:text-gray-400 mb-3">Only shows expired, rejected, and replaced dates</div>
                                {(() => {
                                  // Collect all past entries from both users
                                  const entries = Array.isArray(currentProposals?.pastTimeSlots)
                                    ? currentProposals.pastTimeSlots
                                    : [
                                        ...(currentProposals?.minePastEntries || []),
                                        ...(currentProposals?.partnerPastEntries || []),
                                      ];
                                  
                                  // Filter to only show expired, rejected, replaced, and superseded entries
                                  const filteredEntries = entries
                                    .filter(e => {
                                      const reason = e.reason?.toLowerCase();
                                      return reason === 'expired' || reason === 'rejected' || 
                                             reason === 'replaced' || reason === 'superseded';
                                    })
                                    .sort((a, b) => new Date(b.time) - new Date(a.time));
                                  
                                  if (!filteredEntries || filteredEntries.length === 0) {
                                    return (
                                      <div className="text-sm text-slate-500 dark:text-gray-400 py-4 text-center">No past time slots yet</div>
                                    );
                                  }
                                  
                                  const toLabel = (r) => {
                                    if (!r) return 'Replaced';
                                    const map = { rejected: 'Rejected', expired: 'Expired', superseded: 'Replaced', replaced: 'Replaced' };
                                    return map[r] || (r.charAt(0).toUpperCase() + r.slice(1));
                                  };
                                  
                                  const color = (r) => {
                                    if (r === 'rejected') return 'bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700';
                                    if (r === 'expired') return 'bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-700';
                                    return 'bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 border-slate-200 dark:border-gray-700';
                                  };
                                  
                                  return (
                                    <ul className="space-y-2 max-h-64 overflow-auto">
                                      {filteredEntries.map((e, idx) => (
                                        <li key={`${e.time}-${idx}`} className={`text-sm px-3 py-2 rounded border flex items-center justify-between ${color(e.reason)}`}>
                                          <div className="flex flex-col">
                                            <span className="font-medium">{new Date(e.time).toLocaleString()}</span>
                                            <span className="text-[10px] uppercase tracking-wide mt-0.5 font-semibold">{toLabel(e.reason)}</span>
                                          </div>
                                          <div className={`text-[9px] font-bold uppercase px-2 py-1 rounded ${
                                            e.reason === 'expired' ? 'bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300' :
                                            e.reason === 'rejected' ? 'bg-red-200 dark:bg-red-900/40 text-red-900 dark:text-red-300' :
                                            'bg-slate-200 dark:bg-gray-700 text-slate-900 dark:text-gray-300'
                                          }`}>
                                            {toLabel(e.reason)}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  );
                                })()}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Add Slot button removed */}

                    {/* Default Time Slot Section - Show before proposals if no slots proposed yet */}
                    {!isLocked && interviewerSlots.length === 0 && intervieweeSlots.length === 0 && selectedPair?.defaultTimeSlot && (
                      <div className="mb-6">
                        {(() => {
                          const hasDefaultTimeSlot = selectedPair?.defaultTimeSlot;
                          const isExpired = selectedPair?.defaultTimeSlotExpired;
                          const isPastTime = hasDefaultTimeSlot && new Date(selectedPair.defaultTimeSlot).getTime() < Date.now();
                          
                          // Show expired message if default time has passed
                          if (hasDefaultTimeSlot && (isExpired || isPastTime)) {
                            return (
                              <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-700 rounded-lg p-6 text-center">
                                <div className="inline-flex flex-col items-center gap-3">
                                  <Clock className="w-8 h-8 text-red-600 dark:text-red-400" />
                                  <div>
                                    <div className="text-sm font-medium text-red-900 dark:text-red-300 mb-2">Default Time Slot Expired</div>
                                    <div className="text-sm text-red-700 dark:text-red-400 mb-1">
                                      The default time ({new Date(selectedPair.defaultTimeSlot).toLocaleString()}) has already passed.
                                    </div>
                                    <div className="text-xs text-red-600 dark:text-red-400 mt-2">Please propose a new time to continue.</div>
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          // Show active default time slot if not expired
                          if (hasDefaultTimeSlot && !isExpired && !isPastTime) {
                            return (
                              <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-6">
                                <div className="text-center mb-4">
                                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-sky-100 dark:bg-sky-900/30 rounded-lg border border-sky-300 dark:border-sky-700">
                                    <Clock className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                                    <span className="text-sm font-medium text-sky-900 dark:text-sky-300">
                                      Default Time Slot Assigned
                                    </span>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <div className="text-sm text-slate-600 dark:text-gray-400 mb-2">Your scheduled time:</div>
                                  <div className="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-4">
                                    {new Date(selectedPair.defaultTimeSlot).toLocaleString()}
                                  </div>
                                  <div className="flex gap-3 justify-center flex-wrap">
                                    <button
                                      onClick={() => handleConfirm(selectedPair.defaultTimeSlot, "")}
                                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-medium text-sm hover:from-emerald-600 hover:to-emerald-700 shadow-sm"
                                    >
                                      Accept Default Time
                                    </button>
                                    <button
                                      onClick={() => {
                                        // Auto-fill the date picker with a suggestion
                                        const suggested = new Date(selectedPair.defaultTimeSlot);
                                        suggested.setHours(suggested.getHours() + 1); // Suggest 1 hour later
                                        const pad = (n) => String(n).padStart(2, "0");
                                        setSlotInput(`${suggested.getFullYear()}-${pad(suggested.getMonth() + 1)}-${pad(suggested.getDate())}T${pad(suggested.getHours())}:${pad(suggested.getMinutes())}`);
                                      }}
                                      className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg font-medium text-sm hover:from-amber-600 hover:to-amber-700 shadow-sm"
                                    >
                                      Change Time
                                    </button>
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-gray-300 mt-3">
                                    If you're satisfied with this time, click "Accept". Otherwise, propose a different time below.
                                  </div>
                                </div>
                              </div>
                            );
                          }
                          
                          return null;
                        })()}
                      </div>
                    )}

                    {/* Proposed Slots Grid */}
                    {!isLocked && (
                      <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4">
                          <h4 className="font-semibold text-slate-900 dark:text-gray-100 mb-3 text-sm">
                            Interviewer Proposed Times
                          </h4>
                          <div className="text-xs text-slate-600 dark:text-gray-400 mb-3">
                            Time slots suggested by interviewer for the interview
                          </div>
                          <ul className="space-y-2">
                            {interviewerSlots.length > 0 ? (
                              interviewerSlots.map((s, i) => {
                                const expired = new Date(s).getTime() <= Date.now();
                                return (
                                  <li
                                    key={i}
                                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                      selectedToAccept === s
                                        ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700"
                                        : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-600"
                                    }`}
                                  >
                                    {!isInterviewer && (
                                      <input
                                        type="radio"
                                        name="acceptSlot"
                                        value={s}
                                        checked={selectedToAccept === s}
                                        onChange={() => setSelectedToAccept(s)}
                                        className="mt-1 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
                                        disabled={expired}
                                      />
                                    )}
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-slate-900 dark:text-gray-100">
                                        {new Date(s).toLocaleString()}
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                                        Proposed by:{" "}
                                        {selectedPair?.interviewer?.name ||
                                          selectedPair?.interviewer?.email}
                                      </div>
                                      {expired && (
                                        <div className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">Expired</div>
                                      )}
                                    </div>
                                  </li>
                                );
                              })
                            ) : (
                              <li className="text-slate-500 dark:text-gray-400 text-sm text-center py-4">
                                No time slots proposed yet
                              </li>
                            )}
                          </ul>
                          {/* Past time section moved to global dropdown */}
                        </div>

                        <div className="bg-slate-50 dark:bg-gray-800 rounded-lg p-4">
                          <h4 className="font-semibold text-slate-900 dark:text-gray-100 mb-3 text-sm">
                            Interviewee Proposed Times
                          </h4>
                          <div className="text-xs text-slate-600 dark:text-gray-400 mb-3">
                            Alternative time slots suggested by interviewee
                          </div>
                          <ul className="space-y-2">
                            {intervieweeSlots.length > 0 ? (
                              intervieweeSlots.map((s, i) => {
                                const expired = new Date(s).getTime() <= Date.now();
                                return (
                                  <li
                                    key={i}
                                    className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                      selectedToAccept === s
                                        ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-700"
                                        : "bg-white dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:bg-slate-50 dark:hover:bg-gray-600"
                                    }`}
                                  >
                                    {isInterviewer && (
                                      <input
                                        type="radio"
                                        name="acceptSlot"
                                        value={s}
                                        checked={selectedToAccept === s}
                                        onChange={() => setSelectedToAccept(s)}
                                        className="mt-1 text-indigo-600 dark:text-indigo-400 focus:ring-indigo-500"
                                        disabled={expired}
                                      />
                                    )}
                                    <div className="flex-1">
                                      <div className="text-sm font-medium text-slate-900 dark:text-gray-100">
                                        {new Date(s).toLocaleString()}
                                      </div>
                                      <div className="text-xs text-slate-500 dark:text-gray-400 mt-1">
                                        Proposed by:{" "}
                                        {selectedPair?.interviewee?.name ||
                                          selectedPair?.interviewee?.email}
                                      </div>
                                      {expired && (
                                        <div className="text-xs font-semibold text-red-600 dark:text-red-400 mt-1">Expired</div>
                                      )}
                                    </div>
                                  </li>
                                );
                              })
                            ) : (
                              <li className="text-slate-500 dark:text-gray-400 text-sm text-center py-4">
                                No alternative slots proposed
                              </li>
                            )}
                          </ul>
                          {/* Past time section moved to global dropdown */}
                        </div>
                      </div>
                    )}
                  </div>

                  {currentProposals.common && (
                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-700 text-sm flex items-center">
                      <Clock className="w-4 h-4 mr-2 flex-shrink-0 dark:text-blue-400" />
                      <div>
                        <span className="font-medium">Common slot identified: </span>
                        {new Date(currentProposals.common).toLocaleString()}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <button
                      disabled={!!proposeDisabledReason || isLoading}
                      onClick={handlePropose}
                      className="px-5 py-2.5 bg-sky-600 text-white rounded-lg font-medium text-sm hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isLoading && <span className="animate-spin">⏳</span>}
                      {isLoading ? 'Processing...' : 'Propose Slot'}
                    </button>
                    {proposeDisabledReason && (
                      <div className="text-xs text-slate-500 mt-1">{proposeDisabledReason}</div>
                    )}

                    <div className="flex gap-2">
                      <button
                        disabled={!selectedToAccept || isLocked || isLoading}
                        onClick={() => handleConfirm(selectedToAccept, "")}
                        className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isLoading && <span className="animate-spin">⏳</span>}
                        {isLoading ? 'Processing...' : 'Accept Selected Time'}
                      </button>

                      <button
                        disabled={isLocked || isLoading}
                        onClick={handleReject}
                        className="px-5 py-2.5 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isLoading && <span className="animate-spin">⏳</span>}
                        {isLoading ? 'Processing...' : 'Reject Latest'}
                      </button>
                    </div>
                  </div>

                  {isLocked && selectedPair.meetingLink && (
                    <div className="mt-6 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <span className="font-semibold text-indigo-900 text-sm">
                          Meeting Details
                        </span>
                        <span className="text-xs text-slate-600 bg-white px-2 py-1 rounded border">
                          Jitsi Meet
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="text"
                          readOnly
                          value={
                            meetingLinkEnabled
                              ? selectedPair.meetingLink
                              : `Meeting link will be available ${new Date(
                                  new Date(selectedPair.scheduledAt).getTime() -
                                    30 * 60 * 1000
                                ).toLocaleString()}`
                          }
                          className={`flex-1 border rounded-lg px-3 py-2 text-sm font-medium ${
                            meetingLinkEnabled
                              ? "bg-white border-indigo-300 text-slate-900"
                              : "bg-slate-100 border-slate-300 text-slate-500"
                          }`}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              if (!meetingLinkEnabled) return;
                              window.open(selectedPair.meetingLink, "_blank");
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              meetingLinkEnabled
                                ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                : "bg-slate-300 text-slate-500 cursor-not-allowed"
                            }`}
                            disabled={!meetingLinkEnabled}
                          >
                            Join Meeting
                          </button>
                          <button
                            onClick={() => {
                              if (!meetingLinkEnabled) return;
                              navigator.clipboard.writeText(
                                selectedPair.meetingLink
                              );
                              setMessage("Meeting link copied to clipboard");
                            }}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                              meetingLinkEnabled
                                ? "bg-white border border-indigo-300 hover:bg-indigo-50 text-indigo-700"
                                : "bg-slate-100 border border-slate-300 text-slate-400 cursor-not-allowed"
                            }`}
                            disabled={!meetingLinkEnabled}
                          >
                            Copy Link
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <AnimatePresence>
                    {message && (
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 5 }}
                        className={`flex items-center text-sm p-3 rounded-lg ${
                          message.toLowerCase().includes("success") || 
                          message.toLowerCase().includes("copied")
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : "bg-red-50 text-red-800 border border-red-200"
                        }`}
                      >
                        {message.toLowerCase().includes("success") || 
                         message.toLowerCase().includes("copied") ? (
                          <CheckCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                        )}
                        {message}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <Users className="w-16 h-16 text-sky-500 mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Select an Interview Pair
                  </h3>
                  <p className="text-slate-600 text-sm max-w-md">
                    Choose an interview pair from the sidebar to view details, 
                    propose time slots, and manage scheduling.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
