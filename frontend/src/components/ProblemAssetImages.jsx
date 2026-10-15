import { useState } from 'react';
import { ImageOff, Maximize2 } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

const UPLOAD_MARKER = '/image/upload/';
// A leading path segment made only of Cloudinary params (e.g. "f_auto,q_auto,w_800")
// means the URL already carries a transformation.
const CLOUDINARY_PARAM = /^(?:[a-z]{1,3}|dpr|fps|\$\w+)_[^/]*$/i;
const INLINE_TRANSFORM = 'f_auto,q_auto,c_limit,w_1200';
const LIGHTBOX_TRANSFORM = 'f_auto,q_auto,c_limit,w_2400';
const VARIANTS = {
  content: { maxHeight: 460, gridFrame: 'h-64' },
  sample: { maxHeight: 260, gridFrame: 'h-52' },
};

/** Inserts a Cloudinary delivery transformation; other hosts, signed URLs and already-transformed URLs pass through. */
function cloudinaryUrl(url, transform) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== 'res.cloudinary.com') return url;
  const at = parsed.pathname.indexOf(UPLOAD_MARKER);
  if (at < 0) return url;
  const prefix = parsed.pathname.slice(0, at + UPLOAD_MARKER.length);
  const rest = parsed.pathname.slice(prefix.length);
  const first = rest.split('/')[0] || '';
  if (/^s--[^/]+--$/.test(first)) return url;
  if (first.split(',').every((part) => CLOUDINARY_PARAM.test(part))) return url;
  parsed.pathname = `${prefix}${transform}/${rest}`;
  return parsed.toString();
}

function dimension(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function prepareImages(images, label) {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image) => /^https:\/\//i.test(String(image?.url || '')))
    .map((image, order) => ({ image, order }))
    .sort((a, b) => ((Number(a.image.position) || 0) - (Number(b.image.position) || 0)) || a.order - b.order)
    .map(({ image }, index) => {
      const url = String(image.url);
      const width = dimension(image.width);
      const height = dimension(image.height);
      const src = cloudinaryUrl(url, INLINE_TRANSFORM);
      const transformable = src !== url;
      // Only offer a smaller candidate when the original is wider than it.
      const srcSet = transformable && !(width && width <= 600)
        ? `${cloudinaryUrl(url, 'f_auto,q_auto,c_limit,w_600')} 600w, ${src} 1200w`
        : undefined;
      return {
        key: `${image.publicId || url}-${index}`,
        url,
        src,
        srcSet,
        lightboxSrc: transformable ? cloudinaryUrl(url, LIGHTBOX_TRANSFORM) : url,
        width,
        height,
        caption: String(image.caption || '').trim(),
        alt: String(image.alt || '').trim() || String(image.caption || '').trim()
          || (label ? `${label} – figure ${index + 1}` : 'Problem illustration'),
      };
    });
}

function Unavailable({ item, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-800/60 ${className}`}>
      <ImageOff className="h-5 w-5 text-slate-400 dark:text-gray-500" aria-hidden="true" />
      <p className="text-xs font-medium text-slate-600 dark:text-gray-300">Image unavailable</p>
      <p className="max-w-[40ch] text-xs text-slate-500 dark:text-gray-400">{item.caption || item.alt}</p>
    </div>
  );
}

function AssetTile({ item, maxHeight, framed, gridFrame, onOpen }) {
  const [status, setStatus] = useState('loading');
  if (status === 'error') {
    return <Unavailable item={item} className={framed ? `w-full ${gridFrame}` : 'w-72 max-w-full'} />;
  }

  const known = Boolean(item.width && item.height);
  // Single images: reserve the exact box (scaled to maxHeight) so the skeleton matches and layout does not jump.
  const displayWidth = known ? Math.min(item.width, Math.round((maxHeight * item.width) / item.height)) : undefined;
  const singleStyle = known
    ? { width: displayWidth, aspectRatio: `${item.width} / ${item.height}` }
    : { maxHeight };
  const sizes = framed
    ? '(min-width: 640px) 360px, 100vw'
    : `(min-width: 640px) ${Math.min(displayWidth || 800, 800)}px, 100vw`;
  const loaded = status === 'loaded';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Enlarge ${item.alt}`}
      className={`group relative block max-w-full cursor-zoom-in overflow-hidden rounded-lg bg-white p-1.5 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md hover:ring-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:bg-slate-100 dark:ring-gray-700 dark:hover:ring-gray-500 dark:focus-visible:ring-offset-gray-900 ${framed ? `flex w-full items-center justify-center ${gridFrame}` : 'w-fit'}`}
    >
      {!loaded ? (
        <span
          className={`${framed || known ? 'absolute inset-1.5' : 'block h-40 w-64 max-w-full'} animate-pulse rounded bg-slate-200`}
          aria-hidden="true"
        />
      ) : null}
      <img
        src={item.src}
        srcSet={item.srcSet}
        sizes={item.srcSet ? sizes : undefined}
        alt={item.alt}
        width={item.width}
        height={item.height}
        loading="lazy"
        decoding="async"
        draggable={false}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        style={framed ? undefined : singleStyle}
        className={`block rounded object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'} ${framed
          ? 'h-auto max-h-full w-auto max-w-full'
          : known ? 'h-auto max-w-full' : loaded ? 'h-auto w-auto max-w-full' : 'absolute left-1.5 top-1.5 h-40 w-64 max-w-full'}`}
      />
      <span
        className="pointer-events-none absolute right-2.5 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-900/60 text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-90"
        aria-hidden="true"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

export default function ProblemAssetImages({
  images = [],
  className = '',
  variant = 'content',
  label = '',
  allowOpenOriginal = true,
  // Assessments: the viewer never leaves the page, stays under proctoring overlays and carries the watermark.
  secure = false,
  lightboxOverlay = null,
}) {
  const [openIndex, setOpenIndex] = useState(null);
  const items = prepareImages(images, label);
  if (!items.length) return null;

  const config = VARIANTS[variant] || VARIANTS.content;
  const grid = variant === 'sample' && items.length > 1;

  return (
    <>
      <div className={`${grid ? 'grid grid-cols-1 gap-3 sm:grid-cols-2' : 'space-y-4'} ${className}`}>
        {items.map((item, index) => (
          <figure key={item.key} className={grid ? 'min-w-0' : 'w-fit max-w-full'}>
            <AssetTile
              item={item}
              maxHeight={config.maxHeight}
              framed={grid}
              gridFrame={config.gridFrame}
              onOpen={() => setOpenIndex(index)}
            />
            {item.caption ? (
              <figcaption className="mt-1.5 max-w-[80ch] text-xs leading-5 text-slate-500 dark:text-gray-400">
                {item.caption}
              </figcaption>
            ) : null}
          </figure>
        ))}
      </div>
      {openIndex !== null ? (
        <ImageLightbox
          images={items.map((item) => ({
            src: item.lightboxSrc,
            originalUrl: item.url,
            alt: item.alt,
            caption: item.caption,
          }))}
          initialIndex={openIndex}
          allowOpenOriginal={allowOpenOriginal && !secure}
          secure={secure}
          overlay={lightboxOverlay}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  );
}
