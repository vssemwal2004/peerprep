import './prepCoinIcon.css';

/**
 * The Prep Coin mark: a gold coin with the PeerPrep logo, matching the celebration coin.
 * @param {{ size?: number, shine?: boolean, pop?: boolean, className?: string, label?: string }} props
 *   shine adds a slow light sweep; pop plays one flip (e.g. when a balance changes); label makes it non-decorative.
 */
export default function PrepCoinIcon({ size = 20, shine = false, pop = false, className = '', label }) {
  const classes = ['prep-coin-icon', size >= 28 && 'prep-coin-icon--detailed', pop && 'prep-coin-icon--pop', className].filter(Boolean).join(' ');
  return (
    <span className={classes} style={{ '--pc-size': `${size}px` }} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
      <span className="prep-coin-icon__ring" />
      <span className="prep-coin-icon__mark" />
      {shine ? <span className="prep-coin-icon__sheen" /> : null}
    </span>
  );
}
