import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Laptop } from 'lucide-react';

// Phones and tablets: narrow screens, or touch-only devices of any width.
const SMALL_DEVICE = '(max-width: 1023.98px), (hover: none) and (pointer: coarse)';

function useSmallDevice() {
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia(SMALL_DEVICE).matches);
  useEffect(() => {
    const media = window.matchMedia(SMALL_DEVICE);
    const update = () => setSmall(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return small;
}

const COPY = {
  assessment: {
    title: 'Assessments open on a laptop or desktop',
    text: 'Tests need a full screen, a keyboard and the proctoring checks, which phones and tablets cannot run reliably. Open this link on a laptop or desktop to start or continue.',
    back: { label: 'Back to assessments', to: '/student/assessments' },
  },
  interview: {
    title: 'Interviews open on a laptop or desktop',
    text: 'AI interviews need a stable camera, microphone and a large screen. Open this link on a laptop or desktop to start or continue.',
    back: { label: 'Back to interviews', to: '/student/ai-interviews' },
  },
};

/**
 * Renders `children` on laptops and desktops only. On phones and tablets it explains why and where
 * to go instead. The page itself never loads there, so nothing (timer, camera) starts by accident.
 */
export default function DesktopOnly({ feature = 'assessment', children }) {
  const small = useSmallDevice();
  if (!small) return children;
  const copy = COPY[feature] || COPY.assessment;
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-sky-50 to-white px-5 py-10 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm rounded-2xl border border-sky-100 bg-white p-6 text-center shadow-[0_12px_40px_-16px_rgba(2,132,199,0.35)] dark:border-white/10 dark:bg-slate-900">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-lg shadow-sky-600/25">
          <Laptop className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-slate-950 dark:text-white">{copy.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.text}</p>
        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
          Nothing has started: your time and attempts are not affected.
        </p>
        <Link to={copy.back.to} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-sky-600 text-sm font-semibold text-white transition hover:bg-sky-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />{copy.back.label}
        </Link>
      </div>
    </div>
  );
}
