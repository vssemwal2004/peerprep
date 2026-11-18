import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, UserRoundSearch } from 'lucide-react';
import { api } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { hasStudentFeature } from '../studentFeatureAccess';
import CodingProgress from '../profile/CodingProgress';
import ActivitySection from '../profile/ActivitySection';
import PrepMatesModal from './PrepMatesModal';
import {
  NotSharedNotice, PeerBadgesCard, PeerHighlightBanner, PeerIdentityCard, PeerModulesCard,
  QuickPrepSheetsCard, RecentSolvedCard,
} from './PeerProfileCards';
import { PEER_NETWORK_EVENT, errorMessage } from './peerNetwork';

const MotionDiv = motion.div;

function ProfileSkeleton() {
  const block = 'animate-pulse rounded-xl border border-slate-200/80 bg-slate-50 dark:border-zinc-800 dark:bg-[#242424]';
  return (
    <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]" aria-busy="true" aria-label="Loading profile">
      <div className={`${block} h-[560px] rounded-2xl`} />
      <div className="space-y-4">
        <div className={`${block} h-24`} />
        <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0"><div className={`${block} h-56`} /><div className={`${block} h-56`} /></div>
        <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0"><div className={`${block} h-48`} /><div className={`${block} h-48`} /></div>
      </div>
    </div>
  );
}

/**
 * A classmate's profile, in the same layout and theme as the student's own profile: identity and
 * network on the left, Prep Score, coding, badges, modules, Quick Prep and recent solves on the right.
 */
export default function PeerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [matesOpen, setMatesOpen] = useState(false);
  const isSelf = String(user?._id || '') === String(id);
  const canOpenProblems = hasStudentFeature(user, 'prep_coding');
  const canOpenQuickPrep = hasStudentFeature(user, 'quickprep');

  const load = useCallback((quiet = false) => {
    if (!quiet) { setData(null); setError(null); }
    return api.getPeerProfile(id)
      .then((result) => { setData(result); setError(null); })
      .catch((reason) => { if (!quiet) setError(reason); });
  }, [id]);

  useEffect(() => { load(); setMatesOpen(false); }, [load]);
  useEffect(() => {
    const refresh = () => load(true);
    window.addEventListener(PEER_NETWORK_EVENT, refresh);
    return () => window.removeEventListener(PEER_NETWORK_EVENT, refresh);
  }, [load]);

  const profile = data?.profile;
  const progress = data?.progress;
  const coding = progress?.modules?.find((module) => module.key === 'coding');
  const breakdown = Object.fromEntries((coding?.breakdown || []).map((part) => [part.key, part]));
  const hasQuickPrep = Boolean(progress?.modules?.some((module) => module.key === 'quickprep'));
  const hasLearning = Boolean(progress?.modules?.some((module) => module.key === 'learning'));

  return (
    <div className="min-h-screen bg-white pt-3 font-['Inter',ui-sans-serif,system-ui,sans-serif] antialiased [font-feature-settings:'cv11','ss01'] dark:bg-[#1a1a1a]">
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-1 sm:px-6">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/student/peers'))}
          className="mb-3 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
        </button>

        {error ? (
          <div className="mx-auto mt-6 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-8 text-center dark:border-zinc-800 dark:bg-[#242424]">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400"><UserRoundSearch className="h-6 w-6" aria-hidden="true" /></span>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Profile not available</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              {error?.response?.status === 404 ? 'This student is not in your university on PeerPrep, or has hidden their profile.' : errorMessage(error)}
            </p>
            <Link to="/student/peers" className="mt-1 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700">Find classmates</Link>
          </div>
        ) : !data ? <ProfileSkeleton /> : (
          <MotionDiv initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <aside aria-label={`${profile.name}’s profile`} className="min-w-0 lg:sticky lg:top-20 lg:self-start">
              <PeerIdentityCard
                profile={profile}
                progress={progress}
                network={data.network}
                relation={data.relation}
                isSelf={isSelf}
                onRelationChange={(relation) => setData((prev) => ({ ...prev, relation }))}
                onOpenMates={() => setMatesOpen(true)}
              />
            </aside>

            <main className="min-w-0 space-y-4">
              {progress?.unavailable ? <NotSharedNotice name={profile.name} /> : (
                <>
                  <PeerHighlightBanner name={profile.name} progress={progress} />

                  {/* Practice only: coding, badges, recent solves, Quick Prep sheets and learning. */}
                  <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                    {coding ? (
                      <CodingProgress
                        className="h-full"
                        totalSolved={coding.solved}
                        totalProblems={coding.total}
                        easySolved={breakdown.easy?.solved}
                        mediumSolved={breakdown.medium?.solved}
                        hardSolved={breakdown.hard?.solved}
                        totalsByDifficulty={{ easy: breakdown.easy?.total, medium: breakdown.medium?.total, hard: breakdown.hard?.total }}
                        attemptedProblems={progress?.coding?.attempted}
                        description="Practice problems solved by difficulty."
                        action={canOpenProblems ? undefined : null}
                        showActivity={false}
                      />
                    ) : null}
                    <PeerBadgesCard name={profile.name} progress={progress} />
                  </div>

                  {/* Practice-only heat map (no logins, tests or interviews), same card as the own profile. */}
                  {progress?.activity ? (
                    <ActivitySection
                      activity={progress.activity.byDate}
                      activityStats={{ totalActiveDays: progress.activity.activeDays }}
                      loading={false}
                    />
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                    {coding ? <RecentSolvedCard name={profile.name} coding={progress?.coding} canOpen={canOpenProblems} /> : null}
                    {hasQuickPrep ? <QuickPrepSheetsCard name={profile.name} sheets={progress?.quickPrepSheets} canOpen={canOpenQuickPrep} /> : null}
                    {hasLearning ? <PeerModulesCard modules={progress?.modules} /> : null}
                  </div>
                </>
              )}
            </main>
          </MotionDiv>
        )}
      </div>

      {profile && (
        <PrepMatesModal
          open={matesOpen}
          onClose={() => setMatesOpen(false)}
          owner={profile}
          count={data?.network?.prepMates}
          isSelf={isSelf}
        />
      )}
    </div>
  );
}
