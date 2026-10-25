import { NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarClock,
  ClipboardList,
  UserRound,
} from "lucide-react";
import Directory, { DirectoryActions } from "./Directory";
import AvatarStudio from "./avatars/AvatarStudio";
import { ResourceList } from "./Resources";
import { CreateInterviewWizard, EditInterviewWizard } from "./wizard/InterviewWizard";
import AnviReportsPanel from "./reports/AnviReportsPanel";
import { AnviSchedulesRoutes } from "./schedules";
import { AnviBrand } from "./AnnuBrand";
import { ROOT } from "./definition";
import { PageHeader, pageClass } from "./ui";
import { scrollStripClass, useScrollFade } from "./useScrollFade";

function Navigation() {
  const location = useLocation();
  const strip = useScrollFade([location.pathname]);
  const items = [
    { to: ROOT, label: "Interviews", Icon: ClipboardList, end: true },
    { to: `${ROOT}/schedules`, label: "Schedules", Icon: CalendarClock },
    { to: `${ROOT}/reports`, label: "Reports", Icon: BarChart3 },
    {
      to: `${ROOT}/avatars`,
      label: "Avatars",
      Icon: UserRound,
    },
    { to: `${ROOT}/companies`, label: "Companies", Icon: Building2 },
  ];
  return (
    <aside className="min-w-0 border-b border-slate-200/80 bg-white px-3 py-2 dark:border-gray-800 dark:bg-gray-900 lg:border-b-0 lg:border-r lg:px-3 lg:py-5">
      <div className="mb-5 hidden px-2.5 lg:block">
        <AnviBrand />
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-gray-400">
          AI voice interviews
        </p>
      </div>
      <p className="mb-1.5 hidden px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-500 lg:block">
        Workspace
      </p>
      <nav
        ref={strip.ref}
        style={strip.style}
        aria-label="AI interview workspace"
        className={`flex gap-1 ${scrollStripClass} lg:flex-col lg:overflow-visible`}
      >
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `group relative flex shrink-0 snap-start items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${isActive ? "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"}`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-2 -left-3 hidden w-0.5 rounded-full lg:block ${isActive ? "bg-sky-600 dark:bg-sky-400" : "bg-transparent"}`}
                />
                <Icon size={16} className={isActive ? "" : "text-slate-400 group-hover:text-slate-600 dark:text-gray-500 dark:group-hover:text-gray-300"} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
function Frame({ title, description, back, crumbs, actions, sidebar, children }) {
  return (
    <main className={pageClass}>
      <PageHeader title={title} description={description} back={back} crumbs={crumbs} actions={actions} />
      <div
        className={`min-h-[calc(100vh-100px)] ${sidebar ? "grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]" : ""}`}
      >
        {sidebar}
        <div className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-[1440px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
function DirectoryPage() {
  return (
    <Frame
      title="AI Interviews"
      description="Voice interviews conducted by ANVI. Create one, add questions, then publish it for students."
      back="/admin/interviews/one-to-one"
      crumbs={[
        { label: "Interviews", to: "/admin/interviews/one-to-one" },
        { label: "AI Interviews" },
      ]}
      sidebar={<Navigation />}
      actions={<DirectoryActions />}
    >
      <Directory />
    </Frame>
  );
}
function ReportsPage() {
  return (
    <Frame
      title="AI Interview Reports"
      description="Every attempt at your interviews, with the AI-scored report for each student."
      back={ROOT}
      crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Reports" }]}
      sidebar={<Navigation />}
    >
      <AnviReportsPanel />
    </Frame>
  );
}
function ResourcesPage({ kind }) {
  const title = kind === "profiles" ? "Interviewer profiles" : "Companies";
  return (
    <Frame
      title={title}
      back={ROOT}
      crumbs={[{ label: "AI Interviews", to: ROOT }, { label: title }]}
      sidebar={<Navigation />}
    >
      <ResourceList key={kind} kind={kind} />
    </Frame>
  );
}
function AvatarsPage() {
  const location = useLocation();
  const creating = location.pathname.endsWith("/avatars/new");
  const editing = location.pathname.endsWith("/edit");
  const inEditor = creating || editing;
  const title = creating ? "Create avatar" : editing ? "Edit avatar" : "Avatars";
  return (
    <Frame
      title={title}
      back={inEditor ? `${ROOT}/avatars` : ROOT}
      crumbs={[
        { label: "AI Interviews", to: ROOT },
        { label: "Avatars", ...(inEditor ? { to: `${ROOT}/avatars` } : {}) },
        ...(inEditor ? [{ label: creating ? "Create" : "Edit" }] : []),
      ]}
      sidebar={inEditor ? undefined : <Navigation />}
    >
      <AvatarStudio />
    </Frame>
  );
}
// One four-step wizard serves both creating and editing an interview.
function Builder() {
  const { id } = useParams();
  return <EditInterviewWizard key={id} id={id} />;
}
export default function AIInterviewWorkspace() {
  return (
    <Routes>
      <Route index element={<DirectoryPage />} />
      <Route path="new" element={<CreateInterviewWizard />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="schedules/*" element={<AnviSchedulesRoutes navigation={<Navigation />} />} />
      <Route path="avatars/*" element={<AvatarsPage />} />
      <Route path="companies" element={<ResourcesPage kind="companies" />} />
      <Route path="profiles" element={<ResourcesPage kind="profiles" />} />
      <Route path=":id/*" element={<Builder />} />
    </Routes>
  );
}
