// The downloaded PDF: the same renderer and page breaks as the live preview,
// drawn with react-pdf primitives and the same font files. With `lineBreaks`
// from the preview, every line also breaks exactly where the preview shows it.
import { createContext, useContext } from 'react';
import {
  Document,
  Font,
  Link,
  Page,
  Path,
  Svg,
  Text,
  View,
} from '@react-pdf/renderer';
import { buildLayout, singlePageLayout } from './templates/blocks';
import { getTemplate, getTemplateTheme } from './templates/catalog';
import { FONT_FAMILIES, registerPdfFonts } from './templates/fonts';
import { applyLineBreaks } from './templates/lineBreaks';
import { ResumePageBody } from './templates/ResumeRenderer';
import { fitTheme } from './templates/theme';

registerPdfFonts(Font);

// Line-break bookkeeping: each block (or the banner) is a scope; top-level
// texts inside it are numbered in render order, matching [data-t] DOM order.
const BreaksContext = createContext(null);
const ScopeContext = createContext(null);
const InTextContext = createContext(false);

const stripData = (props) => Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith('data-') && key !== 'measure'));

function PdfView({ style, children, ...rest }) {
  const scopeId = rest['data-b'] || (rest['data-banner'] ? 'banner' : null);
  const view = <View style={style} {...stripData(rest)}>{children}</View>;
  if (!scopeId) return view;
  return <ScopeContext.Provider value={{ id: scopeId, counter: { next: 0 } }}>{view}</ScopeContext.Provider>;
}

function PdfText({ style, children }) {
  const nested = useContext(InTextContext);
  const breaks = useContext(BreaksContext);
  const scope = useContext(ScopeContext);
  if (nested) return <Text style={style}>{children}</Text>;
  const index = scope ? scope.counter.next++ : -1;
  const offsets = breaks && scope ? breaks[`${scope.id}#${index}`] : null;
  return (
    <InTextContext.Provider value>
      <Text style={style}>{offsets ? applyLineBreaks(children, offsets) : children}</Text>
    </InTextContext.Provider>
  );
}

export const PDF_PRIMITIVES = {
  Page: ({ style, children }) => <Page size="A4" style={style}>{children}</Page>,
  View: PdfView,
  Text: PdfText,
  Link: ({ src, style, children }) => <Link src={src} style={style}>{children}</Link>,
  Svg: ({ width, height, viewBox, children }) => <Svg width={width} height={height} viewBox={viewBox}>{children}</Svg>,
  Path: (props) => <Path {...props} />,
};

const BUILTIN = { serif: 'builtin:Times-Roman', monospace: 'builtin:Courier' };
const builtinFont = (key) => BUILTIN[FONT_FAMILIES[key]?.fallback] || 'builtin:Helvetica';

/** Same template with standard PDF fonts: the last-resort retry if an embedded font fails. */
export function withBuiltinFonts(theme) {
  return { ...theme, fonts: { body: builtinFont(theme.fonts.body), heading: builtinFont(theme.fonts.heading), title: builtinFont(theme.fonts.title) } };
}

/**
 * @param {object} props.resume normalized resume
 * @param {Array} [props.pages] measured pages from the preview; without them
 *   each column flows on one page and react-pdf adds pages if it overflows.
 * @param {object} [props.lineBreaks] measured line starts from the preview
 * @param {boolean} [props.safeFonts] use standard PDF fonts (fallback only)
 */
function savedDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export default function ResumePdfDocument({ resume, pages, lineBreaks = null, safeFonts = false, fitScale = 1 }) {
  // The one-page fit chosen by the preview, so the PDF matches it exactly.
  const baseTheme = fitTheme(getTemplateTheme(resume.template), fitScale);
  const theme = safeFonts ? withBuiltinFonts(baseTheme) : baseTheme;
  const layout = buildLayout(resume, theme);
  const ids = new Set([...layout.columns.main, ...layout.columns.side].map((block) => block.id));
  const usable = Array.isArray(pages) && pages.length
    && pages.every((page) => [...(page.main || []), ...(page.side || [])].every((id) => ids.has(id)))
    && pages.reduce((sum, page) => sum + (page.main?.length || 0) + (page.side?.length || 0), 0) === ids.size;
  const pageList = usable ? pages : singlePageLayout(layout);
  return (
    <BreaksContext.Provider value={usable && !safeFonts ? lineBreaks : null}>
      <Document title={`${resume.basics?.name || 'Student'} Resume`} author={resume.basics?.name || 'Prep Resume'} creator="Prep Resume" subject={`${getTemplate(resume.template).name} template`} creationDate={savedDate(resume.createdAt) || savedDate(resume.updatedAt)}>
        {pageList.map((page, index) => (
          <ResumePageBody key={index} P={PDF_PRIMITIVES} resume={resume} theme={theme} layout={layout} page={page} pageIndex={index} />
        ))}
      </Document>
    </BreaksContext.Provider>
  );
}
