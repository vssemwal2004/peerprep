import Semester from '../models/Subject.js';
import Progress from '../models/Progress.js';
import { HttpError } from '../utils/errors.js';
import { supabase } from '../utils/supabase.js';
import { io } from '../server.js';
import { logActivity } from './adminActivityController.js';

// Get all semesters for a coordinator
export async function listSemesters(req, res) {
  try {
    const ownerFilter = req.user.role === 'coordinator'
      ? {
          $or: [
            { coordinatorId: req.user.coordinatorId },
            // Legacy fallback: some old records may have stored the user's ObjectId as coordinatorId
            { coordinatorId: (req.user._id?.toString?.() || '') }
          ]
        }
      : {};
    const semesters = await Semester.find(ownerFilter).sort({ order: 1 }).lean();
    res.json({ count: semesters.length, semesters });
  } catch (err) {
    console.error('Error listing semesters:', err);
    res.status(500).json({ error: 'Failed to fetch semesters' });
  }
}

// Create a new semester
export async function createSemester(req, res) {
  try {
    const { semesterName, semesterDescription } = req.body;
    if (!semesterName) throw new HttpError(400, 'Semester name is required');
    // Coordinators create under their coordinatorId string; admins must specify coordinatorId
    const coordinatorId = req.user.role === 'coordinator' ? req.user.coordinatorId : (req.body.coordinatorId || null);
    if (!coordinatorId) throw new HttpError(400, 'coordinatorId is required');
    
    // Check for duplicate semester name (case-insensitive)
    const existingSemester = await Semester.findOne({ 
      coordinatorId,
      semesterName: { $regex: new RegExp(`^${semesterName.trim()}$`, 'i') }
    });
    if (existingSemester) {
      console.log(`Semester "${semesterName}" already exists for coordinator ${coordinatorId}`);
      return res.status(200).json(existingSemester); // Return existing instead of error
    }
    
    // Get max order for this coordinator
    const maxSemester = await Semester.findOne({ coordinatorId }).sort({ order: -1 }).select('order').lean();
    const order = maxSemester ? maxSemester.order + 1 : 0;
    
    const semester = await Semester.create({
      semesterName,
      semesterDescription,
      coordinatorId,
      order,
      subjects: []
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'semester-created', data: semester });
    
    res.status(201).json(semester);
  } catch (err) {
    console.error('Error creating semester:', err);
    if (err instanceof HttpError) throw err;
    
    // Handle duplicate key error (E11000)
    if (err.code === 11000 || err.name === 'MongoServerError') {
      console.log(`Duplicate semester detected: "${semesterName}" for coordinator ${coordinatorId}`);
      // Return the existing semester instead of error
      const existing = await Semester.findOne({ coordinatorId, semesterName: { $regex: new RegExp(`^${semesterName.trim()}$`, 'i') } });
      if (existing) {
        return res.status(200).json(existing);
      }
    }
    
    res.status(500).json({ error: err.message || 'Failed to create semester' });
  }
}

// Update semester details
export async function updateSemester(req, res) {
  try {
    const { id } = req.params;
    const { semesterName, semesterDescription } = req.body;
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: id, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    if (semesterName !== undefined) semester.semesterName = semesterName;
    if (semesterDescription !== undefined) semester.semesterDescription = semesterDescription;
    
    await semester.save();
    
    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'SEMESTER',
      targetId: semester._id.toString(),
      description: `Updated semester: ${semester.semesterName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'semester-updated', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error updating semester:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to update semester' });
  }
}

// Delete a semester
export async function deleteSemester(req, res) {
  try {
    const { id } = req.params;
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    
    console.log('Deleting semester:', { id, role: req.user.role, ownerFilter });
    
    // First check if semester exists at all
    const semesterExists = await Semester.findById(id).lean();
    if (semesterExists) {
      console.log('Semester exists with coordinatorId:', semesterExists.coordinatorId);
    } else {
      console.log('Semester does not exist in database');
    }
    
    const semester = await Semester.findOneAndDelete({ _id: id, ...ownerFilter });
    
    if (!semester) {
      console.log('Semester not found with filter:', { _id: id, ...ownerFilter });
      throw new HttpError(404, 'Semester not found or you do not have permission to delete it');
    }

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'DELETE',
      targetType: 'SEMESTER',
      targetId: id,
      description: `Deleted semester: ${semester.semesterName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'semester-deleted', data: { id } });
    
    res.json({ message: 'Semester deleted successfully' });
  } catch (err) {
    console.error('Error deleting semester:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to delete semester' });
  }
}

