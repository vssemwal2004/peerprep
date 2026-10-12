import { Sparkles, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';

// Keep the navbar integration; daily work now belongs to the adaptive mission plan.
export default function DailyCodingChallenge({ variant = 'card', className = '' }) {
  const { allowsModule } = useUniversityPolicy();
  if (!['questions', 'learning', 'assessments', 'interviews', 'events'].some(allowsModule)) return null;
  return <Link to="/student/quests" className={`inline-flex items-center gap-2 rounded-lg text-xs font-medium text-sky-600 dark:text-sky-400 ${variant === 'header' ? 'h-8 px-2.5 hover:bg-sky-50 dark:hover:bg-sky-500/10' : 'border border-slate-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#242424]'} ${className}`}><Sparkles size={16} />Daily challenge & quests<ChevronRight size={14} /></Link>;
}
