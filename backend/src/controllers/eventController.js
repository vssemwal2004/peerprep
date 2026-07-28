import { sendSlotProposalEmail, sendSlotAcceptanceEmail, sendInterviewScheduledEmail, sendMail, renderTemplate } from '../utils/mailer.js';
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
import EventParticipant from '../models/EventParticipant.js';
import User from '../models/User.js';
import { createNotifications } from '../services/notificationService.js';
import { enqueueMailJobs } from '../services/mailQueueService.js';
import crypto from 'crypto';

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

async function queueEventInvitationEmails({ event, students, requestedBy, requestedByEmail, reason = 'created' }) {
  const validStudents = (students || []).filter((student) => student?.email);
  if (!validStudents.length) return { queued: 0 };

  const batchId = crypto.randomUUID();
  const queued = await enqueueMailJobs(validStudents.map((student) => ({
    type: 'event_invitation',
    to: student.email,
    recipientId: student._id,
    targetType: 'EVENT',
    targetId: event._id,
    idempotencyKey: `event:${event._id}:${student._id}:${reason}`,
    payload: {
      to: student.email,
      event: {
        title: event.name,
        date: event.startDate ? formatDateTime(event.startDate) : 'To be announced',
        details: event.description,
        templateUrl: event.templateUrl,
      },
      interviewer: student.name || student.email,
      interviewee: '',
    },
  })), {
    batchId,
    requestedBy,
    requestedByEmail,
  });

  await EventParticipant.updateMany(
    { eventId: event._id, studentId: { $in: validStudents.map((student) => student._id) } },
    { $set: { invitationStatus: 'pending' } },
  );
  return queued;
}

async function queueEventCancellationEmails({ event, students, requestedBy, requestedByEmail, reason }) {
  const validStudents = (students || []).filter((student) => student?.email);
  if (!validStudents.length) return { queued: 0 };

  const batchId = crypto.randomUUID();
  const queued = await enqueueMailJobs(validStudents.map((student) => ({
    type: 'event_cancellation',
    to: student.email,
    recipientId: student._id,
    targetType: 'EVENT',
    targetId: event._id,
    idempotencyKey: `event-cancelled:${event._id}:${student._id}:${batchId}`,
    payload: {
      to: student.email,
      studentName: student.name || 'Student',
      event: {
        title: event.name,
        date: event.startDate ? formatDateTime(event.startDate) : 'To be announced',
        details: event.description || '',
      },
      cancelledBy: requestedByEmail || 'admin',
      reason: reason || 'Due to some reason, this interview has been cancelled.',
    },
  })), {
    batchId,
    requestedBy,
    requestedByEmail,
  });

  return queued;
}

async function resolveEventEligibleStudents(event, reqUser) {
  let studentsQuery = { role: 'student', email: { $exists: true, $ne: null } };
  if (event.coordinatorId) studentsQuery = { ...studentsQuery, teacherIds: event.coordinatorId };
  if (reqUser?.role === 'coordinator') studentsQuery.teacherIds = reqUser.coordinatorId;
  if (event.selectionMode === 'filters') {
    const filters = event.participantFilters || {};
    const semester = Number(filters.semester);
    if (Number.isInteger(semester) && semester >= 1 && semester <= 8) studentsQuery.semester = semester;
    ['branch', 'course', 'college', 'group'].forEach((field) => {
      if (filters[field]) studentsQuery[field] = String(filters[field]).trim();
    });
  }
  let students = await User.find(studentsQuery, '_id email name').lean();
  if (Array.isArray(event.allowedParticipants) && event.allowedParticipants.length) {
    const allowedSet = new Set(event.allowedParticipants.map((id) => String(id)));
    students = students.filter((student) => allowedSet.has(String(student._id)));
  }
  if (Array.isArray(event.excludedParticipants) && event.excludedParticipants.length) {
    const excludedSet = new Set(event.excludedParticipants.map((id) => String(id)));
    students = students.filter((student) => !excludedSet.has(String(student._id)));
  }
  return students;
}

