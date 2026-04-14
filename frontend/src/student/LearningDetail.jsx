import { useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronRight,
  BookOpen,
  Youtube,
  FileType,
  FileSpreadsheet,
  Star,
  X,
  ExternalLink,
  Menu,
  CheckCircle2,
  Circle,
  ArrowLeft
} from 'lucide-react';
import { api } from '../utils/api';
import socketService from '../utils/socket';
import { useToast } from '../components/CustomToast';

// Extract YouTube video ID from any YouTube URL format
const getYouTubeVideoId = (url) => {
  if (!url) return null;
  const embedMatch = url.match(/youtube\.com\/embed\/([^?&#]+)/);
  if (embedMatch) return embedMatch[1];
  const watchMatch = url.match(/[?&]v=([^&#]+)/);
  if (watchMatch) return watchMatch[1];
  const shortMatch = url.match(/youtu\.be\/([^?#]+)/);
  if (shortMatch) return shortMatch[1];
  return null;
};

// Convert YouTube URL to embed format
const convertToEmbedUrl = (url) => {
  if (!url) return url;
  
  // Already an embed URL
  if (url.includes('youtube.com/embed/')) {
    return url;
  }
  
  // Standard YouTube URL: https://www.youtube.com/watch?v=VIDEO_ID
  const standardMatch = url.match(/[?&]v=([^&]+)/);
  if (standardMatch) {
    return `https://www.youtube.com/embed/${standardMatch[1]}`;
  }
  
  // Short YouTube URL: https://youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([^?]+)/);
  if (shortMatch) {
    return `https://www.youtube.com/embed/${shortMatch[1]}`;
  }
  
  // Return original URL if not YouTube
  return url;
};

export default function LearningDetail() {
  const toast = useToast();
  const { semester, subject, teacherId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { semesterId, subjectId, coordinatorName: initialCoordinatorName, coordinatorId: initialCoordinatorId } = location.state || {};

  const [allSubjects, setAllSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectDetails, setSubjectDetails] = useState(null);
  const [expandedChapters, setExpandedChapters] = useState({});
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentCoordinatorId, setCurrentCoordinatorId] = useState(initialCoordinatorId);
  const [currentCoordinatorName, setCurrentCoordinatorName] = useState(initialCoordinatorName);
  
  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState(null);
  const [modalType, setModalType] = useState(null); // 'video', 'notes', 'pdf'
  
  // Progress tracking
  const [progress, setProgress] = useState({});

  // YouTube IFrame API tracking
  const [currentVideoUrl, setCurrentVideoUrl] = useState(null); // original URL (pre-embed)
  const ytPlayerRef = useRef(null);       // YT.Player instance
  const watchIntervalRef = useRef(null);  // periodic ping interval
  const watchedSecsRef = useRef(0);       // accumulated watched seconds
  const playStartTimeRef = useRef(null);  // timestamp when play last started
  const trackingDataRef = useRef(null);   // { topicId, semesterId, subjectId, chapterId, coordinatorId }

  useEffect(() => {
    loadCoordinatorSubjects();
  }, [teacherId]);

  useEffect(() => {
    if (semesterId && subjectId) {
      loadSubjectDetails(semesterId, subjectId);
      setSelectedSubject({ semesterId, subjectId });
      loadSubjectProgress(subjectId);
    }
  }, [semesterId, subjectId]);

  // Socket.IO real-time synchronization
  useEffect(() => {
    socketService.connect();

    const handleLearningUpdate = async (data) => {
      
      // Reload subjects first to get updated list
      await loadCoordinatorSubjects();
      
      // Then reload current subject details if viewing one
      if (semesterId && subjectId) {
        loadSubjectDetails(semesterId, subjectId);
        loadSubjectProgress(subjectId);
      }
    };

    socketService.on('learning-updated', handleLearningUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
    };
  }, [semesterId, subjectId]);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      document.body.appendChild(script);

      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        (window._ytReadyCallbacks || []).forEach(cb => cb());
        window._ytReadyCallbacks = [];
      };
    }
  }, []);

  const loadCoordinatorSubjects = async () => {
    try {
      setLoading(true);
      const data = await api.getCoordinatorSubjects(teacherId);

      // Only show subjects for the currently selected semester (if provided)
      const filtered = semesterId
        ? data.filter(subject => subject.semesterId === semesterId)
        : data;

      setAllSubjects(filtered);
      
      // Load progress for all subjects in sidebar
      await loadAllSubjectsProgress(filtered);
    } catch (error) {
      console.error('Error loading subjects:', error);
      toast.error('Failed to load subjects');
    } finally {
      setLoading(false);
    }
  };

  const loadAllSubjectsProgress = async (subjects) => {
    try {
      // Load progress for each subject in parallel
      const progressPromises = subjects.map(subject => 
        api.getSubjectProgress(subject.subjectId)
          .then(data => ({ subjectId: subject.subjectId, data }))
          .catch(err => {
            console.error(`Failed to load progress for ${subject.subjectId}:`, err);
            return { subjectId: subject.subjectId, data: null };
          })
      );
      
      const results = await Promise.all(progressPromises);
      
      // Update progress state for all subjects
      setProgress(prev => {
        const updated = { ...prev };
        results.forEach(({ subjectId, data }) => {
          if (data) {
            updated[subjectId] = data;
          }
        });
        return updated;
      });
    } catch (error) {
      console.error('Error loading all subjects progress:', error);
    }
  };

  const loadSubjectDetails = async (semId, subjId) => {
    try {
      const data = await api.getSubjectDetails(semId, subjId);
      setSubjectDetails(data);
      // Update current coordinator info from loaded data
      if (data.coordinatorId) {
        setCurrentCoordinatorId(data.coordinatorId);
      }
      if (data.coordinatorName) {
        setCurrentCoordinatorName(data.coordinatorName);
      }
    } catch (error) {
      console.error('Error loading subject details:', error);
      
      // If subject not found (404), it may have been deleted - clear selection
      if (error.response?.status === 404) {
        toast.error('This subject is no longer available');
        setSelectedSubject(null);
        setSubjectDetails(null);
      } else {
        toast.error('Failed to load subject details');
      }
    }
  };

  const loadSubjectProgress = async (subjId) => {
    try {
      const data = await api.getSubjectProgress(subjId);
      setProgress(prev => ({
        ...prev,
        [subjId]: data
      }));
    } catch (error) {
      console.error('Error loading progress:', error);
    }
  };

  const handleSubjectClick = (subject) => {
    setSelectedSubject({ semesterId: subject.semesterId, subjectId: subject.subjectId });
    loadSubjectDetails(subject.semesterId, subject.subjectId);
    loadSubjectProgress(subject.subjectId);
  };

  const toggleChapter = (chapterId) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  // Send accumulated watch time to the backend
  const sendWatchTime = async () => {
    const data = trackingDataRef.current;
    if (!data || !data.topicId) return;
    const secs = Math.floor(watchedSecsRef.current);
    if (secs < 3) return;

    let duration = 0;
    try {
      if (ytPlayerRef.current?.getDuration) {
        duration = Math.floor(ytPlayerRef.current.getDuration() || 0);
      }
    } catch (_) { /* player may already be destroyed */ }

    try {
      await api.trackWatchTime(data.topicId, {
        watchedSeconds: secs,
        videoDuration: duration,
        semesterId: data.semesterId,
        subjectId: data.subjectId,
        chapterId: data.chapterId,
        coordinatorId: data.coordinatorId
      });
    } catch (err) {
      console.error('[trackWatchTime]', err);
    }
  };

  // Handle YouTube player state changes (PLAYING → start timer, PAUSED/ENDED → accumulate)
  const handleYTPlayerStateChange = (event) => {
    const YT = window.YT;
    if (!YT) return;
    if (event.data === YT.PlayerState.PLAYING) {
      playStartTimeRef.current = Date.now();
      clearInterval(watchIntervalRef.current);
      watchIntervalRef.current = setInterval(() => {
        if (playStartTimeRef.current) {
          const elapsed = (Date.now() - playStartTimeRef.current) / 1000;
          watchedSecsRef.current += elapsed;
          playStartTimeRef.current = Date.now();
          sendWatchTime();
        }
      }, 30000);
    } else if (
      event.data === YT.PlayerState.PAUSED ||
      event.data === YT.PlayerState.ENDED
    ) {
      clearInterval(watchIntervalRef.current);
      if (playStartTimeRef.current) {
        const elapsed = (Date.now() - playStartTimeRef.current) / 1000;
        watchedSecsRef.current += elapsed;
        playStartTimeRef.current = null;
      }
      sendWatchTime();
    }
  };

  // Create / destroy YT.Player when the video modal opens or closes
  useEffect(() => {
    if (!modalOpen || modalType !== 'video' || !currentVideoUrl) return;

    const videoId = getYouTubeVideoId(currentVideoUrl);
    if (!videoId) return; // non-YouTube fallback – uses plain <iframe>

    watchedSecsRef.current = 0;
    playStartTimeRef.current = null;

    const initPlayer = () => {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (_) {}
        ytPlayerRef.current = null;
      }
      ytPlayerRef.current = new window.YT.Player('yt-player-container', {
        videoId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: { onStateChange: handleYTPlayerStateChange }
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window._ytReadyCallbacks = window._ytReadyCallbacks || [];
      window._ytReadyCallbacks.push(initPlayer);
    }

    return () => {
      clearInterval(watchIntervalRef.current);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (_) {}
        ytPlayerRef.current = null;
      }
    };
  }, [modalOpen, modalType, currentVideoUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const openModal = async (type, content, topic) => {
    setModalType(type);
    
    // Convert URLs to viewable format
    let embedContent = content;
    
    if (type === 'video') {
      // Convert YouTube URLs to embed format for non-IFrame-API fallback
      embedContent = convertToEmbedUrl(content);
      // Store original URL and tracking data for YouTube IFrame API
      setCurrentVideoUrl(content);
      watchedSecsRef.current = 0;
      playStartTimeRef.current = null;
      trackingDataRef.current = {
        topicId: topic?._id,
        semesterId: subjectDetails?.semesterId,
        subjectId: subjectDetails?.subjectId,
        chapterId: topic?.chapterId,
        coordinatorId: currentCoordinatorId || subjectDetails?.coordinatorId
      };
    } else if (type === 'pdf' || type === 'notes') {
      // Handle Google Drive links for PDF viewing
      if (content.includes('drive.google.com')) {
        // Extract file ID and use Google Drive viewer
        const fileIdMatch = content.match(/[-\w]{25,}/);
        if (fileIdMatch) {
          embedContent = `https://drive.google.com/file/d/${fileIdMatch[0]}/preview`;
        }
      } else if (!content.includes('/preview') && !content.includes('viewer')) {
        // For direct PDF links, use Google Drive viewer as fallback
        embedContent = `https://docs.google.com/viewer?url=${encodeURIComponent(content)}&embedded=true`;
      }
    }
    
    setModalContent(embedContent);
    setModalOpen(true);
  };

  const closeModal = () => {
    clearInterval(watchIntervalRef.current);
    if (modalType === 'video' && trackingDataRef.current) {
      // Accumulate any remaining playing time before closing
      if (playStartTimeRef.current) {
        const elapsed = (Date.now() - playStartTimeRef.current) / 1000;
        watchedSecsRef.current += elapsed;
        playStartTimeRef.current = null;
      }
      const subjectIdToRefresh = trackingDataRef.current.subjectId;
      sendWatchTime().then(() => {
        if (subjectIdToRefresh) loadSubjectProgress(subjectIdToRefresh);
      });
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch (_) {}
        ytPlayerRef.current = null;
      }
    }
    trackingDataRef.current = null;
    setModalOpen(false);
    setModalContent(null);
    setModalType(null);
    setCurrentVideoUrl(null);
  };

  const openInNewTab = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const toggleTopicCompletion = async (topic, chapterId) => {
    try {
      const coordId = currentCoordinatorId || subjectDetails?.coordinatorId;
      
      if (!coordId) {
        console.error('Coordinator ID not available');
        toast.error('Unable to update topic status');
        return;
      }

      const isCompleted = isTopicCompleted(topic._id);
      
      if (isCompleted) {
        // Unmark as completed
        await api.markTopicIncomplete(
          topic._id,
          subjectDetails.semesterId,
          subjectDetails.subjectId,
          chapterId,
          coordId
        );
        toast.success('Topic marked as incomplete');
      } else {
        // Mark as completed
        await api.markTopicComplete(
          topic._id,
          subjectDetails.semesterId,
          subjectDetails.subjectId,
          chapterId,
          coordId
        );
        toast.success('Topic marked as completed! 🎉');
      }
      
      // Refresh progress
      await loadSubjectProgress(subjectDetails.subjectId);
      await loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
      
      // Also refresh sidebar subjects' progress
      if (allSubjects.length > 0) {
        await loadAllSubjectsProgress(allSubjects);
      }
    } catch (error) {
      console.error('Error toggling topic completion:', error);
      toast.error('Failed to update topic status');
    }
  };

  const getDifficultyBadge = (difficulty) => {
    const colors = {
      easy: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
      'easy-medium': 'bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300',
      medium: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
      'medium-hard': 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
      hard: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[difficulty] || colors.medium}`}>
        {difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : 'Medium'}
      </span>
    );
  };

  const getChapterProgress = (chapter) => {
    if (!chapter || !Array.isArray(chapter.topics)) {
      return { completedTopics: 0, totalTopics: 0, percentage: 0 };
    }

    const totalTopics = chapter.topics.length;

    if (!subjectDetails?.subjectId || !progress[subjectDetails.subjectId]?.progressRecords || totalTopics === 0) {
      return { completedTopics: 0, totalTopics, percentage: 0 };
    }

    const progressRecords = progress[subjectDetails.subjectId].progressRecords;
    let completedTopics = 0;

    chapter.topics.forEach(topic => {
      const topicProgress = progressRecords.find(p => p.topicId === topic._id);
      if (topicProgress?.completed) {
        completedTopics += 1;
      }
    });

    const percentage = totalTopics > 0
      ? Math.round((completedTopics / totalTopics) * 100)
      : 0;

    return { completedTopics, totalTopics, percentage };
  };

  const isTopicCompleted = (topicId) => {
    if (!subjectDetails?.subjectId || !progress[subjectDetails.subjectId]) {
      return false;
    }
    const progressRecords = progress[subjectDetails.subjectId].progressRecords || [];
    const topicProgress = progressRecords.find(p => p.topicId === topicId);
    return topicProgress?.completed || false;
  };

  const getSubjectProgressInfo = (subjId) => {
    const subj = progress[subjId];
    if (!subj) {
      return { completedTopics: 0, totalTopics: 0, percentage: 0 };
    }

    const completedTopics = typeof subj.completedTopics === 'number'
      ? subj.completedTopics
      : (subj.progressRecords || []).filter(p => p.completed).length;

    let totalTopics;
    if (typeof subj.totalTopics === 'number') {
      totalTopics = subj.totalTopics;
    } else {
      totalTopics = (subj.progressRecords || []).length;
    }

    const percentage = totalTopics > 0
      ? Math.round((completedTopics / totalTopics) * 100)
      : 0;

    return { completedTopics, totalTopics, percentage };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 pt-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-200 border-t-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-16">
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? 280 : 0 }}
          className="bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 overflow-hidden shadow-sm"
        >
          <div className="h-full overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200 dark:border-gray-700">
              <h2 className="text-base font-bold text-slate-800 dark:text-gray-100">My Subjects</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1.5 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-slate-600 dark:text-gray-400" />
              </button>
            </div>

            <div className="space-y-2.5">
              {allSubjects.map((subject) => {
                const isSelected = selectedSubject?.subjectId === subject.subjectId;
                const { completedTopics, totalTopics, percentage: progressPercent } = getSubjectProgressInfo(subject.subjectId);

                return (
                  <div key={subject.subjectId}>
                    <button
                      onClick={() => handleSubjectClick(subject)}
                      className={`w-full text-left p-3 rounded-lg transition-all border ${
                        isSelected
                          ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-300 dark:border-sky-600 shadow-sm'
                          : 'bg-slate-50 dark:bg-gray-700 border-slate-200 dark:border-gray-600 hover:bg-slate-100 dark:hover:bg-gray-600 hover:border-slate-300 dark:hover:border-gray-500'
                      }`}
                    >
                      <div className="flex items-center space-x-2 mb-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          isSelected ? 'bg-sky-100 dark:bg-sky-800' : 'bg-slate-200 dark:bg-gray-600'
                        }`}>
                          <BookOpen className={`w-4 h-4 ${
                            isSelected ? 'text-sky-600 dark:text-sky-400' : 'text-slate-500 dark:text-gray-400'
                          }`} />
                        </div>
                        <span className={`font-semibold text-sm truncate ${
                          isSelected ? 'text-slate-800 dark:text-gray-100' : 'text-slate-700 dark:text-gray-300'
                        }`}>
                          {subject.subjectName}
                        </span>
                      </div>
                      
                      {/* Subject Progress Bar divided by topics */}
                      <div className="w-full bg-slate-200 dark:bg-gray-600 rounded-full h-2 overflow-hidden mb-1.5 flex">
                        {totalTopics > 0 ? (
                          Array.from({ length: totalTopics }).map((_, idx) => (
                            <div
                              key={idx}
                              className={`flex-1 ${
                                idx < completedTopics
                                  ? 'bg-sky-500 dark:bg-sky-600'
                                  : 'bg-transparent'
                              }`}
                            />
                          ))
                        ) : (
                          <div className="flex-1 bg-transparent" />
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-slate-600 dark:text-gray-400">
                          {progressPercent}% Complete
                        </p>
                        {progressPercent === 100 && (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-gray-900">
          {/* Toggle Sidebar Button */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="fixed left-4 top-20 z-10 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg hover:bg-slate-50 dark:hover:bg-gray-700 border border-slate-200 dark:border-gray-700 transition-all"
            >
              <Menu className="w-5 h-5 text-slate-700 dark:text-gray-300" />
            </button>
          )}

          {subjectDetails ? (
            <div className="w-full p-6 sm:p-6 lg:px-10 lg:py-8">
              {/* Header */}
              <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-slate-200 dark:border-gray-700 p-5">
                <div className="flex items-start justify-between mb-2">
                  <h1 className="text-2xl font-bold text-slate-800 dark:text-gray-100">
                    {subjectDetails.subjectName}
                  </h1>
                  <button
                    onClick={() => navigate('/student/learning')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                </div>
                <p className="text-sm text-slate-600 dark:text-gray-400 mb-3">{subjectDetails.subjectDescription}</p>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="px-2 py-1 bg-sky-100 dark:bg-sky-900 text-sky-700 dark:text-sky-300 rounded font-medium">
                    Instructor: {currentCoordinatorName || subjectDetails?.coordinatorName || initialCoordinatorName || 'Teacher'}
                  </span>
                </div>
              </div>

              {/* Chapters */}
              <div className="space-y-3">
                {subjectDetails.chapters.map((chapter, chapterIdx) => {
                  const { completedTopics, totalTopics, percentage } = getChapterProgress(chapter);

                  return (
                  <div key={chapter._id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-slate-200 dark:border-gray-700 overflow-hidden">
                    {/* Chapter Header */}
                    <div
                      onClick={() => toggleChapter(chapter._id)}
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center space-x-3 flex-1">
                        <div className="flex items-center space-x-2">
                          {expandedChapters[chapter._id] ? (
                            <ChevronDown className="w-4 h-4 text-slate-600 dark:text-gray-400" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-gray-400" />
                          )}
                          <h3 className="font-bold text-sm text-slate-800 dark:text-gray-100">
                            Chapter {chapterIdx + 1}: {chapter.chapterName}
                          </h3>
                        </div>
                        <div className="flex items-center space-x-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-3.5 h-3.5 ${
                                i < (chapter.importanceLevel || 3)
                                  ? 'text-yellow-500 fill-yellow-500'
                                  : 'text-slate-300 dark:text-gray-600'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-xs font-medium px-2 py-1 bg-slate-100 dark:bg-gray-700 text-slate-600 dark:text-gray-400 rounded">
                          {chapter.topics.length} {chapter.topics.length === 1 ? 'Topic' : 'Topics'}
                        </span>
                        {totalTopics > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-28 h-1.5 bg-slate-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                              {Array.from({ length: totalTopics }).map((_, idx) => {
                                const filled = idx < completedTopics;
                                return (
                                  <div
                                    key={idx}
                                    className={`flex-1 ${filled ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-transparent'}`}
                                  />
                                );
                              })}
                            </div>
                            <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400">
                              {completedTopics}/{totalTopics} ({percentage}%)
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Topics Table */}
                    <AnimatePresence>
                      {expandedChapters[chapter._id] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-slate-200 dark:border-gray-700"
                        >
                          <div className="p-4 bg-white dark:bg-gray-900">
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">Topics</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full table-fixed">
                                <colgroup>
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '22%' }} />
                                  <col style={{ width: '12%' }} />
                                  <col style={{ width: '12%' }} />
                                  <col style={{ width: '11%' }} />
                                  <col style={{ width: '11%' }} />
                                  <col style={{ width: '12%' }} />
                                  <col style={{ width: '12%' }} />
                                </colgroup>
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-gray-700">
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Status</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Topic</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Problem Link</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Importance</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Difficulty</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Video</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Questions</th>
                                  </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-900">
                                  {chapter.topics.map((topic, idx) => (
                                    <tr 
                                      key={topic._id}
                                      className={`border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors ${
                                        idx === chapter.topics.length - 1 ? 'border-b-0' : ''
                                      }`}
                                    >
                                      {/* Status */}
                                      <td className="py-3 px-4">
                                        <button
                                          onClick={() => toggleTopicCompletion(topic, chapter._id)}
                                          className="hover:scale-110 transition-transform"
                                          title={isTopicCompleted(topic._id) ? 'Mark as incomplete' : 'Mark as complete'}
                                        >
                                          {isTopicCompleted(topic._id) ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-500 hover:text-green-600" />
                                          ) : (
                                            <Circle className="w-5 h-5 text-slate-300 dark:text-gray-600 hover:text-slate-400 dark:hover:text-gray-500" />
                                          )}
                                        </button>
                                      </td>

                                      {/* Topic Name */}
                                      <td className="py-3 px-4">
                                        <span className="text-sm font-medium text-slate-800 dark:text-gray-200">
                                          {topic.topicName}
                                        </span>
                                      </td>

                                      {/* Problem Link */}
                                      <td className="py-3 px-4">
                                        {topic.problemLink ? (
                                          <a
                                            href={topic.problemLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                                          >
                                            Solve
                                            <ExternalLink className="w-3.5 h-3.5" />
                                          </a>
                                        ) : (
                                          <span className="text-xs text-slate-400 dark:text-gray-500">No link</span>
                                        )}
                                      </td>

                                      {/* Importance */}
                                      <td className="py-3 px-4">
                                        <div className="flex items-center justify-center gap-0.5">
                                          {Array.from({ length: 5 }).map((_, i) => (
                                            <Star
                                              key={i}
                                              className={`w-3.5 h-3.5 ${
                                                i < (topic.importanceLevel || 3)
                                                  ? 'text-yellow-500 fill-yellow-500'
                                                  : 'text-slate-300 dark:text-gray-600'
                                              }`}
                                            />
                                          ))}
                                        </div>
                                      </td>

                                      {/* Difficulty */}
                                      <td className="py-3 px-4 text-center">
                                        {getDifficultyBadge(topic.difficultyLevel)}
                                      </td>

                                      {/* Video */}
                                      <td className="py-3 px-4 text-center">
                                        {topic.topicVideoLink ? (
                                          <button
                                            onClick={() => openModal('video', topic.topicVideoLink, { ...topic, chapterId: chapter._id })}
                                            className="inline-flex items-center justify-center w-9 h-9 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
                                            title="Watch Video"
                                          >
                                            <Youtube className="w-5 h-5" />
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 dark:text-gray-600">—</span>
                                        )}
                                      </td>

                                      {/* Notes PDF */}
                                      <td className="py-3 px-4 text-center">
                                        {topic.notesPDF ? (
                                          <button
                                            onClick={() => openModal('pdf', topic.notesPDF, topic)}
                                            className="inline-flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                                            title="View Notes"
                                          >
                                            <FileType className="w-5 h-5" />
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 dark:text-gray-600">—</span>
                                        )}
                                      </td>

                                      {/* Questions PDF */}
                                      <td className="py-3 px-4 text-center">
                                        {topic.questionPDF ? (
                                          <button
                                            onClick={() => openModal('pdf', topic.questionPDF, topic)}
                                            className="inline-flex items-center justify-center w-9 h-9 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
                                            title="View Questions"
                                          >
                                            <FileSpreadsheet className="w-5 h-5" />
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 dark:text-gray-600">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="mt-3 text-xs text-slate-600 dark:text-gray-400 bg-slate-50 dark:bg-gray-800/60 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2">
                              Tip: when you finish a video, click the status circle to mark it complete so your progress updates.
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="w-16 h-16 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="w-8 h-8 text-slate-400 dark:text-gray-500" />
                </div>
                <p className="text-sm text-slate-600 dark:text-gray-400 font-medium">Select a subject to view details</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[65vw] max-w-4xl h-auto max-h-[85vh] bg-white dark:bg-gray-800 rounded-xl border border-slate-200 dark:border-gray-700 shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <h3 className="text-base font-bold text-slate-800 dark:text-gray-100">
                  {modalType === 'video' && '📹 Video Lesson'}
                  {modalType === 'notes' && '📄 Study Notes'}
                  {modalType === 'pdf' && '📝 Practice Questions'}
                </h3>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => openInNewTab(modalContent)}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-4 h-4 text-slate-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={closeModal}
                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 text-slate-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-hidden p-4 bg-slate-50 dark:bg-gray-900">
                {modalType === 'video' && (
                  getYouTubeVideoId(currentVideoUrl) ? (
                    /* YouTube IFrame API player — the API fills this div */
                    <div
                      id="yt-player-container"
                      className="w-full h-[500px] rounded-lg bg-black overflow-hidden"
                    />
                  ) : (
                    /* Non-YouTube fallback: plain iframe */
                    <iframe
                      src={modalContent}
                      className="w-full h-[500px] rounded-lg border border-slate-200 dark:border-gray-700 bg-black"
                      allowFullScreen
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      title="Video Player"
                    />
                  )
                )}
                {(modalType === 'notes' || modalType === 'pdf') && (
                  <div className="w-full h-[500px] rounded-lg border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden relative">
                    <iframe
                      src={modalContent}
                      className="w-full h-full"
                      title="Document Viewer"
                      allow="autoplay"
                      style={{ border: 'none' }}
                      onError={(e) => {
                        console.error('PDF iframe load error:', e);
                        toast.error('Unable to load PDF. Click "Open in new tab" to view.');
                      }}
                    />
                    {/* Fallback message */}
                    <div className="absolute bottom-4 left-4 right-4 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 text-center">
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        💡 If the document doesn't load, click the <ExternalLink className="inline w-3 h-3" /> icon above to open in a new tab
                      </p>
                    </div>
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
