import { useState } from 'react';
import { initialTone, initialsOf } from './prepMockModel';

const SIZES = {
  sm: { box: 'h-9 w-9 rounded-lg p-1.5', text: 'text-[12px]', px: 36 },
  tile: { box: 'h-10 w-10 rounded-[11px] p-1.5', text: 'text-[13px]', px: 40 },
  spot: { box: 'h-12 w-12 rounded-[14px] p-2', text: 'text-[15px]', px: 48 },
  md: { box: 'h-14 w-14 rounded-xl p-2', text: 'text-[17px]', px: 56 },
  lg: { box: 'h-16 w-16 rounded-2xl p-2.5', text: 'text-xl', px: 64 },
  xl: { box: 'h-20 w-20 rounded-[22px] p-3 sm:h-24 sm:w-24', text: 'text-2xl sm:text-[28px]', px: 96 },
};

/**
 * A company's logo on a fixed-size white tile (logos are drawn for light backgrounds, so the tile stays
 * white in dark mode too). No logo, or one that fails to load: a coloured initial badge of the same size.
 */
export default function CompanyLogo({ name, logo, size = 'md', className = '' }) {
  const [failedUrl, setFailedUrl] = useState('');
  const spec = SIZES[size] || SIZES.md;
  const url = logo?.url || '';
  const showImage = url && failedUrl !== url;

  if (!showImage) {
    return (
      <span
        role="img"
        aria-label={`${name} logo`}
        className={`flex shrink-0 select-none items-center justify-center bg-gradient-to-br font-bold tracking-tight text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.12)] ${spec.box} ${spec.text} ${initialTone(name)} ${className}`}
      >
        {initialsOf(name)}
      </span>
    );
  }

  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden border border-[#e9eaee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.05)] dark:border-white/10 ${spec.box} ${className}`}>
      <img
        src={url}
        alt={`${name} logo`}
        width={logo?.width || spec.px}
        height={logo?.height || spec.px}
        loading="lazy"
        decoding="async"
        draggable="false"
        onError={() => setFailedUrl(url)}
        className="h-full w-full object-contain"
      />
    </span>
  );
}
