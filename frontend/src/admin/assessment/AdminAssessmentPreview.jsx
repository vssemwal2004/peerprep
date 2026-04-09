import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Clock, ArrowLeft } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/CustomToast';
import { RichTextPreview } from '../compiler/CompilerContentPreview';

const formatTime = (ms) => {
  if (ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

export default function AdminAssessmentPreview() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState(0);
  const [activeQuestion, setActiveQuestion] = useState(0);

  useEffect(() => {
    let mounted = true;
    const loadAssessment = async () => {
      setLoading(true);
      try {
        const data = await api.getAssessmentById(id);
        if (!mounted) return;
        setAssessment(data.assessment);
      } catch (error) {
        toast.error(error.message || 'Failed to load assessment preview.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadAssessment();
    return () => {
      mounted = false;
    };
  }, [id, toast]);

  if (loading) {
    return <div className="min-h-screen bg-white dark:bg-gray-900 p-6 text-center text-slate-500">Loading preview...</div>;
  }

  if (!assessment) {
    return <div className="min-h-screen bg-white dark:bg-gray-900 p-6 text-center text-slate-500">Assessment not found.</div>;
  }

  const section = assessment.sections?.[activeSection];
  const question = section?.questions?.[activeQuestion];
  const previewTimer = formatTime((assessment.duration || 0) * 60 * 1000);
  const previewSummary = (() => {
    const sections = assessment.sections || [];
    const counts = { mcq: 0, coding: 0, short: 0, one_line: 0, total: 0 };
    let totalMarks = 0;
    sections.forEach((sec) => {
      const sectionType = sec?.type;
      (sec.questions || []).forEach((q) => {
        const type = q?.type || sectionType;
        if (type && counts[type] !== undefined) counts[type] += 1;
        counts.total += 1;
        const points = Number(q?.points ?? sec?.marksPerQuestion ?? 1) || 1;
        totalMarks += points;
      });
    });
    return { ...counts, totalMarks, sections: sections.length };
  })();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-gray-700">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Preview Mode (Admin Only)</div>
          <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{assessment.title || 'Assessment Preview'}</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-gray-800 dark:text-gray-200">
            <Clock className="h-4 w-4" />
            {previewTimer}
          </div>
          <button
            type="button"
            onClick={() => navigate(`/admin/assessment/${assessment._id}/edit`)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Exit Preview
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-6 py-6">
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total Sections</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.sections}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total Questions</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.total}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">MCQ</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.mcq}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Coding</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.coding}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Short</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.short}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">One Line</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.one_line}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-900 sm:col-span-2 lg:col-span-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total Marks</div>
            <div className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{previewSummary.totalMarks}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[260px_minmax(0,1fr)_220px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Sections</h3>
            <div className="mt-3 space-y-2">
              {assessment.sections?.map((sec, idx) => (
                <button
                  key={`${sec.sectionName}-${idx}`}
                  onClick={() => { setActiveSection(idx); setActiveQuestion(0); }}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                    idx === activeSection ? 'bg-sky-100 text-sky-700' : 'bg-slate-50 text-slate-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {sec.sectionName || `Section ${idx + 1}`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            {question ? (
              <div>
                <div className="text-xs text-slate-500">Section {activeSection + 1} - Question {activeQuestion + 1}</div>
                <div className="mt-2 text-lg font-semibold text-slate-800 dark:text-white">
                  {question.questionText || question.problemDataSnapshot?.title || question.coding?.problemData?.title || question.coding?.title || 'Question'}
                </div>

                {section.type === 'mcq' && (
                  <div className="mt-4 space-y-2">
                    {question.options?.map((opt, idx) => (
                      <div key={`opt-${idx}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        {opt || `Option ${idx + 1}`}
                      </div>
                    ))}
                  </div>
                )}

                {(section.type === 'short' || section.type === 'one_line') && (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-400 dark:border-gray-600">
                    Student response field (preview)
                  </div>
                )}

                {section.type === 'coding' && (
                  <div className="mt-4 space-y-3">
                    {(() => {
                      const codingData = question.problemDataSnapshot || question.problemData || question.coding?.problemData || question.coding || {};
                      return (
                        <>
                          {(codingData.description || codingData.statement) && (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                              <div className="text-xs font-semibold text-slate-500 mb-1">Problem Statement</div>
                              <RichTextPreview content={codingData.description || codingData.statement} />
                            </div>
                          )}
                          {(codingData.constraints || codingData.inputFormat || codingData.outputFormat) && (
                            <div className="grid gap-3 md:grid-cols-2 text-xs text-slate-600 dark:text-gray-300">
                              {codingData.constraints && (
                                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                                  <div className="font-semibold text-slate-500 mb-1">Constraints</div>
                                  <div>{codingData.constraints}</div>
                                </div>
                              )}
                              {codingData.inputFormat && (
                                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                                  <div className="font-semibold text-slate-500 mb-1">Input Format</div>
                                  <div>{codingData.inputFormat}</div>
                                </div>
                              )}
                              {codingData.outputFormat && (
                                <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                                  <div className="font-semibold text-slate-500 mb-1">Output Format</div>
                                  <div>{codingData.outputFormat}</div>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                            Code editor area (preview only)
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-sm text-slate-500 dark:text-gray-300">No questions found.</div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Question Palette</h3>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {section?.questions?.map((_, qIdx) => (
                <button
                  key={`q-${qIdx}`}
                  onClick={() => setActiveQuestion(qIdx)}
                  className={`rounded-md py-1 text-xs ${
                    qIdx === activeQuestion ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-600 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {qIdx + 1}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
