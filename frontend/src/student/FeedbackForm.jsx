import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { CheckCircle, AlertCircle, Award, Calendar, User, Lock, ExternalLink, Copy } from "lucide-react";

export default function FeedbackForm() {
  const { pairId } = useParams();
  const navigate = useNavigate();
  const [pair, setPair] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [notification, setNotification] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  const [ratings, setRatings] = useState({
    integrity: 3,
    communication: 3,
    preparedness: 3,
    problemSolving: 3,
    attitude: 3,
  });
  const [suggestions, setSuggestions] = useState("");

  const userId = typeof window !== 'undefined' ? localStorage.getItem('userId') : null;

  // Block navigation/reload until submitted using beforeunload
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!submitted) {
        e.preventDefault();
        e.returnValue = 'You have unsaved feedback. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [submitted]);

  useEffect(() => {
    
    const loadPairDetails = async () => {
      try {
        setLoading(true);
        
        const data = await api.getPairDetails(pairId);
        setPair(data);

        // Verify current user is the interviewer
        const interviewerId = data.interviewer?._id || data.interviewer;
        
        if (!userId || String(interviewerId) !== String(userId)) {
          setError("Only the interviewer can submit feedback for this session.");
          return;
        }

        // Check if feedback already submitted
        try {
          const existingFeedback = await api.myFeedback(data.event._id);
          if (existingFeedback.some(f => f.pair === pairId)) {
            setSubmitted(true);
            setNotification("Feedback already submitted for this session.");
          }
        } catch (err) {
        }
      } catch (err) {
        console.error('[FeedbackForm] Error loading pair details:', err);
        setError(err.message || "Failed to load session details");
      } finally {
        setLoading(false);
      }
    };

    loadPairDetails();
  }, [pairId, userId]);

  const totalMarks =
    ratings.integrity +
    ratings.communication +
    ratings.preparedness +
    ratings.problemSolving +
    ratings.attitude;

  const handleCopyLink = async () => {
    if (pair?.meetingLink) {
      try {
        await navigator.clipboard.writeText(pair.meetingLink);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting || submitted) return;

    try {
      setSubmitting(true);
      await api.submitFeedback(pairId, ratings, suggestions);
      setSubmitted(true);
      setNotification("✅ Feedback submitted successfully!");
      
      // Set flag to trigger immediate refresh on dashboard
      try {
        localStorage.setItem('feedbackJustSubmitted', 'true');
        localStorage.removeItem(`feedbackTimer:${pairId}`);
      } catch {
        // ignore
      }

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate("/student/dashboard");
      }, 2000);
    } catch (err) {
      setNotification(err.message || "Failed to submit feedback");
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen bg-white dark:bg-gray-900 flex items-center justify-center overflow-hidden">
        <div className="text-center bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-gray-700">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600 dark:border-sky-500 mx-auto mb-3"></div>
          <p className="text-sm text-slate-600 dark:text-gray-300 font-medium">Loading session details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-white dark:bg-gray-900 flex items-center justify-center overflow-hidden px-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-700 p-6 max-w-md shadow-lg">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">Error</h2>
          </div>
          <p className="text-sm text-slate-700 dark:text-gray-300 mb-4">{error}</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="w-full px-4 py-2 bg-slate-600 hover:bg-slate-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="h-screen bg-white dark:bg-gray-900 flex items-center justify-center overflow-hidden">
        <div className="text-center bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-slate-200 dark:border-gray-700">
          <p className="text-sm text-slate-600 dark:text-gray-300 font-medium mb-3">No session data available</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm rounded-lg font-medium transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Emoji mapping for ratings
  const getRatingEmoji = (rating) => {
    const emojis = {
      1: '😞',
      2: '😕',
      3: '😐',
      4: '😊',
      5: '😄'
    };
    return emojis[rating] || '';
  };

  return (
    <div className="h-screen bg-white dark:bg-gray-900 overflow-hidden flex items-center justify-center">
      <div className="w-full px-4 py-3 sm:px-6 lg:px-10">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-lg border border-slate-200 dark:border-gray-700 p-4 shadow-lg">
          {/* Meeting Link */}
          {pair?.meetingLink && (
            <div className="mb-3 p-3 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 border border-sky-200 dark:border-sky-700 rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ExternalLink className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="text-xs font-semibold text-sky-900 dark:text-sky-300">Meeting Link</span>
                  </div>
                  <a
                    href={pair.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-sky-700 hover:text-sky-900 dark:text-sky-400 dark:hover:text-sky-300 underline break-all font-medium"
                  >
                    {pair.meetingLink}
                  </a>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copySuccess ? "Copied!" : "Copy"}
                  </button>
                  <a
                    href={pair.meetingLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Join
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Header Section */}
          <div className="mb-2 pb-2 border-b border-slate-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-2">
              <h1 className="text-lg font-bold text-slate-900 dark:text-gray-100 flex items-center gap-2">
                {!submitted && <Lock className="w-4 h-4 text-sky-600 dark:text-sky-400" />}
                Interview Feedback Form
              </h1>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="font-semibold text-slate-600 dark:text-gray-400">Event:</span>
                <span className="ml-1 text-slate-900 dark:text-gray-200">{pair.event?.name || "N/A"}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-600 dark:text-gray-400">Date:</span>
                <span className="ml-1 text-slate-900 dark:text-gray-200">
                  {pair.event?.startDate ? new Date(pair.event.startDate).toLocaleDateString() : "N/A"}
                </span>
              </div>
              <div>
                <span className="font-semibold text-slate-600 dark:text-gray-400">Candidate:</span>
                <span className="ml-1 text-slate-900 dark:text-gray-200">
                  {pair.interviewee?.name || pair.interviewee?.email || "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Evaluation Criteria */}
          <div className="mb-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-gray-100 mb-2">
              Evaluation Criteria
            </h2>

            {/* Rating Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-gray-700">
                    <th className="text-left p-2 border border-slate-200 dark:border-gray-600 font-semibold text-slate-700 dark:text-gray-100 text-xs">
                      Evaluation Point
                    </th>
                    <th className="text-center p-2 border border-slate-200 dark:border-gray-600 font-semibold text-slate-700 dark:text-gray-100 text-xs" colSpan="5">
                      Rating (1 = Poor, 5 = Excellent)
                    </th>
                  </tr>
                  <tr className="bg-slate-50 dark:bg-gray-700">
                    <th className="p-2 border border-slate-200 dark:border-gray-600"></th>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <th key={num} className="text-center p-1 border border-slate-200 dark:border-gray-600 text-lg">
                        {getRatingEmoji(num)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: "integrity", label: "Integrity and Ethical Behavior" },
                    { key: "communication", label: "Communication Skills" },
                    { key: "preparedness", label: "Preparedness and Initiative" },
                    { key: "problemSolving", label: "Problem Solving and Learning Ability" },
                    { key: "attitude", label: "Attitude and Respect" },
                  ].map((criterion, idx) => (
                    <tr key={criterion.key} className={idx % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-slate-50 dark:bg-gray-700"}>
                      <td className="p-2 border border-slate-200 dark:border-gray-600 font-medium text-slate-800 dark:text-gray-200 text-xs">
                        {criterion.label}
                      </td>
                      {[1, 2, 3, 4, 5].map((rating) => (
                        <td key={rating} className="text-center p-1.5 border border-slate-200 dark:border-gray-600">
                          <input
                            type="radio"
                            name={criterion.key}
                            value={rating}
                            checked={ratings[criterion.key] === rating}
                            onChange={() =>
                              setRatings((prev) => ({ ...prev, [criterion.key]: rating }))
                            }
                            disabled={submitted}
                            className="w-3.5 h-3.5 text-sky-600 focus:ring-sky-500 cursor-pointer disabled:cursor-not-allowed"
                            required
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="bg-sky-50 dark:bg-sky-900/30 font-semibold">
                    <td className="p-2 border border-slate-200 dark:border-gray-600 text-slate-900 dark:text-gray-100 text-xs">
                      Total Marks
                    </td>
                    <td colSpan="5" className="text-center p-2 border border-slate-200 dark:border-gray-600 text-sky-700 dark:text-sky-400 text-sm">
                      {totalMarks} / 25
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Additional Suggestions / Comments (Required) */}
            <div className="mt-3">
              <label className="block text-xs font-semibold text-slate-700 dark:text-gray-300 mb-1">
                Additional Comments (Required)
              </label>
              <textarea
                value={suggestions}
                onChange={(e) => setSuggestions(e.target.value)}
                disabled={submitted}
                rows={2}
                required
                className="w-full border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:bg-slate-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed placeholder:text-slate-400 dark:placeholder:text-gray-500"
                placeholder="Share your detailed feedback and suggestions (required)..."
              />
            </div>
          </div>

          {/* Notification */}
          {notification && (
            <div
              className={`mb-3 p-2 rounded-lg flex items-center gap-2 ${
                notification.includes("✅") || notification.includes("success")
                  ? "bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300"
                  : "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300"
              }`}
            >
              {notification.includes("✅") || notification.includes("success") ? (
                <CheckCircle className="w-4 h-4" />
              ) : (
                <AlertCircle className="w-4 h-4" />
              )}
              <p className="text-xs font-medium">{notification}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || submitted}
            className="w-full px-4 py-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 dark:bg-sky-700 dark:hover:bg-sky-600 dark:active:bg-sky-800 text-white text-sm font-semibold rounded-lg transition-colors disabled:bg-slate-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Submitting...
              </>
            ) : submitted ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Submitted Successfully
              </>
            ) : (
              "Submit Feedback"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
