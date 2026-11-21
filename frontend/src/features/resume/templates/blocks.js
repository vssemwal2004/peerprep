// Turns a resume + theme into flat, measurable blocks per column. Pages are
// made by packing these blocks, so an entry can continue on the next page
// between bullets instead of being cut or dropped.
import { displayLink, getSectionData, getSectionTitle, isDetailEntryMeaningful, visibleSectionKeys } from '../resumeUtils';

// Some bundled font subsets carry broken glyphs for exotic space characters
// (thin/en/zero-width spaces, NBSP in Zilla Slab) that crash the PDF engine,
// and ₹ is outside every subset. Text is normalised once for both renderers.
const chars = (...codes) => codes.map((code) => (Array.isArray(code)
  ? `${String.fromCodePoint(code[0])}-${String.fromCodePoint(code[1])}`
  : String.fromCodePoint(code))).join('');
// NBSP, U+2000-200A, narrow NBSP, medium math space, ideographic space -> space
const ODD_SPACES = new RegExp(`[${chars(0xa0, [0x2000, 0x200a], 0x202f, 0x205f, 0x3000)}]`, 'g');
// zero-width space/joiners, word joiner, BOM, soft hyphen -> removed
const INVISIBLE = new RegExp(`[${chars([0x200b, 0x200d], 0x2060, 0xfeff, 0xad)}]`, 'g');
const RUPEE = new RegExp(`${chars(0x20b9)}\\s?`, 'g');
const sanitizeText = (value) => String(value)
  .replace(ODD_SPACES, ' ')
  .replace(INVISIBLE, '')
  .replace(RUPEE, 'Rs. ');

export function sanitizeResume(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeResume);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeResume(item)]));
  return value;
}

const CONTACT_KEYS = ['location', 'email', 'mobile', 'linkedin', 'github', 'portfolio'];
const CONTACT_LABELS = { location: '', email: 'Email', mobile: 'Mobile', linkedin: 'LinkedIn', github: 'GitHub', portfolio: 'Portfolio' };

export function contactItems(resume) {
  const basics = resume.basics || {};
  const visibility = resume.basicsVisibility || {};
  return CONTACT_KEYS
    .filter((key) => String(basics[key] || '').trim() && visibility[key] !== false)
    .map((key) => {
      const raw = String(basics[key]).trim();
      const isLink = ['linkedin', 'github', 'portfolio'].includes(key);
      return {
        key,
        label: CONTACT_LABELS[key],
        value: isLink ? displayLink(raw) : raw,
        href: key === 'email' ? `mailto:${raw}` : key === 'mobile' ? `tel:${raw.replace(/[^+\d]/g, '')}` : isLink ? raw : '',
      };
    });
}

export const hasHeaderContent = (resume) => Boolean(String(resume.basics?.name || '').trim() || String(resume.basics?.headline || '').trim() || contactItems(resume).length);

const isCompactList = (resume, key) => key.startsWith('custom:') && /certificat/i.test(getSectionTitle(resume, key));

function sideMatches(theme, resume, key) {
  const side = theme.side;
  if (!side) return false;
  if (side.sections.includes(key)) return true;
  if (key.startsWith('custom:') && side.customPattern) {
    return new RegExp(side.customPattern, 'i').test(getSectionTitle(resume, key));
  }
  return false;
}

function sectionBlocks(resume, key, theme, column) {
  const blocks = [];
  const title = getSectionTitle(resume, key);
  const railLabel = column === 'main' && theme.rail?.kind === 'label';
  if (!railLabel) blocks.push({ id: `${key}|title`, kind: 'title', section: key, title, keepWithNext: true });
  const content = [];
  const entries = getSectionData(resume, key);

  if (key === 'education') {
    const rows = entries.filter((entry) => entry.year || entry.degree || entry.institute || entry.score);
    const variant = column === 'side' ? 'compact' : theme.education;
    if (variant === 'table') content.push({ id: `${key}|edu-head`, kind: 'eduHead', section: key, keepWithNext: true });
    rows.forEach((entry, index) => content.push({ id: `${key}|edu|${index}`, kind: 'edu', variant, section: key, entry, index, last: index === rows.length - 1 }));
  } else if (key === 'skills') {
    const groups = entries.filter((entry) => entry.category || entry.skills);
    const variant = column === 'side' ? theme.side.skills : theme.skills;
    groups.forEach((entry, index) => content.push({ id: `${key}|skill|${index}`, kind: 'skill', variant, section: key, entry, index }));
  } else if (isCompactList(resume, key)) {
    entries.filter(isDetailEntryMeaningful).forEach((entry, index) => content.push({ id: `${key}|compact|${index}`, kind: 'compact', section: key, entry, index }));
  } else {
    const custom = key.startsWith('custom:');
    entries.filter(isDetailEntryMeaningful).forEach((entry, index) => {
      const bullets = (entry.bullets || []).map((bullet) => String(bullet?.text ?? bullet ?? '')).filter((text) => text.trim());
      content.push({ id: `${key}|entry|${index}`, kind: 'entry', section: key, entry, index, custom, keepWithNext: bullets.length > 0 });
      bullets.forEach((text, bulletIndex) => content.push({ id: `${key}|bullet|${index}|${bulletIndex}`, kind: 'bullet', section: key, text, index, bulletIndex, last: bulletIndex === bullets.length - 1 }));
    });
  }

  content.forEach((block, index) => {
    block.firstInSection = index === 0;
    block.column = column;
  });
  if (railLabel && content[0]) content[0].railLabel = title;
  return [...blocks.map((block) => ({ ...block, column })), ...content];
}

/**
 * { resume, banner, columns: { main: Block[], side: Block[] } }
 * `resume` is the sanitised copy every renderer must draw from.
 * banner is the header when it spans the page above the columns.
 */
export function buildLayout(rawResume, theme) {
  const resume = sanitizeResume(rawResume);
  const columns = { main: [], side: [] };
  let banner = null;
  if (hasHeaderContent(resume)) {
    const header = { id: 'header', kind: 'header' };
    if (theme.header.place === 'banner') banner = header;
    else if (theme.header.place === 'side' && theme.side) columns.side.push({ ...header, column: 'side' });
    else columns.main.push({ ...header, column: 'main' });
  }
  visibleSectionKeys(resume).forEach((key) => {
    const column = sideMatches(theme, resume, key) ? 'side' : 'main';
    columns[column].push(...sectionBlocks(resume, key, theme, column));
  });
  // The first block of a column needs no space above it.
  Object.values(columns).forEach((blocks) => { if (blocks[0]) blocks[0].firstInColumn = true; });
  return { resume, banner, columns };
}

/** Everything on one page per column: used before measuring and for thumbnails. */
export function singlePageLayout(layout) {
  return [{ main: layout.columns.main.map((block) => block.id), side: layout.columns.side.map((block) => block.id) }];
}
