import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { api } from '../utils/api';
import { useActivityLogger } from '../hooks/useActivityLogger';
import socketService from '../utils/socket';
import {
  BookOpen, Plus, ChevronDown, ChevronRight, Edit2, Trash2, Save, X,
  Star, Upload, Link as LinkIcon, FileType, GripVertical, Youtube, FileSpreadsheet
} from 'lucide-react';
import { useToast } from '../components/CustomToast';

const difficultyColors = {
  'easy': 'bg-green-100 text-green-800',
  'easy-medium': 'bg-lime-100 text-lime-800',
  'medium': 'bg-yellow-100 text-yellow-800',
  'medium-hard': 'bg-orange-100 text-orange-800',
  'hard': 'bg-red-100 text-red-800'
};

export default function SubjectManagement() {
  const toast = useToast();
  const { logCreate, logUpdate, logDelete, logReorder } = useActivityLogger();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedSubjects, setExpandedSubjects] = useState(new Set());
  const [expandedChapters, setExpandedChapters] = useState(new Set());
  const [editingSubject, setEditingSubject] = useState(null);
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [newSubject, setNewSubject] = useState({ subjectName: '', subjectDescription: '' });
  const [isSavingSubject, setIsSavingSubject] = useState(false);
  
  // Hard lock refs for subject creation
  const isSavingSubjectRef = useRef(false);
  const lastSaveSubjectTimeRef = useRef(0);
  const SAVE_COOLDOWN_MS = 3000;

  useEffect(() => {
    loadSubjects();
  }, []);

  // Socket.IO real-time synchronization
  useEffect(() => {
    socketService.connect();

    const handleLearningUpdate = (data) => {
      loadSubjects();
    };

    socketService.on('learning-updated', handleLearningUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
    };
  }, []);

  const loadSubjects = async () => {
    try {
      setLoading(true);
      const data = await api.listSubjects();
      setSubjects(data.subjects || []);
    } catch (err) {
      console.error('Failed to load subjects:', err);
      toast.error('Failed to load subjects');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubject = (subjectId) => {
    const newSet = new Set(expandedSubjects);
    if (newSet.has(subjectId)) {
      newSet.delete(subjectId);
    } else {
      newSet.add(subjectId);
    }
    setExpandedSubjects(newSet);
  };

  const toggleChapter = (chapterId) => {
    const newSet = new Set(expandedChapters);
    if (newSet.has(chapterId)) {
      newSet.delete(chapterId);
    } else {
      newSet.add(chapterId);
    }
    setExpandedChapters(newSet);
  };

  const handleAddSubject = async () => {
    if (!newSubject.subjectName.trim()) {
      toast.error('Subject name is required');
      return;
    }
    
    // HARD LOCK: Prevent duplicate submissions using ref
    if (isSavingSubjectRef.current) {
      return;
    }
    
    // COOLDOWN: Enforce minimum time between save attempts
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveSubjectTimeRef.current;
    if (timeSinceLastSave < SAVE_COOLDOWN_MS && lastSaveSubjectTimeRef.current > 0) {
      const remainingSeconds = Math.ceil((SAVE_COOLDOWN_MS - timeSinceLastSave) / 1000);
      toast.error(`Please wait ${remainingSeconds} seconds before saving again`);
      return;
    }
    
    // State-based check (secondary protection)
    if (isSavingSubject) {
      return;
    }
    
    // Check for duplicate subject name
    const duplicate = subjects.find(
      sub => sub.subjectName.toLowerCase() === newSubject.subjectName.trim().toLowerCase()
    );
    if (duplicate) {
      toast.error('A subject with this name already exists');
      return;
    }
    
    try {
      // Lock immediately
      isSavingSubjectRef.current = true;
      lastSaveSubjectTimeRef.current = now;
      setIsSavingSubject(true);
      
      
      await api.createSubject(newSubject.subjectName, newSubject.subjectDescription);
      toast.success('Subject added successfully');
      setNewSubject({ subjectName: '', subjectDescription: '' });
      setShowAddSubject(false);
      loadSubjects();
      
    } catch (err) {
      console.error('[Subject Save] Failed:', err);
      toast.error(err.message || 'Failed to add subject');
      
      // Only unlock on error
      isSavingSubjectRef.current = false;
      setIsSavingSubject(false);
    }
  };

  const handleDeleteSubject = async (subjectId) => {
    if (!confirm('Delete this subject and all its chapters/topics?')) return;
    try {
      await api.deleteSubject(subjectId);
      toast.success('Subject deleted');
      loadSubjects();
    } catch (err) {
      console.error('Failed to delete subject:', err);
      toast.error('Failed to delete subject');
    }
  };

  const handleUpdateSubject = async (subjectId) => {
    if (!editingSubject.subjectName.trim()) {
      toast.error('Subject name is required');
      return;
    }
    try {
      await api.updateSubject(subjectId, {
        subjectName: editingSubject.subjectName,
        subjectDescription: editingSubject.subjectDescription
      });
      toast.success('Subject updated');
      setEditingSubject(null);
      loadSubjects();
    } catch (err) {
      console.error('Failed to update subject:', err);
      toast.error('Failed to update subject');
    }
  };

  const handleReorderSubjects = async (newOrder) => {
    setSubjects(newOrder);
    try {
      const subjectIds = newOrder.map(s => s._id);
      await api.reorderSubjects(subjectIds);
    } catch (err) {
      console.error('Failed to reorder subjects:', err);
      toast.error('Failed to save new order');
      loadSubjects();
    }
  };

  const renderStars = (level) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${i < level ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    ));
  };

  const SubjectCard = ({ subject }) => {
    const isExpanded = expandedSubjects.has(subject._id);

    return (
      <motion.div
        layout
        className="bg-white dark:bg-gray-800 rounded-xl shadow-md border border-slate-200 dark:border-gray-700 overflow-hidden"
      >
        {/* Subject Header */}
        <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-b border-slate-200 dark:border-gray-700">
          <GripVertical className="w-5 h-5 text-slate-400 cursor-move flex-shrink-0" />
          {editingSubject && editingSubject._id === subject._id ? (
            <div className="flex-1 flex flex-col gap-2">
              <input
                type="text"
                placeholder="Subject name *"
                value={editingSubject.subjectName}
                onChange={(e) => setEditingSubject({ ...editingSubject, subjectName: e.target.value })}
                className="px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                autoFocus
              />
              <textarea
                placeholder="Description (optional)"
                value={editingSubject.subjectDescription || ''}
                onChange={(e) => setEditingSubject({ ...editingSubject, subjectDescription: e.target.value })}
                className="px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg placeholder:text-gray-400 dark:placeholder:text-gray-500"
                rows={2}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => handleUpdateSubject(subject)}
                  className="px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={() => setEditingSubject(null)}
                  className="px-4 py-2 bg-slate-300 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-slate-400 dark:hover:bg-gray-500 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => toggleSubject(subject._id)}
                className="flex-1 flex items-center gap-3 text-left"
              >
                {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                <BookOpen className="w-6 h-6 text-emerald-600" />
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-gray-100">{subject.subjectName}</h3>
                  {subject.subjectDescription && (
                    <p className="text-sm text-slate-600 dark:text-gray-400">{subject.subjectDescription}</p>
                  )}
                </div>
              </button>
              <button
                onClick={() => setEditingSubject({
                  _id: subject._id,
                  subjectName: subject.subjectName,
                  subjectDescription: subject.subjectDescription || ''
                })}
                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                <Edit2 className="w-5 h-5 text-blue-600" />
              </button>
              <button
                onClick={() => handleDeleteSubject(subject._id)}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5 text-red-600" />
              </button>
            </>
          )}
        </div>

        {/* Chapters */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="p-4"
            >
              <ChaptersList subject={subject} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  const ChaptersList = ({ subject }) => {
    const [showAddChapter, setShowAddChapter] = useState(false);
    const [newChapter, setNewChapter] = useState({ chapterName: '', importanceLevel: 3 });
    const [editingChapter, setEditingChapter] = useState(null);
    const [chapters, setChapters] = useState(subject.chapters || []);
    const [isSavingChapter, setIsSavingChapter] = useState(false);
    
    // Hard lock using useRef to prevent duplicate submissions instantly
    const isSavingRef = useRef(false);
    const lastSaveTimeRef = useRef(0);
    const SAVE_COOLDOWN_MS = 3000; // 3 second cooldown between saves

    useEffect(() => {
      setChapters(subject.chapters || []);
    }, [subject.chapters]);

    const handleAddChapter = async () => {
      // Validation: chapter name required
      if (!newChapter.chapterName.trim()) {
        toast.error('Chapter name is required');
        return;
      }
      
      // HARD LOCK: Prevent duplicate submissions using ref (blocks instantly)
      if (isSavingRef.current) {
        return;
      }
      
      // COOLDOWN: Enforce minimum time between save attempts
      const now = Date.now();
      const timeSinceLastSave = now - lastSaveTimeRef.current;
      if (timeSinceLastSave < SAVE_COOLDOWN_MS && lastSaveTimeRef.current > 0) {
        const remainingSeconds = Math.ceil((SAVE_COOLDOWN_MS - timeSinceLastSave) / 1000);
        toast.error(`Please wait ${remainingSeconds} seconds before saving again`);
        return;
      }
      
      // State-based check (secondary protection)
      if (isSavingChapter) {
        return;
      }
      
      // Check for duplicate chapter name in current chapters
      const duplicate = chapters.find(
        ch => ch.chapterName.toLowerCase() === newChapter.chapterName.trim().toLowerCase()
      );
      if (duplicate) {
        toast.error('A chapter with this name already exists in this subject');
        return;
      }
      
      try {
        // Lock immediately using ref (instant blocking)
        isSavingRef.current = true;
        lastSaveTimeRef.current = now;
        setIsSavingChapter(true);
        
        
        await api.addChapter(subject._id, newChapter.chapterName, newChapter.importanceLevel);
        toast.success('Chapter added');
        
        // Log activity
        logCreate('CHAPTER', null, `Added chapter: ${newChapter.chapterName}`, {
          subjectName: subject.subjectName,
          importanceLevel: newChapter.importanceLevel
        });
        
        // Reset form and close
        setNewChapter({ chapterName: '', importanceLevel: 3 });
        setShowAddChapter(false);
        loadSubjects();
        
        // Keep lock active (success - don't allow re-save of same data)
      } catch (err) {
        console.error('[Chapter Save] Failed:', err);
        toast.error(err.message || 'Failed to add chapter');
        
        // Only unlock on error so user can retry
        isSavingRef.current = false;
        setIsSavingChapter(false);
      }
    };

    const handleUpdateChapter = async (chapterId) => {
      if (!editingChapter.chapterName.trim()) {
        toast.error('Chapter name is required');
        return;
      }
      try {
        await api.updateChapter(subject._id, chapterId, {
          chapterName: editingChapter.chapterName,
          importanceLevel: editingChapter.importanceLevel
        });
        toast.success('Chapter updated');
        setEditingChapter(null);
        loadSubjects();
      } catch (err) {
        console.error('Failed to update chapter:', err);
        toast.error('Failed to update chapter');
      }
    };

    const handleDeleteChapter = async (chapterId) => {
      if (!confirm('Delete this chapter and all its topics?')) return;
      try {
        await api.deleteChapter(subject._id, chapterId);
        toast.success('Chapter deleted');
        loadSubjects();
      } catch (err) {
        console.error('Failed to delete chapter:', err);
        toast.error('Failed to delete chapter');
      }
    };

    const handleReorderChapters = async (newOrder) => {
      setChapters(newOrder);
      try {
        const chapterIds = newOrder.map(c => c._id);
        await api.reorderChapters(subject._id, chapterIds);
      } catch (err) {
        console.error('Failed to reorder chapters:', err);
        toast.error('Failed to save chapter order');
        loadSubjects();
      }
    };

    return (
      <div className="space-y-3">
        <Reorder.Group axis="y" values={chapters} onReorder={handleReorderChapters} className="space-y-3">
          {chapters.map((chapter) => (
            <Reorder.Item key={chapter._id} value={chapter}>
              <div className="border border-slate-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-gray-700">
                  <GripVertical className="w-4 h-4 text-slate-400 cursor-move flex-shrink-0" />
                  {editingChapter && editingChapter._id === chapter._id ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editingChapter.chapterName}
                        onChange={(e) => setEditingChapter({ ...editingChapter, chapterName: e.target.value })}
                        className="flex-1 px-2 py-1 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-900 dark:text-gray-100 rounded text-sm"
                        autoFocus
                      />
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((level) => (
                          <button
                            key={level}
                            onClick={() => setEditingChapter({ ...editingChapter, importanceLevel: level })}
                            className="p-0.5"
                          >
                            <Star
                              className={`w-4 h-4 ${
                                level <= editingChapter.importanceLevel
                                  ? 'fill-yellow-400 text-yellow-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleUpdateChapter(chapter._id)}
                        className="p-1.5 bg-emerald-600 dark:bg-emerald-700 text-white rounded hover:bg-emerald-700 dark:hover:bg-emerald-800"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingChapter(null)}
                        className="p-1.5 bg-slate-300 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded hover:bg-slate-400 dark:hover:bg-gray-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => toggleChapter(chapter._id)}
                        className="flex-1 flex items-center gap-3 text-left"
                      >
                        {expandedChapters.has(chapter._id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <div className="flex-1">
                          <h4 className="font-semibold text-slate-800 dark:text-gray-100">{chapter.chapterName}</h4>
                          <div className="flex items-center gap-1 mt-1">
                            {renderStars(chapter.importanceLevel)}
                          </div>
                        </div>
                      </button>
                      <button
                        onClick={() => setEditingChapter({ _id: chapter._id, chapterName: chapter.chapterName, importanceLevel: chapter.importanceLevel })}
                        className="p-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteChapter(chapter._id)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-600" />
                      </button>
                    </>
                  )}
                </div>

                <AnimatePresence>
                  {expandedChapters.has(chapter._id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="p-3 bg-white dark:bg-gray-800"
                    >
                      <TopicsList subject={subject} chapter={chapter} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>

        {/* Add Chapter Button */}
        {showAddChapter ? (
          <div className="border border-emerald-300 dark:border-emerald-800 rounded-lg p-3 bg-emerald-50 dark:bg-emerald-900/20">
            <input
              type="text"
              placeholder="Chapter name"
              value={newChapter.chapterName}
              onChange={(e) => setNewChapter({ ...newChapter, chapterName: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg mb-2 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-medium text-slate-700 dark:text-gray-300">Importance:</span>
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  onClick={() => setNewChapter({ ...newChapter, importanceLevel: level })}
                  className="p-1"
                >
                  <Star
                    className={`w-5 h-5 ${
                      level <= newChapter.importanceLevel
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddChapter}
                disabled={isSavingChapter}
                className="flex-1 px-3 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingChapter ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Add Chapter'
                )}
              </button>
              <button
                onClick={() => setShowAddChapter(false)}
                disabled={isSavingChapter}
                className="px-3 py-2 bg-slate-300 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-slate-400 dark:hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddChapter(true)}
            className="w-full px-3 py-2 border-2 border-dashed border-emerald-300 dark:border-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Chapter
          </button>
        )}
      </div>
    );
  };

  const TopicsList = ({ subject, chapter }) => {
    const [showAddTopic, setShowAddTopic] = useState(false);
    const [editingTopic, setEditingTopic] = useState(null);
    const [topics, setTopics] = useState(chapter.topics || []);
    const [isSavingTopic, setIsSavingTopic] = useState(false);
    const [newTopic, setNewTopic] = useState({
      topicName: '',
      problemLink: '',
      importanceLevel: 3,
      topicVideoLink: '',
      notesPDF: null,
      difficultyLevel: 'medium',
      questionPDF: null
    });
    
    // Hard lock refs for topic creation
    const isSavingTopicRef = useRef(false);
    const lastSaveTopicTimeRef = useRef(0);
    const TOPIC_COOLDOWN_MS = 3000;

    useEffect(() => {
      setTopics(chapter.topics || []);
    }, [chapter.topics]);

    const handleAddTopic = async () => {
      if (!newTopic.topicName.trim()) {
        toast.error('Topic name is required');
        return;
      }
      
      // HARD LOCK: Prevent duplicate submissions using ref
      if (isSavingTopicRef.current) {
        return;
      }
      
      // COOLDOWN: Enforce minimum time between save attempts
      const now = Date.now();
      const timeSinceLastSave = now - lastSaveTopicTimeRef.current;
      if (timeSinceLastSave < TOPIC_COOLDOWN_MS && lastSaveTopicTimeRef.current > 0) {
        const remainingSeconds = Math.ceil((TOPIC_COOLDOWN_MS - timeSinceLastSave) / 1000);
        toast.error(`Please wait ${remainingSeconds} seconds before saving again`);
        return;
      }
      
      // State-based check (secondary protection)
      if (isSavingTopic) {
        return;
      }
      
      // Check for duplicate topic name
      const duplicate = topics.find(
        tp => tp.topicName.toLowerCase() === newTopic.topicName.trim().toLowerCase()
      );
      if (duplicate) {
        toast.error('A topic with this name already exists in this chapter');
        return;
      }
      
      try {
        // Lock immediately
        isSavingTopicRef.current = true;
        lastSaveTopicTimeRef.current = now;
        setIsSavingTopic(true);
        
        
        const formData = new FormData();
        formData.append('topicName', newTopic.topicName);
        formData.append('problemLink', newTopic.problemLink || '');
        formData.append('importanceLevel', newTopic.importanceLevel || 3);
        formData.append('difficultyLevel', newTopic.difficultyLevel);
        if (newTopic.topicVideoLink) formData.append('topicVideoLink', newTopic.topicVideoLink);
        if (newTopic.notesPDF) formData.append('notesPDF', newTopic.notesPDF);
        if (newTopic.questionPDF) formData.append('questionPDF', newTopic.questionPDF);

        await api.addTopic(subject.semesterId, subject._id, chapter._id, formData);
        toast.success('Topic added');
        
        // Log activity
        logCreate('TOPIC', null, `Added topic: ${newTopic.topicName}`, {
          subjectName: subject.subjectName,
          chapterName: chapter.chapterName,
          difficultyLevel: newTopic.difficultyLevel,
          hasVideo: !!newTopic.topicVideoLink,
          hasNotes: !!newTopic.notesLink,
          hasPDF: !!newTopic.questionPDF
        });
        
        setNewTopic({
          topicName: '',
          problemLink: '',
          importanceLevel: 3,
          topicVideoLink: '',
          notesPDF: null,
          difficultyLevel: 'medium',
          questionPDF: null
        });
        setShowAddTopic(false);
        loadSubjects();
        
      } catch (err) {
        console.error('[Topic Save] Failed:', err);
        toast.error('Failed to add topic');
        
        // Only unlock on error
        isSavingTopicRef.current = false;
        setIsSavingTopic(false);
      }
    };

    const handleUpdateTopic = async (topicId) => {
      if (!editingTopic.topicName.trim()) {
        toast.error('Topic name is required');
        return;
      }
      try {
        const formData = new FormData();
        formData.append('topicName', editingTopic.topicName);
        formData.append('problemLink', editingTopic.problemLink || '');
        formData.append('importanceLevel', editingTopic.importanceLevel || 3);
        formData.append('difficultyLevel', editingTopic.difficultyLevel);
        if (editingTopic.topicVideoLink) formData.append('topicVideoLink', editingTopic.topicVideoLink);
        if (editingTopic.notesPDF) formData.append('notesPDF', editingTopic.notesPDF);
        if (editingTopic.questionPDF) formData.append('questionPDF', editingTopic.questionPDF);

        await api.updateTopic(subject.semesterId, subject._id, chapter._id, topicId, formData);
        toast.success('Topic updated');
        setEditingTopic(null);
        loadSubjects();
      } catch (err) {
        console.error('Failed to update topic:', err);
        toast.error('Failed to update topic');
      }
    };

    const handleDeleteTopic = async (topicId) => {
      if (!confirm('Delete this topic?')) return;
      try {
        await api.deleteTopic(subject.semesterId, subject._id, chapter._id, topicId);
        toast.success('Topic deleted');
        loadSubjects();
      } catch (err) {
        console.error('Failed to delete topic:', err);
        toast.error('Failed to delete topic');
      }
    };

    const handleReorderTopics = async (newOrder) => {
      setTopics(newOrder);
      try {
        const topicIds = newOrder.map(t => t._id);
        await api.reorderTopics(subject.semesterId, subject._id, chapter._id, topicIds);
      } catch (err) {
        console.error('Failed to reorder topics:', err);
        toast.error('Failed to save topic order');
        loadSubjects();
      }
    };

    return (
      <div className="space-y-3">
        {/* Edit Form (when editing a topic) */}
        {editingTopic && (
          <div className="border border-blue-300 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Topic Name *</label>
                  <input
                    type="text"
                    placeholder="Enter topic name"
                    value={editingTopic.topicName}
                    onChange={(e) => setEditingTopic({ ...editingTopic, topicName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Problem Link (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://leetcode.com/problems/..."
                    value={editingTopic.problemLink || ''}
                    onChange={(e) => setEditingTopic({ ...editingTopic, problemLink: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Importance (1-5 stars)</label>
                    <div className="flex items-center gap-1 mt-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setEditingTopic({ ...editingTopic, importanceLevel: star })}
                          className="p-1 hover:scale-110 transition-transform"
                        >
                          <Star
                            className={`w-6 h-6 ${
                              star <= (editingTopic.importanceLevel || 3)
                                ? 'text-yellow-500 fill-yellow-500'
                                : 'text-slate-300 dark:text-gray-600'
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Difficulty Level</label>
                    <select
                      value={editingTopic.difficultyLevel}
                      onChange={(e) => setEditingTopic({ ...editingTopic, difficultyLevel: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm"
                    >
                      <option value="easy">Easy</option>
                      <option value="easy-medium">Easy-Medium</option>
                      <option value="medium">Medium</option>
                      <option value="medium-hard">Medium-Hard</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Video Link (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://example.com/video"
                    value={editingTopic.topicVideoLink || ''}
                    onChange={(e) => setEditingTopic({ ...editingTopic, topicVideoLink: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Notes PDF (Optional)</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const maxSize = 1 * 1024 * 1024; // 1MB in bytes
                        if (file.size > maxSize) {
                          toast.error('File size must be less than 1MB');
                          e.target.value = '';
                          return;
                        }
                      }
                      setEditingTopic({ ...editingTopic, notesPDF: file });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm"
                  />
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Maximum file size: 1MB</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Question PDF (Optional)</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const maxSize = 1 * 1024 * 1024; // 1MB in bytes
                        if (file.size > maxSize) {
                          toast.error('File size must be less than 1MB');
                          e.target.value = '';
                          return;
                        }
                      }
                      setEditingTopic({ ...editingTopic, questionPDF: file });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm"
                  />
                  <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Maximum file size: 1MB</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleUpdateTopic(editingTopic._id)}
                className="flex-1 px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors text-sm flex items-center justify-center gap-1"
              >
                <Save className="w-4 h-4" />
                Update
              </button>
              <button
                onClick={() => setEditingTopic(null)}
                className="px-3 py-2 bg-slate-300 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-slate-400 dark:hover:bg-gray-500 transition-colors text-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Topics Table */}
        <h4 className="text-sm font-semibold text-slate-700 dark:text-gray-300">Topics</h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-gray-700">
                <th className="text-left py-3 px-4 text-xs font-semibold text-slate-600 dark:text-gray-400 uppercase tracking-wider w-10"></th>
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
              <Reorder.Group axis="y" values={topics} onReorder={handleReorderTopics} as="tbody" className="bg-white dark:bg-gray-900">
                {topics.map((topic, idx) => (
                  <Reorder.Item key={topic._id} value={topic} as="tr" className={`border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-gray-800/50 transition-colors ${idx === topics.length - 1 ? 'border-b-0' : ''}`}>
                    {/* Drag Handle */}
                    <td className="py-3 px-4">
                      <GripVertical className="w-4 h-4 text-slate-400 cursor-move" />
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
                          onClick={(e) => e.stopPropagation()}
                        >
                          Solve
                          <LinkIcon className="w-3.5 h-3.5" />
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
                      <span className={`text-xs px-2 py-1 rounded ${difficultyColors[topic.difficultyLevel]}`}>
                        {topic.difficultyLevel}
                      </span>
                    </td>

                    {/* Video */}
                    <td className="py-3 px-4 text-center">
                      {topic.topicVideoLink ? (
                        <a
                          href={topic.topicVideoLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-9 h-9 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors shadow-sm"
                          title="Watch Video"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Youtube className="w-5 h-5" />
                        </a>
                      ) : (
                        <span className="text-slate-300 dark:text-gray-600">—</span>
                      )}
                    </td>

                    {/* Notes */}
                    <td className="py-3 px-4 text-center">
                      {topic.notesLink ? (
                        <a
                          href={topic.notesLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center w-9 h-9 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm"
                          title="View Notes"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileType className="w-5 h-5" />
                        </a>
                      ) : (
                        <span className="text-slate-300 dark:text-gray-600">—</span>
                      )}
                    </td>

                    {/* Questions PDF */}
                    <td className="py-3 px-4 text-center">
                      {topic.questionPDF ? (
                        <span className="inline-flex items-center justify-center w-9 h-9 bg-green-600 text-white rounded-lg shadow-sm" title="PDF Available">
                          <FileSpreadsheet className="w-5 h-5" />
                        </span>
                      ) : (
                        <span className="text-slate-300 dark:text-gray-600">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditingTopic({
                            _id: topic._id,
                            topicName: topic.topicName,
                            problemLink: topic.problemLink || '',
                            importanceLevel: topic.importanceLevel || 3,
                            topicVideoLink: topic.topicVideoLink || '',
                            notesPDF: null,
                            difficultyLevel: topic.difficultyLevel,
                            questionPDF: null
                          })}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/50 rounded-lg transition-colors"
                          title="Edit Topic"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTopic(topic._id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/50 rounded-lg transition-colors"
                          title="Delete Topic"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </Reorder.Item>
                ))}
              </Reorder.Group>
            </tbody>
          </table>
        </div>

        {/* Add Topic Form */}
        {showAddTopic ? (
          <div className="border border-blue-300 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20 space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Topic Name *</label>
              <input
                type="text"
                placeholder="Enter topic name"
                value={newTopic.topicName}
                onChange={(e) => setNewTopic({ ...newTopic, topicName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Problem Link (Optional)</label>
              <input
                type="url"
                placeholder="https://leetcode.com/problems/..."
                value={newTopic.problemLink}
                onChange={(e) => setNewTopic({ ...newTopic, problemLink: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Importance (1-5 stars)</label>
                <div className="flex items-center gap-1 mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setNewTopic({ ...newTopic, importanceLevel: star })}
                      className="p-1 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= newTopic.importanceLevel
                            ? 'text-yellow-500 fill-yellow-500'
                            : 'text-slate-300 dark:text-gray-600'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Difficulty Level</label>
                <select
                  value={newTopic.difficultyLevel}
                  onChange={(e) => setNewTopic({ ...newTopic, difficultyLevel: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm"
                >
                  <option value="easy">Easy</option>
                  <option value="easy-medium">Easy-Medium</option>
                  <option value="medium">Medium</option>
                  <option value="medium-hard">Medium-Hard</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Video Link (Optional)</label>
              <input
                type="url"
                placeholder="https://example.com/video"
                value={newTopic.topicVideoLink}
                onChange={(e) => setNewTopic({ ...newTopic, topicVideoLink: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Notes PDF (Optional)</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const maxSize = 1 * 1024 * 1024; // 1MB in bytes
                    if (file.size > maxSize) {
                      toast.error('File size must be less than 1MB');
                      e.target.value = '';
                      return;
                    }
                  }
                  setNewTopic({ ...newTopic, notesPDF: file });
                }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Maximum file size: 1MB</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Question PDF (Optional)</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const maxSize = 1 * 1024 * 1024; // 1MB in bytes
                    if (file.size > maxSize) {
                      toast.error('File size must be less than 1MB');
                      e.target.value = '';
                      return;
                    }
                  }
                  setNewTopic({ ...newTopic, questionPDF: file });
                }}
                className="w-full px-3 py-2 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg text-sm"
              />
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1">Maximum file size: 1MB</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddTopic}
                disabled={isSavingTopic}
                className="flex-1 px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingTopic ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Add Topic'
                )}
              </button>
              <button
                onClick={() => setShowAddTopic(false)}
                disabled={isSavingTopic}
                className="px-3 py-2 bg-slate-300 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-slate-400 dark:hover:bg-gray-500 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddTopic(true)}
            className="w-full px-2 py-1 border-2 border-dashed border-blue-300 dark:border-blue-800 rounded text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-1 text-sm"
          >
            <Plus className="w-3 h-3" />
            Add Topic
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-white dark:bg-gray-900">
      <div className="max-w-6xl mx-auto mt-16">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-gray-100">Subject Management</h1>
            <p className="text-slate-600 dark:text-gray-400 mt-1">Organize subjects, chapters, and topics</p>
          </div>
          <button
            onClick={() => setShowAddSubject(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Subject
          </button>
        </div>

        {/* Add Subject Form */}
        {showAddSubject && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-emerald-200 dark:border-emerald-800 p-6 mb-6"
          >
            <h2 className="text-xl font-bold text-slate-800 dark:text-gray-100 mb-4">New Subject</h2>
            <input
              type="text"
              placeholder="Subject name *"
              value={newSubject.subjectName}
              onChange={(e) => setNewSubject({ ...newSubject, subjectName: e.target.value })}
              className="w-full px-4 py-3 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg mb-3 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <textarea
              placeholder="Description (optional)"
              value={newSubject.subjectDescription}
              onChange={(e) => setNewSubject({ ...newSubject, subjectDescription: e.target.value })}
              className="w-full px-4 py-3 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 rounded-lg mb-4 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={handleAddSubject}
                disabled={isSavingSubject}
                className="flex-1 px-4 py-3 bg-emerald-600 dark:bg-emerald-700 text-white rounded-lg hover:bg-emerald-700 dark:hover:bg-emerald-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingSubject ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Subject'
                )}
              </button>
              <button
                onClick={() => {
                  setShowAddSubject(false);
                  setNewSubject({ subjectName: '', subjectDescription: '' });
                }}
                disabled={isSavingSubject}
                className="px-4 py-3 bg-slate-300 dark:bg-gray-600 text-slate-700 dark:text-gray-200 rounded-lg hover:bg-slate-400 dark:hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}

        {/* Subjects List with Drag and Drop */}
        {subjects.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-slate-200 dark:border-gray-700">
            <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 dark:text-gray-400 text-lg">No subjects yet. Add your first subject to get started!</p>
          </div>
        ) : (
          <Reorder.Group axis="y" values={subjects} onReorder={handleReorderSubjects} className="space-y-4">
            {subjects.map((subject) => (
              <Reorder.Item key={subject._id} value={subject}>
                <SubjectCard subject={subject} />
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  );
}
