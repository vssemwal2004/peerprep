import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getActivities,
  getActivityStats,
  exportActivitiesCSV
} from '../controllers/adminActivityController.js';

const router = express.Router();

// All routes require authentication
router.use(requireAuth);

// Get activities (admin sees all, coordinator sees only their own)
router.get('/', getActivities);

// Get activity statistics
router.get('/stats', getActivityStats);

// Export activities as CSV
router.get('/export', exportActivitiesCSV);

// Log activity (for frontend tracking)
router.post('/', async (req, res) => {
  const { logActivity } = await import('../controllers/adminActivityController.js');
  try {
    const { actionType, targetType, targetId, description, changes, metadata } = req.body;
    
    await logActivity({
      userEmail: req.user.email,
      userRole: req.user.role,
      actionType,
      targetType,
      targetId,
      description,
      changes,
      metadata,
      req
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error logging activity:', error);
    res.status(500).json({ error: 'Failed to log activity' });
  }
});

export default router;
