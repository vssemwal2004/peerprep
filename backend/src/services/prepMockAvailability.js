const OPEN_END = new Date('9999-12-31T23:59:59.000Z');

// Older published mocks can still have a stored schedule. The current PrepMock rule is
// always on until unpublish or reset, including for mocks created before that rule.
export function publishedMockAlwaysOn(assessment, now = new Date()) {
  if (assessment?.kind !== 'mock' || assessment.lifecycleStatus !== 'published') return assessment;
  const createdAt = assessment.createdAt ? new Date(assessment.createdAt) : null;
  const startTime = createdAt && !Number.isNaN(createdAt.getTime()) && createdAt <= now ? createdAt : now;
  return { ...assessment, availabilityMode: 'always', startTime, endTime: OPEN_END };
}
