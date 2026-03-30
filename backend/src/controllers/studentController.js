import Papa from 'papaparse';
import User from '../models/User.js';
import Event from '../models/Event.js';
import { sendMail, renderTemplate } from '../utils/mailer.js';
import { sendOnboardingEmail } from '../utils/mailer.js';
import { logActivity } from './adminActivityController.js';
import { sanitizeCsvRow, sanitizeCsvField, validateObjectId, validateCsvImport, CSV_LIMITS } from '../utils/validators.js';

// Generate random password (7-8 characters)
function generateRandomPassword() {
  const length = Math.random() < 0.5 ? 7 : 8; // Randomly choose 7 or 8 characters
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Helper to parse comma-separated coordinator IDs from CSV
function parseTeacherIds(teacheridField) {
  if (!teacheridField) return [];
  return teacheridField
    .toString()
    .split(/[,;|]/)
    .map(id => id.trim())
    .filter(Boolean);
}

export async function listAllStudents(req, res) {
  try {
    const { search, sortOrder } = req.query;
    const user = req.user;
    // Show ALL users with role='student' regardless of special tag
    // Since special-event CSV creates users with role='student' AND isSpecialStudent=true,
    // querying by role='student' will include both regular and special students
    const baseQuery = user.role === 'coordinator'
      ? { role: 'student', teacherIds: user.coordinatorId }
      : { role: 'student' };

    let query = baseQuery;

    // Add search filter if provided (server-side callers only; admin UI does client-side search)
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query = {
        $and: [
          baseQuery,
          {
            $or: [
              { name: searchRegex },
              { email: searchRegex },
              { studentId: searchRegex },
            ],
          },
        ],
      };
    }
    
    // Sort order: 'asc' or 1 for ascending (oldest first, Excel order), 'desc' or -1 for descending (newest first)
    const sort = sortOrder === 'desc' || sortOrder === '-1' ? -1 : 1;
    
    const students = await User.find(query)
      .select('name email studentId course branch college semester group teacherIds avatarUrl createdAt isSpecialStudent')
      .sort({ createdAt: sort })
      .lean();
    
    // Map teacherIds to teacherId for backwards compatibility with frontend
    const studentsWithTeacherId = students.map(s => ({
      ...s,
      teacherId: Array.isArray(s.teacherIds) ? s.teacherIds.join(', ') : (s.teacherIds || '')
    }));
    
    res.json({ count: studentsWithTeacherId.length, students: studentsWithTeacherId });
  } catch (err) {
    console.error('Error listing students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
}

// Export all students as CSV (same format as upload template)
export async function exportStudentsCsv(req, res) {
  try {
    const user = req.user;
    const baseQuery = user.role === 'coordinator'
      ? { role: 'student', teacherIds: user.coordinatorId }
      : { role: 'student' };
    
    const students = await User.find(baseQuery)
      .select('name email studentId course branch college semester group teacherIds')
      .sort({ createdAt: 1 }) // Oldest first (Excel order)
      .lean();
    
    // Build CSV with same columns as upload template
    const header = 'Name,Email,Studentid,Branch,TeacherId,Semester,Course,College,Group';
    const rows = students.map(s => {
      const teacherId = Array.isArray(s.teacherIds) ? s.teacherIds.join(',') : '';
      // Escape fields that might contain commas
      const escape = (val) => {
        const str = (val ?? '').toString();
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      };
      return [
        escape(s.name),
        escape(s.email),
        escape(s.studentId),
        escape(s.branch),
        escape(teacherId),
        s.semester || '',
        escape(s.course),
        escape(s.college),
        escape(s.group)
      ].join(',');
    });
    
    const csv = header + '\n' + rows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="students-export.csv"');
    res.send(csv);
  } catch (err) {
    console.error('Error exporting students:', err);
    res.status(500).json({ error: 'Failed to export students' });
  }
}

export async function checkStudentsCsv(req, res) {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });
  
  // SECURITY: Validate file size limit
  const fileSize = req.file.size || req.file.buffer?.length || 0;
  if (fileSize > CSV_LIMITS.MAX_FILE_SIZE) {
    return res.status(400).json({ 
      error: `File size (${Math.round(fileSize / 1024)}KB) exceeds maximum of ${CSV_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB` 
    });
  }
  
  const csvText = req.file.buffer.toString('utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data;
  
  // SECURITY: Validate CSV import limits (row count, field lengths)
  const csvValidation = validateCsvImport(rows, fileSize);
  if (!csvValidation.valid) {
    return res.status(400).json({ error: csvValidation.errors.join('; ') });
  }
  
  const results = [];

  // Required fields for onboarding - password is auto-generated
  const requiredFields = ['name', 'email', 'studentid', 'branch', 'teacherid', 'semester', 'course', 'college'];

  // Track duplicates inside the CSV
  const seenEmails = new Set();
  const seenStudentIds = new Set();

  // SECURITY: Sanitize CSV rows to prevent formula injection
  // Normalize all rows first and collect emails/studentids for bulk DB check
  const normalizedRows = rows.map((r, idx) => ({ 
    ...sanitizeCsvRow(normalizeRow(r)), 
    __row: idx + 2 
  })); // header is line 1
  const emails = normalizedRows.map((r) => r.email).filter(Boolean);
  const studentIds = normalizedRows.map((r) => r.studentid).filter(Boolean);

  // Bulk query existing users in DB to avoid per-row queries
  const existing = await User.find({ $or: [{ email: { $in: emails } }, { studentId: { $in: studentIds } }] }).select('email studentId name branch course college teacherIds semester group').lean();
  const existingByEmail = new Map();
  const existingByStudentId = new Map();
  
  existing.forEach((u) => {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u);
    if (u.studentId) existingByStudentId.set(u.studentId.toString(), u);
  });

  // Coordinators are required for valid teacher assignments
  const coordinators = await User.find({ role: 'coordinator' }).select('coordinatorId').lean();
  if (!coordinators.length) {
    return res.status(400).json({ error: 'No coordinators exist. Please create at least one coordinator before uploading students.' });
  }
  const validCoordinatorIds = new Set(
    coordinators
      .map((c) => (c.coordinatorId || '').toString().trim())
      .filter(Boolean)
  );

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  for (const row of normalizedRows) {
    const { course, name, email, studentid, password, branch, college, teacherid } = row;

    // Skip completely empty rows
    if (!email && !studentid && !name) continue;

    // Check required fields - all must be present and non-empty
    const missing = requiredFields.filter((f) => {
      const value = row[f];
      return !value || !value.toString().trim();
    });
    if (missing.length > 0) {
      results.push({ row: row.__row, email, studentid, status: 'missing_fields', missing });
      continue;
    }

    // Validate email format
    if (!emailRegex.test(email)) {
      results.push({ row: row.__row, email, studentid, status: 'invalid_email' });
      continue;
    }

    // Check duplicates inside the CSV file
    const lowerEmail = email.toLowerCase();
    if (seenEmails.has(lowerEmail) || seenStudentIds.has(studentid)) {
      results.push({ row: row.__row, email, studentid, status: 'duplicate_in_file' });
      continue;
    }
    seenEmails.add(lowerEmail);
    seenStudentIds.add(studentid);

    // Parse multiple coordinator IDs (comma, semicolon, or pipe separated)
    const teacherIdList = parseTeacherIds(teacherid);
    if (teacherIdList.length === 0) {
      results.push({
        row: row.__row,
        email,
        studentid,
        status: 'invalid_teacherid',
        message: `Teacher ID / Coordinator code is required.`,
      });
      continue;
    }
    
    // Validate that ALL assigned coordinators exist
    const invalidIds = teacherIdList.filter(id => !validCoordinatorIds.has(id));
    if (invalidIds.length > 0) {
      results.push({
        row: row.__row,
        email,
        studentid,
        status: 'invalid_teacherid',
        message: `Teacher ID / Coordinator code(s) "${invalidIds.join(', ')}" do not match any existing coordinator. Please correct it before uploading.`,
      });
      continue;
    }

    // Check existing in User DB
    const existingUser = existingByEmail.get(lowerEmail) || existingByStudentId.get(studentid);
    
    if (existingUser) {
      // Check if this will be an update (any field different)
      const changes = [];
      const semesterNum = parseInt(row.semester);
      
      if (existingUser.name !== name) changes.push('name');
      if (existingUser.studentId !== studentid) {
        // Check if new studentId conflicts with another user
        const studentIdConflict = existingByStudentId.get(studentid);
        if (studentIdConflict && studentIdConflict._id.toString() !== existingUser._id.toString()) {
          results.push({ 
            row: row.__row, 
            email, 
            studentid, 
            status: 'studentid_conflict',
            message: `Student ID ${studentid} is already assigned to another user (${studentIdConflict.email})`
          });
          continue;
        }
        changes.push('studentid');
      }
      if (existingUser.branch !== branch) changes.push('branch');
      if (existingUser.course !== course) changes.push('course');
      if (existingUser.college !== college) changes.push('college');
      // Compare teacherIds arrays
      const existingTeacherIds = Array.isArray(existingUser.teacherIds) ? existingUser.teacherIds.sort().join(',') : '';
      const newTeacherIds = teacherIdList.sort().join(',');
      if (existingTeacherIds !== newTeacherIds) changes.push('teacherid');
      if (existingUser.semester !== semesterNum) changes.push('semester');
      if (existingUser.group !== row.group) changes.push('group');
      
      if (changes.length > 0) {
        results.push({ 
          row: row.__row, 
          email, 
          studentid, 
          status: 'will_update',
          changes,
          message: `Will update: ${changes.join(', ')}`
        });
      } else {
        results.push({ 
          row: row.__row, 
          email, 
          studentid, 
          status: 'exists_no_change',
          message: 'Student exists with identical data'
        });
      }
      continue;
    }

    // Mark as ready to create (don't show SpecialStudent info to user)
    results.push({ row: row.__row, email, studentid, status: 'ready' });
  }

  res.json({ count: results.length, results });
}

