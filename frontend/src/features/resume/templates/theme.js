// Template design tokens. Every number is in PDF points (1pt = 4/3 CSS px);
// the HTML renderer converts them, so a template is described exactly once.

export const PAGE_WIDTH_PT = 595.28;
export const PAGE_HEIGHT_PT = 841.89;
export const PT_TO_PX = 96 / 72;
export const PAGE_WIDTH_PX = PAGE_WIDTH_PT * PT_TO_PX;
export const PAGE_HEIGHT_PX = PAGE_HEIGHT_PT * PT_TO_PX;

export const ATS_MAX_TRACKING = 0.035; // em

export const THEME_DEFAULTS = {
  layout: 'single', // single | sidebar-left | sidebar-right
  fonts: { heading: 'inter', body: 'inter', title: null },
  size: { base: 10, small: 8.8, lineHeight: 1.3 },
  colors: { text: '#1c1f24', muted: '#59606b', accent: '#1f4e79', rule: '#c8cdd4', titleBg: '#e6e6e6', page: '#ffffff', link: 'text', chipBg: '#eef1f5', chipText: 'text' },
  page: { padH: 40, padTop: 36, padBottom: 34 },
  stripe: null, // { color, height } band at the top of every page
  header: {
    place: 'main', // main | banner | side
    align: 'left', // left | center | split
    contact: 'inline', // inline | labeled | icons | stacked | stacked-icons
    separator: '  |  ',
    nameSize: 22, nameWeight: 700, nameCase: 'none', nameSpacing: 0, nameColor: 'text', nameFont: 'heading', nameLineHeight: 1.12,
    headlineSize: 10.5, headlineItalic: false, headlineWeight: 400, headlineColor: 'accent', headlineCase: 'none', headlineSpacing: 0,
    contactSize: 9, contactColor: 'muted', iconColor: 'accent', linkUnderline: false,
    rule: 'none', ruleColor: 'rule', // none | thin | thick | double
    gapAfter: 8,
    bannerBg: 'accent', bannerText: '#ffffff', bannerMuted: '#e2e8f0', bannerPadV: 22, bannerAccent: '#ffffff',
  },
  title: {
    variant: 'underline', // bar | underline | line-after | left-bar | center-rule | plain | short-underline | pill | double-rule | overline | boxed | prompt | center
    case: 'upper', size: 10.5, weight: 700, spacing: 0.6, color: 'accent', font: 'heading', italic: false,
    rule: 'accent', ruleWidth: 0.8, gapBefore: 11, gapAfter: 4, prefix: '',
  },
  entry: {
    variant: 'standard', // standard | harvard | date-below
    gap: 6, titleWeight: 700, titleColor: 'text', titleSize: null,
    subtitleItalic: true, subtitleColor: 'text', subtitleWeight: 400,
    dateColor: 'muted', dateItalic: false, dateWeight: 400, locationColor: 'muted', locationItalic: false,
    tech: 'line', // line | inline | muted
    techLabel: 'Tech: ',
  },
  bullet: { kind: 'disc', indent: 11, markerColor: 'text', gap: 1.6, leftPad: 4 },
  education: 'stacked', // table | stacked | entry
  skills: 'lines', // bullets | lines | table | tags | inline
  rail: null, // { kind: label | date | timeline, width }
  side: null,
};

const SIDE_DEFAULTS = {
  width: 182,
  padH: 18,
  padTop: 32,
  padBottom: 30,
  bg: '#f2f4f7',
  text: '#1c1f24',
  muted: '#5b6470',
  accent: '#1f4e79',
  rule: '#cfd5dd',
  chipBg: '#ffffff',
  chipText: '#1c1f24',
  sections: ['skills', 'education'],
  customPattern: '',
  skills: 'stack', // stack | tags
  title: {},
};

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function mergeDeep(base, extra) {
  if (!isObject(extra)) return base;
  const out = { ...base };
  Object.entries(extra).forEach(([key, value]) => {
    out[key] = isObject(value) && isObject(base?.[key]) ? mergeDeep(base[key], value) : value;
  });
  return out;
}

/** Full token set for a catalog entry. */
export function resolveTheme(template) {
  const theme = mergeDeep(THEME_DEFAULTS, template?.tokens || {});
  if (theme.layout !== 'single') {
    theme.side = mergeDeep(SIDE_DEFAULTS, template?.tokens?.side || {});
    theme.side.title = mergeDeep(theme.title, theme.side.title || {});
  } else {
    theme.side = null;
  }
  if (theme.header.place === 'side' && !theme.side) theme.header.place = 'main';
  theme.fonts.title = theme.fonts.title || theme.fonts.heading;
  if (template?.ats) {
    // Tracking wider than ~0.04em makes PDF text extract as "E X P E R I E N C E",
    // which ATS parsers cannot read as a heading. ATS-friendly templates stay under it.
    const clamp = (spacing, size) => Math.min(spacing || 0, size * ATS_MAX_TRACKING);
    theme.title.spacing = clamp(theme.title.spacing, theme.title.size);
    theme.header.nameSpacing = clamp(theme.header.nameSpacing, theme.header.nameSize);
    theme.header.headlineSpacing = clamp(theme.header.headlineSpacing, theme.header.headlineSize);
    // Drawn contact icons are read as table rules by PDF parsers: plain text instead.
    if (theme.header.contact === 'icons') theme.header.contact = 'inline';
    if (theme.header.contact === 'stacked-icons') theme.header.contact = 'stacked';
  }
  return theme;
}

/** Palette for a column. `ref` may be a palette key or a literal colour. */
export function paletteFor(theme, column = 'main') {
  if (column === 'side' && theme.side) {
    const { side } = theme;
    return { ...theme.colors, text: side.text, muted: side.muted, accent: side.accent, rule: side.rule, chipBg: side.chipBg, chipText: side.chipText, link: side.text, titleBg: side.titleBg || theme.colors.titleBg };
  }
  return theme.colors;
}

export function color(palette, ref) {
  if (!ref) return undefined;
  const value = palette[ref];
  if (value && value !== ref && palette[value]) return palette[value];
  return value || ref;
}

/** Top padding of a column on a page. Banner templates sit closer to the band on page 1 only. */
export function columnPadTop(theme, column, pageIndex = 0) {
  const base = column === 'side' && theme.side ? theme.side.padTop : theme.page.padTop;
  return theme.header.place === 'banner' && pageIndex > 0 ? Math.max(base, 32) : base;
}

export const columnPadBottom = (theme, column) => (column === 'side' && theme.side ? theme.side.padBottom : theme.page.padBottom);

/** Usable column heights in CSS px for page `pageIndex`. */
export function columnGeometry(theme, column, { pageIndex = 0, bannerHeightPx = 0 } = {}) {
  const stripe = theme.stripe?.height || 0;
  const used = (stripe + columnPadTop(theme, column, pageIndex) + columnPadBottom(theme, column)) * PT_TO_PX
    + (pageIndex === 0 ? bannerHeightPx : 0);
  return PAGE_HEIGHT_PX - used;
}

export const columnOrder = (theme) => (theme.layout === 'sidebar-left' ? ['side', 'main'] : theme.layout === 'sidebar-right' ? ['main', 'side'] : ['main']);

export function applyCase(text, mode) {
  const value = String(text || '');
  if (mode === 'upper') return value.toUpperCase();
  if (mode === 'lower') return value.toLowerCase();
  if (mode === 'title') return value.toLowerCase().replace(/(^|[\s/&(-])(\S)/g, (match, lead, letter) => `${lead}${letter.toUpperCase()}`);
  return value;
}
