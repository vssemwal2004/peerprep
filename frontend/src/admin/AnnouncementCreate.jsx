import { useState } from 'react';
import { api } from '../utils/api';
import PageGuideButton from '../guide/platform/PageGuideButton';
import AnnouncementEditor, { audienceProblem, formFromAnnouncement, payloadFromForm } from './announcements/AnnouncementEditor';
import { audienceLabel } from './announcements/audienceModel';
import AnnouncementEmailDialog from './announcements/AnnouncementEmailDialog';
import { EmailToggle } from './announcements/EmailToggle';

/** New announcement: rich content, design, colour, image and button, with a live student preview. */
export default function AnnouncementCreate() {
  const [form, setForm] = useState(() => formFromAnnouncement(null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailSent, setEmailSent] = useState(null);

  const submit = async (statusOverride) => {
    if (!form.title.trim() || !form.messageHtml.trim()) { setError('Title and message are required.'); return; }
    const problem = audienceProblem(form);
    if (problem) { setError(problem); return; }
    setSaving(true); setError(''); setSuccess('');
    try {
      const saved = await api.createAnnouncement(payloadFromForm(form, statusOverride));
      const who = audienceLabel(saved?.announcement?.audience, saved?.announcement?.audienceCount);
      const skipped = saved?.skippedStudents ? ` ${saved.skippedStudents} chosen student${saved.skippedStudents === 1 ? ' was' : 's were'} not found and left out.` : '';
      setSuccess(statusOverride === 'active' || (!statusOverride && form.status === 'active') ? `Announcement published to ${who.toLowerCase()}.${skipped}` : `Announcement saved as a draft (for ${who.toLowerCase()}).${skipped}`);
      setForm(formFromAnnouncement(null));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err?.message || 'Failed to save announcement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 dark:bg-gray-900">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <div data-guide="ac-header">
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900 dark:text-white">Add Announcement<PageGuideButton /></h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">Create a notice, alert, exam update, placement drive and more. Students see it on their dashboard and, if you choose, as a popup.</p>
        </div>
        {success ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">{success}</div> : null}
        <AnnouncementEditor form={form} setForm={setForm} error={error}
          extra={<EmailToggle sent={emailSent} onOpen={() => {
            if (!form.title.trim() || !form.messageHtml.trim()) { setError('Add the title and message first, then choose who gets the email.'); return; }
            setError(''); setEmailOpen(true);
          }} />}
          actions={<>
            <button type="button" onClick={() => submit('inactive')} disabled={saving}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-gray-700 dark:text-slate-200 dark:hover:bg-gray-800">Save draft</button>
            <button type="button" onClick={() => submit('active')} disabled={saving}
              className="rounded-xl bg-sky-600 px-5 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-60">{saving ? 'Saving…' : 'Publish'}</button>
          </>} />
      </div>
      <AnnouncementEmailDialog open={emailOpen} onClose={() => setEmailOpen(false)} announcement={payloadFromForm(form)} onSent={setEmailSent}
        initialStudents={form.audience === 'selected' ? form.students : null} />
    </div>
  );
}
