import JoinRequest from '../models/JoinRequest.js';
import User from '../models/User.js';
import { HttpError } from '../utils/errors.js';
import { sendMail, sendOnboardingEmail } from '../utils/mailer.js';
import { logActivity } from './adminActivityController.js';
import { validateEmail } from '../utils/validators.js';

// Generate random password (7-8 characters) - same as studentController
function generateRandomPassword() {
  const length = Math.random() < 0.5 ? 7 : 8;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
}

// Generate a student ID from name + random digits
function generateStudentId(name) {
  const prefix = name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}${suffix}`;
}

/**
 * PUBLIC: Submit a join request (no auth required)
 */
export async function submitJoinRequest(req, res) {
  try {
    const { name, email, university, course, branch, semester, studentId } = req.body;

    // Validate required fields
    if (!name || !email || !university || !course || !branch || !semester || !studentId) {
      return res.status(400).json({ error: 'All fields are required: name, email, university, course, branch, semester, studentId' });
    }

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate semester
    const semesterNum = parseInt(semester);
    if (isNaN(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return res.status(400).json({ error: 'Semester must be between 1 and 8' });
    }

    // Check if already a registered student
    const existingUser = await User.findOne({ email: email.toLowerCase(), role: 'student' }).lean();
    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email already exists. Please login instead.' });
    }

    // Check if there's already a pending request from this email
    const existingRequest = await JoinRequest.findOne({ email: email.toLowerCase(), status: 'pending' }).lean();
    if (existingRequest) {
      return res.status(409).json({ error: 'You already have a pending request. Please wait for admin approval.' });
    }

    // Create join request
    const joinRequest = await JoinRequest.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      university: university.trim(),
      course: course.trim(),
      branch: branch.trim(),
      semester: semesterNum,
      studentId: studentId.trim(),
    });

    // Send confirmation email to student
    try {
      await sendMail({
        to: email,
        subject: 'PeerPrep - Join Request Received',
        html: `
          <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
            <p style="margin-bottom:20px;">Dear ${name},</p>
            <p style="margin-bottom:16px;">Thank you for your interest in <strong>PeerPrep</strong>! We have received your join request.</p>
            
            <div style="background:#f0f9ff;padding:24px;border-radius:8px;border-left:4px solid #0ea5e9;margin:24px 0;">
              <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0c4a6e;">📋 Your Request Details</p>
              <table style="width:100%;font-size:15px;">
                <tr><td style="padding:6px 0;color:#475569;width:40%;"><strong>Name:</strong></td><td style="color:#0f172a;">${name}</td></tr>
                <tr><td style="padding:6px 0;color:#475569;"><strong>Email:</strong></td><td style="color:#0f172a;">${email}</td></tr>
                <tr><td style="padding:6px 0;color:#475569;"><strong>University:</strong></td><td style="color:#0f172a;">${university}</td></tr>
                <tr><td style="padding:6px 0;color:#475569;"><strong>Course:</strong></td><td style="color:#0f172a;">${course}</td></tr>
                <tr><td style="padding:6px 0;color:#475569;"><strong>Branch:</strong></td><td style="color:#0f172a;">${branch}</td></tr>
                <tr><td style="padding:6px 0;color:#475569;"><strong>Semester:</strong></td><td style="color:#0f172a;">${semesterNum}</td></tr>
              </table>
            </div>

            <div style="background:#fef3c7;padding:16px;border-radius:6px;margin:24px 0;border-left:3px solid #f59e0b;">
              <p style="margin:0;font-size:14px;color:#78350f;"><strong>⏳ Status: Pending</strong></p>
              <p style="margin:8px 0 0 0;font-size:14px;color:#78350f;">Your request is currently pending. Please wait for approval from the admin team.</p>
            </div>

            <div style="text-align:center;margin:32px 0;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                <tr>
                  <td style="border-radius:8px;background:#0ea5e9;">
                    <a href="https://peerprep.co.in/" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Visit PeerPrep</a>
                  </td>
                </tr>
              </table>
            </div>
            
            <p style="margin-top:28px;color:#64748b;font-size:14px;">You will receive another email once your request is approved.</p>
            <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep Team</strong></p>
          </div>
        `
      });
    } catch (emailErr) {
      console.error('[JoinRequest] Failed to send student confirmation email:', emailErr.message);
    }

    // Notify all admins about new join request
    try {
      const admins = await User.find({ role: 'admin' }).select('email name').lean();
      if (admins.length > 0) {
        const adminEmails = admins.map(a => a.email).filter(Boolean);
        for (const adminEmail of adminEmails) {
          await sendMail({
            to: adminEmail,
            subject: `PeerPrep - New Join Request from ${name}`,
            html: `
              <div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:600px;">
                <p style="margin-bottom:20px;">Hello Admin,</p>
                <p style="margin-bottom:16px;">A new student has submitted a join request on <strong>PeerPrep</strong>.</p>
                
                <div style="background:#f0f9ff;padding:24px;border-radius:8px;border-left:4px solid #0ea5e9;margin:24px 0;">
                  <p style="margin:0 0 12px 0;font-size:17px;font-weight:700;color:#0c4a6e;">📋 Student Details</p>
                  <table style="width:100%;font-size:15px;">
                    <tr><td style="padding:6px 0;color:#475569;width:40%;"><strong>Name:</strong></td><td style="color:#0f172a;">${name}</td></tr>
                    <tr><td style="padding:6px 0;color:#475569;"><strong>Email:</strong></td><td style="color:#0f172a;">${email}</td></tr>
                    <tr><td style="padding:6px 0;color:#475569;"><strong>University:</strong></td><td style="color:#0f172a;">${university}</td></tr>
                    <tr><td style="padding:6px 0;color:#475569;"><strong>Course:</strong></td><td style="color:#0f172a;">${course}</td></tr>
                    <tr><td style="padding:6px 0;color:#475569;"><strong>Branch:</strong></td><td style="color:#0f172a;">${branch}</td></tr>
                    <tr><td style="padding:6px 0;color:#475569;"><strong>Semester:</strong></td><td style="color:#0f172a;">${semesterNum}</td></tr>
                  </table>
                </div>

                <div style="text-align:center;margin:32px 0;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                    <tr>
                      <td style="border-radius:8px;background:#0ea5e9;">
                        <a href="https://peerprep.co.in/admin/join-requests" target="_blank" style="display:inline-block;padding:16px 40px;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;background:#0ea5e9;">Review Request</a>
                      </td>
                    </tr>
                  </table>
                </div>
                
                <p style="margin-top:24px;">Best regards,<br/><strong>PeerPrep System</strong></p>
              </div>
            `
          });
        }
      }
    } catch (emailErr) {
      console.error('[JoinRequest] Failed to send admin notification email:', emailErr.message);
    }

    return res.status(201).json({ 
      message: 'Request sent successfully',
      request: {
        id: joinRequest._id,
        name: joinRequest.name,
        email: joinRequest.email,
        university: joinRequest.university,
        course: joinRequest.course,
        branch: joinRequest.branch,
        semester: joinRequest.semester,
        status: joinRequest.status,
        createdAt: joinRequest.createdAt,
      }
    });
  } catch (err) {
    console.error('[JoinRequest] Submit error:', err);
    return res.status(500).json({ error: 'Failed to submit join request' });
  }
}

/**
 * Check join request status by email (public, no auth)
 */
export async function checkJoinRequestStatus(req, res) {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email is required' });
    
    const request = await JoinRequest.findOne({ email: email.toLowerCase() })
      .sort({ createdAt: -1 }).lean();
    
    if (!request) {
      return res.json({ status: 'none' });
    }
    
    return res.json({ status: request.status, createdAt: request.createdAt });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check status' });
  }
}

/**
 * ADMIN: List all join requests
 */
export async function listJoinRequests(req, res) {
  try {
    const { status, search, page = 1, limit = 50 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query.$or = [
        { name: searchRegex },
        { email: searchRegex },
        { university: searchRegex },
        { course: searchRegex },
        { branch: searchRegex },
      ];
    }
    
    const total = await JoinRequest.countDocuments(query);
    const requests = await JoinRequest.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('approvedBy', 'name email')
      .lean();
    
    return res.json({ requests, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to list join requests' });
  }
}

/**
 * ADMIN: Approve join request - creates the student user
 */
export async function approveJoinRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { teacherId, group, studentId: customStudentId } = req.body;

    // teacherId (coordinator code) is required
    if (!teacherId) {
      return res.status(400).json({ error: 'Coordinator (Teacher ID) is required to approve a student' });
    }

    const joinReq = await JoinRequest.findById(requestId);
    if (!joinReq) return res.status(404).json({ error: 'Join request not found' });
    if (joinReq.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${joinReq.status}` });
    }

    // Validate coordinator exists
    const coordinator = await User.findOne({ role: 'coordinator', coordinatorId: teacherId }).lean();
    if (!coordinator) {
      return res.status(400).json({ error: `Coordinator with ID "${teacherId}" not found` });
    }

    // Check if email already registered
    const existingUser = await User.findOne({ email: joinReq.email }).lean();
    if (existingUser) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // Generate student ID and password
    const finalStudentId = customStudentId || generateStudentId(joinReq.name);
    
    // Check studentId uniqueness
    const existingStudentId = await User.findOne({ studentId: finalStudentId }).lean();
    if (existingStudentId) {
      return res.status(409).json({ error: `Student ID "${finalStudentId}" already exists. Please provide a different one.` });
    }

    const generatedPassword = generateRandomPassword();
    const passwordHash = await User.hashPassword(generatedPassword);

    // Create student user
    const userData = {
      role: 'student',
      name: joinReq.name,
      email: joinReq.email,
      studentId: finalStudentId,
      passwordHash,
      branch: joinReq.branch,
      course: joinReq.course,
      college: joinReq.university,
      teacherIds: [teacherId],
      semester: joinReq.semester,
      mustChangePassword: true,
    };
    if (group) userData.group = group;

    const newUser = await User.create(userData);

    // Update join request status
    joinReq.status = 'approved';
    joinReq.approvedBy = req.user._id;
    joinReq.approvedAt = new Date();
    joinReq.studentUserId = newUser._id;
    joinReq.teacherId = teacherId;
    joinReq.studentId = finalStudentId;
    if (group) joinReq.group = group;
    await joinReq.save();

    // Send onboarding email with credentials
    try {
      await sendOnboardingEmail({
        to: joinReq.email,
        studentId: finalStudentId,
        password: generatedPassword,
      });
    } catch (emailErr) {
      console.error('[JoinRequest] Failed to send onboarding email:', emailErr.message);
    }

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'CREATE',
      targetType: 'STUDENT',
      targetId: newUser._id.toString(),
      description: `Approved join request and created student: ${joinReq.name} (${joinReq.email})`,
      metadata: { studentId: finalStudentId, teacherId, joinRequestId: requestId },
      req
    });

    return res.json({ 
      message: 'Student approved and created successfully',
      student: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        studentId: finalStudentId,
      }
    });
  } catch (err) {
    console.error('[JoinRequest] Approve error:', err);
    return res.status(500).json({ error: err.message || 'Failed to approve join request' });
  }
}

/**
 * ADMIN: Reject join request  
 */
export async function rejectJoinRequest(req, res) {
  try {
    const { requestId } = req.params;
    const { reason } = req.body;

    const joinReq = await JoinRequest.findById(requestId);
    if (!joinReq) return res.status(404).json({ error: 'Join request not found' });
    if (joinReq.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${joinReq.status}` });
    }

    joinReq.status = 'rejected';
    joinReq.rejectionReason = reason || '';
    await joinReq.save();

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'DELETE',
      targetType: 'JOIN_REQUEST',
      targetId: joinReq._id.toString(),
      description: `Rejected join request from: ${joinReq.name} (${joinReq.email})`,
      metadata: { reason },
      req
    });

    return res.json({ message: 'Join request rejected' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reject join request' });
  }
}
