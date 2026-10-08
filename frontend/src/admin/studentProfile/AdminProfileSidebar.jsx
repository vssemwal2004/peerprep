import {
  BookOpen,
  CalendarClock,
  CalendarRange,
  ChevronRight,
  FileText,
  GitBranch,
  Github,
  Globe,
  GraduationCap,
  Hash,
  Info,
  Linkedin,
  Mail,
  ShieldCheck,
  Star,
  Users,
} from 'lucide-react';
import { focusRing } from '../../student/profile/format';
// Level visuals come from the student profile so both views stay identical.
import { levelTheme } from '../../student/profile/levelTheme';
import { fmtDate, normalizeHref } from './utils';

const SOCIAL_ICONS = { LinkedIn: Linkedin, GitHub: Github, Portfolio: Globe };

function SectionTitle({ id, children }) {
  return <h2 id={id} className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{children}</h2>;
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <dt className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
        <span className="text-slate-400 dark:text-zinc-500" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd
        className={`min-w-0 truncate text-right text-xs ${value ? 'font-medium text-slate-800 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-500'}`}
        title={value || undefined}
      >
        {value || 'Not provided'}
      </dd>
    </div>
  );
}

function SocialLink({ href, label }) {
  const Icon = SOCIAL_ICONS[label] || Globe;
  const normalizedHref = normalizeHref(href);
  if (!normalizedHref) {
    return (
      <span
        role="img"
        title={`${label} not added`}
        aria-label={`${label} not added`}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300 dark:border-zinc-700 dark:text-zinc-600"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }
  return (
    <a
      href={normalizedHref}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={`${label} (opens in a new tab)`}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300 ${focusRing}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function StatusChip({ className, children }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

/**
 * Identity column only (who the student is and how to reach them). Performance, level progress
 * and awards live in the main column so nothing is shown twice.
 */
export default function AdminProfileSidebar({
  student,
  handle,
  bio,
  hasCustomBio,
  level,
  levelNote,
  socialLinks,
  onViewResume,
  onOpenLevels,
}) {
  const initial = student?.name ? student.name.charAt(0).toUpperCase() : 'S';
  const hasActiveFlag = typeof student?.isActive === 'boolean';
  const theme = level ? levelTheme(level.level) : null;
  const LevelIcon = theme?.Icon;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-zinc-800 dark:bg-[#242424]">
      <div className="relative h-20 overflow-hidden bg-gradient-to-br from-sky-500 via-sky-400 to-cyan-300 dark:from-sky-800 dark:via-sky-700 dark:to-cyan-800" aria-hidden="true">
        <div className="absolute inset-0 opacity-25 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px]" />
        <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/25 blur-2xl" />
      </div>

      <div className="px-5 pb-5">
        {/* relative z-10: the cover above is positioned, so without this it paints over the avatar. */}
        <div className="relative z-10 -mt-10 flex flex-col items-center text-center">
          <div className="rounded-full bg-gradient-to-br from-sky-400 via-cyan-300 to-indigo-400 p-[3px] shadow-lg shadow-sky-500/20">
            {student?.avatarUrl ? (
              <img
                src={student.avatarUrl}
                alt={student?.name ? `${student.name}'s profile photo` : 'Student profile photo'}
                className="h-20 w-20 rounded-full object-cover ring-[3px] ring-white dark:ring-[#242424]"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-2xl font-semibold text-white ring-[3px] ring-white dark:ring-[#242424]" aria-hidden="true">
                {initial}
              </div>
            )}
          </div>
          <h1 className="mt-2.5 max-w-full truncate text-base font-semibold tracking-tight text-slate-900 dark:text-zinc-50" title={student?.name || 'Student'}>
            {student?.name || 'Student'}
          </h1>
          <p className="max-w-full truncate text-xs text-slate-500 dark:text-zinc-400">{handle}</p>

          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
            {level ? (
              <button
                type="button"
                onClick={onOpenLevels}
                title={levelNote || 'View all levels'}
                aria-label={`Level ${level.level}, ${level.title}. View all levels`}
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-opacity hover:opacity-80 ${theme.soft} ${focusRing}`}
              >
                <LevelIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {level.title} · Lv {level.level}
                <ChevronRight className="h-3 w-3 opacity-60" aria-hidden="true" />
              </button>
            ) : null}
            {hasActiveFlag ? (
              <StatusChip
                className={student.isActive
                  ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30'
                  : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700'}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${student.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} aria-hidden="true" />
                {student.isActive ? 'Active' : 'Inactive'}
              </StatusChip>
            ) : null}
            {student?.isSpecialStudent ? (
              <StatusChip className="bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30">
                <Star className="h-3 w-3" aria-hidden="true" />
                Special
              </StatusChip>
            ) : null}
          </div>
          {levelNote ? (
            <p className="mt-1.5 flex items-start gap-1 text-left text-[10px] leading-snug text-slate-400 dark:text-zinc-500">
              <Info className="mt-px h-3 w-3 shrink-0" aria-hidden="true" />
              {levelNote}
            </p>
          ) : null}

          <p className={`mt-3 text-[13px] leading-relaxed ${hasCustomBio ? 'text-slate-600 dark:text-zinc-300' : 'text-slate-400 dark:text-zinc-500'}`}>
            {bio}
          </p>

          <div className="mt-4 flex w-full gap-2">
            <button
              type="button"
              onClick={onViewResume}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 dark:hover:bg-sky-500 ${focusRing}`}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              View Resume
            </button>
            {student?.email ? (
              <a
                href={`mailto:${student.email}`}
                aria-label={`Email ${student?.name || 'student'}`}
                title={`Email ${student.email}`}
                className={`inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300 ${focusRing}`}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </div>

        <section aria-labelledby="admin-identity-title" className="mt-5 border-t border-slate-100 pt-4 dark:border-zinc-800">
          <SectionTitle id="admin-identity-title">Student details</SectionTitle>
          <dl className="divide-y divide-slate-100 dark:divide-zinc-800/80">
            <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="Student ID" value={student?.studentId} />
            <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={student?.email} />
            <DetailRow icon={<GraduationCap className="h-3.5 w-3.5" />} label="College" value={student?.college} />
            <DetailRow icon={<BookOpen className="h-3.5 w-3.5" />} label="Course" value={student?.course} />
            <DetailRow icon={<GitBranch className="h-3.5 w-3.5" />} label="Branch" value={student?.branch} />
            <DetailRow icon={<CalendarRange className="h-3.5 w-3.5" />} label="Semester" value={student?.semester ? `Semester ${student.semester}` : ''} />
            <DetailRow icon={<Users className="h-3.5 w-3.5" />} label="Group" value={student?.group} />
            <DetailRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Coordinator" value={student?.teacherId || 'Not assigned'} />
            <DetailRow icon={<CalendarClock className="h-3.5 w-3.5" />} label="Joined" value={student?.createdAt ? fmtDate(student.createdAt) : ''} />
          </dl>
        </section>

        <section aria-labelledby="admin-links-title" className="mt-4 border-t border-slate-100 pt-4 dark:border-zinc-800">
          <SectionTitle id="admin-links-title">Links</SectionTitle>
          <div className="flex items-center gap-2">
            {socialLinks.map((item) => (
              <SocialLink key={item.label} href={item.href} label={item.label} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
