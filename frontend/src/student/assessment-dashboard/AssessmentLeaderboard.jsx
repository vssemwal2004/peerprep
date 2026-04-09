import { motion } from 'framer-motion';
import { Crown, Medal, Trophy } from 'lucide-react';
import { formatScore, getInitials } from './assessmentDashboardUtils';

const podiumStyles = {
  1: { icon: Crown, className: 'lg:-mt-8', accent: 'from-amber-300 to-orange-400' },
  2: { icon: Medal, className: 'lg:mt-6', accent: 'from-slate-200 to-slate-300' },
  3: { icon: Trophy, className: 'lg:mt-10', accent: 'from-orange-200 to-amber-300' },
};

function Avatar({ name, avatarUrl, size = 'h-16 w-16' }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name} className={`${size} rounded-full object-cover`} />;
  }

  return (
    <div className={`${size} flex items-center justify-center rounded-full bg-slate-900 text-white font-semibold`}>
      {getInitials(name)}
    </div>
  );
}

function PodiumCard({ user }) {
  const style = podiumStyles[user.rank];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm ${style.className}`}
    >
      <div className={`h-20 bg-gradient-to-r ${style.accent}`} />
      <div className="-mt-10 px-5 pb-5 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
        <div className="mt-3 flex justify-center">
          <Avatar name={user.name} avatarUrl={user.avatarUrl} size="h-20 w-20" />
        </div>
        <div className="mt-3 text-sm font-medium text-slate-500">Rank {user.rank}</div>
        <div className="mt-1 text-lg font-semibold text-slate-900">{user.name}</div>
        <div className="mt-2 text-3xl font-bold text-slate-900">{formatScore(user.score)}</div>
      </div>
    </motion.div>
  );
}

export default function AssessmentLeaderboard({ entries = [] }) {
  const topThree = entries.slice(0, 3);
  const podium = [topThree[1], topThree[0], topThree[2]].filter(Boolean);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        {podium.length ? (
          <div className="grid gap-4 lg:grid-cols-3 lg:items-end">
            {podium.map((user) => (
              <PodiumCard key={user.studentId} user={user} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500">No ranking data available.</div>
        )}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="max-h-[620px] overflow-y-auto p-4">
          <div className="space-y-3">
            {entries.length ? entries.map((user) => (
              <div
                key={user.studentId}
                className={`flex flex-col gap-4 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center sm:justify-between ${
                  user.isCurrentStudent ? 'border-sky-200 bg-sky-50' : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-sm font-semibold text-slate-900 shadow-sm">
                    {user.rank}
                  </div>
                  <Avatar name={user.name} avatarUrl={user.avatarUrl} size="h-11 w-11" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{user.name}</span>
                      {user.isCurrentStudent ? (
                        <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-medium text-white">You</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="text-lg font-semibold text-slate-900">{formatScore(user.score)}</div>
              </div>
            )) : (
              <div className="py-12 text-center text-sm text-slate-500">No ranking data available.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
