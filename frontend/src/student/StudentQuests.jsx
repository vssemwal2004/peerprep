import { Check, Layers, RefreshCw, Zap } from 'lucide-react';
import ChallengeArtwork from './engagement/ChallengeArtwork';
import QuestsSection from './quests/QuestsSection';
import useQuests from './quests/useQuests';
import { useUniversityPolicy } from '../platform/UniversityPolicyContext';
import './engagement/challengeStudio.css';

/** Admin-published preparation sheets only. Daily challenges live outside QuickPrep. */
export default function StudentQuests() {
  const { allowsModule } = useUniversityPolicy();
  const enabled = allowsModule('questions');
  const sheets = useQuests({ enabled });
  const completed = sheets.quests.filter((sheet) => sheet.completedAt).length;
  const inProgress = sheets.quests.filter((sheet) => sheet.started && !sheet.completedAt).length;
  const count = (value) => sheets.loading || sheets.error ? '—' : value.toLocaleString('en-IN');

  return <div className="challenge-studio">
    <div className="challenge-studio__inner">
      <header className="challenge-page-heading"><h1><Zap size={20} />QuickPrep</h1><button type="button" onClick={sheets.reload} disabled={sheets.loading || !enabled} className="challenge-refresh"><RefreshCw size={14} className={sheets.loading ? 'animate-spin motion-reduce:animate-none' : ''} />Refresh sheets</button></header>
      <section className="challenge-hero" aria-label="Your preparation sheets">
        <svg className="challenge-hero__curves" viewBox="0 0 1200 270" preserveAspectRatio="none" aria-hidden="true"><path d="M480-70C640 190 1000-120 1280 120v180H420C580 200 340 30 480-70Z" fill="white" opacity=".035" /><path d="M720-50C500 130 1100 260 1290 100" stroke="white" strokeWidth="1" opacity=".16" fill="none" /><path d="M-90 230C260 30 400 420 780 190S1090 150 1270 210" fill="none" stroke="#67e8f9" strokeWidth="60" opacity=".06" /></svg>
        <div className="challenge-hero__copy"><span className="challenge-hero__eyebrow"><span />CURATED BY YOUR ADMIN</span><h2>Focused sheets.<br /><span>Confident preparation.</span></h2><p>Explore question sheets prepared by your university. Pick a sheet and learn at your own pace.</p></div>
        <ChallengeArtwork className="challenge-hero__art" />
        {enabled && <div className="challenge-hero__stats">
          <div><Layers size={16} /><span><small>Available sheets</small><strong>{count(sheets.quests.length)}</strong></span></div>
          <div><Zap size={16} /><span><small>In progress</small><strong>{count(inProgress)}</strong></span></div>
          <div><Check size={16} /><span><small>Completed sheets</small><strong>{count(completed)}</strong></span></div>
        </div>}
      </section>
      {enabled
        ? <QuestsSection quests={sheets.quests} loading={sheets.loading} error={sheets.error} onRetry={sheets.reload} />
        : <section className="challenge-empty"><Layers className="mx-auto h-10 w-10 text-sky-500" aria-hidden="true" /><h2>QuickPrep is not available</h2><p>Your university has not enabled question sheets. Ask your administrator about access.</p></section>}
    </div>
  </div>;
}
