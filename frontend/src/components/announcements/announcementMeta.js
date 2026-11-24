import {
  AlarmClock, BellRing, Briefcase, CalendarDays, FileText, GraduationCap, Hourglass, Megaphone, PartyPopper, Sparkles, TriangleAlert, Trophy,
} from 'lucide-react';

// Rich announcements (2026-11-24): what students see an announcement called, its popup design and
// colour. Server twin: backend/src/services/announcementContent.js (same keys).

export const CATEGORIES = Object.freeze([
  { key: 'announcement', label: 'Announcement', Icon: Megaphone, theme: 'sky' },
  { key: 'notice', label: 'Notice', Icon: FileText, theme: 'slate' },
  { key: 'alert', label: 'Alert', Icon: TriangleAlert, theme: 'rose' },
  { key: 'update', label: 'Update', Icon: BellRing, theme: 'sky' },
  { key: 'event', label: 'Event', Icon: CalendarDays, theme: 'teal' },
  { key: 'reminder', label: 'Reminder', Icon: AlarmClock, theme: 'amber' },
  { key: 'deadline', label: 'Deadline', Icon: Hourglass, theme: 'orange' },
  { key: 'exam', label: 'Exam', Icon: GraduationCap, theme: 'amber' },
  { key: 'placement', label: 'Placement', Icon: Briefcase, theme: 'teal' },
  { key: 'holiday', label: 'Holiday', Icon: PartyPopper, theme: 'emerald' },
  { key: 'achievement', label: 'Achievement', Icon: Trophy, theme: 'amber' },
  { key: 'motivation', label: 'Motivation', Icon: Sparkles, theme: 'emerald' },
]);
const CATEGORY_BY_KEY = new Map(CATEGORIES.map((item) => [item.key, item]));

