import { useLocation, useParams } from 'react-router-dom';
import AdminTestCompiler from '../compiler/AdminTestCompiler';

export default function AssessmentCodingPreview() {
  const { tempId } = useParams();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const assessmentKey = params.get('assessment') || 'new';
  const sectionIndex = params.get('section') || '0';
  const questionIndex = params.get('question') || '0';
  const returnTo = params.get('return') || '/admin/assessment';

  const editorQuery = new URLSearchParams({
    assessment: assessmentKey,
    section: sectionIndex,
    question: questionIndex,
    return: returnTo,
  });

  return (
    <div className="min-h-screen bg-white pt-20 dark:bg-gray-900">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <AdminTestCompiler
          backTo={returnTo}
          editTo={`/admin/assessment/coding-question/${tempId}?${editorQuery.toString()}`}
          backLabel="Back to Assessment"
          editLabel="Back to Editor"
        />
      </div>
    </div>
  );
}
