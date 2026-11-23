import { Link } from 'react-router-dom';
import {
  BarChart3, BookOpen, CalendarRange, CheckCircle2, ChevronRight, CodeXml, GitBranch, Github, Globe,
  GraduationCap, Handshake, Linkedin, ListChecks, Lock, Map as MapIcon, Medal, ShieldCheck, Trophy,
} from 'lucide-react';
import { Card, EmptyRow, ProgressBar } from '../profile/ui';
import { focusRing } from '../profile/format';
import { levelTheme } from '../profile/levelTheme';
import LevelMedallion from '../profile/LevelMedallion';
import { computeAwards } from '../profile/achievements';
import BadgeMedal from '../badges/BadgeMedal';
import { formatScore } from '../prepScore/formatScore';
import BadgeShowcase from '../badges/BadgeShowcase';
import { fromAward, orderBadges } from '../badges/badgeModel';
import { difficultyTheme } from '../../utils/difficultyTheme';
import PeerAvatar from './PeerAvatar';
import PeerActions from './PeerActions';
import { PEER_TERMS, compactCount } from './peerNetwork';
import PageGuideButton from '../../guide/platform/PageGuideButton';

const TOTAL_LEVELS = 6;
const firstNameOf = (name) => String(name || 'This student').trim().split(/\s+/)[0];
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

function SectionTitle({ children }) {
  return <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">{children}</h2>;
}

function DetailRow({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 dark:bg-zinc-800/70 dark:text-zinc-400" aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-zinc-500">{label}</dt>
        <dd className={`truncate text-[13px] font-medium ${value ? 'text-slate-800 dark:text-zinc-200' : 'font-normal text-slate-400 dark:text-zinc-500'}`}>{value || 'Not added'}</dd>
      </div>
    </div>
  );
}

const LINKS = [
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
  { key: 'github', label: 'GitHub', Icon: Github },
  { key: 'portfolio', label: 'Portfolio', Icon: Globe },
];

/**
 * "12 Prep Mates" row that opens the Prep Mates popup. Used on a classmate's profile card and on
 * the student's own profile card.
 */
