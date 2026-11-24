// Rich announcements (2026-11-24): category label students see, popup design and colour theme,
// optional image and button, and formatted content (headings, paragraphs, colours) kept as
// strictly sanitised HTML. `message` stays the plain-text version for bars, cards and the bell.
import sanitizeHtml from 'sanitize-html';
import { HttpError } from '../utils/errors.js';

export const ANNOUNCEMENT_CATEGORIES = Object.freeze([
  'announcement', 'notice', 'alert', 'update', 'event', 'reminder', 'deadline', 'exam', 'placement', 'holiday', 'achievement', 'motivation',
]);
export const ANNOUNCEMENT_DESIGNS = Object.freeze(['classic', 'banner', 'spotlight', 'split', 'minimal', 'celebration']);
export const ANNOUNCEMENT_THEMES = Object.freeze(['sky', 'teal', 'emerald', 'amber', 'orange', 'rose', 'slate']);
const STATUSES = ['active', 'inactive'];
const PRIORITIES = ['high', 'normal', 'low'];
const LEGACY_TYPES = ['motivation', 'info', 'alert'];

export const LIMITS = Object.freeze({ title: 160, label: 24, html: 20_000, message: 5_000, ctaLabel: 40, url: 1_000, alt: 160 });

/** The old three-value `type` (still read by older screens) for a category. */
export function legacyTypeFor(category) {
  if (['alert', 'deadline', 'exam'].includes(category)) return 'alert';
  if (['motivation', 'achievement'].includes(category)) return 'motivation';
  return 'info';
}

/** Category for an announcement saved before categories existed. */
export function categoryFor(announcement = {}) {
  if (ANNOUNCEMENT_CATEGORIES.includes(announcement.category)) return announcement.category;
  return { alert: 'alert', info: 'update', motivation: 'announcement' }[announcement.type] || 'announcement';
}

const SAFE_COLOR = [/^#[0-9a-f]{3,8}$/i, /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i];
const TEXT_TAGS = ['p', 'span', 'mark', 'h2', 'h3', 'h4', 'li', 'blockquote', 'div', 'strong', 'em', 'u', 's', 'b', 'i'];
const SANITIZE_OPTIONS = {
  allowedTags: ['h2', 'h3', 'h4', 'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'blockquote', 'span', 'mark', 'hr', 'div'],
  allowedAttributes: { a: ['href', 'target', 'rel'], ...Object.fromEntries(TEXT_TAGS.map((tag) => [tag, ['style']])) },
  allowedStyles: { '*': { color: SAFE_COLOR, 'background-color': SAFE_COLOR, 'text-align': [/^(left|right|center|justify)$/] } },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    // Links open in a new tab and never pass the page to the target.
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href || '#', target: '_blank', rel: 'noopener noreferrer nofollow' } }),
    // Editors produce <b>/<i>; store the semantic tags.
    b: 'strong', i: 'em',
  },
  // Empty wrappers left by editors.
  exclusiveFilter: (frame) => ['span', 'div', 'mark'].includes(frame.tag) && !frame.text.trim(),
};

/** Formatted announcement content, reduced to the safe tags and styles above. */
export function sanitizeAnnouncementHtml(value) {
  let html = String(value ?? '').trim();
  // Request bodies pass through xss-clean, which turns tags into &lt;p&gt;; restore them so
  // sanitize-html (the real gate) can keep the safe ones.
  if (/&lt;\s*\/?\s*(?:p|h[2-4]|span|strong|em|u|s|ul|ol|li|a|br|div|mark|blockquote|hr)\b/i.test(html)) {
    html = html.replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
  }
  return sanitizeHtml(html, SANITIZE_OPTIONS).trim();
}

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' };

/** Plain text of formatted content (bars, cards, notifications, search). */
export function announcementPlainText(html) {
  const withBreaks = String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|h[1-6]|li|div|blockquote)\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ');
  const text = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity] || entity);
  return text.split('\n').map((line) => line.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, LIMITS.message);
}

