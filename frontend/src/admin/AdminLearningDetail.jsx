import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import socketService from '../utils/socket';
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
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  ArrowLeft,
  BarChart3
} from 'lucide-react';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import LearningAnalyticsModal from '../components/LearningAnalyticsModal';

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

export default function AdminLearningDetail() {
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
  const [modalType, setModalType] = useState(null);
  
  // CRUD modal states
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [editingChapter, setEditingChapter] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [topicImportanceLevel, setTopicImportanceLevel] = useState(3);
  const [showAnalytics, setShowAnalytics] = useState(false);

  useEffect(() => {
    loadCoordinatorSubjects();
  }, [teacherId]);

  useEffect(() => {
    if (semesterId && subjectId) {
      loadSubjectDetails(semesterId, subjectId);
      setSelectedSubject({ semesterId, subjectId });
    }
  }, [semesterId, subjectId]);

  // Socket.IO real-time synchronization
  useEffect(() => {
    socketService.connect();

    const handleLearningUpdate = (data) => {
      loadCoordinatorSubjects();
      if (semesterId && subjectId) {
        loadSubjectDetails(semesterId, subjectId);
      }
    };

    socketService.on('learning-updated', handleLearningUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
    };
  }, [semesterId, subjectId]);

  const loadCoordinatorSubjects = async () => {
    try {
      setLoading(true);
      const data = await api.getCoordinatorSubjects(teacherId);
      setAllSubjects(data);
    } catch (error) {
      console.error('Error loading subjects:', error);
      toast.error('Failed to load subjects');
    } finally {
      setLoading(false);
    }
  };

  const loadSubjectDetails = async (semId, subjId) => {
    try {
      const data = await api.getSubjectDetails(semId, subjId);
      setSubjectDetails(data);
      if (data.coordinatorId) {
        setCurrentCoordinatorId(data.coordinatorId);
      }
      if (data.coordinatorName) {
        setCurrentCoordinatorName(data.coordinatorName);
      }
    } catch (error) {
      console.error('Error loading subject details:', error);
      toast.error('Failed to load subject details');
    }
  };

  const handleSubjectClick = (subject) => {
    setSelectedSubject({ semesterId: subject.semesterId, subjectId: subject.subjectId });
    loadSubjectDetails(subject.semesterId, subject.subjectId);
  };

  const toggleChapter = (chapterId) => {
    setExpandedChapters(prev => ({
      ...prev,
      [chapterId]: !prev[chapterId]
    }));
  };

  const openModal = (type, content) => {
    setModalType(type);
    // Convert YouTube URLs to embed format for video content
    if (type === 'video') {
      setModalContent(convertToEmbedUrl(content));
    } else {
      setModalContent(content);
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalContent(null);
    setModalType(null);
  };

  const openInNewTab = (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const getDifficultyBadge = (difficulty) => {
    const colors = {
      easy: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
      'easy-medium': 'bg-lime-100 dark:bg-lime-900 text-lime-800 dark:text-lime-200',
      medium: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
      'medium-hard': 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200',
      hard: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[difficulty] || colors.medium}`}>
        {difficulty || 'Medium'}
      </span>
    );
  };

  // CRUD handlers
  const openCreateChapterModal = () => {
    setEditingChapter(null);
    setShowChapterModal(true);
  };

  const openEditChapterModal = (chapter) => {
    setEditingChapter(chapter);
    setShowChapterModal(true);
  };

  const openCreateTopicModal = (chapter) => {
    setSelectedChapter(chapter);
    setEditingTopic(null);
    setTopicImportanceLevel(3);
    setShowTopicModal(true);
  };

  const openEditTopicModal = (chapter, topic) => {
    setSelectedChapter(chapter);
    setEditingTopic(topic);
    setTopicImportanceLevel(topic.importanceLevel || 3);
    setShowTopicModal(true);
  };

  const handleCreateChapter = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const chapterName = formData.get('chapterName');
    const importanceLevel = parseInt(formData.get('importanceLevel'));

    try {
      await api.addChapter(subjectDetails.semesterId, subjectDetails.subjectId, chapterName, importanceLevel);
      toast.success('Chapter created successfully');
      setShowChapterModal(false);
      loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
    } catch (error) {
      console.error('Error creating chapter:', error);
      toast.error('Failed to create chapter');
    }
  };

  const handleUpdateChapter = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const chapterName = formData.get('chapterName');
    const importanceLevel = parseInt(formData.get('importanceLevel'));

    try {
      await api.updateChapter(subjectDetails.semesterId, subjectDetails.subjectId, editingChapter._id, { chapterName, importanceLevel });
      toast.success('Chapter updated successfully');
      setShowChapterModal(false);
      setEditingChapter(null);
      loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
    } catch (error) {
      console.error('Error updating chapter:', error);
      toast.error('Failed to update chapter');
    }
  };

  const handleDeleteChapter = async (chapterId) => {
    if (!confirm('Are you sure you want to delete this chapter? All topics will be deleted.')) {
      return;
    }

    try {
      await api.deleteChapter(subjectDetails.semesterId, subjectDetails.subjectId, chapterId);
      toast.success('Chapter deleted successfully');
      loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
    } catch (error) {
      console.error('Error deleting chapter:', error);
      toast.error('Failed to delete chapter');
    }
  };

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
      await api.addTopic(subjectDetails.semesterId, subjectDetails.subjectId, selectedChapter._id, formData);
      toast.success('Topic created successfully');
      setShowTopicModal(false);
      setSelectedChapter(null);
      loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
    } catch (error) {
      console.error('Error creating topic:', error);
      toast.error('Failed to create topic');
    }
  };

  const handleUpdateTopic = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    try {
      await api.updateTopic(subjectDetails.semesterId, subjectDetails.subjectId, selectedChapter._id, editingTopic._id, formData);
      toast.success('Topic updated successfully');
      setShowTopicModal(false);
      setEditingTopic(null);
      setSelectedChapter(null);
      loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
    } catch (error) {
      console.error('Error updating topic:', error);
      toast.error('Failed to update topic');
    }
  };

  const handleDeleteTopic = async (chapterId, topicId) => {
    if (!confirm('Are you sure you want to delete this topic?')) {
      return;
    }

    try {
      await api.deleteTopic(subjectDetails.semesterId, subjectDetails.subjectId, chapterId, topicId);
      toast.success('Topic deleted successfully');
      loadSubjectDetails(subjectDetails.semesterId, subjectDetails.subjectId);
    } catch (error) {
      console.error('Error deleting topic:', error);
      toast.error('Failed to delete topic');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-20 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 pt-16">
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Sidebar */}
        <motion.aside
          initial={false}
          animate={{ width: sidebarOpen ? 320 : 0 }}
          className="bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          <div className="h-full overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Subjects</h2>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                <X className="w-5 h-5 dark:text-white" />
              </button>
            </div>

            <div className="space-y-2">
              {allSubjects.map((subject) => {
                const isSelected = selectedSubject?.subjectId === subject.subjectId;

                return (
                  <button
                    key={subject.subjectId}
                    onClick={() => handleSubjectClick(subject)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      isSelected
                        ? 'bg-indigo-50 dark:bg-indigo-900 border-indigo-200 dark:border-indigo-600 border'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2">
                      <BookOpen className={`w-4 h-4 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'}`} />
                      <span className={`font-medium text-sm ${isSelected ? 'text-indigo-900 dark:text-white' : 'text-gray-700 dark:text-white'}`}>
                        {subject.subjectName}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="fixed left-4 top-20 z-10 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Menu className="w-5 h-5 dark:text-gray-300" />
            </button>
          )}

          {subjectDetails ? (
            <div className="max-w-5xl mx-auto p-3 sm:p-4 lg:p-6">
              {/* Header */}
              <div className="mb-4 sm:mb-6 lg:mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white">
                      {subjectDetails.subjectName}
                    </h1>
                    <button
                      onClick={() => navigate('/admin/learning')}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-white hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-gray-700 rounded-lg transition-colors self-start sm:self-auto"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>
                  </div>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-white">{subjectDetails.subjectDescription}</p>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-white mt-2">
                    Taught by <span className="font-medium dark:text-white">
                      {currentCoordinatorName || subjectDetails?.coordinatorName || initialCoordinatorName || 'Teacher'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAnalytics(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-lg hover:from-sky-600 hover:to-sky-700 transition-all shadow-md hover:shadow-lg text-sm font-medium"
                  >
                    <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Analytics</span>
                  </button>
                  <button
                    onClick={openCreateChapterModal}
                    className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm sm:text-base"
                  >
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span>Add Chapter</span>
                  </button>
                </div>
              </div>

              {/* Chapters */}
              <div className="space-y-4">
                {subjectDetails.chapters.map((chapter, chapterIdx) => (
                  <div key={chapter._id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                    {/* Chapter Header */}
                    <div className="flex items-center justify-between p-5">
                      <div
                        onClick={() => toggleChapter(chapter._id)}
                        className="flex items-center space-x-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex-1 -m-2 p-2 rounded"
                      >
                        <div className="flex items-center space-x-2">
                          {expandedChapters[chapter._id] ? (
                            <ChevronDown className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                          ) : (
                            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                          )}
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            Chapter {chapterIdx + 1}: {chapter.chapterName}
                          </h3>
                        </div>
                        <div className="flex items-center">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < (chapter.importanceLevel || 3)
                                  ? 'text-yellow-400 fill-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          {chapter.topics.length} {chapter.topics.length === 1 ? 'topic' : 'topics'}
                        </span>
                      </div>

                      {/* Admin Actions */}
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => openCreateTopicModal(chapter)}
                          className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900 rounded-lg transition-colors"
                          title="Add Topic"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => openEditChapterModal(chapter)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900 rounded-lg transition-colors"
                          title="Edit Chapter"
                        >
                          <Edit2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteChapter(chapter._id)}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded-lg transition-colors"
                          title="Delete Chapter"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* Topics Table */}
                    <AnimatePresence>
                      {expandedChapters[chapter._id] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-gray-100 dark:border-gray-700"
                        >
                          <div className="p-5 bg-white dark:bg-gray-900">
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300 mb-3">Topics</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full table-fixed">
                                <colgroup>
                                  <col style={{ width: '25%' }} />
                                  <col style={{ width: '12%' }} />
                                  <col style={{ width: '12%' }} />
                                  <col style={{ width: '11%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '8%' }} />
                                  <col style={{ width: '16%' }} />
                                </colgroup>
                                <thead>
                                  <tr className="border-b border-slate-200 dark:border-gray-700">
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Topic</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Problem Link</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Importance</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Difficulty</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Video</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Notes</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Questions</th>
                                    <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider">Actions</th>
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
                                            onClick={() => openModal('video', topic.topicVideoLink)}
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
                                            onClick={() => openModal('pdf', topic.notesPDF)}
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
                                            onClick={() => openModal('pdf', topic.questionPDF)}
                                            className="inline-flex items-center justify-center w-9 h-9 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
                                            title="View Questions"
                                          >
                                            <FileSpreadsheet className="w-5 h-5" />
                                          </button>
                                        ) : (
                                          <span className="text-slate-300 dark:text-gray-600">—</span>
                                        )}
                                      </td>

                                      {/* Actions */}
                                      <td className="py-3 px-4">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            onClick={() => openEditTopicModal(chapter, topic)}
                                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                                            title="Edit Topic"
                                          >
                                            <Edit2 className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteTopic(chapter._id, topic._id)}
                                            className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                                            title="Delete Topic"
                                          >
                                            <Trash2 className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <BookOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">Select a subject to view details</p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Content Modal (Video/Notes/PDF) */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
            onClick={closeModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[60vw] max-w-4xl h-auto max-h-[80vh] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {modalType === 'video' && 'Video'}
                  {modalType === 'notes' && 'Notes'}
                  {modalType === 'pdf' && 'Questions PDF'}
                </h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => openInNewTab(modalContent)}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title="Open in new tab"
                  >
                    <ExternalLink className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                  <button
                    onClick={closeModal}
                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-4">
                {modalType === 'video' && (
                  <iframe
                    src={modalContent}
                    className="w-full h-[500px] rounded-lg"
                    allowFullScreen
                    title="Video Player"
                  />
                )}
                {(modalType === 'notes' || modalType === 'pdf') && (
                  <iframe
                    src={modalContent}
                    className="w-full h-[500px] rounded-lg"
                    title="Document Viewer"
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chapter Modal */}
      <AnimatePresence>
        {showChapterModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => { setShowChapterModal(false); setEditingChapter(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md"
            >
              <form onSubmit={editingChapter ? handleUpdateChapter : handleCreateChapter}>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {editingChapter ? 'Edit Chapter' : 'Create New Chapter'}
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Chapter Name
                    </label>
                    <input
                      type="text"
                      name="chapterName"
                      required
                      defaultValue={editingChapter?.chapterName || ''}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., Introduction to Programming"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Importance Level (1-5 stars)
                    </label>
                    <select
                      name="importanceLevel"
                      required
                      defaultValue={editingChapter?.importanceLevel || 3}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="1">⭐ Low</option>
                      <option value="2">⭐⭐ Medium-Low</option>
                      <option value="3">⭐⭐⭐ Medium</option>
                      <option value="4">⭐⭐⭐⭐ High</option>
                      <option value="5">⭐⭐⭐⭐⭐ Very High</option>
                    </select>
                  </div>
                </div>
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => { setShowChapterModal(false); setEditingChapter(null); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    {editingChapter ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Topic Modal */}
      <AnimatePresence>
        {showTopicModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
            onClick={() => { setShowTopicModal(false); setEditingTopic(null); setSelectedChapter(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <form onSubmit={editingTopic ? handleUpdateTopic : handleCreateTopic}>
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                    {editingTopic ? 'Edit Topic' : 'Create New Topic'}
                  </h3>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Topic Name *
                    </label>
                    <input
                      type="text"
                      name="topicName"
                      required
                      defaultValue={editingTopic?.topicName || ''}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="e.g., Variables and Data Types"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Difficulty Level *
                    </label>
                    <select
                      name="difficultyLevel"
                      required
                      defaultValue={editingTopic?.difficultyLevel || 'medium'}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                    >
                      <option value="easy">Easy</option>
                      <option value="easy-medium">Easy-Medium</option>
                      <option value="medium">Medium</option>
                      <option value="medium-hard">Medium-Hard</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Video Link
                    </label>
                    <input
                      type="url"
                      name="topicVideoLink"
                      defaultValue={editingTopic?.topicVideoLink || ''}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="https://youtube.com/embed/..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Problem Link
                    </label>
                    <input
                      type="url"
                      name="problemLink"
                      defaultValue={editingTopic?.problemLink || ''}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                      placeholder="https://leetcode.com/problems/..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Importance Level
                    </label>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setTopicImportanceLevel(level)}
                          className="focus:outline-none"
                        >
                          <svg
                            className={`w-8 h-8 transition-colors ${
                              level <= topicImportanceLevel
                                ? 'text-yellow-400 fill-yellow-400'
                                : 'text-gray-300 dark:text-gray-600'
                            } hover:text-yellow-400 hover:fill-yellow-400`}
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                          </svg>
                        </button>
                      ))}
                      <input type="hidden" name="importanceLevel" value={topicImportanceLevel} />
                      <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                        ({topicImportanceLevel}/5)
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Notes PDF {editingTopic && '(Leave empty to keep existing)'}
                    </label>
                    <input
                      type="file"
                      name="notesPDF"
                      accept=".pdf"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                    {editingTopic?.notesPDF && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Current: <a href={editingTopic.notesPDF} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View PDF</a>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Question PDF {editingTopic && '(Leave empty to keep existing)'}
                    </label>
                    <input
                      type="file"
                      name="questionPDF"
                      accept=".pdf"
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 dark:bg-gray-700 dark:text-gray-100"
                    />
                    {editingTopic?.questionPDF && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Current: {editingTopic.questionPDF.split('/').pop()}
                      </p>
                    )}
                  </div>
                </div>
                <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => { setShowTopicModal(false); setEditingTopic(null); setSelectedChapter(null); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    {editingTopic ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Learning Analytics Modal */}
      <LearningAnalyticsModal
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        semesterId={subjectDetails?.semesterId}
        subjectId={subjectDetails?.subjectId}
        subjectName={subjectDetails?.subjectName}
      />
    </div>
  );
}
