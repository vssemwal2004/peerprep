import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CloudOff,
  Eye,
  EyeOff,
  Loader2,
  RotateCcw,
  Send,
} from "lucide-react";
import InterviewActionMenu from "../../../components/interviews/InterviewActionMenu";
import { DEFAULT_LIMITS, ROOT, newDefinition, uid } from "../definition";
import { getAuthoringProgress } from "../authoringProgress";
import { interviewApi } from "../api";
import { useInterviewDraft } from "../useInterviewDraft";
import { useRemote } from "../useRemote";
import { Dialog, pageClass, surfaceClass } from "../ui";
import WizardShell from "./WizardShell";
import StepBasics from "./StepBasics";
import StepQuestions from "./StepQuestions";
import StepAnviSettings from "./StepAnviSettings";
import StepReview from "./StepReview";
import { ensureDefaultInterviewer } from "./defaults";
import { focusFields, nonce } from "./focus";
import { tabForFields } from "./settings/tabs";
import { englishOnly } from "./settings/model";
import { STEPS, describeIssue, interviewStatus, resolveStep, stepErrors, stepIndex } from "./steps";
import { Alert, buttonPrimary, buttonSecondary } from "./controls";

const publishMessage = (error) => {
  const code = error?.response?.data?.code;
  if (code === "AI_NOT_CONFIGURED" || error?.response?.status === 503)
    return "ANVI isn't configured on the server yet, so students can't take AI interviews. Ask your platform administrator to set the Gemini API key, then publish again.";
  if (code === "VALIDATION_REQUIRED")
    return "The interview changed while publishing. Check it again, then publish.";
  if (error?.response?.status === 409)
    return "This interview changed in another tab. Reload it to continue.";
  return error?.message || "Publishing failed. Try again.";
};

function SaveStatus({ state, created = true }) {
  let content;
  if (!created)
    content = (
      <>
        <CloudOff size={14} aria-hidden="true" />
        Not saved yet
      </>
    );
  else if (state.doc?.lifecycle === "archived") content = "Read only";
  else if (state.conflict)
    content = (
      <>
        <AlertCircle size={14} aria-hidden="true" className="text-rose-600" />
        <span className="text-rose-700 dark:text-rose-400">Changed elsewhere</span>
        <button
          type="button"
          className="font-semibold text-sky-700 underline dark:text-sky-300"
          onClick={() => {
            if (window.confirm("Discard your unsaved changes and load the saved version?")) state.reload();
          }}
        >
          Reload
        </button>
      </>
    );
  else if (state.error && !state.saving)
    content = (
      <>
        <AlertCircle size={14} aria-hidden="true" className="text-rose-600" />
        <span className="text-rose-700 dark:text-rose-400" title={state.error}>
          Couldn't save
        </span>
        <button type="button" className="font-semibold text-sky-700 underline dark:text-sky-300" onClick={state.save}>
          Retry
        </button>
      </>
    );
  else if (state.saving || state.dirty)
    content = (
      <>
        <Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        Saving…
      </>
    );
  else
    content = (
      <>
        <CheckCircle2 size={14} aria-hidden="true" className="text-emerald-600" />
        All changes saved
      </>
    );
  return (
    <p role="status" aria-live="polite" data-save-status className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-gray-400">
      {content}
    </p>
  );
}

// A reveal request names fields to open and focus on a step. Router navigation
// commits in a transition, so focusing waits until that step has rendered.
function useReveal(step) {
  const [reveal, setReveal] = useState(null);
  useEffect(() => {
    if (reveal?.focus && (!reveal.step || reveal.step === step)) focusFields(reveal.fields);
  }, [reveal, step]);
  return [reveal, setReveal];
}

function Message({ title, children }) {
  return (
    <main className={`${pageClass} px-4 py-16`}>
      <div className={`mx-auto max-w-md p-8 text-center ${surfaceClass}`}>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h1>
        <div className="mt-2 text-sm text-slate-500 dark:text-gray-400">{children}</div>
      </div>
    </main>
  );
}

