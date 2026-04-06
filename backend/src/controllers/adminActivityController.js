import Activity from '../models/Activity.js';

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
    const {
      page = 1,
      limit = 50,
      actionType,
      targetType,
      startDate,
      endDate,
      search,
      coordinatorEmail
    } = req.query;

    const query = {};

    // Role-based filtering
    if (req.user.role === 'coordinator') {
      // Coordinators see:
      // 1. Their own activities
      // 2. Admin activities that affected their resources (check metadata.coordinatorId)
      query.$or = [
        { userEmail: req.user.email, userRole: 'coordinator' },
        { userRole: 'admin', 'metadata.coordinatorId': req.user.coordinatorId }
      ];
    } else if (req.user.role === 'admin') {
      // Admin can filter by coordinator email or see all admin activities
      if (coordinatorEmail) {
        query.userEmail = coordinatorEmail;
        query.userRole = 'coordinator';
      } else {
        query.userRole = 'admin';
      }
    }

    // Filter by action type
    if (actionType) {
      query.actionType = actionType;
    }

    // Filter by target type
    if (targetType) {
      query.targetType = targetType;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Search in description
    if (search) {
      query.$or = [
        { description: { $regex: search, $options: 'i' } },
        { userEmail: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [activities, total] = await Promise.all([
      Activity.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Activity.countDocuments(query)
    ]);

    res.json({
      activities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching activities:', error);
    res.status(500).json({ error: 'Failed to fetch activities' });
  }
};

// Get activity statistics
const getActivityStats = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === 'coordinator') {
      // Coordinators see:
      // 1. Their own activities
      // 2. Admin activities that affected their resources
      query.$or = [
        { userEmail: req.user.email, userRole: 'coordinator' },
        { userRole: 'admin', 'metadata.coordinatorId': req.user.coordinatorId }
      ];
    } else if (req.user.role === 'admin') {
      // Admin sees only admin activities (shared between all admins)
      query.userRole = 'admin';
    }

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
          $gte: new Date(new Date().setHours(0, 0, 0, 0))
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
      targetTypeStats
    });
  } catch (error) {
    console.error('Error fetching activity stats:', error);
    res.status(500).json({ error: 'Failed to fetch activity statistics' });
  }
};

// Export activities as CSV
const exportActivitiesCSV = async (req, res) => {
  try {
    const query = {};

    if (req.user.role === 'coordinator') {
      query.userEmail = req.user.email;
      query.userRole = 'coordinator';
    }

    // Apply same filters as getActivities
    const { actionType, targetType, startDate, endDate } = req.query;

    if (actionType) query.actionType = actionType;
    if (targetType) query.targetType = targetType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

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
