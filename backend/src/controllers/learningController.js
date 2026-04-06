import Semester from '../models/Subject.js';
import Progress from '../models/Progress.js';
import User from '../models/User.js';
import { logStudentActivity } from './activityController.js';

// Get all semesters with all subjects from all coordinators
export const getAllSemestersForStudent = async (req, res) => {
  try {
    console.log('[Learning] Getting all semesters for student:', req.user._id);
    
    const semesters = await Semester.find().sort('order');

    // Build a map of coordinators by their business coordinatorId (string)
    const coordinators = await User.find({ role: 'coordinator' })
      .select('_id name email coordinatorId');
    const coordByBusinessId = new Map(
      coordinators
        .filter(c => !!c.coordinatorId)
        .map(c => [String(c.coordinatorId), { userId: String(c._id), name: c.name, email: c.email }])
    );
    const coordByObjectId = new Map(
      coordinators.map(c => [String(c._id), { userId: String(c._id), name: c.name, email: c.email, businessId: c.coordinatorId }])
    );

    console.log('[Learning] Found semesters:', semesters.length);

    // Get student's current semester for filtering (students only, not admins)
    let studentSemester = null;
    if (req.user.role === 'student') {
      studentSemester = req.user.semester;
      console.log('[Learning] Student semester:', studentSemester);
    }

    // Group subjects by semester and subject name
    const semesterMap = {};

    semesters.forEach(semester => {
      const semesterKey = semester.semesterName;
      
      if (!semesterMap[semesterKey]) {
        semesterMap[semesterKey] = {
          semesterName: semester.semesterName,
          semesterDescription: semester.semesterDescription,
          subjects: {}
        };
      }

      semester.subjects.forEach(subject => {
        // Normalize subject name to title case for grouping
        const normalizeSubjectName = (name) => {
          return name.toLowerCase().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
          ).join(' ');
        };
        const subjectKey = normalizeSubjectName(subject.subjectName);
        
        if (!semesterMap[semesterKey].subjects[subjectKey]) {
          semesterMap[semesterKey].subjects[subjectKey] = {
            subjectName: subjectKey, // Use normalized name
            subjectDescription: subject.subjectDescription,
            coordinators: [],
            teacherMap: {} // Track teachers by normalized name
          };
        }

        // Lookup coordinator user details by business coordinatorId (string on semester)
        const rawCoordId = String(semester.coordinatorId);
        const coordInfo = coordByBusinessId.get(rawCoordId) || coordByObjectId.get(rawCoordId) || null;
        const displayName = coordInfo?.name || '';
        const displayEmail = coordInfo?.email || '';
        const finalName = displayName || (displayEmail ? displayEmail.split('@')[0] : 'Teacher');

        // Normalize teacher name to avoid case-sensitive duplicates per subject
        const teacherKey = finalName.toLowerCase();

        // Only add if not already present (case-insensitive check)
        if (!semesterMap[semesterKey].subjects[subjectKey].teacherMap[teacherKey]) {
          const teacherData = {
            // Keep using the stored coordinatorId (can be business id or ObjectId string)
            coordinatorId: rawCoordId,
            coordinatorName: finalName,
            coordinatorEmail: displayEmail,
            semesterId: semester._id,
            subjectId: subject._id
          };

          semesterMap[semesterKey].subjects[subjectKey].coordinators.push(teacherData);
          semesterMap[semesterKey].subjects[subjectKey].teacherMap[teacherKey] = true;
        }
      });
    });

    // Convert to array format
    const result = Object.keys(semesterMap).map(semesterName => ({
      semesterName,
      semesterDescription: semesterMap[semesterName].semesterDescription,
      subjects: Object.keys(semesterMap[semesterName].subjects).map(subjectName => {
        const subject = semesterMap[semesterName].subjects[subjectName];
        // Remove teacherMap before sending
        delete subject.teacherMap;
        return {
          subjectName,
          subjectDescription: subject.subjectDescription,
          coordinators: subject.coordinators
        };
      })
    }));

    console.log('[Learning] Total semesters before filtering:', result.length);
    result.forEach(sem => {
      console.log(`  - ${sem.semesterName}: ${sem.subjects.length} subjects`);
    });

    // Filter by student semester if user is a student
    let filteredResult = result;
    if (studentSemester !== null && studentSemester !== undefined) {
      console.log('[Learning] Filtering for student semester:', studentSemester);
      filteredResult = result.filter(sem => {
        // Extract semester number from semester name (e.g., "Semester 1" -> 1)
        const match = sem.semesterName.match(/\d+/);
        if (match) {
          const semNum = parseInt(match[0]);
          const include = semNum <= studentSemester;
          console.log(`  - ${sem.semesterName}: extracted ${semNum}, ${include ? 'INCLUDE' : 'EXCLUDE'}`);
          return include;
        }
        // If no number found, include it (edge case)
        console.log(`  - ${sem.semesterName}: no number found, INCLUDE`);
        return true;
      });
      console.log(`[Learning] Filtered ${result.length} semesters to ${filteredResult.length} for student semester ${studentSemester}`);
    }

    // For students, filter out empty semesters (those with no subjects)
    if (req.user.role === 'student') {
      const beforeEmptyFilter = filteredResult.length;
      filteredResult = filteredResult.filter(sem => sem.subjects && sem.subjects.length > 0);
      console.log(`[Learning] Filtered out empty semesters: ${beforeEmptyFilter} -> ${filteredResult.length}`);
    }

    console.log('[Learning] Returning filtered result:', filteredResult.length, 'semesters');
    res.json(filteredResult);
  } catch (error) {
    console.error('Error fetching semesters for student:', error);
    res.status(500).json({ message: 'Failed to fetch semesters', error: error.message });
  }
};