export function CreateInterviewWizard() {
  const navigate = useNavigate(),
    location = useLocation();
  const [returnTo] = useState(() => location.state?.returnTo || ROOT);
  const [data, setData] = useState(newDefinition);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, setReveal] = useReveal("basics");
  const key = useRef(null);
  const errors = showErrors ? stepErrors("basics", data) : {};
  const create = async () => {
    const fields = Object.keys(stepErrors("basics", data));
    if (fields.length) {
      setShowErrors(true);
      setReveal({ fields, nonce: nonce(), focus: true });
      return;
    }
    setBusy(true);
    setError("");
    key.current ||= uid();
    try {
      // Best effort: without a profile the draft is still created and Review asks for one.
      const interviewer =
        data.interviewer ||
        (await ensureDefaultInterviewer(interviewApi, data.rules?.language).catch(() => null));
      const doc = await interviewApi.create(englishOnly({ ...data, interviewer }), key.current);
      navigate(`${ROOT}/${doc._id}/questions`, { replace: true, state: { returnTo } });
    } catch (err) {
      setError(err.message || "Could not create the interview.");
      setBusy(false);
    }
  };
  return (
    <WizardShell
      returnTo={returnTo}
      title={data.title.trim() || "New interview"}
      status={interviewStatus(null)}
      saveStatus={<SaveStatus created={false} />}
      current="basics"
      onStep={() => {}}
      stepReady={{}}
      locked
      notices={error && <Alert tone="error" title="Couldn't create the interview">{error}</Alert>}
      back={
        <Link className={buttonSecondary} to={returnTo}>
          Cancel
        </Link>
      }
      primary={
        <button type="button" className={buttonPrimary} disabled={busy} onClick={create}>
          {busy ? (
            <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          ) : null}
          {busy ? "Creating…" : "Continue"}
          {!busy && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      }
    >
      <fieldset disabled={busy} className="min-w-0">
        <StepBasics data={data} onChange={setData} errors={errors} />
      </fieldset>
    </WizardShell>
  );
}