export async function uploadStudentsCsv(req, res) {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });
  
  // SECURITY: Validate file size limit
  const fileSize = req.file.size || req.file.buffer?.length || 0;
  if (fileSize > CSV_LIMITS.MAX_FILE_SIZE) {
    return res.status(400).json({ 
      error: `File size (${Math.round(fileSize / 1024)}KB) exceeds maximum of ${CSV_LIMITS.MAX_FILE_SIZE / (1024 * 1024)}MB` 
    });
  }
  
  const csvText = req.file.buffer.toString('utf8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data;
  
  // SECURITY: Validate CSV import limits (row count, field lengths)
  const csvValidation = validateCsvImport(rows, fileSize);
  if (!csvValidation.valid) {
    return res.status(400).json({ error: csvValidation.errors.join('; ') });
  }
  
  const results = [];

  // Required fields for onboarding - password is auto-generated
  const requiredFields = ['name', 'email', 'studentid', 'branch', 'teacherid', 'semester', 'course', 'college'];

  // Track duplicates inside the CSV
  const seenEmails = new Set();
  const seenStudentIds = new Set();

  // SECURITY: Sanitize CSV rows to prevent formula injection
  // Normalize all rows first and collect emails/studentids for bulk DB check
  const normalizedRows = rows.map((r, idx) => ({ 
    ...sanitizeCsvRow(normalizeRow(r)), 
    __row: idx + 2 
  })); // header is line 1
  const emails = normalizedRows.map((r) => r.email).filter(Boolean);
  const studentIds = normalizedRows.map((r) => r.studentid).filter(Boolean);

  // Bulk query existing users in DB to avoid per-row queries
  const existing = await User.find({ $or: [{ email: { $in: emails } }, { studentId: { $in: studentIds } }] }).lean();
  const existingByEmail = new Map();
  const existingByStudentId = new Map();
  
  existing.forEach((u) => {
    if (u.email) existingByEmail.set(u.email.toLowerCase(), u);
    if (u.studentId) existingByStudentId.set(u.studentId.toString(), u);
  });

  // Ensure coordinators exist and Teacher IDs are valid before creating students
  const coordinators = await User.find({ role: 'coordinator' }).select('coordinatorId').lean();
  if (!coordinators.length) {
    return res.status(400).json({ error: 'No coordinators exist. Please create at least one coordinator before uploading students.' });
  }
  const validCoordinatorIds = new Set(
    coordinators
      .map((c) => (c.coordinatorId || '').toString().trim())
      .filter(Boolean)
  );

  // Pre-validate all teacher IDs from CSV; block upload if any are invalid
  const invalidTeacherRows = normalizedRows.filter((row) => {
    const { teacherid, email, studentid, name } = row;
    if (!email && !studentid && !name) return false;
    if (!teacherid) return true;
    // Parse multiple IDs and check all are valid
    const teacherIdList = parseTeacherIds(teacherid);
    return teacherIdList.length === 0 || teacherIdList.some(id => !validCoordinatorIds.has(id));
  });

  if (invalidTeacherRows.length > 0) {
    // Collect all invalid IDs from all rows
    const allInvalidIds = new Set();
    invalidTeacherRows.forEach(r => {
      const ids = parseTeacherIds(r.teacherid);
      ids.forEach(id => {
        if (!validCoordinatorIds.has(id)) allInvalidIds.add(id);
      });
      if (ids.length === 0 && r.teacherid) allInvalidIds.add(r.teacherid);
    });
    const invalidIds = Array.from(allInvalidIds).filter(Boolean);
    return res.status(400).json({
      error: `One or more Teacher ID / Coordinator codes in the CSV do not match any existing coordinator: ${invalidIds.join(', ')}. Please correct them and try again.`,
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const newStudents = []; // Collect new students for async email sending

  for (const row of normalizedRows) {
    const { course, name, email, studentid, branch, college, teacherid } = row;

    // Skip completely empty rows
    if (!email && !studentid && !name) continue;

    // Check required fields - all must be present and non-empty
    const missing = requiredFields.filter((f) => {
      const value = row[f];
      return !value || !value.toString().trim();
    });
    if (missing.length > 0) {
      results.push({ row: row.__row, email, studentid, status: 'missing_fields', missing });
      continue;
    }

    // Validate email format
    if (!emailRegex.test(email)) {
      results.push({ row: row.__row, email, studentid, status: 'invalid_email' });
      continue;
    }

    // Check duplicates inside the CSV file
    const lowerEmail = email.toLowerCase();
    if (seenEmails.has(lowerEmail) || seenStudentIds.has(studentid)) {
      results.push({ row: row.__row, email, studentid, status: 'duplicate_in_file' });
      continue;
    }
    seenEmails.add(lowerEmail);
    seenStudentIds.add(studentid);

    // Check if student exists in DB
    const existingUser = existingByEmail.get(lowerEmail) || existingByStudentId.get(studentid);
    
    if (existingUser) {
      // Student exists - update their information with new CSV data
      try {
        const semesterNum = parseInt(row.semester);
        if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
          results.push({ row: row.__row, email, studentid, status: 'error', message: 'Semester must be between 1 and 8' });
          continue;
        }
        
        // Check if the new studentId is different and already belongs to another user
        if (studentid !== existingUser.studentId) {
          const studentIdConflict = existingByStudentId.get(studentid);
          if (studentIdConflict && studentIdConflict._id.toString() !== existingUser._id.toString()) {
            results.push({ 
              row: row.__row, 
              email, 
              studentid, 
              status: 'error', 
              message: `Student ID ${studentid} is already assigned to another user (${studentIdConflict.email})`
            });
            continue;
          }
        }
        
        const updateData = {
          name,
          studentId: studentid,
          branch,
          course,
          college,
          teacherIds: parseTeacherIds(teacherid),
          semester: semesterNum,
          group: row.group,
        };
        
        await User.findByIdAndUpdate(existingUser._id, updateData);
        
        // Update the cache if studentId changed
        if (studentid !== existingUser.studentId) {
          existingByStudentId.delete(existingUser.studentId);
          existingByStudentId.set(studentid, { ...existingUser, studentId: studentid });
        }
        
        results.push({ 
          row: row.__row, 
          id: existingUser._id, 
          email, 
          studentid, 
          status: 'updated',
          message: 'Student information updated with new CSV data'
        });
        continue;
      } catch (err) {
        results.push({ row: row.__row, email, studentid, status: 'error', message: err.message });
        continue;
      }
    }

    // Create user
    try {
      // Generate random password (7-8 characters)
      const generatedPassword = generateRandomPassword();
      const passwordHash = await User.hashPassword(generatedPassword);
      const semesterNum = parseInt(row.semester);
      if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
        results.push({ row: row.__row, email, studentid, status: 'error', message: 'Semester must be between 1 and 8' });
        continue;
      }
      const user = await User.create({
        role: 'student', course, name, email, studentId: studentid, passwordHash, branch, college,
        teacherIds: parseTeacherIds(teacherid),
        semester: semesterNum,
        group: row.group,
        mustChangePassword: true,
      });
      results.push({ row: row.__row, id: user._id, email, studentid, status: 'created' });
      
      // Store for async email sending
      if (process.env.EMAIL_ON_ONBOARD === 'true' && email) {
        newStudents.push({ email, studentId: studentid, password: generatedPassword });
      }
    } catch (err) {
      results.push({ row: row.__row, email, studentid, status: 'error', message: err.message });
    }
  }

  // Log activity for bulk student upload
  const successCount = results.filter(r => r.status === 'created' || r.status === 'linked_from_special' || r.status === 'updated').length;
  if (successCount > 0 && req.user) {
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'CREATE',
      targetType: 'STUDENT',
      targetId: 'bulk-upload',
      description: `Uploaded ${successCount} students via CSV`,
      metadata: { totalRows: rows.length, successCount, fileName: req.file?.originalname || 'unknown.csv' },
      req
    });
  }

  // Send response immediately
  res.json({ count: results.length, results });

  // Send emails asynchronously after response
  if (newStudents.length > 0) {
    setImmediate(async () => {
      try {
        // Send all emails in parallel for faster delivery
        const emailPromises = newStudents.map(student => 
          sendOnboardingEmail({
            to: student.email,
            studentId: student.studentId,
            password: student.password,
          }).catch(err => {
            console.error(`[uploadStudentsCsv] Failed to send email to ${student.email}:`, err.message);
            return null; // Continue with other emails even if one fails
          })
        );
        
        await Promise.all(emailPromises);
        console.log(`[uploadStudentsCsv] Sent onboarding emails to ${newStudents.length} new students`);
      } catch (err) {
        console.error('[uploadStudentsCsv] Error sending onboarding emails:', err.message);
      }
    });
  }
}

