// Prep Resume template catalog. Each entry only describes design tokens; the
// student's content is never stored per template, so switching keeps it all.
// Keep ids in sync with backend/src/constants/resumeTemplates.js (a test checks).
import { resolveTheme } from './theme';

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All templates' },
  { id: 'ats', label: 'ATS-friendly' },
  { id: 'classic', label: 'Classic' },
  { id: 'modern', label: 'Modern' },
  { id: 'two-column', label: 'Two-column' },
  { id: 'executive', label: 'Executive' },
  { id: 'tech', label: 'Tech' },
  { id: 'academic', label: 'Academic' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'creative', label: 'Creative' },
];

const T = (id, name, category, tagline, bestFor, tokens, extra = {}) => ({
  id, name, category, tagline, bestFor, tokens,
  ats: extra.ats ?? true,
  categories: [category, ...(extra.also || [])],
});

export const RESUME_TEMPLATE_CATALOG = [
  // ───────────── Classic / ATS one-column ─────────────
  T('iit-bombay-classic', 'Atlas', 'academic', 'Institute format with shaded section bars, labelled contacts and an education table.', 'Campus placements, institute portals', {
    fonts: { heading: 'termes', body: 'termes' },
    size: { base: 10, small: 9, lineHeight: 1.16 },
    colors: { text: '#000000', muted: '#000000', accent: '#000000', rule: '#333333', titleBg: '#dedede' },
    page: { padH: 31.5, padTop: 31.5, padBottom: 30 },
    header: { contact: 'labeled', nameSize: 14.4, nameCase: 'upper', headlineSize: 10, headlineItalic: true, headlineColor: 'text', contactSize: 10, contactColor: 'text', gapAfter: 3, nameLineHeight: 1.1 },
    title: { variant: 'bar', size: 8.4, spacing: 0, color: 'text', gapBefore: 9, gapAfter: 2 },
    entry: { gap: 4.5, dateItalic: true, dateWeight: 700, dateColor: 'text', locationColor: 'text' },
    // Filled bullets: PDF parsers read small filled shapes as "•" (hollow ones they skip).
    bullet: { kind: 'disc', indent: 10, gap: 1.4, leftPad: 5 },
    education: 'table',
    skills: 'bullets',
  }, { also: ['classic'] }),

  T('ledger', 'Ledger', 'classic', 'The LaTeX-style one-pager engineering recruiters know: centered name, ruled headings.', 'Software and core engineering roles', {
    fonts: { heading: 'source-serif-4', body: 'source-serif-4' },
    size: { base: 10.2, lineHeight: 1.22 },
    colors: { text: '#111111', muted: '#111111', accent: '#111111', rule: '#111111' },
    page: { padH: 36, padTop: 30, padBottom: 30 },
    header: { align: 'center', nameSize: 24, contactSize: 9.6, contactColor: 'text', linkUnderline: true, gapAfter: 4 },
    title: { variant: 'underline', case: 'upper', size: 10.6, spacing: 0.4, weight: 400, color: 'text', rule: 'text', ruleWidth: 0.6, gapBefore: 9, gapAfter: 3 },
    entry: { gap: 4.5, dateColor: 'text', locationItalic: true, locationColor: 'text', tech: 'inline' },
    bullet: { kind: 'disc', indent: 10, leftPad: 12 },
    education: 'stacked',
    skills: 'lines',
  }),

  T('harvard', 'Harvard', 'classic', 'Career-office classic: bold organisations, italic roles, no colour at all.', 'Any role, conservative recruiters', {
    fonts: { heading: 'termes', body: 'termes' },
    size: { base: 10.8, lineHeight: 1.18 },
    colors: { text: '#000000', muted: '#000000', accent: '#000000', rule: '#000000' },
    page: { padH: 42, padTop: 36, padBottom: 34 },
    header: { align: 'center', nameSize: 17, contact: 'inline', separator: '  •  ', contactSize: 10, contactColor: 'text', headlineColor: 'text', headlineItalic: true, gapAfter: 6 },
    title: { variant: 'underline', size: 10.8, spacing: 0, color: 'text', rule: 'text', ruleWidth: 0.6, gapBefore: 10, gapAfter: 4 },
    entry: { variant: 'harvard', dateColor: 'text', locationColor: 'text', gap: 6 },
    bullet: { kind: 'disc', indent: 10, leftPad: 8 },
    education: 'stacked',
    skills: 'lines',
  }),

  T('compact-pro', 'Compact Pro', 'classic', 'Dense tinted bars that fit a lot of experience on one page.', 'Long project lists, experienced interns', {
    fonts: { heading: 'fira-sans', body: 'fira-sans' },
    size: { base: 9.2, lineHeight: 1.28 },
    colors: { text: '#1f2937', muted: '#4b5563', accent: '#1e40af', rule: '#c7d2fe', titleBg: '#e8eefb' },
    page: { padH: 30, padTop: 28, padBottom: 26 },
    header: { nameSize: 20, contactSize: 8.8, headlineSize: 9.6, gapAfter: 4 },
    title: { variant: 'bar', size: 9, spacing: 1, color: 'accent', gapBefore: 8, gapAfter: 3 },
    entry: { gap: 4, tech: 'inline' },
    bullet: { kind: 'disc', indent: 9, gap: 1.1, leftPad: 4 },
    education: 'table',
    skills: 'table',
  }),

  T('campus', 'Campus', 'classic', 'Centered fresher resume with ruled headings and evenly spaced sections.', 'Freshers and first internships', {
    fonts: { heading: 'open-sans', body: 'open-sans' },
    size: { base: 9.6, lineHeight: 1.32 },
    colors: { text: '#1f2933', muted: '#52606d', accent: '#0b5cad', rule: '#9fb3c8' },
    header: { align: 'center', contact: 'icons', nameSize: 23, headlineSize: 10.2, gapAfter: 6 },
    title: { variant: 'center', size: 10, spacing: 2, gapBefore: 12, gapAfter: 5 },
    entry: { tech: 'muted' },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'table',
  }),

  // ───────────── Minimal ─────────────
  T('peerprep-nova', 'Nova', 'minimal', 'Airy single column with quiet grey labels and generous white space.', 'Product, design-adjacent and tech roles', {
    fonts: { heading: 'inter', body: 'inter' },
    size: { base: 9.4, lineHeight: 1.42 },
    colors: { text: '#111827', muted: '#6b7280', accent: '#111827', rule: '#e5e7eb' },
    page: { padH: 44, padTop: 40, padBottom: 36 },
    header: { nameSize: 26, nameSpacing: -0.4, headlineColor: 'muted', headlineSize: 11, separator: '   ·   ', gapAfter: 8 },
    title: { variant: 'line-after', size: 8, spacing: 1.8, color: 'muted', rule: 'rule', gapBefore: 14, gapAfter: 6 },
    entry: { gap: 8, subtitleColor: 'muted', tech: 'muted' },
    bullet: { kind: 'dash', indent: 11, markerColor: 'muted' },
    education: 'stacked',
    skills: 'table',
  }, { also: ['modern'] }),

  T('pristine', 'Pristine', 'minimal', 'No rules, no boxes: spaced capitals and clean hierarchy only.', 'Analyst, consulting and business roles', {
    fonts: { heading: 'source-sans-3', body: 'source-sans-3' },
    size: { base: 10.2, lineHeight: 1.36 },
    colors: { text: '#1e293b', muted: '#64748b', accent: '#334155' },
    page: { padH: 48, padTop: 42, padBottom: 38 },
    header: { nameSize: 28, nameWeight: 400, nameSpacing: 0.5, headlineColor: 'muted', separator: '   /   ', gapAfter: 10 },
    title: { variant: 'plain', size: 8.6, spacing: 2.4, color: 'accent', gapBefore: 15, gapAfter: 5 },
    entry: { variant: 'date-below', gap: 8 },
    bullet: { kind: 'dash', markerColor: 'muted' },
    education: 'entry',
    skills: 'lines',
  }),

  T('lexicon', 'Lexicon', 'minimal', 'Section names sit in a left margin column, like a well-set book.', 'Writers, researchers, generalists', {
    fonts: { heading: 'lora', body: 'lora' },
    size: { base: 9.8, lineHeight: 1.34 },
    colors: { text: '#1c1917', muted: '#78716c', accent: '#57534e', rule: '#d6d3d1' },
    page: { padH: 40, padTop: 38, padBottom: 34 },
    header: { nameSize: 25, headlineItalic: true, headlineColor: 'muted', rule: 'thin', gapAfter: 4 },
    title: { variant: 'plain', case: 'upper', size: 7.6, spacing: 1.1, color: 'accent', gapBefore: 12, gapAfter: 0 },
    entry: { gap: 6 },
    bullet: { kind: 'dash', markerColor: 'muted' },
    rail: { kind: 'label', width: 108 },
    education: 'stacked',
    skills: 'lines',
  }, { ats: false }),

  // ───────────── Modern one-column ─────────────
  T('oxford', 'Oxford', 'modern', 'Navy serif headline, accent rule and square bullets.', 'Management trainee, consulting, finance', {
    fonts: { heading: 'lora', body: 'lora' },
    size: { base: 9.8, lineHeight: 1.3 },
    colors: { text: '#1f2937', muted: '#4b5563', accent: '#1e3a5f', rule: '#1e3a5f' },
    header: { nameSize: 27, nameColor: 'accent', headlineItalic: true, headlineColor: 'muted', rule: 'thick', ruleColor: 'accent', gapAfter: 4 },
    title: { variant: 'short-underline', size: 9.6, spacing: 1.2, gapBefore: 12, gapAfter: 5 },
    entry: { dateColor: 'accent', dateItalic: true },
    bullet: { kind: 'square', markerColor: 'accent' },
    education: 'stacked',
    skills: 'table',
  }, { also: ['executive'] }),

  T('boston', 'Boston', 'modern', 'Split header with contacts on the right and teal section rules.', 'Software, data and analytics roles', {
    fonts: { heading: 'lato', body: 'lato' },
    size: { base: 9.8, lineHeight: 1.3 },
    colors: { text: '#1f2937', muted: '#4b5563', accent: '#0e7490', rule: '#0e7490' },
    header: { align: 'split', contact: 'stacked-icons', nameSize: 26, headlineSize: 11, gapAfter: 6, rule: 'thin', ruleColor: 'rule' },
    title: { variant: 'underline', size: 10, spacing: 1, gapBefore: 11 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'lines',
  }),

  T('metro', 'Metro', 'modern', 'Bold accent bars beside headings and skill tags.', 'Developers and product engineers', {
    fonts: { heading: 'roboto', body: 'roboto' },
    size: { base: 9.6, lineHeight: 1.32 },
    colors: { text: '#111827', muted: '#4b5563', accent: '#2563eb', rule: '#dbeafe', chipBg: '#eff6ff', chipText: '#1e3a8a' },
    header: { contact: 'icons', nameSize: 25, gapAfter: 6 },
    title: { variant: 'left-bar', size: 10.4, color: 'text', spacing: 0.8, gapBefore: 12, gapAfter: 5 },
    entry: { variant: 'date-below', subtitleColor: 'accent', subtitleItalic: false, subtitleWeight: 700 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'entry',
    skills: 'tags',
  }, { ats: false, also: ['tech'] }),

  T('summit', 'Summit', 'modern', 'Merriweather headings with lines that run to the margin.', 'Core engineering, operations, research', {
    fonts: { heading: 'merriweather', body: 'open-sans' },
    size: { base: 9.4, lineHeight: 1.34 },
    colors: { text: '#1c2b22', muted: '#4d5b52', accent: '#14532d', rule: '#9cb8a5' },
    header: { align: 'center', nameSize: 23, separator: '   ·   ', gapAfter: 8 },
    title: { variant: 'line-after', case: 'title', size: 10.6, spacing: 0, rule: 'rule', gapBefore: 12, gapAfter: 5 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'table',
  }, { also: ['executive'] }),

  T('precision', 'Precision', 'modern', 'Plex type, double-ruled headings and a split header.', 'Data science, ML and quantitative roles', {
    fonts: { heading: 'ibm-plex-sans', body: 'ibm-plex-sans' },
    size: { base: 9.4, lineHeight: 1.3 },
    colors: { text: '#161616', muted: '#525252', accent: '#161616', rule: '#8d8d8d' },
    header: { align: 'split', contact: 'stacked', nameSize: 24, headlineColor: 'muted', gapAfter: 6 },
    title: { variant: 'double-rule', size: 8.8, spacing: 2, color: 'text', rule: 'text', ruleWidth: 0.6, gapBefore: 12, gapAfter: 5 },
    entry: { tech: 'muted' },
    bullet: { kind: 'square', indent: 10 },
    education: 'stacked',
    skills: 'table',
  }, { also: ['tech'] }),

  T('mosaic', 'Mosaic', 'modern', 'Outlined heading boxes, Playfair name and skill tags.', 'Marketing, product and client-facing tech', {
    fonts: { heading: 'playfair-display', body: 'roboto', title: 'roboto' },
    size: { base: 9.5, lineHeight: 1.32 },
    colors: { text: '#1e1b4b', muted: '#4b4870', accent: '#4338ca', rule: '#4338ca', chipBg: '#eef2ff', chipText: '#3730a3' },
    header: { nameSize: 30, nameColor: 'accent', headlineColor: 'muted', contact: 'icons', gapAfter: 8 },
    title: { variant: 'boxed', size: 9, spacing: 1.6, gapBefore: 12, gapAfter: 6 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'tags',
  }, { also: ['creative'], ats: false }),

  // ───────────── Banner headers ─────────────
  T('horizon', 'Horizon', 'modern', 'Navy header band with white type over a clean body.', 'Software engineering and IT services', {
    fonts: { heading: 'inter', body: 'inter' },
    size: { base: 9.5, lineHeight: 1.33 },
    colors: { text: '#0f172a', muted: '#475569', accent: '#1e3a5f', rule: '#cbd5e1', chipBg: '#e2e8f0', chipText: '#1e3a5f' },
    page: { padTop: 22 },
    header: { place: 'banner', contact: 'icons', nameSize: 26, headlineColor: '#cbd5e1', bannerBg: '#1e3a5f', bannerMuted: '#dbe4ee', iconColor: '#9fb6d1', bannerPadV: 24 },
    title: { variant: 'underline', size: 10, spacing: 1.2, rule: 'rule', gapBefore: 12 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'tags',
  }, { ats: false }),

  T('aurora', 'Aurora', 'creative', 'Teal centered band, Montserrat capitals and pill headings.', 'Startups, design-minded tech roles', {
    fonts: { heading: 'montserrat', body: 'lato' },
    size: { base: 9.6, lineHeight: 1.34 },
    colors: { text: '#134e4a', muted: '#3f6b67', accent: '#0f766e', rule: '#99f6e4', chipBg: '#ccfbf1', chipText: '#115e59' },
    page: { padTop: 20 },
    header: { place: 'banner', align: 'center', contact: 'inline', separator: '   •   ', nameSize: 24, nameCase: 'upper', nameSpacing: 3, headlineCase: 'upper', headlineSpacing: 2, headlineSize: 9, headlineColor: '#ccfbf1', bannerBg: '#0f766e', bannerMuted: '#e6fffa', bannerPadV: 22 },
    title: { variant: 'pill', size: 8.6, spacing: 1.6, gapBefore: 12, gapAfter: 6 },
    entry: { variant: 'date-below', subtitleColor: 'accent', subtitleItalic: false, subtitleWeight: 700 },
    bullet: { kind: 'chevron', markerColor: 'accent' },
    education: 'entry',
    skills: 'tags',
  }, { ats: false }),

  T('slate', 'Slate', 'modern', 'Charcoal band, spaced Raleway name, short accent underlines.', 'Consulting, analytics and leadership roles', {
    fonts: { heading: 'raleway', body: 'open-sans' },
    size: { base: 9.4, lineHeight: 1.34 },
    colors: { text: '#1f2937', muted: '#4b5563', accent: '#d97706', rule: '#e5e7eb' },
    page: { padTop: 22 },
    header: { place: 'banner', align: 'left', contact: 'inline', separator: '   |   ', nameSize: 25, nameCase: 'upper', nameSpacing: 4, headlineColor: '#fbbf24', headlineCase: 'upper', headlineSpacing: 1.6, headlineSize: 9, bannerBg: '#1f2937', bannerMuted: '#e5e7eb', bannerPadV: 24 },
    title: { variant: 'short-underline', size: 9.6, spacing: 2, color: 'text', rule: 'accent', gapBefore: 13, gapAfter: 6 },
    bullet: { kind: 'dash', markerColor: 'accent' },
    education: 'stacked',
    skills: 'table',
  }, { ats: false, also: ['executive'] }),

  T('pulse', 'Pulse', 'creative', 'Violet top stripe, overlined headings and confident type.', 'Product, growth and creative-tech roles', {
    fonts: { heading: 'work-sans', body: 'work-sans' },
    size: { base: 9.4, lineHeight: 1.34 },
    colors: { text: '#1e1b2e', muted: '#5b5670', accent: '#6d28d9', rule: '#6d28d9', chipBg: '#f3e8ff', chipText: '#5b21b6' },
    stripe: { color: 'accent', height: 7 },
    header: { nameSize: 29, headlineColor: 'accent', headlineWeight: 700, contact: 'icons', gapAfter: 6 },
    title: { variant: 'overline', size: 9.6, spacing: 1.4, ruleWidth: 1.6, gapBefore: 12, gapAfter: 5 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'tags',
  }, { ats: false }),

  T('timeline', 'Timeline', 'creative', 'Experience on a vertical timeline with dots for each role.', 'Showing growth across roles and projects', {
    fonts: { heading: 'nunito-sans', body: 'nunito-sans' },
    size: { base: 9.6, lineHeight: 1.34 },
    colors: { text: '#1e1b4b', muted: '#575a7b', accent: '#4f46e5', rule: '#c7d2fe' },
    header: { align: 'center', contact: 'icons', nameSize: 26, gapAfter: 8 },
    title: { variant: 'plain', size: 10.4, spacing: 1.4, gapBefore: 12, gapAfter: 5 },
    entry: { dateColor: 'accent' },
    bullet: { kind: 'disc', markerColor: 'accent' },
    rail: { kind: 'timeline', width: 16 },
    education: 'stacked',
    skills: 'table',
  }, { ats: false }),

  T('editorial', 'Editorial', 'creative', 'Slab-serif headlines with red rules, like a magazine page.', 'Communications, product and generalist roles', {
    fonts: { heading: 'zilla-slab', body: 'source-serif-4' },
    size: { base: 9.8, lineHeight: 1.3 },
    colors: { text: '#1c1917', muted: '#57534e', accent: '#b91c1c', rule: '#b91c1c' },
    header: { align: 'center', nameSize: 32, headlineItalic: true, headlineColor: 'muted', separator: '   /   ', rule: 'double', ruleColor: 'text', gapAfter: 4 },
    title: { variant: 'line-after', size: 11.5, spacing: 0.4, case: 'title', gapBefore: 11, gapAfter: 4 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    education: 'stacked',
    skills: 'lines',
  }),

  // ───────────── Executive ─────────────
  T('peerprep-meridian', 'Meridian', 'executive', 'Centered Garamond with spaced capitals and rules either side of each heading.', 'Management, consulting, senior roles', {
    fonts: { heading: 'eb-garamond', body: 'eb-garamond' },
    size: { base: 11, lineHeight: 1.18 },
    colors: { text: '#1a1a1a', muted: '#3d3d3d', accent: '#1a1a1a', rule: '#8a8a8a' },
    page: { padH: 44, padTop: 38, padBottom: 34 },
    header: { align: 'center', nameSize: 24, nameWeight: 400, nameCase: 'upper', nameSpacing: 3.5, separator: '   •   ', contactSize: 10, contactColor: 'text', headlineItalic: true, headlineColor: 'muted', gapAfter: 6 },
    title: { variant: 'center-rule', size: 10.4, weight: 400, spacing: 2.4, color: 'text', rule: 'rule', gapBefore: 11, gapAfter: 5 },
    entry: { variant: 'harvard', dateColor: 'text', dateItalic: true, locationColor: 'text' },
    bullet: { kind: 'disc', indent: 10, leftPad: 8 },
    education: 'stacked',
    skills: 'lines',
  }, { also: ['classic'] }),

  T('stanford', 'Stanford', 'executive', 'Cardinal-red margin labels with Garamond body text.', 'Research, policy and graduate applications', {
    fonts: { heading: 'eb-garamond', body: 'eb-garamond' },
    size: { base: 11, lineHeight: 1.2 },
    colors: { text: '#2e2d29', muted: '#5f574f', accent: '#8c1515', rule: '#c9c3bb' },
    page: { padH: 40, padTop: 36, padBottom: 34 },
    header: { nameSize: 26, nameColor: 'accent', headlineItalic: true, headlineColor: 'muted', rule: 'thin', contactColor: 'text', gapAfter: 4 },
    title: { variant: 'plain', size: 8.6, spacing: 0.9, gapBefore: 11, gapAfter: 0 },
    entry: { dateItalic: true },
    bullet: { kind: 'disc', indent: 10 },
    rail: { kind: 'label', width: 118 },
    education: 'stacked',
    skills: 'lines',
  }, { ats: false, also: ['academic'] }),

  // ───────────── Academic ─────────────
  T('scholar', 'Scholar', 'academic', 'Academic CV with dates in their own left column.', 'Research internships, MS/PhD applications', {
    fonts: { heading: 'termes', body: 'termes' },
    size: { base: 10.6, lineHeight: 1.2 },
    colors: { text: '#111111', muted: '#444444', accent: '#111111', rule: '#111111' },
    page: { padH: 42, padTop: 38, padBottom: 34 },
    header: { align: 'center', nameSize: 20, nameCase: 'upper', nameSpacing: 1.5, contactColor: 'text', separator: '  ·  ', headlineItalic: true, headlineColor: 'muted', gapAfter: 6 },
    title: { variant: 'underline', size: 10.6, spacing: 1, color: 'text', rule: 'text', ruleWidth: 0.5, gapBefore: 11, gapAfter: 4 },
    entry: { dateColor: 'muted' },
    bullet: { kind: 'disc', indent: 10 },
    rail: { kind: 'date', width: 76 },
    education: 'entry',
    skills: 'table',
  }, { ats: false }),

  T('cambridge', 'Cambridge', 'academic', 'Two-tone serif headings with tidy hanging indents.', 'Higher studies and research-heavy profiles', {
    fonts: { heading: 'source-serif-4', body: 'source-serif-4' },
    size: { base: 10, lineHeight: 1.28 },
    colors: { text: '#1d232a', muted: '#4a5561', accent: '#0f4c5c', rule: '#0f4c5c', titleBg: '#e5eff1' },
    header: { align: 'center', nameSize: 24, nameColor: 'accent', separator: '  |  ', gapAfter: 6, rule: 'thin', ruleColor: 'accent' },
    title: { variant: 'bar', size: 9.8, spacing: 1.2, color: 'accent', case: 'upper', gapBefore: 11, gapAfter: 4 },
    entry: { dateItalic: true },
    bullet: { kind: 'disc', indent: 10, markerColor: 'accent' },
    education: 'table',
    skills: 'table',
  }),

  // ───────────── Tech ─────────────
  T('peerprep-circuit', 'Circuit', 'tech', 'Compact engineering resume with monospace headings and teal accents.', 'SDE, backend and systems roles', {
    fonts: { heading: 'ibm-plex-sans', body: 'ibm-plex-sans', title: 'jetbrains-mono' },
    size: { base: 9.3, lineHeight: 1.3 },
    colors: { text: '#111827', muted: '#4b5563', accent: '#0f766e', rule: '#99d5cf' },
    page: { padH: 34, padTop: 32, padBottom: 30 },
    header: { contact: 'icons', nameSize: 23, headlineColor: 'accent', gapAfter: 6 },
    title: { variant: 'line-after', size: 9.4, spacing: 0.4, rule: 'rule', gapBefore: 11, gapAfter: 4 },
    entry: { tech: 'inline', gap: 5 },
    bullet: { kind: 'chevron', markerColor: 'accent', indent: 10 },
    education: 'stacked',
    skills: 'table',
  }),

  T('terminal', 'Terminal', 'tech', 'Developer resume with prompt-style monospace headings.', 'Developers, DevOps, open-source contributors', {
    fonts: { heading: 'jetbrains-mono', body: 'inter' },
    size: { base: 9.2, lineHeight: 1.34 },
    colors: { text: '#0f172a', muted: '#475569', accent: '#15803d', rule: '#bbf7d0', chipBg: '#f0fdf4', chipText: '#166534' },
    page: { padH: 36, padTop: 34, padBottom: 30 },
    header: { nameSize: 22, headlineColor: 'accent', headlineSize: 9.6, contact: 'icons', gapAfter: 6, rule: 'thin', ruleColor: 'rule' },
    title: { variant: 'prompt', prefix: '> ', case: 'lower', size: 10.4, spacing: 0, gapBefore: 12, gapAfter: 4 },
    entry: { tech: 'inline', dateColor: 'accent' },
    bullet: { kind: 'chevron', markerColor: 'accent' },
    education: 'stacked',
    skills: 'table',
  }, { ats: false }),

  T('kepler', 'Kepler', 'tech', 'Right-hand tech panel for skills, with a crisp Work Sans body.', 'Full-stack and cloud engineering', {
    layout: 'sidebar-right',
    fonts: { heading: 'work-sans', body: 'work-sans' },
    size: { base: 9.2, lineHeight: 1.32 },
    colors: { text: '#0f172a', muted: '#475569', accent: '#0369a1', rule: '#bae6fd' },
    stripe: { color: 'accent', height: 5 },
    page: { padH: 28, padTop: 30, padBottom: 28 },
    header: { contact: 'stacked-icons', nameSize: 24, gapAfter: 8 },
    title: { variant: 'underline', size: 9.6, spacing: 1.2, rule: 'rule', gapBefore: 11 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    side: { width: 172, bg: '#f0f9ff', accent: '#0369a1', rule: '#bae6fd', chipBg: '#ffffff', chipText: '#0c4a6e', sections: ['skills', 'education', 'achievements'], customPattern: 'certif|language|interest|hobb', skills: 'tags', padTop: 30, title: { variant: 'underline', size: 9, rule: 'rule' } },
  }, { ats: false, also: ['two-column'] }),

  // ───────────── Two-column (sidebars) ─────────────
  T('navigator', 'Navigator', 'two-column', 'Dark navy sidebar holding your name, contacts, skills and education.', 'Software and IT roles with strong skills', {
    layout: 'sidebar-left',
    fonts: { heading: 'lora', body: 'inter' },
    size: { base: 9.3, lineHeight: 1.34 },
    colors: { text: '#0f172a', muted: '#475569', accent: '#1e3a8a', rule: '#cbd5e1' },
    page: { padH: 26, padTop: 32, padBottom: 28 },
    header: { place: 'side', contact: 'stacked-icons', nameSize: 21, nameColor: '#ffffff', headlineColor: '#93c5fd', contactColor: '#cbd5e1', iconColor: '#93c5fd', gapAfter: 6, contactSize: 8.4 },
    title: { variant: 'underline', size: 10, spacing: 1.2, rule: 'rule', gapBefore: 12 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    side: { width: 180, bg: '#1e293b', text: '#f1f5f9', muted: '#cbd5e1', accent: '#93c5fd', rule: '#475569', chipBg: '#334155', chipText: '#f1f5f9', sections: ['skills', 'education'], customPattern: 'certif|language|interest|hobb', skills: 'tags', title: { variant: 'underline', size: 9, color: 'accent', rule: 'rule' } },
  }, { ats: false }),

  T('cascade', 'Cascade', 'two-column', 'Soft blue sidebar for skills and education beside a clean main column.', 'Freshers with projects and internships', {
    layout: 'sidebar-left',
    fonts: { heading: 'lato', body: 'lato' },
    size: { base: 9.4, lineHeight: 1.34 },
    colors: { text: '#1e293b', muted: '#475569', accent: '#1d4ed8', rule: '#bfdbfe' },
    page: { padH: 26, padTop: 32, padBottom: 28 },
    header: { contact: 'icons', nameSize: 27, gapAfter: 8 },
    title: { variant: 'left-bar', size: 10, color: 'text', spacing: 1, gapBefore: 12, gapAfter: 5 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    side: { width: 170, bg: '#eff6ff', accent: '#1d4ed8', rule: '#bfdbfe', chipBg: '#ffffff', chipText: '#1e3a8a', sections: ['skills', 'education', 'achievements'], customPattern: 'certif|language', skills: 'stack', title: { variant: 'plain', size: 9, spacing: 1.6 } },
  }, { ats: false }),

  T('regent', 'Regent', 'executive', 'Grey right-hand panel and Merriweather headings for a senior feel.', 'Leadership roles, MBA and management applications', {
    layout: 'sidebar-right',
    fonts: { heading: 'merriweather', body: 'source-sans-3' },
    size: { base: 9.8, lineHeight: 1.32 },
    colors: { text: '#1f2933', muted: '#52606d', accent: '#7c2d12', rule: '#d9cfc7' },
    page: { padH: 30, padTop: 34, padBottom: 30 },
    header: { nameSize: 24, headlineColor: 'accent', headlineItalic: true, contact: 'inline', separator: '  ·  ', rule: 'thick', ruleColor: 'accent', gapAfter: 4 },
    title: { variant: 'plain', size: 10.2, spacing: 1, gapBefore: 12, gapAfter: 4 },
    bullet: { kind: 'square', markerColor: 'accent' },
    side: { width: 168, bg: '#f5f3f0', accent: '#7c2d12', rule: '#d9cfc7', sections: ['skills', 'education', 'achievements'], customPattern: 'certif|language|interest', skills: 'stack', padTop: 34, title: { variant: 'underline', size: 9, rule: 'rule' } },
  }, { ats: false, also: ['two-column'] }),

  T('vertex', 'Vertex', 'two-column', 'Full-width dark header above a tinted left column.', 'Analytics, consulting and product roles', {
    layout: 'sidebar-left',
    fonts: { heading: 'montserrat', body: 'open-sans' },
    size: { base: 9.2, lineHeight: 1.34 },
    colors: { text: '#0f172a', muted: '#475569', accent: '#0891b2', rule: '#cbd5e1' },
    page: { padH: 26, padTop: 22, padBottom: 26 },
    header: { place: 'banner', contact: 'icons', nameSize: 24, nameCase: 'upper', nameSpacing: 2, headlineColor: '#67e8f9', bannerBg: '#0f172a', bannerMuted: '#e2e8f0', iconColor: '#67e8f9', bannerPadV: 22 },
    title: { variant: 'underline', size: 9.6, spacing: 1.4, gapBefore: 12, rule: 'accent' },
    bullet: { kind: 'disc', markerColor: 'accent' },
    side: { width: 172, bg: '#f1f5f9', accent: '#0e7490', rule: '#cbd5e1', chipBg: '#ffffff', chipText: '#0f172a', sections: ['skills', 'education'], customPattern: 'certif|language|interest|hobb', skills: 'tags', padTop: 22, title: { variant: 'plain', size: 9, spacing: 1.6 } },
  }, { ats: false, also: ['modern'] }),

  T('graphite', 'Graphite', 'two-column', 'Charcoal sidebar with Raleway capitals and light skill chips.', 'Design-aware engineering and product roles', {
    layout: 'sidebar-left',
    fonts: { heading: 'raleway', body: 'source-sans-3' },
    size: { base: 9.8, lineHeight: 1.32 },
    colors: { text: '#18181b', muted: '#52525b', accent: '#18181b', rule: '#d4d4d8' },
    page: { padH: 28, padTop: 34, padBottom: 28 },
    header: { place: 'side', contact: 'stacked-icons', nameSize: 22, nameCase: 'upper', nameSpacing: 2, nameColor: '#fafafa', headlineColor: '#fbbf24', headlineCase: 'upper', headlineSpacing: 1.4, headlineSize: 8.6, contactColor: '#d4d4d8', iconColor: '#fbbf24', contactSize: 8.4, gapAfter: 6 },
    title: { variant: 'short-underline', size: 10, spacing: 2, rule: '#f59e0b', gapBefore: 12, gapAfter: 6 },
    bullet: { kind: 'dash', markerColor: 'muted' },
    side: { width: 178, bg: '#27272a', text: '#f4f4f5', muted: '#d4d4d8', accent: '#fbbf24', rule: '#52525b', chipBg: '#3f3f46', chipText: '#fafafa', sections: ['skills', 'education'], customPattern: 'certif|language|interest|hobb', skills: 'tags', title: { variant: 'plain', size: 9, spacing: 2 } },
  }, { ats: false, also: ['creative'] }),

  T('emerald', 'Emerald', 'two-column', 'Fresh green right panel with Fira Sans and clear hierarchy.', 'Sustainability, core engineering, operations', {
    layout: 'sidebar-right',
    fonts: { heading: 'fira-sans', body: 'fira-sans' },
    size: { base: 9.2, lineHeight: 1.32 },
    colors: { text: '#052e16', muted: '#3f5d4a', accent: '#047857', rule: '#a7f3d0' },
    page: { padH: 28, padTop: 32, padBottom: 28 },
    header: { align: 'left', nameSize: 26, nameColor: 'accent', contact: 'inline', separator: '  ·  ', gapAfter: 6 },
    title: { variant: 'line-after', size: 9.8, spacing: 1.2, rule: 'rule', gapBefore: 12 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    side: { width: 166, bg: '#ecfdf5', accent: '#047857', rule: '#a7f3d0', chipBg: '#ffffff', chipText: '#065f46', sections: ['skills', 'education', 'achievements'], customPattern: 'certif|language|interest', skills: 'tags', title: { variant: 'plain', size: 9, spacing: 1.6 } },
  }, { ats: false }),

  T('monarch', 'Monarch', 'two-column', 'Burgundy sidebar with Garamond name for an elegant classic look.', 'Finance, law-adjacent, management roles', {
    layout: 'sidebar-left',
    fonts: { heading: 'eb-garamond', body: 'lato' },
    size: { base: 9.4, lineHeight: 1.34 },
    colors: { text: '#1f1a1c', muted: '#5b4f53', accent: '#7f1d1d', rule: '#e7d5d8' },
    page: { padH: 28, padTop: 34, padBottom: 28 },
    header: { place: 'side', contact: 'stacked-icons', nameSize: 24, nameColor: '#fff7ed', headlineColor: '#fecaca', headlineItalic: true, contactColor: '#f5e1e1', iconColor: '#fca5a5', contactSize: 8.4, gapAfter: 6 },
    title: { variant: 'underline', size: 10.6, case: 'title', spacing: 0.2, rule: 'rule', gapBefore: 12 },
    bullet: { kind: 'disc', markerColor: 'accent' },
    side: { width: 178, bg: '#4a1d2e', text: '#fdf2f4', muted: '#f5d0d6', accent: '#fecaca', rule: '#7a3b4f', chipBg: '#5e2a3d', chipText: '#fff1f2', sections: ['skills', 'education'], customPattern: 'certif|language|interest|hobb', skills: 'stack', title: { variant: 'underline', size: 9.4, case: 'title', rule: 'rule', color: 'accent' } },
  }, { ats: false, also: ['executive'] }),

  T('blueprint', 'Blueprint', 'two-column', 'Deep-blue technical sidebar with monospace labels and skill chips.', 'Backend, embedded and systems engineering', {
    layout: 'sidebar-left',
    fonts: { heading: 'ibm-plex-sans', body: 'ibm-plex-sans', title: 'jetbrains-mono' },
    size: { base: 9.2, lineHeight: 1.32 },
    colors: { text: '#0b1f3a', muted: '#41557a', accent: '#1d4ed8', rule: '#c3d3ee' },
    page: { padH: 26, padTop: 32, padBottom: 28 },
    header: { place: 'side', contact: 'stacked-icons', nameSize: 21, nameColor: '#ffffff', headlineColor: '#7dd3fc', contactColor: '#c7d7f0', iconColor: '#7dd3fc', contactSize: 8.2, gapAfter: 6 },
    title: { variant: 'prompt', prefix: '// ', size: 9.8, spacing: 0.4, case: 'upper', gapBefore: 12 },
    entry: { tech: 'inline' },
    bullet: { kind: 'chevron', markerColor: 'accent' },
    side: { width: 176, bg: '#0b1f3a', text: '#e8f0fb', muted: '#c7d7f0', accent: '#7dd3fc', rule: '#24426e', chipBg: '#16325a', chipText: '#e0f2fe', sections: ['skills', 'education'], customPattern: 'certif|language|interest|hobb', skills: 'tags', title: { variant: 'prompt', prefix: '// ', size: 8.8 } },
  }, { ats: false, also: ['tech'] }),

  T('sterling', 'Sterling', 'two-column', 'Light grey left column with contacts and skills, ATS-safe text.', 'Any role where you want a tidy two-column page', {
    layout: 'sidebar-left',
    fonts: { heading: 'source-sans-3', body: 'source-sans-3' },
    size: { base: 9.8, lineHeight: 1.32 },
    colors: { text: '#1f2937', muted: '#4b5563', accent: '#374151', rule: '#d1d5db' },
    page: { padH: 28, padTop: 34, padBottom: 30 },
    header: { place: 'side', contact: 'stacked', nameSize: 23, gapAfter: 6, contactSize: 8.8, headlineColor: 'muted' },
    title: { variant: 'underline', size: 10, spacing: 1.4, color: 'text', rule: 'text', ruleWidth: 0.6, gapBefore: 12 },
    bullet: { kind: 'disc' },
    side: { width: 172, bg: '#f3f4f6', accent: '#111827', rule: '#9ca3af', sections: ['skills', 'education'], customPattern: 'certif|language|interest|hobb', skills: 'stack', title: { variant: 'underline', size: 9, rule: 'rule', color: 'text' } },
  }, { ats: false, also: ['minimal'] }),
];

const BY_ID = new Map(RESUME_TEMPLATE_CATALOG.map((template) => [template.id, template]));
const THEME_CACHE = new Map();

export const DEFAULT_TEMPLATE_ID = 'iit-bombay-classic';
export const RESUME_TEMPLATE_IDS = RESUME_TEMPLATE_CATALOG.map(({ id }) => id);

export const getTemplate = (id) => BY_ID.get(id) || BY_ID.get(DEFAULT_TEMPLATE_ID);

export function getTemplateTheme(id) {
  const template = getTemplate(id);
  if (!THEME_CACHE.has(template.id)) THEME_CACHE.set(template.id, resolveTheme(template));
  return THEME_CACHE.get(template.id);
}

export function templateMatches(template, { category = 'all', query = '' } = {}) {
  if (category === 'ats' && !template.ats) return false;
  if (category !== 'all' && category !== 'ats' && !template.categories.includes(category)) return false;
  const text = `${template.name} ${template.tagline} ${template.bestFor} ${template.categories.join(' ')}`.toLowerCase();
  return String(query || '').toLowerCase().split(/\s+/).filter(Boolean).every((word) => text.includes(word));
}
