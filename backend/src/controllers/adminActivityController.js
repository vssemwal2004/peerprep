import Activity from '../models/Activity.js';

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DEFAULT_WINDOW_DAYS = 10;

function startOfWindow(days = DEFAULT_WINDOW_DAYS) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function parseBoundary(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    date.setUTCHours(23, 59, 59, 999);
  }
  return date;
}

function buildActivityQuery(req) {
  const {
    actionType,
    targetType,
    startDate,
    endDate,
    search,
    coordinatorEmail,
    actorScope,
  } = req.query;
  const conditions = [];

  // Activity is a tenant model, so this query can only read the current
  // university database. No cross-university merge is performed here.
  if (req.user.role === 'coordinator') {
    conditions.push({
      $or: [
        { userEmail: req.user.email, userRole: 'coordinator' },
        { userRole: 'admin', 'metadata.coordinatorId': req.user.coordinatorId },
      ],
    });
  } else if (req.user.role === 'admin') {
    if (coordinatorEmail) {
      conditions.push({ userEmail: String(coordinatorEmail).trim().slice(0, 254), userRole: 'coordinator' });
    } else if (actorScope === 'admin' || actorScope === 'coordinator') {
      conditions.push({ userRole: actorScope });
    }
  }

  if (actionType) conditions.push({ actionType: String(actionType).toUpperCase() });
  if (targetType) conditions.push({ targetType: String(targetType).toUpperCase() });

  const parsedStart = parseBoundary(startDate) || startOfWindow();
  const parsedEnd = parseBoundary(endDate, true);
  const createdAt = { $gte: parsedStart };
  if (parsedEnd) createdAt.$lte = parsedEnd;
  conditions.push({ createdAt });

  if (search) {
    const safeSearch = escapeRegex(String(search).trim().slice(0, 120));
    if (safeSearch) {
      conditions.push({
        $or: [
          { description: { $regex: safeSearch, $options: 'i' } },
          { userEmail: { $regex: safeSearch, $options: 'i' } },
          { targetId: { $regex: safeSearch, $options: 'i' } },
        ],
      });
    }
  }

  return conditions.length === 1 ? conditions[0] : { $and: conditions };
}

// Log activity helper function
const logActivity = async ({
  userEmail,
  userRole,
  actionType,
  targetType,
  targetId = null,
  description,
  changes = null,
  metadata = {},
  req = null
}) => {
  try {
    const activityData = {
      userEmail,
      userRole,
      actionType,
      targetType,
      targetId,
      description,
      changes,
      metadata
    };

    if (req) {
      activityData.ipAddress = req.ip || req.connection.remoteAddress;
      activityData.userAgent = req.get('user-agent');
    }

    const activity = new Activity(activityData);
    await activity.save();
    return activity;
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw error to prevent breaking main operations
  }
};

// Get activities with filters
const getActivities = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const query = buildActivityQuery(req);

    const pageNum = Math.max(1, Number.parseInt(page, 10) || 1);
    const limitNum = Math.min(250, Math.max(1, Number.parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    const [activities, total] = await Promise.all([
      Activity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Activity.countDocuments(query)
    ]);

    res.json({
      activities,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(1, Math.ceil(total / limitNum))
      },
      windowDays: DEFAULT_WINDOW_DAYS,
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
};

// Get activity statistics
const getActivityStats = async (req, res) => {
  try {
    const query = buildActivityQuery(req);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalActivities,
      todayActivities,
      actionTypeStats,
      targetTypeStats
    ] = await Promise.all([
      Activity.countDocuments(query),
      Activity.countDocuments({
        ...query,
        createdAt: {
          $gte: today
        }
      }),
      Activity.aggregate([
        { $match: query },
        { $group: { _id: '$actionType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Activity.aggregate([
        { $match: query },
        { $group: { _id: '$targetType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);

    res.json({
      totalActivities,
      todayActivities,
      actionTypeStats,
      targetTypeStats,
      windowDays: DEFAULT_WINDOW_DAYS,
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
};

// Export activities as CSV
const exportActivitiesCSV = async (req, res) => {
  try {
    // Export exactly the same tenant, actor, search and date scope as the page.
    const query = buildActivityQuery(req);

    const activities = await Activity.find(query)
      .sort({ createdAt: -1 })
      .limit(10000) // Limit to prevent memory issues
      .lean();

    // Generate CSV
    const csvHeader = 'Date,Time,User Email,Role,Action Type,Target Type,Target ID,Description\n';
    const csvRows = activities.map(activity => {
      const date = new Date(activity.createdAt);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString();
      const description = (activity.description || '').replace(/"/g, '""');
      
      return `"${dateStr}","${timeStr}","${activity.userEmail}","${activity.userRole}","${activity.actionType}","${activity.targetType}","${activity.targetId || 'N/A'}","${description}"`;
    }).join('\n');

    const csv = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="activity-log-${Date.now()}.csv"`);
    res.send(csv);

    // Log the export activity
    await logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType: 'EXPORT',
      targetType: 'SYSTEM',
      description: `Exported ${activities.length} activity records to CSV`,
      metadata: { recordCount: activities.length },
      req
    });
  } catch (error) {
    console.error('Error exporting activities:', error);
    res.status(500).json({ error: 'Failed to export activities' });
  }
};

// Delete old activities (cleanup job)
const cleanupOldActivities = async (daysToKeep = 90) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await Activity.deleteMany({
      createdAt: { $lt: cutoffDate }
    });

    console.log(`Cleaned up ${result.deletedCount} old activity records`);
    return result.deletedCount;
  } catch (error) {
    console.error('Error cleaning up old activities:', error);
    throw error;
  }
};

export {
  logActivity,
  getActivities,
  getActivityStats,
  exportActivitiesCSV,
  cleanupOldActivities
};