// Reorder semesters
export async function reorderSemesters(req, res) {
  try {
    const { semesterIds } = req.body;
    if (!Array.isArray(semesterIds)) throw new HttpError(400, 'semesterIds must be an array');
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const updates = semesterIds.map((id, index) => 
      Semester.updateOne({ _id: id, ...ownerFilter }, { order: index })
    );
    
    await Promise.all(updates);
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'semesters-reordered', data: { semesterIds } });
    
    res.json({ message: 'Semesters reordered successfully' });
  } catch (err) {
    console.error('Error reordering semesters:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to reorder semesters' });
  }
}

// Add a subject to a semester
export async function addSubject(req, res) {
  try {
    const { semesterId } = req.params;
    const { subjectName, subjectDescription } = req.body;
    
    if (!subjectName) throw new HttpError(400, 'Subject name is required');
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    // DUPLICATE CHECK: Prevent duplicate subject names (case-insensitive)
    const normalizedName = subjectName.toLowerCase().trim();
    const duplicate = semester.subjects.find(s => 
      s.subjectName.toLowerCase().trim() === normalizedName
    );
    
    if (duplicate) {
      console.log('[Add Subject] Blocked duplicate:', { 
        semesterId, 
        subjectName, 
        existingSubjectId: duplicate._id 
      });
      throw new HttpError(409, 'A subject with this name already exists in this semester');
    }
    
    console.log('[Add Subject] Creating new subject:', { 
      semesterId, 
      subjectName 
    });
    
    const order = semester.subjects.length;
    semester.subjects.push({
      subjectName,
      subjectDescription,
      chapters: [],
      order
    });
    
    await semester.save();
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'subject-created', data: semester });
    
    res.status(201).json(semester);
  } catch (err) {
    console.error('Error adding subject:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to add subject' });
  }
}

// Update a subject
export async function updateSubject(req, res) {
  try {
    const { semesterId, subjectId } = req.params;
    const { subjectName, subjectDescription } = req.body;
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    if (subjectName !== undefined) subject.subjectName = subjectName;
    if (subjectDescription !== undefined) subject.subjectDescription = subjectDescription;
    
    await semester.save();
    
    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'SUBJECT',
      targetId: subject._id.toString(),
      description: `Updated subject: ${subject.subjectName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'subject-updated', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error updating subject:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to update subject' });
  }
}

// Delete a subject
export async function deleteSubject(req, res) {
  try {
    const { semesterId, subjectId } = req.params;
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');

    const subject = semester.subjects.id(subjectId);
    const subjectName = subject ? subject.subjectName : subjectId;
    
    semester.subjects.pull(subjectId);
    await semester.save();

    // Clean up all Progress records for this subject
    const deleteResult = await Progress.deleteMany({ subjectId });
    console.log(`Deleted ${deleteResult.deletedCount} progress records for subject ${subjectId}`);

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'DELETE',
      targetType: 'SUBJECT',
      targetId: subjectId,
      description: `Deleted subject: ${subjectName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'subject-deleted', data: semester });
    
    res.json({ message: 'Subject deleted successfully', semester });
  } catch (err) {
    console.error('Error deleting subject:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to delete subject' });
  }
}

// Reorder subjects within a semester
export async function reorderSubjects(req, res) {
  try {
    const { semesterId } = req.params;
    const { subjectIds } = req.body;
    
    if (!Array.isArray(subjectIds)) throw new HttpError(400, 'subjectIds must be an array');
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    subjectIds.forEach((id, index) => {
      const subject = semester.subjects.id(id);
      if (subject) subject.order = index;
    });
    
    semester.subjects.sort((a, b) => a.order - b.order);
    await semester.save();
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'subjects-reordered', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error reordering subjects:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to reorder subjects' });
  }
}

