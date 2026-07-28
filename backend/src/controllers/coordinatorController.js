import User from '../models/User.js';
import Event from '../models/Event.js';
import { logActivity } from './adminActivityController.js';
import {
  DEFAULT_COORDINATOR_PERMISSIONS,
  COORDINATOR_PERMISSION_CATEGORIES,
  normalizeCoordinatorPermissions,
} from '../services/coordinatorPermissions.js';
import { enqueueMailJobs } from '../services/mailQueueService.js';
import crypto from 'crypto';

function generateTemporaryPassword(length = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  return Array.from({ length }, () => alphabet[crypto.randomInt(0, alphabet.length)]).join('');
}

function summarizePermissions(user) {
  const permissions = normalizeCoordinatorPermissions(user.coordinatorPermissions);
  return {
    permissions,
    permissionCount: permissions.length,
    totalPermissionCount: DEFAULT_COORDINATOR_PERMISSIONS.length,
    lastPermissionUpdatedAt: user.coordinatorPermissionHistory?.[0]?.createdAt || user.updatedAt,
  };
}

export async function listAllCoordinators(req, res) {
  try {
    const { search } = req.query;
    let query = { role: 'coordinator' };

    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      query = {
        role: 'coordinator',
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { coordinatorId: searchRegex },
        ],
      };
    }

    const users = await User.find(query)
      .select('name email phone role coordinatorId department college createdAt updatedAt avatarUrl isActive coordinatorPermissions coordinatorPermissionHistory activeSessionCreatedAt credentialEmailStatus credentialEmailSentAt credentialEmailLastAttemptAt')
      .sort({ createdAt: -1 })
      .lean();

    // Compute dynamic student assignment counts per coordinator
    const coordinatorIds = users.map(u => (u.coordinatorId || '').trim()).filter(Boolean);
    let countsMap = new Map();
    if (coordinatorIds.length) {
      // Count students assigned to a coordinator using teacherIds array
      // A student with teacherIds: ['COO1', 'COO2'] will be counted for both coordinators
    const pipeline = [
      {
        $match: {
          role: 'student',
          teacherIds: { $in: coordinatorIds },
        },
      },
      {
        $unwind: '$teacherIds'
      },
      {
        $match: {
          teacherIds: { $in: coordinatorIds }
        }
      },
      {
        $group: {
          _id: '$teacherIds',
          count: { $sum: 1 },
        },
      },
    ];
    const counts = await User.aggregate(pipeline);
    countsMap = new Map(counts.map(c => [c._id, c.count]));
  }

  // Count events created by each coordinator
  const eventsPipeline = [
    {
      $match: {
        coordinatorId: { $in: coordinatorIds }
      }
    },
    {
      $group: {
        _id: '$coordinatorId',
        regularEvents: {
          $sum: { $cond: [{ $eq: ['$isSpecial', false] }, 1, 0] }
        },
        specialEvents: {
          $sum: { $cond: [{ $eq: ['$isSpecial', true] }, 1, 0] }
        },
        totalEvents: { $sum: 1 }
      }
    }
  ];
  const eventCounts = await Event.aggregate(eventsPipeline);
  const eventsMap = new Map(eventCounts.map(e => [e._id, {
    regular: e.regularEvents,
    special: e.specialEvents,
    total: e.totalEvents
  }]));

  const enriched = users.map(u => ({
    ...u,
    status: u.isActive === false ? 'disabled' : 'active',
    lastActive: u.activeSessionCreatedAt || u.updatedAt,
    ...summarizePermissions(u),
    studentsAssigned: countsMap.get(u.coordinatorId) || 0,
    eventsCreated: eventsMap.get(u.coordinatorId) || { regular: 0, special: 0, total: 0 }
  }));    res.json({ count: enriched.length, coordinators: enriched });
  } catch (err) {
    console.error('Error listing coordinators:', err);
    res.status(500).json({ error: 'Failed to fetch coordinators' });
  }
}