const has = (body, key) => Object.prototype.hasOwnProperty.call(body || {}, key);
const text = (value, max) => String(value ?? '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim().slice(0, max);

/** A link students may follow: http(s) or a path inside PeerPrep. */
export function safeLink(value) {
  const link = String(value ?? '').trim();
  if (!link) return '';
  if (link.length > LIMITS.url) throw new HttpError(400, 'The link is too long.');
  if (/^\/(?!\/)[^\s]*$/.test(link)) return link;
  if (/^https?:\/\/[^\s]+$/i.test(link)) return link;
  throw new HttpError(400, 'Links must start with https:// or be a PeerPrep page such as /student/dashboard.');
}

function safeImage(value) {
  const link = String(value ?? '').trim();
  if (!link) return '';
  if (link.length > LIMITS.url || !/^https:\/\/[^\s]+$/i.test(link)) throw new HttpError(400, 'Images must be an https:// link or an uploaded image.');
  return link;
}

function oneOf(value, allowed, label) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!allowed.includes(normalized)) throw new HttpError(400, `${label} must be one of: ${allowed.join(', ')}.`);
  return normalized;
}

/**
 * The fields to save from a create (all) or update (`partial`: only those present) request.
 * Formatted content (`messageHtml`) also sets the plain `message`; `category` also sets the legacy
 * `type`. Throws HttpError(400) with a message the admin can act on.
 */
export function announcementFields(body = {}, { partial = false } = {}) {
  const out = {};
  const want = (key) => !partial || has(body, key);

  if (want('title')) {
    out.title = text(body.title, LIMITS.title);
    if (!out.title) throw new HttpError(400, 'Title is required.');
  }
  if (want('messageHtml') && has(body, 'messageHtml')) {
    const html = sanitizeAnnouncementHtml(body.messageHtml);
    if (html.length > LIMITS.html) throw new HttpError(400, 'The message is too long. Shorten it or split it into two announcements.');
    out.messageHtml = html;
    out.message = announcementPlainText(html);
  } else if (want('message')) {
    out.message = text(body.message, LIMITS.message);
    out.messageHtml = '';
  }
  if ((!partial || has(body, 'message') || has(body, 'messageHtml')) && !out.message) throw new HttpError(400, 'Message is required.');

  if (want('category') && has(body, 'category')) {
    out.category = oneOf(body.category, ANNOUNCEMENT_CATEGORIES, 'Category');
    out.type = legacyTypeFor(out.category);
  } else if (want('type') && has(body, 'type')) {
    out.type = oneOf(body.type, LEGACY_TYPES, 'Type');
    out.category = categoryFor({ type: out.type });
  } else if (!partial) {
    out.category = 'announcement';
    out.type = 'info';
  }
  if (want('label')) out.label = text(body.label, LIMITS.label);
  if (want('design')) out.design = has(body, 'design') ? oneOf(body.design, ANNOUNCEMENT_DESIGNS, 'Design') : 'classic';
  if (want('theme')) out.theme = has(body, 'theme') ? oneOf(body.theme, ANNOUNCEMENT_THEMES, 'Colour') : 'sky';
  if (want('status')) out.status = has(body, 'status') ? oneOf(body.status, STATUSES, 'Status') : 'inactive';
  if (want('priority')) out.priority = has(body, 'priority') ? oneOf(body.priority, PRIORITIES, 'Priority') : 'normal';
  if (want('imageUrl')) out.imageUrl = safeImage(body.imageUrl);
  if (want('imageAlt')) out.imageAlt = text(body.imageAlt, LIMITS.alt);
  if (want('ctaLabel') || want('ctaUrl')) {
    const label = text(body.ctaLabel, LIMITS.ctaLabel);
    const url = safeLink(body.ctaUrl);
    if (Boolean(label) !== Boolean(url)) throw new HttpError(400, 'A button needs both a label and a link (or neither).');
    out.ctaLabel = label;
    out.ctaUrl = url;
  }
  return out;
}
