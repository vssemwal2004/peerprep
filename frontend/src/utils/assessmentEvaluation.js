export function assessmentEvaluationLabel(report) {
  if (report?.evaluationStatus === 'processing') return 'Evaluation pending';
  if (report?.evaluationStatus === 'failed') return 'Evaluation needs review';
  return '';
}