export async function createStudent(req, res) {
  try {
    const { name, email, studentid, branch, course, college, teacherid, semester, group } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    // Check all required fields (password is auto-generated)
    if (!name || !email || !studentid || !branch || !course || !college || !teacherid || !semester) {
      return res.status(400).json({ error: 'All fields are required: name, email, studentid, branch, course, college, teacherid, semester' });
    }
    
    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({ error: 'Semester must be a number between 1 and 8' });
    }
    
    if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email format' });

    // Parse and validate multiple coordinator IDs
    const teacherIdList = parseTeacherIds(teacherid);
    if (teacherIdList.length === 0) {
      return res.status(400).json({ error: 'At least one Teacher ID / Coordinator code is required.' });
    }
    
    // Validate ALL provided coordinator IDs exist
    const coordinators = await User.find({ role: 'coordinator', coordinatorId: { $in: teacherIdList } }).select('coordinatorId').lean();
    const validIds = new Set(coordinators.map(c => c.coordinatorId));
    const invalidIds = teacherIdList.filter(id => !validIds.has(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({ error: `Teacher ID / Coordinator code(s) "${invalidIds.join(', ')}" do not match any existing coordinator. Please create the coordinator first or correct the Teacher ID.` });
    }

    const exists = await User.findOne({ $or: [{ email }, { studentId: studentid }] });
    if (exists) return res.status(409).json({ error: 'Student with email or studentId already exists' });

    // Generate random password (7-8 characters)
    const generatedPassword = generateRandomPassword();
    const passwordHash = await User.hashPassword(generatedPassword);
    const userData = { role: 'student', name, email, studentId: studentid, passwordHash, branch, course, college, teacherIds: teacherIdList, semester: semesterNum, mustChangePassword: true };
    
    // Add group if provided
    if (group) {
      userData.group = group;
    }
    
    const user = await User.create(userData);

    // Send password via email
    if (process.env.EMAIL_ON_ONBOARD === 'true' && email) {
      await sendOnboardingEmail({
        to: email,
        studentId: studentid,
        password: generatedPassword,
      });
    }

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'CREATE',
      targetType: 'STUDENT',
      targetId: user._id.toString(),
      description: `Created student: ${name} (${email})`,
      metadata: { studentId: studentid, teacherIds: teacherIdList },
      req
    });

    return res.status(201).json({ id: user._id, email: user.email, studentid: user.studentId, status: 'created' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function normalizeRow(r) {
  const map = {};
  for (const [k, v] of Object.entries(r)) map[k.trim().toLowerCase()] = (v ?? '').toString().trim();
  return {
    name: map.name,
    email: map.email,
    studentid: map.studentid || map.student_id || map.sid,
    branch: map.branch,
    teacherid: map.teacherid || map.teacher_id || map.teacherId,
    semester: map.semester,
    course: map.course,
    college: map.college,
    group: map.group,
  };
}

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

// List all special students across all special events (from User model with special tag)
export async function listAllSpecialStudents(req, res) {
  try {
    const { search, sortOrder } = req.query;
    let query = { isSpecialStudent: true };
    
    // Add search filter if provided
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query = {
        ...query,
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { studentId: searchRegex },
          { branch: searchRegex },
          { course: searchRegex },
          { college: searchRegex }
        ]
      };
    }
    
    // Sort order: 'asc' or 1 for ascending (oldest first, Excel order), 'desc' or -1 for descending (newest first)
    const sort = sortOrder === 'desc' || sortOrder === '-1' ? -1 : 1;
    
    // Get special students from unified User collection
    const specialStudents = await User.find(query)
      .populate({
        path: 'specialEvents',
        select: 'name isSpecial coordinatorId createdAt'
      })
      .select('name email studentId course branch college semester group specialEvents createdAt teacherIds avatarUrl')
      .sort({ createdAt: sort })
      .lean();
    // Fetch all coordinators once to avoid per-student queries
    const coordinators = await User.find({ role: 'coordinator' })
      .select('_id name email coordinatorId')
      .lean();

    const coordinatorsById = new Map(coordinators.map(c => [c._id.toString(), c]));
    const coordinatorsByCode = new Map(
      coordinators
        .filter(c => c.coordinatorId)
        .map(c => [c.coordinatorId.toString(), c])
    );

    const studentsWithCoordinator = specialStudents.map(student => {
      // Get first teacherId from array for backwards compatibility
      const teacherIds = Array.isArray(student.teacherIds) ? student.teacherIds : [];
      const teacherFromStudent = teacherIds.length > 0 ? teacherIds[0].toString().trim() : null;
      let coordinator = null;

      if (teacherFromStudent) {
        coordinator =
          coordinatorsByCode.get(teacherFromStudent) ||
          (validateObjectId(teacherFromStudent) ? coordinatorsById.get(teacherFromStudent) : null);
      }

      // If no coordinator found from student's teacherId, try from any special event
      if (!coordinator && Array.isArray(student.specialEvents)) {
        for (const ev of student.specialEvents) {
          if (!ev || !ev.coordinatorId) continue;
          const id = ev.coordinatorId.toString();
          coordinator =
            coordinatorsByCode.get(id) ||
            (validateObjectId(id) ? coordinatorsById.get(id) : null);
          if (coordinator) break;
        }
      }

      // Enrich each special event with a human-readable creator label
      const eventsWithCreator = Array.isArray(student.specialEvents)
        ? student.specialEvents.map((ev) => {
            if (!ev) return ev;
            const evCopy = { ...ev };
            let createdBy = 'Admin';

            if (evCopy.coordinatorId) {
              const id = evCopy.coordinatorId.toString();
              const evCoordinator =
                coordinatorsByCode.get(id) ||
                (validateObjectId(id) ? coordinatorsById.get(id) : null);

              if (evCoordinator) {
                createdBy = evCoordinator.name || `Coordinator ${evCoordinator.coordinatorId || ''}`;
              }
            }

            evCopy.createdBy = createdBy;
            return evCopy;
          })
        : [];

      return {
        ...student,
        specialEvents: eventsWithCreator,
        // Map teacherIds array to comma-separated string for backwards compatibility
        teacherId: teacherIds.length > 0 ? teacherIds.join(', ') : (coordinator?.coordinatorId || coordinator?.name || '-'),
        coordinatorEmail: coordinator?.email || '-',
      };
    });

    res.json({ count: studentsWithCoordinator.length, students: studentsWithCoordinator });
  } catch (err) {
    console.error('Error listing special students:', err);
    res.status(500).json({ error: 'Failed to fetch special students' });
  }
}

