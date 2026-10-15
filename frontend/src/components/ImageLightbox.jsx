import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, ExternalLink, ImageOff, Loader2, Maximize, X, ZoomIn } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
const DRAG_THRESHOLD = 4;

// One slide. Keyed by index in the parent so load/error state resets per image.
function LightboxStage({ image, zoomed, canZoom, onToggleZoom, onMeasured, onBackdrop }) {
  const [status, setStatus] = useState('loading');
  const stageRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const focusPointRef = useRef(null);

  const measure = useCallback(() => {
    const img = imgRef.current;
    const stage = stageRef.current;
    if (!img || !stage || !img.naturalWidth) return;
    onMeasured(img.naturalWidth > stage.clientWidth + 1 || img.naturalHeight > stage.clientHeight + 1);
  }, [onMeasured]);

  useEffect(() => {
    if (status !== 'loaded') return undefined;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [status, measure]);

  // When zooming in from a click, keep the clicked point under the cursor area.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (!zoomed) {
      stage.scrollTo(0, 0);
      return;
    }
    const point = focusPointRef.current || { x: 0.5, y: 0.5 };
    focusPointRef.current = null;
    stage.scrollLeft = point.x * stage.scrollWidth - stage.clientWidth / 2;
    stage.scrollTop = point.y * stage.scrollHeight - stage.clientHeight / 2;
  }, [zoomed]);

  const handlePointerDown = (event) => {
    suppressClickRef.current = false;
    if (!zoomed || event.pointerType !== 'mouse' || event.button !== 0) return;
    const stage = stageRef.current;
    dragRef.current = { x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false };
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    stageRef.current.scrollLeft = drag.left - dx;
    stageRef.current.scrollTop = drag.top - dy;
  };

  const endDrag = () => {
    if (dragRef.current?.moved) suppressClickRef.current = true;
    dragRef.current = null;
  };

  const handleImageClick = (event) => {
    event.stopPropagation();
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (!zoomed) {
      const rect = event.currentTarget.getBoundingClientRect();
      focusPointRef.current = {
        x: rect.width ? (event.clientX - rect.left) / rect.width : 0.5,
        y: rect.height ? (event.clientY - rect.top) / rect.height : 0.5,
      };
    }
    onToggleZoom();
  };

  const handleStageClick = (event) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (event.target === event.currentTarget) onBackdrop();
  };

  return (
    <div
      ref={stageRef}
      onClick={handleStageClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className={`absolute inset-0 flex ${zoomed ? 'overflow-auto overscroll-contain' : 'items-center justify-center overflow-hidden p-2 sm:p-4'}`}
    >
      {status === 'loading' ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" />
        </div>
      ) : null}
      {status === 'error' ? (
        <div className="m-auto flex max-w-sm flex-col items-center gap-3 rounded-xl bg-white/10 px-6 py-8 text-center text-sm text-white/80">
          <ImageOff className="h-8 w-8 text-white/60" aria-hidden="true" />
          <p className="font-medium text-white">Image unavailable</p>
          {image.alt ? <p className="text-xs text-white/60">{image.alt}</p> : null}
        </div>
      ) : (
        <img
          ref={imgRef}
          src={image.src}
          alt={image.alt}
          draggable={false}
          decoding="async"
          onLoad={() => {
            setStatus('loaded');
            measure();
          }}
          onError={() => setStatus('error')}
          onClick={handleImageClick}
          className={`select-none rounded-md bg-white shadow-2xl transition-opacity duration-200 ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} ${zoomed
            ? 'm-auto max-w-none shrink-0 cursor-zoom-out'
            : `max-h-full max-w-full object-contain ${canZoom ? 'cursor-zoom-in' : 'cursor-default'}`}`}
        />
      )}
    </div>
  );
}

/**
 * Full-screen image viewer rendered into document.body so it sits above the
 * solver split panes and the assessment fullscreen chrome.
 * images: [{ src, originalUrl, alt, caption }]
 */
