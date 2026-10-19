const SIZES = { sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-lg' };

/** A university's logo, or its initials when it has none. */
export default function UniversityBadge({ university, size = 'md' }) {
  const initials = String(university?.name || university?.universityId || '?').split(/\s+/).filter(Boolean).map((word) => word[0]).slice(0, 2).join('').toUpperCase();
  if (university?.logo?.url) {
    return <img src={university.logo.url} alt="" className={`${SIZES[size]} shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1 dark:border-slate-700`} />;
  }
  return <span className={`${SIZES[size]} flex shrink-0 items-center justify-center rounded-xl bg-sky-100 font-bold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300`} aria-hidden="true">{initials}</span>;
}