// Add a chapter to a subject
export async function addChapter(req, res) {
  try {
    const { semesterId, subjectId } = req.params;
    const { chapterName, importanceLevel } = req.body;
    
    if (!chapterName) throw new HttpError(400, 'Chapter name is required');
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    // DUPLICATE CHECK: Prevent duplicate chapter names in the same subject
    const normalizedChapterName = chapterName.trim().toLowerCase();
    const existingChapter = subject.chapters.find(
      ch => ch.chapterName.trim().toLowerCase() === normalizedChapterName
    );
    
    if (existingChapter) {
      console.log('[Add Chapter] Blocked duplicate:', { 
        subjectId, 
        chapterName, 
        existingChapterId: existingChapter._id 
      });
      throw new HttpError(409, 'A chapter with this name already exists in this subject');
    }
    
    console.log('[Add Chapter] Creating new chapter:', { 
      subjectId, 
      chapterName, 
      importanceLevel 
    });
    
    const order = subject.chapters.length;
    subject.chapters.push({
      chapterName,
      importanceLevel: importanceLevel || 3,
      topics: [],
      order
    });
    
    await semester.save();
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'chapter-created', data: semester });
    
    res.status(201).json(semester);
  } catch (err) {
    console.error('Error adding chapter:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to add chapter' });
  }
}

