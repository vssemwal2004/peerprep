import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand } from 'lucide-react';
import { hasResumeContent } from './resumeUtils';
import { buildLayout, singlePageLayout } from './templates/blocks';
import { getTemplateTheme } from './templates/catalog';
import { ensureResumeFontCss } from './templates/fonts';
import { HTML_PRIMITIVES } from './templates/htmlPrimitives';
import { ResumePageBody } from './templates/ResumeRenderer';
import { PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from './templates/theme';
import { useResumePages } from './templates/useResumePages';
import './resume.css';

/** One A4 page drawn with the shared renderer. */
export function ResumePage({ resume, theme, layout, page, pageIndex }) {
  return <ResumePageBody P={HTML_PRIMITIVES} resume={resume} theme={theme} layout={layout} page={page} pageIndex={pageIndex} />;
}

function useFitScale(ref, { fitWidthOnly = false, min = 0.2 } = {}) {
  const [scale, setScale] = useState(0.55);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => {
      const { width, height } = node.getBoundingClientRect();
      const byWidth = (width - 24) / PAGE_WIDTH_PX;
      const next = fitWidthOnly ? Math.min(byWidth, 1.15) : Math.min(byWidth, (height - 24) / PAGE_HEIGHT_PX, 1);
      setScale(Math.max(min, Number.isFinite(next) ? next : 0.55));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, fitWidthOnly, min]);
  return scale;
}

function ScaledPage({ scale, children, label }) {
  return (
    <div className="resume-preview-page-frame" style={{ width: PAGE_WIDTH_PX * scale, height: PAGE_HEIGHT_PX * scale }} aria-label={label}>
      <div className="resume-preview-scaler" style={{ transform: `scale(${scale})` }}>{children}</div>
    </div>
  );
}

/**
 * Live preview. `mode="page"` shows one page with pagination; `mode="scroll"`
 * stacks every page for a full review. `onPagesChange` receives the measured
 * pages so the PDF can use the very same page breaks.
 */
export default function ResumePreview({ resume, page = 0, onPageChange, onExpand, onLayoutChange, sampleNotice = '', mode = 'page', className = '' }) {
  const { theme, layout, pages, measured, measureNode, getLineBreaks } = useResumePages(resume);
  const viewportRef = useRef(null);
  const scale = useFitScale(viewportRef, { fitWidthOnly: mode === 'scroll' });
  const safePage = Math.min(Math.max(page || 0, 0), pages.length - 1);
  const breaksRef = useRef(getLineBreaks);
  breaksRef.current = getLineBreaks;

  // Reports measured pages plus a reader for line breaks, so the PDF can copy both.
  useEffect(() => {
    if (measured) onLayoutChange?.({ pages, template: resume.template, getLineBreaks: () => breaksRef.current() });
  }, [measured, pages, resume.template, onLayoutChange]);

  if (!hasResumeContent(resume)) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-100/80 p-8 text-center dark:border-slate-700 dark:bg-slate-950/70">
        <div className="max-w-sm">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Your resume preview will appear here</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Start with any field. Nothing is compulsory, and empty sections are hidden automatically.</p>
        </div>
      </div>
    );
  }

  if (mode === 'scroll') {
    return (
      <div className={`resume-preview-scroll ${className}`} ref={viewportRef}>
        {measureNode}
        {sampleNotice ? <div className="resume-sample-ribbon">{sampleNotice}</div> : null}
        {pages.map((item, index) => (
          <div key={index} className="resume-preview-scroll-page">
            <ScaledPage scale={scale} label={`Page ${index + 1} of ${pages.length}`}>
              <ResumePage resume={resume} theme={theme} layout={layout} page={item} pageIndex={index} />
            </ScaledPage>
            <div className="resume-preview-scroll-caption">Page {index + 1} of {pages.length}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`resume-preview-shell ${className}`}>
      {measureNode}
      <div className="resume-preview-viewport" ref={viewportRef}>
        <ScaledPage scale={scale} label={`Page ${safePage + 1} of ${pages.length}`}>
          <ResumePage resume={resume} theme={theme} layout={layout} page={pages[safePage]} pageIndex={safePage} />
        </ScaledPage>
      </div>
      {sampleNotice ? <div className="resume-sample-ribbon">{sampleNotice}</div> : null}
      {onExpand ? <button type="button" onClick={onExpand} className="resume-preview-expand" aria-label="Open full preview" title="Open full preview"><Expand /></button> : null}
      {pages.length > 1 ? (
        <div className="resume-preview-pagination">
          <button type="button" onClick={() => onPageChange?.(Math.max(0, safePage - 1))} disabled={safePage === 0} aria-label="Previous page"><ChevronLeft /></button>
          <span>{safePage + 1} / {pages.length}</span>
          <button type="button" onClick={() => onPageChange?.(Math.min(pages.length - 1, safePage + 1))} disabled={safePage === pages.length - 1} aria-label="Next page"><ChevronRight /></button>
        </div>
      ) : null}
    </div>
  );
}

/** First page of a resume in a template, scaled to `width` CSS px. No measuring. */
export function ResumeThumbnail({ resume, width = 220 }) {
  const theme = getTemplateTheme(resume.template);
  const layout = useMemo(() => buildLayout(resume, theme), [resume, theme]);
  const page = useMemo(() => singlePageLayout(layout)[0], [layout]);
  useEffect(() => { ensureResumeFontCss(); }, []);
  const scale = width / PAGE_WIDTH_PX;
  return (
    <div className="resume-thumbnail" style={{ width, height: PAGE_HEIGHT_PX * scale }}>
      <div className="resume-preview-scaler" style={{ transform: `scale(${scale})` }}>
        <ResumePage resume={resume} theme={theme} layout={layout} page={page} pageIndex={0} />
      </div>
    </div>
  );
}
