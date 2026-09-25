
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '../utils/api';
import { useToast } from '../components/CustomToast';
import { useAuth } from '../context/AuthContext';
import { hasPermission } from './coordinatorPermissions';
import {
  ClipboardList, Filter, Plus, Search, Trash2, Eye, EyeOff,
  Pencil, Copy, X, MoreVertical, Lock, Unlock, Globe, ShieldOff,
  RotateCcw, CheckCircle2, AlertTriangle, FileCheck2, Mail, Send, Loader2,
  Users, UserMinus, UserPlus, ChevronLeft, ChevronRight, BarChart3,
} from 'lucide-react';
import AssessmentLifecycleSidebar from './assessment/components/AssessmentLifecycleSidebar';
import { deriveStudentFacets, filterStudentsLocally, mergeSemesterOptions } from '../utils/semesterOptions';

const statusStyles = {
  Draft: 'bg-slate-100 text-slate-600 border-slate-200',
  Upcoming: 'bg-amber-50 text-amber-700 border-amber-200',
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Completed: 'bg-slate-200 text-slate-700 border-slate-300',
  Archived: 'bg-violet-50 text-violet-700 border-violet-200',
};

const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : '-');
const formatShortDate = (value) => (
  value
    ? new Date(value).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    : '-'
);
const formatTime = (value) => (
  value
    ? new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'Not set'
);

const displayStatus = (status) => {
  if (status === 'Active') return 'Live';
  if (status === 'Upcoming') return 'Scheduled';
  return status || 'Draft';
};

const getStudentAddedBadgeClass = (createdAt) => {
  const createdTime = createdAt ? new Date(createdAt).getTime() : 0;
  if (!createdTime) return 'border-slate-200 bg-slate-50 text-slate-500';
  const ageDays = (Date.now() - createdTime) / (1000 * 60 * 60 * 24);
  if (ageDays <= 7) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (ageDays <= 30) return 'border-sky-200 bg-sky-50 text-sky-700';
  return 'border-slate-200 bg-slate-50 text-slate-500';
};

