import { useEffect, useState } from 'react';
import { ArrowLeft, Download, FileText, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import ResumePreview from '../features/resume/ResumePreview';
import { filenameForResume, hasResumeContent, normalizeClientResume } from '../features/resume/resumeUtils';
import { api } from '../utils/api';

export default function StudentResumeView() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const rolePrefix = window.location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [resume, setResume] = useState(null);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    let mounted = true;
    api.getStudentResume(studentId).then((result) => {
      if (!mounted) return;
      setStudent(result.student || null);
      setResume(result.resume ? normalizeClientResume(result.resume) : null);
    }).catch((loadError) => mounted && setError(loadError.message || 'Could not load this student resume.')).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [studentId]);

  const handleDownload = async () => {
    if (!resume || downloading) return;
    setDownloading(true);
    try {
      const [{ pdf }, { default: ResumePdfDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../features/resume/ResumePdf'),
      ]);
      const blob = await pdf(<ResumePdfDocument resume={resume} />).toBlob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filenameForResume(resume);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (downloadError) { setError(downloadError.message || 'Could not generate the PDF.'); }
    finally { setDownloading(false); }
  };

  if (loading) return <div className="min-h-screen bg-slate-50 pt-20 dark:bg-slate-950"><div className="mx-auto h-[720px] max-w-6xl animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-900" /></div>;
  return (
    <div className="min-h-screen bg-slate-50 pt-16 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => navigate(`${rolePrefix}/students/${studentId}`)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"><ArrowLeft className="h-4 w-4" />Back to profile</button>
          <div className="flex min-w-0 flex-1 items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-600 text-white"><FileText className="h-5 w-5" /></div><div><h1 className="text-lg font-black text-slate-950 dark:text-white">{student?.name || 'Student'} — Resume</h1><p className="text-xs text-slate-500">Read-only institutional view · Professional A4</p></div></div>
          {resume ? <button type="button" onClick={handleDownload} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-50">{downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</button> : null}
        </div>
        {error ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</div> : null}
        {!resume || !hasResumeContent(resume) ? (
          <div className="flex min-h-[560px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900"><div className="max-w-md"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800"><FileText className="h-8 w-8" /></div><h2 className="mt-5 text-lg font-black text-slate-900 dark:text-white">Resume not created</h2><p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">This student has not created a resume in PeerPrep yet. The resume will become available here after the student saves it.</p></div></div>
        ) : (
          <div className="mx-auto max-w-5xl"><ResumePreview resume={resume} page={page} onPageChange={setPage} /></div>
        )}
      </div>
    </div>
  );
}
