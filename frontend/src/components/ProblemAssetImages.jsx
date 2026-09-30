function optimizedImageUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'res.cloudinary.com' || !parsed.pathname.includes('/image/upload/')) return url;
    return url.replace('/image/upload/', '/image/upload/f_auto,q_auto,dpr_auto/');
  } catch {
    return url;
  }
}

export default function ProblemAssetImages({ images = [], className = '' }) {
  const visibleImages = Array.isArray(images)
    ? images.filter((image) => /^https:\/\//i.test(String(image?.url || '')))
    : [];

  if (!visibleImages.length) return null;

  return (
    <div className={`space-y-4 ${className}`}>
      {visibleImages.map((image, index) => (
        <figure key={`${image.publicId || image.url}-${index}`} className="w-fit max-w-full">
          <a
            href={image.url}
            target="_blank"
            rel="noreferrer"
            className="block w-fit max-w-full overflow-hidden rounded-lg border border-slate-200/80 bg-white p-2 shadow-sm transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:border-gray-700"
            aria-label={image.alt ? `Open full-size image: ${image.alt}` : 'Open full-size problem image'}
          >
            <img
              src={optimizedImageUrl(image.url)}
              alt={image.alt || ''}
              width={Number(image.width) || undefined}
              height={Number(image.height) || undefined}
              loading="lazy"
              decoding="async"
              className="block h-auto max-h-[460px] w-auto max-w-full object-contain"
            />
          </a>
          {image.caption ? (
            <figcaption className="mt-1.5 max-w-[80ch] text-xs leading-5 text-slate-500 dark:text-gray-400">
              {image.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
