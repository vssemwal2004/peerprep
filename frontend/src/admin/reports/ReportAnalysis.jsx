import { useMemo } from 'react';
import PrepAnalysisPage from '../prepAnalysis/PrepAnalysisPage';

/**
 * The Prep Analysis charts, tables, drill-downs, filters and downloads for ONE assessment, shown
 * inside its report. Same components as the Prep Analysis page; the scope limits every request
 * to this test and the students assigned to it or who attempted it.
 */
export default function ReportAnalysis({ assessmentId }) {
  const scope = useMemo(() => ({ assessmentIds: [assessmentId] }), [assessmentId]);
  return (
    <div data-no-serial>
      <PrepAnalysisPage scope={scope} embedded />
    </div>
  );
}