export async function createEvent(req, res) {
  const {
    name,
    description,
    startDate,
    endDate,
    allowedParticipants,
    selectionMode = 'all',
    participantFilters,
    excludedParticipants,
    status = 'published',
  } = req.body;
  // Validate dates
  const start = startDate ? new Date(startDate) : null;
  const end = endDate ? new Date(endDate) : null;
  const now = Date.now();
  if (!name?.trim()) throw new HttpError(400, 'Interview title is required');
  if (start && Number.isNaN(start.getTime())) throw new HttpError(400, 'Invalid start date');
  if (end && Number.isNaN(end.getTime())) throw new HttpError(400, 'Invalid end date');
  if (start && start.getTime() < now) throw new HttpError(400, 'Start date cannot be in the past');
  if (start && end && end.getTime() < start.getTime()) throw new HttpError(400, 'End date must be after the start date');
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
    const parseJsonValue = (value, fallback) => {
      if (value === undefined || value === null || value === '') return fallback;
      if (typeof value !== 'string') return value;
      try { return JSON.parse(value); } catch { return fallback; }
    };
    const finalFilters = parseJsonValue(participantFilters, {});
    const finalExcluded = parseJsonValue(excludedParticipants, []);
    const normalizedSelectionMode = ['all', 'filters', 'selected'].includes(selectionMode) ? selectionMode : 'all';
    const normalizedStatus = ['draft', 'scheduled', 'published'].includes(status) ? status : 'published';
    if (normalizedSelectionMode === 'selected' && !finalAllowed.length) {
      throw new HttpError(400, 'Select at least one student');
    }
    if (normalizedSelectionMode === 'filters' && !Object.values(finalFilters || {}).some(Boolean)) {
      throw new HttpError(400, 'Choose at least one student filter');
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
      excludedParticipants: Array.isArray(finalExcluded) ? finalExcluded : [],
      selectionMode: normalizedSelectionMode,
      participantFilters: finalFilters,
      status: normalizedStatus,
      publishedAt: normalizedStatus === 'published' ? new Date() : undefined,
      createdBy: req.user._id,
      updatedBy: req.user._id,
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
  
  if (event.status === 'draft') return;

  // Send emails and generate pairs asynchronously (non-blocking)
  setImmediate(async () => {
    try {
      let studentsQuery = { role: 'student', email: { $exists: true, $ne: null } };
      // If coordinator event, restrict to assigned students
      if (event.coordinatorId) {
        studentsQuery = { ...studentsQuery, teacherIds: event.coordinatorId };
      }
      if (event.selectionMode === 'filters') {
        const filters = event.participantFilters || {};
        const semester = Number(filters.semester);
        if (Number.isInteger(semester) && semester >= 1 && semester <= 8) studentsQuery.semester = semester;
        ['branch', 'course', 'college', 'group'].forEach((field) => {
          if (filters[field]) studentsQuery[field] = String(filters[field]).trim();
        });
      }
      let students = await User.find(studentsQuery, '_id email name');
      // If allowedParticipants was provided, intersect with it
      if (Array.isArray(event.allowedParticipants) && event.allowedParticipants.length) {
        const allowedSet = new Set(event.allowedParticipants.map(id => id.toString()));
        students = students.filter(s => allowedSet.has(s._id.toString()));
      }
      if (Array.isArray(event.excludedParticipants) && event.excludedParticipants.length) {
        const excludedSet = new Set(event.excludedParticipants.map((id) => String(id)));
        students = students.filter((student) => !excludedSet.has(String(student._id)));
      }
      const ids = students.map(s => s._id.toString());
      if (students.length) {
        await EventParticipant.bulkWrite(students.map((student) => ({
          updateOne: {
            filter: { eventId: event._id, studentId: student._id },
            update: {
              $set: {
                selectionSource: event.selectionMode,
                assignmentStatus: 'assigned',
              },
              $setOnInsert: { invitationStatus: 'not_sent' },
            },
            upsert: true,
          },
        })));

        await queueEventInvitationEmails({
          event,
          students,
          requestedBy: req.user._id,
          requestedByEmail: req.user.email,
          reason: 'created',
        });
      }
      // Assignment is stored separately; participants contains students who actually joined.

      // Real-time notifications: Event assigned
      try {
        const assignedNotifs = students.map(s => ({
          userId: s._id,
          title: 'Interview Event Assigned',
          message: 'You have been assigned to a new interview event',
          type: 'INTERVIEW',
          referenceId: event._id,
          actionUrl: '/student/session',
          dedupeKey: `event-assigned:${event._id}:${s._id}`
        }));
        await createNotifications(assignedNotifs);
      } catch (e) {
        console.error('[createEvent] Failed to create event notifications:', e.message);
      }
      
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

        // Real-time notifications: Pair created
        try {
          const pairNotifs = insertedPairs.flatMap(p => ([
            {
              userId: p.interviewer,
              title: 'Pair Created',
              message: 'You have been paired with a student',
              type: 'INTERVIEW',
              referenceId: p._id,
              actionUrl: '/student/session',
              dedupeKey: `pair-created:${p._id}:${p.interviewer}`
            },
            {
              userId: p.interviewee,
              title: 'Pair Created',
              message: 'You have been paired with a student',
              type: 'INTERVIEW',
              referenceId: p._id,
              actionUrl: '/student/session',
              dedupeKey: `pair-created:${p._id}:${p.interviewee}`
            }
          ]));
          await createNotifications(pairNotifs);
        } catch (e) {
          console.error('[createEvent] Failed to create pair notifications:', e.message);
        }
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

      if (!userByEmail && !userById) {
        results.push({
          row: row.__row,
          name,
          email,
          studentid,
          status: 'student_not_registered',
          message: 'No registered student matches this email or Student ID. Create the student account before assigning an interview.',
        });
        continue;
      }

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

export async function checkInterviewParticipantCsv(req, res) {
  if (!req.file) throw new HttpError(400, 'CSV file required');
  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true });
  } catch (error) {
    throw new HttpError(400, `Invalid CSV: ${error.message || error}`);
  }
  if (rows.length > 1000) throw new HttpError(400, 'A maximum of 1000 students can be selected at once');

  const normalizedRows = rows.map((row, index) => ({ ...normalizeSpecialEventRow(row), __row: index + 2 }));
  const emails = normalizedRows.map((row) => row.email?.toLowerCase()).filter(Boolean);
  const studentIds = normalizedRows.map((row) => row.studentid).filter(Boolean);
  const query = {
    role: 'student',
    $or: [{ email: { $in: emails } }, { studentId: { $in: studentIds } }],
  };
  if (req.user.role === 'coordinator') query.teacherIds = req.user.coordinatorId;
  const students = await User.find(query).select('_id name email studentId semester branch course college group').lean();
  const byEmail = new Map(students.map((student) => [student.email?.toLowerCase(), student]));
  const byStudentId = new Map(students.map((student) => [String(student.studentId), student]));
  const seen = new Set();
  const results = normalizedRows.map((row) => {
    const student = byEmail.get(row.email?.toLowerCase()) || byStudentId.get(row.studentid);
    if (!student) {
      return { row: row.__row, email: row.email, studentid: row.studentid, status: 'student_not_registered', message: 'Registered student not found or outside coordinator scope.' };
    }
    const id = student._id.toString();
    if (seen.has(id)) return { row: row.__row, email: row.email, studentid: row.studentid, status: 'duplicate_in_file', message: 'Student appears more than once.' };
    seen.add(id);
    if (row.email && student.email?.toLowerCase() !== row.email.toLowerCase()) {
      return { row: row.__row, email: row.email, studentid: row.studentid, status: 'data_mismatch', message: 'Email does not match the registered student.' };
    }
    if (row.studentid && String(student.studentId) !== row.studentid) {
      return { row: row.__row, email: row.email, studentid: row.studentid, status: 'data_mismatch', message: 'Student ID does not match the registered student.' };
    }
    return { row: row.__row, status: 'ready', student };
  });
  res.json({
    count: results.length,
    readyCount: results.filter((result) => result.status === 'ready').length,
    studentIds: results.filter((result) => result.status === 'ready').map((result) => result.student._id),
    results,
  });
}

export async function createSpecialEvent(req, res) {
  const { name, description, startDate, endDate } = req.body;
  if (!name?.trim()) throw new HttpError(400, 'Interview title is required');
  
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

      if (!user) {
        throw new HttpError(
          400,
          `Row ${row.__row}: No registered student matches ${email || studentid}. Create the student account before assigning this interview.`,
        );
      }

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
    selectionMode: 'csv',
    status: 'published',
    publishedAt: new Date(),
    createdBy: req.user._id,
    updatedBy: req.user._id,
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
        teacherIds: coordinatorId
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

      results.push({
        row: row.__row,
        email,
        studentid,
        status: 'student_not_registered',
        message: 'Student must already be registered before being assigned to an interview.',
      });
    } catch (err) {
      results.push({ row: row.__row, email, studentid, status: 'error', message: err.message });
    }
  }
  
  // Update event with created student IDs
  event.allowedParticipants = createdStudents.map(s => s._id);
  event.selectionMode = 'csv';
  await event.save();
  if (createdStudents.length) {
    await EventParticipant.bulkWrite(createdStudents.map((student) => ({
      updateOne: {
        filter: { eventId: event._id, studentId: student._id },
        update: {
          $set: { selectionSource: 'csv', assignmentStatus: 'assigned' },
          $setOnInsert: { invitationStatus: 'not_sent' },
        },
        upsert: true,
      },
    })));

    await queueEventInvitationEmails({
      event,
      students: createdStudents,
      requestedBy: req.user._id,
      requestedByEmail: req.user.email,
      reason: 'created',
    });
  }

  // Real-time notifications: Event assigned
  try {
    const assignedNotifs = createdStudents.map(s => ({
      userId: s._id,
      title: 'Interview Event Assigned',
      message: 'You have been assigned to a new interview event',
      type: 'INTERVIEW',
      referenceId: event._id,
      actionUrl: '/student/session',
      dedupeKey: `event-assigned:${event._id}:${s._id}`
    }));
    await createNotifications(assignedNotifs);
  } catch (e) {
    console.error('[createSpecialEvent] Failed to create event notifications:', e.message);
  }

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

        // Real-time notifications: Pair created
        try {
          const pairNotifs = insertedPairs.flatMap(p => ([
            {
              userId: p.interviewer,
              title: 'Pair Created',
              message: 'You have been paired with a student',
              type: 'INTERVIEW',
              referenceId: p._id,
              actionUrl: '/student/session',
              dedupeKey: `pair-created:${p._id}:${p.interviewer}`
            },
            {
              userId: p.interviewee,
              title: 'Pair Created',
              message: 'You have been paired with a student',
              type: 'INTERVIEW',
              referenceId: p._id,
              actionUrl: '/student/session',
              dedupeKey: `pair-created:${p._id}:${p.interviewee}`
            }
          ]));
          await createNotifications(pairNotifs);
        } catch (e) {
          console.error('[createSpecialEvent] Failed to create pair notifications:', e.message);
        }
      }

      // Account created notifications for new students
      try {
        const newStudentNotifs = createdStudents
          .filter(s => s.shouldSendOnboarding)
          .map(s => ({
            userId: s._id,
            title: 'Account Created',
            message: 'Your account has been created',
            type: 'SYSTEM',
            referenceId: s._id,
            actionUrl: '/student/dashboard',
            dedupeKey: `account-created:${s._id}`
          }));
        await createNotifications(newStudentNotifs);
      } catch (e) {
        console.error('[createSpecialEvent] Account notification error:', e.message);
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

async function getManagedEvent(req) {
  const event = await Event.findById(req.params.id);
  if (!event) throw new HttpError(404, 'Interview not found');
  if (req.user?.role === 'coordinator' && event.coordinatorId !== req.user.coordinatorId) {
    throw new HttpError(403, 'You can only manage your own interviews');
  }
  return event;
}

export async function updateEvent(req, res) {
  const event = await getManagedEvent(req);
  const editable = ['name', 'description', 'startDate', 'endDate'];
  editable.forEach((field) => {
    if (req.body?.[field] !== undefined) event[field] = req.body[field] || undefined;
  });
  if (!event.name?.trim()) throw new HttpError(400, 'Interview title is required');
  if (event.startDate && event.endDate && new Date(event.endDate) < new Date(event.startDate)) {
    throw new HttpError(400, 'End date must be after the start date');
  }
  event.updatedBy = req.user._id;
  await event.save();
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'UPDATE',
    targetType: 'EVENT',
    targetId: event._id.toString(),
    description: `Updated interview: ${event.name}`,
    metadata: { status: event.status },
    req,
  });
  res.json(event);
}

