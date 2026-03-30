import { useCallback } from 'react';
import { api } from '../utils/api';

/**
 * Custom hook for logging activities
 * Provides a simple interface to track user actions across the application
 */
export const useActivityLogger = () => {
  const logActivity = useCallback(async ({
    actionType,
    targetType,
    targetId = null,
    description,
    changes = null,
    metadata = {}
  }) => {
    try {
      await api.logActivity({
        actionType,
        targetType,
        targetId,
        description,
        changes,
        metadata
      });
    } catch (error) {
      // Non-blocking error - log but don't throw
      console.warn('[Activity Logger] Failed to log activity:', error);
    }
  }, []);

  // Helper methods for common actions
  const logCreate = useCallback((targetType, targetId, description, metadata = {}) => {
    return logActivity({
      actionType: 'CREATE',
      targetType,
      targetId,
      description,
      metadata
    });
  }, [logActivity]);

  const logUpdate = useCallback((targetType, targetId, description, changes = null, metadata = {}) => {
    return logActivity({
      actionType: 'UPDATE',
      targetType,
      targetId,
      description,
      changes,
      metadata
    });
  }, [logActivity]);

  const logDelete = useCallback((targetType, targetId, description, metadata = {}) => {
    return logActivity({
      actionType: 'DELETE',
      targetType,
      targetId,
      description,
      metadata
    });
  }, [logActivity]);

  const logUpload = useCallback((targetType, targetId, description, metadata = {}) => {
    return logActivity({
      actionType: 'UPLOAD',
      targetType,
      targetId,
      description,
      metadata
    });
  }, [logActivity]);

  const logDownload = useCallback((targetType, targetId, description, metadata = {}) => {
    return logActivity({
      actionType: 'DOWNLOAD',
      targetType,
      targetId,
      description,
      metadata
    });
  }, [logActivity]);

  const logExport = useCallback((targetType, description, metadata = {}) => {
    return logActivity({
      actionType: 'EXPORT',
      targetType,
      description,
      metadata
    });
  }, [logActivity]);

  const logBulkCreate = useCallback((targetType, description, metadata = {}) => {
    return logActivity({
      actionType: 'BULK_CREATE',
      targetType,
      description,
      metadata
    });
  }, [logActivity]);

  const logBulkUpdate = useCallback((targetType, description, metadata = {}) => {
    return logActivity({
      actionType: 'BULK_UPDATE',
      targetType,
      description,
      metadata
    });
  }, [logActivity]);

  const logBulkDelete = useCallback((targetType, description, metadata = {}) => {
    return logActivity({
      actionType: 'BULK_DELETE',
      targetType,
      description,
      metadata
    });
  }, [logActivity]);

  const logReorder = useCallback((targetType, description, metadata = {}) => {
    return logActivity({
      actionType: 'REORDER',
      targetType,
      description,
      metadata
    });
  }, [logActivity]);

  const logSchedule = useCallback((targetType, targetId, description, metadata = {}) => {
    return logActivity({
      actionType: 'SCHEDULE',
      targetType,
      targetId,
      description,
      metadata
    });
  }, [logActivity]);

  const logJoin = useCallback((targetType, targetId, description, metadata = {}) => {
    return logActivity({
      actionType: 'JOIN',
      targetType,
      targetId,
      description,
      metadata
    });
  }, [logActivity]);

  return {
    logActivity,
    logCreate,
    logUpdate,
    logDelete,
    logUpload,
    logDownload,
    logExport,
    logBulkCreate,
    logBulkUpdate,
    logBulkDelete,
    logReorder,
    logSchedule,
    logJoin
  };
};