// Get all subjects by a specific coordinator
export const getCoordinatorSubjects = async (req, res) => {
  try {
    const { coordinatorId } = req.params;

    const semesters = await Semester.find({ coordinatorId }).sort('order');

    // Fetch the coordinator user for name/email
    // Try by business coordinatorId first (string), then by _id if it's a valid ObjectId
    let coordUser = await User.findOne({ coordinatorId }).select('_id name email coordinatorId');
    if (!coordUser && coordinatorId.match(/^[0-9a-fA-F]{24}$/)) {
      // If not found and looks like ObjectId, try _id
      coordUser = await User.findById(coordinatorId).select('_id name email coordinatorId');
    }

    // Flatten all subjects from all semesters
    const allSubjects = [];

    semesters.forEach(semester => {
      semester.subjects.forEach(subject => {
        allSubjects.push({
          semesterId: semester._id,
          semesterName: semester.semesterName,
          subjectId: subject._id,
          subjectName: subject.subjectName,
          subjectDescription: subject.subjectDescription,
          coordinatorId: semester.coordinatorId,
          coordinatorName: (coordUser?.name || (coordUser?.email ? coordUser.email.split('@')[0] : 'Teacher')),
          coordinatorEmail: coordUser?.email || ''
        });
      });
    });

    res.json(allSubjects);
  } catch (error) {
    console.error('Error fetching coordinator subjects:', error);
    res.status(500).json({ message: 'Failed to fetch coordinator subjects', error: error.message });
  }
};

