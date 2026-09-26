const active = new Map();

export function acquireAssessmentReportSlot(kind = 'report', maximum = kind === 'export' ? 1 : 2) {
  if ((active.get(kind) || 0) >= maximum) {
    const error = new Error('Reports are busy. Retry shortly.');
    error.status = 503;
    error.code = 'REPORT_BUSY';
    throw error;
  }
  active.set(kind, (active.get(kind) || 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active.set(kind, Math.max(0, (active.get(kind) || 1) - 1));
  };
}

export function createBoundedReportAggregate({ budgetMs = 8000, queryMaxMs = 3000 } = {}) {
  const deadline = Date.now() + budgetMs;
  return (model, pipeline) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      const error = new Error('Report query budget exceeded. Narrow the selected assessment or date range.');
      error.status = 503;
      error.code = 'REPORT_TIMEOUT';
      throw error;
    }
    return model.aggregate(pipeline).option({ maxTimeMS: Math.max(1, Math.min(queryMaxMs, remaining)) });
  };
}

export const MAX_ASSESSMENT_EXPORT_ROWS = 500;
export const MAX_ASSESSMENT_EXPORT_BYTES = 10 * 1024 * 1024;

export function assertAssessmentExportSize(count, payload, byteCount = 0) {
  if (count > MAX_ASSESSMENT_EXPORT_ROWS || byteCount > MAX_ASSESSMENT_EXPORT_BYTES || (payload && Buffer.byteLength(JSON.stringify(payload)) > MAX_ASSESSMENT_EXPORT_BYTES)) {
    const error = new Error(`Export exceeds the synchronous limit (${MAX_ASSESSMENT_EXPORT_ROWS} candidates or 10 MiB). Narrow the assessment/date filters.`);
    error.status = 413;
    error.code = 'REPORT_EXPORT_TOO_LARGE';
    throw error;
  }
}