export default function ImageLightbox({ images = [], initialIndex = 0, onClose, allowOpenOriginal = true }) {
  const count = images.length;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, initialIndex), Math.max(0, count - 1)));
  const [zoomed, setZoomed] = useState(false);
  const [canZoom, setCanZoom] = useState(false);
  const dialogRef = useRef(null);
  const closeRef = useRef(null);

  const go = useCallback((delta) => {
    if (count < 2) return;
    setIndex((current) => (current + delta + count) % count);
    setZoomed(false);
    setCanZoom(false);
  }, [count]);

  const toggleZoom = useCallback(() => {
    setZoomed((current) => (current ? false : canZoom));
  }, [canZoom]);

  // Body scroll lock + focus handling: focus the close button, restore the opener on unmount.
  useEffect(() => {
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (opener && document.contains(opener)) opener.focus?.({ preventScroll: true });
    };
  }, []);

  // Window capture so solver/editor shortcuts do not also react. Modified keys
  // (Alt+Tab, Ctrl+Tab, ...) pass straight through for the assessment guards.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (count < 2) return;
        event.preventDefault();
        event.stopPropagation();
        go(event.key === 'ArrowLeft' ? -1 : 1);
      } else if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = [...dialog.querySelectorAll(FOCUSABLE)];
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (!dialog.contains(active)) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [count, go, onClose]);

  if (!count || typeof document === 'undefined') return null;
  const image = images[index];
  const close = () => onClose?.();
  const toolbarButton = 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40';
  const navButton = 'absolute top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg ring-1 ring-white/15 transition-colors hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white';

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt ? `Image viewer: ${image.alt}` : 'Image viewer'}
      className="fixed inset-0 z-[20000] flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 text-white sm:px-5">
        <div className="min-w-0 text-sm font-medium tabular-nums text-white/80" aria-live="polite">
          {count > 1 ? `${index + 1} / ${count}` : ''}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleZoom}
            disabled={!canZoom}
            className={toolbarButton}
            aria-pressed={zoomed}
            aria-label={zoomed ? 'Fit image to screen' : 'View at 100% size'}
            title={zoomed ? 'Fit to screen' : 'Actual size (100%)'}
          >
            {zoomed ? <Maximize className="h-[18px] w-[18px]" aria-hidden="true" /> : <ZoomIn className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
          {allowOpenOriginal && image.originalUrl ? (
            <a
              href={image.originalUrl}
              target="_blank"
              rel="noreferrer noopener"
              className={toolbarButton}
              aria-label="Open original image in a new tab"
              title="Open original"
            >
              <ExternalLink className="h-[18px] w-[18px]" aria-hidden="true" />
            </a>
          ) : null}
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className={toolbarButton}
            aria-label="Close image viewer"
            title="Close"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <LightboxStage
          key={index}
          image={image}
          zoomed={zoomed}
          canZoom={canZoom}
          onToggleZoom={toggleZoom}
          onMeasured={setCanZoom}
          onBackdrop={close}
        />
        {count > 1 ? (
          <>
            <button type="button" onClick={() => go(-1)} className={`${navButton} left-2 sm:left-4`} aria-label="Previous image">
              <ChevronLeft className="h-6 w-6" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(1)} className={`${navButton} right-2 sm:right-4`} aria-label="Next image">
              <ChevronRight className="h-6 w-6" aria-hidden="true" />
            </button>
          </>
        ) : null}
      </div>

      <div
        className="shrink-0 px-4 pb-4 pt-3 text-center"
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {image.caption || image.alt ? (
          <p className="mx-auto max-w-[80ch] text-sm leading-6 text-white/90">{image.caption || image.alt}</p>
        ) : null}
        <p className="mt-1 text-xs text-white/50">
          Click outside or press × to close{canZoom ? ' · Click the image to toggle 100% zoom' : ''}
        </p>
      </div>
    </div>,
    document.body,
  );
}