// Full class strings (Tailwind only keeps classes it can see written out).
export const THEMES = Object.freeze({
  sky: { label: 'Sky', swatch: '#0284c7', gradient: 'from-sky-500 via-sky-600 to-sky-800', solid: 'bg-sky-600', button: 'bg-sky-600 hover:bg-sky-700 focus-visible:ring-sky-500/60', text: 'text-sky-700 dark:text-sky-300', soft: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-200 dark:ring-sky-400/20', tint: 'bg-sky-50/80 dark:bg-sky-500/[0.07]', border: 'border-sky-200/80 dark:border-sky-400/20', rule: 'before:bg-sky-500' },
  teal: { label: 'Teal', swatch: '#0d9488', gradient: 'from-teal-500 via-teal-600 to-teal-800', solid: 'bg-teal-600', button: 'bg-teal-600 hover:bg-teal-700 focus-visible:ring-teal-500/60', text: 'text-teal-700 dark:text-teal-300', soft: 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-200 dark:ring-teal-400/20', tint: 'bg-teal-50/80 dark:bg-teal-500/[0.07]', border: 'border-teal-200/80 dark:border-teal-400/20', rule: 'before:bg-teal-500' },
  emerald: { label: 'Green', swatch: '#059669', gradient: 'from-emerald-500 via-emerald-600 to-emerald-800', solid: 'bg-emerald-600', button: 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500/60', text: 'text-emerald-700 dark:text-emerald-300', soft: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200 dark:ring-emerald-400/20', tint: 'bg-emerald-50/80 dark:bg-emerald-500/[0.07]', border: 'border-emerald-200/80 dark:border-emerald-400/20', rule: 'before:bg-emerald-500' },
  amber: { label: 'Gold', swatch: '#d97706', gradient: 'from-amber-400 via-amber-500 to-orange-600', solid: 'bg-amber-500', button: 'bg-amber-500 hover:bg-amber-600 focus-visible:ring-amber-500/60', text: 'text-amber-700 dark:text-amber-300', soft: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20', tint: 'bg-amber-50/80 dark:bg-amber-500/[0.07]', border: 'border-amber-200/80 dark:border-amber-400/20', rule: 'before:bg-amber-500' },
  orange: { label: 'Orange', swatch: '#ea580c', gradient: 'from-orange-500 via-orange-600 to-red-700', solid: 'bg-orange-600', button: 'bg-orange-600 hover:bg-orange-700 focus-visible:ring-orange-500/60', text: 'text-orange-700 dark:text-orange-300', soft: 'bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-400/20', tint: 'bg-orange-50/80 dark:bg-orange-500/[0.07]', border: 'border-orange-200/80 dark:border-orange-400/20', rule: 'before:bg-orange-500' },
  rose: { label: 'Red', swatch: '#e11d48', gradient: 'from-rose-500 via-rose-600 to-rose-800', solid: 'bg-rose-600', button: 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500/60', text: 'text-rose-700 dark:text-rose-300', soft: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/20', tint: 'bg-rose-50/80 dark:bg-rose-500/[0.07]', border: 'border-rose-200/80 dark:border-rose-400/20', rule: 'before:bg-rose-500' },
  slate: { label: 'Slate', swatch: '#334155', gradient: 'from-slate-600 via-slate-700 to-slate-900', solid: 'bg-slate-700', button: 'bg-slate-800 hover:bg-slate-900 focus-visible:ring-slate-500/60 dark:bg-zinc-200 dark:text-zinc-900 dark:hover:bg-white', text: 'text-slate-700 dark:text-zinc-300', soft: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-white/[0.06] dark:text-zinc-200 dark:ring-white/10', tint: 'bg-slate-50 dark:bg-white/[0.04]', border: 'border-slate-200 dark:border-white/10', rule: 'before:bg-slate-500' },
});
export const THEME_KEYS = Object.keys(THEMES);

export const DESIGNS = Object.freeze([
  { key: 'classic', label: 'Classic', hint: 'Clean card with an icon and title' },
  { key: 'banner', label: 'Banner', hint: 'Coloured header (or your image) on top' },
  { key: 'spotlight', label: 'Spotlight', hint: 'Big centred icon and title' },
  { key: 'split', label: 'Side image', hint: 'Image or colour panel on the left' },
  { key: 'minimal', label: 'Minimal', hint: 'Text only, a thin colour line' },
  { key: 'celebration', label: 'Celebration', hint: 'Gradient with confetti, for good news' },
]);

/** Ready starts the admin can change freely (category, design, colour and sample content). */
export const TEMPLATES = Object.freeze([
  { key: 'exam', label: 'Exam notice', category: 'exam', design: 'banner', theme: 'amber', priority: 'high', title: 'Mid-semester exams start next week',
    html: '<h3>What you need to know</h3><ul><li>Exams start on <strong>[date]</strong>.</li><li>Carry your college ID card.</li><li>Reach the hall 15 minutes early.</li></ul><p>All the best!</p>' },
  { key: 'placement', label: 'Placement drive', category: 'placement', design: 'split', theme: 'teal', priority: 'high', title: '[Company] is hiring: campus drive',
    html: '<p><strong>Role:</strong> Software Engineer<br><strong>Eligibility:</strong> B.Tech, 7.0+ CGPA<br><strong>Last date to apply:</strong> [date]</p><p>Prepare with Prep Coding and Prep Mock before the test.</p>', ctaLabel: 'Practise now', ctaUrl: '/problems' },
  { key: 'deadline', label: 'Deadline reminder', category: 'deadline', design: 'classic', theme: 'orange', priority: 'high', title: 'Submit your assignment by Friday',
    html: '<p>The last date is <strong><span style="color:#e11d48">[date], 11:59 PM</span></strong>. Late submissions will not be accepted.</p>' },
  { key: 'event', label: 'Event invite', category: 'event', design: 'banner', theme: 'teal', priority: 'normal', title: 'Coding contest this Saturday',
    html: '<h3>Join the contest</h3><p>When: <strong>Saturday, 10 AM</strong><br>Where: Online on PeerPrep</p><p>Prizes for the top 3!</p>' },
  { key: 'holiday', label: 'Holiday', category: 'holiday', design: 'spotlight', theme: 'emerald', priority: 'normal', title: 'Campus closed for Diwali',
    html: '<p style="text-align:center">The campus stays closed from <strong>[date]</strong> to <strong>[date]</strong>. Happy holidays!</p>' },
  { key: 'achievement', label: 'Achievement', category: 'achievement', design: 'celebration', theme: 'amber', priority: 'normal', title: 'Congratulations to our toppers!',
    html: '<p style="text-align:center">A big round of applause for everyone who cleared the round. Keep practising!</p>' },
  { key: 'alert', label: 'Urgent alert', category: 'alert', design: 'minimal', theme: 'rose', priority: 'high', title: 'Portal maintenance tonight',
    html: '<p>PeerPrep will be unavailable from <strong>11 PM to 1 AM</strong>. Save your work before then.</p>' },
]);

export const categoryOf = (announcement = {}) => CATEGORY_BY_KEY.get(announcement.category)
  || CATEGORY_BY_KEY.get({ alert: 'alert', info: 'update', motivation: 'announcement' }[announcement.type]) || CATEGORY_BY_KEY.get('announcement');

/** The name students see: the admin's custom label, else the category's name. */
export const labelOf = (announcement = {}) => String(announcement.label || '').trim() || categoryOf(announcement).label;

/** The announcement's colour theme (old announcements: their category's colour). */
export const themeOf = (announcement = {}) => THEMES[announcement.theme] || THEMES[categoryOf(announcement).theme] || THEMES.sky;

// ---------------------------------------------------------------- safe HTML (defence in depth)

const ALLOWED_TAGS = new Set(['H2', 'H3', 'H4', 'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'BLOCKQUOTE', 'SPAN', 'MARK', 'HR', 'DIV']);
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const SAFE_ALIGN = /^(left|right|center|justify)$/;

function cleanStyle(element) {
  const style = element.style;
  const kept = [];
  if (style.color && SAFE_COLOR.test(style.color)) kept.push(`color:${style.color}`);
  if (style.backgroundColor && SAFE_COLOR.test(style.backgroundColor)) kept.push(`background-color:${style.backgroundColor}`);
  if (style.textAlign && SAFE_ALIGN.test(style.textAlign)) kept.push(`text-align:${style.textAlign}`);
  return kept.join(';');
}

function cleanNode(node, doc) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1 || !ALLOWED_TAGS.has(child.tagName)) {
      // Unknown or unsafe element: drop it with its content when it is executable, else keep its text.
      if (child.nodeType === 1 && !['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'TEMPLATE'].includes(child.tagName)) {
        cleanNode(child, doc);
        child.replaceWith(...child.childNodes);
      } else child.remove();
      continue;
    }
    const style = cleanStyle(child);
    const href = child.tagName === 'A' ? child.getAttribute('href') || '' : '';
    for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name);
    if (style) child.setAttribute('style', style);
    if (child.tagName === 'A') {
      child.setAttribute('href', /^(https?:|mailto:)/i.test(href.trim()) ? href.trim() : '#');
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    cleanNode(child, doc);
  }
}

/** The announcement's formatted content limited to safe tags/styles (the server already did this). */
export function safeAnnouncementHtml(html) {
  if (!html || typeof window === 'undefined' || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  cleanNode(root, doc);
  return root.innerHTML;
}

/** Plain text of formatted content (for bars and cards when only HTML is at hand). */
export function plainTextOf(html) {
  if (!html || typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(String(html).replace(/<\/(p|h[1-6]|li|div)>/gi, '$&\n').replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
}
