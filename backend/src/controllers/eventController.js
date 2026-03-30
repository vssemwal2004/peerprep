import { sendSlotProposalEmail, sendSlotAcceptanceEmail, sendInterviewScheduledEmail, sendMail, renderTemplate, sendEventNotificationEmail, sendOnboardingEmail } from '../utils/mailer.js';
import Pair from '../models/Pair.js';
import SlotProposal from '../models/SlotProposal.js';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { HttpError } from '../utils/errors.js';
import { supabase } from '../utils/supabase.js';
import { logActivity } from './adminActivityController.js';
import Event from '../models/Event.js';
import User from '../models/User.js';

// Fisher-Yates shuffle algorithm for random array shuffling
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
import Feedback from '../models/Feedback.js';
import { parse } from 'csv-parse/sync';

// Helper function to format date as "6/11/2025, 12:16:00 PM"
function formatDateTime(date) {
  return new Date(date).toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

// Allowed interview window (local server time) 10:00 - 22:00
const ALLOWED_START_HOUR = 10; // inclusive
const ALLOWED_END_HOUR = 22;  // exclusive (i.e. last valid hour starts at 21:59)

function isWithinAllowedHours(d) {
  if (!d) return false;
  const h = d.getHours();
  return h >= ALLOWED_START_HOUR && h < ALLOWED_END_HOUR;
}

// Generate a random future slot inside allowed window for a given base date
function generateRandomSlot(baseDate) {
  const now = new Date();
  let day = baseDate ? new Date(baseDate) : new Date();
  // Ensure day has time zeroed before adding random time
  day.setHours(0,0,0,0);

  // If base day already fully past allowed window today, move to next day
  if (day.toDateString() === now.toDateString() && now.getHours() >= ALLOWED_END_HOUR) {
    day = new Date(day.getTime() + 24*60*60*1000);
  }

  // Pick random hour within allowed window
  // Keep picking until we get a future time
  for (let i = 0; i < 10; i++) {
    const hour = Math.floor(Math.random() * (ALLOWED_END_HOUR - ALLOWED_START_HOUR)) + ALLOWED_START_HOUR;
    const minute = Math.floor(Math.random() * 60);
    const slot = new Date(day.getTime());
    slot.setHours(hour, minute, 0, 0);
    if (slot.getTime() > now.getTime() && isWithinAllowedHours(slot)) {
      return slot;
    }
  }
  // Fallback: next day at start of window
  const next = new Date(day.getTime() + 24*60*60*1000);
  next.setHours(ALLOWED_START_HOUR, 0, 0, 0);
  return next;
}

// PATCH /events/:id/join-disable
export async function updateEventJoinDisable(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) throw new HttpError(404, 'Event not found');
  const { joinDisabled, joinDisableTime } = req.body;
  // Manual disable overrides scheduled disable
  if (typeof joinDisabled !== 'undefined') {
    event.joinDisabled = !!joinDisabled;
    if (joinDisabled) {
      event.joinDisableTime = null; // clear scheduled if manually disabled
    }
  }
  if (typeof joinDisableTime !== 'undefined' && !event.joinDisabled) {
    event.joinDisableTime = joinDisableTime ? new Date(joinDisableTime) : null;
  }
  await event.save();
  
  // Log activity
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'UPDATE',
    targetType: 'EVENT',
    targetId: event._id.toString(),
    description: `Updated event join settings: ${event.name}`,
    metadata: { joinDisabled: event.joinDisabled },
    req
  });
  
  res.json(event);
}

async function uploadTemplate(file) {
  if (!file) return {};
  if (!supabase) throw new HttpError(500, 'Supabase not configured.');
  const bucket = process.env.SUPABASE_BUCKET || 'templates';
  const templateName = file.originalname;
  const key = `${Date.now()}_${templateName}`;
  const contentType = file.mimetype || 'application/octet-stream';
  // multer provides file.buffer (Buffer) - use it directly for Node environment
  const data = file.buffer;
  let upErr;
  try { const up = await supabase.storage.from(bucket).upload(key, data, { contentType, upsert: false }); upErr = up.error || null; } catch (e) { upErr = e; }
  if (upErr) {
  try { await supabase.storage.createBucket(bucket, { public: process.env.SUPABASE_PUBLIC === 'true' }); const retry = await supabase.storage.from(bucket).upload(key, data, { contentType, upsert: false }); if (retry.error) throw retry.error; } catch (e2) { throw new HttpError(500, 'Template upload failed: ' + (upErr?.message || e2?.message || 'unknown')); }
  }
  let templateUrl;
  if (process.env.SUPABASE_PUBLIC === 'true') {
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
    templateUrl = pub.publicUrl;
  } else {
    const ttl = Number(process.env.SUPABASE_SIGNED_TTL || 600);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, ttl);
    if (error) throw new HttpError(500, `Failed to create signed URL: ${error.message}`);
    templateUrl = data.signedUrl;
  }
  return { templateUrl, templateName, templateKey: key };
}