export async function updateEventStatus(req, res) {
  const event = await getManagedEvent(req);
  const status = String(req.body?.status || '').trim();
  const allowed = ['draft', 'scheduled', 'published', 'live', 'completed', 'cancelled'];
  if (!allowed.includes(status)) throw new HttpError(400, 'Invalid interview status');
  event.status = status;
  event.updatedBy = req.user._id;
  if (status === 'published') event.publishedAt = new Date();
  if (status === 'cancelled') event.cancelledAt = new Date();
  await event.save();
  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'UPDATE',
    targetType: 'EVENT',
    targetId: event._id.toString(),
    description: `Changed interview status to ${status}: ${event.name}`,
    metadata: { status },
    req,
  });
  res.json({ _id: event._id, status: event.status });
}

export async function listEventParticipants(req, res) {
  const event = await getManagedEvent(req);
  const assignments = await EventParticipant.find({ eventId: event._id })
    .populate('studentId', 'name email studentId semester branch course college group')
    .sort({ createdAt: -1 })
    .lean();
  res.json(assignments);
}

export async function addEventParticipants(req, res) {
  const event = await getManagedEvent(req);
  const studentIds = [...new Set((req.body?.studentIds || []).map(String))];
  if (!studentIds.length) throw new HttpError(400, 'Select at least one student');
  const scope = { _id: { $in: studentIds }, role: 'student' };
  if (req.user.role === 'coordinator') scope.teacherIds = req.user.coordinatorId;
  const students = await User.find(scope).select('_id').lean();
  if (students.length !== studentIds.length) {
    throw new HttpError(400, 'One or more students are invalid or outside your assigned scope');
  }
  await EventParticipant.bulkWrite(students.map((student) => ({
    updateOne: {
      filter: { eventId: event._id, studentId: student._id },
      update: {
        $set: { selectionSource: 'manual', assignmentStatus: 'assigned' },
        $unset: { removedAt: 1, removedBy: 1, removalReason: 1 },
        $setOnInsert: { invitationStatus: 'not_sent' },
      },
      upsert: true,
    },
  })));
  event.selectionMode = event.selectionMode === 'all' ? 'selected' : event.selectionMode;
  event.updatedBy = req.user._id;
  await event.save();
  res.json({ added: students.length });
}

