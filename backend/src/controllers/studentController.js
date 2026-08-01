import Papa from 'papaparse';
import User from '../models/User.js';
import Event from '../models/Event.js';
import { logActivity } from './adminActivityController.js';
import { sanitizeCsvRow, sanitizeCsvField, validateObjectId, validateCsvImport, CSV_LIMITS } from '../utils/validators.js';
import { createNotification, createNotifications } from '../services/notificationService.js';
import { enqueueMailJobs } from '../services/mailQueueService.js';
import crypto from 'crypto';

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

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function studentScope(user = {}) {
  return user.role === 'coordinator'
    ? { role: 'student', teacherIds: user.coordinatorId }
    : { role: 'student' };
}

function buildStudentListQuery(user, params = {}) {
  const baseQuery = studentScope(user);
  const filters = [];
  const search = String(params.search || '').trim().slice(0, 120);

  if (search) {
    const searchRegex = new RegExp(escapeRegex(search), 'i');
    filters.push({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { studentId: searchRegex },
        { branch: searchRegex },
        { course: searchRegex },
        { college: searchRegex },
        { group: searchRegex },
        { teacherIds: searchRegex },
      ],
    });
  }

  const semesterNumber = Number(params.semester);
  if (params.semester !== undefined && params.semester !== '' && Number.isInteger(semesterNumber)) {
    filters.push({ semester: semesterNumber });
  }

  const credentialEmailStatus = String(params.credentialEmailStatus || '').trim();
  if (credentialEmailStatus === 'sent') {
    filters.push({ credentialEmailStatus: 'sent' });
  } else if (credentialEmailStatus === 'not_sent') {
    filters.push({ credentialEmailStatus: { $in: ['not_sent', 'failed'] } });
  } else if (credentialEmailStatus === 'unconfirmed') {
    filters.push({
      $or: [
        { credentialEmailStatus: { $exists: false } },
        { credentialEmailStatus: null },
        { credentialEmailStatus: '' },
      ],
    });
  }

  const platformActivity = String(params.platformActivity || '').trim();
  if (platformActivity === 'active') {
    filters.push({ activeSessionCreatedAt: { $exists: true } });
  } else if (platformActivity === 'never_logged_in') {
    filters.push({ activeSessionCreatedAt: { $exists: false } });
  }

  const accountStatus = String(params.accountStatus || '').trim();
  if (accountStatus === 'active') {
    filters.push({ isActive: { $ne: false } });
  } else if (accountStatus === 'disabled') {
    filters.push({ isActive: false });
  }

  const credentialEligibility = String(params.credentialEligibility || '').trim();
  const stalePendingBefore = new Date(Date.now() - 5 * 60 * 1000);
  if (credentialEligibility === 'eligible') {
    filters.push(
      { activeSessionCreatedAt: { $exists: false } },
      {
        $or: [
          { credentialEmailStatus: { $ne: 'pending' } },
          { credentialEmailLastAttemptAt: { $lt: stalePendingBefore } },
          { credentialEmailLastAttemptAt: { $exists: false } },
        ],
      },
    );
  } else if (credentialEligibility === 'ineligible') {
    filters.push({
      $or: [
        { activeSessionCreatedAt: { $exists: true } },
        {
          credentialEmailStatus: 'pending',
          credentialEmailLastAttemptAt: { $gte: stalePendingBefore },
        },
      ],
    });
  }

  [
    ['branch', 'branch'],
    ['course', 'course'],
    ['college', 'college'],
    ['group', 'group'],
    ['coordinator', 'teacherIds'],
  ].forEach(([paramName, fieldName]) => {
    const value = String(params[paramName] || '').trim().slice(0, 120);
    if (value) filters.push({ [fieldName]: new RegExp(`^${escapeRegex(value)}$`, 'i') });
  });

  return {
    baseQuery,
    query: filters.length > 0 ? { $and: [baseQuery, ...filters] } : baseQuery,
  };
}

function stringFacet(field, unwind = false) {
  const pipeline = [];
  if (unwind) pipeline.push({ $unwind: `$${field}` });
  pipeline.push(
    { $match: { [field]: { $type: 'string', $ne: '' } } },
    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  );
  return pipeline;
}

function mapFacet(entries = []) {
  return entries
    .map((entry) => ({ value: String(entry._id || '').trim(), label: String(entry._id || '').trim(), count: entry.count }))
    .filter((entry) => entry.value);
}