export async function createCoordinator(req, res) {
  try {
    const { coordinatorName, coordinatorEmail, coordinatorPassword, coordinatorID, phone, department, college, permissions } = req.body || {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!coordinatorName || !coordinatorEmail || !coordinatorID) {
      return res.status(400).json({ error: 'Missing required fields (coordinatorName, coordinatorEmail, coordinatorID)' });
    }
    if (!emailRegex.test(coordinatorEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const exists = await User.findOne({ $or: [{ email: coordinatorEmail }, { coordinatorId: coordinatorID }] });
    if (exists) return res.status(409).json({ error: 'Coordinator with email or coordinatorID already exists' });

    const defaultPassword = coordinatorPassword || coordinatorID;
    const passwordHash = await User.hashPassword(defaultPassword);
    const user = await User.create({
      role: 'coordinator',
      name: coordinatorName,
      email: coordinatorEmail,
      coordinatorId: coordinatorID,
      phone,
      department,
      college,
      passwordHash,
      mustChangePassword: true,
      isActive: true,
      coordinatorPermissions: normalizeCoordinatorPermissions(permissions),
      credentialEmailStatus: 'not_sent',
    });

    // Log activity
    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'CREATE',
      targetType: 'COORDINATOR',
      targetId: user._id.toString(),
      description: `Created coordinator: ${coordinatorName} (${coordinatorEmail})`,
      metadata: { coordinatorId: coordinatorID },
      req
    });

    return res.status(201).json({ id: user._id, _id: user._id, email: user.email, coordinatorID: user.coordinatorId, status: 'created', permissionCount: user.coordinatorPermissions.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateCoordinator(req, res) {
  try {
    const { coordinatorId } = req.params;
    const { coordinatorName, coordinatorEmail, coordinatorID, phone, department, college } = req.body || {};

    const coordinator = await User.findOne({ _id: coordinatorId, role: 'coordinator' });
    if (!coordinator) {
      return res.status(404).json({ error: 'Coordinator not found' });
    }
    const previousCoordinatorCode = coordinator.coordinatorId;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (coordinatorEmail && !emailRegex.test(coordinatorEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Check for duplicates if email or coordinatorID is changing
    if (coordinatorEmail && coordinatorEmail !== coordinator.email) {
      const exists = await User.findOne({
        _id: { $ne: coordinatorId },
        email: coordinatorEmail,
      });
      if (exists) {
        return res.status(409).json({ error: 'Another coordinator with this email already exists' });
      }
    }

    if (coordinatorID && coordinatorID !== coordinator.coordinatorId) {
      const exists = await User.findOne({
        _id: { $ne: coordinatorId },
        coordinatorId: coordinatorID,
      });
      if (exists) {
        return res.status(409).json({ error: 'Another coordinator with this Coordinator ID already exists' });
      }
    }

    if (coordinatorName) coordinator.name = coordinatorName;
    if (coordinatorEmail) coordinator.email = coordinatorEmail;
    if (coordinatorID) coordinator.coordinatorId = coordinatorID;
    if (phone !== undefined) coordinator.phone = phone;
    if (department !== undefined) coordinator.department = department;
    if (college !== undefined) coordinator.college = college;

    await coordinator.save();

    if (coordinatorID && previousCoordinatorCode && coordinatorID !== previousCoordinatorCode) {
      await Promise.all([
        User.updateMany(
          { role: 'student', teacherIds: previousCoordinatorCode },
          [{
            $set: {
              teacherIds: {
                $map: {
                  input: '$teacherIds',
                  as: 'teacherId',
                  in: {
                    $cond: [
                      { $eq: ['$$teacherId', previousCoordinatorCode] },
                      coordinatorID,
                      '$$teacherId',
                    ],
                  },
                },
              },
            },
          }],
        ),
        Event.updateMany(
          { coordinatorId: previousCoordinatorCode },
          { $set: { coordinatorId: coordinatorID } },
        ),
      ]);
    }

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'COORDINATOR',
      targetId: coordinator._id.toString(),
      description: `Updated coordinator: ${coordinator.name} (${coordinator.email})`,
      metadata: { coordinatorId: coordinator.coordinatorId },
      req,
    });

    return res.json({
      id: coordinator._id,
      email: coordinator.email,
      coordinatorID: coordinator.coordinatorId,
      phone: coordinator.phone,
      department: coordinator.department,
      college: coordinator.college,
      status: 'updated',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function bulkCreateCoordinators(req, res) {
  try {
    const rows = Array.isArray(req.body?.coordinators) ? req.body.coordinators : [];
    if (!rows.length) return res.status(400).json({ error: 'At least one coordinator row is required.' });
    if (rows.length > 500) return res.status(400).json({ error: 'A maximum of 500 coordinators can be uploaded at once.' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seenEmails = new Set();
    const seenIds = new Set();
    const normalizedRows = rows.map((row, index) => ({
      row: Number(row.row || index + 2),
      name: String(row.name || row.coordinatorName || '').trim(),
      email: String(row.email || row.coordinatorEmail || '').trim().toLowerCase(),
      coordinatorId: String(row.coordinatorId || row.coordinatorID || '').trim(),
      password: String(row.password || row.coordinatorPassword || '').trim(),
      phone: String(row.phone || '').trim(),
      department: String(row.department || '').trim(),
      college: String(row.college || '').trim(),
      grantDefaultAccess: row.grantDefaultAccess === true || String(row.grantDefaultAccess || '').toLowerCase() === 'true',
    }));

    const results = [];
    const validRows = [];
    for (const row of normalizedRows) {
      const errors = [];
      if (!row.name) errors.push('Name is required');
      if (!row.email) errors.push('Email is required');
      else if (!emailRegex.test(row.email)) errors.push('Email format is invalid');
      if (!row.coordinatorId) errors.push('Coordinator ID is required');
      if (row.password && row.password.length < 6) errors.push('Password must have at least 6 characters');
      if (seenEmails.has(row.email)) errors.push('Duplicate email in file');
      if (seenIds.has(row.coordinatorId.toLowerCase())) errors.push('Duplicate Coordinator ID in file');
      seenEmails.add(row.email);
      seenIds.add(row.coordinatorId.toLowerCase());
      if (errors.length) results.push({ row: row.row, status: 'error', errors });
      else validRows.push(row);
    }

    const existing = validRows.length ? await User.find({
      role: 'coordinator',
      $or: [
        { email: { $in: validRows.map((row) => row.email) } },
        { coordinatorId: { $in: validRows.map((row) => row.coordinatorId) } },
      ],
    }).select('email coordinatorId').lean() : [];
    const existingEmails = new Set(existing.map((user) => String(user.email || '').toLowerCase()));
    const existingIds = new Set(existing.map((user) => String(user.coordinatorId || '').toLowerCase()));
    const created = [];

    for (const row of validRows) {
      if (existingEmails.has(row.email) || existingIds.has(row.coordinatorId.toLowerCase())) {
        results.push({ row: row.row, status: 'exists', errors: ['Coordinator email or ID already exists'] });
        continue;
      }
      try {
        const temporaryPassword = row.password || row.coordinatorId;
        const user = await User.create({
          role: 'coordinator',
          name: row.name,
          email: row.email,
          coordinatorId: row.coordinatorId,
          phone: row.phone,
          department: row.department,
          college: row.college,
          passwordHash: await User.hashPassword(temporaryPassword),
          mustChangePassword: true,
          isActive: true,
          coordinatorPermissions: row.grantDefaultAccess ? DEFAULT_COORDINATOR_PERMISSIONS : [],
          credentialEmailStatus: 'not_sent',
        });
        created.push({ user, temporaryPassword });
        results.push({ row: row.row, status: 'created', id: user._id, coordinatorId: user.coordinatorId });
      } catch (error) {
        results.push({ row: row.row, status: 'error', errors: [error?.code === 11000 ? 'Coordinator email or ID already exists' : 'Coordinator could not be created'] });
      }
    }

    const emailSent = 0;
    const emailFailed = 0;

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'BULK_CREATE',
      targetType: 'COORDINATOR',
      targetId: 'bulk-upload',
      description: `Bulk uploaded ${created.length} coordinator${created.length === 1 ? '' : 's'}`,
      metadata: { requested: rows.length, created: created.length, emailSent, emailFailed },
      req,
    });

    return res.json({
      requested: rows.length,
      created: created.length,
      failed: rows.length - created.length,
      emailSent,
      emailFailed,
      results: results.sort((a, b) => a.row - b.row),
    });
  } catch (err) {
    console.error('Error bulk creating coordinators:', err);
    return res.status(500).json({ error: 'Failed to bulk create coordinators.' });
  }
}

export async function resendCoordinatorCredentials(req, res) {
  const coordinatorIds = [...new Set((req.body?.coordinatorIds || []).map(String))];
  if (!coordinatorIds.length) return res.status(400).json({ error: 'Select at least one coordinator.' });
  if (coordinatorIds.length > 1000) return res.status(400).json({ error: 'A maximum of 1000 coordinators can be queued at once.' });
  const stalePendingBefore = new Date(Date.now() - 10 * 60 * 1000);
  const candidates = await User.find({
    _id: { $in: coordinatorIds },
    role: 'coordinator',
    mustChangePassword: true,
    activeSessionCreatedAt: { $exists: false },
  }).select('_id name email coordinatorId passwordHash').lean();
  const batchId = crypto.randomUUID();
  const claimed = [];
  for (const candidate of candidates) {
    const coordinator = await User.findOneAndUpdate(
      {
        _id: candidate._id,
        role: 'coordinator',
        mustChangePassword: true,
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
    ).select('_id name email coordinatorId passwordHash');
    if (coordinator) claimed.push(coordinator);
  }
  const jobs = claimed.filter((user) => user.email).map((user) => {
    const password = generateTemporaryPassword();
    return {
      type: 'coordinator_onboarding',
      to: user.email,
      recipientId: user._id,
      targetType: 'COORDINATOR',
      targetId: user._id,
      idempotencyKey: `coordinator-credentials:${user._id}:${batchId}`,
      payload: {
        to: user.email,
        name: user.name,
        coordinatorId: user.coordinatorId,
        password,
        previousPasswordHash: user.passwordHash,
      },
    };
  });
  await enqueueMailJobs(jobs, {
    batchId,
    requestedBy: req.user._id,
    requestedByEmail: req.user.email,
  });
  const queuedCoordinatorIds = new Set(jobs.map((job) => String(job.recipientId)));
  const missingDeliveryDetails = claimed.filter((user) => !queuedCoordinatorIds.has(String(user._id)));
  if (missingDeliveryDetails.length) await User.updateMany(
    { _id: { $in: missingDeliveryDetails.map((user) => user._id) }, credentialEmailBatchId: batchId },
    {
      $set: {
        credentialEmailStatus: 'failed',
        credentialEmailLastError: 'Email address is missing.',
      },
      $unset: { credentialEmailBatchId: 1 },
    },
  );
  return res.status(202).json({
    batchId,
    requested: coordinatorIds.length,
    queued: jobs.length,
    skipped: coordinatorIds.length - jobs.length,
  });
}

export async function getCoordinatorAccess(req, res) {
  try {
    const { coordinatorId } = req.params;
    const coordinator = await User.findOne({ _id: coordinatorId, role: 'coordinator' })
      .select('name email phone role coordinatorId department college createdAt updatedAt isActive coordinatorPermissions coordinatorPermissionHistory activeSessionCreatedAt avatarUrl')
      .lean();

    if (!coordinator) {
      return res.status(404).json({ error: 'Coordinator not found' });
    }
    return res.json({
      coordinator: {
        ...coordinator,
        status: coordinator.isActive === false ? 'disabled' : 'active',
        lastActive: coordinator.activeSessionCreatedAt || coordinator.updatedAt,
        ...summarizePermissions(coordinator),
      },
      catalog: COORDINATOR_PERMISSION_CATEGORIES,
      allPermissions: DEFAULT_COORDINATOR_PERMISSIONS,
      history: coordinator.coordinatorPermissionHistory || [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateCoordinatorAccess(req, res) {
  try {
    const { coordinatorId } = req.params;
    const { permissions, note } = req.body || {};
    const coordinator = await User.findOne({ _id: coordinatorId, role: 'coordinator' });

    if (!coordinator) {
      return res.status(404).json({ error: 'Coordinator not found' });
    }

    const previousPermissions = normalizeCoordinatorPermissions(coordinator.coordinatorPermissions);
    const nextPermissions = normalizeCoordinatorPermissions(permissions);

    coordinator.coordinatorPermissions = nextPermissions;
    coordinator.coordinatorPermissionHistory.unshift({
      changedBy: req.user._id,
      changedByEmail: req.user.email,
      previousPermissions,
      nextPermissions,
      note: note || 'Permissions updated by admin',
    });
    coordinator.coordinatorPermissionHistory = coordinator.coordinatorPermissionHistory.slice(0, 25);
    await coordinator.save();

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'COORDINATOR',
      targetId: coordinator._id.toString(),
      description: `Updated coordinator access for ${coordinator.name || coordinator.email}`,
      metadata: {
        coordinatorId: coordinator.coordinatorId,
        previousCount: previousPermissions.length,
        nextCount: nextPermissions.length,
        grantedPermissions: nextPermissions.filter((permission) => !previousPermissions.includes(permission)),
        revokedPermissions: previousPermissions.filter((permission) => !nextPermissions.includes(permission)),
        note: note || 'Permissions updated by admin',
      },
      req,
    });

    return res.json({
      coordinator: {
        _id: coordinator._id,
        name: coordinator.name,
        email: coordinator.email,
        coordinatorId: coordinator.coordinatorId,
        status: coordinator.isActive === false ? 'disabled' : 'active',
        ...summarizePermissions(coordinator),
      },
      history: coordinator.coordinatorPermissionHistory,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function updateCoordinatorStatus(req, res) {
  try {
    const { coordinatorId } = req.params;
    const { isActive } = req.body || {};
    const coordinator = await User.findOne({ _id: coordinatorId, role: 'coordinator' });

    if (!coordinator) {
      return res.status(404).json({ error: 'Coordinator not found' });
    }

    coordinator.isActive = Boolean(isActive);
    await coordinator.save();

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'UPDATE',
      targetType: 'COORDINATOR',
      targetId: coordinator._id.toString(),
      description: `${coordinator.isActive ? 'Enabled' : 'Disabled'} coordinator: ${coordinator.name || coordinator.email}`,
      metadata: { coordinatorId: coordinator.coordinatorId },
      req,
    });

    return res.json({
      id: coordinator._id,
      isActive: coordinator.isActive,
      status: coordinator.isActive ? 'active' : 'disabled',
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

export async function deleteCoordinator(req, res) {
  try {
    const { coordinatorId } = req.params;

    const coordinator = await User.findOne({ _id: coordinatorId, role: 'coordinator' });
    if (!coordinator) {
      return res.status(404).json({ error: 'Coordinator not found' });
    }
    const [assignedStudents, ownedEvents] = await Promise.all([
      User.countDocuments({ role: 'student', teacherIds: coordinator.coordinatorId }),
      Event.countDocuments({ coordinatorId: coordinator.coordinatorId }),
    ]);
    if (assignedStudents || ownedEvents) {
      return res.status(409).json({
        error: `Coordinator cannot be deleted while assigned to ${assignedStudents} student(s) and ${ownedEvents} interview(s). Reassign those records or disable the account instead.`,
        assignedStudents,
        ownedEvents,
      });
    }
    await coordinator.deleteOne();

    logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'DELETE',
      targetType: 'COORDINATOR',
      targetId: coordinator._id.toString(),
      description: `Deleted coordinator: ${coordinator.name} (${coordinator.email})`,
      metadata: { coordinatorId: coordinator.coordinatorId },
      req,
    });

    return res.json({
      message: 'Coordinator deleted successfully',
      coordinator: {
        id: coordinator._id,
        name: coordinator.name,
        email: coordinator.email,
        coordinatorId: coordinator.coordinatorId,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
