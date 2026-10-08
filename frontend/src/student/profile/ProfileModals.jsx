import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, X } from 'lucide-react';
import { focusRing } from './format';

const MotionDiv = motion.div;

function useEscape(active, onClose) {
  useEffect(() => {
    if (!active) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, onClose]);
}

function Alert({ tone, children }) {
  const classes = tone === 'error'
    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-2 text-sm ${classes}`}>
      {children}
    </div>
  );
}

function ModalShell({ open, onClose, labelledBy, maxWidth, children }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <MotionDiv
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-sm"
          />
          <MotionDiv
            key="dialog"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={labelledBy}
              className={`pointer-events-auto flex max-h-[calc(100vh-2rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-[#242424]`}
            >
              {children}
            </div>
          </MotionDiv>
        </>
      )}
    </AnimatePresence>
  );
}

function ModalHeader({ id, title, description, onClose }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-zinc-800">
      <div>
        <h2 id={id} className="text-base font-semibold text-slate-900 dark:text-zinc-50">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-slate-500 dark:text-zinc-400">{description}</p> : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close dialog"
        className={`rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200 ${focusRing}`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

function ProfileField({ label, value, onChange, placeholder = '', multiline = false, type = 'text', disabled = false, hint }) {
  const sharedClassName = disabled
    ? 'w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 outline-none placeholder:text-slate-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500 dark:placeholder:text-zinc-600'
    : 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-shadow placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-500 dark:focus:ring-sky-500/20';

  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-zinc-400">{label}</span>
      {multiline ? (
        <textarea
          rows={4}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={`${sharedClassName} resize-none`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={onChange}
          disabled={disabled}
          placeholder={placeholder}
          className={sharedClassName}
        />
      )}
      {hint ? <span className="mt-1 block text-[11px] text-slate-400 dark:text-zinc-500">{hint}</span> : null}
    </label>
  );
}

const secondaryButton = `rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 ${focusRing}`;
const primaryButton = `rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-sky-500 ${focusRing}`;

export function EditProfileModal({ open, onClose, profileForm, setProfileForm, onSave, saving, error, success }) {
  useEscape(open, onClose);
  const update = (key) => (event) => {
    const { value } = event.target;
    setProfileForm((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <ModalShell open={open} onClose={onClose} labelledBy="edit-profile-title" maxWidth="max-w-2xl">
      <ModalHeader
        id="edit-profile-title"
        title="Edit Student Profile"
        description="Keep your PeerPrep identity, bio, and social links updated across student and admin views."
        onClose={onClose}
      />

      <div className="space-y-4 overflow-y-auto px-5 py-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {success ? <Alert tone="success">{success}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <ProfileField label="Username" value={profileForm.username} onChange={update('username')} placeholder="your-handle" />
          <ProfileField label="Full Name" value={profileForm.name} placeholder="Your full name" disabled />
          <ProfileField label="College" value={profileForm.college} placeholder="Your college or university" disabled />
          <ProfileField label="Course" value={profileForm.course} placeholder="B.Tech, MCA, etc." disabled />
          <ProfileField label="Branch" value={profileForm.branch} placeholder="CSE, IT, AIML..." disabled />
        </div>
        <p className="text-[11px] text-slate-400 dark:text-zinc-500">Name, college, course and branch are managed by your institution.</p>

        <ProfileField
          label="Bio"
          multiline
          value={profileForm.bio}
          onChange={update('bio')}
          placeholder="Short professional summary, coding focus, or career goal"
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <ProfileField label="LinkedIn URL" type="url" value={profileForm.linkedinUrl} onChange={update('linkedinUrl')} placeholder="https://linkedin.com/in/..." />
          <ProfileField label="GitHub URL" type="url" value={profileForm.githubUrl} onChange={update('githubUrl')} placeholder="https://github.com/..." />
          <ProfileField label="Portfolio URL" type="url" value={profileForm.portfolioUrl} onChange={update('portfolioUrl')} placeholder="https://yourportfolio.com" />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="button" onClick={onSave} disabled={saving} className={primaryButton}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </ModalShell>
  );
}

export function PhotoModal({ open, onClose, user, avatarFile, avatarPreview, onAvatarChange, onSave, error, success }) {
  useEscape(open, onClose);
  const imageClass = 'h-28 w-28 rounded-full object-cover ring-4 ring-slate-100 dark:ring-zinc-800';

  return (
    <ModalShell open={open} onClose={onClose} labelledBy="photo-modal-title" maxWidth="max-w-md">
      <ModalHeader id="photo-modal-title" title="Update Profile Photo" onClose={onClose} />

      <div className="space-y-4 px-5 py-5">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {success ? <Alert tone="success">{success}</Alert> : null}

        <div className="flex flex-col items-center text-center">
          {avatarPreview ? (
            <img src={avatarPreview} alt="Selected photo preview" className={imageClass} />
          ) : user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user?.name ? `${user.name}'s current photo` : 'Current photo'} className={imageClass} />
          ) : (
            <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-3xl font-semibold text-white ring-4 ring-slate-100 dark:ring-zinc-800" aria-hidden="true">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
          )}

          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-100 focus-within:ring-2 focus-within:ring-sky-500 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20">
            <Camera className="h-4 w-4" aria-hidden="true" />
            Choose Photo
            <input type="file" accept="image/*" onChange={onAvatarChange} className="sr-only" />
          </label>
          <p className="mt-2 max-w-full truncate text-xs text-slate-500 dark:text-zinc-400">
            {avatarFile ? avatarFile.name : 'Square image recommended, at least 256 x 256 px.'}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900/40">
        <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
        <button type="button" onClick={onSave} disabled={!avatarFile} className={primaryButton}>
          Update Photo
        </button>
      </div>
    </ModalShell>
  );
}
