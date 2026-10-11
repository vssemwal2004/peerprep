import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PartyPopper, X } from 'lucide-react';
import { ChallengeGlyph } from './ChallengeArtwork';
import './challengeCelebration.css';

const COPY = {
  daily: ['You’re in!', 'One small step. A great start.'],
  weekly: ['Let’s build momentum!', 'Your next chapter starts now.'],
  monthly: ['Think bigger. Go further.', 'A month of possibilities is yours.'],
};
const COLORS = ['#38bdf8', '#a78bfa', '#fbbf24', '#34d399', '#fb7185'];

export default function ChallengeAcceptanceCelebration({ kind, rewardPoints, nextHref, onClose, returnFocusRef }) {
  const dialogRef = useRef(null), closeRef = useRef(null);
  const id = useId();
  const [title, subtitle] = COPY[kind] || COPY.daily;
  useEffect(() => {
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const returnNode = returnFocusRef.current;
    const locks = [document.body, ...document.querySelectorAll('[data-app-scroll-container]')].filter(node => node.style.overflow !== 'hidden').map(node => [node, node.style.overflow]);
    locks.forEach(([node]) => { node.style.overflow = 'hidden'; });
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', ''); // DOM-only test environments.
    closeRef.current?.focus({ preventScroll: true });
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const controls = [...dialog.querySelectorAll('button, a[href]')];
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      dialog.close?.();
      locks.forEach(([node, overflow]) => { node.style.overflow = overflow; });
      const target = returnNode?.isConnected ? returnNode.querySelector('a[href]') || returnNode : opener?.isConnected && opener !== document.body ? opener : null;
      target?.focus({ preventScroll: true });
    };
  }, [onClose, returnFocusRef]);

  return <dialog ref={dialogRef} data-challenge-celebration data-platform-popup-root className={`challenge-celebration challenge-celebration--${kind}`} aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="challenge-celebration__card">
      <button ref={closeRef} type="button" aria-label="Close challenge celebration" onClick={onClose} className="challenge-celebration__close"><X size={18} /></button>
      <div className="challenge-celebration__scene" aria-hidden="true">
        <svg viewBox="0 0 440 190" preserveAspectRatio="none" className="challenge-celebration__wave"><path d="M0 0h440v118c-108 91-244-38-440 50Z" fill="currentColor" opacity=".08" /><path d="M-30 99C100 12 249 190 470 64" fill="none" stroke="currentColor" opacity=".12" strokeWidth="28" /></svg>
        <div className="challenge-celebration__emblem"><ChallengeGlyph kind={kind} /></div>
        <PartyPopper className="challenge-celebration__popper challenge-celebration__popper--left" size={32} /><PartyPopper className="challenge-celebration__popper challenge-celebration__popper--right" size={32} />
        <div className="challenge-celebration__confetti">{Array.from({ length: 40 }, (_, index) => <span key={index} style={{ '--origin': `${index % 2 ? 95 : -95}px`, '--dx': `${((index * 47) % 340) - 170}px`, '--dy': `${-40 - (index * 29) % 120}px`, '--turn': `${index * 73}deg`, '--delay': `${(index % 7) * 35}ms`, background: COLORS[index % COLORS.length], borderRadius: index % 3 ? '2px' : '50%' }} />)}</div>
      </div>
      <div className="challenge-celebration__body">
        <p className="challenge-celebration__eyebrow" id={`${id}-title`}>{kind} challenge accepted</p>
        <h2>{title}</h2><p id={`${id}-description`}>{subtitle}</p>
        <span className="challenge-celebration__reward">{rewardPoints} XP to earn</span>
        {nextHref ? <Link to={nextHref} onClick={onClose} className="challenge-celebration__action">Let’s get started<ArrowRight size={16} /></Link> : <button type="button" onClick={onClose} className="challenge-celebration__action">Let’s do this<ArrowRight size={16} /></button>}
        <p className="challenge-celebration__note">XP is awarded after verified completion.</p>
      </div>
    </div>
  </dialog>;
}
