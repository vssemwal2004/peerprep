import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../utils/api';
import { useReadiness } from './useReadiness';
import ReadinessView from './ReadinessView';

/** Prep Analysis → Prep Readiness (/student/analysis/prep-readiness[#growth]). */
export default function PrepReadinessSection() {
  const [range, setRange] = useState('30d');
  const fetcher = useCallback(() => api.getPrepReadiness(range), [range]);
  const state = useReadiness(fetcher, [range]);
  const scrolled = useRef(false);
  // "View growth" from the profile lands on the chart once it has rendered.
  useEffect(() => {
    if (scrolled.current || !state.data || window.location.hash !== '#growth') return;
    scrolled.current = true;
    requestAnimationFrame(() => document.getElementById('growth')?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [state.data]);
  return <div data-guide="an-readiness-page"><ReadinessView {...state} range={range} onRange={setRange} mode="student" /></div>;
}
