import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, UserRound } from 'lucide-react';
import { api } from '../utils/api';
import socketService from '../utils/socket';
import { getLearnerLevel } from './profileBadge';
import { computeAwards } from './profile/achievements';
import useStickySidebar from './profile/useStickySidebar';
import BadgesCard from './profile/BadgesCard';
import LevelUpCelebration from './profile/LevelUpCelebration';
import BadgesGallery from './profile/BadgesGallery';
import DailyCodingChallenge from './DailyCodingChallenge';
import ProfileSidebar from './profile/ProfileSidebar';
import StudentSummary from './profile/StudentSummary';
import CodingProgress from './profile/CodingProgress';
import ActivitySection from './profile/ActivitySection';
import PeerPrepProgress from './profile/PeerPrepProgress';
import PracticeHistory from './profile/SubmissionsSection';
import { EditProfileModal, PhotoModal } from './profile/ProfileModals';
import { focusRing, languageLabel } from './profile/format';

const MotionDiv = motion.div;

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export default function StudentProfile() {
  const [user, setUser] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [profileForm, setProfileForm] = useState({
    username: '',
    name: '',
    course: '',
    branch: '',
    college: '',
    bio: '',
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activity, setActivity] = useState({});
  const [activityStats, setActivityStats] = useState(null);
  const [stats, setStats] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [problemStatusSummary, setProblemStatusSummary] = useState({
    loaded: false,
    totalProblems: 0,
    solvedCount: 0,
    attemptCount: 0,
    solvedByDifficulty: { easy: 0, medium: 0, hard: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  // Learner level / awards celebration state. `metricsReady` gates detection until the first full
  // load (stats + activity + analysis) finished, so a half-loaded page never fires a false level-up.
  const [learnerProgress, setLearnerProgress] = useState(null);
  const [metricsReady, setMetricsReady] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [badgesGallery, setBadgesGallery] = useState(null); // null | 'awards' | 'levels'
  const celebratingRef = useRef(false);
  const isMountedRef = useRef(true);
  const sidebarSticky = useStickySidebar();
  const lastMetricsRefreshAtRef = useRef(0);
  const metricsRefreshTimerRef = useRef(null);
  // Realtime bookkeeping: submissions already reflected optimistically, and a sync mirror of `activity`.
  const countedSubmissionIdsRef = useRef(new Set());
  const solvedSubmissionIdsRef = useRef(new Set());
  const activityRef = useRef({});

  const loadActivityData = useCallback(async (showSpinner = false) => {
    if (showSpinner && isMountedRef.current) {
      setLoadingActivity(true);
    }
    try {
      // Always bypass the client cache: this runs on realtime events and must show fresh counts.
      const data = await api.getStudentActivity(true);
      if (!isMountedRef.current) return;
      activityRef.current = data.activityByDate || {};
      setActivity(activityRef.current);
      setActivityStats(data.stats || null);
    } catch (activityError) {
      console.warn('[StudentProfile] Failed to load activity/streak:', activityError);
      // Keep the last good values so a transient failure doesn't wipe the streak tiles.
    } finally {
      if (showSpinner && isMountedRef.current) {
        setLoadingActivity(false);
      }
    }
  }, []);

  // Analysis (assessments/interviews/learning) is slow and rate limited; load it on its own so it
  // never delays the solved/streak counters.
  const loadAnalysis = useCallback(async (force = false) => {
    try {
      const analysisData = await api.getStudentAnalysis(force);
      if (!isMountedRef.current) return;
      // Keep the previous analysis if this refresh failed (e.g. rate-limited) instead of blanking sections.
      setAnalysis((prev) => (analysisData ? (analysisData.analysis || null) : prev));
    } catch (analysisError) {
      console.warn('[StudentProfile] Failed to load analysis:', analysisError);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const [statsResult, problemsResult] = await Promise.allSettled([
        api.getStudentStats(true),
        api.listStudentProblems({ page: 1, limit: 100, sortBy: 'updatedAt', sortOrder: 'desc', skipCache: true }),
      ]);

      if (statsResult.status === 'rejected') {
        console.warn('[StudentProfile] Failed to load stats:', statsResult.reason);
      }

      const data = statsResult.status === 'fulfilled' ? statsResult.value : null;
      const firstProblemsPage = problemsResult.status === 'fulfilled' ? problemsResult.value : null;
      const problemsLoaded = problemsResult.status === 'fulfilled';
      const statsPayload = data?.stats || null;

      let fallbackSolvedCount = 0;
      let fallbackAttemptCount = 0;
      let fallbackSolvedByDifficulty = { easy: 0, medium: 0, hard: 0 };
      let fallbackRecentSolvedProblems = [];
      let fallbackRecentSubmissions = [];

      const shouldUseProblemFallback = problemsLoaded
        && Number(firstProblemsPage?.pagination?.total || 0) > 0
        && Number(statsPayload?.totalQuestionsSolved || statsPayload?.problemsSolved || 0) === 0
        && Number(statsPayload?.totalSubmissions || 0) === 0;

      if (shouldUseProblemFallback) {
        const totalPages = Number(firstProblemsPage?.pagination?.pages || 1);
        let allProblems = Array.isArray(firstProblemsPage?.problems) ? [...firstProblemsPage.problems] : [];

        if (totalPages > 1) {
          const remainingPages = await Promise.allSettled(
            Array.from({ length: totalPages - 1 }, (_, index) => (
              api.listStudentProblems({
                page: index + 2,
                limit: 100,
                sortBy: 'updatedAt',
                sortOrder: 'desc',
              })
            ))
          );

          remainingPages.forEach((pageResult) => {
            if (pageResult.status !== 'fulfilled') return;
            if (Array.isArray(pageResult.value?.problems)) {
              allProblems = allProblems.concat(pageResult.value.problems);
            }
          });
        }

        const solvedProblems = allProblems.filter((problem) => problem?.studentStatus === 'Solved');
        fallbackSolvedCount = solvedProblems.length;
        fallbackSolvedByDifficulty = solvedProblems.reduce((acc, problem) => {
          const key = String(problem?.difficulty || '').toLowerCase();
          if (key === 'easy' || key === 'medium' || key === 'hard') {
            acc[key] += 1;
          }
          return acc;
        }, { easy: 0, medium: 0, hard: 0 });

        fallbackRecentSolvedProblems = solvedProblems
          .map((problem) => ({
            title: problem?.title || 'Untitled Problem',
            difficulty: problem?.difficulty || 'Easy',
            acceptedAt: problem?.updatedAt || problem?.createdAt || null,
          }))
          .sort((a, b) => new Date(b.acceptedAt || 0).getTime() - new Date(a.acceptedAt || 0).getTime())
          .slice(0, 5);

        const submissionTotals = await Promise.allSettled(
          allProblems.map((problem) => (
            api.listStudentProblemSubmissions(problem._id, { page: 1, limit: 3 })
          ))
        );

        fallbackAttemptCount = submissionTotals.reduce((total, submissionResult) => {
          if (submissionResult.status !== 'fulfilled') return total;
          return total + Number(submissionResult.value?.pagination?.total || 0);
        }, 0);

        fallbackRecentSubmissions = submissionTotals
          .flatMap((submissionResult) => {
            if (submissionResult.status !== 'fulfilled') return [];
            return Array.isArray(submissionResult.value?.submissions) ? submissionResult.value.submissions : [];
          })
          .map((submission) => ({
            problemTitle: submission?.problemSnapshot?.title || submission?.problemTitle || 'Untitled Problem',
            difficulty: submission?.problemSnapshot?.difficulty || submission?.difficulty || 'Easy',
            status: submission?.status || 'PENDING',
            language: submission?.language || 'python',
            executionTimeMs: submission?.executionTimeMs || 0,
            createdAt: submission?.createdAt || submission?.updatedAt || null,
            mode: submission?.mode || 'submit',
          }))
          .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          .slice(0, 8);

        // Build fallback language breakdown from submissions
        const fallbackLanguageMap = {};
        fallbackRecentSubmissions.forEach((sub) => {
          const lang = sub.language || 'unknown';
          fallbackLanguageMap[lang] = (fallbackLanguageMap[lang] || 0) + 1;
        });
        // Also check all problems for broader language coverage
        submissionTotals.forEach((submissionResult) => {
          if (submissionResult.status !== 'fulfilled') return;
          const subs = Array.isArray(submissionResult.value?.submissions) ? submissionResult.value.submissions : [];
          subs.forEach((sub) => {
            const lang = sub?.language || 'unknown';
            fallbackLanguageMap[lang] = (fallbackLanguageMap[lang] || 0) + 1;
          });
        });
        const fallbackLanguagesUsed = Object.entries(fallbackLanguageMap)
          .map(([language, count]) => ({ language, count }))
          .sort((a, b) => b.count - a.count);
        const fallbackMostUsedLanguage = fallbackLanguagesUsed[0]?.language || null;

        // Store these fallbacks for later use
        Object.assign(fallbackRecentSubmissions, { __fallbackLanguagesUsed: fallbackLanguagesUsed, __fallbackMostUsedLanguage: fallbackMostUsedLanguage });
      }

      if (!isMountedRef.current) return;
      const enrichedStats = statsPayload
        ? {
          ...statsPayload,
          recentSolvedProblems: Array.isArray(statsPayload.recentSolvedProblems) && statsPayload.recentSolvedProblems.length > 0
            ? statsPayload.recentSolvedProblems
            : fallbackRecentSolvedProblems,
          recentSubmissions: Array.isArray(statsPayload.recentSubmissions) && statsPayload.recentSubmissions.length > 0
            ? statsPayload.recentSubmissions
            : fallbackRecentSubmissions,
          // Ensure languagesUsed is always populated
          languagesUsed: Array.isArray(statsPayload.languagesUsed) && statsPayload.languagesUsed.length > 0
            ? statsPayload.languagesUsed
            : (fallbackRecentSubmissions?.__fallbackLanguagesUsed || []),
          mostUsedLanguage: statsPayload.mostUsedLanguage
            || (fallbackRecentSubmissions?.__fallbackMostUsedLanguage || null),
        }
        : {
          recentSolvedProblems: fallbackRecentSolvedProblems,
          recentSubmissions: fallbackRecentSubmissions,
          languagesUsed: fallbackRecentSubmissions?.__fallbackLanguagesUsed || [],
          mostUsedLanguage: fallbackRecentSubmissions?.__fallbackMostUsedLanguage || null,
        };

      setStats(enrichedStats);
      setProblemStatusSummary({
        loaded: problemsLoaded,
        totalProblems: Number(firstProblemsPage?.pagination?.total || 0),
        solvedCount: shouldUseProblemFallback
          ? fallbackSolvedCount
          : Number(statsPayload?.totalQuestionsSolved || statsPayload?.problemsSolved || 0),
        attemptCount: shouldUseProblemFallback
          ? fallbackAttemptCount
          : Number(statsPayload?.totalSubmissions || 0),
        solvedByDifficulty: {
          easy: shouldUseProblemFallback
            ? fallbackSolvedByDifficulty.easy
            : Number(statsPayload?.solvedByDifficulty?.easy || 0),
          medium: shouldUseProblemFallback
            ? fallbackSolvedByDifficulty.medium
            : Number(statsPayload?.solvedByDifficulty?.medium || 0),
          hard: shouldUseProblemFallback
            ? fallbackSolvedByDifficulty.hard
            : Number(statsPayload?.solvedByDifficulty?.hard || 0),
        },
      });
    } catch (statsError) {
      console.warn('[StudentProfile] Failed to refresh stats:', statsError);
      // Keep the last good stats on screen; a failed refresh must not reset the profile to zeros.
    }
  }, []);

  const refreshMetrics = useCallback(async ({ withActivitySpinner = false, forceAnalysis = false } = {}) => {
    await Promise.all([
      loadStats(),
      loadActivityData(withActivitySpinner),
      loadAnalysis(forceAnalysis),
    ]);
  }, [loadActivityData, loadAnalysis, loadStats]);

  const safeRefreshMetrics = useCallback(({ withActivitySpinner = false, force = false } = {}) => {
    const now = Date.now();
    const cooldownMs = 1500;
    const elapsed = now - lastMetricsRefreshAtRef.current;

    if (force || elapsed >= cooldownMs) {
      lastMetricsRefreshAtRef.current = now;
      if (metricsRefreshTimerRef.current) {
        clearTimeout(metricsRefreshTimerRef.current);
        metricsRefreshTimerRef.current = null;
      }
      // The analysis refresh endpoint is rate limited; only force it for finalized submissions.
      void refreshMetrics({ withActivitySpinner, forceAnalysis: force });
      return;
    }

    if (metricsRefreshTimerRef.current) return;
    metricsRefreshTimerRef.current = setTimeout(() => {
      metricsRefreshTimerRef.current = null;
      safeRefreshMetrics({ withActivitySpinner, force: true });
    }, Math.max(cooldownMs - elapsed + 50, 50));
  }, [refreshMetrics]);

  /**
   * Instantly reflect a judged "submit" on the profile (Run is never counted):
   *  - every new submit  -> submissions +1, today's heatmap cell +1, streak +1 on the first activity of the day
   *  - first accepted    -> solved +1 and the matching Easy/Medium/Hard bucket +1
   * The server stays the source of truth: the follow-up refetch overwrites these optimistic numbers.
   */
  const applyOptimisticSubmission = useCallback((submission) => {
    if (!isMountedRef.current || submission?.mode !== 'submit') return;
    const submissionId = String(submission?._id || '');
    if (!submissionId) return;

    if (!countedSubmissionIdsRef.current.has(submissionId)) {
      countedSubmissionIdsRef.current.add(submissionId);

      setStats((prev) => (prev ? { ...prev, totalSubmissions: Number(prev.totalSubmissions || 0) + 1 } : prev));
      setProblemStatusSummary((prev) => ({ ...prev, attemptCount: Number(prev.attemptCount || 0) + 1 }));

      // The backend buckets activity by UTC day. The ref is updated synchronously so two quick
      // submissions in the same render window can't both claim "first activity of the day".
      const todayKey = new Date().toISOString().slice(0, 10);
      const isFirstActivityToday = Number(activityRef.current?.[todayKey] || 0) === 0;
      activityRef.current = { ...activityRef.current, [todayKey]: Number(activityRef.current?.[todayKey] || 0) + 1 };
      setActivity(activityRef.current);
      if (isFirstActivityToday) {
        setActivityStats((prev) => {
          const base = prev || {};
          const currentStreak = Number(base.currentStreak || 0) + 1;
          return {
            ...base,
            currentStreak,
            bestStreak: Math.max(Number(base.bestStreak || 0), currentStreak),
            totalActiveDays: Number(base.totalActiveDays || 0) + 1,
          };
        });
      }
    }

    if (submission?.firstAccepted && !solvedSubmissionIdsRef.current.has(submissionId)) {
      solvedSubmissionIdsRef.current.add(submissionId);
      const difficultyKey = String(submission?.problem?.difficulty || '').toLowerCase();
      const bump = (counts) => (
        difficultyKey === 'easy' || difficultyKey === 'medium' || difficultyKey === 'hard'
          ? { ...counts, [difficultyKey]: Number(counts?.[difficultyKey] || 0) + 1 }
          : counts
      );

      setStats((prev) => (prev
        ? {
          ...prev,
          totalQuestionsSolved: Number(prev.totalQuestionsSolved || prev.problemsSolved || 0) + 1,
          solvedByDifficulty: bump(prev.solvedByDifficulty || {}),
          recentSolvedProblems: [
            {
              title: submission?.problem?.title || 'Untitled Problem',
              difficulty: submission?.problem?.difficulty || 'Easy',
              acceptedAt: submission?.completedAt || submission?.updatedAt || new Date().toISOString(),
            },
            ...(Array.isArray(prev.recentSolvedProblems) ? prev.recentSolvedProblems : []),
          ].slice(0, 5),
        }
        : prev));
      setProblemStatusSummary((prev) => ({
        ...prev,
        solvedCount: Number(prev.solvedCount || 0) + 1,
        solvedByDifficulty: bump(prev.solvedByDifficulty || {}),
      }));
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    const loadProfile = async () => {
      setLoading(true);
      try {
        const me = await api.me(true);
        if (!isMountedRef.current) return;
        setUser(me);
        setProfileForm({
          username: me?.username || '',
          name: me?.name || '',
          course: me?.course || '',
          branch: me?.branch || '',
          college: me?.college || '',
          bio: me?.bio || '',
          linkedinUrl: me?.linkedinUrl || '',
          githubUrl: me?.githubUrl || '',
          portfolioUrl: me?.portfolioUrl || '',
        });
        setLearnerProgress(me?.learnerProgress || null);
        await refreshMetrics({ withActivitySpinner: true, forceAnalysis: true });
        if (isMountedRef.current) setMetricsReady(true);
      } catch (loadError) {
        if (!isMountedRef.current) return;
        setError(loadError.message || 'Failed to load profile.');
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      isMountedRef.current = false;
      if (metricsRefreshTimerRef.current) {
        clearTimeout(metricsRefreshTimerRef.current);
        metricsRefreshTimerRef.current = null;
      }
    };
  }, [refreshMetrics]);

  useEffect(() => {
    if (!user?._id) return undefined;

    socketService.connect();
    const handleLearningUpdate = () => {
      safeRefreshMetrics();
    };
    const handleCompilerUpdate = (submission) => {
      if (String(submission?.userId || '') !== String(user._id)) return;

      // Bump counters instantly from the event itself; the refetch below then reconciles with the server.
      applyOptimisticSubmission(submission);

      // Only refetch once the submission is finalized; avoids spam while queued/running.
      const status = String(submission?.status || '').toUpperCase();
      if (status === 'PENDING' || status === 'RUNNING') return;
      safeRefreshMetrics({ force: true });
    };

    socketService.on('learning-updated', handleLearningUpdate);
    socketService.on('compiler-submission-updated', handleCompilerUpdate);

    return () => {
      socketService.off('learning-updated', handleLearningUpdate);
      socketService.off('compiler-submission-updated', handleCompilerUpdate);
    };
  }, [applyOptimisticSubmission, safeRefreshMetrics, user?._id]);

  useEffect(() => {
    if (!user?._id) return undefined;

    const handleFocus = () => safeRefreshMetrics();
    const handleVisibilityChange = () => {
      if (!document.hidden) safeRefreshMetrics();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [safeRefreshMetrics, user?._id]);

  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(now);
    nextMidnight.setDate(nextMidnight.getDate() + 1);
    nextMidnight.setHours(0, 0, 0, 0);

    const timer = setTimeout(() => {
      safeRefreshMetrics();
    }, Math.max(nextMidnight.getTime() - now.getTime(), 0));

    return () => clearTimeout(timer);
  }, [activityStats?.currentStreak, safeRefreshMetrics, stats?.totalSubmissions]);

  const onAvatarChange = (event) => {
    const file = event.target.files?.[0] || null;
    setAvatarFile(file);
    if (!file) {
      setAvatarPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => setAvatarPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const openPhotoModal = () => {
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    setSuccess('');
    setShowPhotoModal(true);
  };

  const closePhotoModal = () => {
    setShowPhotoModal(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setError('');
    setSuccess('');
  };

  const openEditModal = () => {
    setError('');
    setSuccess('');
    setProfileForm({
      username: user?.username || '',
      name: user?.name || '',
      course: user?.course || '',
      branch: user?.branch || '',
      college: user?.college || '',
      bio: user?.bio || '',
      linkedinUrl: user?.linkedinUrl || '',
      githubUrl: user?.githubUrl || '',
      portfolioUrl: user?.portfolioUrl || '',
    });
    setShowEditModal(true);
  };

  const closeEditModal = () => {
    if (savingProfile) return;
    setShowEditModal(false);
    setError('');
    setSuccess('');
  };

  const handleUpdatePhoto = async () => {
    if (!avatarFile) {
      setError('Please select a photo first.');
      return;
    }

    try {
      await api.updateMyAvatar(avatarFile);
      const me = await api.me(true);
      if (!isMountedRef.current) return;
      setUser(me);
      if (me && me.avatarUrl !== undefined) {
        localStorage.setItem('studentAvatarUrl', me.avatarUrl || '');
      }
      setSuccess('Profile photo updated successfully.');
      setTimeout(() => closePhotoModal(), 1200);
    } catch (updateError) {
      if (!isMountedRef.current) return;
      setError(updateError.message || 'Failed to update photo.');
    }
  };

  const handleUpdateProfile = async () => {
    setSavingProfile(true);
    setError('');
    setSuccess('');
    try {
      const normalizeUrlForSave = (value) => {
        const raw = typeof value === 'string' ? value.trim() : '';
        if (!raw) return '';
        if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) return raw;
        if (raw.startsWith('//')) return `https:${raw}`;
        return `https://${raw}`;
      };

      const response = await api.updateMyProfile({
        username: profileForm.username,
        bio: profileForm.bio,
        linkedinUrl: normalizeUrlForSave(profileForm.linkedinUrl),
        githubUrl: normalizeUrlForSave(profileForm.githubUrl),
        portfolioUrl: normalizeUrlForSave(profileForm.portfolioUrl),
      });
      const updatedUser = response?.user || response;
      if (!isMountedRef.current) return;
      setUser((prev) => ({
        ...(prev || {}),
        ...updatedUser,
      }));
      setProfileForm({
        username: updatedUser?.username || '',
        name: updatedUser?.name || '',
        course: updatedUser?.course || '',
        branch: updatedUser?.branch || '',
        college: updatedUser?.college || '',
        bio: updatedUser?.bio || '',
        linkedinUrl: updatedUser?.linkedinUrl || '',
        githubUrl: updatedUser?.githubUrl || '',
        portfolioUrl: updatedUser?.portfolioUrl || '',
      });
      setSuccess('Profile details updated successfully.');
      setTimeout(() => {
        if (isMountedRef.current) {
          setShowEditModal(false);
          setSuccess('');
        }
      }, 900);
    } catch (updateError) {
      if (!isMountedRef.current) return;
      setError(updateError.message || 'Failed to update profile.');
    } finally {
      if (isMountedRef.current) {
        setSavingProfile(false);
      }
    }
  };

  const handle = useMemo(() => {
    const base = user?.username || user?.email?.split('@')[0] || user?.studentId || user?.name || 'student';
    const normalized = String(base)
      .trim()
      .replace(/^@+/, '')
      .replace(/\s+/g, '')
      .toLowerCase();
    return `@${normalized}`;
  }, [user?.email, user?.name, user?.studentId, user?.username]);

  const analysisAssessments = analysis?.assessments || {};
  const analysisInterviews = analysis?.interviews || {};
  const analysisLearning = analysis?.learning || {};

  const performanceTitle = useMemo(() => {
    const solved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedCount || 0)
      : Number(stats?.totalQuestionsSolved || 0);
    const streak = Number(activityStats?.currentStreak || 0);
    const assessmentScore = Number(analysisAssessments?.avgScore || 0);
    const interviewScore = Number(analysisInterviews?.avgScore || 0);
    // getLearnerLevel returns the same title/helper as getLearnerBadge plus level progress.
    return getLearnerLevel({
      solvedCount: solved,
      streak,
      assessmentScore,
      interviewScore,
    });
  }, [
    activityStats?.currentStreak,
    analysisAssessments?.avgScore,
    analysisInterviews?.avgScore,
    problemStatusSummary.loaded,
    problemStatusSummary.solvedCount,
    stats?.totalQuestionsSolved,
  ]);

  // Ranked language usage: server breakdown first, otherwise inferred from recent submissions.
  const languages = useMemo(() => {
    if (Array.isArray(stats?.languagesUsed) && stats.languagesUsed.length > 0) {
      return stats.languagesUsed;
    }
    if (!stats?.recentSubmissions?.length) return [];
    const langMap = {};
    stats.recentSubmissions.forEach((sub) => {
      const lang = sub?.language;
      if (lang) langMap[lang] = (langMap[lang] || 0) + 1;
    });
    return Object.entries(langMap)
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count);
  }, [stats?.languagesUsed, stats?.recentSubmissions]);

  const mostUsedLanguage = stats?.mostUsedLanguage || languages[0]?.language || null;

  const hasCustomBio = Boolean(user?.bio?.trim());
  const shortBio = useMemo(() => {
    if (user?.bio?.trim()) {
      return user.bio.trim();
    }
    // Fallback stays factual: only mention a language or streak that actually exists.
    const focus = mostUsedLanguage ? `, mostly in ${languageLabel(mostUsedLanguage)}` : '';
    const streak = Number(activityStats?.currentStreak || 0);
    return `Practising data structures and problem solving on PeerPrep${focus}.${streak > 0 ? ` Currently on a ${streak}-day streak.` : ''}`;
  }, [activityStats?.currentStreak, mostUsedLanguage, user?.bio]);

  const codingTotals = useMemo(() => {
    const easySolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedByDifficulty?.easy || 0)
      : Number(stats?.solvedByDifficulty?.easy || 0);
    const mediumSolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedByDifficulty?.medium || 0)
      : Number(stats?.solvedByDifficulty?.medium || 0);
    const hardSolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedByDifficulty?.hard || 0)
      : Number(stats?.solvedByDifficulty?.hard || 0);

    const totalSolved = problemStatusSummary.loaded
      ? Number(problemStatusSummary.solvedCount || 0)
      : Math.max(
        Number(stats?.totalQuestionsSolved || stats?.problemsSolved || 0),
        Number(analysis?.problems?.solved || 0),
      );

    const totalProblems = problemStatusSummary.loaded
      ? Math.max(Number(problemStatusSummary.totalProblems || 0), totalSolved, 1)
      : Math.max(Number(totalSolved || 0), 1);
    const totalAttempts = problemStatusSummary.loaded
      ? Math.max(Number(problemStatusSummary.attemptCount || 0), totalSolved, 0)
      : Math.max(
        Number(stats?.totalSubmissions || 0),
        Number(analysis?.problems?.attempts || 0),
        totalSolved,
        0,
      );
    return {
      totalSolved,
      totalProblems,
      totalAttempts,
      easySolved,
      mediumSolved,
      hardSolved,
    };
  }, [
    analysis?.problems?.attempts,
    analysis?.problems?.solved,
    problemStatusSummary.totalProblems,
    problemStatusSummary.loaded,
    problemStatusSummary.attemptCount,
    problemStatusSummary.solvedByDifficulty?.easy,
    problemStatusSummary.solvedByDifficulty?.medium,
    problemStatusSummary.solvedByDifficulty?.hard,
    problemStatusSummary.solvedCount,
    stats?.solvedByDifficulty?.easy,
    stats?.solvedByDifficulty?.hard,
    stats?.solvedByDifficulty?.medium,
    stats?.totalSubmissions,
    stats?.totalQuestionsSolved,
    stats?.problemsSolved,
  ]);

  const socialLinks = useMemo(() => ([
    { label: 'LinkedIn', href: user?.linkedinUrl || '' },
    { label: 'GitHub', href: user?.githubUrl || '' },
    { label: 'Portfolio', href: user?.portfolioUrl || '' },
  ]), [user?.githubUrl, user?.linkedinUrl, user?.portfolioUrl]);

  // ---- View models (pure derivations of the loaded payloads; nothing here is invented) ----
  const streakSummary = {
    current: Number(activityStats?.currentStreak || 0),
    best: Number(activityStats?.bestStreak || 0),
    activeDays: Number(activityStats?.totalActiveDays || 0),
  };

  const judgedSubmissions = Number(stats?.totalSubmissions || 0);
  const acceptedSubmissions = nullableNumber(stats?.acceptedSubmissions);
  const acceptance = {
    total: judgedSubmissions,
    accepted: acceptedSubmissions,
    rate: judgedSubmissions > 0 && acceptedSubmissions !== null
      ? Math.min(100, Math.round((acceptedSubmissions / judgedSubmissions) * 1000) / 10)
      : null,
  };

  // The analysis payload is the primary source (matches the learner badge); the stats payload
  // fills in while the slower analysis request is still loading.
  const statsAssessments = stats?.assessmentMetrics || {};
  const assessmentSource = analysis ? analysisAssessments : statsAssessments;
  const assessmentAttempts = Number(assessmentSource?.attempts || 0);
  const assessments = {
    attempts: assessmentAttempts,
    avgScore: assessmentAttempts > 0 ? nullableNumber(assessmentSource?.avgScore) : null,
    highestScore: assessmentAttempts > 0 ? nullableNumber(assessmentSource?.highestScore) : null,
  };

  const statsInterviews = stats?.interviewMetrics || {};
  const interviews = analysis
    ? {
      total: Number(analysisInterviews?.total || 0),
      avgScore: Number(analysisInterviews?.avgScore || 0),
      pending: Number(analysisInterviews?.pending || 0),
    }
    : {
      total: Number(statsInterviews?.feedbackReceived || 0),
      avgScore: Number(statsInterviews?.avgScore || 0),
      pending: Number(statsInterviews?.pending || 0) + Number(statsInterviews?.scheduled || 0),
    };

  const learning = {
    completionPercent: Number(analysisLearning?.completionPercent || 0),
    completedTopics: Number(analysisLearning?.completedTopics || 0),
    totalTopics: Number(analysisLearning?.totalTopics || 0),
  };

  const learningContent = {
    coursesEnrolled: Number(activityStats?.totalSubjects ?? stats?.totalCoursesEnrolled ?? analysisLearning?.coursesEnrolled ?? 0),
    videosWatched: Number(activityStats?.totalVideosWatched ?? stats?.totalVideosWatched ?? analysisLearning?.videosWatched ?? 0),
    videosTotal: Number(activityStats?.totalVideosTotal || 0),
    watchTimeHours: Number(stats?.totalWatchTimeHours || 0),
  };

  const attemptedProblemsRaw = nullableNumber(stats?.totalQuestionsAttempted);
  const attemptedProblems = attemptedProblemsRaw === null
    ? null
    : Math.max(attemptedProblemsRaw, codingTotals.totalSolved);

  const codingSummary = {
    totalSolved: codingTotals.totalSolved,
    totalProblems: codingTotals.totalProblems,
    problemsKnown: problemStatusSummary.loaded && Number(problemStatusSummary.totalProblems || 0) > 0,
    easySolved: codingTotals.easySolved,
    mediumSolved: codingTotals.mediumSolved,
    hardSolved: codingTotals.hardSolved,
  };

  const awards = computeAwards({
    solved: codingTotals.totalSolved,
    hardSolved: codingTotals.hardSolved,
    bestStreak: Math.max(streakSummary.best, streakSummary.current),
    activeDays: streakSummary.activeDays,
    languages: languages.length,
    assessments: assessments.attempts,
    interviews: interviews.total,
  });

  // ---- Level-up / award celebration ----
  // Runs after the first full load and again whenever the level or earned set changes (including
  // live optimistic bumps from realtime submissions). Compares against what the server says was
  // already celebrated, shows the popup once, and records it immediately so a refresh or another
  // device does not repeat it.
  const currentLevel = performanceTitle.level;
  const earnedAwardKey = awards.awards.filter((award) => award.earned).map((award) => award.id).join(',');
  const celebrationInputRef = useRef({ awards, level: performanceTitle });
  celebrationInputRef.current = { awards, level: performanceTitle };

  useEffect(() => {
    if (!metricsReady || user?.role !== 'student' || celebration || celebratingRef.current) return;
    const { awards: latestAwards, level: latestLevel } = celebrationInputRef.current;
    const celebratedLevel = Math.max(1, Number(learnerProgress?.celebratedLevel || 0));
    const seenAwards = new Set((learnerProgress?.awards || []).map((entry) => entry.id));
    const newAwards = latestAwards.awards.filter((award) => award.earned && !seenAwards.has(award.id));
    const levelUp = currentLevel > celebratedLevel;
    if (!levelUp && newAwards.length === 0) return;

    celebratingRef.current = true;
    setCelebration({ level: levelUp ? latestLevel : null, awards: newAwards });

    // Record locally first so closing the popup before the request returns cannot re-trigger it;
    // the server response (with timestamps) then replaces this.
    const nowIso = new Date().toISOString();
    setLearnerProgress((prev) => ({
      ...(prev || {}),
      celebratedLevel: Math.max(currentLevel, Number(prev?.celebratedLevel || 0)),
      levelHistory: levelUp
        ? [...(prev?.levelHistory || []), { level: currentLevel, title: latestLevel.title, achievedAt: nowIso }]
        : (prev?.levelHistory || []),
      awards: [
        ...(prev?.awards || []),
        ...newAwards.map((award) => ({ id: award.id, earnedAt: nowIso })),
      ],
    }));

    const earnedIds = earnedAwardKey ? earnedAwardKey.split(',') : [];
    api.ackLearnerProgress({ level: currentLevel, title: latestLevel.title, awards: earnedIds })
      .then((response) => {
        if (isMountedRef.current && response?.learnerProgress) setLearnerProgress(response.learnerProgress);
      })
      .catch((ackError) => {
        console.warn('[StudentProfile] Could not save learner progress:', ackError);
      });
  }, [celebration, currentLevel, earnedAwardKey, learnerProgress, metricsReady, user?.role]);

  const closeBadgesGallery = useCallback(() => setBadgesGallery(null), []);

  const closeCelebration = useCallback(() => {
    celebratingRef.current = false;
    setCelebration(null);
  }, []);

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-white pt-3 dark:bg-[#1a1a1a]" aria-busy="true">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="h-[560px] animate-pulse rounded-xl bg-slate-200/70 dark:bg-zinc-800" />
          <div className="space-y-5">
            <div className="h-48 animate-pulse rounded-xl bg-slate-200/70 dark:bg-zinc-800" />
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="h-64 animate-pulse rounded-xl bg-slate-200/70 dark:bg-zinc-800" />
              <div className="h-64 animate-pulse rounded-xl bg-slate-200/70 dark:bg-zinc-800" />
            </div>
          </div>
        </div>
        <span className="sr-only" role="status">Loading profile...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-white pt-3 dark:bg-[#1a1a1a]">
        <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-zinc-800 dark:bg-[#242424]">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300" aria-hidden="true">
              <UserRound className="h-5 w-5" />
            </span>
            <h1 className="mt-3 text-base font-semibold text-slate-900 dark:text-zinc-50">Profile unavailable</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">{error || 'We could not load your profile right now.'}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className={`mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 ${focusRing}`}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }

  const firstName = String(user.name || '').trim().split(/\s+/)[0] || '';

  return (
    <div className="min-h-screen bg-white pt-3 font-['Inter',ui-sans-serif,system-ui,sans-serif] antialiased [font-feature-settings:'cv11','ss01'] dark:bg-[#1a1a1a]">
      <MotionDiv
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mx-auto max-w-7xl px-4 pb-6 pt-1 sm:px-6"
      >
        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Desktop: sticky with a measured offset (useStickySidebar) so the whole sidebar is
              always reachable by scrolling the page, then stays fixed. No inner scrollbar. */}
          <aside
            ref={sidebarSticky.ref}
            style={sidebarSticky.style}
            aria-label="Student profile"
            className="min-w-0 lg:sticky lg:self-start"
          >
            <ProfileSidebar
              user={user}
              handle={handle}
              badge={performanceTitle}
              level={performanceTitle}
              onOpenBadges={setBadgesGallery}
              bio={shortBio}
              hasCustomBio={hasCustomBio}
              socialLinks={socialLinks}
              onChangePhoto={openPhotoModal}
              onEditProfile={openEditModal}
            />
          </aside>

          {/* Right column: each module appears exactly once.
              Row 1 Summary | Coding (incl. streak) · Row 2 Badges | PeerPrep · Row 3 Activity ·
              then the daily challenge and the tabbed practice history. */}
          <main className="min-w-0 space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <StudentSummary
                className="h-full"
                firstName={firstName}
                coding={codingSummary}
                acceptance={acceptance}
                streak={streakSummary}
                assessments={assessments}
                mostUsedLanguage={mostUsedLanguage}
                languagesCount={languages.length}
              />
              <CodingProgress
                className="h-full"
                {...codingTotals}
                attemptedProblems={attemptedProblems}
                streak={streakSummary}
                activity={activity}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <BadgesCard
                className="h-full"
                level={performanceTitle}
                awards={awards}
                learnerProgress={learnerProgress}
                onOpenGallery={setBadgesGallery}
              />
              <PeerPrepProgress
                className="h-full"
                assessments={assessments}
                interviews={interviews}
                learning={learning}
                content={learningContent}
              />
            </div>

            <ActivitySection activity={activity} activityStats={activityStats} loading={loadingActivity} />

            <DailyCodingChallenge className="!rounded-xl shadow-sm" />

            <PracticeHistory
              solved={stats?.recentSolvedProblems}
              submissions={stats?.recentSubmissions}
              statusBreakdown={stats?.statusBreakdown}
              languages={languages}
            />
          </main>
        </div>
      </MotionDiv>

      <EditProfileModal
        open={showEditModal}
        onClose={closeEditModal}
        profileForm={profileForm}
        setProfileForm={setProfileForm}
        onSave={handleUpdateProfile}
        saving={savingProfile}
        error={error}
        success={success}
      />

      <PhotoModal
        open={showPhotoModal}
        onClose={closePhotoModal}
        user={user}
        avatarFile={avatarFile}
        avatarPreview={avatarPreview}
        onAvatarChange={onAvatarChange}
        onSave={handleUpdatePhoto}
        error={error}
        success={success}
      />

      <BadgesGallery
        open={Boolean(badgesGallery)}
        initialTab={badgesGallery || 'awards'}
        onClose={closeBadgesGallery}
        level={performanceTitle}
        awards={awards}
        learnerProgress={learnerProgress}
      />

      <LevelUpCelebration
        open={Boolean(celebration)}
        level={celebration?.level || null}
        awards={celebration?.awards || []}
        onClose={closeCelebration}
      />
    </div>
  );
}