export async function createEvent(req, res) {
  const { name, description, startDate, endDate, allowedParticipants } = req.body;
  // Validate dates
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const now = Date.now();
    // Normalize allowedParticipants from body (may come as string in multipart)
    let coordinatorId = undefined;
    let finalAllowed = [];
    if (allowedParticipants) {
      if (Array.isArray(allowedParticipants)) {
        finalAllowed = allowedParticipants;
      } else if (typeof allowedParticipants === 'string') {
        try {
          const parsed = JSON.parse(allowedParticipants);
          if (Array.isArray(parsed)) finalAllowed = parsed; else finalAllowed = allowedParticipants.split(',').map(s=>s.trim()).filter(Boolean);
        } catch {
          finalAllowed = allowedParticipants.split(',').map(s=>s.trim()).filter(Boolean);
        }
      }
    }

    // If a coordinator is creating the event, scope participants to their students
    if (req.user?.role === 'coordinator') {
      coordinatorId = req.user.coordinatorId;
      if (!coordinatorId) {
        return res.status(400).json({ success: false, message: 'Coordinator ID missing on user' });
      }
      // Filter allowedParticipants to only students assigned to this coordinator
      if (Array.isArray(finalAllowed) && finalAllowed.length) {
        const students = await User.find({
          _id: { $in: finalAllowed },
          role: 'student',
          teacherIds: coordinatorId,
        }).select('_id');
        finalAllowed = students.map(s => s._id);
      }
    }

    const tpl = await uploadTemplate(req.file);
    const event = await Event.create({
      name,
      description,
      startDate: start || undefined,
      endDate: end || undefined,
      ...tpl,
      allowedParticipants: finalAllowed,
      coordinatorId,
    });

  // Log activity
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'CREATE',
    targetType: 'EVENT',
    targetId: event._id.toString(),
    description: `Created event: ${name}`,
    metadata: { hasTemplate: !!tpl, coordinatorId },
    req
  });
  
  // Send response immediately - emails will be sent asynchronously
  res.status(201).json(event);
  
  // Send emails and generate pairs asynchronously (non-blocking)
  setImmediate(async () => {
    try {
      let studentsQuery = { role: 'student', email: { $exists: true, $ne: null } };
      // If coordinator event, restrict to assigned students
      if (event.coordinatorId) {
        studentsQuery = { ...studentsQuery, teacherIds: event.coordinatorId };
      }
      let students = await User.find(studentsQuery, '_id email name');
      // If allowedParticipants was provided, intersect with it
      if (Array.isArray(event.allowedParticipants) && event.allowedParticipants.length) {
        const allowedSet = new Set(event.allowedParticipants.map(id => id.toString()));
        students = students.filter(s => allowedSet.has(s._id.toString()));
      }
      const ids = students.map(s => s._id.toString());
      // Set participants to eligible students only
      event.participants = students.map(s => s._id);
      await event.save();
      
      // Generate pairs with randomized shuffling for unique pairings each event
      if (ids.length >= 2) {
        // Shuffle the student IDs to create different pairings for each event
        const shuffledIds = shuffleArray(ids);
        const pairsRaw = shuffledIds.map((id, i) => [id, shuffledIds[(i + 1) % shuffledIds.length]]);
        await Pair.deleteMany({ event: event._id });
        const insertedPairs = await Pair.insertMany(pairsRaw.map(([a, b]) => ({ event: event._id, interviewer: a, interviewee: b })));
        console.log(`[createEvent] Created ${insertedPairs.length} randomized pairs for event ${event._id}`);
        // For each pair, auto-generate a random slot inside allowed window and create SlotProposal docs for both parties
        const baseDay = start || new Date();
        const proposalsToInsert = [];
        for (const p of insertedPairs) {
          const slot = generateRandomSlot(baseDay);
          proposalsToInsert.push({ event: event._id, pair: p._id, user: p.interviewer, slots: [slot] });
          proposalsToInsert.push({ event: event._id, pair: p._id, user: p.interviewee, slots: [slot] });
        }
        if (proposalsToInsert.length) {
          await SlotProposal.insertMany(proposalsToInsert);
          console.log(`[createEvent] Auto-assigned initial random slot for ${insertedPairs.length} pairs`);
        }
      }
      
      // Send event notification emails using unified mailer.js function
      if (process.env.EMAIL_ON_EVENT === 'true') {
        const emailPromises = students.map(s => {
          return sendEventNotificationEmail({
            to: s.email,
            event: {
              title: name,
              date: formatDateTime(startDate),
              details: description,
              templateUrl: tpl.templateUrl
            },
            interviewer: s.name || s.email,
            interviewee: ''
          }).catch(err => {
            console.error(`[createEvent] Failed to send email to ${s.email}:`, err.message);
            return null;
          });
        });
        
        await Promise.all(emailPromises);
        console.log(`[createEvent] Sent ${students.length} event notification emails`);
      }
    } catch (e) {
      console.error('[createEvent] Async email/pairing failed', e.message);
    }
  });
}

// Helper to normalize CSV row fields
function normalizeSpecialEventRow(row) {
  return {
    name: row.name || row.Name || row.NAME || '',
    email: (row.email || row.Email || row.EMAIL || '').trim().toLowerCase(),
    studentid: (row.studentid || row.studentId || row.StudentId || row.Studentid || row.STUDENTID || row.studentID || row.student_id || '').toString().trim(),
    branch: row.branch || row.Branch || row.BRANCH || '',
    course: row.course || row.Course || row.COURSE || '',
    college: row.college || row.College || row.COLLEGE || '',
    semester: row.semester || row.Semester || row.SEMESTER || '',
    group: row.group || row.Group || row.GROUP || '',
    password: row.password || row.Password || row.PASSWORD || '',
    // Support multiple header variants for Teacher/Coordinator ID (with or without spaces/underscore)
    teacherid: (
      row.teacherid ||
      row.teacherId ||
      row.TeacherId ||
      row.TeacherID ||
      row.TEACHERID ||
      row.teacher_id ||
      row.coordinatorId ||
      row.CoordinatorId ||
      row['Teacher ID'] ||
      row['teacher ID'] ||
      row['TEACHER ID'] ||
      row['Coordinator ID'] ||
      row['coordinator ID'] ||
      ''
    )
      .toString()
      .trim(),
  };
}