// List special students for a specific event (from User model with special tag)
export async function listSpecialStudentsByEvent(req, res) {
  try {
    const { eventId } = req.params;
    
    // First get the event to find its coordinator
    const event = await Event.findById(eventId)
      .select('coordinatorId')
      .lean();
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    // Fetch coordinator details
    let coordinator = null;
    if (event.coordinatorId) {
      coordinator = await User.findOne({ coordinatorId: event.coordinatorId })
        .select('name email coordinatorId')
        .lean();
      
      // If not found by coordinatorId, try by _id if it looks like ObjectId
      if (!coordinator && event.coordinatorId.match(/^[0-9a-fA-F]{24}$/)) {
        coordinator = await User.findById(event.coordinatorId)
          .select('name email coordinatorId')
          .lean();
      }
    }
    
    const specialStudents = await User.find({ isSpecialStudent: true, specialEvents: eventId })
      .select('name email studentId course branch college semester group createdAt teacherIds')
      .sort({ createdAt: -1 })
      .lean();
    
    // Add coordinator info to each student
    const studentsWithCoordinator = specialStudents.map(student => {
      const teacherIds = Array.isArray(student.teacherIds) ? student.teacherIds : [];
      return {
        ...student,
        teacherId: teacherIds.length > 0 ? teacherIds.join(', ') : (coordinator?.coordinatorId || coordinator?.name || '-'),
        coordinatorEmail: coordinator?.email || '-'
      };
    });
    
    res.json({ count: studentsWithCoordinator.length, students: studentsWithCoordinator });
  } catch (err) {
    console.error('Error listing special students by event:', err);
    res.status(500).json({ error: 'Failed to fetch special students for event' });
  }
}

