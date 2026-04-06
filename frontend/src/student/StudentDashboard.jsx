/* eslint-disable no-unused-vars */
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import RequirePasswordChange from "./RequirePasswordChange";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../utils/api";
import {
  CheckCircle, Clock, Calendar, Users, Info, ChevronLeft,
  BookOpen, Award, X, Search, User, UserCheck, PlusCircle, AlertCircle,
  Pin, PinOff, PanelLeftClose, PanelLeftOpen, GraduationCap, TrendingUp, Target, Video, MessageSquare, Zap, ArrowRight
} from "lucide-react";
import DateTimePicker from "../components/DateTimePicker";

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [joinMsg, setJoinMsg] = useState("");
  const [showJoinRestriction, setShowJoinRestriction] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedKey, setSelectedKey] = useState("regular-all");
  
  // Pairing-related states
  const [pairs, setPairs] = useState([]);
  const [selectedPairRole, setSelectedPairRole] = useState(null); // 'interviewer' or 'interviewee'
  const [selectedPair, setSelectedPair] = useState(null);
  const [slots, setSlots] = useState([""]);
  const [message, setMessage] = useState("");
  const [me, setMe] = useState(null);
  const [currentProposals, setCurrentProposals] = useState({
    mine: [],
    partner: [],
    common: null,
    mineUpdatedAt: null,
    partnerUpdatedAt: null,
  });
  const [selectedToAccept, setSelectedToAccept] = useState("");
  const [meetingLinkEnabled, setMeetingLinkEnabled] = useState(false);
  const [timeUntilEnable, setTimeUntilEnable] = useState(null);
  const [isLoadingPairs, setIsLoadingPairs] = useState(false);
  const [showPastDropdown, setShowPastDropdown] = useState(false);
  const pastDropdownRef = useRef(null);
  const [showProposeForm, setShowProposeForm] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Sidebar collapse/expand state
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);
  const sidebarExpanded = sidebarPinned || sidebarHovered;

  // Set mounted state after initial render to prevent flicker
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const startFeedbackCountdown = useCallback((pair) => {
    if (!pair) {
      return;
    }
    const myId = (typeof window !== 'undefined') ? localStorage.getItem('userId') : null;
    const interviewerId = pair?.interviewer?._id || pair?.interviewer;
    const isInterviewer = myId && String(interviewerId) === String(myId);
    
    
    if (!isInterviewer) {
      return;
    }
    
    const key = `feedbackTimer:${pair._id}`;
    const now = Date.now();
    // Changed from 2 minutes to 10 seconds for testing
    const dueAt = now + 10 * 1000; // 10 seconds
    const payload = { pairId: pair._id, startAt: now, dueAt };
    
    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch (e) {
      console.error('[Feedback] Failed to save timer:', e);
    }
    
    const delay = Math.max(0, dueAt - Date.now());
    
    setTimeout(() => {
      navigate(`/student/feedback/${pair._id}`);
    }, delay);
  }, [navigate]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const eventsData = await api.listEvents();
        setEvents(eventsData);
        
        // Fetch pairs for all joined events
        const joinedEvents = eventsData.filter(e => e.joined);
        if (joinedEvents.length > 0) {
          const allPairs = [];
          for (const event of joinedEvents) {
            try {
              const pairsData = await api.listPairs(event._id);
              const pairsWithEvent = pairsData.map((p) => ({ ...p, event }));
              allPairs.push(...pairsWithEvent);
            } catch (err) {
              console.error(`Failed to load pairs for event ${event._id}:`, err);
            }
          }
          setPairs(allPairs);
        }
      } catch (err) {
        console.error("Failed to load events:", err);
      }
    };
    
    // Check if feedback was just submitted
    const feedbackFlag = localStorage.getItem('feedbackJustSubmitted');
    if (feedbackFlag === 'true') {
      localStorage.removeItem('feedbackJustSubmitted');
    }
    
    loadData();
    
    // Fetch user profile from backend and set me state for pairing
    api.me().then((userData) => {
      setUser(userData);
      
      // SECURITY: Since we migrated to HttpOnly cookies, get user identity from API response
      const meData = {
        id: userData._id || userData.id,
        role: userData.role,
        email: userData.email,
        name: userData.name,
      };
      setMe(meData);
    }).catch((err) => {
      console.error('[Dashboard] Failed to fetch user data:', err);
    });
    
    // Add event listener to refresh data when window regains focus
    // This ensures both interviewer and interviewee see updated status
    const handleFocus = () => {
      loadData();
    };
    
    window.addEventListener('focus', handleFocus);
    
    // Cleanup listener on unmount
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const handleEventClick = useCallback(async (event) => {
    setSelectedEvent({ ...event });
    setJoinMsg("");
    setSelectedPairRole(null); // Reset pair role selection
    setSelectedPair(null); // Reset pair selection
    setMessage(""); // Reset pairing messages
    setSearchTerm(""); // Clear search when event is selected
    
    // Refresh pairs for this event if it's joined
    if (event.joined) {
      setIsLoadingPairs(true);
      try {
        const pairsData = await api.listPairs(event._id);
        const pairsWithEvent = pairsData.map((p) => ({ ...p, event }));
        
        // Update pairs state by removing old pairs for this event and adding new ones
        setPairs(prevPairs => {
          const filteredPairs = prevPairs.filter(p => p.event._id !== event._id);
          return [...filteredPairs, ...pairsWithEvent];
        });
      } catch (err) {
        console.error("Failed to load pairs:", err);
      } finally {
        setIsLoadingPairs(false);
      }
    }
    
    try {
      const res = await api.getEventTemplateUrl(event._id);
      if (res?.templateUrl) {
        setSelectedEvent((prev) => (prev ? { ...prev, templateUrl: res.templateUrl } : prev));
      }
    } catch (err) {
      // Ignore template fetch errors silently
    }
  }, []);

  const handleCloseEvent = useCallback(() => {
    setSelectedEvent(null);
    setSelectedPairRole(null);
    setSelectedPair(null);
    setMessage("");
  }, []);

  const handleJoinEvent = async () => {
    if (!selectedEvent) return;
    try {
      const res = await api.joinEvent(selectedEvent._id);
      setJoinMsg(res?.message || "Successfully joined the interview!");
      setSelectedEvent((prev) => (prev ? { ...prev, joined: true } : prev));
      setEvents((prev) => prev.map((e) => (e._id === selectedEvent._id ? { ...e, joined: true } : e)));
      
      // Fetch pairs for the newly joined event
      try {
        const pairsData = await api.listPairs(selectedEvent._id);
        const pairsWithEvent = pairsData.map((p) => ({ ...p, event: selectedEvent }));
        setPairs(prevPairs => {
          const filteredPairs = prevPairs.filter(p => p.event._id !== selectedEvent._id);
          return [...filteredPairs, ...pairsWithEvent];
        });
      } catch (pairErr) {
        console.error("Failed to load pairs after joining:", pairErr);
      }
    } catch (err) {
      const msg = err?.message || "Failed to join the interview.";
      // If backend restriction triggers, show popup modal with required copy
      if (msg.includes('created before your registration')) {
        setShowJoinRestriction(true);
        setJoinMsg("");
      } else {
        setJoinMsg(msg);
      }
    }
  };

  // Format time consistently for all users - shows local time with timezone
  const fmt = (d) => {
    if (!d) return "TBD";
    const date = new Date(d);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Pairing-related helper functions
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
  const isCompleted = selectedPair?.status === "completed";
  
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

  // Track proposal counts - how many NEW proposals each user has made
  const myProposalCount = useMemo(() => {
    if (!selectedPair) return 0;
    return isInterviewer 
      ? selectedPair.interviewerProposalCount || 0
      : selectedPair.intervieweeProposalCount || 0;
  }, [selectedPair, isInterviewer]);
  
  const partnerProposalCount = useMemo(() => {
    if (!selectedPair) return 0;
    return isInterviewer
      ? selectedPair.intervieweeProposalCount || 0
      : selectedPair.interviewerProposalCount || 0;
  }, [selectedPair, isInterviewer]);
  
  const totalProposalCount = myProposalCount + partnerProposalCount;
  const combinedRemainingProposals = Math.max(0, 6 - totalProposalCount);
  const myRemainingProposals = Math.max(0, 3 - myProposalCount);
  const partnerRemainingProposals = Math.max(0, 3 - partnerProposalCount);
  const bothReachedLimit = totalProposalCount >= 6;

  // Memoize isSystemDefault to prevent flicker when proposals update
  const isSystemDefault = useMemo(() => {
    const mySlots = isInterviewer ? currentProposals.mine || [] : currentProposals.partner || [];
    const partnerSlots = isInterviewer ? currentProposals.partner || [] : currentProposals.mine || [];
    return mySlots.length === 1 && partnerSlots.length === 1 && mySlots[0] === partnerSlots[0];
  }, [currentProposals.mine, currentProposals.partner, isInterviewer]);

  const getUserRoleInPair = (pair) => {
    if (!me || !pair) {
      return null;
    }

    const interviewerId = pair.interviewer?._id || pair.interviewer;
    const intervieweeId = pair.interviewee?._id || pair.interviewee;

    if (me.id && String(interviewerId) === String(me.id)) {
      return "interviewer";
    }
    if (me.id && String(intervieweeId) === String(me.id)) {
      return "interviewee";
    }
    if (me.email && pair.interviewer?.email === me.email) {
      return "interviewer";
    }
    if (me.email && pair.interviewee?.email === me.email) {
      return "interviewee";
    }

    return null;
  };

  // Helper function to get message styling based on content
  const getMessageStyle = (msg) => {
    const lowerMsg = msg.toLowerCase();
    
    // Success messages
    if (lowerMsg.includes("success") || 
        lowerMsg.includes("proposed") || 
        lowerMsg.includes("accepted") ||
        lowerMsg.includes("confirmed") ||
        lowerMsg.includes("scheduled") ||
        lowerMsg.includes("copied")) {
      return {
        bg: "bg-emerald-50 dark:bg-emerald-900/30",
        text: "text-emerald-800 dark:text-emerald-300",
        border: "border-emerald-200 dark:border-emerald-700",
        icon: CheckCircle,
        iconColor: "text-emerald-600 dark:text-emerald-400"
      };
    }
    
    // Info/Waiting messages
    if (lowerMsg.includes("waiting") || 
        lowerMsg.includes("pending") ||
        lowerMsg.includes("slot") ||
        lowerMsg.includes("partner") ||
        lowerMsg.includes("propose")) {
      return {
        bg: "bg-blue-50 dark:bg-blue-900/30",
        text: "text-blue-800 dark:text-blue-300",
        border: "border-blue-200 dark:border-blue-700",
        icon: Info,
        iconColor: "text-blue-600 dark:text-blue-400"
      };
    }
    
    // Warning messages
    if (lowerMsg.includes("adjusted") || 
        lowerMsg.includes("changed") ||
        lowerMsg.includes("before") ||
        lowerMsg.includes("after")) {
      return {
        bg: "bg-amber-50 dark:bg-amber-900/30",
        text: "text-amber-800 dark:text-amber-300",
        border: "border-amber-200 dark:border-amber-700",
        icon: AlertCircle,
        iconColor: "text-amber-600 dark:text-amber-400"
      };
    }
    
    // Error/Rejection messages
    if (lowerMsg.includes("error") || 
        lowerMsg.includes("failed") ||
        lowerMsg.includes("reject") ||
        lowerMsg.includes("cannot") ||
        lowerMsg.includes("unable")) {
      return {
        bg: "bg-red-50 dark:bg-red-900/30",
        text: "text-red-800 dark:text-red-300",
        border: "border-red-200 dark:border-red-700",
        icon: AlertCircle,
        iconColor: "text-red-600 dark:text-red-400"
      };
    }
    
    // Default to info style
    return {
      bg: "bg-slate-50 dark:bg-gray-700",
      text: "text-slate-800 dark:text-gray-200",
      border: "border-slate-200 dark:border-gray-600",
      icon: Info,
      iconColor: "text-slate-600 dark:text-gray-400"
    };
  };

  // Fetch proposals when a pair is selected and poll for updates
  useEffect(() => {
    if (!selectedPair) {
      setCurrentProposals({ mine: [], partner: [], common: null });
      return;
    }
    
    const fetch = async () => {
      setSelectedToAccept("");
      try {
        const res = await api.proposeSlots(selectedPair._id, []);
        setCurrentProposals(res);
        setShowPastDropdown(false);
        
        // Update selectedPair with fresh proposal counts
        if (res.interviewerProposalCount !== undefined && res.intervieweeProposalCount !== undefined) {
          setSelectedPair(prev => ({
            ...prev,
            interviewerProposalCount: res.interviewerProposalCount,
            intervieweeProposalCount: res.intervieweeProposalCount,
            status: res.status || prev.status
          }));
        }
      } catch {
        // ignore
      }
    };
    
    // Fetch actual proposal data (will override default if proposals exist)
    fetch();
    
    // Poll for updates every 10 seconds when a pair is selected (reduced frequency)
    
    const pollInterval = setInterval(async () => {
      try {
        const res = await api.proposeSlots(selectedPair._id, []);
        // Only update if data actually changed to prevent flicker
        setCurrentProposals(prev => {
          const mineChanged = JSON.stringify(prev.mine) !== JSON.stringify(res.mine);
          const partnerChanged = JSON.stringify(prev.partner) !== JSON.stringify(res.partner);
          const commonChanged = prev.common !== res.common;
          const countsChanged = prev.interviewerProposalCount !== res.interviewerProposalCount ||
                               prev.intervieweeProposalCount !== res.intervieweeProposalCount;
          if (mineChanged || partnerChanged || commonChanged || countsChanged) {
            // Update selectedPair counts if they changed
            if (countsChanged && res.interviewerProposalCount !== undefined && res.intervieweeProposalCount !== undefined) {
              setSelectedPair(prevPair => ({
                ...prevPair,
                interviewerProposalCount: res.interviewerProposalCount,
                intervieweeProposalCount: res.intervieweeProposalCount,
                status: res.status || prevPair.status
              }));
            }
            return res;
          }
          return prev; // No change, keep previous state
        });
      } catch {
        // ignore polling errors
      }
    }, 10000); // Poll every 10 seconds (less aggressive)
    
    return () => clearInterval(pollInterval);
  }, [selectedPair]);

  // Close Past Time dropdown on outside click
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

  // Meeting link timer
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

  // Removed: useEffect that was resetting selectedToAccept and causing flicker

  // Pairing action handlers
  // Helper to get current datetime for min validation
  const getCurrentMinDateTime = () => {
    const now = new Date();
    const eventStart = selectedPair?.event?.startDate ? new Date(selectedPair.event.startDate) : null;
    // Use the later of current time or event start
    const minDate = eventStart && eventStart > now ? eventStart : now;
    return minDate.toISOString();
  };

  const handlePropose = async () => {
    setMessage("");
    
    if (isLoadingPairs) return;
    setIsLoadingPairs(true);
    
    function parseLocalDateTime(value) {
      if (!value) return NaN;
      const [datePart, timePart] = String(value).split("T");
      if (!datePart || !timePart) return NaN;
      const [y, m, d] = datePart.split("-").map(Number);
      const [hh, mm] = timePart.split(":").map(Number);
      if ([y, m, d, hh, mm].some((v) => Number.isNaN(v))) return NaN;
      return new Date(y, m - 1, d, hh, mm).getTime();
    }

    const now = Date.now();
    const isoSlots = slots.filter(Boolean).map((s) => {
      if (String(s).endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(String(s))) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d.toISOString();
      }
      const t = parseLocalDateTime(s);
      if (!isNaN(t)) return new Date(t).toISOString();
      return s;
    });
    if (!selectedPair || isoSlots.length === 0) {
      setMessage("⚠ Please select a time slot to continue.");
      setIsLoadingPairs(false);
      return false;
    }
    
    // Only accept one slot
    if (isoSlots.length > 1) {
      setMessage("⚠ Please propose only one time slot.");
      setIsLoadingPairs(false);
      return false;
    }
    
    // Check for past time slots
    const parsedSlots = isoSlots.map(s => new Date(s));
    const hasPastSlot = parsedSlots.some(d => !isNaN(d.getTime()) && d.getTime() <= now);
    if (hasPastSlot) {
      setMessage("⚠ Cannot propose past time slots. Please select a future time.");
      setIsLoadingPairs(false);
      return false;
    }
    
    // Check if time has already been proposed before (in history)
    const allPastTimes = [
      ...(currentProposals?.minePastEntries || []).map(e => new Date(e.time).getTime()),
      ...(currentProposals?.partnerPastEntries || []).map(e => new Date(e.time).getTime())
    ];
    const proposedTime = parsedSlots[0].getTime();
    if (allPastTimes.some(pastTime => Math.abs(pastTime - proposedTime) < 60000)) { // Within 1 minute = same slot
      setMessage("⚠ This time has already been proposed before. Please select a different time.");
      setIsLoadingPairs(false);
      return false;
    }
    
    // Check if combined proposals will exceed limit (frontend validation)
    if (totalProposalCount >= 6) {
      setMessage("⚠ Maximum proposals (6 combined) already reached. Interview should be automatically scheduled.");
      setIsLoadingPairs(false);
      return false;
    }
    
    try {
      const ev = selectedPair.event || {};
      const startBoundary = ev.startDate
        ? new Date(ev.startDate).getTime()
        : null;
      const endBoundary = ev.endDate ? new Date(ev.endDate).getTime() : null;
      const parsed = isoSlots.map((s) => new Date(s));
      if (parsed.some((d) => isNaN(d.getTime()))) {
        setMessage("⚠️ One or more selected time slots are invalid. Please check and try again.");
        setIsLoadingPairs(false);
        return false;
      }
      if (startBoundary && parsed.some((d) => d.getTime() < startBoundary)) {
        setMessage("⚠️ Some time slots are before the event start time. Please adjust your selection.");
        setIsLoadingPairs(false);
        return false;
      }
      if (endBoundary && parsed.some((d) => d.getTime() > endBoundary)) {
        setMessage("⚠️ Some time slots are after the event end time. Please adjust your selection.");
        setIsLoadingPairs(false);
        return false;
      }
    } catch (e) {
      // ignore parsing errors handled above
    }

    try {
      const res = await api.proposeSlots(selectedPair._id, isoSlots);
      
      // Debug: Log the proposed time and response
      
      // Immediately update currentProposals with the response
      setCurrentProposals(res);
      
      // Update selectedPair with fresh proposal counts from backend response
      if (res.interviewerProposalCount !== undefined && res.intervieweeProposalCount !== undefined) {
        setSelectedPair(prev => ({
          ...prev,
          interviewerProposalCount: res.interviewerProposalCount,
          intervieweeProposalCount: res.intervieweeProposalCount,
          status: res.status || prev.status
        }));
      }
      
      if (res.status === 'scheduled') {
        setMessage(
          `✓ Interview automatically scheduled! This was the 6th combined proposal, so the interview is now confirmed at ${fmt(res.currentProposedTime || res.scheduledAt)}`
        );
      } else if (res.common) {
        setMessage(
          `✓ Interview time confirmed: ${fmt(res.common)}`
        );
      } else {
        // Calculate user's remaining proposals (max 3 per user)
        const myNewCount = isInterviewer 
          ? (res.interviewerProposalCount || 0)
          : (res.intervieweeProposalCount || 0);
        const myRemaining = Math.max(0, 3 - myNewCount);
        
        if (myRemaining > 0) {
          setMessage(`Time proposal sent! You have ${myRemaining} proposal${myRemaining !== 1 ? 's' : ''} remaining.`);
        } else {
          setMessage("Final proposal submitted. You've used all 3 of your proposals. Waiting for the other party to respond.");
        }
      }
      
      // Refresh pairs to update status
      if (selectedEvent) {
        const pairsData = await api.listPairs(selectedEvent._id);
        const pairsWithEvent = pairsData.map((p) => ({ ...p, event: selectedEvent }));
        setPairs(prevPairs => {
          const filteredPairs = prevPairs.filter(p => p.event._id !== selectedEvent._id);
          return [...filteredPairs, ...pairsWithEvent];
        });
        const updatedPair = pairsWithEvent.find(p => p._id === selectedPair._id);
        if (updatedPair) setSelectedPair(updatedPair);
      }
      return true;
    } catch (err) {
      setMessage(err.message);
      return false;
    } finally {
      setIsLoadingPairs(false);
    }
  };



  const handleConfirm = async (dt, link) => {
    if (!selectedPair || !selectedEvent) return;
    if (isLoadingPairs) return;
    setIsLoadingPairs(true);
    try {
      let iso;
      
      // Handle different input formats
      if (typeof dt === 'object' && dt.proposedStart) {
        // Object format (from default time confirmation)
        iso = new Date(dt.proposedStart).toISOString();
      } else if (typeof dt === 'string') {
        // String format (from proposal confirmation)
        iso = dt.includes("T") ? new Date(dt).toISOString() : dt;
      } else {
        // Direct date
        iso = new Date(dt).toISOString();
      }
      
      await api.confirmSlot(selectedPair._id, iso, link);
      setMessage("Interview time confirmed. Notification sent to both parties.");

      // Fetch updated pairs and proposals in parallel for faster response
      const [pairsData, ro] = await Promise.all([
        api.listPairs(selectedEvent._id),
        api.proposeSlots(selectedPair._id, []),
      ]);

      const pairsWithEvent = pairsData.map((p) => ({ ...p, event: selectedEvent }));
      setPairs(prevPairs => {
        const filteredPairs = prevPairs.filter(p => p.event._id !== selectedEvent._id);
        return [...filteredPairs, ...pairsWithEvent];
      });
      
      // Update the selected pair with the new data
      const updatedPair = pairsWithEvent.find(p => p._id === selectedPair._id);
      if (updatedPair) {
        setSelectedPair(updatedPair);
      }

      // Refresh proposals state
      setCurrentProposals(ro);
      
      // Update selectedPair with fresh proposal counts
      if (ro.interviewerProposalCount !== undefined && ro.intervieweeProposalCount !== undefined) {
        setSelectedPair(prev => ({
          ...prev,
          interviewerProposalCount: ro.interviewerProposalCount,
          intervieweeProposalCount: ro.intervieweeProposalCount,
          status: ro.status || prev.status
        }));
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setIsLoadingPairs(false);
    }
  };

  const handleReject = async () => {
    if (!selectedPair || !selectedEvent) return;
    try {
      await api.rejectSlots(selectedPair._id);
      setMessage("Time declined. Your partner can now suggest a different time.");
      
      // Refresh pairs for this event
      const pairsData = await api.listPairs(selectedEvent._id);
      const pairsWithEvent = pairsData.map((p) => ({ ...p, event: selectedEvent }));
      setPairs(prevPairs => {
        const filteredPairs = prevPairs.filter(p => p.event._id !== selectedEvent._id);
        return [...filteredPairs, ...pairsWithEvent];
      });
      
      // Update the selected pair with the new data
      const updatedPair = pairsWithEvent.find(p => p._id === selectedPair._id);
      if (updatedPair) {
        setSelectedPair(updatedPair);
      }
      
      // Refresh proposals (removed intermediate empty state that caused flicker)
      const ro = await api.proposeSlots(selectedPair._id, []);
      setCurrentProposals(ro);
      
      // Update selectedPair with fresh proposal counts
      if (ro.interviewerProposalCount !== undefined && ro.intervieweeProposalCount !== undefined) {
        setSelectedPair(prev => ({
          ...prev,
          interviewerProposalCount: ro.interviewerProposalCount,
          intervieweeProposalCount: ro.intervieweeProposalCount,
          status: ro.status || prev.status
        }));
      }
    } catch (err) {
      setMessage(err.message);
    }
  };

  const now = new Date();
  // Derive current event type and status from unified key
  const currentType = selectedKey === "past" ? "past" : (selectedKey.startsWith("special") ? "special" : "regular");
  const currentStatus = selectedKey === "past" ? "all" : (selectedKey.endsWith("-active") ? "active" : selectedKey.endsWith("-upcoming") ? "upcoming" : "all");

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.description.toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;
    
    // Calculate event status
    const isPast = event.endDate && new Date(event.endDate) < now;
    const isUpcoming = event.startDate && new Date(event.startDate) > now;
    const isActive = !isPast && !isUpcoming;
    
    // Filter by event type (regular/special/past)
    if (currentType === "past") {
      return isPast;
    } else if (currentType === "special") {
      if (!event.isSpecial || isPast) return false;
    } else if (currentType === "regular") {
      if (event.isSpecial || isPast) return false;
    }
    
    // Filter by status (all/active/upcoming) - only for non-past events
    if (currentType !== "past" && currentStatus !== "all") {
      if (currentStatus === "active") {
        return isActive;
      }
      if (currentStatus === "upcoming") {
        return isUpcoming;
      }
    }
    
    return true;
  });

  const stats = useMemo(() => ({
    totalEvents: events.length,
    joinedEvents: events.filter(e => e.joined).length,
    completedEvents: events.filter(e => e.endDate && new Date(e.endDate) < new Date()).length,
    specialEvents: events.filter(e => e.isSpecial).length
  }), [events]);

  const StatsComponent = useMemo(() => {
    const statsData = [
      { label: "Total", value: stats.totalEvents, icon: BookOpen, color: "sky" },
      { label: "Joined", value: stats.joinedEvents, icon: CheckCircle, color: "emerald" },
      { label: "Special", value: stats.specialEvents, icon: Award, color: "purple" }
    ];

    return () => (
      <div className="grid grid-cols-3 gap-3 mb-4">
        {statsData.map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold text-slate-800 dark:text-gray-100">{stat.value}</div>
                <div className="text-xs text-slate-600 dark:text-gray-400">{stat.label}</div>
              </div>
              <div className={`p-1.5 bg-${stat.color}-50 rounded`}>
                <stat.icon className={`w-3 h-3 text-${stat.color}-600`} />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }, [stats]);

  const EventList = () => (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-3 sm:p-4 h-[calc(100vh-5rem)] sm:h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
      {/* Show stats only when no event is selected on mobile */}
      {!selectedEvent && (
        <div className="lg:hidden mb-3 sm:mb-4">
          <StatsComponent />
        </div>
      )}
      
      {/* Header with close button when event is selected */}
      {selectedEvent ? (
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-gray-100">Selected Interview</h2>
          <button
            onClick={handleCloseEvent}
            className="p-1.5 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-200 hover:text-slate-900 dark:hover:text-gray-100 transition-colors"
            title="Close and show all events"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-gray-100">Interviews</h2>
            <span className="px-2 py-0.5 bg-sky-500 text-white rounded text-xs font-medium">
              {filteredEvents.length}
            </span>
          </div>
        </>
      )}
      
      {/* Filters - Hide when event is selected */}
      {!selectedEvent && (
        <div className="mb-3 space-y-2">
          {/* Event Type Filter */}
          <div className="flex gap-1.5">
            {[
              { id: "regular", label: "Regular", color: "sky" },
              { id: "special", label: "Special", color: "purple" },
              { id: "past", label: "Past", color: "slate" }
            ].map((tab) => {
              const isActive = (tab.id === "past" && selectedKey === "past") ||
                               (tab.id !== "past" && selectedKey.startsWith(tab.id));
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "past") {
                      setSelectedKey("past");
                    } else {
                      setSelectedKey(`${tab.id}-all`);
                    }
                  }}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? tab.id === "regular"
                        ? "bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-md"
                        : tab.id === "special"
                        ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md"
                        : "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md"
                      : "bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-600 hover:border-slate-300 dark:hover:border-gray-500 hover:shadow-sm"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Status Filter - Only show for Regular/Special, not Past */}
          {currentType !== "past" && (
            <div className="flex gap-1.5">
              {[
                { id: "all", label: "All", icon: "●" },
                { id: "active", label: "Active", icon: "●" },
                { id: "upcoming", label: "Upcoming", icon: "●" }
              ].map((filter) => {
                const isActive = currentStatus === filter.id;
                return (
                  <button
                    key={filter.id}
                    onClick={() => {
                      const type = selectedKey.startsWith("special") ? "special" : "regular";
                      setSelectedKey(`${type}-${filter.id}`);
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                      isActive
                        ? "bg-slate-800 dark:bg-gray-600 text-white shadow-sm"
                        : "bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-600 hover:text-slate-800 dark:hover:text-gray-100"
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Search - Hide when event is selected */}
      {!selectedEvent && (
        <div className="relative mb-3">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-500 dark:text-gray-400" />
          <input
            type="text"
            placeholder="Search interviews..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 bg-slate-50 dark:bg-gray-700 rounded border border-slate-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500"
          />
        </div>
      )}

      {/* Event List */}
      <div className="space-y-2 flex-1 overflow-y-auto pr-1">
        {selectedEvent ? (
          // Show only the selected event
          (() => {
            const event = selectedEvent;
            const active = true;
            const isUpcoming = new Date(event.startDate) > now;
            const isActive = !isUpcoming && (!event.endDate || new Date(event.endDate) > now);
            const isPast = event.endDate && new Date(event.endDate) < now;
            const isSpecial = event.isSpecial;
            
            // Get pairing info for this event
            const eventPairs = pairs.filter(p => p.event._id === event._id);
            const interviewerPair = eventPairs.find(p => getUserRoleInPair(p) === "interviewer");
            const intervieweePair = eventPairs.find(p => getUserRoleInPair(p) === "interviewee");
            
            
            return (
              <div key={event._id} className="space-y-1">
                <button
                  onClick={() => handleEventClick(event)}
                  className={`w-full text-left p-3 rounded-lg transition-colors border ${
                    active
                      ? isSpecial
                        ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20"
                        : "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20"
                      : "border-slate-200 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-600"
                  } ${event.joined 
                      ? isSpecial 
                        ? "ring-1 ring-purple-200 dark:ring-purple-700" 
                        : "ring-1 ring-emerald-200 dark:ring-emerald-700" 
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`p-1.5 rounded ${
                      event.joined
                        ? isSpecial
                          ? "bg-purple-100 text-purple-600"
                          : isActive 
                          ? "bg-emerald-100 text-emerald-600"
                          : isPast
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-600"
                        : "bg-sky-100 text-sky-600"
                    }`}>
                      {event.joined ? <CheckCircle size={14} /> : <Calendar size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-slate-800 dark:text-gray-100 truncate text-sm">{event.name}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isSpecial && (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-purple-100 text-purple-700 font-medium">
                              Special
                            </span>
                          )}
                          {!isSpecial && (
                            <span className={`px-1.5 py-0.5 text-xs rounded font-medium ${
                              event.joined
                                ? isSpecial
                                  ? "bg-purple-50 text-purple-600"
                                  : isActive 
                                  ? "bg-emerald-100 text-emerald-700" 
                                  : isPast
                                  ? "bg-slate-100 text-slate-600"
                                  : "bg-amber-100 text-amber-700"
                              : isActive 
                              ? "bg-emerald-100 text-emerald-700" 
                              : isPast
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-100 text-amber-700"
                            }`}>
                              {isActive ? "Active" : isPast ? "Past" : "Upcoming"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-gray-400 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>{fmt(event.startDate)}</span>
                        </div>
                        {event.joined && (
                          <span className="flex items-center gap-1 text-emerald-600 font-medium">
                            <UserCheck size={12} />
                            Joined
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                
                {/* Pairing Tabs with Tree Structure */}
                {active && event.joined && (interviewerPair || intervieweePair) && (
                  <div className="relative pl-4">
                    {/* Vertical line connecting to parent event */}
                    <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-300 dark:bg-gray-600"></div>
                    
                    <div className="space-y-1">
                      {interviewerPair && (
                        <div className="relative">
                          {/* Horizontal branch line */}
                          <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300 dark:bg-gray-600"></div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedPairRole !== "interviewer" || selectedPair?._id !== interviewerPair._id) {
                                setSelectedPairRole("interviewer");
                                setSelectedPair(interviewerPair);
                                setMessage("");
                              }
                            }}
                            className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ml-3 ${
                              selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                                ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-300"
                                : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">Interviewer</div>
                            <div className="text-xs text-slate-600 dark:text-gray-400 mt-0.5 truncate">
                              {event.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                interviewerPair.status === "completed"
                                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                                  : interviewerPair.status === "scheduled"
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                  : interviewerPair.status === "rejected"
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                              }`}>
                                {interviewerPair.status === "completed" ? "Finished" : interviewerPair.status === "scheduled" ? "Scheduled" : interviewerPair.status === "rejected" ? "Rejected" : "Pending"}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
                                {interviewerPair.interviewer?.name || interviewerPair.interviewer?.email || "N/A"} ➜ {interviewerPair.interviewee?.name || interviewerPair.interviewee?.email || "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                        </div>
                      )}
                      {intervieweePair && (
                        <div className="relative">
                          {/* Horizontal branch line */}
                          <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300 dark:bg-gray-600"></div>
                          
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (selectedPairRole !== "interviewee" || selectedPair?._id !== intervieweePair._id) {
                                setSelectedPairRole("interviewee");
                                setSelectedPair(intervieweePair);
                                setMessage("");
                              }
                            }}
                            className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ml-3 ${
                              selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                                ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-300"
                                : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-300"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium">Candidate</div>
                            <div className="text-xs text-slate-600 dark:text-gray-400 mt-0.5 truncate">
                              {event.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                intervieweePair.status === "completed"
                                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                                  : intervieweePair.status === "scheduled"
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                  : intervieweePair.status === "rejected"
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                              }`}>
                                {intervieweePair.status === "completed" ? "Finished" : intervieweePair.status === "scheduled" ? "Scheduled" : intervieweePair.status === "rejected" ? "Rejected" : "Pending"}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
                                {intervieweePair.interviewer?.name || intervieweePair.interviewer?.email || "N/A"} ➜ {intervieweePair.interviewee?.name || intervieweePair.interviewee?.email || "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()
        ) : filteredEvents.length === 0 ? (
          <div className="text-center text-slate-500 dark:text-gray-300 py-6">
            <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No interviews found</p>
          </div>
        ) : (
          filteredEvents.map((event, index) => {
            const active = selectedEvent && selectedEvent._id === event._id;
            const isUpcoming = new Date(event.startDate) > now;
            const isActive = !isUpcoming && (!event.endDate || new Date(event.endDate) > now);
            const isPast = event.endDate && new Date(event.endDate) < now;
            const isSpecial = event.isSpecial;
            
            // Get pairing info for this event
            const eventPairs = pairs.filter(p => p.event._id === event._id);
            const interviewerPair = eventPairs.find(p => getUserRoleInPair(p) === "interviewer");
            const intervieweePair = eventPairs.find(p => getUserRoleInPair(p) === "interviewee");
            
            // Debug logging (can be removed in production)
            if (eventPairs.length > 0) {
            }
            
            return (
              <div key={event._id} className="space-y-1">
                <button
                  onClick={() => handleEventClick(event)}
                  className={`w-full text-left p-3 rounded-lg transition-colors border ${
                    active
                      ? isSpecial
                        ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20"
                        : "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20"
                      : "border-slate-200 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-600"
                  } ${event.joined 
                      ? isSpecial 
                        ? "ring-1 ring-purple-200 dark:ring-purple-700" 
                        : "ring-1 ring-emerald-200 dark:ring-emerald-700" 
                      : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`p-1.5 rounded ${
                      event.joined
                        ? isSpecial
                          ? "bg-purple-100 text-purple-600"
                          : isActive 
                          ? "bg-emerald-100 text-emerald-600"
                          : isPast
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-600"
                        : "bg-sky-100 text-sky-600"
                    }`}>
                      {event.joined ? <CheckCircle size={14} /> : <Calendar size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-medium text-slate-800 dark:text-gray-100 truncate text-sm">{event.name}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {event.joined && (
                            <CheckCircle size={12} className={`${
                              isSpecial 
                                ? "text-purple-500" 
                                : isActive 
                                ? "text-emerald-500" 
                                : isPast
                                ? "text-slate-500"
                                : "text-amber-500"
                            }`} />
                          )}
                          {isSpecial && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">
                              Special
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-gray-300 mt-0.5 line-clamp-2">{event.description}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs text-slate-500 dark:text-gray-300 bg-slate-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                          {fmt(event.startDate)}
                        </span>
                        {event.joined && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            isSpecial
                              ? isActive
                                ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                                : "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                              : isActive 
                              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" 
                              : isPast
                              ? "bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400"
                              : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                          }`}>
                            {isActive ? "Active" : isPast ? "Past" : "Upcoming"}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                
                {/* Pairing Tabs - Show when event is selected and joined */}
                {active && event.joined && (interviewerPair || intervieweePair) && (
                  <div className="ml-6 space-y-1">
                    {interviewerPair && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedPairRole !== "interviewer" || selectedPair?._id !== interviewerPair._id) {
                            setSelectedPairRole("interviewer");
                            setSelectedPair(interviewerPair);
                            setMessage("");
                          }
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ${
                          selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                            ? "bg-sky-100 dark:bg-sky-900/30 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-300"
                            : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-sky-200 dark:hover:border-sky-600 text-slate-700 dark:text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3" />
                          <div className="flex-1">
                            <div className="font-medium">Interviewer Name</div>
                            <div className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                              {event.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                interviewerPair.status === "scheduled"
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                  : interviewerPair.status === "rejected"
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                              }`}>
                                {interviewerPair.status === "scheduled" ? "Scheduled" : interviewerPair.status === "rejected" ? "Rejected" : "Pending"}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
                                {interviewerPair.interviewer?.name || interviewerPair.interviewer?.email || "N/A"} ➜ {interviewerPair.interviewee?.name || interviewerPair.interviewee?.email || "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )}
                    {intervieweePair && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (selectedPairRole !== "interviewee" || selectedPair?._id !== intervieweePair._id) {
                            setSelectedPairRole("interviewee");
                            setSelectedPair(intervieweePair);
                            setMessage("");
                          }
                        }}
                        className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ${
                          selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                            ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-300"
                            : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-emerald-200 dark:hover:border-emerald-600 text-slate-700 dark:text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-3 h-3" />
                          <div className="flex-1">
                            <div className="font-medium">Candidate Name</div>
                            <div className="text-xs text-slate-600 dark:text-gray-400 mt-0.5">
                              {event.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                intervieweePair.status === "scheduled"
                                  ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                                  : intervieweePair.status === "rejected"
                                  ? "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                                  : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                              }`}>
                                {intervieweePair.status === "scheduled" ? "Scheduled" : intervieweePair.status === "rejected" ? "Rejected" : "Pending"}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-gray-400 truncate">
                                {intervieweePair.interviewer?.name || intervieweePair.interviewer?.email || "N/A"} ➜ {intervieweePair.interviewee?.name || intervieweePair.interviewee?.email || "N/A"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const PairingDetails = () => (
    <div className="w-full">
      {/* Mobile Back Button */}
      <div className="lg:hidden flex items-center gap-2 mb-4 pb-3 border-b border-slate-200 dark:border-gray-700">
        <button
          onClick={() => {
            setSelectedPairRole(null);
            setSelectedPair(null);
          }}
          className="p-2 rounded-lg bg-slate-100 dark:bg-gray-800 hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-slate-700 dark:text-gray-300" />
        </button>
        <div className="flex-1">
          <div className="text-xs text-slate-500 dark:text-gray-400">Back to event details</div>
          <div className="font-medium text-slate-800 dark:text-gray-200 text-sm">
            {isInterviewer ? "Interviewer" : "Candidate"} View
          </div>
        </div>
      </div>

      {/* Centered Single Card Container */}
      <div className="max-w-3xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 shadow-sm">
          
          {/* Header - Participant Info */}
          <div className="px-6 py-5 border-b border-slate-200 dark:border-gray-700">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
              {/* Interviewer */}
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-base font-bold text-sky-700 dark:text-sky-300">
                    {(selectedPair.interviewer?.name || selectedPair.interviewer?.email)?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left">
                  <div className="text-xs text-slate-500 dark:text-gray-400">Interviewer</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-gray-100 truncate">
                    {selectedPair.interviewer?.name || selectedPair.interviewer?.email}
                  </div>
                </div>
              </div>
              
              <div className="text-slate-300 dark:text-gray-600 text-xl hidden sm:block">→</div>
              
              {/* Candidate */}
              <div className="flex items-center gap-3 flex-1 sm:flex-row-reverse">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-base font-bold text-emerald-700 dark:text-emerald-300">
                    {(selectedPair.interviewee?.name || selectedPair.interviewee?.email)?.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs text-slate-500 dark:text-gray-400">Candidate</div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-gray-100 truncate">
                    {selectedPair.interviewee?.name || selectedPair.interviewee?.email}
                  </div>
                </div>
              </div>
            </div>

            {/* Status Pills */}
            <div className="flex flex-wrap gap-2 justify-center pt-3 border-t border-slate-100 dark:border-gray-700">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  isInterviewer
                    ? "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300"
                    : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                You · {isInterviewer ? "Interviewer" : "Candidate"}
              </span>

              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  selectedPair.status === "scheduled"
                    ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300"
                    : selectedPair.status === "rejected"
                    ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
                    : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
                {selectedPair.status === "scheduled" ? "Confirmed" : selectedPair.status === "rejected" ? "Declined" : "Awaiting"}
              </span>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="px-6 py-6 space-y-5">
            {/* Scheduled Time - Primary Display */}
            {isLocked && selectedPair?.scheduledAt ? (
              isScheduledTimeExpired ? (
                /* Expired Time */
                <div className="p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-red-900 dark:text-red-100 mb-1">Scheduled Time Has Passed</div>
                      <div className="text-3xl font-bold text-red-700 dark:text-red-300 mb-2 tracking-tight">
                        {fmt(selectedPair.scheduledAt)}
                      </div>
                      <div className="text-sm text-red-700 dark:text-red-300">Please request a new time below</div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Confirmed Time - Large Prominent Display */
                <div className="p-6 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-1" />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300 mb-2">Interview Confirmed</div>
                      <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100 mb-2 tracking-tight">
                        {fmt(selectedPair.scheduledAt)}
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(selectedPair.scheduledAt).toLocaleString('en-US', { timeZoneName: 'short' }).split(', ').pop()}
                      </div>
                    </div>
                  </div>
                </div>
              )
            ) : (
              /* Pending Time Display - Show most recent proposal ONLY if actual proposals exist (not just default) */
              (() => {
                const mySlots = currentProposals?.mine || [];
                const partnerSlots = currentProposals?.partner || [];
                const hasActiveProposals = mySlots.length > 0 || partnerSlots.length > 0;
                
                // Check if we have proposal counts - if both are 0, no one has proposed yet (only default exists)
                const myProposalCountValue = isInterviewer 
                  ? selectedPair?.interviewerProposalCount || 0
                  : selectedPair?.intervieweeProposalCount || 0;
                const partnerProposalCountValue = isInterviewer
                  ? selectedPair?.intervieweeProposalCount || 0
                  : selectedPair?.interviewerProposalCount || 0;
                const totalProposals = myProposalCountValue + partnerProposalCountValue;
                
                // Only show this section if someone has actually made a proposal (count > 0)
                if (!hasActiveProposals || totalProposals === 0) {
                  return null;
                }
                
                // Determine which proposal is the most recent one to display
                const myTimestamp = currentProposals.mineUpdatedAt ? new Date(currentProposals.mineUpdatedAt).getTime() : 0;
                const partnerTimestamp = currentProposals.partnerUpdatedAt ? new Date(currentProposals.partnerUpdatedAt).getTime() : 0;
                
                // Show the most recent proposal
                const showMyProposal = mySlots.length > 0 && (partnerSlots.length === 0 || myTimestamp >= partnerTimestamp);
                const displayTime = showMyProposal ? mySlots[0] : partnerSlots[0];
                const proposedByMe = showMyProposal;
                
                // Get partner name
                const partnerName = proposedByMe 
                  ? (isInterviewer ? (selectedPair?.interviewee?.name || 'Candidate') : (selectedPair?.interviewer?.name || 'Interviewer'))
                  : (isInterviewer ? (selectedPair?.interviewee?.name || 'Candidate') : (selectedPair?.interviewer?.name || 'Interviewer'));
                
                const displayTimeDate = new Date(displayTime);
                
                return (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                          {proposedByMe ? 'Your Proposed Time' : `${partnerName} Proposed Time`}
                        </h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          {proposedByMe 
                            ? 'Waiting for the other party to confirm or propose a different time.'
                            : 'Please confirm this time or propose a different one.'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-amber-100 dark:border-amber-900">
                      <div className="text-2xl font-bold text-amber-900 dark:text-amber-100 mb-2">
                        {displayTimeDate.toLocaleString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric', 
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {displayTimeDate.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').slice(-1)[0]}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Past Time Slots Button */}
            <div className="flex justify-end">
              <div className="relative" ref={pastDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowPastDropdown(v => !v)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-slate-50 dark:hover:bg-gray-700 shadow-sm flex items-center gap-2 text-slate-700 dark:text-gray-200 transition-colors"
                >
                  Past Time Allotment
                  {(() => {
                    const count = Array.isArray(currentProposals?.pastTimeSlots)
                      ? currentProposals.pastTimeSlots.length
                      : ((currentProposals?.minePastEntries || []).length + (currentProposals?.partnerPastEntries || []).length);
                    return count > 0 ? (
                      <span className="inline-flex items-center justify-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 dark:bg-slate-600 text-white min-w-[18px]">
                        {count}
                      </span>
                    ) : null;
                  })()}
                </button>
                {showPastDropdown && (
                  <div className="absolute right-0 mt-2 w-96 z-10 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-lg">
                    <div className="p-4">
                      <div className="text-xs font-semibold text-slate-700 dark:text-gray-200 mb-2">Past Time Slots History</div>
                      <div className="text-[10px] text-slate-500 dark:text-gray-400 mb-3">Detailed history of expired, rejected, and replaced proposals</div>
                      {(() => {
                        const entries = Array.isArray(currentProposals?.pastTimeSlots)
                          ? currentProposals.pastTimeSlots
                          : [
                              ...(currentProposals?.minePastEntries || []),
                              ...(currentProposals?.partnerPastEntries || []),
                            ];
                        
                        const filteredEntries = entries
                          .filter(e => {
                            const reason = e.reason?.toLowerCase();
                            return reason === 'expired' || reason === 'rejected' || 
                                   reason === 'replaced' || reason === 'superseded';
                          })
                          .sort((a, b) => new Date(b.time) - new Date(a.time));
                        
                        if (!filteredEntries || filteredEntries.length === 0) {
                          return (
                            <div className="text-sm text-slate-500 dark:text-gray-400 py-4 text-center">No past time slots yet.</div>
                          );
                        }
                        
                        const toLabel = (r) => {
                          if (!r) return 'Replaced';
                          const map = { rejected: 'Rejected', expired: 'Expired', superseded: 'Replaced', replaced: 'Replaced' };
                          return map[r] || (r.charAt(0).toUpperCase() + r.slice(1));
                        };
                        
                        const color = (r) => {
                          if (r === 'rejected') return 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700';
                          if (r === 'expired') return 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700';
                          return 'bg-slate-50 dark:bg-gray-800 border-slate-200 dark:border-gray-700';
                        };
                        
                        const getRoleLabel = (user) => {
                          if (!user) return 'Unknown';
                          const userId = user._id || user;
                          const interviewerId = selectedPair?.interviewer?._id || selectedPair?.interviewer;
                          const intervieweeId = selectedPair?.interviewee?._id || selectedPair?.interviewee;
                          
                          if (String(userId) === String(interviewerId)) return 'Interviewer';
                          if (String(userId) === String(intervieweeId)) return 'Candidate';
                          return user.name || user.email || 'User';
                        };
                        
                        // Determine who actually caused the replacement by analyzing the chronological sequence
                        const getActualReplacer = (entry, index, allEntries) => {
                          if (!entry) return null;
                          
                          // For superseded entries, we need to figure out who ACTUALLY replaced it
                          if (entry.reason === 'superseded') {
                            // Sort entries by time to understand the sequence
                            const sortedByReplacedAt = [...allEntries].sort((a, b) => 
                              new Date(a.replacedAt || 0).getTime() - new Date(b.replacedAt || 0).getTime()
                            );
                            
                            const currentIndex = sortedByReplacedAt.findIndex(e => 
                              new Date(e.time).getTime() === new Date(entry.time).getTime() &&
                              new Date(e.replacedAt).getTime() === new Date(entry.replacedAt).getTime()
                            );
                            
                            // Find the next entry after this one (chronologically)
                            if (currentIndex >= 0 && currentIndex < sortedByReplacedAt.length - 1) {
                              const nextEntry = sortedByReplacedAt[currentIndex + 1];
                              // The person who proposed the next slot is the one who replaced this one
                              if (nextEntry && nextEntry.proposedBy) {
                                const currentProposerId = entry.proposedBy?._id || entry.proposedBy;
                                const nextProposerId = nextEntry.proposedBy._id || nextEntry.proposedBy;
                                
                                // If same person, they updated their own proposal
                                if (String(currentProposerId) === String(nextProposerId)) {
                                  return { user: entry.proposedBy, isSelf: true };
                                } else {
                                  // Different person replaced it
                                  return { user: nextEntry.proposedBy, isSelf: false };
                                }
                              }
                            }
                            
                            // Fallback to the replacedBy field
                            if (entry.proposedBy && entry.replacedBy) {
                              const proposerId = entry.proposedBy._id || entry.proposedBy;
                              const replacerId = entry.replacedBy._id || entry.replacedBy;
                              
                              if (String(proposerId) === String(replacerId)) {
                                return { user: entry.proposedBy, isSelf: true };
                              } else {
                                return { user: entry.replacedBy, isSelf: false };
                              }
                            }
                            
                            return { user: entry.replacedBy, isSelf: false };
                          }
                          
                          return { user: entry.replacedBy, isSelf: false };
                        };
                        
                        // Check if this is a default/auto-assigned slot
                        const isDefaultSlot = (entry) => {
                          // Check if the time matches the pair's defaultTimeSlot
                          if (selectedPair?.defaultTimeSlot) {
                            const entryTime = new Date(entry.time).getTime();
                            const defaultTime = new Date(selectedPair.defaultTimeSlot).getTime();
                            if (Math.abs(entryTime - defaultTime) < 60000) { // Within 1 minute
                              return true;
                            }
                          }
                          // If no proposedBy info, it might be a default slot
                          if (!entry.proposedBy || !entry.proposedBy._id) {
                            return true;
                          }
                          return false;
                        };
                        
                        return (
                          <ul className="space-y-3 max-h-96 overflow-auto">
                            {filteredEntries.map((e, idx) => {
                              const isDefault = isDefaultSlot(e);
                              const replacerInfo = getActualReplacer(e, idx, filteredEntries);
                              const actualReplacer = replacerInfo?.user;
                              const selfReplaced = replacerInfo?.isSelf;
                              
                              return (
                                <li key={`${e.time}-${idx}`} className={`text-xs px-3 py-3 rounded-lg border ${color(e.reason)}`}>
                                  <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="flex-1">
                                      <div className="font-semibold text-slate-900 dark:text-gray-100 mb-1">{fmt(e.time)}</div>
                                      
                                      {/* Show who proposed */}
                                      {isDefault ? (
                                        <div className="text-[10px] text-slate-600 dark:text-gray-400 mb-1">
                                          <span className="font-medium">Assigned by:</span>{' '}
                                          <span className="text-blue-700 dark:text-blue-400 font-semibold">System (Auto)</span>
                                        </div>
                                      ) : e.proposedBy && (
                                        <div className="text-[10px] text-slate-600 dark:text-gray-400 mb-1">
                                          <span className="font-medium">Proposed by:</span>{' '}
                                          <span className="text-indigo-700 dark:text-indigo-400 font-semibold">
                                            {getRoleLabel(e.proposedBy)}
                                          </span>
                                          {e.proposedBy.name && (
                                            <span className="text-slate-500 dark:text-gray-500"> ({e.proposedBy.name})</span>
                                          )}
                                        </div>
                                      )}
                                      
                                      {/* Show who/what caused the change */}
                                      {e.reason === 'rejected' && actualReplacer && (
                                        <div className="text-[10px] text-red-700 dark:text-red-400">
                                          <span className="font-medium">Declined by:</span>{' '}
                                          <span className="font-semibold">{getRoleLabel(actualReplacer)}</span>
                                          {actualReplacer.name && <span> ({actualReplacer.name})</span>}
                                        </div>
                                      )}
                                      
                                      {e.reason === 'superseded' && actualReplacer && (
                                        <div className="text-[10px] text-slate-600 dark:text-gray-400">
                                          {selfReplaced ? (
                                            <>
                                              <span className="font-medium">Updated by:</span>{' '}
                                              <span className="font-semibold">{getRoleLabel(actualReplacer)}</span>
                                              {actualReplacer.name && <span> ({actualReplacer.name})</span>}
                                              <span className="text-slate-500 dark:text-gray-500"> (own proposal)</span>
                                            </>
                                          ) : (
                                            <>
                                              <span className="font-medium">Replaced by:</span>{' '}
                                              <span className="font-semibold">{getRoleLabel(actualReplacer)}</span>
                                              {actualReplacer.name && <span> ({actualReplacer.name})</span>}
                                            </>
                                          )}
                                        </div>
                                      )}
                                      
                                      {e.reason === 'expired' && (
                                        <div className="text-[10px] text-amber-700 dark:text-amber-400">
                                          <span className="font-medium">Status:</span> Time slot expired automatically
                                        </div>
                                      )}
                                      
                                      {e.replacedAt && (
                                        <div className="text-[9px] text-slate-500 dark:text-gray-500 mt-1">
                                          {new Date(e.replacedAt).toLocaleString(undefined, {
                                            month: 'short',
                                            day: 'numeric',
                                            hour: '2-digit',
                                            minute: '2-digit'
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    <div className={`text-[9px] font-bold uppercase px-2 py-1 rounded whitespace-nowrap ${
                                      e.reason === 'expired' ? 'bg-amber-200 dark:bg-amber-900/40 text-amber-900 dark:text-amber-300' :
                                      e.reason === 'rejected' ? 'bg-red-200 dark:bg-red-900/40 text-red-900 dark:text-red-300' :
                                      'bg-slate-300 dark:bg-gray-700 text-slate-900 dark:text-gray-300'
                                    }`}>
                                      {toLabel(e.reason)}
                                    </div>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Default/System Time Display - When auto-assigned but not confirmed and no actual proposals made */}
            {!isLocked && !isScheduledTimeExpired && !showProposeForm && selectedPair?.defaultTimeSlot && (() => {
              // Check proposal counts - if anyone has made a proposal, don't show default time
              const myProposalCountValue = isInterviewer 
                ? selectedPair?.interviewerProposalCount || 0
                : selectedPair?.intervieweeProposalCount || 0;
              const partnerProposalCountValue = isInterviewer
                ? selectedPair?.intervieweeProposalCount || 0
                : selectedPair?.interviewerProposalCount || 0;
              const totalProposals = myProposalCountValue + partnerProposalCountValue;
              
              // Only show default time if no one has made any proposals yet
              if (totalProposals > 0) {
                return null;
              }
              
              const defaultSlotTime = new Date(selectedPair.defaultTimeSlot);
              const isDefaultExpired = defaultSlotTime < new Date();
              
              if (!isDefaultExpired) {
                return (
                  <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-lg p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-sky-600 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-sky-900 dark:text-sky-100 mb-1">Default Time Assigned</h4>
                        <p className="text-sm text-sky-700 dark:text-sky-300">A time slot has been automatically assigned. Please confirm or propose a different time.</p>
                      </div>
                    </div>
                    
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 mb-4 border border-sky-100 dark:border-sky-900">
                      <div className="text-2xl font-bold text-sky-900 dark:text-sky-100 mb-2">
                        {defaultSlotTime.toLocaleString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric', 
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {defaultSlotTime.toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ').slice(-1)[0]}
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => handleConfirm({ proposedStart: selectedPair.defaultTimeSlot, proposedEnd: new Date(defaultSlotTime.getTime() + 30 * 60000).toISOString() }, "default")}
                        disabled={isLoadingPairs}
                        className="flex-1 min-h-[44px] px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isLoadingPairs ? <span className="animate-spin">⏳</span> : <CheckCircle className="w-5 h-5" />}
                        {isLoadingPairs ? 'Confirming...' : 'Confirm This Time'}
                      </button>
                      <button
                        onClick={() => setShowProposeForm(true)}
                        disabled={isLoadingPairs}
                        className="flex-1 min-h-[44px] px-6 py-3 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 text-sky-600 dark:text-sky-400 border-2 border-sky-500 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <Clock className="w-4 h-4" />
                        Propose Different Time
                      </button>
                    </div>
                  </div>
                );
              }
              
              // If default time expired and no proposals yet, show expired message with action
              if (isDefaultExpired) {
                return (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-5">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center">
                        <AlertCircle className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">Default Time Expired</h4>
                        <p className="text-sm text-amber-700 dark:text-amber-300">The automatically assigned time has passed. Please propose a new time for your interview.</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setShowProposeForm(true)}
                      disabled={isLoadingPairs}
                      className="w-full min-h-[44px] px-6 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <Clock className="w-5 h-5" />
                      Propose Interview Time
                    </button>
                  </div>
                );
              }
              
              return null;
            })()}

            {/* Action Buttons based on proposal state */}
            {!isLocked && !isScheduledTimeExpired && !showProposeForm && (() => {
              // Don't show this section if default time is being displayed
              const myProposalCountValue = isInterviewer 
                ? selectedPair?.interviewerProposalCount || 0
                : selectedPair?.intervieweeProposalCount || 0;
              const partnerProposalCountValue = isInterviewer
                ? selectedPair?.intervieweeProposalCount || 0
                : selectedPair?.interviewerProposalCount || 0;
              const totalProposals = myProposalCountValue + partnerProposalCountValue;
              
              // If no proposals made yet and default time exists (expired or not), don't show these buttons (default time section has its own buttons)
              if (totalProposals === 0 && selectedPair?.defaultTimeSlot) {
                return null;
              }
              
              const mySlots = currentProposals?.mine || [];
              const partnerSlots = currentProposals?.partner || [];
              
              // Check if 6 combined proposals reached - should auto-schedule
              if (bothReachedLimit) {
                return (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center">
                        <CheckCircle className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">Interview Scheduled</h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">Maximum proposals (6 combined) reached. Interview has been automatically scheduled.</p>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // Re-use the variables already defined above
              if (mySlots.length > 0 || partnerSlots.length > 0) {
                const myTimestamp = currentProposals.mineUpdatedAt ? new Date(currentProposals.mineUpdatedAt).getTime() : 0;
                const partnerTimestamp = currentProposals.partnerUpdatedAt ? new Date(currentProposals.partnerUpdatedAt).getTime() : 0;
                const showingMyProposal = mySlots.length > 0 && partnerSlots.length > 0 
                  ? myTimestamp >= partnerTimestamp 
                  : mySlots.length > 0;
                const displaySlot = showingMyProposal ? mySlots[0] : partnerSlots[0];
                const proposedByMe = showingMyProposal;
                
                // Check if user can still propose (hasn't used all 3 personal attempts)
                const canStillPropose = myProposalCount < 3 && !bothReachedLimit;
                
                return (
                  <div className="space-y-3">
                    {proposedByMe ? (
                      /* My proposal pending their response */
                      <button
                        onClick={() => setShowProposeForm(true)}
                        disabled={!canStillPropose}
                        className="w-full min-h-[44px] px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title={!canStillPropose ? 'You have used all your proposals' : ''}
                      >
                        <Clock className="w-4 h-4" />
                        {canStillPropose ? 'Change Proposal' : 'Proposal Limit Reached'}
                      </button>
                    ) : (
                      /* Their proposal - I can confirm or suggest new */
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => handleConfirm(displaySlot, "")}
                          disabled={isLoadingPairs}
                          className="flex-1 min-h-[44px] px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {isLoadingPairs ? <span className="animate-spin">⏳</span> : <CheckCircle className="w-5 h-5" />}
                          {isLoadingPairs ? 'Confirming...' : 'Confirm Time'}
                        </button>
                        <button
                          onClick={() => setShowProposeForm(true)}
                          disabled={isLoadingPairs || !canStillPropose}
                          className="flex-1 min-h-[44px] px-6 py-3 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 text-sky-600 dark:text-sky-400 border-2 border-sky-500 rounded-lg font-semibold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                          title={!canStillPropose ? 'You have used all your proposals' : ''}
                        >
                          <Clock className="w-4 h-4" />
                          {canStillPropose ? 'Request New Time' : 'Limit Reached'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              } else {
                /* No proposals yet */
                const canPropose = myProposalCount < 3 && !bothReachedLimit;
                return (
                  <button
                    onClick={() => setShowProposeForm(true)}
                    disabled={!canPropose}
                    className="w-full min-h-[44px] px-6 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={!canPropose ? 'Proposal limit reached' : ''}
                  >
                    <Clock className="w-4 h-4" />
                    {canPropose ? 'Suggest Interview Time' : 'Proposal Limit Reached'}
                  </button>
                );
              }
            })()}

            {/* Inline Propose Form */}
            {showProposeForm && !isLocked && (
              <div
                className="border-t border-slate-200 dark:border-gray-700 pt-5 mt-2"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h4 className="text-base font-semibold text-slate-900 dark:text-gray-100 mb-1">
                      {isInterviewer ? 'Suggest Interview Time' : 'Request Alternative Time'}
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-gray-400">
                      {isInterviewer 
                        ? 'Choose a time that works best for you.'
                        : 'Suggest a different time that works better.'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowProposeForm(false);
                      setSlots([""]);
                    }}
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-600 dark:text-gray-300 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-2">
                      Select Date & Time
                    </label>
                    <DateTimePicker
                      value={slots[0] || ""}
                      onChange={(isoDateTime) => {
                        const v = isoDateTime;
                        
                        if (v) {
                          const selectedTime = new Date(v).getTime();
                          const currentTime = Date.now();
                          if (selectedTime <= currentTime) {
                            setMessage("⚠ Cannot select past time. Please choose a future time.");
                            return;
                          }
                        }
                        
                        const ev = selectedPair?.event || {};
                        const toLocal = (val) => {
                          if (!val) return "";
                          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(val)) return val;
                          const d = new Date(val);
                          if (isNaN(d.getTime())) return "";
                          const pad = (n) => String(n).padStart(2, "0");
                          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        };
                        const startLocal = ev.startDate ? toLocal(ev.startDate) : null;
                        const endLocal = ev.endDate ? toLocal(ev.endDate) : null;
                        if (startLocal && v < startLocal) {
                          setMessage("⚠ Selected time was before the event start. It has been adjusted.");
                          setSlots([startLocal]);
                          return;
                        }
                        if (endLocal && v > endLocal) {
                          setMessage("⚠ Selected time was after the event end. It has been adjusted.");
                          setSlots([endLocal]);
                          return;
                        }
                        setSlots([v]);
                      }}
                      min={getCurrentMinDateTime()}
                      max={selectedPair?.event?.endDate}
                      placeholder="Choose a time slot..."
                      className="w-full text-sm"
                      disabled={isLocked || isLoadingPairs}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowProposeForm(false);
                        setSlots([""]);
                      }}
                      disabled={isLoadingPairs}
                      className="flex-1 min-h-[44px] px-5 py-3 bg-white dark:bg-gray-700 hover:bg-slate-50 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-200 rounded-lg font-medium text-sm border border-slate-300 dark:border-gray-600 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        await handlePropose();
                        if (!message || !message.toLowerCase().includes('error')) {
                          setShowProposeForm(false);
                        }
                      }}
                      disabled={isLoadingPairs || !slots[0]}
                      className="flex-1 min-h-[44px] px-5 py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      {isLoadingPairs ? (
                        <>
                          <span className="animate-spin">⏳</span>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-4 h-4" />
                          <span>Send Proposal</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                    <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed flex items-start gap-2">
                      <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      <span>Both parties can propose up to 3 times each. If no agreement is reached, the most recent proposal will be automatically confirmed.</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meeting Link Section - Outside the card */}
      {isLocked && selectedPair.meetingLink && (
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
            <span className="font-semibold text-indigo-900 dark:text-indigo-300 text-sm">
              Meeting Details
            </span>
            <span className="text-xs text-slate-600 dark:text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-slate-200 dark:border-gray-700 w-fit">
              Jitsi Meet
            </span>
          </div>
          
          {isCompleted ? (
            <div className="bg-blue-100 dark:bg-blue-900/30 border border-blue-300 dark:border-blue-700 rounded-lg p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-blue-800 dark:text-blue-300 mb-2">
                <CheckCircle className="w-5 h-5 dark:text-blue-400" />
                <span className="font-semibold">Session Completed</span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-400">
                This interview session has been finished. Feedback has been submitted.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  readOnly
                  value={
                    meetingLinkEnabled
                      ? selectedPair.meetingLink
                      : `Meeting link will be available ${fmt(
                          new Date(selectedPair.scheduledAt).getTime() -
                            30 * 60 * 1000
                        )}`
                  }
                  className={`w-full border rounded-lg px-3 py-2 text-sm font-medium break-all ${
                    meetingLinkEnabled
                      ? "bg-white border-indigo-300 text-slate-900"
                      : "bg-slate-100 border-slate-300 text-slate-500"
                  }`}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => {
                      if (!meetingLinkEnabled) return;
                      window.open(selectedPair.meetingLink, "_blank");
                      startFeedbackCountdown(selectedPair);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                      meetingLinkEnabled
                        ? "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white"
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
                      setMessage("Meeting link copied to clipboard!");
                      startFeedbackCountdown(selectedPair);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                      meetingLinkEnabled
                        ? "bg-white border border-indigo-300 hover:bg-indigo-50 active:bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 border border-slate-300 text-slate-400 cursor-not-allowed"
                    }`}
                    disabled={!meetingLinkEnabled}
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {message && (
        <div
          className={`flex items-start gap-2 text-sm p-3 rounded-lg ${getMessageStyle(message).bg} ${getMessageStyle(message).text} border ${getMessageStyle(message).border}`}
        >
          {(() => {
            const Icon = getMessageStyle(message).icon;
            return <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${getMessageStyle(message).iconColor}`} />;
          })()}
          <span className="flex-1">{message}</span>
        </div>
      )}
    </div>
  );

  const EventDetails = () => (
    <div className="flex-1 flex flex-col">
      {/* If a pair is selected, show pairing details instead of event details */}
      {selectedPairRole && selectedPair ? (
        <PairingDetails />
      ) : (
        <>
          {/* Mobile Header */}
          <div className="lg:hidden flex items-center gap-2 mb-3 sm:mb-4 p-2.5 sm:p-3 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 sticky top-0 z-10">
            <button
              onClick={() => {
                setSelectedEvent(null);
                setSelectedPairRole(null);
                setSelectedPair(null);
              }}
              className="p-1.5 rounded bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 active:bg-slate-300 dark:active:bg-gray-500 transition-colors"
            >
              <ChevronLeft size={18} className="text-slate-700 dark:text-gray-300" />
            </button>
            <h2 className="text-base sm:text-lg font-semibold text-slate-800 dark:text-gray-100 truncate">{selectedEvent.name}</h2>
          </div>

      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {selectedEvent.isSpecial && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded text-xs font-medium">
                <Award size={12} />
                <span>Special Interview</span>
              </div>
            )}
            {selectedEvent.joined && (
              <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                selectedEvent.isSpecial
                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                  : new Date(selectedEvent.startDate) > new Date()
                  ? "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
              }`}>
                <CheckCircle size={12} />
                <span>Joined</span>
              </div>
            )}
            {!selectedEvent.isSpecial && (
              <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 rounded text-xs font-medium">
                {new Date(selectedEvent.startDate) > new Date() ? 'Upcoming' : 
                 new Date(selectedEvent.endDate) < new Date() ? 'Past' : 'Active'}
              </span>
            )}
          </div>
          
          <h2 className="hidden lg:block text-lg sm:text-xl font-semibold text-slate-800 dark:text-gray-100 mb-2 sm:mb-3">
            {selectedEvent.name}
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2 sm:mb-3">
            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-gray-700 rounded">
              <Clock className="w-4 h-4 text-sky-500 dark:text-sky-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500 dark:text-gray-400">Start Time</div>
                <div className="font-medium text-slate-800 dark:text-gray-100 text-sm truncate">{fmt(selectedEvent.startDate)}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-gray-700 rounded">
              <Clock className="w-4 h-4 text-indigo-500 dark:text-indigo-400 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-slate-500 dark:text-gray-400">End Time</div>
                <div className="font-medium text-slate-800 dark:text-gray-100 text-sm truncate">{fmt(selectedEvent.endDate)}</div>
              </div>
            </div>
          </div>
          
          <p className="text-slate-700 dark:text-gray-300 text-sm bg-slate-50 dark:bg-gray-700 p-3 rounded">
            {selectedEvent.description}
          </p>
        </div>
        
        <div className="flex flex-col sm:items-end gap-2 w-full sm:w-auto">
          {!selectedEvent.joined && (() => {
            const now = new Date();
            const joinDisabled = selectedEvent.joinDisabled || (selectedEvent.joinDisableTime && now > new Date(selectedEvent.joinDisableTime));
            return (
              <button
                onClick={handleJoinEvent}
                disabled={joinDisabled}
                className={`w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-lg font-medium text-white text-sm transition-colors ${
                  joinDisabled ? "bg-slate-400 dark:bg-gray-600 cursor-not-allowed" : "bg-sky-500 hover:bg-sky-600 active:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-700 dark:active:bg-sky-800"
                }`}
              >
                {joinDisabled ? "Participation Closed" : "Join Interview"}
              </button>
            );
          })()}
        </div>
      </div>

      {/* Template Section */}
      {selectedEvent && (
        <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 border border-sky-200 dark:border-sky-700 mb-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 bg-sky-500 dark:bg-sky-600 rounded">
              <Info className="w-3 h-3 text-white" />
            </div>
            <h3 className="font-medium text-slate-800 dark:text-gray-100 text-sm">Interview Preparation</h3>
          </div>
          <p className="text-slate-700 dark:text-gray-300 text-xs mb-2">
            Review the template to prepare for this session.
          </p>
          <div className="flex justify-end">
            <button
              onClick={(e) => { if (selectedEvent.templateUrl) window.open(selectedEvent.templateUrl, '_blank'); }}
              disabled={!selectedEvent.templateUrl}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                !selectedEvent.templateUrl 
                  ? 'bg-slate-100 dark:bg-gray-700 text-slate-400 dark:text-gray-500 cursor-not-allowed' 
                  : 'bg-white dark:bg-gray-800 border border-sky-300 dark:border-sky-600 text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-gray-700'
              }`}
            >
              <BookOpen size={12} />
              <span>View Template</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Pairing Section - Show Interviewer/Interviewee tabs on mobile only */}
      {selectedEvent && selectedEvent.joined && (
        (() => {
          // Get pairing info for this event
          const eventPairs = pairs.filter(p => p.event._id === selectedEvent._id);
          const interviewerPair = eventPairs.find(p => getUserRoleInPair(p) === "interviewer");
          const intervieweePair = eventPairs.find(p => getUserRoleInPair(p) === "interviewee");
          
          // Only show if there are pairs
          if (!interviewerPair && !intervieweePair) return null;
          
          return (
            <div className="lg:hidden bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-700 mb-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 bg-indigo-500 dark:bg-indigo-600 rounded">
                  <Users className="w-3 h-3 text-white" />
                </div>
                <h3 className="font-medium text-slate-800 dark:text-gray-100 text-sm">Your Pairing Details</h3>
              </div>
              <p className="text-slate-700 dark:text-gray-300 text-xs mb-3">
                View your role as Interviewer or Candidate and manage scheduling.
              </p>
              
              {/* Interviewer/Interviewee Tabs for Mobile */}
              <div className="space-y-2">
                {interviewerPair && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedPairRole !== "interviewer" || selectedPair?._id !== interviewerPair._id) {
                        setSelectedPairRole("interviewer");
                        setSelectedPair(interviewerPair);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border-2 touch-manipulation ${
                      selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                        ? "bg-indigo-600 dark:bg-indigo-700 border-indigo-600 dark:border-indigo-600 text-white shadow-lg"
                        : "bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 active:bg-indigo-100 dark:active:bg-indigo-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User className={`w-4 h-4 ${selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id ? 'text-white' : 'text-indigo-600'}`} />
                      <div className="flex-1">
                        <div className="font-semibold">Interviewer Name</div>
                        <div className="text-xs mt-1 opacity-90">
                          {interviewerPair.interviewer?.name || interviewerPair.interviewer?.email || "N/A"} ➜ {interviewerPair.interviewee?.name || interviewerPair.interviewee?.email || "N/A"}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            interviewerPair.status === "scheduled"
                              ? selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                                ? "bg-white/20 dark:bg-white/30 text-white"
                                : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                              : interviewerPair.status === "rejected"
                              ? selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                                ? "bg-white/20 dark:bg-white/30 text-white"
                                : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                              : selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                                ? "bg-white/20 dark:bg-white/30 text-white"
                                : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                          }`}>
                            {interviewerPair.status === "scheduled" ? "Scheduled" : interviewerPair.status === "rejected" ? "Rejected" : "Pending"}
                          </span>
                        </div>
                      </div>
                      <ChevronLeft className={`w-5 h-5 rotate-180 ${selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                  </button>
                )}
                
                {intervieweePair && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedPairRole !== "interviewee" || selectedPair?._id !== intervieweePair._id) {
                        setSelectedPairRole("interviewee");
                        setSelectedPair(intervieweePair);
                      }
                    }}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border-2 touch-manipulation ${
                      selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                        ? "bg-indigo-600 dark:bg-indigo-700 border-indigo-600 dark:border-indigo-600 text-white shadow-lg"
                        : "bg-white dark:bg-gray-800 border-indigo-200 dark:border-indigo-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 active:bg-indigo-100 dark:active:bg-indigo-900/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <User className={`w-4 h-4 ${selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id ? 'text-white' : 'text-indigo-600 dark:text-indigo-400'}`} />
                      <div className="flex-1">
                        <div className="font-semibold">Candidate Name</div>
                        <div className="text-xs mt-1 opacity-90">
                          {intervieweePair.interviewer?.name || intervieweePair.interviewer?.email || "N/A"} ➜ {intervieweePair.interviewee?.name || intervieweePair.interviewee?.email || "N/A"}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            intervieweePair.status === "scheduled"
                              ? selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                                ? "bg-white/20 dark:bg-white/30 text-white"
                                : "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                              : intervieweePair.status === "rejected"
                              ? selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                                ? "bg-white/20 dark:bg-white/30 text-white"
                                : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                              : selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                                ? "bg-white/20 dark:bg-white/30 text-white"
                                : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300"
                          }`}>
                            {intervieweePair.status === "scheduled" ? "Scheduled" : intervieweePair.status === "rejected" ? "Rejected" : "Pending"}
                          </span>
                        </div>
                      </div>
                      <ChevronLeft className={`w-5 h-5 rotate-180 ${selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id ? 'text-white' : 'text-slate-400'}`} />
                    </div>
                  </button>
                )}
              </div>
              
              <p className="text-xs text-slate-600 dark:text-gray-300 mt-3 p-2 bg-white dark:bg-gray-800 rounded border border-indigo-100 dark:border-indigo-700">
                <Info className="w-3 h-3 inline mr-1" />
                Tap a role to view scheduling details and propose time slots.
              </p>
            </div>
          );
        })()
      )}

      {/* Join Message */}
      <AnimatePresence>
        {joinMsg && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className={`p-3 rounded-lg text-sm font-medium ${getMessageStyle(joinMsg).bg} ${getMessageStyle(joinMsg).text} border ${getMessageStyle(joinMsg).border}`}
          >
            <div className="flex items-center justify-center gap-2">
              {(() => {
                const Icon = getMessageStyle(joinMsg).icon;
                return <Icon className={`w-4 h-4 ${getMessageStyle(joinMsg).iconColor}`} />;
              })()}
              <span>{joinMsg}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Join restriction modal */}
      <AnimatePresence>
        {showJoinRestriction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-[90%] max-w-sm rounded-xl shadow-xl border border-slate-200 p-4"
            >
              <div className="flex items-start gap-2">
                <div className="p-2 rounded bg-amber-100 text-amber-700">
                  <Info className="w-4 h-4" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-slate-800 mb-1">Action not allowed</h3>
                  <p className="text-sm text-slate-600">
                    You cannot join this interview because it was created before your registration.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setShowJoinRestriction(false)}
                  className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
        </>
      )}
    </div>
  );

  const Placeholder = () => {
    const [currentTipIndex, setCurrentTipIndex] = useState(0);
    
    const interviewTips = [
      "Practice interviews help you answer questions confidently and clearly.",
      "Regular practice builds muscle memory for technical problem-solving under pressure.",
      "Get comfortable with the interview format before the real opportunity comes.",
      "Receive constructive feedback to identify and improve your weak areas.",
      "Build confidence by experiencing interview scenarios in a safe environment.",
      "Learn to manage interview anxiety through repeated exposure and practice.",
      "Develop better communication skills by explaining your thought process clearly.",
      "Practice makes perfect - each practice interview brings you closer to success.",
      "Understand common interview patterns and how to approach different question types.",
      "Improve your ability to think aloud and collaborate with interviewers.",
      "Master the art of asking clarifying questions and handling ambiguity.",
      "Transform interview stress into excitement through consistent preparation."
    ];

    useEffect(() => {
      const interval = setInterval(() => {
        setCurrentTipIndex((prev) => (prev + 1) % interviewTips.length);
      }, 5000);
      return () => clearInterval(interval);
    }, [interviewTips.length]);

    const quickLinks = [
      {
        title: "Learning Modules",
        description: "Watch video lectures and track your progress across subjects",
        icon: GraduationCap,
        color: "from-sky-500 to-cyan-500",
        bgLight: "bg-sky-50 dark:bg-sky-900/20",
        textColor: "text-sky-700 dark:text-sky-300",
        path: "/student/learning"
      },
      {
        title: "Session Feedback",
        description: "View and submit feedback for your interview sessions",
        icon: MessageSquare,
        color: "from-emerald-500 to-teal-500",
        bgLight: "bg-emerald-50 dark:bg-emerald-900/20",
        textColor: "text-emerald-700 dark:text-emerald-300",
        path: "/student/session"
      },
      {
        title: "Track Progress",
        description: "Monitor your growth with detailed performance analytics",
        icon: TrendingUp,
        color: "from-purple-500 to-violet-500",
        bgLight: "bg-purple-50 dark:bg-purple-900/20",
        textColor: "text-purple-700 dark:text-purple-300",
        path: "/student/learning"
      }
    ];

    return (
      <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 overflow-y-auto">
        {/* Welcome Header */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-gray-100 mb-1.5">
            Welcome back, {user?.name || me?.name || "Student"}! 👋
          </h1>
          <p className="text-slate-500 dark:text-gray-400 text-sm sm:text-base">
            Select an interview from the sidebar to get started, or explore learning modules below.
          </p>
        </div>

        {/* Stats Row */}
        <div className="mb-6">
          <StatsComponent />
        </div>

        {/* Quick Access Cards */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-3">
            Quick Access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quickLinks.map((link, idx) => (
              <button
                key={idx}
                onClick={() => navigate(link.path)}
                className="group text-left p-4 rounded-xl border border-slate-200 dark:border-gray-700 hover:border-slate-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800 hover:shadow-md transition-all"
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${link.color} flex items-center justify-center mb-3 group-hover:scale-105 transition-transform`}>
                  <link.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="font-semibold text-sm text-slate-800 dark:text-gray-100 mb-1 flex items-center gap-1.5">
                  {link.title}
                  <ArrowRight className="w-3.5 h-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-slate-400" />
                </h3>
                <p className="text-xs text-slate-500 dark:text-gray-400 leading-relaxed">{link.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Two Column: Tips + Interview Prep */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Rotating Tips */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-3">
              Interview Tips
            </h2>
            <div className="min-h-[120px] flex items-stretch">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentTipIndex}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="w-full"
                >
                  <div className="h-full bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border border-indigo-100 dark:border-indigo-800/30 p-5 rounded-xl">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-sm">
                        <Zap className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="text-slate-700 dark:text-gray-200 text-sm leading-relaxed">
                          {interviewTips[currentTipIndex]}
                        </p>
                        <div className="flex items-center gap-1 mt-3">
                          {interviewTips.map((_, i) => (
                            <div
                              key={i}
                              className={`h-1 rounded-full transition-all duration-300 ${
                                i === currentTipIndex ? 'w-4 bg-indigo-500' : 'w-1.5 bg-indigo-200 dark:bg-indigo-700'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* How It Works */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 mb-3">
              How It Works
            </h2>
            <div className="h-full bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
              {[
                { step: "1", label: "Join an interview event", icon: Calendar, color: "text-sky-600 bg-sky-100 dark:bg-sky-900/30" },
                { step: "2", label: "Get paired with a partner", icon: Users, color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30" },
                { step: "3", label: "Schedule & conduct session", icon: Video, color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30" },
                { step: "4", label: "Submit & receive feedback", icon: Target, color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30" },
              ].map((item) => (
                <div key={item.step} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.color}`}>
                    <item.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <span className="text-sm text-slate-700 dark:text-gray-200">{item.label}</span>
                  </div>
                  <span className="text-xs font-bold text-slate-300 dark:text-gray-600">
                    {item.step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-500 rounded-xl p-5 text-white flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-base mb-0.5">Ready to practice?</h3>
            <p className="text-sky-100 text-sm">Pick an interview from the sidebar to begin your session.</p>
          </div>
          <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center flex-shrink-0">
            <Zap className="w-6 h-6 text-white" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <RequirePasswordChange user={user}>
      <div className="min-h-screen w-full bg-slate-50 dark:bg-gray-900 flex flex-col pt-16">
        <div className="flex-1 w-full flex">
          {/* ── Collapsible Sidebar ──────────────────────────────────────
              Collapsed: 60px (icons only)
              Expanded:  320px (on hover or when pinned)
          ─────────────────────────────────────────────────────────── */}
          <div
            className={`hidden lg:flex flex-col flex-shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 h-[calc(100vh-4rem)] sticky top-16 transition-all duration-300 ease-in-out overflow-hidden ${
              sidebarExpanded ? 'w-[320px]' : 'w-[60px]'
            }`}
            onMouseEnter={() => setSidebarHovered(true)}
            onMouseLeave={() => setSidebarHovered(false)}
          >
            {/* Sidebar Header */}
            <div className={`flex items-center p-3 border-b border-slate-100 dark:border-gray-700 ${sidebarExpanded ? 'justify-between' : 'justify-center'}`}>
              {sidebarExpanded ? (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="text-base font-semibold text-slate-800 dark:text-gray-100 truncate">Interviews</h2>
                    <span className="px-2 py-0.5 bg-sky-500 text-white rounded-full text-xs font-medium flex-shrink-0">
                      {filteredEvents.length}
                    </span>
                  </div>
                  <button
                    onClick={() => setSidebarPinned(!sidebarPinned)}
                    className={`p-1.5 rounded-lg transition-all flex-shrink-0 ${
                      sidebarPinned
                        ? 'bg-sky-100 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400'
                        : 'hover:bg-slate-100 dark:hover:bg-gray-700 text-slate-400 dark:text-gray-500'
                    }`}
                    title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                  >
                    {sidebarPinned ? <Pin className="w-4 h-4" /> : <PinOff className="w-4 h-4" />}
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <div className="p-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/20">
                    <Calendar className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400">{filteredEvents.length}</span>
                </div>
              )}
            </div>

            {/* Collapsed: icon buttons for tabs */}
            {!sidebarExpanded && (
              <div className="flex flex-col items-center gap-1 p-2 border-b border-slate-100 dark:border-gray-700">
                {[
                  { id: 'regular', icon: BookOpen, label: 'Regular', color: 'sky' },
                  { id: 'special', icon: Award, label: 'Special', color: 'purple' },
                  { id: 'past', icon: Clock, label: 'Past', color: 'slate' },
                ].map((tab) => {
                  const isActive = selectedKey.startsWith(tab.id);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedKey(`${tab.id}-all`)}
                      className={`p-2 rounded-lg transition-all w-full flex items-center justify-center ${
                        isActive
                          ? `bg-${tab.color}-100 dark:bg-${tab.color}-900/30 text-${tab.color}-600 dark:text-${tab.color}-400`
                          : 'text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-gray-700'
                      }`}
                      title={tab.label}
                    >
                      <tab.icon className="w-4 h-4" />
                    </button>
                  );
                })}
                <button
                  className="p-2 rounded-lg transition-all w-full flex items-center justify-center text-slate-400 dark:text-gray-500 hover:bg-slate-50 dark:hover:bg-gray-700"
                  title="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Expanded: full EventList content */}
            {sidebarExpanded && (
              <div className="flex-1 flex flex-col overflow-hidden p-3 pt-2">
                {/* Filters */}
                {!selectedEvent && (
                  <div className="space-y-2 mb-3">
                    <div className="flex gap-1.5">
                      {[
                        { id: "regular", label: "Regular", color: "sky" },
                        { id: "special", label: "Special", color: "purple" },
                        { id: "past", label: "Past", color: "slate" }
                      ].map((tab) => {
                        const isActive = selectedKey.startsWith(tab.id);
                        return (
                          <button
                            key={tab.id}
                            onClick={() => {
                              if (tab.id === "past") {
                                setSelectedKey("past-all");
                              } else {
                                const currentStatus = selectedKey.split("-")[1] || "all";
                                setSelectedKey(`${tab.id}-${currentStatus}`);
                              }
                            }}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                              isActive
                                ? tab.id === "regular"
                                  ? "bg-gradient-to-br from-sky-500 to-sky-600 text-white shadow-md"
                                  : tab.id === "special"
                                  ? "bg-gradient-to-br from-purple-500 to-purple-600 text-white shadow-md"
                                  : "bg-gradient-to-br from-slate-500 to-slate-600 text-white shadow-md"
                                : "bg-white dark:bg-gray-700 text-slate-600 dark:text-gray-300 border border-slate-200 dark:border-gray-600 hover:border-slate-300 dark:hover:border-gray-500 hover:shadow-sm"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Status Filter */}
                    {currentType !== "past" && (
                      <div className="flex gap-1.5">
                        {[
                          { id: "all", label: "All" },
                          { id: "active", label: "Active" },
                          { id: "upcoming", label: "Upcoming" }
                        ].map((filter) => {
                          const isActive = currentStatus === filter.id;
                          return (
                            <button
                              key={filter.id}
                              onClick={() => {
                                const type = selectedKey.startsWith("special") ? "special" : "regular";
                                setSelectedKey(`${type}-${filter.id}`);
                              }}
                              className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                                isActive
                                  ? "bg-slate-800 dark:bg-gray-600 text-white shadow-sm"
                                  : "bg-slate-50 dark:bg-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-600"
                              }`}
                            >
                              {filter.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Search */}
                {!selectedEvent && (
                  <div className="relative mb-3">
                    <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 text-slate-500 dark:text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search interviews..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-7 pr-3 py-1.5 bg-slate-50 dark:bg-gray-700 rounded border border-slate-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-sky-500 text-sm text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500"
                    />
                  </div>
                )}

                {/* Selected event close */}
                {selectedEvent && (
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-slate-800 dark:text-gray-100">Selected</h2>
                    <button
                      onClick={handleCloseEvent}
                      className="p-1.5 rounded-lg bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600 text-slate-700 dark:text-gray-200 transition-colors"
                      title="Close"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Event List */}
                <div className="space-y-2 flex-1 overflow-y-auto pr-1 scrollbar-thin">
                  {selectedEvent ? (
                    (() => {
                      const event = selectedEvent;
                      const active = true;
                      const isUpcoming = new Date(event.startDate) > now;
                      const isActive = !isUpcoming && (!event.endDate || new Date(event.endDate) > now);
                      const isPast = event.endDate && new Date(event.endDate) < now;
                      const isSpecial = event.isSpecial;
                      const eventPairs = pairs.filter(p => p.event._id === event._id);
                      const interviewerPair = eventPairs.find(p => getUserRoleInPair(p) === "interviewer");
                      const intervieweePair = eventPairs.find(p => getUserRoleInPair(p) === "interviewee");

                      return (
                        <div key={event._id} className="space-y-1">
                          <button
                            onClick={() => handleEventClick(event)}
                            className={`w-full text-left p-3 rounded-lg transition-colors border ${
                              isSpecial
                                ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20"
                                : "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20"
                            } ${event.joined ? isSpecial ? "ring-1 ring-purple-200 dark:ring-purple-700" : "ring-1 ring-emerald-200 dark:ring-emerald-700" : ""}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`p-1.5 rounded ${event.joined ? isSpecial ? "bg-purple-100 text-purple-600" : isActive ? "bg-emerald-100 text-emerald-600" : isPast ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600"}`}>
                                {event.joined ? <CheckCircle size={14} /> : <Calendar size={14} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h3 className="font-medium text-slate-800 dark:text-gray-100 truncate text-sm">{event.name}</h3>
                                <div className="flex items-center gap-2 mt-1 text-xs text-slate-600 dark:text-gray-400">
                                  <Clock size={12} />
                                  <span>{fmt(event.startDate)}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                          {/* Pairing tabs */}
                          {event.joined && (interviewerPair || intervieweePair) && (
                            <div className="relative pl-4">
                              <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-300 dark:bg-gray-600"></div>
                              <div className="space-y-1">
                                {interviewerPair && (
                                  <div className="relative">
                                    <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300 dark:bg-gray-600"></div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedPairRole("interviewer"); setSelectedPair(interviewerPair); setMessage(""); }}
                                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ml-3 ${
                                        selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                                          ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-300"
                                          : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-300"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <User className="w-3 h-3 flex-shrink-0" />
                                        <span className="font-medium">Interviewer</span>
                                      </div>
                                    </button>
                                  </div>
                                )}
                                {intervieweePair && (
                                  <div className="relative">
                                    <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300 dark:bg-gray-600"></div>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setSelectedPairRole("interviewee"); setSelectedPair(intervieweePair); setMessage(""); }}
                                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ml-3 ${
                                        selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                                          ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-300"
                                          : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-300"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <User className="w-3 h-3 flex-shrink-0" />
                                        <span className="font-medium">Candidate</span>
                                      </div>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()
                  ) : filteredEvents.length === 0 ? (
                    <div className="text-center text-slate-500 dark:text-gray-300 py-6">
                      <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No interviews found</p>
                    </div>
                  ) : (
                    filteredEvents.map((event) => {
                      const active = selectedEvent && selectedEvent._id === event._id;
                      const isUpcoming = new Date(event.startDate) > now;
                      const isActive = !isUpcoming && (!event.endDate || new Date(event.endDate) > now);
                      const isPast = event.endDate && new Date(event.endDate) < now;
                      const isSpecial = event.isSpecial;
                      const eventPairs = pairs.filter(p => p.event._id === event._id);
                      const interviewerPair = eventPairs.find(p => getUserRoleInPair(p) === "interviewer");
                      const intervieweePair = eventPairs.find(p => getUserRoleInPair(p) === "interviewee");

                      return (
                        <div key={event._id} className="space-y-1">
                          <button
                            onClick={() => handleEventClick(event)}
                            className={`w-full text-left p-3 rounded-lg transition-colors border ${
                              active
                                ? isSpecial ? "border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-900/20" : "border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20"
                                : "border-slate-200 dark:border-gray-700 bg-slate-50/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-700 hover:border-slate-300 dark:hover:border-gray-600"
                            } ${event.joined ? isSpecial ? "ring-1 ring-purple-200 dark:ring-purple-700" : "ring-1 ring-emerald-200 dark:ring-emerald-700" : ""}`}
                          >
                            <div className="flex items-start gap-2">
                              <div className={`p-1.5 rounded ${event.joined ? isSpecial ? "bg-purple-100 text-purple-600" : isActive ? "bg-emerald-100 text-emerald-600" : isPast ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-600" : "bg-sky-100 text-sky-600"}`}>
                                {event.joined ? <CheckCircle size={14} /> : <Calendar size={14} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <h3 className="font-medium text-slate-800 dark:text-gray-100 truncate text-sm">{event.name}</h3>
                                  <span className={`px-1.5 py-0.5 text-xs rounded font-medium flex-shrink-0 ${
                                    isActive ? "bg-emerald-100 text-emerald-700" : isPast ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"
                                  }`}>
                                    {isActive ? "Active" : isPast ? "Past" : "Upcoming"}
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-600 dark:text-gray-400">
                                  <div className="flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>{fmt(event.startDate)}</span>
                                  </div>
                                  {event.joined && (
                                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                                      <UserCheck size={12} />
                                      Joined
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                          {/* Pair sub-items */}
                          {active && event.joined && (interviewerPair || intervieweePair) && (
                            <div className="relative pl-4">
                              <div className="absolute left-3 top-0 bottom-0 w-px bg-slate-300 dark:bg-gray-600"></div>
                              <div className="space-y-1">
                                {interviewerPair && (
                                  <div className="relative">
                                    <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300 dark:bg-gray-600"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectedPairRole !== "interviewer" || selectedPair?._id !== interviewerPair._id) {
                                          setSelectedPairRole("interviewer"); setSelectedPair(interviewerPair); setMessage("");
                                        }
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ml-3 ${
                                        selectedPairRole === "interviewer" && selectedPair?._id === interviewerPair._id
                                          ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-300"
                                          : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-300"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <User className="w-3 h-3 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium">Interviewer</div>
                                          <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                              interviewerPair.status === "completed" ? "bg-blue-100 text-blue-700" : interviewerPair.status === "scheduled" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                            }`}>
                                              {interviewerPair.status === "completed" ? "Finished" : interviewerPair.status === "scheduled" ? "Scheduled" : "Pending"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  </div>
                                )}
                                {intervieweePair && (
                                  <div className="relative">
                                    <div className="absolute left-0 top-1/2 w-3 h-px bg-slate-300 dark:bg-gray-600"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (selectedPairRole !== "interviewee" || selectedPair?._id !== intervieweePair._id) {
                                          setSelectedPairRole("interviewee"); setSelectedPair(intervieweePair); setMessage("");
                                        }
                                      }}
                                      className={`w-full text-left px-3 py-2 rounded text-xs transition-colors border ml-3 ${
                                        selectedPairRole === "interviewee" && selectedPair?._id === intervieweePair._id
                                          ? "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-300"
                                          : "bg-white dark:bg-gray-800 border-slate-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-600 text-slate-700 dark:text-gray-300"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <User className="w-3 h-3 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium">Candidate</div>
                                          <div className="flex items-center gap-2 mt-1">
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                              intervieweePair.status === "completed" ? "bg-blue-100 text-blue-700" : intervieweePair.status === "scheduled" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                                            }`}>
                                              {intervieweePair.status === "completed" ? "Finished" : intervieweePair.status === "scheduled" ? "Scheduled" : "Pending"}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Collapsed: event dots list */}
            {!sidebarExpanded && (
              <div className="flex-1 flex flex-col items-center gap-1.5 p-2 overflow-y-auto scrollbar-thin">
                {filteredEvents.slice(0, 8).map((event) => {
                  const isActive = selectedEvent && selectedEvent._id === event._id;
                  const isJoined = event.joined;
                  return (
                    <button
                      key={event._id}
                      onClick={() => handleEventClick(event)}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-sky-100 dark:bg-sky-900/30 ring-2 ring-sky-400'
                          : isJoined
                          ? 'bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'
                          : 'hover:bg-slate-100 dark:hover:bg-gray-700'
                      }`}
                      title={event.name}
                    >
                      {isJoined ? (
                        <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Calendar className="w-4 h-4 text-slate-400 dark:text-gray-500" />
                      )}
                    </button>
                  );
                })}
                {filteredEvents.length > 8 && (
                  <span className="text-[10px] text-slate-400 dark:text-gray-500 font-medium">+{filteredEvents.length - 8}</span>
                )}
              </div>
            )}
          </div>

          {/* ── Mobile sidebar (shows full on mobile when no event selected) ── */}
          <div className={`${selectedEvent ? 'hidden' : 'block'} lg:hidden w-full`}>
            <div className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 p-3">
              {/* Mobile stats */}
              <div className="mb-3">
                <StatsComponent />
              </div>
              <EventList />
            </div>
          </div>

          {/* ── Main Content Area ── */}
          <div className={`${selectedEvent ? 'block' : 'hidden'} lg:block flex-1 min-w-0`}>
            <div className="bg-white dark:bg-gray-800 lg:rounded-none border-l-0 lg:border-l border-slate-200 dark:border-gray-700 h-[calc(100vh-5rem)] sm:h-[calc(100vh-4rem)] flex flex-col overflow-auto">
              {selectedEvent ? <EventDetails /> : <Placeholder />}
            </div>
          </div>
        </div>
      </div>
    </RequirePasswordChange>
  );
}
