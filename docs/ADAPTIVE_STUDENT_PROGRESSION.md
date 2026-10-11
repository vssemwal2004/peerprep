# Adaptive student progression (v2)

## Student experience

The existing PeerPrep visual theme is retained. Profile order is Summary + Coding Progress, Activity (year heatmap by default), Badges + PeerPrep Progress, daily missions + weekly/monthly journey, then Practice History. Feature-specific sections still follow university permissions. The heatmap combines verified coding, learning, assessment and interview activity; rewards themselves are not counted as extra activity.

Students receive a core daily mission, up to two alternatives under **Choose one**, and an optional stretch mission when suitable content exists. Complete the core and one choice if choices were assigned. Stretch never blocks the daily reward. Weekly and monthly plans have independent completion goals and active-day requirements. Days need not be consecutive, and a missed day never removes earned XP, levels or badges.

**Challenges** in the student sidebar or header module search/launcher opens `/student/challenges`, with shareable Daily, Weekly and Monthly tabs (`?period=monthly`). Dashboard and profile cards also link here. The current-month calendar marks completed daily assignments; future days do not invent tasks, since daily assignments adapt as performance changes. The existing profile layout/theme is unchanged.

The student header also has a **Daily challenges** quick-view button. It opens a right-hand drawer (full-width on small screens) with a required-step progress ring, All/Pending/Completed task filters, paused-content indicators, task links, acceptance, XP and current level. The ring counts the core plus any one choice; optional stretch and unused alternatives never block the daily reward. Only allocated modules are shown. Plans load when the drawer opens, refresh on activity/return and every visible-page minute while open, and retain a clearly marked read-only last-synced view on errors. Closing stops its listeners/timer. The drawer skips the hub’s extra ranking request, supports reduced motion, traps keyboard focus, makes the background inert, restores focus/scrolling on dismissal and links to the full daily/weekly/monthly hub. Mobile module search is an icon-triggered search panel to keep all header controls usable at 320px.

Students can explicitly **Accept** an assigned plan, then **Start/Continue** its tasks. Acceptance is tenant/student scoped, timestamped, idempotent and awards no XP. It does not remove automatic credit for verified work completed before acceptance. Expired plans and disabled university access are rejected. The hub refreshes on return, verified-activity signals and a visible-page minute timer; its rank read follows reward reconciliation. Each challenge XP contributes one university score point, but relative rank is not guaranteed to rise because other students also progress. Level-up popups remain limited to dashboard/profile.

The Challenges page uses a curved, illustrated banner, first-party SVG mission emblems, visual schedule selectors, compact task cards and a monthly journey calendar. All/Pending/Completed filters reflect verified task state; explanations and earning rules are expandable. A successful explicit acceptance opens a schedule-specific celebration (daily, weekly or monthly) with a finite confetti burst and a start action. It says **XP to earn**, never XP earned merely for accepting. Failed, stale or already-completed responses do not celebrate, and loading/refreshing an accepted plan does not replay the popup. This action confirmation is separate from level/badge achievement delivery. Native modal layering supports the header drawer, focus restoration, Escape and reduced motion; there is no sound or forced auto-dismiss.

Plans reset at **2 AM Asia/Kolkata**; weeks begin Monday. Targets and XP are frozen at assignment. Late joiners receive targets capped by remaining time/content and prorated weekly/monthly XP. Empty or inaccessible catalogues produce an honest empty state, not invented tasks. Access/content removal pauses affected requirements without silently rewarding an incomplete plan.

## Selection and progression algorithm

1. Resolve the tenant from server deployment configuration (or normalized college in standalone mode). Intersect central allocations with university/semester mission policy. The browser cannot select its tenant, reward amount, student ID or completion timestamp.
2. Read eligible published/assigned content. Reconcile authenticated, verified completions into a unique student/tenant activity ledger. Repeated solves, runs, views and logins do not generate new completion credit.
3. Calculate per-feature practice mastery from the most recent 30 days. Coding uses accepted difficulty scores (35/65/95); evaluated assessments and peer feedback use their scores. Confidence discounts fewer than five scored samples. Unscored learning/AI interviews use distinct-completion coverage, a practice proxy rather than an accuracy measurement.
4. Choose Easy until there are at least four samples and 35 mastery; Hard requires eight samples and 70 mastery. Otherwise choose Medium. Apply the administrator's ceiling. Daily candidate priority is 60% weaker-domain opportunity and 40% seeded variation. The seed includes tenant, student, period and policy revision; saved assignments prevent refresh-rerolling.
5. Prefer a 15-minute onboarding/restart core. The shortest eligible interview/assessment can use the configured daily ceiling (35 minutes by default, adjustable 10–45). Required core + choice fits the daily budget. Optional stretch is separate and at most one difficulty band above current ability. Weekly/monthly quantities rise with demonstrated ability and remain capped by content/time.
6. Issue immutable XP receipts once per plan and once per daily stretch. All level promotions require **XP AND mastery AND verified active days**. There are seven permanent levels; recent performance can change tomorrow's difficulty but never demote an earned level. Monthly journeys reset, not lifetime progress.
7. Award verified milestones and weekly/monthly badge editions. Each earned badge keeps a definition snapshot. The gallery shows category, rarity, task requirement, minimum level, progress and earned date. Retired earned editions remain in history; badges for revoked modules are hidden while access is absent.
8. Publish unique achievement events. Only dashboard/profile claim them. An atomic server delivery receipt prevents repeated automatic celebrations across tabs/devices; the popup supports confetti, reduced motion, Escape and focus restoration. This is **at-most-once delivery**, not guaranteed exactly-once display: a lost response is kept in history, not replayed indefinitely.