// Get specific subject with all chapters and topics
export const getSubjectDetails = async (req, res) => {
  try {
    const { semesterId, subjectId } = req.params;

    const semester = await Semester.findById(semesterId);

    if (!semester) {
      return res.status(404).json({ message: 'Semester not found' });
    }

    const subject = semester.subjects.id(subjectId);

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Lookup coordinator details
    // Try by business coordinatorId first (string), then by _id if it's a valid ObjectId
    let coordUser = await User.findOne({ coordinatorId: semester.coordinatorId }).select('name email coordinatorId');
    if (!coordUser && semester.coordinatorId.match(/^[0-9a-fA-F]{24}$/)) {
      // If not found and looks like ObjectId, try _id
      coordUser = await User.findById(semester.coordinatorId).select('name email coordinatorId');
    }

    const response = {
      semesterId: semester._id,
      semesterName: semester.semesterName,
      subjectId: subject._id,
      subjectName: subject.subjectName,
      subjectDescription: subject.subjectDescription,
      coordinatorId: semester.coordinatorId,
      coordinatorName: (coordUser?.name || (coordUser?.email ? coordUser.email.split('@')[0] : 'Teacher')),
      coordinatorEmail: coordUser?.email || '',
      chapters: subject.chapters
    };

    console.log('[getSubjectDetails] Returning:', {
      subjectName: response.subjectName,
      coordinatorName: response.coordinatorName,
      coordinatorId: response.coordinatorId
    });

    // Removed SUBJECT_ACCESSED activity logging - not essential
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching subject details:', error);
    res.status(500).json({ message: 'Failed to fetch subject details', error: error.message });
  }
};

// Update topic progress
export const updateTopicProgress = async (req, res) => {
  try {
    console.log('[updateTopicProgress] Params:', req.params);
    console.log('[updateTopicProgress] Body:', req.body);
    console.log('[updateTopicProgress] User:', req.user._id);
    
    const { semesterId, subjectId, chapterId, topicId } = req.params;
    const { videoWatchedSeconds, coordinatorId } = req.body;
    const studentId = req.user._id;

    if (!coordinatorId) {
      console.error('[updateTopicProgress] Missing coordinatorId');
      return res.status(400).json({ message: 'Coordinator ID is required' });
    }

    // Find or create progress record
    let progress = await Progress.findOne({ studentId, topicId });

    // Check if this is first time accessing this subject (course enrollment)
    const isNewProgress = !progress;
    if (isNewProgress) {
      const existingProgressInSubject = await Progress.findOne({ studentId, subjectId });
      
      // Log course enrollment if this is the first topic in this subject
      if (!existingProgressInSubject) {
        await logStudentActivity({
          studentId,
          studentModel: 'User',
          activityType: 'COURSE_ENROLLED',
          metadata: {
            semesterId,
            subjectId,
            coordinatorId
          }
        });
      }

      console.log('[updateTopicProgress] Creating new progress record');
      progress = new Progress({
        studentId,
        semesterId,
        subjectId,
        chapterId,
        topicId,
        coordinatorId,
        videoWatchedSeconds: 0,
        completed: false
      });
    }

    const previousWatchedSeconds = progress.videoWatchedSeconds || 0;
    const wasCompleted = progress.completed;

    progress.videoWatchedSeconds = videoWatchedSeconds;
    progress.lastAccessedAt = new Date();

    // Mark as completed if watched for 3 minutes (180 seconds)
    if (videoWatchedSeconds >= 180 && !progress.completed) {
      progress.completed = true;
      progress.completedAt = new Date();
      console.log('[updateTopicProgress] Topic marked as completed!');
    }

    await progress.save();
    console.log('[updateTopicProgress] Progress saved successfully');

    // Log video watching activity (only if significant time added)
    if (videoWatchedSeconds > previousWatchedSeconds + 10) {
      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'VIDEO_WATCH',
        metadata: {
          topicId,
          subjectId,
          chapterId,
          semesterId,
          watchedSeconds: videoWatchedSeconds,
          coordinatorId
        }
      });
    }

    // Log topic completion activity (only once)
    if (!wasCompleted && progress.completed) {
      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'TOPIC_COMPLETED',
        metadata: {
          topicId,
          subjectId,
          chapterId,
          semesterId,
          coordinatorId,
          totalWatchedSeconds: videoWatchedSeconds
        }
      });
      // Removed PROBLEM_SOLVED activity logging - not essential
    }

    res.json({
      message: 'Progress updated',
      progress
    });
  } catch (error) {
    console.error('[updateTopicProgress] Error:', error);
    res.status(500).json({ message: 'Failed to update progress', error: error.message });
    res.status(500).json({ message: 'Failed to update progress', error: error.message });
  }
};

