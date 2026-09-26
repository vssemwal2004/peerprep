import { useRef, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  Eye,
  Plus,
  Save,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import Directory from "./Directory";
import { ResourceList } from "./Resources";
import { BasicsEditor, InterviewerEditor, RulesEditor } from "./Editors";
import Sections from "./Sections";
import Review from "./Review";
import CreationProgress from "./CreationProgress";
import {
  ROOT,
  categories,
  divisions,
  equalWeights,
  newDefinition,
  newSection,
  uid,
} from "./definition";
import { interviewApi } from "./api";
import { useInterviewDraft } from "./useInterviewDraft";
import { useRemote } from "./useRemote";
import {
  Badge,
  Drawer,
  EmptyState,
  Notice,
  PageHeader,
  Panel,
  primaryClass,
  secondaryClass,
} from "./ui";

function Navigation() {
  const items = [
    { to: ROOT, label: "Interviews", Icon: ClipboardList, end: true },
    { to: `${ROOT}/reports`, label: "Reports", Icon: BarChart3 },
    {
      to: `${ROOT}/profiles`,
      label: "Interviewer profiles",
      Icon: UserRound,
    },
    { to: `${ROOT}/companies`, label: "Companies", Icon: Building2 },
  ];
  return (
    <aside className="border-b border-slate-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 lg:border-b-0 lg:border-r">
      <div className="mb-4 hidden px-2 lg:block">
        <div className="flex items-center gap-2 py-2 font-semibold text-slate-800 dark:text-white">
          <Bot size={19} className="text-sky-600" />
          AI Interviews
        </div>
      </div>
      <nav
        aria-label="AI interview workspace"
        className="flex gap-1 overflow-x-auto lg:flex-col"
      >
        {items.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] ${isActive ? "bg-sky-50 font-semibold text-sky-700 dark:bg-sky-950" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-gray-800"}`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
function Frame({ title, back, crumbs, actions, sidebar, children }) {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 dark:bg-gray-950 dark:text-gray-100">
      <PageHeader title={title} back={back} crumbs={crumbs} actions={actions} />
      <div
        className={`min-h-[calc(100vh-100px)] ${sidebar ? "grid lg:grid-cols-[208px_minmax(0,1fr)]" : ""}`}
      >
        {sidebar}
        <div className="min-w-0 p-4 sm:p-6">
          <div className="mx-auto max-w-[1500px]">{children}</div>
        </div>
      </div>
    </main>
  );
}
function DirectoryPage() {
  return (
    <Frame
      title="AI Interviews"
      back="/admin/interviews/one-to-one"
      crumbs={[
        { label: "Interviews", to: "/admin/interviews/one-to-one" },
        { label: "AI Interviews" },
      ]}
      sidebar={<Navigation />}
    >
      <Directory />
    </Frame>
  );
}
function ReportsPage() {
  return (
    <Frame
      title="AI Interview Reports"
      back={ROOT}
      crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Reports" }]}
      sidebar={<Navigation />}
    >
      <Panel>
        <EmptyState
          title="Reports are not available yet"
          detail="AI interviews currently support configuration only. Reports will become available when interview sessions and evaluation are enabled."
          action={
            <Link className={primaryClass} to={ROOT}>
              View AI interviews
            </Link>
          }
        />
      </Panel>
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
function CreatePage() {
  const [data, setData] = useState(newDefinition),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    key = useRef(null),
    navigate = useNavigate(),
    location = useLocation();
  const returnTo = location.state?.returnTo || ROOT;
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    key.current ||= uid();
    try {
      const doc = await interviewApi.create(data, key.current);
      navigate(`${ROOT}/${doc._id}/sections`, {
        replace: true,
        state: { returnTo },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Frame
      title="Create AI interview"
      back={returnTo}
      crumbs={[
        { label: "AI Interviews", to: returnTo },
        { label: "Create draft" },
      ]}
    >
      <form className="mx-auto max-w-5xl space-y-4" onSubmit={create}>
        <CreationProgress data={data} />
        {error && <Notice error>{error}</Notice>}
        <fieldset disabled={busy} className="space-y-4">
          <BasicsEditor data={data} onChange={setData} />
          <Panel
            title="Interview sections"
            action={<Badge>{data.sections.length} selected</Badge>}
          >
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => {
                const selected = data.sections.some(
                  (s) => s.category === category,
                );
                return (
                  <button
                    key={category}
                    type="button"
                    aria-pressed={selected}
                    className={selected ? primaryClass : secondaryClass}
                    onClick={() =>
                      setData({
                        ...data,
                        sections: equalWeights(
                          selected
                            ? data.sections.filter(
                                (s) => s.category !== category,
                              )
                            : [...data.sections, newSection(category)],
                        ),
                      })
                    }
                  >
                    {selected ? <CheckCircle2 size={14} /> : <Plus size={14} />}
                    {category}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Choose the rounds you need. You can add or change these in the
              next step.
            </p>
          </Panel>
        </fieldset>
        <footer className="sticky bottom-0 z-20 flex flex-wrap justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.04)] dark:border-gray-800 dark:bg-gray-900">
          <Link className={secondaryClass} to={returnTo}>
            Cancel
          </Link>
          <button
            className={`${primaryClass} flex-1 sm:flex-none`}
            disabled={busy || !data.title.trim()}
          >
            {busy ? "Creating…" : "Create & add questions"}
          </button>
        </footer>
      </form>
    </Frame>
  );
}
function BuilderContent({ id }) {
  const { "*": rest } = useParams(),
    location = useLocation(),
    navigate = useNavigate();
  const parts = (rest || "basics").split("/"),
    division = parts[0],
    sectionId = parts[1],
    groupId = parts[2] === "groups" ? parts[3] : undefined;
  const state = useInterviewDraft(id),
    caps = useRemote(interviewApi.capabilities, []);
  const initialReturn = useRef(location.state?.returnTo || ROOT);
  if (!divisions.some((d) => d.id === division) && division !== "preview")
    return <Navigate to={`${ROOT}/${id}/basics`} replace />;
  if (state.loading)
    return (
      <Frame
        title="Interview configuration"
        back={ROOT}
        crumbs={[{ label: "AI Interviews", to: ROOT }, { label: "Loading" }]}
        sidebar={<Navigation />}
      >
        <p role="status" className="p-8 text-sm text-slate-500">
          Loading interview…
        </p>
      </Frame>
    );
  if (!state.doc || !state.data)
    return (
      <Frame
        title="Interview unavailable"
        back={ROOT}
        crumbs={[{ label: "AI Interviews", to: ROOT }]}
        sidebar={<Navigation />}
      >
        <EmptyState
          title="Could not open this interview"
          detail={
            state.error ||
            "The interview may have been deleted or is not accessible."
          }
          action={
            <button className={secondaryClass} onClick={state.reload}>
              Retry
            </button>
          }
        />
      </Frame>
    );
  const { doc, data } = state,
    archived = doc.lifecycle === "archived",
    preview = division === "preview";
  const currentSection = data.sections.find((s) => s.id === sectionId),
    currentGroup = currentSection?.groups.find((g) => g.id === groupId);
  const title = preview ? "Interview preview" : data.title;
  const settingsView = division === "interviewer" || division === "rules";
  const step = settingsView || preview ? "review" : division;
  const readOnly = archived || state.conflict || state.validating;
  const crumbs = [
    { label: "AI Interviews", to: initialReturn.current },
    { label: data.title, to: `${ROOT}/${id}/basics` },
    {
      label: divisions.find((d) => d.id === division)?.label || "Preview",
      ...(sectionId ? { to: `${ROOT}/${id}/sections` } : {}),
    },
    ...(currentSection
      ? [
          {
            label: currentSection.name,
            ...(groupId ? { to: `${ROOT}/${id}/sections/${sectionId}` } : {}),
          },
        ]
      : []),
    ...(currentGroup ? [{ label: currentGroup.name }] : []),
  ];
  const back = groupId
    ? `${ROOT}/${id}/sections/${sectionId}`
    : sectionId
      ? `${ROOT}/${id}/sections`
      : initialReturn.current;
  return (
    <Frame
      title={title}
      back={back}
      crumbs={crumbs}
      actions={
        <>
          <span role="status" className="text-xs text-slate-500">
            {state.saving
              ? "Saving…"
              : state.error
                ? "Not saved"
                : state.dirty
                  ? "Unsaved changes"
                  : "All changes saved"}
          </span>
          <Badge complete={doc.validation?.complete && !state.dirty}>
            {archived
              ? "Archived"
              : doc.validation?.complete && !state.dirty
                ? "Complete · not live"
                : "Draft"}
          </Badge>
          {!preview && (
            <Link className={secondaryClass} to={`${ROOT}/${id}/rules`}>
              <SlidersHorizontal size={14} />
              Settings
            </Link>
          )}
          {!preview && (
            <Link className={secondaryClass} to={`${ROOT}/${id}/preview`}>
              <Eye size={14} />
              Preview
            </Link>
          )}
          {!archived && !preview && (
            <button
              className={primaryClass}
              disabled={state.saving || state.conflict || !state.dirty}
              onClick={state.save}
            >
              <Save size={14} />
              Save
            </button>
          )}
        </>
      }
    >
      <div className="mx-auto max-w-5xl space-y-4">
        {!preview && (
          <CreationProgress
            id={id}
            current={step}
            data={data}
            complete={doc.validation?.complete && !state.dirty}
          />
        )}
        {state.error && (
          <Notice error>
            {state.error}{" "}
            {state.conflict ? (
              <button
                className="underline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Discard local changes and reload the saved version?",
                    )
                  )
                    state.reload();
                }}
              >
                Reload saved version
              </button>
            ) : (
              <button className="underline" onClick={state.save}>
                Retry save
              </button>
            )}
          </Notice>
        )}
        {state.notice && <Notice>{state.notice}</Notice>}
        {archived && (
          <Notice>
            This interview is archived and read-only. Restore it from the
            directory to edit.
          </Notice>
        )}
        <div className="min-w-0 space-y-4">
          {division === "basics" && (
            <fieldset disabled={readOnly} className="min-w-0">
              <BasicsEditor data={data} onChange={state.change} />
            </fieldset>
          )}
          {division === "sections" &&
            (caps.result ? (
              <Sections
                interviewId={id}
                data={data}
                onChange={state.change}
                sectionId={sectionId}
                groupId={groupId}
                limits={caps.result.limits}
                readOnly={readOnly}
              />
            ) : caps.error ? (
              <Notice error>
                {caps.error} <button onClick={caps.reload}>Retry</button>
              </Notice>
            ) : (
              <p role="status">Loading authoring limits…</p>
            ))}
          {(division === "review" || settingsView || preview) && (
            <Review doc={doc} data={data} preview={preview} />
          )}
        </div>
        {!preview && (
          <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <Link
              className={secondaryClass}
              to={
                step === "basics"
                  ? initialReturn.current
                  : `${ROOT}/${id}/${step === "sections" ? "basics" : "sections"}`
              }
            >
              {step === "basics" ? "All interviews" : "Previous"}
            </Link>
            {step === "review" ? (
              <button
                className={primaryClass}
                disabled={readOnly || state.saving}
                onClick={state.validate}
              >
                <CheckCircle2 size={15} />
                {state.saving
                  ? "Saving…"
                  : doc.validation?.complete && !state.dirty
                    ? "Recheck setup"
                    : "Finish setup"}
              </button>
            ) : (
              <Link
                className={primaryClass}
                to={`${ROOT}/${id}/${step === "basics" ? "sections" : "review"}`}
              >
                {step === "basics"
                  ? "Continue to questions →"
                  : "Review interview →"}
              </Link>
            )}
          </footer>
        )}
        {settingsView && (
          <Drawer
            title={
              division === "interviewer"
                ? "Interviewer profile"
                : "Interview settings"
            }
            description="Changes save to your draft automatically."
            readOnly={readOnly}
            onClose={() => navigate(`${ROOT}/${id}/review`)}
            footer={
              <Link className={primaryClass} to={`${ROOT}/${id}/review`}>
                Done
              </Link>
            }
          >
            {division === "interviewer" ? (
              <InterviewerEditor data={data} onChange={state.change} />
            ) : (
              <RulesEditor data={data} onChange={state.change} />
            )}
          </Drawer>
        )}
      </div>
    </Frame>
  );
}
function Builder() {
  const { id } = useParams();
  return <BuilderContent key={id} id={id} />;
}
export default function AIInterviewWorkspace() {
  return (
    <Routes>
      <Route index element={<DirectoryPage />} />
      <Route path="new" element={<CreatePage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="companies" element={<ResourcesPage kind="companies" />} />
      <Route path="profiles" element={<ResourcesPage kind="profiles" />} />
      <Route path=":id/*" element={<Builder />} />
    </Routes>
  );
}
