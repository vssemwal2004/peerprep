// The central library rows universities may use: published, not private, and not assessment-only.
// Shared by the university question feed and central QuickPrep authoring so both agree on one catalog.
export const CENTRAL_QUESTION_FILTER = Object.freeze({
  status: 'published',
  visibility: { $ne: 'private' },
  sourceType: { $ne: 'assessment' },
});