// Get student progress for a subject
export const getSubjectProgress = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const studentId = req.user._id;

    const progressRecords = await Progress.find({ studentId, subjectId });

    // Determine total topics from the curriculum definition (all topics uploaded
    // by admin/coordinator for this subject), not just topics the student has
    // already interacted with.
    let totalTopics = 0;
    const validTopicIds = new Set();

    try {
      const semester = await Semester.findOne({ 'subjects._id': subjectId }).select('subjects._id subjects.chapters.topics');
      if (semester) {
        const subject = semester.subjects.id(subjectId);
        if (subject) {
          subject.chapters.forEach((chapter) => {
            chapter.topics?.forEach((topic) => {
              totalTopics++;
              validTopicIds.add(topic._id.toString());
            });
          });
        }
      }
    } catch (err) {
      console.error('Error resolving subject topics for progress:', err);
    }

    // Only count completed topics that still exist in the curriculum
    const completedTopics = progressRecords.filter(p => 
      p.completed && validTopicIds.has(p.topicId.toString())
    ).length;

    // Fallback to number of progress records if curriculum lookup fails,
    // so the endpoint still returns a sensible value.
    if (!totalTopics) {
      totalTopics = progressRecords.length;
    }

    const percentage = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

    res.json({
      completedTopics,
      totalTopics,
      percentage,
      progressRecords
    });
  } catch (error) {
    console.error('Error fetching subject progress:', error);
    res.status(500).json({ message: 'Failed to fetch progress', error: error.message });
  }
};

// Get all progress for a student (for analytics)
export const getStudentProgress = async (req, res) => {
  try {
    const studentId = req.user._id;

    const progressRecords = await Progress.find({ studentId })
      .sort('-lastAccessedAt');

    // Group by subject
    const subjectProgress = {};

    progressRecords.forEach(record => {
      const subjectId = record.subjectId.toString();
      
      if (!subjectProgress[subjectId]) {
        subjectProgress[subjectId] = {
          subjectId,
          totalTopics: 0,
          completedTopics: 0,
          topics: []
        };
      }

      subjectProgress[subjectId].totalTopics++;
      if (record.completed) {
        subjectProgress[subjectId].completedTopics++;
      }
      subjectProgress[subjectId].topics.push(record);
    });

    // Calculate percentages
    Object.keys(subjectProgress).forEach(subjectId => {
      const { completedTopics, totalTopics } = subjectProgress[subjectId];
      subjectProgress[subjectId].percentage = totalTopics > 0 
        ? Math.round((completedTopics / totalTopics) * 100) 
        : 0;
    });

    res.json({
      subjectProgress: Object.values(subjectProgress),
      totalCompleted: progressRecords.filter(p => p.completed).length,
      totalTopics: progressRecords.length
    });
  } catch (error) {
    console.error('Error fetching student progress:', error);
    res.status(500).json({ message: 'Failed to fetch progress', error: error.message });
  }
};

// Get progress for specific topic
export const getTopicProgress = async (req, res) => {
  try {
    const { topicId } = req.params;
    const studentId = req.user._id;

    const progress = await Progress.findOne({ studentId, topicId });

    if (!progress) {
      return res.json({
        completed: false,
        videoWatchedSeconds: 0
      });
    }

    res.json(progress);
  } catch (error) {
    console.error('Error fetching topic progress:', error);
    res.status(500).json({ message: 'Failed to fetch topic progress', error: error.message });
  }
};

