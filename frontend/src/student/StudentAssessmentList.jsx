import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../utils/api';
import { ClipboardList, Clock, Calendar, ArrowRight } from 'lucide-react';

const statusStyles = {
  'Not Started': 'bg-slate-100 text-slate-600 border-slate-200',
  Available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Completed: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Violation: 'bg-rose-100 text-rose-700 border-rose-200',
};

export default function StudentAssessmentList() {
  const navigate = useNavigate();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startModal, setStartModal] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.listStudentAssessments();
        setAssessments(data.assessments || []);
      } catch (err) {
        setError(err.message || 'Failed to load assessments');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 pt-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto px-4 py-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center">
            <ClipboardList className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">My Assessments</h1>
            <p className="text-sm text-slate-600 dark:text-gray-300">Check your assigned assessments and attempt within the allowed window.</p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-500 dark:text-gray-300">Loading assessments...</div>
        ) : error ? (
          <div className="p-6 text-red-600 text-sm">{error}</div>
        ) : assessments.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-gray-400">No assessments assigned yet.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assessments.map((assessment) => (
              <div key={assessment._id} className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-white">{assessment.title}</h2>
                    <p className="text-xs text-slate-500 dark:text-gray-300">{assessment.description || 'No description'}</p>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusStyles[assessment.status] || statusStyles['Not Started']}`}>
                    {assessment.status}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-600 dark:text-gray-300">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Starts: {new Date(assessment.startTime).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5" />
                    Ends: {new Date(assessment.endTime).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5" />
                    Duration: {assessment.duration} minutes
                  </div>
                </div>

                <div className="mt-4">
                  {(() => {
                    const isLocked = assessment.status === 'Not Started' || (assessment.status === 'Completed' && !assessment.submittedAt);
                    const isView = assessment.status === 'Completed' && assessment.submittedAt;
                    const label = isView ? 'View Attempt' : 'Start Assessment';
                    return (
                      <button
                        onClick={() => {
                          if (isView) {
                            navigate(`/student/assessment/${assessment._id}`);
                          } else {
                            setStartModal(assessment);
                          }
                        }}
                        disabled={isLocked}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        {label}
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    );
                  })()}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {startModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-gray-700 dark:bg-gray-900">
            <div className="text-lg font-semibold text-slate-900 dark:text-white">Start Assessment</div>
            <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Review the details before launching the secure attempt window.</p>
            <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-gray-200">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Assessment Type</span>
                <span className="font-semibold uppercase">{startModal.assessmentType || 'mixed'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Total Questions</span>
                <span className="font-semibold">{startModal.totalQuestions || '-'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Total Marks</span>
                <span className="font-semibold">{startModal.totalMarks || '-'}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                <span>Duration</span>
                <span className="font-semibold">{startModal.duration} minutes</span>
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setStartModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  window.open(`/student/assessment/${startModal._id}?start=1`, '_blank', 'noopener,noreferrer');
                  setStartModal(null);
                }}
                className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500"
              >
                Confirm & Launch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


