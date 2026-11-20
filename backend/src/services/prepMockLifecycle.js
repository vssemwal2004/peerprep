export function resetMockDefinition(mock, now = new Date()) {
  mock.mockHasHistory = mock.mockHasHistory || mock.lifecycleStatus === 'published';
  mock.lifecycleStatus = 'draft';
  mock.isVisible = false;
  mock.targetType = 'selected';
  mock.assignedStudents = [];
  mock.draftAssignedStudents = [];
  mock.candidateSetAssignments = [];
  mock.startTime = null;
  mock.endTime = null;
  mock.availabilityMode = 'scheduled';
  mock.manuallyCompletedAt = null;
  mock.version = (mock.version || 1) + 1;
  mock.versionUpdatedAt = now;
  return mock;
}

export function unpublishMockDefinition(mock, now = new Date()) {
  mock.mockHasHistory = mock.mockHasHistory || mock.lifecycleStatus === 'published';
  mock.lifecycleStatus = 'draft';
  mock.isVisible = false;
  mock.version = (mock.version || 1) + 1;
  mock.versionUpdatedAt = now;
  return mock;
}
