import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { categoryOf, labelOf, safeAnnouncementHtml, themeOf } from './announcementMeta';

// Typography for formatted content (no typography plugin: explicit element styles).
export const CONTENT_CLASS = [
  'text-[14px] leading-relaxed text-slate-700 dark:text-zinc-300',
  '[&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-[18px] [&_h2]:font-bold [&_h2]:leading-snug [&_h2]:text-slate-900 dark:[&_h2]:text-white',
  '[&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[15.5px] [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-white',
  '[&_h4]:mb-1 [&_h4]:mt-2 [&_h4]:text-[14px] [&_h4]:font-semibold [&_h4]:text-slate-800 dark:[&_h4]:text-zinc-100',
  '[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_a]:font-medium [&_a]:text-sky-700 [&_a]:underline dark:[&_a]:text-sky-300',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-3 [&_blockquote]:italic dark:[&_blockquote]:border-white/15',
  '[&_hr]:my-3 [&_hr]:border-slate-200 dark:[&_hr]:border-white/10 [&_mark]:rounded [&_mark]:px-0.5',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
].join(' ');

/** Width class for the dialog around a design (the side-image design needs more room). */
export const panelWidth = (announcement = {}) => (announcement.design === 'split' && announcement.imageUrl ? 'max-w-2xl' : 'max-w-lg');

