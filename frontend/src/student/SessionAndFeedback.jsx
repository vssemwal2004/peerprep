
/* eslint-disable no-unused-vars */
import { useState, useEffect } from "react";
import { api } from "../utils/api";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, Calendar, Link as LinkIcon, MessageSquare, X, Search } from "lucide-react";

export default function SessionAndFeedback() {
  const [events, setEvents] = useState([]);
  const [pairs, setPairs] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [activePair, setActivePair] = useState(null);
  const [marks, setMarks] = useState("");
  const [comments, setComments] = useState("");
  const [notification, setNotification] = useState("");
  const [myFeedback, setMyFeedback] = useState([]);
  const [receivedFeedback, setReceivedFeedback] = useState({});

  // Emoji mapping for ratings
  const getRatingEmoji = (rating) => {
    const emojis = {
      1: '😞',
      2: '😕',
      3: '😐',
      4: '😊',
      5: '😄'
    };
    return emojis[rating] || rating;
  };

  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  useEffect(() => {
    const loadData = async () => {
      try {
        const evs = await api.listEvents();
        setEvents(evs);
        const allPairs = [];
        const feedbackPairs = [];
        const receivedMap = {};
        for (const ev of evs) {
          const prs = await api.listPairs(ev._id);
          allPairs.push(...prs.filter(p => p.scheduledAt).map(p => ({ ...p, event: ev })));
          const feedback = await api.myFeedback(ev._id).catch(() => []);
          feedbackPairs.push(...feedback.map(f => f.pair));
          const aboutMe = await api.feedbackForMe(ev._id).catch(() => []);
          aboutMe.forEach(f => { if (f.pair) receivedMap[f.pair] = f; });
        }
        setPairs(allPairs);
        setMyFeedback(feedbackPairs);
        setReceivedFeedback(receivedMap);
      } catch (err) {
        console.error(err);
        setNotification("Failed to load sessions.");
      }
    };
    loadData();
  }, []);

  const filteredPairs = pairs.filter(p =>
    p.event.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.interviewer?.name || p.interviewer?.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.interviewee?.name || p.interviewee?.email || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!activePair) return;
    try {
      await api.submitFeedback(activePair._id, Number(marks), comments);
      setNotification("Feedback submitted successfully");
      setMyFeedback((prev) => [...prev, activePair._id]);
      setActivePair(null);
      setMarks("");
      setComments("");
    } catch (err) {
      setNotification(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col pt-16">
      <div className="flex-1 w-full max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] gap-6">
          {/* Desktop Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="hidden lg:block lg:w-80"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Scheduled Sessions</h2>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 dark:text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by event or name..."
                  className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 pl-10 pr-10 py-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-700 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                )}
              </div>
              {filteredPairs.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-gray-600 dark:text-gray-400 text-sm text-center py-8"
                >
                  No sessions found
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {filteredPairs.map((p, idx) => (
                    <motion.div
                      key={p._id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + idx * 0.1 }}
                      className={`p-4 rounded-xl bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-200 cursor-pointer ${
                        activePair?._id === p._id ? "ring-2 ring-blue-500 dark:ring-blue-600" : ""
                      }`}
                      onClick={() => setActivePair(p)}
                    >
                      <div className="flex items-start gap-3">
                        <Calendar className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-1" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-800 dark:text-gray-100 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md">{p.event.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            {p.interviewer?.name || p.interviewer?.email} ➜ {p.interviewee?.name || p.interviewee?.email}
                          </p>
                          <div className="flex gap-2 mt-2 flex-wrap">
                            <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
                              {new Date(p.scheduledAt).toLocaleString()}
                            </span>
                            {myFeedback.includes(p._id) && (
                              <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-1 rounded-full">
                                Feedback Submitted
                              </span>
                            )}
                            {!myFeedback.includes(p._id) && receivedFeedback[p._id] && (
                              <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full">
                                Feedback Received
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Mobile Sidebar Toggle */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="lg:hidden sticky top-16 z-20 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-100 dark:border-gray-700 py-4 px-4 flex items-center justify-between"
          >
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Scheduled Sessions</h2>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="p-2 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200"
            >
              {isMobileSidebarOpen ? <X className="w-5 h-5 text-gray-600 dark:text-gray-300" /> : <Calendar className="w-5 h-5 text-blue-500" />}
            </motion.button>
          </motion.div>

          {/* Mobile Sidebar Overlay */}
          <AnimatePresence>
            {isMobileSidebarOpen && (
              <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="lg:hidden fixed inset-0 top-28 z-30 bg-white dark:bg-gray-800 p-6 overflow-y-auto"
              >
                <div className="space-y-4">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-500 dark:text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by event or name..."
                      className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 pl-10 pr-10 py-2 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-700 dark:text-gray-100 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                    />
                    {searchQuery && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      >
                        <X className="w-4 h-4" />
                      </motion.button>
                    )}
                  </div>
                  {filteredPairs.length === 0 ? (
                    <div className="text-gray-600 dark:text-gray-300 text-sm text-center py-8">No sessions found</div>
                  ) : (
                    filteredPairs.map((p) => (
                      <motion.div
                        key={p._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="p-4 rounded-xl bg-white dark:bg-gray-700 shadow-sm border border-gray-100 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 transition-all duration-200 cursor-pointer"
                        onClick={() => {
                          setActivePair(p);
                          setIsMobileSidebarOpen(false);
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <Calendar className="w-5 h-5 text-blue-500 dark:text-blue-400 mt-1" />
                          <div className="flex-1">
                            <p className="font-bold text-gray-800 dark:text-gray-100 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded-md">{p.event.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                              {p.interviewer?.name || p.interviewer?.email} ➜ {p.interviewee?.name || p.interviewee?.email}
                            </p>
                            <div className="flex gap-2 mt-2 flex-wrap">
                              <span className="text-xs bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-full">
                                {new Date(p.scheduledAt).toLocaleString()}
                              </span>
                              {myFeedback.includes(p._id) && (
                                <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-2 py-1 rounded-full">
                                  Feedback Submitted
                                </span>
                              )}
                              {!myFeedback.includes(p._id) && receivedFeedback[p._id] && (
                                <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full">
                                  Feedback Received
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex-1"
          >
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-6 md:p-8 lg:p-10 h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
              {activePair ? (
                <div className="space-y-6">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="flex items-center justify-between"
                  >
                    <h2 className="text-2xl lg:text-3xl font-bold text-gray-800 dark:text-gray-100">
                      {activePair.interviewer?.name || activePair.interviewer?.email} ➜ {activePair.interviewee?.name || activePair.interviewee?.email}
                    </h2>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setActivePair(null)}
                      className="p-2 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-all duration-200 lg:hidden"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </motion.button>
                  </motion.div>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-300">Time: {new Date(activePair.scheduledAt).toLocaleString()}</span>
                    </div>
                    {activePair.meetingLink ? (
                      <div className="flex items-center gap-2">
                        <LinkIcon className="w-5 h-5 text-blue-500 dark:text-blue-400" />
                        <a
                          href={activePair.meetingLink}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline text-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Join Meeting
                        </a>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600 dark:text-gray-400">Meeting link will appear 1 hour before the scheduled time.</div>
                    )}
                  </div>
                  {(() => {
                    const isSubmitted = myFeedback.includes(activePair._id);
                    const received = receivedFeedback[activePair._id];
                    const interviewerId = activePair.interviewer?._id || activePair.interviewer?.id;
                    const intervieweeId = activePair.interviewee?._id || activePair.interviewee?.id;
                    const isInterviewer = userId && interviewerId === userId;
                    const isInterviewee = userId && intervieweeId === userId;
                    if (isSubmitted) {
                      return (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="p-4 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl border border-green-100 dark:border-green-700 text-sm font-medium flex items-center"
                        >
                          <CheckCircle className="w-5 h-5 mr-2" />
                          Feedback already submitted for this session.
                        </motion.div>
                      );
                    }
                    if (isInterviewee) {
                      if (received) {
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="bg-purple-50 dark:bg-purple-900/30 p-6 rounded-xl border border-purple-200 dark:border-purple-700"
                          >
                            <h3 className="text-xl font-semibold text-purple-800 dark:text-purple-300 mb-2">Feedback Received</h3>
                            <p className="text-sm text-purple-700 dark:text-purple-300 mb-1"><strong>From:</strong> {received.from}</p>
                            <p className="text-sm text-purple-700 dark:text-purple-300 mb-1 flex items-center gap-2">
                              <strong>Rating:</strong> 
                              <span className="text-2xl">{getRatingEmoji(received.marks)}</span>
                              <span className="text-purple-600 dark:text-purple-400">({received.marks}/5)</span>
                            </p>
                            <p className="text-sm text-purple-700 dark:text-purple-300 whitespace-pre-wrap"><strong>Comments:</strong> {received.comments}</p>
                          </motion.div>
                        );
                      }
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.2 }}
                          className="p-4 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 text-sm"
                        >
                          Waiting for interviewer feedback.
                        </motion.div>
                      );
                    }
                    if (isInterviewer) {
                      const now = Date.now();
                      const durationMin = 30; // mirror server default; could be injected via env if needed
                      const meetingEnd = new Date(activePair.scheduledAt).getTime() + durationMin * 60 * 1000;
                      const feedbackOpen = now >= meetingEnd;
                      if (!feedbackOpen) {
                        return (
                          <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="p-4 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-xl border border-yellow-200 dark:border-yellow-700 text-sm"
                          >
                            Feedback will open after the session ends at {new Date(meetingEnd).toLocaleTimeString()}.
                          </motion.div>
                        );
                      }
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                          className="bg-gray-50 dark:bg-gray-700 p-6 rounded-xl border border-gray-200 dark:border-gray-600"
                        >
                          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Session Feedback</h3>
                          <form onSubmit={submit} className="space-y-4">
                            <div>
                              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Marks out of 100</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={marks}
                                onChange={(e) => setMarks(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-700 dark:text-gray-100"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Comments</label>
                              <textarea
                                value={comments}
                                onChange={(e) => setComments(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-gray-600 border border-gray-200 dark:border-gray-500 p-3 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-gray-700 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-400"
                                rows="4"
                                required
                              />
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.05, boxShadow: "0 10px 20px -5px rgba(59, 130, 246, 0.3)" }}
                              whileTap={{ scale: 0.95 }}
                              type="submit"
                              className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white p-3 rounded-xl font-semibold text-sm hover:from-blue-600 hover:to-purple-600 transition-all duration-200 shadow-md"
                            >
                              Submit Feedback
                            </motion.button>
                          </form>
                        </motion.div>
                      );
                    }
                    return (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="p-4 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 text-sm"
                      >
                        You are not a participant in this session.
                      </motion.div>
                    );
                  })()}
                  <AnimatePresence>
                    {notification && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className={`flex items-center text-sm p-4 rounded-xl mt-6 ${
                          notification.toLowerCase().includes("success")
                            ? "bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-100 dark:border-green-700"
                            : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-700"
                        }`}
                      >
                        {notification.toLowerCase().includes("success") ? (
                          <CheckCircle className="w-5 h-5 mr-2" />
                        ) : (
                          <AlertCircle className="w-5 h-5 mr-2" />
                        )}
                        {notification}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="flex flex-col items-center justify-center h-full text-center"
                >
                  <Calendar className="w-16 h-16 text-blue-500 dark:text-blue-400 mb-4" />
                  <h3 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Select a Session</h3>
                  <p className="text-gray-600 dark:text-gray-400">Choose a scheduled session from the sidebar to view details or submit feedback.</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}