// Start video tracking (3-minute timer backend)
export const startVideoTracking = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { semesterId, subjectId, chapterId, coordinatorId } = req.body;
    const studentId = req.user._id;

    console.log('[startVideoTracking] Starting for topic:', topicId);

    if (!coordinatorId) {
      return res.status(400).json({ message: 'Coordinator ID is required' });
    }

    // Find or create progress record
    let progress = await Progress.findOne({ studentId, topicId });

    // Removed COURSE_ENROLLED activity logging - not essential
    const isNewProgress = !progress;
    if (isNewProgress) {
      progress = new Progress({
        studentId,
        semesterId,
        subjectId,
        chapterId,
        topicId,
        coordinatorId,
        videoWatchedSeconds: 0,
        completed: false
      });
    }

    const wasCompleted = progress.completed;
    
    progress.lastAccessedAt = new Date();
    await progress.save();

    // Removed VIDEO_STARTED and TOPIC_VIEWED activity logging - not essential

    // Set video watched to 180 seconds and mark as completed immediately
    // This ensures progress is saved even if the server restarts
    progress.videoWatchedSeconds = 180;
    progress.completed = true;
    progress.completedAt = new Date();
    await progress.save();
    
    console.log('[startVideoTracking] Topic marked as completed:', topicId);

    // Log completion activities if this is the first completion
    if (!wasCompleted) {
      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'VIDEO_WATCH',
        metadata: {
          topicId,
          subjectId,
          chapterId,
          semesterId,
          watchedSeconds: 180,
          coordinatorId
        }
      });

      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'TOPIC_COMPLETED',
        metadata: {
          topicId,
          subjectId,
          chapterId,
          semesterId,
          coordinatorId,
          totalWatchedSeconds: 180
        }
      });
      // Removed PROBLEM_SOLVED activity logging - not essential
    }

    res.json({
      message: 'Video tracking started and completed',
      progress
    });
  } catch (error) {
    console.error('[startVideoTracking] Error:', error);
    res.status(500).json({ message: 'Failed to start tracking', error: error.message });
  }
};

// Track actual watch time from YouTube IFrame API
export const trackWatchTime = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { watchedSeconds, videoDuration, semesterId, subjectId, chapterId, coordinatorId } = req.body;
    const studentId = req.user._id;

    if (!coordinatorId) {
      return res.status(400).json({ message: 'Coordinator ID is required' });
    }

    const seconds = Math.max(0, Math.floor(Number(watchedSeconds) || 0));
    const duration = Math.max(0, Math.floor(Number(videoDuration) || 0));

    // Find or create progress record
    let progress = await Progress.findOne({ studentId, topicId });

    if (!progress) {
      progress = new Progress({
        studentId,
        semesterId,
        subjectId,
        chapterId,
        topicId,
        coordinatorId,
        videoWatchedSeconds: 0,
        videoDuration: duration,
        completed: false
      });
    }

    const previousWatchedSeconds = progress.videoWatchedSeconds || 0;
    const wasCompleted = progress.completed;

    // Only update if new value is greater (never decrease watched time)
    if (seconds > previousWatchedSeconds) {
      progress.videoWatchedSeconds = seconds;
    }

    if (duration > 0) {
      progress.videoDuration = duration;
    }

    progress.lastAccessedAt = new Date();

    // Mark completed if watched >= 80% of video, or >= 180 seconds as fallback
    const completionThreshold = duration > 0 ? duration * 0.8 : 180;
    if (progress.videoWatchedSeconds >= completionThreshold && !progress.completed) {
      progress.completed = true;
      progress.completedAt = new Date();
    }

    await progress.save();

    // Log video watching activity (only if meaningful new time added)
    if (seconds > previousWatchedSeconds + 10) {
      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'VIDEO_WATCH',
        metadata: { topicId, subjectId, chapterId, semesterId, watchedSeconds: seconds, coordinatorId }
      });
    }

    // Log topic completion (only on first completion)
    if (!wasCompleted && progress.completed) {
      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'TOPIC_COMPLETED',
        metadata: { topicId, subjectId, chapterId, semesterId, coordinatorId, totalWatchedSeconds: progress.videoWatchedSeconds }
      });
    }

    res.json({ message: 'Watch time tracked', progress });
  } catch (error) {
    console.error('[trackWatchTime] Error:', error);
    res.status(500).json({ message: 'Failed to track watch time', error: error.message });
  }
};

