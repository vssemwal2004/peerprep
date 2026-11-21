import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildLayout, singlePageLayout } from './blocks';
import { getTemplateTheme } from './catalog';
import { ensureResumeFontCss, loadTemplateFonts } from './fonts';
import { HTML_PRIMITIVES } from './htmlPrimitives';
import { measureLineBreaks } from './lineBreaks';
import { combineColumns, packColumn, pagesSignature } from './paginate';
import { ResumePageBody } from './ResumeRenderer';
import { columnGeometry, columnOrder } from './theme';

// Room left at the foot of each page so small font-metric differences between
// the browser and the PDF engine never push a line onto an extra page.
const SAFETY_PX = 8;

export function measurePages(container, layout, theme) {
  if (!container) return null;
  const banner = container.querySelector('[data-banner]');
  const bannerHeightPx = banner ? banner.getBoundingClientRect().height : 0;
  const columnPages = {};
  for (const column of columnOrder(theme)) {
    const columnEl = container.querySelector(`[data-col="${column}"]`);
    const blocks = layout.columns[column] || [];
    if (!columnEl || !blocks.length) { columnPages[column] = []; continue; }
    const paddingTop = parseFloat(window.getComputedStyle(columnEl).paddingTop) || 0;
    const contentTop = columnEl.getBoundingClientRect().top + paddingTop;
    const nodes = new Map([...columnEl.querySelectorAll('[data-b]')].map((node) => [node.getAttribute('data-b'), node]));
    const boxes = blocks.map((block) => {
      const rect = nodes.get(block.id)?.getBoundingClientRect();
      return { id: block.id, top: rect ? rect.top - contentTop : 0, bottom: rect ? rect.bottom - contentTop : 0, keepWithNext: Boolean(block.keepWithNext) };
    });
    if (boxes.every((box) => box.bottom === 0)) return null; // not laid out (hidden)
    columnPages[column] = packColumn(boxes, (pageIndex) => columnGeometry(theme, column, { pageIndex, bannerHeightPx }) - SAFETY_PX);
  }
  return combineColumns(columnPages);
}

const fontKeys = (theme) => [theme.fonts.body, theme.fonts.heading, theme.fonts.title];

/**
 * Lays a resume out with its template and returns measured pages.
 * `measureNode` must be rendered (it portals an offscreen copy into <body>).
 */
export function useResumePages(resume, { enabled = true } = {}) {
  const theme = getTemplateTheme(resume?.template);
  const layout = useMemo(() => buildLayout(resume, theme), [resume, theme]);
  const fallback = useMemo(() => singlePageLayout(layout), [layout]);
  const [result, setResult] = useState({ pages: null, key: '' });
  const [fontTick, setFontTick] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return undefined;
    ensureResumeFontCss();
    let live = true;
    loadTemplateFonts(fontKeys(theme)).then(() => { if (live) setFontTick((value) => value + 1); });
    const onFonts = () => live && setFontTick((value) => value + 1);
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => { live = false; document.fonts?.removeEventListener?.('loadingdone', onFonts); };
  }, [enabled, theme]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const pages = measurePages(containerRef.current, layout, theme);
    if (!pages) return;
    const key = pagesSignature(pages);
    setResult((current) => (current.key === key ? current : { pages, key }));
  }, [enabled, layout, theme, fontTick]);

  // Measured ids must still exist in the current layout; otherwise use the fallback until re-measured.
  const ids = new Set([...layout.columns.main, ...layout.columns.side].map((block) => block.id));
  const measured = result.pages;
  const valid = measured && measured.every((page) => [...page.main, ...page.side].every((id) => ids.has(id)))
    && measured.reduce((sum, page) => sum + page.main.length + page.side.length, 0) === ids.size;
  const pages = valid ? measured : fallback;

  const measureNode = enabled && typeof document !== 'undefined' ? createPortal(
    createElement('div', {
      ref: containerRef,
      'aria-hidden': 'true',
      style: { position: 'fixed', left: '-12000px', top: 0, width: 'auto', visibility: 'hidden', pointerEvents: 'none', zIndex: -1, contain: 'layout style' },
    }, createElement(ResumePageBody, { P: HTML_PRIMITIVES, resume, theme, layout, page: fallback[0], pageIndex: 0, measure: true })),
    document.body,
  ) : null;

  // Read on demand (download), not on every keystroke.
  const getLineBreaks = () => measureLineBreaks(containerRef.current);

  return { theme, layout, pages, measured: valid, measureNode, getLineBreaks };
}
