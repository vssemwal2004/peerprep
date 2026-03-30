import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import ContributionCalendar from '../components/ContributionCalendar';
import { FiCamera, FiX, FiMail, FiUser, FiBook, FiGitBranch, FiMapPin, FiHash, FiUserCheck } from 'react-icons/fi';
import socketService from '../utils/socket';

export default function StudentProfile() {
  const [user, setUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setUser(me);
      } catch (e) {
        setError(e.message || 'Failed to load profile');
      }
    })();
  }, []);

  useEffect(() => {
    // Load activity data immediately
    loadActivityData();
    
    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow - now;
    
    // Set timeout to refresh at midnight
    const midnightTimeout = setTimeout(() => {
      loadActivityData();
      loadStats();
      
      // Set up daily interval after first midnight refresh
      const dailyInterval = setInterval(() => {
        loadActivityData();
        loadStats();
      }, 24 * 60 * 60 * 1000); // 24 hours
      
      return () => clearInterval(dailyInterval);
    }, msUntilMidnight);
    
    return () => clearTimeout(midnightTimeout);
  }, []);

  const loadActivityData = async () => {
    setLoadingActivity(true);
    try {
      const data = await api.getStudentActivity();
      setActivity(data.activityByDate || {});
      setActivityStats(data.stats || null);
    } catch (e) {
      console.error('Failed to load activity:', e);
      setActivity({});
    } finally {
      setLoadingActivity(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const data = await api.getStudentStats();
      setStats(data.stats || null);
    } catch (e) {
      console.error('Failed to load stats:', e);
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadStats();
    }
  }, [user]);

  // Socket.IO real-time synchronization for learning content changes
  useEffect(() => {
    socketService.connect();

    const handleLearningUpdate = (data) => {
      // Refresh both activity and stats when content is updated/deleted
      loadActivityData();
      loadStats();
    };

    socketService.on('learning-updated', handleLearningUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
    };
  }, []);

  const onAvatarChange = (e) => {
    const file = e.target.files?.[0] || null;
    setAvatarFile(file);
    
    // Create preview
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setAvatarPreview(null);
    }
  };

  const openPhotoModal = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    setSuccess('');
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    setSuccess('');
  };

  const handleUpdatePhoto = async () => {
    if (!avatarFile) {
      setError('Please select a photo first');
      return;
    }

    setError('');
    setSuccess('');
    
    try {
      await api.updateMyAvatar(avatarFile);
      
      // Refresh user data
      const me = await api.me();
      setUser(me);
      if (me && me.avatarUrl !== undefined) {
        localStorage.setItem("studentAvatarUrl", me.avatarUrl || "");
      }
      
      setSuccess('Profile photo updated successfully!');
      setTimeout(() => {
        closePhotoModal();
      }, 1500);
    } catch (e) {
      setError(e.message || 'Failed to update photo');
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-gray-900 flex flex-col pt-16">
        <div className="w-full max-w-3xl mx-auto px-4 py-12">
          <p className="text-slate-600 dark:text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 flex flex-col pt-16">
      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }} 
        transition={{ duration: 0.5 }}
        className="w-full px-4 sm:px-6 py-8"
      >
        {/* Profile Header Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 overflow-hidden mb-6">
          {/* Header Banner */}
          <div className="h-32 relative" style={{ backgroundColor: 'rgb(135, 206, 235)' }}>
            <div className="absolute -bottom-16 left-8">
              <div className="relative">
                {user.avatarUrl ? (
                  <img 
                    src={user.avatarUrl} 
                    alt={user.name} 
                    className="w-32 h-32 rounded-full object-cover border-4 border-white dark:border-gray-800 shadow-lg"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-4xl border-4 border-white dark:border-gray-800 shadow-lg">
                    {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                )}
                <button
                  onClick={openPhotoModal}
                  className="absolute bottom-0 right-0 bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 rounded-full p-2.5 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-white dark:border-gray-800"
                  title="Edit Photo"
                >
                  <FiCamera className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Profile Info */}
          <div className="pt-20 px-8 pb-8">
            <h1 className="text-3xl font-bold text-slate-800 dark:text-white mb-1">
              {user.name || 'Student Name'}
            </h1>
            <p className="text-slate-600 dark:text-gray-300 mb-6 flex items-center gap-2">
              <FiHash className="w-4 h-4" />
              {user.studentId || 'Student ID'}
            </p>

            {/* Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                <FiMail className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Email</p>
                  <p className="text-sm text-slate-800 dark:text-white font-medium truncate">{user.email || 'Not provided'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                <FiBook className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Course</p>
                  <p className="text-sm text-slate-800 dark:text-white font-medium">{user.course || 'Not provided'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                <FiGitBranch className="w-5 h-5 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Branch</p>
                  <p className="text-sm text-slate-800 dark:text-white font-medium">{user.branch || 'Not provided'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                <FiMapPin className="w-5 h-5 text-pink-600 dark:text-pink-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">College</p>
                  <p className="text-sm text-slate-800 dark:text-white font-medium">{user.college || 'Not provided'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                <FiBook className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Semester</p>
                  <p className="text-sm text-slate-800 dark:text-white font-medium">{user.semester || 'Not provided'}</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 dark:bg-gray-700/50 border border-slate-200 dark:border-gray-600">
                <FiUserCheck className="w-5 h-5 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1">Coordinator</p>
                  <p className="text-sm text-slate-800 dark:text-white font-medium">{user.teacherId || 'Not Assigned'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contribution Calendar Card */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6">
          {loadingActivity ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
              <p className="text-slate-500 dark:text-gray-400 mt-4">Loading activity...</p>
            </div>
          ) : (
            <ContributionCalendar 
              activity={activity}
              stats={activityStats}
              title="Contribution Calendar"
            />
          )}
        </div>

        {/* Statistics Tabs */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-slate-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-white mb-4">Statistics</h2>
          
          {loadingStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="animate-pulse">
                  <div className="h-24 bg-slate-200 dark:bg-gray-700 rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Total Courses Enrolled */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-blue-600 dark:bg-blue-500 flex items-center justify-center">
                  <FiBook className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalCoursesEnrolled || 0}</p>
                  <p className="text-xs text-slate-600 dark:text-gray-300 font-medium">Courses Enrolled</p>
                </div>
              </div>

              {/* Total Videos Watched */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border border-red-200 dark:border-red-800">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-red-600 dark:bg-red-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.totalVideosWatched || 0}</p>
                  <p className="text-xs text-slate-600 dark:text-gray-300 font-medium">Videos Watched</p>
                </div>
              </div>

              {/* Problems Solved */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-green-600 dark:bg-green-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 dark:text-white">{stats.problemsSolved || 0}</p>
                  <p className="text-xs text-slate-600 dark:text-gray-300 font-medium">Problems Solved</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-slate-500 dark:text-gray-400 py-8">No statistics available</p>
          )}
        </div>
      </motion.div>

      {/* Edit Photo Modal */}
      <AnimatePresence>
        {showPhotoModal && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closePhotoModal}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />
            
            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <FiCamera className="w-5 h-5" />
                    Edit Photo
                  </h2>
                  <button
                    onClick={closePhotoModal}
                    className="text-white hover:bg-white/20 rounded-lg p-2 transition-colors"
                  >
                    <FiX className="w-6 h-6" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6">
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
                    >
                      {error}
                    </motion.div>
                  )}
                  
                  {success && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-4 p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-700 dark:text-emerald-400 text-sm"
                    >
                      {success}
                    </motion.div>
                  )}

                  {/* Avatar Upload */}
                  <div className="flex flex-col items-center">
                    <div className="relative mb-4">
                      {avatarPreview ? (
                        <img 
                          src={avatarPreview} 
                          alt="Preview" 
                          className="w-32 h-32 rounded-full object-cover border-4 border-blue-500 shadow-lg"
                        />
                      ) : user.avatarUrl ? (
                        <img 
                          src={user.avatarUrl} 
                          alt={user.name} 
                          className="w-32 h-32 rounded-full object-cover border-4 border-slate-200 dark:border-gray-600 shadow-lg"
                        />
                      ) : (
                        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-4xl border-4 border-slate-200 dark:border-gray-600 shadow-lg">
                          {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                      )}
                      <label className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg cursor-pointer transition-colors">
                        <FiCamera className="w-5 h-5" />
                        <input 
                          type="file" 
                          accept="image/*" 
                          onChange={onAvatarChange} 
                          className="hidden"
                        />
                      </label>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-gray-300 mb-2 text-center">
                      {avatarFile ? avatarFile.name : 'Click the camera icon to select a new photo'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-gray-400 text-center">
                      Recommended: Square image, at least 256x256px
                    </p>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="bg-slate-50 dark:bg-gray-900 px-6 py-4 flex items-center justify-end gap-3 rounded-b-2xl border-t border-slate-200 dark:border-gray-700">
                  <button
                    onClick={closePhotoModal}
                    className="px-6 py-2.5 rounded-lg border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdatePhoto}
                    disabled={!avatarFile}
                    className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Update Photo
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