export async function removeEventParticipant(req, res) {
  const event = await getManagedEvent(req);
  const assignment = await EventParticipant.findOneAndUpdate(
    { eventId: event._id, studentId: req.params.studentId },
    {
      $set: {
        assignmentStatus: 'removed',
        removedAt: new Date(),
        removedBy: req.user._id,
        removalReason: String(req.body?.reason || '').slice(0, 300),
      },
    },
    { new: true },
  );
  if (!assignment) throw new HttpError(404, 'Student assignment not found');
  event.participants = event.participants.filter((id) => id.toString() !== req.params.studentId);
  await event.save();
  res.json({ removed: true });
}

export async function deleteEvent(req, res) {
  const event = await getManagedEvent(req);
  const reason = String(req.body?.reason || 'Due to some reason, this interview has been cancelled.').slice(0, 500);
  const assignments = await EventParticipant.find({ eventId: event._id, assignmentStatus: 'assigned' })
    .populate('studentId', 'name email')
    .lean();
  let assignedStudents = assignments
    .map((assignment) => assignment.studentId)
    .filter((student) => student?._id && student?.email);
  if (!assignedStudents.length) {
    assignedStudents = await resolveEventEligibleStudents(event, req.user);
  }
  const seenStudentIds = new Set();
  assignedStudents = assignedStudents.filter((student) => {
    const key = String(student._id);
    if (seenStudentIds.has(key)) return false;
    seenStudentIds.add(key);
    return true;
  });

  const queued = await queueEventCancellationEmails({
    event,
    students: assignedStudents,
    requestedBy: req.user._id,
    requestedByEmail: req.user.email,
    reason,
  });

  const pairIds = await Pair.find({ event: event._id }).distinct('_id');
  await Promise.all([
    SlotProposal.deleteMany({ $or: [{ event: event._id }, { pair: { $in: pairIds } }] }),
    Pair.deleteMany({ event: event._id }),
    Feedback.deleteMany({ event: event._id }),
    EventParticipant.deleteMany({ eventId: event._id }),
    Event.deleteOne({ _id: event._id }),
  ]);

  logActivity({
    userEmail: req.user.email,
    userRole: req.user.role,
    actionType: 'DELETE',
    targetType: 'EVENT',
    targetId: event._id.toString(),
    description: `Deleted interview: ${event.name}`,
    metadata: {
      cancellationEmailsQueued: queued.queued || 0,
      assignedCount: assignedStudents.length,
      reason,
    },
    req,
  });

  res.json({
    deleted: true,
    _id: event._id,
    cancellationEmailsQueued: queued.queued || 0,
    message: `Interview deleted. ${queued.queued || 0} cancellation email(s) queued.`,
  });
}

