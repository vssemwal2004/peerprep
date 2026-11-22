import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import BadgeMedal from './BadgeMedal';
import BadgeDetailDialog from './BadgeDetailDialog';
import { nextLocked } from './badgeModel';

const ring = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#242424]';

/**
 * Badges under the profile photo: every earned badge, five per row (a short last row is centred).
 * Each badge opens its own popup (BadgeDetailDialog). With none earned, the next three badges show
 * in their locked form. "All badges" opens the gallery.
 */
export default function BadgeShowcase({ collection, onOpen, loading = false }) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState(-1);
  const earned = collection?.earned || [];
  const shown = earned.length ? earned : nextLocked(collection?.locked || []).slice(0, 3);
  const total = collection?.total || 0;

  return (
    <section aria-label={`Badges: ${earned.length} of ${total} earned`} data-guide="pf-badge-shelf" className="mt-4 w-full">
      {loading && !shown.length ? (
        <div className="flex justify-center gap-2" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((key) => <span key={key} className="h-[52px] w-[45px] animate-pulse rounded-full bg-slate-100 dark:bg-white/[0.05]" />)}
        </div>
      ) : (
        // Each cell is a fifth of the row, so five fit per row and a short row stays centred.
        <ul className="flex flex-wrap justify-center gap-y-1.5">
          {shown.map((badge, index) => (
            <motion.li key={badge.uid} className="flex w-1/5 justify-center"
              initial={reduce ? false : { opacity: 0, scale: 0.5, rotateY: -90 }}
              animate={{ opacity: 1, scale: 1, rotateY: 0 }}
              transition={{ delay: 0.06 + Math.min(index, 15) * 0.04, type: 'spring', stiffness: 260, damping: 18 }}>
              <button type="button" onClick={() => setSelected(index)} title={badge.title}
                aria-label={`${badge.title}${badge.earned ? '' : ', locked'}. Open badge`}
                className={`rounded-xl p-0.5 transition-transform duration-200 hover:-translate-y-1 ${ring}`}>
                <BadgeMedal badge={badge} size={45} interactive />
              </button>
            </motion.li>
          ))}
        </ul>
      )}

      {!loading && !earned.length ? <p className="mt-1 text-[11.5px] text-slate-500 dark:text-zinc-400">No badges yet. Earn these next.</p> : null}

      {total && onOpen ? (
        <button type="button" onClick={() => onOpen('awards')}
          className={`mt-2 inline-flex items-center gap-0.5 rounded-md text-[11.5px] font-semibold text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200 ${ring}`}>
          All badges · {earned.length}/{total}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}

      <BadgeDetailDialog list={shown} index={selected} onIndex={setSelected} onClose={() => setSelected(-1)}
        onAll={onOpen ? () => { setSelected(-1); onOpen('awards'); } : undefined} />
    </section>
  );
}
