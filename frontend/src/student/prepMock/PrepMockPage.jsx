import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import MockHero from './MockHero';
import Spotlight from './Spotlight';
import JourneyRail from './JourneyRail';
import CompanyDirectory from './CompanyDirectory';
import CompanyView, { BackLink } from './CompanyView';
import { TowerGlyph, GlyphTile } from './prepMockGlyphs';
import { usePrepMocks } from './usePrepMocks';
import { countsOf, findCompany, journeyOf, spotlightOf } from './prepMockModel';
import AssessmentLaunchModal from '../assessment-dashboard/AssessmentLaunchModal';
import AssessmentReportModal from '../assessment-dashboard/AssessmentReportModal';
import { useAssessmentLauncher } from '../assessment-dashboard/useAssessmentLauncher';
import { card, focusRing, Skeleton, Unavailable } from '../dashboard/ui';
import { firstStudentFeaturePath } from '../studentFeatureAccess';
import { useAuth } from '../../context/AuthContext';
import PageGuideButton from '../../guide/platform/PageGuideButton';

function Shell({ children }) {
  return (
    <div className="min-h-full bg-[#f6f7f9] font-dmsans text-slate-900 antialiased dark:bg-[#1a1a1a] dark:text-zinc-100">
      <div className="mx-auto max-w-[1360px] px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------------- states */

function StateCard({ icon, title, text, children }) {
  return (
    <div role="status" className={`mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center ${card}`}>
      <GlyphTile glyph={icon} tone="violet" />
      <h2 className="mt-4 text-[17px] font-semibold text-slate-900 dark:text-zinc-50">{title}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-6 text-slate-500 dark:text-zinc-400">{text}</p>
      {children}
    </div>
  );
}

const LockGlyph = (props) => <Lock {...props} strokeWidth={2.2} />;

function NotEnabled() {
  const { user } = useAuth();
  // A stale session may still list Prep Mock first; never send the student back here.
  const home = firstStudentFeaturePath(user);
  const back = home.startsWith('/student/prep-mock') ? '/student/profile' : home;
  return (
    <StateCard icon={LockGlyph} title="Prep Mock isn't turned on for your account yet"
      text="Prep Mock gives you company-style mock tests, role by role. Ask your admin to turn it on for you.">
      <Link to={back} className={`mt-6 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 ${focusRing}`}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Go back
      </Link>
    </StateCard>
  );
}

function PlainHeader() {
  return (
    <header data-guide="pmock-header" className="mb-6">
      <h1 className="flex items-center gap-3 text-[30px] font-medium tracking-[-0.03em] text-slate-900 dark:text-zinc-50"><span>Prep <b className="font-bold text-violet-600 dark:text-violet-400">Mock</b></span><PageGuideButton /></h1>
      <p className="mt-2 text-[14px] text-slate-500 dark:text-zinc-400">Practise real company tests, role by role.</p>
    </header>
  );
}

function LandingSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading Prep Mock" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        <Skeleton className="h-[236px] rounded-3xl" />
        <div className="flex gap-3 overflow-hidden">{[0, 1, 2, 3].map((key) => <Skeleton key={key} className="h-[150px] w-[232px] shrink-0 rounded-2xl" />)}</div>
        <Skeleton className="h-10 rounded-xl" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(212px,1fr))] sm:gap-2.5">{Array.from({ length: 12 }, (_, key) => <Skeleton key={key} className="h-[72px] rounded-2xl" />)}</div>
      </div>
      <Skeleton className="hidden h-[420px] rounded-2xl lg:block" />
    </div>
  );
}

function CompanySkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading company mocks">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-3 h-[150px] rounded-3xl" />
      <Skeleton className="mt-6 h-[54px] rounded-2xl" />
      <Skeleton className="mt-5 h-[380px] rounded-2xl" />
    </div>
  );
}

/* ----------------------------------------------------------------------------- landing */

function Landing({ companies, mocks, reports, onContinue, onViewResult }) {
  const { user } = useAuth();
  const journey = useMemo(() => journeyOf(companies, reports), [companies, reports]);
  const counts = useMemo(() => countsOf(mocks), [mocks]);
  const spotlight = useMemo(() => spotlightOf(companies), [companies]);

  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-7 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-7">
        <MockHero journey={journey} userName={user?.name} />
        <Spotlight inProgress={journey.inProgress} companies={spotlight} onContinue={onContinue} />
        <CompanyDirectory companies={companies} />
      </div>
      <aside aria-label="Your mock journey" className="min-w-0 lg:sticky lg:top-[81px] lg:self-start lg:max-h-[calc(100dvh-97px)] lg:overflow-y-auto lg:overscroll-contain">
        <JourneyRail journey={journey} counts={counts} onViewResult={onViewResult} />
      </aside>
    </div>
  );
}

/* ----------------------------------------------------------------------------- page */

/** /student/prep-mock (your progress + company directory) and /student/prep-mock/:company (roles, then mocks). */
export default function PrepMockPage() {
  const { company: companyParam } = useParams();
  const navigate = useNavigate();
  const { loading, error, disabled, data, mocks, companies, reports, refresh } = usePrepMocks();
  const launcher = useAssessmentLauncher();
  const [report, setReport] = useState(null);
  const company = companyParam ? findCompany(companies, companyParam) : null;

  let body;
  if (disabled) body = <NotEnabled />;
  else if (loading) body = companyParam ? <CompanySkeleton /> : <LandingSkeleton />;
  else if (error && !data) body = <Unavailable message={error} onRetry={refresh} className="mt-2" />;
  else if (companyParam) {
    let decoded = companyParam;
    try { decoded = decodeURIComponent(companyParam); } catch { /* keep the raw param */ }
    body = company
      ? <CompanyView company={company} reports={reports} onStart={launcher.launch} onViewResult={setReport} onFeedback={(mock) => navigate(`/student/assessment/${mock._id}/feedback?from=prep-mock`)} />
      : (
        <>
          <BackLink />
          <div className="mt-4">
            <StateCard icon={TowerGlyph} title={`No mocks for ${decoded || 'this company'}`} text="This company has no mocks for you right now. It may have been renamed or its mocks taken down.">
              <Link to="/student/prep-mock" className={`mt-6 inline-flex h-10 items-center rounded-xl bg-slate-900 px-4 text-[13px] font-semibold text-white hover:bg-slate-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 ${focusRing}`}>See all companies</Link>
            </StateCard>
          </div>
        </>
      );
  } else if (companies.length) {
    body = <Landing companies={companies} mocks={mocks} reports={reports} onContinue={launcher.launch} onViewResult={setReport} />;
  } else {
    body = (
      <>
        <PlainHeader />
        <StateCard icon={TowerGlyph} title="No mocks for you yet" text="Your admin will publish company mocks here. Each company lists its roles, and each role has its own mock tests." />
      </>
    );
  }

  return (
    <Shell>
      {error && data && <Unavailable message={`Could not refresh: ${error}`} onRetry={refresh} className="mb-4" />}
      {body}
      <AssessmentLaunchModal {...launcher.modalProps} />
      <AssessmentReportModal report={report} open={Boolean(report)} onClose={() => setReport(null)} />
    </Shell>
  );
}