// Validate special event CSV and return detailed results
export async function checkSpecialEventCsv(req, res) {
  if (!req.file) return res.status(400).json({ error: 'CSV file required' });
  
  const csvText = req.file.buffer.toString('utf8');
  let rows;
  try {
    rows = parse(csvText, { columns: true, skip_empty_lines: true });
  } catch (e) {
    return res.status(400).json({ error: 'Invalid CSV: ' + (e.message || e) });
  }

  const results = [];
  const requiredFields = ['name', 'email', 'studentid', 'branch'];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  // Track duplicates inside the CSV
  const seenEmails = new Set();
  const seenStudentIds = new Set();

  // For coordinators, get their assigned students
  let assignedStudents = null;
  if (req.user?.role === 'coordinator') {
    const coordinatorId = req.user.coordinatorId;
    if (!coordinatorId) {
      return res.status(400).json({ error: 'Coordinator ID missing' });
    }
    // Get all students assigned to this coordinator
    assignedStudents = await User.find({ 
      role: 'student', 
      teacherIds: coordinatorId 
    }).select('email studentId name branch semester group teacherIds');
  }

  const normalizedRows = rows.map((r, idx) => ({ ...normalizeSpecialEventRow(r), __row: idx + 2 }));

  // For admins, pre-load related DB records to validate CSV against existing data
  let existingUsersByEmail = new Map();
  let existingUsersById = new Map();
  let validCoordinatorIds = new Set();

  if (req.user?.role === 'admin') {
    const emails = normalizedRows.map((r) => r.email).filter(Boolean);
    const studentIds = normalizedRows.map((r) => r.studentid).filter(Boolean);

    const [existingUsers, coordinators] = await Promise.all([
      User.find({
        role: 'student',
        $or: [
          { email: { $in: emails } },
          { studentId: { $in: studentIds } },
        ],
      }).select('email studentId name branch semester group course college teacherIds').lean(),
      User.find({ role: 'coordinator' }).select('coordinatorId').lean(),
    ]);

    existingUsers.forEach((u) => {
      if (u.email) existingUsersByEmail.set(u.email.toLowerCase(), u);
      if (u.studentId) existingUsersById.set(String(u.studentId), u);
    });
    validCoordinatorIds = new Set(
      coordinators
        .map((c) => (c.coordinatorId || '').toString().trim())
        .filter(Boolean)
    );
  }

  for (const row of normalizedRows) {
    const { name, email, studentid, branch, teacherid } = row;

    // Skip completely empty rows
    if (!email && !studentid && !name) continue;

    // Check required fields
    const missing = requiredFields.filter((f) => {
      if (f === 'studentid') return !studentid;
      if (f === 'name') return !name;
      if (f === 'email') return !email;
      if (f === 'branch') return !branch;
      return false;
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
    if (seenEmails.has(email) || seenStudentIds.has(studentid)) {
      results.push({ row: row.__row, email, studentid, status: 'duplicate_in_file' });
      continue;
    }
    seenEmails.add(email);
    seenStudentIds.add(studentid);

    // For coordinators, validate that student is assigned to them AND exists in User database
    if (assignedStudents !== null) {
      const assignedStudent = assignedStudents.find(s => 
        s.email.toLowerCase() === email.toLowerCase() && 
        s.studentId === studentid
      );
      
      if (!assignedStudent) {
        results.push({ 
          row: row.__row, 
          name,
          email, 
          studentid, 
          status: 'not_assigned_to_coordinator',
          message: `Student "${name}" (${studentid}) is either not assigned to you or does not exist in the system. Coordinators can only add existing assigned students to special events.`
        });
        continue;
      }
      
      // Validate that CSV fields match the existing User record
      const mismatches = [];
      
      if (assignedStudent.name && assignedStudent.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
        mismatches.push(`name (expected: ${assignedStudent.name}, got: ${name})`);
      }
      
      if (assignedStudent.email && assignedStudent.email.toLowerCase() !== email.toLowerCase()) {
        mismatches.push(`email (expected: ${assignedStudent.email}, got: ${email})`);
      }
      
      if (assignedStudent.studentId && String(assignedStudent.studentId) !== studentid) {
        mismatches.push(`studentId (expected: ${assignedStudent.studentId}, got: ${studentid})`);
      }
      
      if (assignedStudent.branch && branch && assignedStudent.branch.trim().toLowerCase() !== branch.trim().toLowerCase()) {
        mismatches.push(`branch (expected: ${assignedStudent.branch}, got: ${branch})`);
      }
      
      if (assignedStudent.semester && row.semester && String(assignedStudent.semester) !== String(row.semester)) {
        mismatches.push(`semester (expected: ${assignedStudent.semester}, got: ${row.semester})`);
      }
      
      if (assignedStudent.group && row.group && assignedStudent.group.trim().toLowerCase() !== row.group.trim().toLowerCase()) {
        mismatches.push(`group (expected: ${assignedStudent.group}, got: ${row.group})`);
      }
      
      // Check teacherIds array - teacherid from CSV should be in the student's teacherIds
      const studentTeacherIds = Array.isArray(assignedStudent.teacherIds) ? assignedStudent.teacherIds : [];
      if (teacherid && studentTeacherIds.length > 0 && !studentTeacherIds.includes(teacherid.trim())) {
        mismatches.push(`teacherId (expected one of: ${studentTeacherIds.join(', ')}, got: ${teacherid})`);
      }
      
      if (mismatches.length > 0) {
        results.push({ 
          row: row.__row, 
          name,
          email, 
          studentid, 
          status: 'data_mismatch',
          message: `CSV data does not match database record for this student. Mismatched fields: ${mismatches.join(', ')}`
        });
        continue;
      }
    }

    // For admins, validate CSV data against existing DB records and coordinator assignments
    if (req.user?.role === 'admin') {
      const lowerEmail = email.toLowerCase();
      const userByEmail = existingUsersByEmail.get(lowerEmail);
      const userById = existingUsersById.get(studentid);

      // Validate that Teacher ID (if provided) belongs to a coordinator
      if (teacherid && !validCoordinatorIds.has(teacherid)) {
        results.push({
          row: row.__row,
          name,
          email,
          studentid,
          status: 'invalid_coordinator',
          message: `Teacher ID / Coordinator code "${teacherid}" does not match any existing coordinator.`,
        });
        continue;
      }

      // Helper to validate consistency between CSV and an existing record (all fields)
      const validateRecord = (record, source) => {
        if (!record) return null;
        const mismatches = [];
        
        // Check required fields
        if (record.email && record.email.toLowerCase() !== lowerEmail) {
          mismatches.push(`email (expected: ${record.email}, got: ${email})`);
        }
        if (record.studentId && String(record.studentId) !== studentid) {
          mismatches.push(`studentId (expected: ${record.studentId}, got: ${studentid})`);
        }
        if (record.name && record.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
          mismatches.push(`name (expected: ${record.name}, got: ${name})`);
        }
        if (record.branch && record.branch.trim().toLowerCase() !== branch.trim().toLowerCase()) {
          mismatches.push(`branch (expected: ${record.branch}, got: ${branch})`);
        }
        
        // Check optional fields if they exist in database
        if (record.course && row.course && record.course.trim().toLowerCase() !== row.course.trim().toLowerCase()) {
          mismatches.push(`course (expected: ${record.course}, got: ${row.course})`);
        }
        if (record.college && row.college && record.college.trim().toLowerCase() !== row.college.trim().toLowerCase()) {
          mismatches.push(`college (expected: ${record.college}, got: ${row.college})`);
        }
        if (record.semester && row.semester && String(record.semester) !== String(row.semester)) {
          mismatches.push(`semester (expected: ${record.semester}, got: ${row.semester})`);
        }
        if (record.group && row.group && record.group.trim().toLowerCase() !== row.group.trim().toLowerCase()) {
          mismatches.push(`group (expected: ${record.group}, got: ${row.group})`);
        }
        
        if (mismatches.length > 0) {
          return `CSV data does not match existing ${source} record. Mismatched fields: ${mismatches.join(', ')}`;
        }
        return null;
      };

      const userMismatch = validateRecord(userByEmail || userById, 'User');

      if (userMismatch) {
        results.push({
          row: row.__row,
          name,
          email,
          studentid,
          status: 'db_mismatch',
          message: userMismatch,
        });
        continue;
      }

      // If there is an existing record with assigned coordinators, enforce match on Teacher ID
      const sourceRecord = userByEmail || userById;
      const sourceTeacherIds = Array.isArray(sourceRecord?.teacherIds) ? sourceRecord.teacherIds : [];
      if (sourceRecord && sourceTeacherIds.length > 0) {
        const csvTeacherId = (teacherid || '').trim();

        if (!csvTeacherId) {
          results.push({
            row: row.__row,
            name,
            email,
            studentid,
            status: 'missing_teacherid',
            message: 'Teacher ID / Coordinator code is required for existing students and must match one of their assigned coordinators.',
          });
          continue;
        }

        if (!sourceTeacherIds.includes(csvTeacherId)) {
          results.push({
            row: row.__row,
            name,
            email,
            studentid,
            status: 'db_mismatch',
            message: `CSV Teacher ID / Coordinator code does not match any assigned coordinator for this student. Expected one of: ${sourceTeacherIds.join(', ')}`,
          });
          continue;
        }
      }
    }

    // Mark as ready to create (no database checks shown to user)
    results.push({ row: row.__row, name, email, studentid, status: 'ready' });
  }

  res.json({ count: results.length, results });
}

export async function createSpecialEvent(req, res) {
  const { name, description, startDate, endDate } = req.body;
  
  // Validate dates
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const now = Date.now();
  
  if (start && start.getTime() < now) throw new HttpError(400, 'Start date cannot be in the past');
  if (start && end && end.getTime() < start.getTime()) throw new HttpError(400, 'End date must be the same or after start date');
  if (!req.files?.csv?.[0]) throw new HttpError(400, 'CSV file required');

  // Get coordinatorId if coordinator is creating the event
  let coordinatorId = undefined;
  let assignedStudents = null;
  if (req.user?.role === 'coordinator') {
    coordinatorId = req.user.coordinatorId;
    if (!coordinatorId) {
      return res.status(400).json({ success: false, message: 'Coordinator ID missing on user' });
    }
    // Get all students assigned to this coordinator for validation
    assignedStudents = await User.find({ 
      role: 'student', 
      teacherIds: coordinatorId 
    }).select('email studentId name');
  }

  // Parse CSV
  let rows;
  try {
    rows = parse(req.files.csv[0].buffer.toString('utf8'), { columns: true, skip_empty_lines: true });
  } catch (e) {
    throw new HttpError(400, 'Invalid CSV: ' + (e.message || e));
  }

  // Normalize rows once for validation and processing
  const normalizedRows = rows.map((r, idx) => ({ ...normalizeSpecialEventRow(r), __row: idx + 2 }));

  // For admins, pre-validate CSV data against existing DB records and coordinator assignments
  if (req.user?.role === 'admin') {
    const emails = normalizedRows.map((r) => r.email).filter(Boolean);
    const studentIds = normalizedRows.map((r) => r.studentid).filter(Boolean);

    const [existingUsers, coordinators] = await Promise.all([
      User.find({
        role: 'student',
        $or: [
          { email: { $in: emails } },
          { studentId: { $in: studentIds } },
        ],
      }).select('email studentId name branch semester group course college teacherIds').lean(),
      User.find({ role: 'coordinator' }).select('coordinatorId').lean(),
    ]);

    const usersByEmail = new Map();
    const usersById = new Map();
    existingUsers.forEach((u) => {
      if (u.email) usersByEmail.set(u.email.toLowerCase(), u);
      if (u.studentId) usersById.set(String(u.studentId), u);
    });
    const validCoordinatorIds = new Set(
      coordinators
        .map((c) => (c.coordinatorId || '').toString().trim())
        .filter(Boolean)
    );

    for (const row of normalizedRows) {
      const { name: csvName, email, studentid, teacherid } = row;
      if (!email && !studentid && !csvName) continue;

      const lowerEmail = email.toLowerCase();
      const user = usersByEmail.get(lowerEmail) || usersById.get(studentid);

      // Teacher ID must reference an existing coordinator when provided
      if (teacherid && !validCoordinatorIds.has(teacherid)) {
        throw new HttpError(
          400,
          `Invalid Teacher ID / Coordinator code "${teacherid}" in CSV (row ${row.__row}). It does not match any existing coordinator.`
        );
      }

      // Validate email & studentId consistency with existing records
      const validateRecord = (record, source) => {
        if (!record) return null;
        if (record.email && record.email.toLowerCase() !== lowerEmail) {
          return `CSV email does not match existing ${source} email for this student (row ${row.__row}).`;
        }
        if (record.studentId && String(record.studentId) !== studentid) {
          return `CSV Student ID does not match existing ${source} Student ID for this student (row ${row.__row}).`;
        }
        return null;
      };

      const userMismatch = validateRecord(user, 'User');

      if (userMismatch) {
        throw new HttpError(400, userMismatch);
      }

      // If there is an existing record with assigned coordinators, enforce match on Teacher ID
      const sourceRecord = user;
      const sourceTeacherIds = Array.isArray(sourceRecord?.teacherIds) ? sourceRecord.teacherIds : [];
      if (sourceRecord && sourceTeacherIds.length > 0) {
        const csvTeacherId = (teacherid || '').trim();

        if (!csvTeacherId) {
          throw new HttpError(
            400,
            `Row ${row.__row}: Teacher ID / Coordinator code is required for existing students and must match one of their assigned coordinators.`,
          );
        }

        if (!sourceTeacherIds.includes(csvTeacherId)) {
          throw new HttpError(
            400,
            `Row ${row.__row}: CSV Teacher ID / Coordinator code does not match any assigned coordinator for this student. Expected one of: ${sourceTeacherIds.join(', ')}`,
          );
        }
      }
    }
  }

  // Upload template first
  const tpl = await uploadTemplate(req.files?.template?.[0]);
  // Create event
  const event = await Event.create({
    name,
    description,
    startDate: start || undefined,
    endDate: end || undefined,
    ...tpl,
    isSpecial: true,
    // For special events, participants are regular User IDs tagged as special students
    allowedParticipants: [],
    participants: [],
    coordinatorId, // Add coordinatorId for coordinator-created special events
  });

  // Process CSV and create/update special-student Users
  const results = [];
  const requiredFields = ['name', 'email', 'studentid', 'branch'];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seenEmails = new Set();
  const seenStudentIds = new Set();
  const createdStudents = []; // For async email sending

  for (const row of normalizedRows) {
    const { course, name, email, studentid, password, branch, college, semester, group, teacherid } = row;
    // Derive teacher to assign: coordinator who created the event, otherwise CSV-provided teacherid
    const effectiveTeacherId = (coordinatorId && String(coordinatorId)) || (teacherid || undefined);

    // Skip completely empty rows
    if (!email && !studentid && !name) continue;

    // Check required fields
    const missing = requiredFields.filter((f) => {
      if (f === 'studentid') return !studentid;
      if (f === 'name') return !name;
      if (f === 'email') return !email;
      if (f === 'branch') return !branch;
      return false;
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

    // Check duplicates inside the CSV
    if (seenEmails.has(email) || seenStudentIds.has(studentid)) {
      results.push({ row: row.__row, email, studentid, status: 'duplicate_in_file' });
      continue;
    }
    seenEmails.add(email);
    seenStudentIds.add(studentid);

    // For coordinators, validate that student is assigned to them
    if (assignedStudents !== null) {
      const isAssigned = assignedStudents.some(s => 
        s.email.toLowerCase() === email.toLowerCase() && 
        s.studentId === studentid
      );
      
      if (!isAssigned) {
        results.push({ 
          row: row.__row, 
          name,
          email, 
          studentid, 
          status: 'not_assigned_to_coordinator',
          error: `Student "${name}" (${studentid}) is either not assigned to you or does not exist in the system. Coordinators can only add existing assigned students.`
        });
        continue;
      }
      
      // For coordinators, student MUST exist in User collection - no new student creation allowed
      const existingUser = await User.findOne({ 
        role: 'student',
        $or: [{ email }, { studentId: studentid }],
        teacherId: coordinatorId
      });
      
      if (!existingUser) {
        results.push({ 
          row: row.__row, 
          name,
          email, 
          studentid, 
          status: 'student_not_found',
          error: `Student "${name}" (${studentid}) does not exist in the main database. Coordinators cannot create new students via special events.`
        });
        continue;
      }
    }

    // Create or update special-student in unified User model
    try {
      const defaultPassword = password || studentid;

      // First check if student exists in User collection
      const existingUser = await User.findOne({
        $or: [{ email }, { studentId: studentid }]
      });

      if (existingUser) {
        // Existing user: mark as special and append this event
        const user = existingUser;
        user.isSpecialStudent = true;
        if (!Array.isArray(user.specialEvents)) user.specialEvents = [];
        const eventIdStr = event._id.toString();
        if (!user.specialEvents.some(eId => eId.toString() === eventIdStr)) {
          user.specialEvents.push(event._id);
        }
        // Add coordinator to teacherIds array if not already present
        if (effectiveTeacherId) {
          if (!Array.isArray(user.teacherIds)) user.teacherIds = [];
          if (!user.teacherIds.includes(effectiveTeacherId)) {
            user.teacherIds.push(effectiveTeacherId);
          }
        }

        // Update group from CSV if provided
        if (group) {
          user.group = group;
        }
        await user.save();

        results.push({
          row: row.__row,
          id: user._id,
          email,
          studentid,
          status: 'added_event_to_existing',
          message: 'Existing student tagged as special for this event'
        });

        // Add to createdStudents but don't send onboarding email (already have credentials)
        createdStudents.push({
          _id: user._id,
          email: user.email,
          name: user.name,
          studentId: user.studentId,
          password: defaultPassword,
          shouldSendOnboarding: false,
        });
        continue;
      }

      // No existing user: only admins can create new special-student users
      if (coordinatorId) {
        results.push({
          row: row.__row,
          email,
          studentid,
          status: 'error',
          message: 'Coordinators cannot create new students. Student must exist in the main database first.'
        });
        continue;
      }

      // New student - create User with special-student tag (admin only)
      const passwordHash = await User.hashPassword(defaultPassword);

      const user = await User.create({
        role: 'student',
        name,
        email,
        studentId: studentid,
        branch,
        course: course || undefined,
        college: college || undefined,
        semester: semester || undefined,
        group: group || undefined,
        teacherIds: effectiveTeacherId ? [effectiveTeacherId] : [],
        passwordHash,
        mustChangePassword: true,
        isSpecialStudent: true,
        specialEvents: [event._id],
      });

      results.push({ row: row.__row, id: user._id, email, studentid, status: 'created' });

      // Add to createdStudents and send onboarding email
      createdStudents.push({
        _id: user._id,
        email: user.email,
        name: user.name,
        studentId: user.studentId,
        password: defaultPassword,
        shouldSendOnboarding: true,
      });
    } catch (err) {
      results.push({ row: row.__row, email, studentid, status: 'error', message: err.message });
    }
  }
  
  // Update event with created student IDs
  event.allowedParticipants = createdStudents.map(s => s._id);
  event.participants = createdStudents.map(s => s._id);
  await event.save();

  // Send response immediately
  res.status(201).json({
    eventId: event._id,
    invited: createdStudents.length,
    name: event.name,
    results,
  });

  // Send emails and generate pairs asynchronously (non-blocking)
  setImmediate(async () => {
    try {
      console.log(`[createSpecialEvent] Processing ${createdStudents.length} special students for event: ${event._id}`);
      
      // Generate pairs with randomized shuffling for unique pairings each event
      if (createdStudents.length >= 2) {
        const ids = createdStudents.map(s => s._id.toString());
        // Shuffle the student IDs to create different pairings for each event
        const shuffledIds = shuffleArray(ids);
        const pairsRaw = shuffledIds.map((id, i) => [id, shuffledIds[(i + 1) % shuffledIds.length]]);
        await Pair.deleteMany({ event: event._id });
        const insertedPairs = await Pair.insertMany(
          pairsRaw.map(([a, b]) => ({
            event: event._id,
            interviewer: a,
            interviewee: b,
          }))
        );
        console.log(`[createSpecialEvent] Created ${insertedPairs.length} randomized pairs for event ${event._id}`);
        // Auto-assign initial random slot proposals for special event pairs
        const baseDay = start || new Date();
        const proposalsToInsert = [];
        for (const p of insertedPairs) {
          const slot = generateRandomSlot(baseDay);
          proposalsToInsert.push({ event: event._id, pair: p._id, user: p.interviewer, slots: [slot] });
          proposalsToInsert.push({ event: event._id, pair: p._id, user: p.interviewee, slots: [slot] });
        }
        if (proposalsToInsert.length) {
          await SlotProposal.insertMany(proposalsToInsert);
          console.log(`[createSpecialEvent] Auto-assigned initial random slot for ${insertedPairs.length} pairs`);
        }
      }

      // Send onboarding emails to special students in parallel (only for new students)
      if (process.env.EMAIL_ON_ONBOARD === 'true' && createdStudents.length > 0) {
        const studentsNeedingOnboarding = createdStudents.filter(s => s.shouldSendOnboarding);
        
        if (studentsNeedingOnboarding.length > 0) {
          const emailPromises = studentsNeedingOnboarding.map(student =>
            sendOnboardingEmail({
              to: student.email,
              studentId: student.studentId,
              password: student.password,
            }).catch(err => {
              console.error(`[createSpecialEvent] Failed to send onboarding email to ${student.email}:`, err.message);
              return null;
            })
          );

          await Promise.all(emailPromises);
          console.log(`[createSpecialEvent] Sent onboarding emails to ${studentsNeedingOnboarding.length} new special students`);
        } else {
          console.log(`[createSpecialEvent] No new students requiring onboarding emails`);
        }
      }

      // Send event notification emails using unified mailer.js function
      if (process.env.EMAIL_ON_EVENT === 'true') {
        const emailPromises = createdStudents.map(s => {
          return sendEventNotificationEmail({
            to: s.email,
            event: {
              title: event.name,
              date: formatDateTime(startDate),
              details: description,
              templateUrl: event.templateUrl
            },
            interviewer: s.name || s.email,
            interviewee: ''
          }).catch(err => {
            console.error(`[createSpecialEvent] Failed to send event email to ${s.email}:`, err.message);
            return null;
          });
        });

        await Promise.all(emailPromises);
        console.log(`[createSpecialEvent] Sent ${createdStudents.length} event notification emails`);
      }

      console.log(`[createSpecialEvent] Successfully processed event: ${event._id}`);
    } catch (e) {
      console.error('[createSpecialEvent] Async processing failed:', e.message);
    }
  });
}

export async function getEvent(req, res) {
  const eventId = req.params.id;
  const event = await Event.findById(eventId).populate('participants', 'name email').lean();
  if (!event) throw new HttpError(404, 'Event not found');
  
  // Coordinators can only view their own events
  if (req.user?.role === 'coordinator' && event.coordinatorId !== req.user.coordinatorId) {
    throw new HttpError(403, 'Access denied: You can only view your own events');
  }
  
  const now = new Date();
  const ended = event.endDate ? (now > new Date(event.endDate)) : false;
  const canDeleteTemplate = ended && !!event.templateKey;
  res.json({ ...event, ended, canDeleteTemplate, participantCount: event.participants?.length || 0 });
}

export async function listEvents(req, res) {
  const userId = req.user?._id;
  const isAdmin = req.user?.role === 'admin';
  const isSpecialStudent = req.user?.isSpecialStudent || false;
  const userCreatedAt = req.user?.createdAt;
  
  // Debug logging
  console.log('[listEvents] User info:', {
    userId: userId?.toString(),
    role: req.user?.role,
    isSpecialStudent,
    userType: isSpecialStudent ? 'special' : 'regular',
    userCreatedAt: userCreatedAt
  });
  
    let query = {};
    // Coordinators see only their events; admins see all; students see coordinator-matching or unscoped events, or ones explicitly allowed
    if (req.user?.role === 'coordinator') {
      query.coordinatorId = req.user.coordinatorId;
    } else if (req.user?.role === 'student') {
      const teacherId = req.user?.teacherId;
      const orClauses = [];
      // Unscoped events (no coordinator) should be visible
      orClauses.push({ coordinatorId: { $exists: false } });
      orClauses.push({ coordinatorId: null });
      // Events for this coordinator only
      if (teacherId) {
        orClauses.push({ coordinatorId: teacherId });
      }
      // Explicitly allowed (special or otherwise)
      orClauses.push({ allowedParticipants: req.user._id });
      query.$or = orClauses;
    }
    const events = await Event.find(query).sort({ createdAt: -1 }).lean();
  
  // Populate coordinator names for events that have coordinatorId
  const eventsWithCoordinator = await Promise.all(events.map(async (event) => {
    if (event.coordinatorId) {
      const coordinator = await User.findOne({ coordinatorId: event.coordinatorId }).lean();
      return {
        ...event,
        coordinatorName: coordinator?.name || 'Unknown Coordinator'
      };
    }
    return event;
  }));
  
  console.log('[listEvents] Total events:', eventsWithCoordinator.length);
  console.log('[listEvents] Special events:', eventsWithCoordinator.filter(e => e.isSpecial).map(e => ({
    id: e._id.toString(),
    name: e.name,
    allowedParticipants: e.allowedParticipants?.map(p => p.toString())
  })));

  const visible = eventsWithCoordinator.filter(e => {
    // Admins and coordinators see all their events (no filtering needed)
    if (isAdmin || req.user?.role === 'coordinator') return true;
    
    // Students should only see events created after their registration
    // Filter out events created before the student was registered
    if (userCreatedAt && e.createdAt) {
      const eventCreated = new Date(e.createdAt);
      const userRegistered = new Date(userCreatedAt);
      
      // Compare timestamps (event must be created AFTER user registration)
      if (eventCreated <= userRegistered) {
        console.log('[listEvents] ❌ Filtering out event created before/at registration:', {
          eventName: e.name,
          eventId: e._id.toString(),
          eventCreatedAt: eventCreated.toISOString(),
          userRegisteredAt: userRegistered.toISOString(),
          difference: `${((eventCreated - userRegistered) / 1000 / 60 / 60).toFixed(2)} hours`
        });
        return false;
      } else {
        console.log('[listEvents] ✅ Showing event created after registration:', {
          eventName: e.name,
          eventCreatedAt: eventCreated.toISOString(),
          userRegisteredAt: userRegistered.toISOString(),
          difference: `${((eventCreated - userRegistered) / 1000 / 60 / 60).toFixed(2)} hours`
        });
      }
    }
    
    // Non-special events are visible to everyone (if created after registration)
    if (!e.isSpecial) return true;
    
    // For special events, only show if the current student is explicitly allowed
    if (!userId) return false;
    const canSee = e.allowedParticipants?.some?.(p => p.toString() === userId.toString());
    console.log('[listEvents] Special event visibility check:', {
      eventName: e.name,
      eventId: e._id.toString(),
      userId: userId.toString(),
      allowedParticipants: e.allowedParticipants?.map(p => p.toString()),
      canSee
    });
    return canSee;
  });
  
  console.log('[listEvents] Visible events:', visible.length);

  // For joined status, check current User ID against participants
  const mapped = visible.map(e => {
    let joined = false;
    if (userId) {
      joined = e.participants?.some?.(p => p.toString() === userId.toString());
    }
    return { ...e, joined };
  });
  
  res.json(mapped);
}

export async function joinEvent(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) throw new HttpError(404, 'Event not found');
  const userId = req.user._id;
  // Restrict joining events that were created before the student's registration time
  // Applies to all students (timestamps stored on unified User model)
  try {
    const userCreatedAt = req.user?.createdAt ? new Date(req.user.createdAt) : null;
    const eventCreatedAt = event.createdAt ? new Date(event.createdAt) : null;
    if (userCreatedAt && eventCreatedAt && eventCreatedAt < userCreatedAt) {
      throw new HttpError(403, 'You cannot join this event because it was created before your registration.');
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // Fallback: if timestamps are missing, allow normal flow
  }
  if (event.isSpecial && !event.allowedParticipants?.some?.(p => p.equals(userId))) throw new HttpError(403, 'Not allowed for this special event');
  if (event.participants.some(p => p.equals(userId))) return res.json({ message: 'Already joined' });
  // capacity removed - no limit enforced
  event.participants.push(userId);
  await event.save();
  res.json({ message: 'Joined', eventId: event._id });
}

export async function exportJoinedCsv(req, res) {
  const event = await Event.findById(req.params.id).populate('participants');
  if (!event) throw new HttpError(404, 'Event not found');
  
  // Coordinators can only export CSV for their own events
  if (req.user?.role === 'coordinator' && event.coordinatorId !== req.user.coordinatorId) {
    throw new HttpError(403, 'Access denied: You can only export participants for your own events');
  }
  
  const header = 'name,email,studentId,course,branch,college\n';
  const rows = event.participants.map(s => [s.name, s.email, s.studentId, s.course, s.branch, s.college].join(','));
  const csv = header + rows.join('\n');

  // Log activity
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'EXPORT',
    targetType: 'EVENT',
    targetId: event._id.toString(),
    description: `Exported ${event.participants.length} participants for event: ${event.name}`,
    metadata: { eventId: event._id.toString(), participantCount: event.participants.length },
    req
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="event_${event._id}_participants.csv"`);
  res.send(csv);
}

export async function eventAnalytics(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) throw new HttpError(404, 'Event not found');
  
  // Coordinators can only view analytics for their own events
  if (req.user?.role === 'coordinator' && event.coordinatorId !== req.user.coordinatorId) {
    throw new HttpError(403, 'Access denied: You can only view analytics for your own events');
  }
  
  const pairs = await Pair.find({ event: event._id });
  const fb = await Feedback.find({ event: event._id });
  const joined = event.participants.length;
  const scheduled = pairs.filter(p => p.scheduledAt).length;
  const submitted = fb.length;
  const avg = fb.length ? (fb.reduce((a, b) => a + (b.marks || 0), 0) / fb.length) : 0;
  res.json({ joined, pairs: pairs.length, scheduled, feedbackSubmissions: submitted, averageScore: Number(avg.toFixed(2)) });
}

export async function replaceEventTemplate(req, res) {
  if (!req.file) throw new HttpError(400, 'Template file required');
  const event = await Event.findById(req.params.id);
  if (!event) throw new HttpError(404, 'Event not found');
  const tpl = await uploadTemplate(req.file);
  Object.assign(event, tpl);
  await event.save();
  res.json(event);
}

export async function getTemplateUrl(req, res) {
  const event = await Event.findById(req.params.id).lean();
  if (!event) throw new HttpError(404, 'Event not found');
  const isAdmin = req.user?.role === 'admin';
  if (!event.templateKey) return res.json(isAdmin ? { templateUrl: event.templateUrl || null, templateKey: event.templateKey } : { templateUrl: event.templateUrl || null });
  if (process.env.SUPABASE_PUBLIC === 'true') return res.json(isAdmin ? { templateUrl: event.templateUrl, templateKey: event.templateKey } : { templateUrl: event.templateUrl });
  if (!supabase) throw new HttpError(500, 'Supabase not configured');
  const ttl = Number(process.env.SUPABASE_SIGNED_TTL || 600);
  // Try a set of likely buckets in case configuration changed after upload
  const configured = process.env.SUPABASE_BUCKET || 'templates';
  const tryBuckets = Array.from(new Set([configured, 'templates', 'patient-records']));
  for (const bucket of tryBuckets) {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(event.templateKey, ttl);
      if (!error && data?.signedUrl) {
        return res.json(isAdmin ? { templateUrl: data.signedUrl, templateKey: event.templateKey, bucket } : { templateUrl: data.signedUrl });
      }
      // if error indicates object not found, continue to try next bucket
      if (error && /not found|Object not found|404/i.test(error.message || '')) {
        continue;
      }
      if (error) {
        // other errors are surfaced
        throw error;
      }
    } catch (e) {
      // If supabase client throws, try next bucket unless it's a critical error
      if (e && /not found|Object not found|404/i.test(e.message || '')) {
        continue;
      }
      throw new HttpError(500, `Failed to create signed URL: ${e?.message || String(e)}`);
    }
  }
  // If we reached here, object wasn't found in any bucket
  throw new HttpError(404, `Template object not found in configured buckets (${tryBuckets.join(', ')}).`);
}

export async function deleteEventTemplate(req, res) {
  const event = await Event.findById(req.params.id);
  if (!event) throw new HttpError(404, 'Event not found');
  if (!event.templateKey) return res.json({ message: 'No template to delete' });
  if (!event.endDate || new Date() < new Date(event.endDate)) throw new HttpError(400, 'Event has not ended yet');
  if (!supabase) throw new HttpError(500, 'Supabase not configured');
  const bucket = process.env.SUPABASE_BUCKET || 'templates';
  await supabase.storage.from(bucket).remove([event.templateKey]);
  event.templateKey = undefined; event.templateUrl = undefined; event.templateName = undefined;
  await event.save();
  res.json({ message: 'Template deleted' });
}
