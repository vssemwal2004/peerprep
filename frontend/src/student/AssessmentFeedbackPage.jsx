import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  MessageSquareText,
  Send,
  Star,
} from 'lucide-react';
import { api } from '../utils/api';

const formatDateTime = (value) => {
  if (!value) return 'Date not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date not available' : date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

function RatingOption({ value, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-label={`Rate ${value} out of 5`}
      aria-pressed={selected}
      className={`group flex flex-1 flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition-all sm:px-4 sm:py-4 ${selected ? 'border-amber-400 bg-amber-50 text-amber-700 shadow-sm shadow-amber-900/10 dark:border-amber-500 dark:bg-amber-900/20 dark:text-amber-300' : 'border-slate-200 bg-white text-slate-400 hover:border-amber-300 hover:bg-amber-50/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500 dark:hover:border-amber-700 dark:hover:bg-amber-900/10'}`}
    >
      <Star className={`h-6 w-6 transition-transform group-hover:scale-110 sm:h-7 sm:w-7 ${selected ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-gray-600'}`} />
      <span className="text-xs font-bold">{value}</span>
    </button>
  );
}

function FeedbackError({ message, onBack }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f8fbff_0%,#eef4ff_100%)] px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5 dark:border-rose-900/50 dark:bg-gray-900">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300"><AlertCircle className="h-7 w-7" /></div>
        <h1 className="mt-5 text-xl font-bold text-slate-950 dark:text-white">Feedback is not available</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-gray-300">{message}</p>
        <button type="button" onClick={onBack} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500"><ArrowLeft className="h-4 w-4" /> Back to assessments</button>
      </div>
    </div>
  );
}

export default function AssessmentFeedbackPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [rating, setRating] = useState(0);
  const [comments, setComments] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await api.getStudentAssessmentFeedback(id);
        if (!mounted) return;
        setData(response);
        if (response.feedback) {
          setRating(response.feedback.rating || 0);
          setComments(response.feedback.comments || '');
          setSuccess(true);
        }
      } catch (requestError) {
        if (mounted) setError(requestError.message || 'Unable to load the feedback form.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!rating || submitting || success) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await api.submitStudentAssessmentFeedback(id, { rating, comments });
      setData((current) => ({ ...current, feedback: response.feedback }));
      setSuccess(true);
    } catch (requestError) {
      if (requestError?.response?.status === 409) setSuccess(true);
      setError(requestError.message || 'Unable to submit your feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-gray-950"><Loader2 className="h-8 w-8 animate-spin text-sky-600" /></div>;
  }
  if (error && !data) return <FeedbackError message={error} onBack={() => navigate('/student/assessments')} />;
  if (!data) return <FeedbackError message="No assessment feedback data was returned." onBack={() => navigate('/student/assessments')} />;

  const assessment = data.assessment || {};
  const submission = data.submission || {};

  return (
    <div className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.14),_transparent_35%),linear-gradient(135deg,#f8fbff_0%,#eef4ff_55%,#f8fafc_100%)] px-4 py-8 dark:bg-gray-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-3xl items-center justify-center">
        <main className="w-full overflow-hidden rounded-[32px] border border-white/80 bg-white/95 shadow-[0_30px_100px_-45px_rgba(15,23,42,0.38)] backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
          <div className="bg-[linear-gradient(135deg,#075985_0%,#0ea5e9_55%,#38bdf8_100%)] px-6 py-7 text-white sm:px-10 sm:py-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-50"><ClipboardCheck className="h-3.5 w-3.5" /> Assessment complete</div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Share your experience</h1>
                <p className="mt-2 max-w-xl text-sm leading-6 text-sky-50/90">Your feedback helps us improve the assessment experience for every student.</p>
              </div>
              <MessageSquareText className="hidden h-10 w-10 text-white/60 sm:block" />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-sky-50/90">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4" /> {assessment.title}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Submitted {formatDateTime(submission.submittedAt)}</span>
            </div>
          </div>

          <div className="p-6 sm:p-10">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-800/70"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Assessment</p><p className="mt-1 line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">{assessment.title || 'Assessment'}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-800/70"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Submitted on</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{formatDateTime(submission.submittedAt)}</p></div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-gray-800 dark:bg-gray-800/70"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-gray-500">Score</p><p className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{submission.score == null ? 'Processing' : `${submission.score}/${submission.maxMarks ?? '—'}`}</p></div>
            </div>

            {success ? (
              <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-900/50 dark:bg-emerald-900/15">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"><CheckCircle2 className="h-6 w-6" /></div>
                <h2 className="mt-4 text-lg font-bold text-emerald-900 dark:text-emerald-200">Feedback submitted</h2>
                <p className="mt-2 text-sm leading-6 text-emerald-800/80 dark:text-emerald-200/80">Thank you for helping us make the platform better.</p>
                <button type="button" onClick={() => navigate('/student/assessments')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-700"><ArrowLeft className="h-4 w-4" /> Return to assessments</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-8">
                <div>
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950 dark:text-white">How was your assessment experience?</h2>
                      <p className="mt-1 text-sm text-slate-500 dark:text-gray-400">Please select one rating to continue.</p>
                    </div>
                    <span className="text-xs font-semibold text-rose-500">Required</span>
                  </div>
                  <div className="mt-4 flex gap-2 sm:gap-3">
                    {[1, 2, 3, 4, 5].map((value) => <RatingOption key={value} value={value} selected={rating === value} onSelect={setRating} />)}
                  </div>
                  <div className="mt-2 flex justify-between px-2 text-[10px] font-semibold text-slate-400 dark:text-gray-500"><span>Needs improvement</span><span>Excellent</span></div>
                </div>

                <label className="mt-8 block">
                  <span className="flex items-center justify-between text-sm font-bold text-slate-900 dark:text-white"><span>Additional comments</span><span className="text-xs font-medium text-slate-400">Optional</span></span>
                  <textarea value={comments} onChange={(event) => setComments(event.target.value)} maxLength={2000} rows={5} placeholder="Tell us what worked well or what we can improve..." className="mt-2 w-full resize-y rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-sky-600 dark:focus:bg-gray-900 dark:focus:ring-sky-900/40" />
                  <span className="mt-1 block text-right text-[11px] text-slate-400">{comments.length}/2000</span>
                </label>

                {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}

                <button type="submit" disabled={!rating || submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-sky-900/15 transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none dark:bg-sky-600 dark:hover:bg-sky-500 dark:disabled:bg-gray-700">
                  {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</> : <><Send className="h-4 w-4" /> Submit feedback</>}
                </button>
                <p className="mt-3 text-center text-xs text-slate-400 dark:text-gray-500">Your response is linked to this assessment and can only be submitted once.</p>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
