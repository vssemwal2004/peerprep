// HTML versions of the react-pdf primitives used by ResumeRenderer. Styles are
// written in points (react-pdf units) and converted here, and the defaults
// copy react-pdf's flexbox model (column direction, border-box, min-width 0).
import { createContext, useContext } from 'react';
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX, PT_TO_PX } from './theme';

const LENGTH_KEYS = new Set([
  'fontSize', 'letterSpacing', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'flexBasis',
  'top', 'right', 'bottom', 'left', 'gap', 'rowGap', 'columnGap',
  'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderWidth', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius',
]);

const SIDES = { Horizontal: ['Left', 'Right'], Vertical: ['Top', 'Bottom'] };
const BORDER_SIDES = ['Top', 'Right', 'Bottom', 'Left'];

export function toCss(style) {
  const source = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style || {});
  const css = {};
  Object.entries(source).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (key === 'fontFeatureSettings' && typeof value === 'object') {
      css.fontFeatureSettings = Object.entries(value).map(([tag, on]) => `"${tag}" ${on ? 1 : 0}`).join(', ');
      if (value.liga === false) css.fontVariantLigatures = 'none';
      return;
    }
    const expanded = key.match(/^(margin|padding)(Horizontal|Vertical)$/);
    const keys = expanded ? SIDES[expanded[2]].map((side) => `${expanded[1]}${side}`) : [key];
    keys.forEach((name) => {
      if (typeof value === 'number' && LENGTH_KEYS.has(name)) css[name] = `${value * PT_TO_PX}px`;
      else if (typeof value === 'string' && /^-?\d*\.?\d+pt$/.test(value)) css[name] = `${parseFloat(value) * PT_TO_PX}px`;
      else css[name] = value;
    });
  });
  if (css.borderWidth && !css.borderStyle) css.borderStyle = 'solid';
  BORDER_SIDES.forEach((side) => {
    if (css[`border${side}Width`] && !css[`border${side}Style`]) css[`border${side}Style`] = 'solid';
  });
  if (css.fontFamily && !css.fontFamily.includes(',')) css.fontFamily = `"${css.fontFamily}", sans-serif`;
  return css;
}

const dataProps = (props) => Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')));
const InText = createContext(false);

function Page({ style, children, measure }) {
  return (
    <div
      className="prep-resume-page"
      style={{
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
        width: `${PAGE_WIDTH_PX}px`, height: measure ? 'auto' : `${PAGE_HEIGHT_PX}px`, minHeight: measure ? 0 : undefined,
        fontKerning: 'normal', fontSynthesis: 'none', textRendering: 'geometricPrecision', WebkitFontSmoothing: 'antialiased',
        ...toCss(style),
      }}
    >
      {children}
    </div>
  );
}

function View({ style, children, ...rest }) {
  return (
    <div {...dataProps(rest)} style={{ display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'relative', minWidth: 0, minHeight: 0, flexShrink: 0, ...toCss(style) }}>
      {children}
    </div>
  );
}

function Text({ style, children }) {
  const nested = useContext(InText);
  const css = toCss(style);
  if (nested) return <span style={css}>{children}</span>;
  return (
    <InText.Provider value>
      {/* pre-line: runs of spaces collapse (react-pdf does the same), line breaks stay. */}
      {/* data-t marks a top-level text for the PDF line-break pass (lineBreaks.js). */}
      <div data-t="" style={{ display: 'block', boxSizing: 'border-box', minWidth: 0, flexShrink: 0, whiteSpace: 'pre-line', overflowWrap: 'anywhere', ...css }}>{children}</div>
    </InText.Provider>
  );
}

function Link({ src, style, children }) {
  return <a href={src} target="_blank" rel="noreferrer" style={{ color: 'inherit', ...toCss(style) }}>{children}</a>;
}

function Svg({ width, height, viewBox, children }) {
  return <svg width={width * PT_TO_PX} height={height * PT_TO_PX} viewBox={viewBox} style={{ flexShrink: 0, display: 'block' }} aria-hidden="true">{children}</svg>;
}

function Path(props) {
  return <path {...props} />;
}

export const HTML_PRIMITIVES = { Page, View, Text, Link, Svg, Path };
