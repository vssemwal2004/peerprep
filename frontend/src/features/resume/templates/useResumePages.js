import { createElement, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildLayout, singlePageLayout } from './blocks';
import { getTemplateTheme } from './catalog';
import { ensureResumeFontCss, loadTemplateFonts } from './fonts';
import { HTML_PRIMITIVES } from './htmlPrimitives';
import { measureLineBreaks } from './lineBreaks';
import { combineColumns, packColumn, pagesSignature } from './paginate';
import { ResumePageBody } from './ResumeRenderer';
import { FIT_STEPS, columnGeometry, columnOrder, fitTheme, nextFitStep } from './theme';

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
 * Lays a resume out with its template and returns measured pages. With `fitOnePage` (default) the
 * design is tightened step by step (FIT_STEPS) until the résumé fits one page; only when it does
 * not fit even at the smallest readable step does it flow onto a second page. The search runs on
 * the offscreen copy, so the visible preview changes once, when the right step is found.
 * `measureNode` must be rendered (it portals an offscreen copy into <body>).
 */
export function useResumePages(resume, { enabled = true, fitOnePage = true } = {}) {
  const baseTheme = getTemplateTheme(resume?.template);
  // Layout depends on the template's structure only, never on its sizes.
  const layout = useMemo(() => buildLayout(resume, baseTheme), [resume, baseTheme]);
  const fallback = useMemo(() => singlePageLayout(layout), [layout]);
  const [result, setResult] = useState({ pages: null, key: '', step: 0 });
  const [probe, setProbe] = useState({ step: 0, dir: null, best: null });
  const [fontTick, setFontTick] = useState(0);
  const containerRef = useRef(null);
  const lastInputs = useRef(null);
  const probeTheme = fitTheme(baseTheme, FIT_STEPS[probe.step] ?? 1);

  useEffect(() => {
    if (!enabled) return undefined;
    ensureResumeFontCss();
    let live = true;
    loadTemplateFonts(fontKeys(baseTheme)).then(() => { if (live) setFontTick((value) => value + 1); });
    const onFonts = () => live && setFontTick((value) => value + 1);
    document.fonts?.addEventListener?.('loadingdone', onFonts);
    return () => { live = false; document.fonts?.removeEventListener?.('loadingdone', onFonts); };
  }, [enabled, baseTheme]);

  useLayoutEffect(() => {
    if (!enabled) return;
    // New content, template, fonts or mode: search again, starting from the step shown now.
    const inputs = [layout, baseTheme, fontTick, fitOnePage];
    if (!lastInputs.current || inputs.some((value, index) => value !== lastInputs.current[index])) {
      lastInputs.current = inputs;
      const start = fitOnePage ? Math.min(result.step, FIT_STEPS.length - 1) : 0;
      if (probe.step !== start || probe.dir !== null) { setProbe({ step: start, dir: null, best: null }); return; }
    }
    const pages = measurePages(containerRef.current, layout, probeTheme);
    if (!pages) return;
    const decision = fitOnePage ? nextFitStep(probe, pages.length <= 1) : { settle: probe.step };
    if (decision.next) { setProbe(decision.next); return; }
    if (decision.settle !== probe.step) { setProbe({ step: decision.settle, dir: 'done', best: null }); return; }
    const key = `${probe.step}|${pagesSignature(pages)}`;
    setResult((current) => (current.key === key ? current : { pages, key, step: probe.step }));
  }, [enabled, fitOnePage, layout, baseTheme, fontTick, probe, probeTheme, result.step]);

  const theme = fitTheme(baseTheme, FIT_STEPS[result.step] ?? 1);
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
    }, createElement(ResumePageBody, { P: HTML_PRIMITIVES, resume, theme: probeTheme, layout, page: fallback[0], pageIndex: 0, measure: true })),
    document.body,
  ) : null;

  // Read on demand (download). Line breaks are only valid when the offscreen copy is drawn at the
  // step shown on screen; during a search the PDF falls back to its own line breaking.
  const getLineBreaks = () => (probe.step === result.step ? measureLineBreaks(containerRef.current) : null);
  const fit = {
    scale: FIT_STEPS[result.step] ?? 1,
    step: result.step,
    // Still more than one page at the smallest readable size: the student should shorten it.
    overflow: Boolean(fitOnePage && valid && pages.length > 1 && result.step === FIT_STEPS.length - 1),
  };

  return { theme, baseTheme, layout, pages, measured: valid, measureNode, getLineBreaks, fit };
}
