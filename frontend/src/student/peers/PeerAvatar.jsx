import { useState } from 'react';
import { peerInitials } from './peerNetwork';

const SIZES = {
  sm: 'h-8 w-8 rounded-lg text-[11px]',
  md: 'h-10 w-10 rounded-xl text-xs',
  lg: 'h-14 w-14 rounded-2xl text-base',
  xl: 'h-24 w-24 rounded-3xl text-2xl',
};

/**
 * Photo, or initials when there is none. `color` (a hex) tints the initials in that person's own
 * colour, e.g. blue for you and orange for your Prep Mate on the comparison page.
 */
export default function PeerAvatar({ name, url, size = 'md', className = '', color = '' }) {
  const [failed, setFailed] = useState(false);
  const shape = SIZES[size] || SIZES.md;
  if (url && !failed) {
    return <img src={url} alt="" onError={() => setFailed(true)} className={`${shape} shrink-0 object-cover ${className}`} />;
  }
  const tinted = /^#[0-9a-f]{6}$/i.test(color);
  return (
    <span aria-hidden="true" className={`${shape} flex shrink-0 items-center justify-center font-bold text-white ${tinted ? '' : 'bg-gradient-to-br from-sky-500 to-indigo-500'} ${className}`}
      style={tinted ? { background: `linear-gradient(135deg, ${color}cc, ${color})` } : undefined}>
      {peerInitials(name)}
    </span>
  );
}
