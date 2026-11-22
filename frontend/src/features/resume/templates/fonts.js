// One font registry for both renderers. The HTML preview and the react-pdf
// document load the SAME font files under the SAME family names, so line
// breaks and page breaks in the preview match the downloaded PDF.
// All families are SIL Open Font License (licence files sit next to the fonts).
import termesRegular from '../../../assets/fonts/tex-gyre-termes/texgyretermes-regular.otf';
import termesBold from '../../../assets/fonts/tex-gyre-termes/texgyretermes-bold.otf';
import termesItalic from '../../../assets/fonts/tex-gyre-termes/texgyretermes-italic.otf';
import termesBoldItalic from '../../../assets/fonts/tex-gyre-termes/texgyretermes-bolditalic.otf';

const woffFiles = import.meta.glob('../../../assets/fonts/resume/*/*.woff', { eager: true, query: '?url', import: 'default' });

// key -> display label + generic CSS fallback. The family name used by both
// renderers is `PR <label>` so a system-installed copy can never be picked up.
export const FONT_FAMILIES = {
  termes: { label: 'TeX Gyre Termes', fallback: 'serif', kind: 'Serif' },
  'eb-garamond': { label: 'EB Garamond', fallback: 'serif', kind: 'Serif' },
  lora: { label: 'Lora', fallback: 'serif', kind: 'Serif' },
  merriweather: { label: 'Merriweather', fallback: 'serif', kind: 'Serif' },
  'source-serif-4': { label: 'Source Serif', fallback: 'serif', kind: 'Serif' },
  'playfair-display': { label: 'Playfair Display', fallback: 'serif', kind: 'Display serif' },
  'zilla-slab': { label: 'Zilla Slab', fallback: 'serif', kind: 'Slab serif' },
  inter: { label: 'Inter', fallback: 'sans-serif', kind: 'Sans' },
  lato: { label: 'Lato', fallback: 'sans-serif', kind: 'Sans' },
  'open-sans': { label: 'Open Sans', fallback: 'sans-serif', kind: 'Sans' },
  roboto: { label: 'Roboto', fallback: 'sans-serif', kind: 'Sans' },
  'ibm-plex-sans': { label: 'IBM Plex Sans', fallback: 'sans-serif', kind: 'Sans' },
  'source-sans-3': { label: 'Source Sans', fallback: 'sans-serif', kind: 'Sans' },
  'fira-sans': { label: 'Fira Sans', fallback: 'sans-serif', kind: 'Sans' },
  'work-sans': { label: 'Work Sans', fallback: 'sans-serif', kind: 'Sans' },
  'nunito-sans': { label: 'Nunito Sans', fallback: 'sans-serif', kind: 'Sans' },
  montserrat: { label: 'Montserrat', fallback: 'sans-serif', kind: 'Geometric sans' },
  raleway: { label: 'Raleway', fallback: 'sans-serif', kind: 'Elegant sans' },
  'jetbrains-mono': { label: 'JetBrains Mono', fallback: 'monospace', kind: 'Monospace' },
};

const STYLES = [
  ['400-normal', 400, 'normal'],
  ['400-italic', 400, 'italic'],
  ['700-normal', 700, 'normal'],
  ['700-italic', 700, 'italic'],
];

const TERMES = { '400-normal': termesRegular, '700-normal': termesBold, '400-italic': termesItalic, '700-italic': termesBoldItalic };

export const fontFamilyName = (key) => `PR ${FONT_FAMILIES[key]?.label || FONT_FAMILIES.inter.label}`;
export const cssFontStack = (key) => `"${fontFamilyName(key)}", ${FONT_FAMILIES[key]?.fallback || 'sans-serif'}`;

/** URL of one style of a family, or '' when the file is missing. */
export function fontFileUrl(key, style) {
  if (key === 'termes') return TERMES[style] || '';
  const match = Object.entries(woffFiles).find(([path]) => path.endsWith(`/resume/${key}/${style}.woff`));
  return match ? match[1] : '';
}

export function fontSources(key) {
  return STYLES.map(([style, fontWeight, fontStyle]) => ({ src: fontFileUrl(key, style), fontWeight, fontStyle }))
    .filter((item) => item.src);
}

let cssInjected = false;
/** Adds @font-face rules once. Browsers download a file only when text uses it. */
export function ensureResumeFontCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const rules = Object.keys(FONT_FAMILIES).flatMap((key) => fontSources(key).map(({ src, fontWeight, fontStyle }) => (
    `@font-face{font-family:"${fontFamilyName(key)}";src:url("${src}") format("${String(src).endsWith('.otf') ? 'opentype' : 'woff'}");font-weight:${fontWeight};font-style:${fontStyle};font-display:block;}`
  )));
  const node = document.createElement('style');
  node.id = 'prep-resume-fonts';
  node.textContent = rules.join('\n');
  document.head.appendChild(node);
}

/** Loads the fonts a template uses so measuring waits for real metrics. */
export function loadTemplateFonts(keys = []) {
  if (typeof document === 'undefined' || !document.fonts?.load) return Promise.resolve();
  ensureResumeFontCss();
  const loads = [...new Set(keys)].flatMap((key) => STYLES.map(([, weight, style]) => (
    document.fonts.load(`${style === 'italic' ? 'italic ' : ''}${weight} 12px "${fontFamilyName(key)}"`).catch(() => [])
  )));
  return Promise.all(loads);
}

// Long unbroken strings (URLs, emails) are split into chunks so react-pdf can
// wrap them like the browser does with overflow-wrap:anywhere. Ordinary words
// are never hyphenated, matching the preview.
export function hyphenateForPdf(word) {
  const text = String(word || '');
  if (text.length <= 24) return [text];
  const parts = [];
  for (let index = 0; index < text.length; index += 12) parts.push(text.slice(index, index + 12));
  return parts;
}

let pdfRegistered = false;
/** Registers every family with react-pdf. `resolveSrc` lets Node scripts map URLs to file paths. */
export function registerPdfFonts(Font, resolveSrc = (src) => src) {
  if (pdfRegistered) return;
  pdfRegistered = true;
  Object.keys(FONT_FAMILIES).forEach((key) => {
    Font.register({ family: fontFamilyName(key), fonts: fontSources(key).map((item) => ({ ...item, src: resolveSrc(item.src) })) });
  });
  Font.registerHyphenationCallback(hyphenateForPdf);
}