export function EditInterviewWizard({ id }) {
  const { "*": rest } = useParams();
  const location = useLocation(),
    navigate = useNavigate();
  const parts = (rest || "basics").split("/");
  const step = resolveStep(parts[0]);
  const sectionsRoute = parts[0] === "sections";
  const sectionId = sectionsRoute ? parts[1] : undefined;
  const groupId = sectionsRoute && parts[2] === "groups" ? parts[3] : undefined;
  const state = useInterviewDraft(id);
  const caps = useRemote(interviewApi.capabilities, []);
  const [returnTo] = useState(() => location.state?.returnTo || ROOT);
  const [showErrors, setShowErrors] = useState({});
  const [reveal, setReveal] = useReveal(step);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [justPublished, setJustPublished] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [interviewer, setInterviewer] = useState({ busy: false, error: "" });
  const latest = useRef({ state, data: state.data });
  const topRef = useRef(null);
  const triedInterviewer = useRef(false);
  const autoChecked = useRef(null);
  useEffect(() => {
    latest.current = { state, data: state.data };
  });
  const setupInterviewer = async () => {
    const current = latest.current.data;
    if (!current) return null;
    if (current.interviewer) return current.interviewer;
    setInterviewer({ busy: true, error: "" });
    try {
      const value = await ensureDefaultInterviewer(interviewApi, current.rules?.language);
      const { state: now, data: fresh } = latest.current;
      if (fresh && !fresh.interviewer) now.change(englishOnly({ ...fresh, interviewer: value }));
      setInterviewer({ busy: false, error: "" });
      return value;
    } catch (err) {
      setInterviewer({ busy: false, error: err.message || "Request failed." });
      return null;
    }
  };
  const doc = state.doc,
    data = state.data;
  const archived = doc?.lifecycle === "archived";
  const validationCurrent = Boolean(
    doc && !state.dirty && doc.validation?.validatedRevision === doc.revision && doc.validation?.issues,
  );
  // An interview without an interviewer gets the default ANVI profile once.
  useEffect(() => {
    if (triedInterviewer.current || !data || data.interviewer || doc?.lifecycle !== "draft" || state.conflict) return;
    triedInterviewer.current = true;
    setupInterviewer();
  });
  // Entering Review runs the server check once per saved revision.
  useEffect(() => {
    if (step !== "review" || !doc || archived || state.conflict || state.saving || state.error || publishing) return;
    if (validationCurrent || autoChecked.current === doc.revision) return;
    autoChecked.current = doc.revision;
    // Validation bumps the revision; remember the checked one so the check never repeats itself.
    state.validate().then((value) => {
      if (value) autoChecked.current = value.revision;
    });
  });
  if (!step) return <Navigate to={`${ROOT}/${id}/basics`} replace />;
  if (state.loading && !doc)
    return (
      <Message title="Opening interview">
        <p role="status">Loading interview…</p>
      </Message>
    );
  if (!doc || !data)
    return (
      <Message title="Could not open this interview">
        <p>{state.error || "The interview may have been deleted or is not accessible."}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to={ROOT} className={buttonSecondary}>
            All interviews
          </Link>
          <button type="button" className={buttonPrimary} onClick={state.reload}>
            Retry
          </button>
        </div>
      </Message>
    );
  const readOnly = archived || state.conflict;
  // ANVI interviews are English only: every edit saves the English language settings.
  const change = (next) => state.change(englishOnly(next));
  const index = stepIndex(step);
  const limits = { ...DEFAULT_LIMITS, ...(caps.result?.limits || {}) };
  const errors = showErrors[step] ? stepErrors(step, data) : {};
  const progress = getAuthoringProgress(data);
  const status = interviewStatus(doc, state.dirty);
  // The saved document's counts (per-topic live questions); unsaved edits use the client preview.
  const serverSummary = state.dirty ? undefined : doc.summary;
  const publishedCurrent = Boolean(doc.publishedAt && doc.publishedRevision === doc.revision && !state.dirty);
  const stepReady = {
    ...Object.fromEntries(progress.steps.map((s) => [s.id, s.ready])),
    review: publishedCurrent,
  };
  const issues = validationCurrent ? doc.validation.issues.map((issue) => describeIssue(issue, data)) : [];
  const go = (target, nextReveal = null) => {
    setReveal(nextReveal && { ...nextReveal, step: target });
    setPublishError("");
    // A Fix link into ANVI settings opens the sub-tab that holds the field.
    const tab = target === "anvi" ? tabForFields(nextReveal?.fields) : null;
    navigate(`${ROOT}/${id}/${target}${tab ? `?tab=${tab}` : ""}`, { state: { returnTo } });
    topRef.current?.scrollIntoView?.({ block: "start" });
  };
  const onContinue = () => {
    const fields = Object.keys(stepErrors(step, data));
    if (fields.length && !readOnly) {
      setShowErrors((s) => ({ ...s, [step]: true }));
      setReveal({ fields, nonce: nonce(), focus: true });
      return;
    }
    go(STEPS[index + 1].id);
  };
  const publish = async () => {
    setPublishError("");
    setJustPublished(false);
    setPublishing(true);
    try {
      if (!latest.current.data?.interviewer && !(await setupInterviewer())) {
        setPublishError("Couldn't set up an interviewer. Open ANVI settings → Advanced and choose a saved profile.");
        return;
      }
      let value = doc;
      if (!(validationCurrent && doc.validation.complete && data.interviewer)) value = await state.validate();
      if (!value) {
        setPublishError("Your latest changes couldn't be saved or checked. Resolve the save error, then publish again.");
        return;
      }
      if (!value.validation?.complete) {
        setPublishError("Fix the items in the readiness check, then publish.");
        return;
      }
      const next = await interviewApi.action(id, "publish", value.revision);
      state.adopt(next);
      setJustPublished(true);
    } catch (err) {
      setPublishError(publishMessage(err));
    } finally {
      setPublishing(false);
    }
  };
  const runAction = async () => {
    const action = confirm.action;
    setActionBusy(true);
    setActionError("");
    try {
      const next = await interviewApi.action(id, action, latest.current.state.doc.revision);
      state.adopt(next);
      setConfirm(null);
      setJustPublished(false);
    } catch (err) {
      setActionError(err.message || "The action failed.");
    } finally {
      setActionBusy(false);
    }
  };
  const actionsBlocked = state.dirty || state.saving || state.conflict;
  const ask = (action) => {
    setActionError("");
    setConfirm({ action });
  };
  const CONFIRM = {
    unpublish: {
      title: "Unpublish interview",
      body: "Students will no longer see this interview. Attempts already finished keep their reports. You can publish it again later.",
      label: "Unpublish",
    },
    archive: {
      title: "Archive interview",
      body: "Archiving unpublishes the interview and makes it read-only. You can restore it from the directory.",
      label: "Archive",
    },
    restore: {
      title: "Restore interview",
      body: "The interview becomes an editable draft again. Publish it again when ready.",
      label: "Restore",
    },
  };
  const menuActions = [
    { id: "preview", label: "Preview as student", icon: Eye, run: () => go("review", { fields: ["preview"], nonce: nonce(), focus: true }) },
    ...(doc.publishedAt && !archived
      ? [{ id: "unpublish", label: "Unpublish", icon: EyeOff, run: () => ask("unpublish") }]
      : []),
    archived
      ? { id: "restore", label: "Restore as draft", icon: RotateCcw, run: () => ask("restore") }
      : { id: "archive", label: "Archive", icon: Archive, danger: true, run: () => ask("archive") },
  ];
  const primary =
    step !== "review" ? (
      <button type="button" className={buttonPrimary} onClick={onContinue}>
        Continue
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    ) : publishedCurrent ? (
      <Link to={returnTo} className={buttonPrimary}>
        <CheckCircle2 size={16} aria-hidden="true" />
        Done
      </Link>
    ) : (
      <button
        type="button"
        data-publish
        className={buttonPrimary}
        disabled={readOnly || publishing}
        onClick={publish}
      >
        {publishing ? (
          <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        ) : (
          <Send size={16} aria-hidden="true" />
        )}
        {publishing ? "Publishing…" : doc.publishedAt ? "Publish changes" : "Publish interview"}
      </button>
    );
  const back =
    index === 0 ? (
      <Link className={buttonSecondary} to={returnTo}>
        <ArrowLeft size={16} aria-hidden="true" />
        All interviews
      </Link>
    ) : (
      <button type="button" className={buttonSecondary} onClick={() => go(STEPS[index - 1].id)}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </button>
    );
  const notices = (
    <>
      {state.conflict && (
        <Alert
          tone="error"
          title="This interview changed elsewhere"
          action={
            <button
              type="button"
              className={buttonSecondary}
              onClick={() => {
                if (window.confirm("Discard your unsaved changes and load the saved version?")) state.reload();
              }}
            >
              Reload saved version
            </button>
          }
        >
          Your edits here are kept on screen but were not saved.
        </Alert>
      )}
      {archived && (
        <Alert
          tone="warning"
          title="Archived — read only"
          action={
            <button type="button" className={buttonSecondary} onClick={() => ask("restore")}>
              Restore
            </button>
          }
        >
          Restore this interview to edit or publish it again.
        </Alert>
      )}
      {actionError && !confirm && <Alert tone="error">{actionError}</Alert>}
    </>
  );
  return (
    <>
      <WizardShell
        topRef={topRef}
        returnTo={returnTo}
        title={data.title.trim() || "Untitled interview"}
        status={status}
        saveStatus={<SaveStatus state={state} />}
        menu={<InterviewActionMenu name={data.title || "interview"} actions={actionsBlocked ? menuActions.slice(0, 1) : menuActions} />}
        current={step}
        onStep={(target) => target !== step && go(target)}
        stepReady={stepReady}
        notices={notices}
        back={back}
        primary={primary}
      >
        {step === "review" ? (
          <StepReview
            interviewId={id}
            data={data}
            summary={serverSummary}
            issues={issues}
            checked={validationCurrent}
            checking={state.validating || (!validationCurrent && !archived && !state.error && !state.conflict)}
            onRecheck={() => state.validate()}
            onEdit={(target, field) => go(target, field ? { fields: [field], nonce: nonce(), focus: false } : null)}
            status={status}
            stepReady={stepReady}
            onPublish={publish}
            publishing={publishing}
            canAssign={Boolean(doc.publishedAt) && !archived}
            onFix={(issue) => {
              setShowErrors((s) => ({ ...s, [issue.step]: true }));
              go(issue.step, {
                fields: [issue.field],
                advanced: issue.advanced,
                nonce: nonce(),
                focus: true,
              });
            }}
            publishError={publishError}
            published={publishedCurrent}
            justPublished={justPublished && publishedCurrent}
            readOnly={readOnly}
          />
        ) : (
          <>
            {step === "basics" && (
              <fieldset disabled={readOnly} className="min-w-0">
                <StepBasics data={data} onChange={change} errors={errors} readOnly={readOnly} />
              </fieldset>
            )}
            {/* Questions disables its own controls so section disclosures stay usable when read-only. */}
            {step === "questions" && (
              <StepQuestions
                interviewId={id}
                api={interviewApi}
                data={data}
                summary={serverSummary}
                onChange={change}
                errors={errors}
                reveal={reveal}
                limits={limits}
                readOnly={readOnly}
                sectionId={sectionId}
                groupId={groupId}
                sectionsRoute={sectionsRoute}
              />
            )}
            {/* ANVI settings disables its own controls so its sub-tabs stay usable when read-only. */}
            {step === "anvi" && (
              <StepAnviSettings
                data={data}
                onChange={change}
                errors={errors}
                reveal={reveal}
                readOnly={readOnly}
                interviewer={{ ...interviewer, retry: () => setupInterviewer() }}
                interviewId={id}
                published={Boolean(doc.publishedAt) && !archived}
                summary={serverSummary}
              />
            )}
          </>
        )}
      </WizardShell>
      {confirm && (
        <Dialog title={CONFIRM[confirm.action].title} onClose={() => !actionBusy && setConfirm(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-gray-300">{CONFIRM[confirm.action].body}</p>
            {actionError && <Alert tone="error">{actionError}</Alert>}
            <div className="flex justify-end gap-2">
              <button type="button" className={buttonSecondary} disabled={actionBusy} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button type="button" className={buttonPrimary} disabled={actionBusy || (confirm.action !== "restore" && actionsBlocked)} onClick={runAction}>
                {actionBusy ? "Working…" : CONFIRM[confirm.action].label}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