export async function listAllStudents(req, res) {
  try {
    const { sortOrder, page, limit } = req.query;
    const user = req.user;
    const { baseQuery, query } = buildStudentListQuery(user, req.query);
    
    // Sort order: 'asc' or 1 for ascending (oldest first, Excel order), 'desc' or -1 for descending (newest first)
    const sort = sortOrder === 'desc' || sortOrder === '-1' ? -1 : 1;
    
    const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const requestedLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 25));
    const paginated = page !== undefined || limit !== undefined;
    const studentQuery = User.find(query)
      .select('name email studentId course branch college semester group teacherIds avatarUrl createdAt isSpecialStudent bio linkedinUrl githubUrl portfolioUrl mustChangePassword activeSessionCreatedAt credentialEmailStatus credentialEmailSentAt credentialEmailLastAttemptAt')
      .sort({ createdAt: sort, _id: sort });
    if (paginated) {
      studentQuery.skip((requestedPage - 1) * requestedLimit).limit(requestedLimit);
    }

    const [students, total, facetResults] = await Promise.all([
      studentQuery.lean(),
      User.countDocuments(query),
      User.aggregate([
        { $match: baseQuery },
        {
          $facet: {
            semesters: [
              { $match: { semester: { $gte: 1, $lte: 8 } } },
              { $group: { _id: '$semester', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            branches: stringFacet('branch'),
            courses: stringFacet('course'),
            colleges: stringFacet('college'),
            groups: stringFacet('group'),
            coordinators: stringFacet('teacherIds', true),
          },
        },
      ]),
    ]);
    
    // Map teacherIds to teacherId for backwards compatibility with frontend
    const studentsWithTeacherId = students.map(s => ({
      ...s,
      teacherId: Array.isArray(s.teacherIds) ? s.teacherIds.join(', ') : (s.teacherIds || ''),
      // Legacy/imported students may not have mustChangePassword populated.
      // A missing login marker is the authoritative signal that resetting to a
      // new temporary password is still safe.
      canResendCredentials: !s.activeSessionCreatedAt
        && (
          s.credentialEmailStatus !== 'pending'
          || !s.credentialEmailLastAttemptAt
          || Date.now() - new Date(s.credentialEmailLastAttemptAt).getTime() > 5 * 60 * 1000
        ),
      // Historical deliveries were not tracked. Never claim they were not sent.
      credentialEmailStatus: s.credentialEmailStatus || 'unconfirmed',
      mustChangePassword: undefined,
      activeSessionCreatedAt: undefined,
    }));
    
    const pages = paginated ? Math.max(1, Math.ceil(total / requestedLimit)) : 1;
    const facets = facetResults[0] || {};
    res.json({
      count: studentsWithTeacherId.length,
      total,
      students: studentsWithTeacherId,
      pagination: {
        page: paginated ? Math.min(requestedPage, pages) : 1,
        limit: paginated ? requestedLimit : total,
        pages,
        total,
      },
      facets: {
        semesters: (facets.semesters || []).map((entry) => ({
          value: Number(entry._id),
          label: `Semester ${entry._id}`,
          count: entry.count,
        })),
        branches: mapFacet(facets.branches),
        courses: mapFacet(facets.courses),
        colleges: mapFacet(facets.colleges),
        groups: mapFacet(facets.groups),
        coordinators: mapFacet(facets.coordinators),
      },
    });
  } catch (err) {
    console.error('Error listing students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
}

export async function resendStudentCredentials(req, res) {
  const requestedIds = Array.isArray(req.body?.studentIds) ? req.body.studentIds : [];
  const studentIds = [...new Set(requestedIds.map((id) => String(id || '').trim()).filter(Boolean))];

  if (!studentIds.length) return res.status(400).json({ error: 'Select at least one student.' });
  if (studentIds.length > 5000) return res.status(400).json({ error: 'You can queue credentials for at most 5000 students at once.' });
  try {
    studentIds.forEach((id) => validateObjectId(id, 'student ID'));
  } catch {
    return res.status(400).json({ error: 'One or more student IDs are invalid.' });
  }

  const candidates = await User.find({
    _id: { $in: studentIds },
    role: 'student',
    activeSessionCreatedAt: { $exists: false },
  }).select('_id name email studentId passwordHash mustChangePassword activeSessionCreatedAt');
  const batchId = crypto.randomUUID();
  const students = [];

  // Atomically claim each student so double-clicks cannot queue duplicate passwords.
  const stalePendingBefore = new Date(Date.now() - 5 * 60 * 1000);
  for (const candidate of candidates) {
    const claimed = await User.findOneAndUpdate(
      {
        _id: candidate._id,
        role: 'student',
        activeSessionCreatedAt: { $exists: false },
        $or: [
          { credentialEmailStatus: { $ne: 'pending' } },
          { credentialEmailLastAttemptAt: { $lt: stalePendingBefore } },
          { credentialEmailLastAttemptAt: { $exists: false } },
        ],
      },
      {
        $set: {
          credentialEmailStatus: 'pending',
          credentialEmailLastAttemptAt: new Date(),
          credentialEmailBatchId: batchId,
        },
        $unset: { credentialEmailLastError: 1 },
      },
      { new: false },
    ).select('_id name email studentId passwordHash');
    if (claimed) students.push(claimed);
  }

  const skipped = studentIds.length - students.length;
  const jobs = students.map((student) => {
    const password = generateRandomPassword();
    return {
      type: 'student_credentials',
      to: student.email,
      recipientId: student._id,
      targetType: 'STUDENT',
      targetId: student._id,
      idempotencyKey: `student-credentials:${student._id}:${batchId}`,
      payload: {
        to: student.email,
        studentId: student.studentId,
        password,
        previousPasswordHash: student.passwordHash,
      },
    };
  }).filter((job) => job.to);
  const queuedStudentIds = new Set(jobs.map((job) => String(job.recipientId)));
  const missingDeliveryDetails = students.filter((student) => !queuedStudentIds.has(String(student._id)));
  if (missingDeliveryDetails.length) {
    await User.updateMany(
      { _id: { $in: missingDeliveryDetails.map((student) => student._id) }, credentialEmailBatchId: batchId },
      {
        $set: {
          credentialEmailStatus: 'failed',
          credentialEmailLastError: 'Email address is missing.',
        },
        $unset: { credentialEmailBatchId: 1 },
      },
    );
  }
  await enqueueMailJobs(jobs, {
    batchId,
    requestedBy: req.user._id,
    requestedByEmail: req.user.email,
  });

  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'UPDATE',
    targetType: 'STUDENT',
    description: `Queued login credentials for ${students.length} student${students.length === 1 ? '' : 's'}`,
    metadata: { requested: studentIds.length, queued: students.length, skipped, batchId },
    req,
  });

  res.status(202).json({
    message: students.length
      ? `${students.length} credential email${students.length === 1 ? '' : 's'} queued for background delivery.`
      : 'No eligible credential emails were queued.',
    requested: studentIds.length,
    queued: jobs.length,
    skipped,
    batchId,
  });

}

function promotionStudentScope(user = {}) {
  return user.role === 'coordinator'
    ? { role: 'student', teacherIds: user.coordinatorId }
    : { role: 'student' };
}

export async function listPromotionSemesters(req, res) {
  try {
    const scope = promotionStudentScope(req.user);
    const counts = await User.aggregate([
      { $match: scope },
      { $group: { _id: '$semester', count: { $sum: 1 } } },
    ]);
    const countMap = new Map(counts.map((entry) => [Number(entry._id), entry.count]));
    return res.json({
      semesters: Array.from({ length: 8 }, (_, index) => ({
        semester: index + 1,
        studentCount: countMap.get(index + 1) || 0,
        promotable: index + 1 < 8,
      })),
    });
  } catch (error) {
    console.error('Error loading promotion semesters:', error);
    return res.status(500).json({ error: 'Failed to load semester promotion data.' });
  }
}

export async function listPromotionStudents(req, res) {
  try {
    const semester = Number(req.params.semester);
    if (!Number.isInteger(semester) || semester < 1 || semester > 8) {
      return res.status(400).json({ error: 'Semester must be between 1 and 8.' });
    }
    const students = await User.find({ ...promotionStudentScope(req.user), semester })
      .select('_id name email studentId course branch college semester group teacherIds')
      .sort({ name: 1, studentId: 1 })
      .lean();
    return res.json({ semester, count: students.length, students });
  } catch (error) {
    console.error('Error loading promotion students:', error);
    return res.status(500).json({ error: 'Failed to load students for promotion.' });
  }
}

export async function promoteStudents(req, res) {
  try {
    const fromSemester = Number(req.body?.fromSemester);
    const promoteAll = req.body?.promoteAll === true;
    const studentIds = Array.isArray(req.body?.studentIds) ? [...new Set(req.body.studentIds.map(String))] : [];
    if (!Number.isInteger(fromSemester) || fromSemester < 1 || fromSemester > 8) {
      return res.status(400).json({ error: 'Source semester must be between 1 and 8.' });
    }
    if (fromSemester === 8) return res.status(400).json({ error: 'Semester 8 is the final semester and cannot be promoted further.' });
    if (!promoteAll && !studentIds.length) return res.status(400).json({ error: 'Select at least one student to promote.' });

    const query = { ...promotionStudentScope(req.user), semester: fromSemester };
    if (!promoteAll) {
      const validIds = studentIds.filter((id) => {
        try { validateObjectId(id, 'student ID'); return true; } catch { return false; }
      });
      if (!validIds.length) return res.status(400).json({ error: 'No valid students were selected.' });
      query._id = { $in: validIds };
    }
    const eligible = await User.find(query).select('_id').lean();
    if (!eligible.length) return res.status(400).json({ error: 'No eligible students were found in this semester.' });
    const ids = eligible.map((student) => student._id);
    const result = await User.updateMany({ _id: { $in: ids }, semester: fromSemester }, { $set: { semester: fromSemester + 1 } });

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'BULK_UPDATE',
      targetType: 'STUDENT',
      targetId: 'semester-promotion',
      description: `Promoted ${result.modifiedCount || 0} student${Number(result.modifiedCount || 0) === 1 ? '' : 's'} from semester ${fromSemester} to ${fromSemester + 1}`,
      metadata: { fromSemester, toSemester: fromSemester + 1, promoteAll, selectedCount: studentIds.length, promotedCount: result.modifiedCount || 0 },
      req,
    });
    return res.json({
      ok: true,
      fromSemester,
      toSemester: fromSemester + 1,
      requested: eligible.length,
      promoted: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error('Error promoting students:', error);
    return res.status(500).json({ error: 'Failed to promote students.' });
  }
}

export async function getStudentById(req, res) {
  try {
    const user = req.user;
    const { studentId } = req.params;
    const query = user.role === 'coordinator'
      ? { _id: studentId, role: 'student', teacherIds: user.coordinatorId }
      : { _id: studentId, role: 'student' };

    const student = await User.findOne(query)
      .select('name email studentId course branch college semester group teacherIds avatarUrl createdAt isSpecialStudent bio linkedinUrl githubUrl portfolioUrl')
      .lean();

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    res.json({
      student: {
        ...student,
        teacherId: Array.isArray(student.teacherIds) ? student.teacherIds.join(', ') : (student.teacherIds || ''),
      },
    });
  } catch (err) {
    console.error('Error fetching student:', err);
    res.status(500).json({ error: 'Failed to fetch student' });
  }
}

// Export all students as CSV (same format as upload template)
export async function exportStudentsCsv(req, res) {
  try {
    const user = req.user;
    const { query } = buildStudentListQuery(user, req.query);
    const sort = req.query.sortOrder === 'desc' || req.query.sortOrder === '-1' ? -1 : 1;
    
    const students = await User.find(query)
      .select('name email studentId course branch college semester group teacherIds bio linkedinUrl githubUrl portfolioUrl')
      .sort({ createdAt: sort, _id: sort })
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
    const hasFilters = ['search', 'semester', 'branch', 'course', 'college', 'group', 'coordinator']
      .some((key) => String(req.query[key] || '').trim());
    const filename = hasFilters ? 'students-filtered-export.csv' : 'students-export.csv';
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Exported-Count', String(students.length));
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
  const createdUserIds = [];

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
        credentialEmailStatus: 'not_sent',
      });
      createdUserIds.push(user._id);
      results.push({ row: row.__row, id: user._id, email, studentid, status: 'created' });
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

  if (createdUserIds.length > 0) {
    setImmediate(async () => {
      try {
        const notifs = createdUserIds.map(id => ({
          userId: id,
          title: 'Account Created',
          message: 'Your account has been created',
          type: 'SYSTEM',
          referenceId: id,
          actionUrl: '/student/dashboard',
          dedupeKey: `account-created:${id}`
        }));
        await createNotifications(notifs);
      } catch (err) {
        console.error('[uploadStudentsCsv] Notification error:', err.message);
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
    const userData = {
      role: 'student', name, email, studentId: studentid, passwordHash, branch, course, college,
      teacherIds: teacherIdList, semester: semesterNum, mustChangePassword: true,
      credentialEmailStatus: 'not_sent',
    };
    
    // Add group if provided
    if (group) {
      userData.group = group;
    }
    
    const user = await User.create(userData);

    try {
      await createNotification({
        userId: user._id,
        title: 'Account Created',
        message: 'Your account has been created',
        type: 'SYSTEM',
        referenceId: user._id,
        actionUrl: '/student/dashboard',
        dedupeKey: `account-created:${user._id}`
      });
    } catch (e) {
      console.error('[createStudent] Notification error:', e.message);
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

    res.status(201).json({ id: user._id, email: user.email, studentid: user.studentId, status: 'created' });

    return;
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
      .select('name email studentId course branch college semester group specialEvents createdAt teacherIds avatarUrl bio linkedinUrl githubUrl portfolioUrl')
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
      .select('name email studentId course branch college semester group createdAt teacherIds bio linkedinUrl githubUrl portfolioUrl')
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

export async function bulkDeleteStudents(req, res) {
  try {
    const studentIds = Array.isArray(req.body?.studentIds)
      ? [...new Set(req.body.studentIds.map((id) => String(id).trim()).filter(Boolean))]
      : [];

    if (!studentIds.length) {
      return res.status(400).json({ error: 'Select at least one student to delete.' });
    }
    if (studentIds.length > 500) {
      return res.status(400).json({ error: 'Bulk delete is limited to 500 students at a time.' });
    }

    const validIds = studentIds.filter((id) => {
      try {
        validateObjectId(id, 'student ID');
        return true;
      } catch {
        return false;
      }
    });
    if (validIds.length !== studentIds.length) {
      return res.status(400).json({ error: 'One or more selected students are invalid.' });
    }

    const students = await User.find({ _id: { $in: validIds }, role: 'student' })
      .select('_id name email studentId')
      .lean();

    if (!students.length) {
      return res.status(404).json({ error: 'No selected students were found.' });
    }

    const idsToDelete = students.map((student) => student._id);
    const result = await User.deleteMany({ _id: { $in: idsToDelete }, role: 'student' });

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'BULK_DELETE',
      targetType: 'STUDENT',
      targetId: 'bulk-delete',
      description: `Deleted ${result.deletedCount || 0} selected student${Number(result.deletedCount || 0) === 1 ? '' : 's'}`,
      metadata: {
        requestedCount: studentIds.length,
        deletedCount: result.deletedCount || 0,
        students: students.map((student) => ({
          id: String(student._id),
          name: student.name,
          email: student.email,
          studentId: student.studentId,
        })),
      },
      req,
    });

    return res.json({
      message: 'Selected students deleted successfully',
      requested: studentIds.length,
      deleted: result.deletedCount || 0,
      students: students.map((student) => ({
        id: student._id,
        name: student.name,
        email: student.email,
        studentId: student.studentId,
      })),
    });
  } catch (err) {
    console.error('Error bulk deleting students:', err);
    return res.status(500).json({ error: 'Failed to delete selected students' });
  }
}

// Update a student (admin only)
export async function updateStudent(req, res) {
  try {
    const { studentId } = req.params;
    const { name, email, studentId: sid, course, branch, college, semester, group, teacherId, bio, linkedinUrl, githubUrl, portfolioUrl } = req.body;
    
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
    if (bio !== undefined) student.bio = typeof bio === 'string' ? bio.trim() : '';
    if (linkedinUrl !== undefined) student.linkedinUrl = typeof linkedinUrl === 'string' ? linkedinUrl.trim() : '';
    if (githubUrl !== undefined) student.githubUrl = typeof githubUrl === 'string' ? githubUrl.trim() : '';
    if (portfolioUrl !== undefined) student.portfolioUrl = typeof portfolioUrl === 'string' ? portfolioUrl.trim() : '';
    
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
        teacherId: Array.isArray(student.teacherIds) ? student.teacherIds.join(', ') : '',
        bio: student.bio || '',
        linkedinUrl: student.linkedinUrl || '',
        githubUrl: student.githubUrl || '',
        portfolioUrl: student.portfolioUrl || '',
      }
    });
  } catch (err) {
    console.error('Error updating student:', err);
    res.status(500).json({ error: 'Failed to update student' });
  }
}