function ThreeDotsMenu({ assessment, onOpen, onPreview, onViewReport, onEdit, onDuplicate, onDelete, onToggleVisibility, onEditPassword, onSendInvitations, onEligibleStudents, onAddStudents, onResetSubmissions, onMarkComplete, onReleaseAnswers }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const [menuDirection, setMenuDirection] = useState('down');
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuWidth = 240;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(8, Math.min(rect.right - menuWidth, viewportWidth - menuWidth - 8));
      const measuredHeight = menuRef.current?.scrollHeight || 480;
      const availableViewportHeight = Math.max(180, viewportHeight - 16);
      const renderedHeight = Math.min(measuredHeight, availableViewportHeight);
      const shouldOpenUp = rect.bottom + measuredHeight + 8 > viewportHeight;
      const preferredTop = shouldOpenUp
        ? rect.top - renderedHeight - 8
        : rect.bottom + 8;
      const top = Math.max(8, Math.min(preferredTop, viewportHeight - renderedHeight - 8));
      setMenuDirection(shouldOpenUp ? 'up' : 'down');
      setMenuStyle({
        left,
        top,
        width: menuWidth,
        maxHeight: availableViewportHeight,
        transformOrigin: shouldOpenUp ? 'bottom right' : 'top right',
      });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const item = (icon, label, onClick, danger = false) => (
    <button
      type="button"
      onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); setOpen(false); }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-gray-700 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-gray-200'}`}
    >
      {icon}
      {label}
    </button>
  );

  const isVisible = assessment.isVisible !== false;
  const menu = (
    <AnimatePresence>
      {open && menuStyle && (
        <motion.div
          ref={menuRef}
          data-platform-action-menu
          data-dropdown-direction={menuDirection}
          role="menu"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          initial={{ opacity: 0, scale: 0.95, y: menuDirection === 'up' ? 4 : -4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.12 }}
          style={menuStyle}
          className="fixed z-[1000] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-slate-950/5 dark:border-gray-700 dark:bg-gray-900"
        >
          {item(<ClipboardList className="h-3.5 w-3.5" />, assessment.status === 'Completed' || assessment.manuallyCompletedAt ? 'View Report' : 'View Assessment', onOpen)}
          {item(<Eye className="h-3.5 w-3.5" />, 'Preview Assessment', onPreview)}
          {item(<BarChart3 className="h-3.5 w-3.5" />, 'View Report', onViewReport)}
          {item(<Copy className="h-3.5 w-3.5" />, 'Copy Assessment', onDuplicate)}
          <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
          {item(<Pencil className="h-3.5 w-3.5" />, 'Edit Assessment', onEdit)}
          {item(<Lock className="h-3.5 w-3.5" />, 'Edit Password', onEditPassword)}
          {assessment.lifecycleStatus !== 'draft' && item(<Users className="h-3.5 w-3.5" />, 'View Students & Sets', onEligibleStudents)}
          {assessment.lifecycleStatus !== 'draft' && item(<UserPlus className="h-3.5 w-3.5" />, 'Add Student', onAddStudents)}
          {assessment.lifecycleStatus !== 'draft' && item(<Mail className="h-3.5 w-3.5" />, 'Send Mail to Eligible Students', onSendInvitations)}
          {item(
            isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />,
            isVisible ? 'Archive Assessment' : 'Restore Assessment',
            onToggleVisibility,
          )}
          <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
          {item(<RotateCcw className="h-3.5 w-3.5" />, 'Reset Test Submissions', onResetSubmissions)}
          {item(<CheckCircle2 className="h-3.5 w-3.5" />, 'Mark as Complete', onMarkComplete)}
          {item(<FileCheck2 className="h-3.5 w-3.5" />, 'Generate Answers', onReleaseAnswers)}
          <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
          {item(<Trash2 className="h-3.5 w-3.5" />, 'Delete Assessment', onDelete, true)}
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-platform-menu-trigger
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open assessment actions"
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>
      {createPortal(menu, document.body)}
    </div>
  );
}

function InvitationModal({ assessment, onClose }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [editor, setEditor] = useState(null);
  const [subject, setSubject] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [sample, setSample] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const dirty = editor && (subject !== editor.subject || htmlContent !== editor.htmlContent);

  useEffect(() => {
    let active = true;
    api.getAssessmentInvitation(assessment._id).then((data) => {
      if (!active) return;
      setEditor(data);
      setSubject(data.subject);
      setHtmlContent(data.htmlContent);
      setSample(data.sample);
    }).catch((err) => { if (active) setError(err.message || 'Could not load the email template.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [assessment._id]);

  useEffect(() => {
    if (!editor || !dirty) return undefined;
    let active = true;
    const timeout = window.setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const data = await api.previewAssessmentInvitation(assessment._id, { subject, htmlContent });
        if (active) { setSample(data.sample); setPreviewError(''); }
      } catch (err) {
        if (active) setPreviewError(err.message || 'Preview could not be generated.');
      } finally {
        if (active) setPreviewLoading(false);
      }
    }, 650);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [assessment._id, editor, dirty, subject, htmlContent]);

  const run = async (action, task) => {
    setBusy(action);
    setError('');
    try { await task(); } catch (err) { setError(err.message || 'The email action failed.'); }
    finally { setBusy(''); }
  };

  const preview = () => run('preview', async () => {
    const data = await api.previewAssessmentInvitation(assessment._id, { subject, htmlContent });
    setSample(data.sample);
    setPreviewError('');
  });

  const save = () => run('save', async () => {
    await api.updateAssessmentInvitation(assessment._id, { subject, htmlContent });
    const data = await api.getAssessmentInvitation(assessment._id);
    setEditor(data);
    setSubject(data.subject);
    setHtmlContent(data.htmlContent);
    setSample(data.sample);
    setPreviewError('');
    toast.success('Email saved for this assessment.');
  });

  const reset = () => run('reset', async () => {
    await api.updateAssessmentInvitation(assessment._id, { useDefault: true });
    const data = await api.getAssessmentInvitation(assessment._id);
    setEditor(data);
    setSubject(data.subject);
    setHtmlContent(data.htmlContent);
    setSample(data.sample);
    setPreviewError('');
    toast.success('Global email template restored.');
  });

  const sendTest = () => run('test', async () => {
    if (!testEmail.trim()) throw new Error('Enter a test email address.');
    await api.sendAssessmentInvitationTest(assessment._id, { to: testEmail.trim(), subject, htmlContent });
    toast.success(`Test email sent to ${testEmail.trim()}.`);
  });

  const sendInvitations = async () => {
    if (dirty) { setError('Save your changes before queueing invitations.'); return; }
    setSending(true);
    setError('');
    setResult(null);
    try {
      const response = await api.sendAssessmentInvitations(assessment._id);
      setResult(response);
      toast.success(`${response.queued || 0} invitation${response.queued === 1 ? '' : 's'} queued. Delivery will continue in the background.`);
    } catch (error) {
      setError(error.message || 'Failed to send invitations.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/60 p-2 backdrop-blur-sm lg:p-5">
      <motion.div role="dialog" aria-modal="true" aria-label="Assessment invitation email" initial={{ opacity: 0, scale: 0.98, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="flex h-[96vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-slate-950/10 dark:bg-gray-900 lg:h-[92vh]">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 dark:border-gray-700 lg:px-6">
          <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white"><Mail className="h-[18px] w-[18px]" /></span><div className="min-w-0"><h3 className="truncate text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">Invitation email <span className="font-normal text-slate-400">/ {assessment.title}</span></h3><p className="truncate text-[11px] text-slate-500 dark:text-gray-400">{formatDateTime(assessment.startTime)} · {assessment.duration || '-'} min · {assessment.targetType === 'all' ? 'All eligible students' : `${assessment.assignedCount || 0} students`} · {assessment.passwordEnabled ? 'Password required' : 'No password'}</p></div></div>
          <button type="button" onClick={onClose} aria-label="Close email editor" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-gray-800"><X className="h-4 w-4" /></button>
        </header>

        {loading && <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading invitation…</div>}
        {editor && <main className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto bg-slate-200 dark:bg-gray-700 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:overflow-hidden">
          <section aria-labelledby="invitation-editor-heading" className="flex min-h-0 min-w-0 flex-col bg-white dark:bg-gray-900">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-gray-700 lg:px-5"><h4 id="invitation-editor-heading" className="text-[13px] font-semibold text-slate-800 dark:text-white">HTML editor</h4><span className="text-[11px] font-medium text-slate-500">{editor.isCustom ? 'Custom template' : 'Global default'}</span></div>
            <div className="flex min-h-0 flex-1 flex-col px-4 py-3 lg:px-5">
              <label htmlFor="assessment-invitation-subject" className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-gray-300">Email subject</label>
              <input id="assessment-invitation-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={250} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              <div className="mt-3 flex items-center justify-between"><label htmlFor="assessment-invitation-html" className="text-xs font-semibold text-slate-600 dark:text-gray-300">Message HTML</label><span className="text-[10px] text-slate-400">Changes preview automatically</span></div>
              <textarea id="assessment-invitation-html" value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} spellCheck={false} className="mt-1.5 h-64 w-full resize-none rounded-lg border border-slate-300 bg-[#f8fafc] p-3 font-mono text-[12px] leading-[1.5] text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 lg:min-h-0 lg:flex-1" />
              <p className="mt-2 truncate text-[11px] text-slate-500" title="Keep {{credentialsSection}} and {{passwordSection}} in the HTML so students receive their access details.">Required: <code>{'{{credentialsSection}}'}</code> and <code>{'{{passwordSection}}'}</code></p>
            </div>
          </section>

          <section aria-labelledby="invitation-preview-heading" className="flex min-h-0 min-w-0 flex-col border-t border-slate-200 bg-[#f8fafc] dark:border-gray-700 dark:bg-gray-950 lg:border-l lg:border-t-0">
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 dark:border-gray-700 dark:bg-gray-900 lg:px-5"><h4 id="invitation-preview-heading" className="text-[13px] font-semibold text-slate-800 dark:text-white">Email preview <span className="font-normal text-slate-400">· sample student</span></h4><button type="button" onClick={preview} disabled={Boolean(busy) || previewLoading} aria-label="Refresh preview" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-gray-800">{previewLoading || busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Refresh</button></div>
            <div className="flex min-h-0 flex-1 flex-col gap-2 p-3 lg:p-4">
              <div className="truncate rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200" title={sample?.subject || ''}><span className="font-semibold">Subject</span><span className="mx-2 text-slate-300">|</span>{sample?.subject || '—'}</div>
              {previewError && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-700">{previewError}</div>}
              <iframe title="Sample assessment invitation" sandbox="" srcDoc={sample?.html || ''} className="h-72 w-full rounded-lg border border-slate-200 bg-white shadow-sm lg:min-h-0 lg:flex-1" />
            </div>
          </section>
        </main>}

        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 lg:px-6">
          {(error || result) && <div role={error ? 'alert' : 'status'} className={`mb-2 rounded-md px-3 py-2 text-xs ${error ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || `${result.queued} queued · ${result.eligible} eligible · Batch ${result.batchId}`}</div>}
          <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
            <div className="flex w-full min-w-0 items-center gap-2 lg:w-auto lg:flex-1"><span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-gray-200">Test email</span><input id="assessment-test-email" aria-label="Test email address" type="email" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="h-9 min-w-0 max-w-xs flex-1 rounded-lg border border-slate-300 bg-white px-3 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white" /><button type="button" onClick={sendTest} disabled={loading || !editor || Boolean(busy) || previewLoading || Boolean(previewError)} className="h-9 shrink-0 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200">{busy === 'test' ? 'Sending…' : 'Send test'}</button></div>
            <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto"><button type="button" onClick={reset} disabled={!editor || Boolean(busy) || (!editor.isCustom && !dirty)} className="h-9 rounded-lg px-2 text-xs font-medium text-slate-500 hover:text-sky-700 disabled:opacity-40">Use default</button><button type="button" onClick={save} disabled={!editor || Boolean(busy) || !dirty} className="h-9 rounded-lg border border-sky-200 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-40 dark:border-sky-900 dark:text-sky-300">{busy === 'save' ? 'Saving…' : 'Save changes'}</button><span className="hidden h-6 w-px bg-slate-200 lg:block" /><button type="button" onClick={sendInvitations} disabled={loading || !editor || Boolean(busy) || previewLoading || Boolean(previewError) || sending || Boolean(result) || dirty} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Queueing…' : result ? 'Invitations queued' : 'Send to students'}</button></div>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">{dirty ? 'Save changes before sending to students.' : 'Test emails use sample credentials. Student emails use their own login details.'}</p>
        </div>
      </motion.div>
    </div>
  );
}

const submissionStatusStyles = {
  none: 'border-slate-200 bg-slate-50 text-slate-500',
  not_started: 'border-slate-200 bg-slate-50 text-slate-500',
  in_progress: 'border-sky-200 bg-sky-50 text-sky-700',
  submitted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  violation: 'border-rose-200 bg-rose-50 text-rose-700',
  expired: 'border-amber-200 bg-amber-50 text-amber-700',
  incomplete: 'border-amber-200 bg-amber-50 text-amber-700',
};

const submissionLabel = (status) => {
  if (!status) return 'Not started';
  return String(status).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
};

function StudentActionsMenu({ student, onViewProfile, onResetSubmission, onRemoveStudent }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const ref = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      if (ref.current?.contains(event.target) || menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }
    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 210;
      const height = menuRef.current?.getBoundingClientRect().height || 150;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));
      const top = rect.bottom + 8 + height > viewportHeight
        ? Math.max(8, rect.top - height - 8)
        : rect.bottom + 8;
      setMenuStyle({ left, top, width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const item = (icon, label, onClick, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(student); }}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs font-semibold transition-colors hover:bg-slate-50 dark:hover:bg-gray-800 ${danger ? 'text-rose-600 dark:text-rose-300' : 'text-slate-700 dark:text-gray-200'}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div ref={ref} className="inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && menuStyle && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, scale: 0.96, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -4 }}
              transition={{ duration: 0.12 }}
              style={menuStyle}
              className="fixed z-[95] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl ring-1 ring-slate-950/5 dark:border-gray-700 dark:bg-gray-900"
            >
              {item(<Eye className="h-3.5 w-3.5" />, 'View Profile', onViewProfile)}
              {item(<RotateCcw className="h-3.5 w-3.5" />, 'Reset Submission', onResetSubmission)}
              <div className="my-1 h-px bg-slate-100 dark:bg-gray-700" />
              {item(<UserMinus className="h-3.5 w-3.5" />, 'Remove from Assessment', onRemoveStudent, true)}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}

function EligibleStudentsModal({ assessment, rolePrefix, onClose, onChanged }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [assessmentDetails, setAssessmentDetails] = useState(null);
  const [search, setSearch] = useState('');
  const [setFilter, setSetFilter] = useState('all');
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [bulkRemoving, setBulkRemoving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [addMode, setAddMode] = useState(Boolean(assessment.startInAddMode));
  const [candidateSearch, setCandidateSearch] = useState('');
  const [debouncedCandidateSearch, setDebouncedCandidateSearch] = useState('');
  const [candidateSemester, setCandidateSemester] = useState('');
  const [managedSemesters, setManagedSemesters] = useState([]);
  const [candidateSemesterFacets, setCandidateSemesterFacets] = useState([]);
  const [candidatePagination, setCandidatePagination] = useState({ page: 1, pages: 1, total: 0 });
  const [allStudents, setAllStudents] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState([]);
  const [addingStudents, setAddingStudents] = useState(false);
  const candidateRequestRef = useRef(0);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listAssessmentEligibleStudents(assessment._id);
      setStudents(data.students || []);
      setSummary(data.summary || null);
      setAssessmentDetails(data.assessment || null);
      setSelectedStudentIds([]);
    } catch (error) {
      toast.error(error.message || 'Failed to load eligible students.');
    } finally {
      setLoading(false);
    }
  }, [assessment._id, toast]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCandidateSearch(candidateSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [candidateSearch]);

  useEffect(() => {
    if (!addMode || managedSemesters.length > 0) return undefined;
    let active = true;
    api.getAllSemestersForStudent()
      .then((data) => {
        if (active) setManagedSemesters(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setManagedSemesters([]);
      });
    return () => { active = false; };
  }, [addMode, managedSemesters.length]);

  useEffect(() => {
    if (!addMode) return undefined;
    const requestId = candidateRequestRef.current + 1;
    candidateRequestRef.current = requestId;
    setLoadingCandidates(true);
    api.listAllStudents({
      search: debouncedCandidateSearch,
      semester: candidateSemester,
      sortOrder: 'desc',
      page: candidatePagination.page,
      limit: 25,
    })
      .then((data) => {
        if (candidateRequestRef.current !== requestId) return;
        const responseStudents = Array.isArray(data.students) ? data.students : [];
        let nextStudents = responseStudents;
        let nextPagination = data.pagination;
        if (!nextPagination) {
          const locallyFiltered = filterStudentsLocally(responseStudents, {
            search: debouncedCandidateSearch,
            semester: candidateSemester,
          });
          const pages = Math.max(1, Math.ceil(locallyFiltered.length / 25));
          const page = Math.min(candidatePagination.page, pages);
          const offset = (page - 1) * 25;
          nextStudents = locallyFiltered.slice(offset, offset + 25);
          nextPagination = { page, pages, total: locallyFiltered.length };
        }
        setAllStudents(nextStudents);
        setCandidateSemesterFacets((current) => data.facets?.semesters || (current.length > 0 ? current : deriveStudentFacets(responseStudents).semesters));
        setCandidatePagination((current) => ({ ...current, ...nextPagination }));
      })
      .catch((error) => {
        if (candidateRequestRef.current !== requestId) return;
        setAllStudents([]);
        toast.error(error.message || 'Failed to load platform students.');
      })
      .finally(() => {
        if (candidateRequestRef.current === requestId) setLoadingCandidates(false);
      });
    return undefined;
  }, [addMode, candidatePagination.page, candidateSemester, debouncedCandidateSearch, toast]);

  const assignedIds = useMemo(() => new Set(students.map((student) => String(student._id))), [students]);
  const selectedCandidateIdSet = useMemo(() => new Set(selectedCandidateIds), [selectedCandidateIds]);
  const candidateStudents = useMemo(() => {
    return allStudents
      .filter((student) => !assignedIds.has(String(student._id)))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [allStudents, assignedIds]);
  const candidateSemesterOptions = useMemo(
    () => mergeSemesterOptions(
      managedSemesters,
      candidateSemesterFacets,
      allStudents.map((student) => student.semester),
    ),
    [managedSemesters, candidateSemesterFacets, allStudents],
  );

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return students;
    return students.filter((student) => [
      student.name,
      student.email,
      student.studentId,
      student.course,
      student.branch,
      student.college,
      student.group,
      student.assessmentSet,
      student.submission?.status,
    ].some((value) => String(value || '').toLowerCase().includes(query))
      && (setFilter === 'all' || String(student.assessmentSet || 'unassigned') === setFilter));
  }, [students, search, setFilter]);

  const selectedStudentIdSet = useMemo(() => new Set(selectedStudentIds), [selectedStudentIds]);
  const questionSetCount = Number(assessmentDetails?.questionSetCount || 1);
  const questionSetEnabled = Boolean(assessmentDetails?.questionSetEnabled);

  const openProfile = (student) => {
    onClose();
    navigate(`${rolePrefix}/students/${student._id}`);
  };

  const resetSubmission = async (student) => {
    if (!confirm(`Reset submission for ${student.name || student.email || 'this student'}?`)) return;
    setBusyId(student._id);
    try {
      const result = await api.resetAssessmentStudentSubmission(assessment._id, student._id);
      toast.success(result.deletedSubmissions ? 'Student submission reset.' : 'No submission existed for this student.');
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to reset student submission.');
    } finally {
      setBusyId('');
    }
  };

  const removeStudent = async (student) => {
    if (!confirm(`Remove ${student.name || student.email || 'this student'} from this assessment? Their existing submission will also be removed.`)) return;
    setBusyId(student._id);
    try {
      await api.removeAssessmentEligibleStudent(assessment._id, student._id);
      toast.success('Student removed from assessment.');
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to remove student from assessment.');
    } finally {
      setBusyId('');
    }
  };

  const updateStudentSet = async (student, setNumber) => {
    setBusyId(student._id);
    try {
      await api.updateAssessmentStudentSet(assessment._id, student._id, Number(setNumber));
      setStudents((current) => current.map((entry) => String(entry._id) === String(student._id)
        ? { ...entry, assessmentSet: Number(setNumber), assessmentSetSource: 'manual' }
        : entry));
      toast.success(`${student.name || student.studentId || 'Student'} assigned to Set ${setNumber}.`);
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to update set allocation.');
    } finally {
      setBusyId('');
    }
  };

  const removeSelectedStudents = async () => {
    if (!selectedStudentIds.length) return;
    if (!confirm(`Remove ${selectedStudentIds.length} selected student${selectedStudentIds.length === 1 ? '' : 's'} from this assessment? Their existing submissions will also be removed.`)) return;
    setBulkRemoving(true);
    try {
      await api.removeAssessmentEligibleStudents(assessment._id, selectedStudentIds);
      toast.success(`${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? '' : 's'} removed.`);
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Some students could not be removed. Refreshing the list.');
      await loadStudents();
    } finally {
      setBulkRemoving(false);
    }
  };

  const assignSelectedStudentsToSet = async (setNumber) => {
    if (!selectedStudentIds.length || !setNumber) return;
    setBulkRemoving(true);
    try {
      await api.updateAssessmentStudentSets(assessment._id, selectedStudentIds, Number(setNumber));
      const selected = new Set(selectedStudentIds);
      setStudents((current) => current.map((student) => selected.has(String(student._id))
        ? { ...student, assessmentSet: Number(setNumber), assessmentSetSource: 'manual' }
        : student));
      toast.success(`${selectedStudentIds.length} student${selectedStudentIds.length === 1 ? '' : 's'} assigned to Set ${setNumber}.`);
      setSelectedStudentIds([]);
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to update selected students.');
    } finally {
      setBulkRemoving(false);
    }
  };

  const toggleCandidate = (studentId) => {
    setSelectedCandidateIds((previous) => (
      previous.includes(studentId)
        ? previous.filter((id) => id !== studentId)
        : [...previous, studentId]
    ));
  };

  const addSelectedStudents = async () => {
    if (!selectedCandidateIds.length) {
      toast.error('Select at least one student to add.');
      return;
    }
    setAddingStudents(true);
    try {
      const result = await api.addAssessmentEligibleStudents(assessment._id, selectedCandidateIds);
      toast.success(`Added ${result.addedCount || selectedCandidateIds.length} student${(result.addedCount || selectedCandidateIds.length) === 1 ? '' : 's'} to assessment.`);
      setSelectedCandidateIds([]);
      setAddMode(false);
      await loadStudents();
      onChanged?.();
    } catch (error) {
      toast.error(error.message || 'Failed to add students to assessment.');
    } finally {
      setAddingStudents(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 px-4 py-5 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 dark:border-gray-700 dark:bg-gray-900 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-700 dark:border-sky-400/20 dark:bg-sky-900/20 dark:text-sky-200">
              <Users className="h-3.5 w-3.5" />
              Students & Set Allocation
            </div>
            <h3 className="mt-2 text-xl font-bold text-slate-950 dark:text-white">{assessment.title || 'Assessment'}</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500 dark:text-gray-400">
              View every assigned student, verify their paper set, update allocation before they start, and manage access or submissions.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <button
              type="button"
              onClick={() => setAddMode((value) => !value)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${addMode ? 'bg-slate-100 text-slate-700 dark:bg-gray-800 dark:text-gray-200' : 'bg-sky-600 text-white hover:bg-sky-500'}`}
            >
              <UserPlus className="h-4 w-4" />
              {addMode ? 'Hide Add' : 'Add Student'}
            </button>
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50/40 px-6 py-4 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ['Total', summary?.total ?? students.length],
              ['Not Started', summary?.notStarted ?? 0],
              ['In Progress', summary?.inProgress ?? 0],
              ['Submitted', summary?.submitted ?? 0],
              ['Other', summary?.other ?? 0],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">{label}</div>
                <div className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">{value}</div>
              </div>
            ))}
          </div>
          {questionSetEnabled && <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: questionSetCount }, (_, index) => { const count = students.filter((student) => Number(student.assessmentSet) === index + 1).length; return <button key={index + 1} type="button" onClick={() => setSetFilter(String(index + 1))} className={`rounded-lg border px-3 py-2 text-left ${setFilter === String(index + 1) ? 'border-sky-400 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/30' : 'border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-800'}`}><span className="text-[10px] font-bold uppercase text-slate-400">Set {index + 1}</span><span className="ml-2 text-sm font-bold text-slate-900 dark:text-white">{count}</span></button>; })}</div>}
          <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full max-w-lg">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search students, email, ID, course..." className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-sky-500/10" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {questionSetEnabled && <select aria-label="Filter students by assigned set" value={setFilter} onChange={(event) => setSetFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200"><option value="all">All sets</option>{Array.from({ length: questionSetCount }, (_, index) => <option key={index + 1} value={index + 1}>Set {index + 1}</option>)}<option value="unassigned">Unassigned</option></select>}
              {selectedStudentIds.length > 0 && <>{questionSetEnabled && <select defaultValue="" disabled={bulkRemoving} onChange={(event) => { if (event.target.value) assignSelectedStudentsToSet(event.target.value); event.target.value = ''; }} className="h-10 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-bold text-sky-700 disabled:opacity-50 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-300"><option value="" disabled>Assign {selectedStudentIds.length} selected…</option>{Array.from({ length: questionSetCount }, (_, index) => <option key={index + 1} value={index + 1}>Set {index + 1}</option>)}</select>}<button type="button" onClick={removeSelectedStudents} disabled={bulkRemoving} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:bg-gray-950 dark:text-rose-300"><UserMinus className="h-4 w-4" />{bulkRemoving ? 'Working…' : `Remove ${selectedStudentIds.length} selected`}</button></>}
            </div>
          </div>
        </div>

        {addMode && (
          <div className="border-b border-slate-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-base font-bold text-slate-950 dark:text-white">Add Platform Students</div>
                <div className="mt-1 text-sm text-slate-500 dark:text-gray-400">Recent students who are already eligible are hidden from this list.</div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-2xl">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={candidateSearch}
                    onChange={(event) => {
                      setCandidateSearch(event.target.value);
                      setCandidatePagination((current) => ({ ...current, page: 1 }));
                    }}
                    placeholder="Search students to add..."
                    className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition-colors placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-white dark:focus:ring-sky-500/10"
                  />
                </div>
                <div className="relative min-w-[170px]">
                  <Filter className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <select
                    value={candidateSemester}
                    onChange={(event) => {
                      setCandidateSemester(event.target.value);
                      setCandidatePagination((current) => ({ ...current, page: 1 }));
                    }}
                    aria-label="Filter candidates by semester"
                    className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-white pl-9 pr-7 text-xs font-semibold text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-200 dark:focus:ring-sky-500/10"
                  >
                    <option value="">All semesters</option>
                    {candidateSemesterOptions.map((semester) => (
                      <option key={semester.value} value={semester.value}>
                        {semester.label}{Number.isFinite(semester.count) ? ` (${semester.count})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-900">
              {loadingCandidates ? (
                <div className="flex items-center justify-center p-6 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin text-sky-600" />
                  Loading recent students...
                </div>
              ) : candidateStudents.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-500">No recently added students are available to add.</div>
              ) : (
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-[36px_1.4fr_1fr_1fr_90px_120px] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                    <div />
                    <div>Student</div>
                    <div>Student ID</div>
                    <div>Course / Branch</div>
                    <div>Semester</div>
                    <div>Added On</div>
                  </div>
                  {candidateStudents.map((student) => {
                    const studentId = String(student._id || student.id || student.studentId || student.email || '');
                    const selected = selectedCandidateIdSet.has(studentId);
                    return (
                      <button
                        key={student._id}
                        type="button"
                        onClick={() => toggleCandidate(studentId)}
                        className={`grid w-full grid-cols-[36px_1.4fr_1fr_1fr_90px_120px] items-center px-3 py-2 text-left transition-colors ${selected ? 'bg-sky-50 text-sky-950 dark:bg-sky-900/20 dark:text-sky-100' : 'bg-white text-slate-700 hover:bg-slate-50 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800'}`}
                      >
                        <div>
                          <span className={`flex h-5 w-5 items-center justify-center rounded border ${selected ? 'border-sky-600 bg-sky-600 text-white' : 'border-slate-300 bg-white dark:border-gray-600 dark:bg-gray-950'}`}>
                            {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold">{student.name || 'Unnamed Student'}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{student.email || '-'}</div>
                        </div>
                        <div className="font-mono text-xs text-slate-600 dark:text-slate-300">{student.studentId || '-'}</div>
                        <div className="min-w-0 text-sm text-slate-600 dark:text-slate-300">
                          <div className="truncate">{student.course || '-'}</div>
                          <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-gray-400">{student.branch || '-'}</div>
                        </div>
                        <div className="text-xs font-semibold text-slate-600 dark:text-gray-300">
                          {student.semester ? `Sem ${student.semester}` : '-'}
                        </div>
                        <div>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${getStudentAddedBadgeClass(student.createdAt)}`}>
                            {formatShortDate(student.createdAt)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="text-xs font-semibold text-slate-600 dark:text-gray-300">{selectedCandidateIds.length} selected</div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    title="Previous candidate page"
                    aria-label="Previous candidate page"
                    disabled={loadingCandidates || candidatePagination.page <= 1}
                    onClick={() => setCandidatePagination((current) => ({ ...current, page: current.page - 1 }))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[72px] text-center text-[10px] text-slate-500 dark:text-gray-400">
                    Page {candidatePagination.page} of {candidatePagination.pages || 1}
                  </span>
                  <button
                    type="button"
                    title="Next candidate page"
                    aria-label="Next candidate page"
                    disabled={loadingCandidates || candidatePagination.page >= (candidatePagination.pages || 1)}
                    onClick={() => setCandidatePagination((current) => ({ ...current, page: current.page + 1 }))}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-gray-700 dark:hover:bg-gray-800"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={addSelectedStudents}
                disabled={addingStudents || selectedCandidateIds.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addingStudents ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                {addingStudents ? 'Adding...' : 'Add Selected'}
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-sky-600" />
              Loading eligible students...
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">No eligible students found.</div>
          ) : (
            <table className="min-w-[1240px] w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="w-12 px-4 py-3"><input type="checkbox" aria-label="Select all visible students" checked={filteredStudents.length > 0 && filteredStudents.every((student) => selectedStudentIdSet.has(String(student._id)))} onChange={(event) => { const visibleIds = filteredStudents.map((student) => String(student._id)); setSelectedStudentIds((current) => event.target.checked ? Array.from(new Set([...current, ...visibleIds])) : current.filter((id) => !visibleIds.includes(id))); }} /></th>
                  <th className="px-6 py-3">Student</th>
                  <th className="px-4 py-3">Student ID</th>
                  {questionSetEnabled && <th className="px-4 py-3">Assigned Set</th>}
                  <th className="px-4 py-3">Course</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Semester</th>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Submission</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Violations</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-gray-800">
                {filteredStudents.map((student) => {
                  const status = student.submission?.status || 'none';
                  const score = Number(student.submission?.score);
                  const maxMarks = Number(student.submission?.maxMarks);
                  const violations = Number(student.submission?.tabSwitches || 0)
                    + Number(student.submission?.fullscreenExits || 0)
                    + Number(student.submission?.cameraFlags || 0)
                    + Number(student.submission?.copyPasteCount || 0);
                  return (
                    <tr key={student._id} className={busyId === student._id ? 'opacity-60' : 'hover:bg-slate-50 dark:hover:bg-sky-400/5'}>
                      <td className="px-4 py-4"><input type="checkbox" aria-label={`Select ${student.name || student.email || student.studentId}`} checked={selectedStudentIdSet.has(String(student._id))} onChange={() => setSelectedStudentIds((current) => current.includes(String(student._id)) ? current.filter((id) => id !== String(student._id)) : [...current, String(student._id)])} /></td>
                      <td className="px-6 py-4">
                        <button type="button" onClick={() => openProfile(student)} className="text-left font-bold text-slate-950 hover:text-sky-700 hover:underline dark:text-white dark:hover:text-sky-300">
                          {student.name || 'Unnamed Student'}
                        </button>
                        <div className="mt-0.5 text-xs text-slate-500">{student.email || '-'}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-slate-600 dark:text-slate-300">{student.studentId || '-'}</td>
                      {questionSetEnabled && <td className="px-4 py-4"><select aria-label={`Assigned set for ${student.name || student.studentId}`} value={student.assessmentSet || ''} disabled={busyId === student._id || ['in_progress', 'submitted'].includes(student.submission?.status)} onChange={(event) => updateStudentSet(student, event.target.value)} title={['in_progress', 'submitted'].includes(student.submission?.status) ? 'Set is locked after the student starts' : 'Change assigned question set'} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-sky-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-gray-950 dark:text-sky-300"><option value="" disabled>Unassigned</option>{Array.from({ length: questionSetCount }, (_, index) => <option key={index + 1} value={index + 1}>Set {index + 1}</option>)}</select><div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{student.assessmentSetSource || 'not assigned'}</div></td>}
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.course || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.branch || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.semester || '-'}</td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">{student.group || '-'}</td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${submissionStatusStyles[status] || submissionStatusStyles.none}`}>
                          {submissionLabel(status)}
                        </span>
                        {student.submission?.updatedAt && <div className="mt-1 text-[11px] text-slate-400">{formatDateTime(student.submission.updatedAt)}</div>}
                      </td>
                      <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                        {Number.isFinite(score) ? `${score}${Number.isFinite(maxMarks) ? ` / ${maxMarks}` : ''}` : '-'}
                      </td>
                      <td className="px-4 py-4 font-semibold text-slate-600 dark:text-slate-300">{violations}</td>
                      <td className="px-6 py-4 text-right">
                        <StudentActionsMenu
                          student={student}
                          onViewProfile={openProfile}
                          onResetSubmission={resetSubmission}
                          onRemoveStudent={removeStudent}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function ConfirmActionModal({ action, onClose, onConfirm }) {
  const [saving, setSaving] = useState(false);
  if (!action) return null;

  const isDanger = action.tone === 'danger';
  const isInfo = action.tone === 'info';
  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(action);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            isDanger ? 'bg-rose-50 text-rose-600' : isInfo ? 'bg-sky-50 text-sky-600' : 'bg-amber-50 text-amber-600'
          }`}>
            {isDanger ? <RotateCcw className="h-5 w-5" /> : isInfo ? <FileCheck2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{action.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-gray-300">{action.message}</p>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {action.assessment?.title || 'Untitled assessment'}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className={`rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
              isDanger ? 'bg-rose-600 hover:bg-rose-500' : isInfo ? 'bg-sky-600 hover:bg-sky-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
          >
            {saving ? 'Working...' : action.confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function PasswordModal({ assessment, onClose, onSave }) {
  const [enabled, setEnabled] = useState(Boolean(assessment.passwordEnabled));
  const [value, setValue] = useState(assessment.password || '');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateAssessment(assessment._id, {
        ...assessment,
        passwordEnabled: enabled,
        password: enabled ? value : '',
      });
      toast.success('Password settings updated');
      onSave();
      onClose();
    } catch (e) {
      toast.error(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Password Protection</h3>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">Control access to <span className="font-medium">{assessment.title}</span></p>

        <div className="mt-5 space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
            <div>
              <p className="text-sm font-medium text-slate-800 dark:text-white">Enable Password</p>
              <p className="text-xs text-slate-500 dark:text-gray-400">Candidates must enter password to start</p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-gray-600'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {enabled && (
            <div>
              <label className="text-xs font-medium text-slate-500 dark:text-gray-400">Password</label>
              <div className="relative mt-1">
                <input
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={assessment.passwordEnabled ? 'Leave blank to keep current password' : 'Enter assessment password…'}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-700 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-60">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function AssessmentDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const rolePrefix = location.pathname.startsWith('/coordinator') ? '/coordinator' : '/admin';
  const canCreateAssessments = hasPermission(user, 'coordinator.assessment.create');
  const toast = useToast();
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [invitationTarget, setInvitationTarget] = useState(null);
  const [eligibleTarget, setEligibleTarget] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [filters, setFilters] = useState({
    search: '',
    creationWindow: 'any',
    startDate: '',
    endDate: '',
    testType: 'all',
    sort: 'updated',
  });

  const loadAssessments = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.listAssessments();
      setAssessments(data.assessments || []);
    } catch (err) {
      setError(err.message || 'Failed to load assessments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAssessments(); }, []);

  const summary = useMemo(() => {
    const total = assessments.length;
    const drafts = assessments.filter((a) => a.lifecycleStatus === 'draft').length;
    const archived = assessments.filter((a) => a.lifecycleStatus !== 'draft' && (a.lifecycleStatus === 'archived' || a.isVisible === false)).length;
    const completed = assessments.filter((a) => a.lifecycleStatus !== 'draft' && a.lifecycleStatus !== 'archived' && a.isVisible !== false && a.status === 'Completed').length;
    const ongoing = Math.max(0, total - drafts - archived - completed);
    return { total, drafts, ongoing, completed, archived };
  }, [assessments]);

  const testTypes = useMemo(() => (
    [...new Set(assessments.map((assessment) => assessment.testType || assessment.assessmentType).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b))
  ), [assessments]);

  const filtered = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const searchTerm = filters.search.trim().toLowerCase();

    const results = assessments.filter((assessment) => {
      const rawBucket = String(assessment.lifecycleBucket || '').toLowerCase();
      const bucket = assessment.lifecycleStatus === 'draft'
        ? 'drafts'
        : assessment.lifecycleStatus === 'archived' || assessment.isVisible === false
          ? 'archived'
          : rawBucket === 'completed' || String(assessment.status || '').toLowerCase() === 'completed'
            ? 'completed'
            : 'ongoing';
      const matchesTab = activeTab === 'all' || bucket === activeTab;

      const searchable = [assessment.title, assessment.testType, assessment.assessmentType, assessment.assessmentId]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = !searchTerm || searchable.includes(searchTerm);
      const matchesType = filters.testType === 'all'
        || (assessment.testType || assessment.assessmentType) === filters.testType;

      const createdTime = new Date(assessment.createdAt || assessment.updatedAt || 0).getTime();
      let matchesCreationDate = true;
      if (filters.creationWindow === 'today') {
        matchesCreationDate = createdTime >= todayStart;
      } else if (filters.creationWindow === '7d') {
        matchesCreationDate = createdTime >= now.getTime() - (7 * 24 * 60 * 60 * 1000);
      } else if (filters.creationWindow === '30d') {
        matchesCreationDate = createdTime >= now.getTime() - (30 * 24 * 60 * 60 * 1000);
      } else if (filters.creationWindow === 'custom') {
        const from = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : null;
        const until = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() : null;
        matchesCreationDate = (!from || createdTime >= from) && (!until || createdTime <= until);
      }

      return matchesTab && matchesSearch && matchesType && matchesCreationDate;
    });

    return results.sort((left, right) => {
      if (filters.sort === 'oldest') {
        return new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
      }
      if (filters.sort === 'start') {
        return new Date(left.startTime || '9999-12-31').getTime() - new Date(right.startTime || '9999-12-31').getTime();
      }
      if (filters.sort === 'title') {
        return String(left.title || '').localeCompare(String(right.title || ''));
      }
      return new Date(right.updatedAt || right.createdAt || 0).getTime() - new Date(left.updatedAt || left.createdAt || 0).getTime();
    });
  }, [assessments, filters, activeTab]);

  const handleDelete = async (id) => {
    if (!confirm('Delete this assessment and all submissions?')) return;
    try {
      await api.deleteAssessment(id);
      toast.success('Assessment deleted');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to delete');
    }
  };

  const handleDuplicate = async (id) => {
    try {
      const data = await api.getAssessmentById(id);
      const a = data.assessment;
      await api.createAssessment({ ...a, title: `${a.title} (Copy)`, lifecycleStatus: 'draft' });
      toast.success('Duplicated as draft');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to duplicate');
    }
  };

  const handleToggleVisibility = async (assessment) => {
    try {
      const nextVisible = assessment.isVisible === false;
      await api.updateAssessment(assessment._id, { ...assessment, isVisible: nextVisible });
      toast.success(nextVisible ? 'Assessment restored' : 'Assessment archived');
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Failed to update visibility');
    }
  };

  const openResetSubmissions = (assessment) => {
    setConfirmAction({
      type: 'reset',
      tone: 'danger',
      assessment,
      title: 'Reset test submissions?',
      message: 'All student submissions, answers, scores, security logs, and progress for this test will be deleted. Students will see a fresh test and can start again while the schedule is open.',
      confirmLabel: 'Reset Test',
    });
  };

  const openMarkComplete = (assessment) => {
    setConfirmAction({
      type: 'complete',
      tone: 'warning',
      assessment,
      title: 'Mark assessment as complete?',
      message: 'Students will no longer be able to start or continue this assessment. On the student side, the assessment will appear as Completed.',
      confirmLabel: 'Mark Complete',
    });
  };

  const openReleaseAnswers = (assessment) => {
    setConfirmAction({
      type: 'releaseAnswers',
      tone: 'info',
      assessment,
      title: 'Generate answers for students?',
      message: 'This will release the student report for this assessment with score, question review, correct answers, section analytics, and rank wherever backend data is available. Students will see it dynamically on their report page after refresh.',
      confirmLabel: 'Generate Answers',
    });
  };

  const handleConfirmAction = async (action) => {
    try {
      if (action.type === 'reset') {
        const result = await api.resetAssessmentSubmissions(action.assessment._id);
        toast.success(`Test reset. ${result.deletedSubmissions || 0} submission${Number(result.deletedSubmissions || 0) === 1 ? '' : 's'} deleted.`);
      } else if (action.type === 'complete') {
        await api.markAssessmentComplete(action.assessment._id);
        toast.success('Assessment marked as complete');
      } else if (action.type === 'releaseAnswers') {
        await api.releaseAssessmentAnswers(action.assessment._id);
        toast.success('Answers and detailed reports released to students');
      }
      setConfirmAction(null);
      loadAssessments();
    } catch (err) {
      toast.error(err.message || 'Action failed');
    }
  };

  return (
    <div className="h-screen overflow-hidden bg-slate-50 dark:bg-gray-950">
      <motion.div className="flex h-full min-h-0 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        <header data-page-header className="shrink-0 border-b border-slate-200 bg-white dark:border-gray-800 dark:bg-gray-950">
          <div className="mx-auto flex min-h-16 max-w-[1600px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Assessments</p>
              <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-950 dark:text-white">All Assessments</h1>
            </div>
            {canCreateAssessments && <button type="button" onClick={() => navigate(`${rolePrefix}/assessment/create`)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-600 px-3.5 text-xs font-semibold text-white hover:bg-sky-500">
              <Plus className="h-4 w-4" /> Create Assessment
            </button>}
          </div>
        </header>

        <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 overflow-y-auto lg:grid-cols-[228px_minmax(0,1fr)] lg:overflow-hidden">
          <AssessmentLifecycleSidebar
            active={activeTab}
            counts={summary}
            onChange={setActiveTab}
            creationWindow={filters.creationWindow}
            onCreationWindowChange={(value) => setFilters((current) => ({ ...current, creationWindow: value }))}
            startDate={filters.startDate}
            endDate={filters.endDate}
            onStartDateChange={(value) => setFilters((current) => ({ ...current, startDate: value }))}
            onEndDateChange={(value) => setFilters((current) => ({ ...current, endDate: value }))}
            testType={filters.testType}
            testTypes={testTypes}
            onTestTypeChange={(value) => setFilters((current) => ({ ...current, testType: value }))}
          />
          <main className="min-w-0 px-4 py-4 sm:px-6 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
            <div className="shrink-0 flex flex-col gap-3 border-b border-slate-200 pb-3 dark:border-gray-800 xl:flex-row xl:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                  placeholder="Search by assessment name, ID or type"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:ring-sky-900/30"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-medium text-slate-600 dark:bg-gray-800 dark:text-gray-300">{filtered.length} assessment{filtered.length === 1 ? '' : 's'}</span>
                <select value={filters.sort} onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value }))} className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-600 outline-none focus:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
                  <option value="updated">Recently updated</option>
                  <option value="oldest">Oldest created</option>
                  <option value="start">Start time</option>
                  <option value="title">Name A-Z</option>
                </select>
                <button type="button" onClick={loadAssessments} disabled={loading} title="Refresh assessments" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800">
                  <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

          <section className="pt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pb-4" aria-label="Assessment list">
            {loading ? (
              <div className="flex min-h-56 items-center justify-center rounded-lg border border-slate-200 bg-white text-sm text-slate-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading assessments...</div>
            ) : error ? (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white px-6 py-10 text-center dark:border-gray-700 dark:bg-gray-900">
                <ClipboardList className="h-7 w-7 text-slate-300" />
                <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">No assessments found</h3>
                <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-gray-400">Try another status, date, type, or search term.</p>
                <button type="button" onClick={() => { setActiveTab('all'); setFilters({ search: '', creationWindow: 'any', startDate: '', endDate: '', testType: 'all', sort: 'updated' }); }} className="mt-4 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">Clear filters</button>
              </div>
            ) : (
              <div role="list" className="space-y-2.5">
                <div className="sticky top-0 z-20 -mx-1 isolate hidden grid-cols-[minmax(190px,1.5fr)_105px_95px_95px_minmax(120px,1fr)_95px_80px_28px] items-center gap-x-3 bg-slate-50 px-5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 shadow-[0_1px_0_0_rgb(226,232,240)] xl:grid dark:bg-gray-950 dark:text-gray-500 dark:shadow-[0_1px_0_0_rgb(31,41,55)]">
                  <span>Assessment</span>
                  <span>Date</span>
                  <span>Time</span>
                  <span>Content</span>
                  <span>Completion</span>
                  <span>Access</span>
                  <span>Status</span>
                  <span className="sr-only">Actions</span>
                </div>
                {filtered.map((assessment) => {
                  const completedCount = Number(assessment.completedCount || 0);
                  const assignedCount = Number(assessment.assignedCount || 0);
                  const completionPercent = assignedCount > 0
                    ? Math.min(100, Math.round((completedCount / assignedCount) * 100))
                    : 0;
                  const lifecycleStatus = assessment.lifecycleStatus === 'draft'
                    ? 'Draft'
                    : assessment.lifecycleStatus === 'archived' || assessment.isVisible === false
                      ? 'Archived'
                      : assessment.status;
                  const openPath = assessment.lifecycleStatus !== 'draft' && (assessment.status === 'Completed' || assessment.manuallyCompletedAt)
                    ? `${rolePrefix}/assessment/reports?assessmentId=${encodeURIComponent(assessment._id)}`
                    : `${rolePrefix}/assessment/${assessment._id}`;

                  return (
                    <article
                      key={assessment._id}
                      role="link"
                      tabIndex={0}
                      onClick={(event) => {
                        if (event.target.closest('button, a, input, select, textarea')) return;
                        navigate(openPath);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          navigate(openPath);
                        }
                      }}
                      className="group grid cursor-pointer grid-cols-1 items-center gap-x-3 gap-y-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all hover:-translate-y-px hover:border-sky-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-sky-200 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-sky-800 md:grid-cols-2 xl:grid-cols-[minmax(190px,1.5fr)_105px_95px_95px_minmax(120px,1fr)_95px_80px_28px]"
                    >
                      <div className="min-w-0 md:col-span-2 xl:col-span-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="truncate text-sm font-semibold text-slate-900 transition-colors group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-300">{assessment.title || 'Untitled assessment'}</div>
                          {assessment.passwordEnabled && (
                            <span
                              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-amber-600 dark:text-amber-400"
                              title="Password protected"
                              aria-label="Password protected"
                            >
                              <Lock className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-slate-400 dark:text-gray-500">
                          <span className="truncate">{assessment.testType || assessment.assessmentType || 'General'}</span>
                          <span className="h-1 w-1 shrink-0 rounded-full bg-slate-300" aria-hidden="true" />
                          <span className="shrink-0">ID {assessment.assessmentId || '—'}</span>
                        </div>
                      </div>

                      <div className="min-w-0 text-xs">
                        <div className="font-semibold text-slate-700 dark:text-gray-200">{assessment.startTime ? formatShortDate(assessment.startTime) : 'Not scheduled'}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">{assessment.endTime ? `Ends ${formatShortDate(assessment.endTime)}` : 'End date not set'}</div>
                      </div>

                      <div className="min-w-0 text-xs">
                        <div className="font-semibold text-slate-700 dark:text-gray-200">{formatTime(assessment.startTime)}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">{assessment.duration ? `${assessment.duration} min` : 'Duration not set'}</div>
                      </div>

                      <div className="text-xs">
                        <div className="font-semibold text-slate-700 dark:text-gray-200">{assessment.totalQuestions || 0} questions</div>
                        <div className="mt-0.5 text-[11px] text-slate-400 dark:text-gray-500">{assessment.totalMarks || 0} marks</div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-gray-200">{completedCount} of {assignedCount}</span>
                          <span className="text-[10px] tabular-nums text-slate-400 dark:text-gray-500">{completionPercent}%</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-800">
                          <div className="h-full rounded-full bg-sky-500 transition-[width]" style={{ width: `${completionPercent}%` }} />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium ${assessment.isVisible !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                          {assessment.isVisible !== false ? <Globe className="h-3 w-3" /> : <ShieldOff className="h-3 w-3" />}
                          {assessment.isVisible !== false ? 'Visible' : 'Hidden'}
                        </span>
                      </div>

                      <div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold ${statusStyles[lifecycleStatus] || statusStyles.Upcoming}`}>
                          {assessment.status === 'Active' && <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                          {displayStatus(lifecycleStatus)}
                        </span>
                      </div>

                      <div className="justify-self-start md:justify-self-end">
                        <ThreeDotsMenu
                            assessment={assessment}
                            onOpen={() => navigate(openPath)}
                            onPreview={() => navigate(`${rolePrefix}/assessment/preview/${assessment._id}`)}
                            onViewReport={() => navigate(`${rolePrefix}/assessment/reports?assessmentId=${encodeURIComponent(assessment._id)}`)}
                            onEdit={() => navigate(`${rolePrefix}/assessment/${assessment._id}/edit`)}
                            onDuplicate={() => handleDuplicate(assessment._id)}
                            onDelete={() => handleDelete(assessment._id)}
                            onToggleVisibility={() => handleToggleVisibility(assessment)}
                            onEditPassword={() => setPasswordTarget(assessment)}
                            onSendInvitations={() => setInvitationTarget(assessment)}
                            onEligibleStudents={() => setEligibleTarget(assessment)}
                            onAddStudents={() => setEligibleTarget({ ...assessment, startInAddMode: true })}
                            onResetSubmissions={() => openResetSubmissions(assessment)}
                            onMarkComplete={() => openMarkComplete(assessment)}
                            onReleaseAnswers={() => openReleaseAnswers(assessment)}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          </main>
        </div>
      </motion.div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setSelected(null)} />
            <motion.div initial={{ opacity: 0, x: 320 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 320 }} className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl dark:bg-gray-900">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selected.title || 'Assessment'}</h2>
                  <p className="text-xs text-slate-500 dark:text-gray-400">Assessment ID: {selected.assessmentId || '—'}</p>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-gray-700 dark:hover:bg-gray-800">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Access badges */}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${selected.isVisible !== false ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-100 text-slate-500'}`}>
                  {selected.isVisible !== false ? <Globe className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
                  {selected.isVisible !== false ? 'Visible to Students' : 'Hidden from Students'}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${selected.passwordEnabled ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-100 text-slate-400'}`}>
                  {selected.passwordEnabled ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                  {selected.passwordEnabled ? 'Password Protected' : 'No Password Set'}
                </span>
              </div>

              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  <div className="text-xs text-slate-400">Description</div>
                  <div className="mt-1">{selected.description || 'No description provided.'}</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    { label: 'Start', value: formatDateTime(selected.startTime) },
                    { label: 'End', value: formatDateTime(selected.endTime) },
                    { label: 'Duration', value: `${selected.duration || '-'} min` },
                    { label: 'Attempts', value: selected.attempts || 0 },
                    { label: 'Type', value: selected.testType || '—' },
                    { label: 'Target', value: selected.targetType === 'all' ? 'All Students' : 'Selected' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                      <div className="text-slate-400">{label}</div>
                      <div className="mt-1 font-semibold">{value}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  <div className="text-slate-400">Sections</div>
                  <div className="mt-2 space-y-2">
                    {(selected.sections || []).map((sec, idx) => (
                      <div key={`${sec.sectionName}-${idx}`} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                        <span className="font-semibold">{sec.sectionName || `Section ${idx + 1}`}</span>
                        <span>{sec.questions?.length || 0} questions</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <button type="button" onClick={() => { setSelected(null); navigate(`${rolePrefix}/assessment/${selected._id}/edit`); }} className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-500">
                    <Pencil className="h-3.5 w-3.5" /> Edit Assessment
                  </button>
                  <button type="button" onClick={() => { setPasswordTarget(selected); setSelected(null); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-gray-700 dark:text-gray-200">
                    <Lock className="h-3.5 w-3.5" /> Edit Password
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Password Modal */}
      {passwordTarget && (
        <PasswordModal
          assessment={passwordTarget}
          onClose={() => setPasswordTarget(null)}
          onSave={loadAssessments}
        />
      )}
      {invitationTarget && <InvitationModal assessment={invitationTarget} onClose={() => setInvitationTarget(null)} />}
      {eligibleTarget && (
        <EligibleStudentsModal
          assessment={eligibleTarget}
          rolePrefix={rolePrefix}
          onClose={() => setEligibleTarget(null)}
          onChanged={loadAssessments}
        />
      )}
      <ConfirmActionModal
        action={confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirmAction}
      />
    </div>
  );
}