// Manual topic completion
export const markTopicComplete = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { semesterId, subjectId, chapterId, coordinatorId } = req.body;
    const studentId = req.user._id;

    console.log('[markTopicComplete] Marking topic as complete:', topicId);

    if (!coordinatorId) {
      return res.status(400).json({ message: 'Coordinator ID is required' });
    }

    // Find or create progress record
    let progress = await Progress.findOne({ studentId, topicId });

    const isNewProgress = !progress;
    if (isNewProgress) {
      const existingProgressInSubject = await Progress.findOne({ studentId, subjectId });
      
      // Log course enrollment if this is the first topic in this subject
      if (!existingProgressInSubject) {
        await logStudentActivity({
          studentId,
          studentModel: 'User',
          activityType: 'COURSE_ENROLLED',
          metadata: {
            semesterId,
            subjectId,
            coordinatorId
          }
        });
      }

      progress = new Progress({
        studentId,
        semesterId,
        subjectId,
        chapterId,
        topicId,
        coordinatorId,
        videoWatchedSeconds: 0,
        completed: false
      });
    }

    const wasCompleted = progress.completed;
    
    // Mark as completed
    progress.completed = true;
    progress.completedAt = new Date();
    progress.lastAccessedAt = new Date();
    progress.videoWatchedSeconds = 180; // Set default watched time
    await progress.save();
    
    console.log('[markTopicComplete] Topic marked as completed:', topicId);

    // Log completion activities if this is the first completion
    if (!wasCompleted) {
      // Removed TOPIC_VIEWED activity logging - not essential

      await logStudentActivity({
        studentId,
        studentModel: 'User',
        activityType: 'TOPIC_COMPLETED',
        metadata: {
          topicId,
          subjectId,
          chapterId,
          semesterId,
          coordinatorId,
          totalWatchedSeconds: 180
        }
      });
      // Removed PROBLEM_SOLVED activity logging - not essential
    }

    res.json({
      message: 'Topic marked as complete',
      progress
    });
  } catch (error) {
    console.error('[markTopicComplete] Error:', error);
    res.status(500).json({ message: 'Failed to mark topic as complete', error: error.message });
  }
};

// Manual topic incompletion
export const markTopicIncomplete = async (req, res) => {
  try {
    const { topicId } = req.params;
    const studentId = req.user._id;

    console.log('[markTopicIncomplete] Marking topic as incomplete:', topicId);

    // Find progress record
    const progress = await Progress.findOne({ studentId, topicId });

    if (!progress) {
      return res.status(404).json({ message: 'Progress record not found' });
    }

    // Mark as incomplete
    progress.completed = false;
    progress.completedAt = null;
    progress.videoWatchedSeconds = 0;
    progress.lastAccessedAt = new Date();
    await progress.save();
    
    console.log('[markTopicIncomplete] Topic marked as incomplete:', topicId);

    res.json({
      message: 'Topic marked as incomplete',
      progress
    });
  } catch (error) {
    console.error('[markTopicIncomplete] Error:', error);
    res.status(500).json({ message: 'Failed to mark topic as incomplete', error: error.message });
  }
};

