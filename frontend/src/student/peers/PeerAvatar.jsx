import { useState } from 'react';
import { peerInitials } from './peerNetwork';

const SIZES = {
  sm: 'h-8 w-8 rounded-lg text-[11px]',
  md: 'h-10 w-10 rounded-xl text-xs',
  lg: 'h-14 w-14 rounded-2xl text-base',
  xl: 'h-24 w-24 rounded-3xl text-2xl',
};

export default function PeerAvatar({ name, url, size = 'md', className = '' }) {
  const [failed, setFailed] = useState(false);
  const shape = SIZES[size] || SIZES.md;
  if (url && !failed) {
    return <img src={url} alt="" onError={() => setFailed(true)} className={`${shape} shrink-0 object-cover ${className}`} />;
  }
  return (
    <span aria-hidden="true" className={`${shape} flex shrink-0 items-center justify-center bg-gradient-to-br from-sky-500 to-indigo-500 font-bold text-white ${className}`}>
      {peerInitials(name)}
    </span>
  );
}