export async function sendEventInvitations(req, res) {
  const event = await getManagedEvent(req);
  const requestedIds = Array.isArray(req.body?.studentIds)
    ? [...new Set(req.body.studentIds.map(String))]
    : [];
  const query = { eventId: event._id, assignmentStatus: 'assigned' };
  if (requestedIds.length) query.studentId = { $in: requestedIds };
  const assignments = await EventParticipant.find(query).populate('studentId', 'name email').lean();
  if (!assignments.length) throw new HttpError(400, 'No assigned students were found');

  const validAssignments = assignments.filter((assignment) => assignment.studentId?.email);
  const queued = await queueEventInvitationEmails({
    event,
    students: validAssignments.map((assignment) => assignment.studentId),
    requestedBy: req.user._id,
    requestedByEmail: req.user.email,
    reason: crypto.randomUUID(),
  });
  res.status(202).json({ ...queued, message: `${validAssignments.length} invitation email(s) queued.` });
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
      const teacherIds = Array.isArray(req.user?.teacherIds) ? req.user.teacherIds : [];
      const orClauses = [];
      // Unscoped events (no coordinator) should be visible
      orClauses.push({ coordinatorId: { $exists: false } });
      orClauses.push({ coordinatorId: null });
      // Events for this coordinator only
      if (teacherIds.length) {
        orClauses.push({ coordinatorId: { $in: teacherIds } });
      }
      // Explicitly allowed (special or otherwise)
      orClauses.push({ allowedParticipants: req.user._id });
      query.$or = orClauses;
    }
    const events = await Event.find(query).sort({ createdAt: -1 }).lean();
    const assignedEventIds = req.user?.role === 'student'
      ? new Set((await EventParticipant.find({
        studentId: userId,
        assignmentStatus: 'assigned',
      }).select('eventId').lean()).map((assignment) => assignment.eventId.toString()))
      : new Set();
  
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

    if (['draft', 'cancelled', 'archived'].includes(e.status)) return false;
    
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
    
    const restricted = e.isSpecial || ['selected', 'filters', 'csv'].includes(e.selectionMode);
    if (!restricted) return true;
    
    // For special events, only show if the current student is explicitly allowed
    if (!userId) return false;
    const canSee = assignedEventIds.has(e._id.toString())
      || e.allowedParticipants?.some?.(p => p.toString() === userId.toString());
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
  if (['draft', 'cancelled', 'archived', 'completed'].includes(event.status)) {
    throw new HttpError(403, `This interview is ${event.status} and cannot be joined.`);
  }
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
  const restricted = event.isSpecial || ['selected', 'filters', 'csv'].includes(event.selectionMode);
  if (restricted) {
    const assigned = await EventParticipant.exists({
      eventId: event._id,
      studentId: userId,
      assignmentStatus: 'assigned',
    });
    const legacyAllowed = event.allowedParticipants?.some?.((participantId) => participantId.equals(userId));
    if (!assigned && !legacyAllowed) throw new HttpError(403, 'You are not assigned to this interview.');
  }
  if (event.participants.some(p => p.equals(userId))) return res.json({ message: 'Already joined' });
  // capacity removed - no limit enforced
  event.participants.push(userId);
  await event.save();
  await EventParticipant.updateOne(
    { eventId: event._id, studentId: userId },
    {
      $set: { joinedAt: new Date(), assignmentStatus: 'assigned' },
      $setOnInsert: { selectionSource: event.selectionMode || (event.isSpecial ? 'csv' : 'all') },
    },
    { upsert: true },
  );
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