// Get learning analytics for a subject (Admin/Coordinator)
export const getSubjectAnalytics = async (req, res) => {
  try {
    const { semesterId, subjectId } = req.params;

    // Get the semester and subject details
    const semester = await Semester.findById(semesterId);
    if (!semester) {
      return res.status(404).json({ message: 'Semester not found' });
    }

    const subject = semester.subjects.id(subjectId);
    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    // Build a map of all topics in this subject
    const topicMap = new Map();

    subject.chapters.forEach(chapter => {
      chapter.topics.forEach(topic => {
        topicMap.set(topic._id.toString(), {
          topicId: topic._id,
          topicName: topic.topicName,
          chapterId: chapter._id,
          chapterName: chapter.chapterName,
          difficultyLevel: topic.difficultyLevel
        });
      });
    });

    // Get all progress records for this subject
    const allProgress = await Progress.find({ subjectId }).lean();

    // Get all unique student IDs who have progress
    const studentIds = [...new Set(allProgress.map(p => p.studentId.toString()))];

    // Get student details
    const students = await User.find({
      _id: { $in: studentIds },
      role: 'student'
    }).select('_id name email studentId semester course branch college').lean();

    const studentMap = new Map(students.map(s => [s._id.toString(), s]));

    // Get ALL students (to find who hasn't visited)
    // For coordinators, filter by their assigned students
    let allStudentsQuery = { role: 'student' };
    if (req.user.role === 'coordinator') {
      const coordId = req.user.coordinatorId;
      if (coordId) {
        allStudentsQuery.teacherIds = coordId;
      }
    }
    const allStudents = await User.find(allStudentsQuery)
      .select('_id name email studentId semester course branch college')
      .lean();

    // Build chapter-wise and topic-wise analytics
    const chapterAnalytics = [];

    subject.chapters.forEach(chapter => {
      const chapterTopicIds = chapter.topics.map(t => t._id.toString());

      const topicAnalytics = chapter.topics.map(topic => {
        const topicId = topic._id.toString();

        // Students who viewed/completed this topic
        const topicProgress = allProgress.filter(p => p.topicId.toString() === topicId);
        const viewedStudents = topicProgress.map(p => {
          const student = studentMap.get(p.studentId.toString());
          if (!student) return null;
          return {
            _id: student._id,
            name: student.name,
            email: student.email,
            studentId: student.studentId,
            semester: student.semester,
            course: student.course,
            branch: student.branch,
            college: student.college,
            completed: p.completed,
            videoWatchedSeconds: p.videoWatchedSeconds,
            lastAccessedAt: p.lastAccessedAt,
            completedAt: p.completedAt
          };
        }).filter(Boolean);

        // Students who have NOT viewed this topic
        const viewedStudentIds = new Set(topicProgress.map(p => p.studentId.toString()));
        const notViewedStudents = allStudents
          .filter(s => !viewedStudentIds.has(s._id.toString()))
          .map(s => ({
            _id: s._id,
            name: s.name,
            email: s.email,
            studentId: s.studentId,
            semester: s.semester,
            course: s.course,
            branch: s.branch,
            college: s.college
          }));

        return {
          topicId: topic._id,
          topicName: topic.topicName,
          difficultyLevel: topic.difficultyLevel,
          viewedCount: viewedStudents.length,
          notViewedCount: notViewedStudents.length,
          completedCount: viewedStudents.filter(s => s.completed).length,
          viewedStudents,
          notViewedStudents
        };
      });

      // Chapter-level summary
      const chapterViewedStudentIds = new Set();
      const chapterCompletedAllStudentIds = new Set();

      allProgress.forEach(p => {
        if (chapterTopicIds.includes(p.topicId.toString())) {
          chapterViewedStudentIds.add(p.studentId.toString());
        }
      });

      // Students who completed ALL topics in the chapter
      chapterViewedStudentIds.forEach(studentId => {
        const studentTopicProgress = allProgress.filter(
          p => p.studentId.toString() === studentId && chapterTopicIds.includes(p.topicId.toString())
        );
        if (studentTopicProgress.length === chapterTopicIds.length &&
            studentTopicProgress.every(p => p.completed)) {
          chapterCompletedAllStudentIds.add(studentId);
        }
      });

      const chapterNotViewedStudents = allStudents
        .filter(s => !chapterViewedStudentIds.has(s._id.toString()))
        .map(s => ({
          _id: s._id,
          name: s.name,
          email: s.email,
          studentId: s.studentId,
          semester: s.semester
        }));

      chapterAnalytics.push({
        chapterId: chapter._id,
        chapterName: chapter.chapterName,
        totalTopics: chapter.topics.length,
        viewedByCount: chapterViewedStudentIds.size,
        completedByCount: chapterCompletedAllStudentIds.size,
        notViewedCount: chapterNotViewedStudents.length,
        notViewedStudents: chapterNotViewedStudents,
        topics: topicAnalytics
      });
    });

    // Overall subject summary
    const allTopicIds = [...topicMap.keys()];
    const subjectViewedStudentIds = new Set();
    allProgress.forEach(p => {
      if (allTopicIds.includes(p.topicId.toString())) {
        subjectViewedStudentIds.add(p.studentId.toString());
      }
    });

    const subjectNotViewedStudents = allStudents
      .filter(s => !subjectViewedStudentIds.has(s._id.toString()))
      .map(s => ({
        _id: s._id,
        name: s.name,
        email: s.email,
        studentId: s.studentId,
        semester: s.semester
      }));

    res.json({
      subjectName: subject.subjectName,
      semesterName: semester.semesterName,
      totalStudents: allStudents.length,
      activeStudents: subjectViewedStudentIds.size,
      notStartedCount: subjectNotViewedStudents.length,
      notStartedStudents: subjectNotViewedStudents,
      totalChapters: subject.chapters.length,
      totalTopics: allTopicIds.length,
      chapters: chapterAnalytics
    });
  } catch (error) {
    console.error('[getSubjectAnalytics] Error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics', error: error.message });
  }
};