Level requirements are centralized in `backend/src/services/adaptiveEngagementRules.js`; they are intentionally common across campuses. Admins can inspect but do not arbitrarily award XP or edit a student's level.

## Admin controls

Open **Settings → Student progression** (`/admin/settings/student-progression`). University deployments automatically use their configured tenant. In standalone multi-college deployments, load the exact student college name first; an empty name targets only the default standalone scope.

Controls include university/semester policy, enable/pause, allocated feature selection, daily time budget, difficulty ceiling, active-day targets, reward amounts, and up to 12 custom badges built from verified metrics. A bounded policy audit records the administrator, timestamp and changes. Existing plans retain their target/reward snapshot; new plans use the new revision. Saving a semester policy creates explicit overrides for submitted fields; omitted fields inherit the university defaults. The 30-day analytics are university-wide, even when editing a semester policy.

## Persistence, compatibility and operations

Collections: EngagementPolicy, MissionAssignment, EngagementActivity, EngagementReward, StudentProgression, StudentBadge, AchievementEvent, MonthlyProgressSnapshot and InterviewEngagementReceipt. Unique compound tenant/student keys make concurrent refreshes idempotent. Refreshes have a per-process single-flight guard, a short shared response cache, rate limiting and query deadlines. Current allocations are checked before cached data is served; unavailable central policy fails closed.

An unfinished reward settlement is recovered after a server interruption. Recently expired plans are reconciled for delayed completion evidence; unsuccessful old plans are closed after a seven-day reconciliation window. Receipt timestamps use verified completion time, not the later profile visit. First sync imports eligible history, then source queries use overlapping watermarks. Monthly summaries are saved lazily on a subsequent visit; there is no nightly student-sweep job.

Legacy earned challenge XP, weekly/monthly editions and server-proven milestones are preserved. Existing verified levels are imported without replaying old celebrations. Unverifiable legacy client acknowledgement records are not used to grant rewards. The original coding statistics remain visible in the unchanged Summary/Coding Progress cards; they are no longer the new mission system's reward rule.

AI interview completion is mirrored only from successful authenticated runtime responses, correlated to a locally observed session start. The runtime must be configured and available to supply interview candidates. Sessions started before this adapter, or lost start receipts, need an upstream history/backfill integration before they can earn AI-interview mission credit.

### Deployment

1. Back up the intended database and deploy the backend/frontend changes together.
2. From `backend`, run `npm run migrate:student-engagement` with that deployment's intended `.env`/`MONGODB_URI`. This migration adds indexes; it does not drop data or seed student activity. Production earning fails closed if mandatory unique indexes are absent.
3. Confirm each university's central module allocations, then configure Student progression. Test one new student and one existing student per representative allocation combination.
4. Monitor refresh latency, query timeouts and receipt/index failures. The current implementation reads the accessible catalogue and lifetime ledger during reconciliation; benchmark representative campus sizes before claiming high-concurrency production capacity. A background worker/materialized metrics can be introduced behind the same receipt contracts if measured demand requires it.

No live database migration or production deployment is performed by the local test suite.

### Verification

Backend: `node --test --test-concurrency=1 test/adaptiveEngagement.test.js test/studentEngagement.test.js test/studentDashboard.test.js test/learnerProgress.test.js test/codingStreak.test.js test/platformTenantAccess.test.js test/aiInterviewServiceHandoff.test.js`

Frontend: `node --test --test-concurrency=1 test/studentChallenges.test.js test/studentDashboard.test.js test/globalSidebar.test.js test/universityPermissions.test.js`, targeted ESLint, and `npm run build`.

Optional browser smoke test: after `npm run build`, run `node test/engagement.browser.mjs [playwright-module-url]` from `frontend`, with installed Microsoft Edge. It bundles current components with the compiled application stylesheet, uses only mocked student/admin APIs and blocks external requests. Screenshots go to `tmp/engagement-preview`; it verifies profile order, desktop heatmap visibility, mobile overflow, gallery rules, reduced-motion rendering, normal-motion confetti, celebration dismissal and admin policy save.
