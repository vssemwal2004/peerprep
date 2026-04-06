import mongoose from 'mongoose';

const activitySchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    index: true
  },
  userRole: {
    type: String,
    enum: ['admin', 'coordinator'],
    required: true
  },
  actionType: {
    type: String,
    required: true,
    enum: [
      'CREATE',
      'UPDATE',
      'DELETE',
      'LOGIN',
      'LOGOUT',
      'PASSWORD_CHANGE',
      'EXPORT',
      'UPLOAD',
      'DOWNLOAD',
      'ASSIGN',
      'UNASSIGN',
      'APPROVE',
      'REJECT',
      'SCHEDULE',
      'RESCHEDULE',
      'CANCEL',
      'JOIN',
      'LEAVE',
      'ARCHIVE',
      'RESTORE',
      'REORDER',
      'BULK_CREATE',
      'BULK_UPDATE',
      'BULK_DELETE'
    ]
  },
  targetType: {
    type: String,
    required: true,
    enum: [
      'STUDENT',
      'COORDINATOR',
      'EVENT',
      'SUBJECT',
      'CHAPTER',
      'TOPIC',
      'SEMESTER',
      'FEEDBACK',
      'PROFILE',
      'SYSTEM',
      'INTERVIEW',
      'SCHEDULE',
      'PAIR',
      'FILE',
      'TEMPLATE',
      'SLOT',
      'PROGRESS',
      'SPECIAL_STUDENT'
    ]
  },
  targetId: {
    type: String,
    default: null
  },
  description: {
    type: String,
    required: true
  },
  changes: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index for faster queries
activitySchema.index({ createdAt: -1 });
activitySchema.index({ userEmail: 1, createdAt: -1 });
activitySchema.index({ userRole: 1, createdAt: -1 });
activitySchema.index({ actionType: 1, createdAt: -1 });

export default mongoose.model('Activity', activitySchema);