/**
 * Auto-enroll a student in all courses for their semester (and lower semesters).
 * Creates Progress documents (completed=false, videoWatchedSeconds=0) for every
 * topic across all allowed semesters. Called once after first-time password change.
 */
export async function autoEnrollStudentInCourses(student) {
  try {
    console.log(`[AutoEnroll] Starting auto-enrollment for student: ${student._id} (semester: ${student.semester})`);

    // Fetch all semesters
    const allSemesters = await Semester.find().sort('order');

    // Filter to semesters within the student's allowed range
    const allowedSemesters = allSemesters.filter(sem => {
      if (student.semester == null) return true; // no filter if semester not set
      const match = sem.semesterName?.match(/\d+/);
      if (match) {
        const semNum = parseInt(match[0], 10);
        return semNum <= student.semester;
      }
      return true; // include semesters without a number
    });

    console.log(`[AutoEnroll] Found ${allowedSemesters.length} allowed semesters (of ${allSemesters.length} total)`);

    // Build Progress documents for every topic in allowed semesters
    const progressDocs = [];
    for (const semester of allowedSemesters) {
      for (const subject of (semester.subjects || [])) {
        for (const chapter of (subject.chapters || [])) {
          for (const topic of (chapter.topics || [])) {
            progressDocs.push({
              studentId: student._id,
              semesterId: semester._id,
              subjectId: subject._id,
              chapterId: chapter._id,
              topicId: topic._id,
              coordinatorId: String(semester.coordinatorId),
              completed: false,
              videoWatchedSeconds: 0,
              lastAccessedAt: new Date()
            });
          }
        }
      }
    }

    if (progressDocs.length === 0) {
      console.log(`[AutoEnroll] No topics found to enroll student in. Skipping.`);
      return { enrolled: 0 };
    }

    // insertMany with ordered:false so duplicate-key errors (existing records) are skipped
    let inserted = 0;
    try {
      const result = await Progress.insertMany(progressDocs, { ordered: false });
      inserted = result.length;
    } catch (bulkErr) {
      // BulkWriteError: some docs inserted, some duplicate-key skipped
      if (bulkErr.name === 'MongoBulkWriteError' || bulkErr.code === 11000) {
        inserted = bulkErr.result?.nInserted ?? bulkErr.insertedDocs?.length ?? 0;
        console.warn(`[AutoEnroll] Some topics already had progress records (skipped). Inserted: ${inserted}`);
      } else {
        throw bulkErr;
      }
    }

    console.log(`[AutoEnroll] Enrolled student ${student._id} in ${inserted} topics across ${allowedSemesters.length} semesters`);
    return { enrolled: inserted };
  } catch (error) {
    // Non-blocking: log but don't crash the password-change response
    console.error('[AutoEnroll] Failed to auto-enroll student:', error);
    return { enrolled: 0, error: error.message };
  }
}