export function PrepMatesButton({ count, onOpen, label = 'Prep Mates', compact = false }) {
  if (compact) {
    // Half-width tile for the profile sidebar's stat row (next to Prep Coin).
    return (
      <button type="button" onClick={onOpen} aria-label={`${count ?? 0} Prep Mates. Show ${label}`}
        className={`group flex h-full w-full items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 px-2.5 py-2 text-left transition hover:border-sky-200 hover:bg-sky-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-sky-900 dark:hover:bg-sky-500/10 ${focusRing}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-800 dark:text-sky-300 dark:ring-zinc-700"><Handshake className="h-4 w-4" aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="block text-[15px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{compactCount(count)}</span>{' '}
          <span className="block truncate text-[10.5px] font-medium text-slate-500 dark:text-zinc-400">{PEER_TERMS.prepMates}</span>
        </span>
      </button>
    );
  }
  return (
    <button type="button" onClick={onOpen} aria-label={`${count ?? 0} Prep Mates. Show ${label}`}
      className={`group flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 text-left transition hover:border-sky-200 hover:bg-sky-50/70 dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-sky-900 dark:hover:bg-sky-500/10 ${focusRing}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-sky-600 shadow-sm ring-1 ring-slate-200/70 dark:bg-zinc-800 dark:text-sky-300 dark:ring-zinc-700"><Handshake className="h-[18px] w-[18px]" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{compactCount(count)} <span className="text-[13px] font-semibold text-slate-600 dark:text-zinc-300">{PEER_TERMS.prepMates}</span></span>
        <span className="block text-[11px] text-slate-500 dark:text-zinc-400">Tap to see the list</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-sky-600" aria-hidden="true" />
    </button>
  );
}

/** Left column: who the classmate is, their Prep Mates, and what you can do. Mirrors ProfileSidebar. */
export function PeerIdentityCard({ profile, progress, network, relation, isSelf, onRelationChange, onOpenMates, shared = null }) {
  const level = progress?.level;
  const theme = levelTheme(level?.level);
  const LevelIcon = theme.Icon;
  const firstName = firstNameOf(profile.name);
  // Earned milestone badges for the shelf under the name (same medals as the own profile).
  const badgeItems = progress?.badgeMetrics ? computeAwards(progress.badgeMetrics, { features: progress.badgeFeatures || null }).awards.map(fromAward) : [];
  const badgeCollection = { items: badgeItems, ...orderBadges(badgeItems), total: badgeItems.length };
  const score = shared?.prepScore;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_-12px_rgba(14,116,144,0.18)] dark:border-zinc-800 dark:bg-[#242424]">
      <div className="relative h-24 shrink-0 overflow-hidden bg-gradient-to-br from-sky-500 via-sky-400 to-cyan-300 dark:from-sky-800 dark:via-sky-700 dark:to-cyan-800" aria-hidden="true">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(rgba(255,255,255,0.9)_1px,transparent_1px)] [background-size:14px_14px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
        <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/25 blur-2xl" />
        <div className="absolute -left-8 top-10 h-28 w-28 rounded-full bg-indigo-400/30 blur-2xl" />
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-[#242424]" />
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <div className="relative z-10 -mt-12 flex flex-col items-center text-center" data-guide="pp-identity">
          <div className="rounded-full bg-gradient-to-br from-sky-400 via-cyan-300 to-indigo-400 p-[3px] shadow-lg shadow-sky-500/20">
            <PeerAvatar name={profile.name} url={profile.avatarUrl} className="!h-[84px] !w-[84px] !rounded-full !text-3xl ring-[3px] ring-white dark:ring-[#242424]" />
          </div>
          <div className="mt-2.5 flex max-w-full items-center justify-center gap-1.5">
            <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-slate-900 dark:text-zinc-50" title={profile.name}>{profile.name}</h1>
            <PageGuideButton />
          </div>
          <p className="max-w-full truncate text-[13px] text-slate-500 dark:text-zinc-400">
            {[profile.course, profile.branch].filter(Boolean).join(' · ') || 'Student'}
          </p>
          {level?.title ? (
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${theme.soft}`}>
              <LevelIcon className="h-3.5 w-3.5" aria-hidden="true" />{level.title}<span className="font-normal opacity-70">· Lv {level.level}</span>
            </span>
          ) : null}
          {badgeItems.length ? <BadgeShowcase collection={badgeCollection} /> : null}
          <p className={`mt-3 line-clamp-4 text-[12.5px] leading-relaxed ${profile.bio ? 'text-slate-600 dark:text-zinc-300' : 'italic text-slate-400 dark:text-zinc-500'}`}>
            {profile.bio || `${firstName} hasn’t added a bio yet.`}
          </p>
        </div>

        {/* Prep Mates + Prep Score side by side. Prep Score shows only if the student shares it. */}
        <div className="grid grid-cols-2 gap-2">
          <div data-guide="pp-mates"><PrepMatesButton count={network?.prepMates} onOpen={onOpenMates} label={`${firstName}’s Prep Mates`} compact /></div>
          <div className="flex h-full items-center gap-2.5 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white px-2.5 py-2 dark:border-sky-500/15 dark:from-sky-500/[0.08] dark:to-transparent"
            title={shared ? `${firstName} shares their Prep Score with Prep Mates.` : `${firstName}’s Prep Score is private${isSelf ? '. Share it in Edit Profile → Privacy.' : '.'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-600 text-white">{shared ? <Trophy className="h-4 w-4" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}</span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-tight tabular-nums text-slate-900 dark:text-white">{shared && Number.isFinite(Number(score)) ? formatScore(score) : 'Private'}</span>
              <span className="block truncate text-[10.5px] font-medium text-slate-500 dark:text-zinc-400">Prep Score</span>
            </span>
          </div>
        </div>

        {isSelf ? (
          <Link to="/student/profile" className={`inline-flex w-full items-center justify-center rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-white/5 ${focusRing}`}>
            This is how classmates see you · Edit profile
          </Link>
        ) : (
          // One compact action row: the Prep Mate action, plus Compare beside it once you are Prep Mates.
          <div className={`grid gap-2 ${relation?.mate === 'mates' ? 'grid-cols-2' : 'grid-cols-1'}`} data-guide="pp-actions">
            <PeerActions peer={profile} relation={relation} onRelationChange={onRelationChange} size="card" block />
            {relation?.mate === 'mates' && (
              <Link to={`/student/peers/${profile.id}/compare`} className={`inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white ${focusRing}`}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" /> Compare
              </Link>
            )}
          </div>
        )}

        <section aria-labelledby="peer-about-title" data-guide="pp-about" className="border-t border-slate-100 pt-3 dark:border-zinc-800">
          <SectionTitle><span id="peer-about-title">About</span></SectionTitle>
          {/* Compact: three short facts in one row. */}
          <dl className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'Course', value: profile.course, Icon: BookOpen },
              { label: 'Branch', value: profile.branch, Icon: GitBranch },
              { label: 'Semester', value: profile.semester ? `Semester ${profile.semester}` : '', Icon: CalendarRange },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="min-w-0 rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-white/[0.03]">
                <dt className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-zinc-500"><Icon className="h-3 w-3" aria-hidden="true" />{label}</dt>
                <dd className={`mt-0.5 truncate text-[12px] font-medium ${value ? 'text-slate-800 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-500'}`} title={value || undefined}>{value || '—'}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center gap-2">
            <span id="peer-links-title" className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-500">Links</span>
            {LINKS.map(({ key, label, Icon }) => {
              const href = profile.links?.[key];
              return href ? (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" title={label} aria-label={`${profile.name} on ${label} (opens in a new tab)`}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-sky-700 dark:hover:bg-sky-500/10 dark:hover:text-sky-300 ${focusRing}`}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ) : (
                <span key={key} role="img" title={`${label} not added`} aria-label={`${label} not added`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-slate-200 text-slate-300 dark:border-zinc-700 dark:text-zinc-600">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
              );
            })}
          </div>
        </section>

        <p data-guide="pp-privacy" className="mt-auto flex items-center justify-center gap-1 text-center text-[11px] text-slate-400 dark:text-zinc-500">
          <ShieldCheck className="h-3 w-3 shrink-0" aria-hidden="true" />Contact details and Prep Coins stay private. Scores show only if shared with Prep Mates.
        </p>
      </div>
    </div>
  );
}

/**
 * Top banner in the own-profile style: level on the blue panel, badges and practice totals beside
 * it. Private numbers (Prep Score, Prep Coins) are never shown for another student.
 */
export function PeerHighlightBanner({ name, progress }) {
  const level = progress?.level;
  const metrics = progress?.badgeMetrics || {};
  const chip = (tone, Icon) => <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span>;
  const items = [
    progress?.badges ? { key: 'badges', label: 'Badges earned', value: progress.badges.earned, helper: progress.badges.challenges ? plural(progress.badges.challenges, 'challenge badge') : 'Milestone badges', icon: chip('bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300', Medal) } : null,
    { key: 'solved', label: 'Problems solved', value: compactCount(metrics.solved), helper: metrics.hardSolved ? `${metrics.hardSolved} hard` : 'Practice problems', icon: chip('bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300', CodeXml) },
    { key: 'streak', label: 'Best streak', value: plural(metrics.bestStreak || 0, 'day'), helper: 'Days in a row', icon: chip('bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300', Trophy) },
  ].filter(Boolean);

  return (
    <section aria-label={`${name}’s highlights`} data-guide="pp-highlights" className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.02)] dark:border-zinc-800 dark:bg-[#242424]">
      <div className={`grid ${level ? 'sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]' : ''}`}>
        {level && (
          <div className="relative flex items-center gap-4 overflow-hidden bg-gradient-to-br from-sky-500 to-sky-700 px-5 py-4 text-white">
            <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-xl" aria-hidden="true" />
            <LevelMedallion level={level.level} size="sm" className="!ring-2 !ring-white/40" />
            <div className="min-w-0">
              <h2 className="text-[12.5px] font-medium text-sky-100">Level {level.level} of {TOTAL_LEVELS}</h2>
              <p className="mt-0.5 line-clamp-2 text-[22px] font-bold leading-tight tracking-[-0.02em]">{level.title}</p>
            </div>
          </div>
        )}
        <div className={`grid gap-3 px-5 py-4 ${items.length >= 3 ? 'sm:grid-cols-3' : items.length === 2 ? 'sm:grid-cols-2' : ''}`}>
          {items.map((item) => (
            <div key={item.key} className="flex min-w-0 items-center gap-3">
              {item.icon}
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">{item.label}</p>
                <p className="line-clamp-2 text-[15px] font-bold leading-tight tracking-tight text-slate-900 dark:text-zinc-50">{item.value}</p>
                <p className="truncate text-[11px] text-slate-400 dark:text-zinc-500">{item.helper}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** One milestone badge: the shared medal (locked form when not earned) and its name. */
function AwardMedal({ award }) {
  const status = award.earned ? 'Earned' : `${Math.min(award.value, award.target)}/${award.target}`;
  return (
    <li className="group flex flex-col items-center gap-1 text-center" title={`${award.title}: ${award.description} (${status})`}>
      <span className="transition-transform duration-300 group-hover:-translate-y-1"><BadgeMedal badge={fromAward(award)} size={44} interactive /></span>
      <span className={`line-clamp-2 text-[10px] font-medium leading-tight ${award.earned ? 'text-slate-700 dark:text-zinc-200' : 'text-slate-400 dark:text-zinc-500'}`}>{award.title}</span>
      <span className="sr-only">{award.earned ? 'earned' : `locked, ${status}`}</span>
    </li>
  );
}

/** Level + every milestone badge, earned in colour and locked faded, like the own-profile card. */
export function PeerBadgesCard({ name, progress }) {
  const awards = computeAwards(progress?.badgeMetrics || {});
  const level = progress?.level;
  const theme = levelTheme(level?.level);
  const ordered = [...awards.awards].sort((a, b) => (Number(b.earned) - Number(a.earned)) || (b.progress - a.progress));
  const challengeBadges = progress?.badges?.challenges || 0;
  return (
    <Card title="Badges" description={`${awards.earnedCount} of ${awards.awards.length} milestone badges earned`} icon={<Medal className="h-4 w-4" />} className="h-full">
      <div className="flex flex-col gap-3">
        {level ? (
          <div className="flex items-center gap-3 rounded-lg bg-slate-50/80 px-2.5 py-2 dark:bg-zinc-900/50">
            <LevelMedallion level={level.level} size="sm" className="!ring-2" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-slate-900 dark:text-zinc-50">
                {level.title}
                <span className={`ml-1.5 rounded px-1 py-px align-middle text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset ${theme.soft}`}>Lv {level.level}/{TOTAL_LEVELS}</span>
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-200/70 dark:bg-zinc-800" aria-hidden="true">
                <div className={`h-full rounded-full bg-gradient-to-r ${theme.gradient}`} style={{ width: `${Math.round((level.level / TOTAL_LEVELS) * 100)}%` }} />
              </div>
            </div>
          </div>
        ) : null}
        <ul className="grid grid-cols-5 gap-x-1 gap-y-3">
          {ordered.map((award) => <AwardMedal key={award.id} award={award} />)}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-zinc-800 dark:text-zinc-400">
          <span>{challengeBadges ? `+ ${plural(challengeBadges, 'challenge badge')}` : `${firstNameOf(name)}’s verified achievements`}</span>
          {awards.nextAward ? (
            <span>Next: <span className="font-semibold text-slate-700 dark:text-zinc-200">{awards.nextAward.title}</span> <span className="tabular-nums">({Math.min(awards.nextAward.value, awards.nextAward.target)}/{awards.nextAward.target})</span></span>
          ) : <span className="font-medium text-emerald-600 dark:text-emerald-400">All earned!</span>}
        </div>
      </div>
    </Card>
  );
}

const MODULE_META = {
  learning: { Icon: BookOpen, tone: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-300', bar: 'bg-violet-500' },
  quickprep: { Icon: MapIcon, tone: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300', bar: 'bg-indigo-500' },
};

/** Learning and Quick Prep completion (topics and questions done against their totals). */
export function PeerModulesCard({ modules = [] }) {
  const rows = modules.filter((module) => MODULE_META[module.key]);
  return (
    <Card title="Learning progress" description="Topics and Quick Prep questions completed" icon={<ListChecks className="h-4 w-4" />} className="h-full">
      {rows.length === 0 ? <EmptyRow message="No module progress to show." /> : (
        <ul className="space-y-3">
          {rows.map((module) => {
            const meta = MODULE_META[module.key] || MODULE_META.learning;
            const hasTotal = Number(module.total) > 0;
            const percent = hasTotal ? Math.round((module.solved / module.total) * 100) : null;
            return (
              <li key={module.key} className="flex items-center gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}><meta.Icon className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[13px] font-semibold text-slate-800 dark:text-zinc-100">{module.label}</p>
                    <p className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-400">
                      <strong className="font-semibold text-slate-800 dark:text-zinc-100">{module.solved}</strong>
                      {hasTotal ? ` / ${module.total} ${module.unit}` : ` ${module.unit}`}
                    </p>
                  </div>
                  {hasTotal ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="min-w-0 flex-1"><ProgressBar value={module.solved} max={module.total} colorClass={meta.bar} label={`${module.label} completion`} /></div>
                      <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums text-slate-500 dark:text-zinc-400">{percent}%</span>
                    </div>
                  ) : null}
                  {module.key === 'quickprep' && module.sheetsStarted > 0 ? (
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-zinc-500">{module.sheetsCompleted} of {plural(module.sheetsStarted, 'sheet')} completed</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Quick Prep sheets (question sets your admin prepared) the classmate has started. */
export function QuickPrepSheetsCard({ name, sheets = [], canOpen }) {
  return (
    <Card title="Quick Prep sheets" description="Question sets prepared by your institution" icon={<MapIcon className="h-4 w-4" />} className="h-full">
      {sheets.length === 0 ? <EmptyRow icon={<MapIcon className="h-3.5 w-3.5" />} message={`${firstNameOf(name)} hasn’t started a Quick Prep sheet yet.`} ctaLabel={canOpen ? 'Browse sheets' : undefined} ctaTo={canOpen ? '/student/quickprep' : undefined} /> : (
        <ul className="space-y-3">
          {sheets.map((sheet) => {
            const percent = sheet.total ? Math.round((sheet.solved / sheet.total) * 100) : 0;
            const title = (
              <span className="truncate text-[13px] font-semibold text-slate-800 group-hover:text-sky-700 dark:text-zinc-100 dark:group-hover:text-sky-300">{sheet.title}</span>
            );
            return (
              <li key={sheet.slug || sheet.title}>
                <div className="flex items-baseline justify-between gap-2">
                  {canOpen && sheet.slug ? <Link to={`/student/quickprep/${encodeURIComponent(sheet.slug)}`} className={`group min-w-0 truncate rounded ${focusRing}`}>{title}</Link> : <span className="min-w-0 truncate">{title}</span>}
                  <span className="shrink-0 text-[12px] tabular-nums text-slate-500 dark:text-zinc-400">
                    {sheet.completed ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Completed</span> : `${sheet.solved} / ${sheet.total}`}
                  </span>
                </div>
                <div className="mt-1.5"><ProgressBar value={sheet.solved} max={sheet.total || 1} colorClass={sheet.completed ? 'bg-emerald-500' : 'bg-indigo-500'} label={`${sheet.title}: ${percent}% solved`} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}


/** Practice problems the classmate solved most recently (titles only). */
export function RecentSolvedCard({ name, coding, canOpen }) {
  const items = coding?.recentSolved || [];
  return (
    <Card title="Recently solved" description="Latest accepted practice problems" icon={<CodeXml className="h-4 w-4" />} className="h-full">
      {items.length === 0 ? <EmptyRow icon={<CodeXml className="h-3.5 w-3.5" />} message={`${firstNameOf(name)} hasn’t solved a practice problem yet.`} ctaLabel={canOpen ? 'Start practising' : undefined} ctaTo={canOpen ? '/problems' : undefined} /> : (
        <ul className="-mx-1 divide-y divide-slate-100 dark:divide-zinc-800">
          {items.map((problem) => {
            const content = (
              <>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700 group-hover:text-sky-700 dark:text-zinc-200 dark:group-hover:text-sky-300">{problem.title}</span>
                {problem.difficulty ? <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${difficultyTheme(problem.difficulty).pill}`}>{problem.difficulty}</span> : null}
              </>
            );
            const to = problem.source === 'shared' ? `/problems/shared/${problem.id}` : `/problems/${problem.id}`;
            return (
              <li key={`${problem.source}:${problem.id}`}>
                {canOpen ? (
                  <Link to={to} className={`group flex items-center gap-2.5 rounded-lg px-1 py-2 transition hover:bg-slate-50 dark:hover:bg-white/5 ${focusRing}`}>{content}</Link>
                ) : <div className="flex items-center gap-2.5 px-1 py-2">{content}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function NotSharedNotice({ name }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-sm text-slate-500 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-400">
      <GraduationCap className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
      {firstNameOf(name)}’s progress is unavailable right now. Please try again shortly.
    </div>
  );
}