// Delete a student (admin only)
export async function deleteStudent(req, res) {
  try {
    const { studentId } = req.params;
    
    // Find and delete the student
    const student = await User.findOneAndDelete({ _id: studentId, role: 'student' });
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    console.log(`[Delete Student] Student deleted: ${student.name} (${student.email})`);
    
    res.json({ 
      message: 'Student deleted successfully', 
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId
      }
    });
  } catch (err) {
    console.error('Error deleting student:', err);
    res.status(500).json({ error: 'Failed to delete student' });
  }
}

// Update a student (admin only)
export async function updateStudent(req, res) {
  try {
    const { studentId } = req.params;
    const { name, email, studentId: sid, course, branch, college, semester, group, teacherId } = req.body;
    
    // Find student
    const student = await User.findOne({ _id: studentId, role: 'student' });
    
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Update fields
    if (name) student.name = name;
    if (email) student.email = email;
    if (sid) student.studentId = sid;
    if (course) student.course = course;
    if (branch) student.branch = branch;
    if (college) student.college = college;
    if (semester) student.semester = semester;
    if (group !== undefined) student.group = group;
    
    // Handle teacherId - can be comma-separated string or array
    if (teacherId !== undefined) {
      const teacherIdList = parseTeacherIds(teacherId);
      // Validate all coordinator IDs if provided
      if (teacherIdList.length > 0) {
        const coordinators = await User.find({ role: 'coordinator', coordinatorId: { $in: teacherIdList } }).select('coordinatorId').lean();
        const validIds = new Set(coordinators.map(c => c.coordinatorId));
        const invalidIds = teacherIdList.filter(id => !validIds.has(id));
        if (invalidIds.length > 0) {
          return res.status(400).json({ error: `Coordinator ID(s) "${invalidIds.join(', ')}" do not exist.` });
        }
      }
      student.teacherIds = teacherIdList;
    }
    
    await student.save();
    
    console.log(`[Update Student] Student updated: ${student.name} (${student.email})`);
    
    res.json({ 
      message: 'Student updated successfully', 
      student: {
        id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
        course: student.course,
        branch: student.branch,
        college: student.college,
        semester: student.semester,
        group: student.group,
        teacherId: Array.isArray(student.teacherIds) ? student.teacherIds.join(', ') : ''
      }
    });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ error: 'Failed to update student' });
  }
}