/** The announcement's content: formatted HTML (sanitised again here) or the plain message. */
export function AnnouncementContent({ announcement, id, className = '' }) {
  const html = useMemo(() => safeAnnouncementHtml(announcement?.messageHtml), [announcement?.messageHtml]);
  if (html) return <div id={id} className={`${CONTENT_CLASS} ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
  return <p id={id} className={`whitespace-pre-line ${CONTENT_CLASS} ${className}`}>{announcement?.message}</p>;
}

function Cta({ announcement, theme, onAction, block = false, preview = false }) {
  if (!announcement.ctaLabel || !announcement.ctaUrl) return null;
  const className = `inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-[13.5px] font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 ${theme.button} ${block ? 'w-full' : ''}`;
  const content = <>{announcement.ctaLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></>;
  // Admin preview: the button looks real but never leaves the editor.
  if (preview) return <span className={className} title={`Opens ${announcement.ctaUrl}`}>{content}</span>;
  return announcement.ctaUrl.startsWith('/')
    ? <Link to={announcement.ctaUrl} onClick={onAction} className={className}>{content}</Link>
    : <a href={announcement.ctaUrl} target="_blank" rel="noopener noreferrer" onClick={onAction} className={className}>{content}</a>;
}

function CloseButton({ onClose, closeRef, light = false }) {
  if (!onClose) return null;
  return (
    <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
      className={`absolute right-3 top-3 z-10 rounded-lg p-1.5 outline-none focus-visible:ring-2 ${light
        ? 'bg-black/15 text-white hover:bg-black/25 focus-visible:ring-white/80'
        : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-sky-500/60 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200'}`}>
      <X className="h-4 w-4" />
    </button>
  );
}

function Chip({ announcement, theme, light = false }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${light ? 'bg-white/20 text-white ring-1 ring-inset ring-white/30' : `ring-1 ring-inset ${theme.soft}`}`}>
      {labelOf(announcement)}
    </span>
  );
}

function Image({ announcement, className }) {
  if (!announcement.imageUrl) return null;
  // A broken link hides itself, so the design's colour shows instead of a broken-image icon.
  return <img src={announcement.imageUrl} alt={announcement.imageAlt || ''} className={className} loading="lazy"
    onError={(event) => { event.currentTarget.style.display = 'none'; }} />;
}

const CONFETTI = 'pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle,rgba(255,255,255,0.9)_1.5px,transparent_2px),radial-gradient(circle,rgba(255,255,255,0.6)_1px,transparent_1.5px)] [background-position:0_0,11px_17px] [background-size:28px_28px,34px_34px]';

/**
 * One announcement drawn in its design and colour: classic, banner, spotlight, split (side image),
 * minimal or celebration. Used by the student login popup, the dashboard reader and the admin
 * preview, so admins see exactly what students see. `footer` holds navigation (Previous / Next).
 */
export default function AnnouncementView({
  announcement, onClose, closeRef, footer = null, onAction, titleId = 'announcement-title', bodyId = 'announcement-body', preview = false, bodyMaxClass = 'max-h-[46vh]',
}) {
  const item = announcement || {};
  const theme = themeOf(item);
  const { Icon } = categoryOf(item);
  const design = item.design || 'classic';
  const shell = 'relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#1c1c1f]';
  const body = (extra = '') => (
    <div className={`${bodyMaxClass} overflow-y-auto px-5 py-4 ${extra}`}>
      <AnnouncementContent announcement={item} id={bodyId} />
      {item.ctaLabel && item.ctaUrl ? <div className="mt-4"><Cta announcement={item} theme={theme} onAction={onAction} preview={preview} /></div> : null}
    </div>
  );
  const foot = footer ? <footer className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 dark:border-white/[0.06]">{footer}</footer> : null;

  if (design === 'banner') {
    return (
      <div className={shell}>
        <div className={`relative flex min-h-[132px] flex-col justify-end bg-gradient-to-br ${theme.gradient} px-5 pb-4 pt-10 text-white`}>
          {item.imageUrl ? <><Image announcement={item} className="absolute inset-0 h-full w-full object-cover" /><span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" aria-hidden="true" /></> : (
            <><span className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
              <Icon className="pointer-events-none absolute right-5 top-6 h-16 w-16 text-white/20" aria-hidden="true" /></>
          )}
          <CloseButton onClose={onClose} closeRef={closeRef} light />
          <div className="relative"><Chip announcement={item} theme={theme} light />
            <h2 id={titleId} className="mt-1.5 text-[19px] font-bold leading-snug drop-shadow-sm">{item.title}</h2></div>
        </div>
        {body()}{foot}
      </div>
    );
  }

  if (design === 'spotlight') {
    return (
      <div className={shell}>
        <CloseButton onClose={onClose} closeRef={closeRef} />
        <div className={`flex flex-col items-center px-6 pb-1 pt-7 text-center ${theme.tint}`}>
          <span className={`flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${theme.gradient}`} aria-hidden="true"><Icon className="h-8 w-8" /></span>
          <div className="mt-3"><Chip announcement={item} theme={theme} /></div>
          <h2 id={titleId} className="mt-2 text-[20px] font-bold leading-snug text-slate-900 dark:text-white">{item.title}</h2>
          <Image announcement={item} className="mb-1 mt-4 max-h-48 w-full rounded-xl object-cover" />
          <span className="h-4" />
        </div>
        {body('text-center [&_li]:text-left')}{foot}
      </div>
    );
  }

  if (design === 'split') {
    return (
      <div className={shell}>
        <CloseButton onClose={onClose} closeRef={closeRef} />
        <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className={`relative flex min-h-[140px] items-center justify-center overflow-hidden bg-gradient-to-br ${theme.gradient}`}>
            {item.imageUrl ? <Image announcement={item} className="absolute inset-0 h-full w-full object-cover" /> : <>
              <span className="pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/15 blur-2xl" aria-hidden="true" />
              <Icon className="h-16 w-16 text-white/90" aria-hidden="true" /></>}
          </div>
          <div className="min-w-0">
            <div className="px-5 pr-12 pt-5"><Chip announcement={item} theme={theme} />
              <h2 id={titleId} className="mt-1.5 text-[18px] font-bold leading-snug text-slate-900 dark:text-white">{item.title}</h2></div>
            {body()}
          </div>
        </div>
        {foot}
      </div>
    );
  }

  if (design === 'minimal') {
    return (
      <div className={`${shell} before:absolute before:inset-y-0 before:left-0 before:w-1.5 ${theme.rule}`}>
        <CloseButton onClose={onClose} closeRef={closeRef} />
        <div className="px-6 pr-12 pt-5">
          <p className={`text-[11px] font-bold uppercase tracking-[0.08em] ${theme.text}`}>{labelOf(item)}</p>
          <h2 id={titleId} className="mt-1 text-[18px] font-semibold leading-snug text-slate-900 dark:text-white">{item.title}</h2>
          <Image announcement={item} className="mt-3 max-h-48 w-full rounded-xl object-cover" />
        </div>
        {body('px-6')}{foot}
      </div>
    );
  }

  if (design === 'celebration') {
    return (
      <div className={`${shell} border-0 bg-gradient-to-br ${theme.gradient}`}>
        <span className={CONFETTI} aria-hidden="true" />
        <CloseButton onClose={onClose} closeRef={closeRef} light />
        <div className="relative flex flex-col items-center px-6 pb-4 pt-7 text-center text-white">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/25" aria-hidden="true"><Icon className="h-8 w-8" /></span>
          <div className="mt-3"><Chip announcement={item} theme={theme} light /></div>
          <h2 id={titleId} className="mt-2 text-[21px] font-bold leading-snug drop-shadow-sm">{item.title}</h2>
          <Image announcement={item} className="mt-4 max-h-48 w-full rounded-xl object-cover shadow-lg" />
        </div>
        <div className="relative mx-4 mb-4 rounded-xl bg-white/95 dark:bg-[#1c1c1f]/95">{body('text-center [&_li]:text-left')}</div>
        {footer ? <footer className="relative flex items-center justify-between gap-3 border-t border-white/20 px-5 py-3 text-white">{footer}</footer> : null}
      </div>
    );
  }

  // classic
  return (
    <div className={shell}>
      <CloseButton onClose={onClose} closeRef={closeRef} />
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 pr-12 dark:border-white/[0.06]">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white ${theme.solid}`} aria-hidden="true"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1"><Chip announcement={item} theme={theme} />
          <h2 id={titleId} className="mt-1 text-[16.5px] font-semibold leading-snug text-slate-900 dark:text-zinc-50">{item.title}</h2></div>
      </header>
      {item.imageUrl ? <div className="px-5 pt-4"><Image announcement={item} className="max-h-52 w-full rounded-xl object-cover" /></div> : null}
      {body()}{foot}
    </div>
  );
}