// Update a chapter
export async function updateChapter(req, res) {
  try {
    const { semesterId, subjectId, chapterId } = req.params;
    const { chapterName, importanceLevel } = req.body;
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    const chapter = subject.chapters.id(chapterId);
    if (!chapter) throw new HttpError(404, 'Chapter not found');
    
    if (chapterName !== undefined) chapter.chapterName = chapterName;
    if (importanceLevel !== undefined) chapter.importanceLevel = importanceLevel;
    
    await semester.save();
    
    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'CHAPTER',
      targetId: chapter._id.toString(),
      description: `Updated chapter: ${chapter.chapterName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'chapter-updated', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error updating chapter:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to update chapter' });
  }
}

// Delete a chapter
export async function deleteChapter(req, res) {
  try {
    const { semesterId, subjectId, chapterId } = req.params;
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');

    const chapter = subject.chapters.id(chapterId);
    const chapterName = chapter ? chapter.chapterName : chapterId;
    
    subject.chapters.pull(chapterId);
    await semester.save();

    // Clean up all Progress records for topics in this chapter
    const deleteResult = await Progress.deleteMany({ chapterId });
    console.log(`Deleted ${deleteResult.deletedCount} progress records for chapter ${chapterId}`);

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'DELETE',
      targetType: 'CHAPTER',
      targetId: chapterId,
      description: `Deleted chapter: ${chapterName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'chapter-deleted', data: semester });
    
    res.json({ message: 'Chapter deleted successfully', semester });
  } catch (err) {
    console.error('Error deleting chapter:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
}

// Reorder chapters within a subject
export async function reorderChapters(req, res) {
  try {
    const { semesterId, subjectId } = req.params;
    const { chapterIds } = req.body;
    
    if (!Array.isArray(chapterIds)) throw new HttpError(400, 'chapterIds must be an array');
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    chapterIds.forEach((id, index) => {
      const chapter = subject.chapters.id(id);
      if (chapter) chapter.order = index;
    });
    
    subject.chapters.sort((a, b) => a.order - b.order);
    await semester.save();
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'chapters-reordered', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error reordering chapters:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to reorder chapters' });
  }
}

// Add a topic to a chapter
export async function addTopic(req, res) {
  try {
    console.log('[addTopic] Request params:', req.params);
    console.log('[addTopic] Request body:', req.body);
    console.log('[addTopic] Request files:', req.files);
    
    const { semesterId, subjectId, chapterId } = req.params;
    const { topicName, difficulty, difficultyLevel, topicVideoLink, problemLink, importanceLevel } = req.body;
    
    if (!topicName) throw new HttpError(400, 'Topic name is required');
    
    // Coordinator ownership filter with legacy fallback (ObjectId string stored in coordinatorId)
    const legacyOwnerFilter = req.user.role === 'coordinator'
      ? {
          $or: [
            { coordinatorId: req.user.coordinatorId },
            { coordinatorId: String(req.user._id) },
          ],
        }
      : {};
    
    const semester = await Semester.findOne({ _id: semesterId, ...legacyOwnerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    const chapter = subject.chapters.id(chapterId);
    if (!chapter) throw new HttpError(404, 'Chapter not found');
    
    // DUPLICATE CHECK: Prevent duplicate topic names in the same chapter
    const normalizedTopicName = topicName.trim().toLowerCase();
    const existingTopic = chapter.topics.find(
      t => t.topicName.trim().toLowerCase() === normalizedTopicName
    );
    
    if (existingTopic) {
      console.log('[Add Topic] Blocked duplicate:', { 
        chapterId, 
        topicName, 
        existingTopicId: existingTopic._id 
      });
      throw new HttpError(409, 'A topic with this name already exists in this chapter');
    }
    
    console.log('[Add Topic] Creating new topic:', { 
      chapterId, 
      topicName, 
      difficultyLevel 
    });
    
    // Handle video link
    let videoLink = topicVideoLink || '';
    
    // Handle question PDF upload
    let questionPDF = null;
    const questionPdfFile = req.files?.questionPDF?.[0];
    if (questionPdfFile) {
      const fileName = `question-${Date.now()}-${questionPdfFile.originalname}`;
      const { data, error } = await supabase.storage
        .from('question-pdfs')
        .upload(fileName, questionPdfFile.buffer, {
          contentType: questionPdfFile.mimetype
        });
      
      if (error) throw new HttpError(500, 'Failed to upload question PDF');
      
      const { data: urlData } = supabase.storage
        .from('question-pdfs')
        .getPublicUrl(fileName);
      
      questionPDF = urlData.publicUrl;
    }
    
    // Handle notes PDF upload
    let notesPDF = null;
    const notesPdfFile = req.files?.notesPDF?.[0];
    if (notesPdfFile) {
      const fileName = `notes-${Date.now()}-${notesPdfFile.originalname}`;
      const { data, error } = await supabase.storage
        .from('notes-pdfs')
        .upload(fileName, notesPdfFile.buffer, {
          contentType: notesPdfFile.mimetype
        });
      
      if (error) throw new HttpError(500, 'Failed to upload notes PDF');
      
      const { data: urlData } = supabase.storage
        .from('notes-pdfs')
        .getPublicUrl(fileName);
      
      notesPDF = urlData.publicUrl;
    }
    
    const order = chapter.topics.length;
    chapter.topics.push({
      topicName,
      problemLink: problemLink || '',
      importanceLevel: importanceLevel ? Number(importanceLevel) : 3,
      difficultyLevel: difficultyLevel || difficulty || 'medium',
      topicVideoLink: videoLink,
      notesPDF,
      questionPDF,
      order
    });
    
    console.log('[addTopic] Topic added, saving semester...');
    await semester.save();
    console.log('[addTopic] Semester saved successfully');
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'topic-created', data: semester });
    
    res.status(201).json(semester);
  } catch (err) {
    console.error('[addTopic] Error:', err);
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to add topic', details: err.message });
  }
}

// Update a topic
export async function updateTopic(req, res) {
  try {
    const { semesterId, subjectId, chapterId, topicId } = req.params;
      const { topicName, difficultyLevel, difficulty, topicVideoLink, problemLink, importanceLevel } = req.body;
    
    let ownerFilter = {};
      // Legacy fallback: some semesters stored coordinator ObjectId string in coordinatorId
      const legacyOwnerFilter = req.user.role === 'coordinator'
        ? {
            $or: [
              { coordinatorId: req.user.coordinatorId },
              { coordinatorId: String(req.user._id) },
            ],
          }
        : {};

    if (req.user.role === 'coordinator') {
      const coordId = req.user.coordinatorId;
      const legacyId = req.user._id?.toString?.() || '';
      ownerFilter = { $or: [ { coordinatorId: coordId }, { coordinatorId: legacyId } ] };
    }
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    const chapter = subject.chapters.id(chapterId);
    if (!chapter) throw new HttpError(404, 'Chapter not found');
    
    const topic = chapter.topics.id(topicId);
    if (!topic) throw new HttpError(404, 'Topic not found');
    
    // Update fields
    if (topicName !== undefined) topic.topicName = topicName;
    if (problemLink !== undefined) topic.problemLink = problemLink;
    if (importanceLevel !== undefined) topic.importanceLevel = Number(importanceLevel);
    // Accept both 'difficultyLevel' and legacy 'difficulty' keys
    if (difficultyLevel !== undefined) topic.difficultyLevel = difficultyLevel;
    else if (difficulty !== undefined) topic.difficultyLevel = difficulty;
    if (topicVideoLink !== undefined) topic.topicVideoLink = topicVideoLink;
    
    // Handle question PDF upload if provided
    const questionPdfFile = req.files?.questionPDF?.[0];
    if (questionPdfFile) {
      const fileName = `question-${Date.now()}-${questionPdfFile.originalname}`;
      const { data, error } = await supabase.storage
        .from('question-pdfs')
        .upload(fileName, questionPdfFile.buffer, {
          contentType: questionPdfFile.mimetype,
        });
      if (error) throw new HttpError(500, 'Failed to upload question PDF');
      const { data: urlData } = supabase.storage
        .from('question-pdfs')
        .getPublicUrl(fileName);
      topic.questionPDF = urlData.publicUrl;
    }
    
    // Handle notes PDF upload if provided
    const notesPdfFile = req.files?.notesPDF?.[0];
    if (notesPdfFile) {
      const fileName = `notes-${Date.now()}-${notesPdfFile.originalname}`;
      const { data, error } = await supabase.storage
        .from('notes-pdfs')
        .upload(fileName, notesPdfFile.buffer, {
          contentType: notesPdfFile.mimetype,
        });
      if (error) throw new HttpError(500, 'Failed to upload notes PDF');
      const { data: urlData } = supabase.storage
        .from('notes-pdfs')
        .getPublicUrl(fileName);
      topic.notesPDF = urlData.publicUrl;
    }
    
    console.log('[updateTopic] Topic updated successfully');
    await semester.save();
    
    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'TOPIC',
      targetId: topic._id.toString(),
      description: `Updated topic: ${topic.topicName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'topic-updated', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error updating topic:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to update topic' });
  }
}

// Delete a topic
export async function deleteTopic(req, res) {
  try {
    const { semesterId, subjectId, chapterId, topicId } = req.params;
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    const chapter = subject.chapters.id(chapterId);
    if (!chapter) throw new HttpError(404, 'Chapter not found');

    const topic = chapter.topics.id(topicId);
    const topicName = topic ? topic.topicName : topicId;
    
    chapter.topics.pull(topicId);
    await semester.save();

    // Clean up Progress records for this specific topic
    const deleteResult = await Progress.deleteMany({ topicId });
    console.log(`Deleted ${deleteResult.deletedCount} progress records for topic ${topicId}`);

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'DELETE',
      targetType: 'TOPIC',
      targetId: topicId,
      description: `Deleted topic: ${topicName}`,
      metadata: { coordinatorId: semester.coordinatorId },
      req
    });
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'topic-deleted', data: semester });
    
    res.json({ message: 'Topic deleted successfully', semester });
  } catch (err) {
    console.error('Error deleting topic:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to delete topic' });
  }
}

// Reorder topics within a chapter
export async function reorderTopics(req, res) {
  try {
    const { semesterId, subjectId, chapterId } = req.params;
    const { topicIds } = req.body;
    
    if (!Array.isArray(topicIds)) throw new HttpError(400, 'topicIds must be an array');
    
    const ownerFilter = req.user.role === 'coordinator' ? { coordinatorId: req.user.coordinatorId } : {};
    const semester = await Semester.findOne({ _id: semesterId, ...ownerFilter });
    if (!semester) throw new HttpError(404, 'Semester not found');
    
    const subject = semester.subjects.id(subjectId);
    if (!subject) throw new HttpError(404, 'Subject not found');
    
    const chapter = subject.chapters.id(chapterId);
    if (!chapter) throw new HttpError(404, 'Chapter not found');
    
    topicIds.forEach((id, index) => {
      const topic = chapter.topics.id(id);
      if (topic) topic.order = index;
    });
    
    chapter.topics.sort((a, b) => a.order - b.order);
    await semester.save();
    
    // Emit socket event for real-time update
    io.emit('learning-updated', { type: 'topics-reordered', data: semester });
    
    res.json(semester);
  } catch (err) {
    console.error('Error reordering topics:', err);
    if (err instanceof HttpError) throw err;
    res.status(500).json({ error: 'Failed to reorder topics' });
  }
}
