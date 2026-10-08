import {
  BookOpen,
  CalendarRange,
  Camera,
  GitBranch,
  Github,
  Globe,
  GraduationCap,
  Hash,
  Linkedin,
  Mail,
  Pencil,
} from 'lucide-react';
import { focusRing } from './format';
import { levelTheme } from './levelTheme';

function normalizeHref(href) {
  const raw = typeof href === 'string' ? href.trim() : '';
  if (!raw) return '';
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) return raw;
  if (raw.startsWith('//')) return `https:${raw}`;
  return `https://${raw}`;
}

const SOCIAL_ICONS = {
  LinkedIn: Linkedin,
  GitHub: Github,
  Portfolio: Globe,
};


function SocialButton({ href, label }) {
  const Icon = SOCIAL_ICONS[label] || Globe;
  const normalizedHref = normalizeHref(href);

  if (!normalizedHref) {
    return (
      <span
        title={`${label} not added`}
        aria-label={`${label} not added`}
        role="img"
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
      aria-label={`${label} (opens in a new tab)`}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300 ${focusRing}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}

function SectionTitle({ children, aside }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{children}</h2>
      {aside}
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 dark:bg-zinc-800/70 dark:text-zinc-400" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-zinc-500">{label}</dt>
        <dd
          className={`truncate text-[13px] font-medium ${value ? 'text-slate-800 dark:text-zinc-200' : 'font-normal text-slate-400 dark:text-zinc-500'}`}
          title={value || undefined}
        >
          {value || 'Not added'}
        </dd>
      </div>
    </div>
  );
}

/** Identity tag for the student's level; opens the Levels view of the badges gallery. */
function BadgePill({ badge, level, onOpen }) {
  const theme = levelTheme(level?.level);
  const { Icon } = theme;
  const content = (
    <>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {badge?.title}
      {level?.level ? <span className="font-normal opacity-70">· Lv {level.level}</span> : null}
    </>
  );
  const classes = `mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${theme.soft}`;
  if (!onOpen) return <span title={badge?.helper} className={classes}>{content}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen('levels')}
      title={`${badge?.helper || ''} View levels`.trim()}
      className={`${classes} transition-opacity hover:opacity-80 ${focusRing}`}
    >
      {content}
    </button>
  );
}

/**
 * Identity sidebar (LeetCode-style): who the student is, About, Links. Stats, badges and levels
 * live in the right column only, so nothing on the page is shown twice.
 */
export default function ProfileSidebar({
  user,
  handle,
  badge,
  level,
  onOpenBadges,
  bio,
  hasCustomBio,
  socialLinks,
  onChangePhoto,
  onEditProfile,
}) {
  const initial = user?.name ? user.name.charAt(0).toUpperCase() : 'U';

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_-12px_rgba(14,116,144,0.18)] dark:border-zinc-800 dark:bg-[#242424]">
      {/* Decorated cover: gradient + dot pattern + soft glows, fading into the card. */}
      <div className="relative h-28 shrink-0 overflow-hidden bg-gradient-to-br from-sky-500 via-sky-400 to-cyan-300 dark:from-sky-800 dark:via-sky-700 dark:to-cyan-800" aria-hidden="true">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
        <div className="absolute -left-8 top-10 h-28 w-28 rounded-full bg-indigo-400/30 blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-[#242424]" />
      </div>

      <div className="flex flex-1 flex-col gap-5 px-5 pb-5">
        {/* Identity */}
        <div className="-mt-14 flex flex-col items-center text-center">
          <div className="relative rounded-full bg-gradient-to-br from-sky-400 via-cyan-300 to-indigo-400 p-[3px] shadow-lg shadow-sky-500/20">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user?.name ? `${user.name}'s profile photo` : 'Profile photo'}
                className="h-[88px] w-[88px] rounded-full object-cover ring-[3px] ring-white dark:ring-[#242424]"
              />
            ) : (
              <div
                className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-sky-700 text-3xl font-semibold text-white ring-[3px] ring-white dark:ring-[#242424]"
                aria-hidden="true"
              >
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={onChangePhoto}
              aria-label="Change profile photo"
              title="Change profile photo"
              className={`absolute bottom-0.5 right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-sky-300 ${focusRing}`}
            >
              <Camera className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <h1 className="mt-3 max-w-full truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-zinc-50" title={user?.name || 'Student'}>
            {user?.name || 'Student'}
          </h1>
          <p className="max-w-full truncate text-[13px] text-slate-500 dark:text-zinc-400">{handle}</p>
          <BadgePill badge={badge} level={level} onOpen={onOpenBadges} />
          <p className={`mt-3 text-[13px] leading-relaxed ${hasCustomBio ? 'text-slate-600 dark:text-zinc-300' : 'text-slate-500 dark:text-zinc-400'}`}>
            {bio}
            {!hasCustomBio ? (
              <>
                {' '}
                <button
                  type="button"
                  onClick={onEditProfile}
                  className={`rounded font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 ${focusRing}`}
                >
                  Add a bio
                </button>
              </>
            ) : null}
          </p>
          <button
            type="button"
            onClick={onEditProfile}
            className={`mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm shadow-sky-600/30 transition-colors hover:bg-sky-700 dark:bg-sky-600 dark:hover:bg-sky-500 ${focusRing}`}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            Edit Profile
          </button>
        </div>

        <section aria-labelledby="about-title" className="border-t border-slate-100 pt-4 dark:border-zinc-800">
          <SectionTitle><span id="about-title">About</span></SectionTitle>
          <dl>
            <DetailRow icon={<GraduationCap className="h-3.5 w-3.5" />} label="College" value={user?.college} />
            <DetailRow icon={<BookOpen className="h-3.5 w-3.5" />} label="Course" value={user?.course} />
            <DetailRow icon={<GitBranch className="h-3.5 w-3.5" />} label="Branch" value={user?.branch} />
            <DetailRow icon={<Hash className="h-3.5 w-3.5" />} label="Student ID" value={user?.studentId} />
            <DetailRow icon={<CalendarRange className="h-3.5 w-3.5" />} label="Semester" value={user?.semester ? `Semester ${user.semester}` : ''} />
            <DetailRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={user?.email} />
          </dl>
        </section>

        <section aria-labelledby="links-title" className="mt-auto border-t border-slate-100 pt-4 dark:border-zinc-800">
          <SectionTitle><span id="links-title">Links</span></SectionTitle>
          <div className="flex items-center gap-2">
            {socialLinks.map((item) => (
              <SocialButton key={item.label} href={item.href} label={item.label} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
