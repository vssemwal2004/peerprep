import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AudioLines, ClipboardCheck, FileUser, Plus, ScanEye, Settings2, SlidersHorizontal, Trash2 } from "lucide-react";
import { equalWeights, uid } from "../definition";
import { ANSWER_TIMES, rubricTotal } from "./steps";
import ProctoringCard from "./settings/ProctoringCard";
import ResumeCard from "./settings/ResumeCard";
import { AudioCard, DurationCard } from "./settings/RuntimeCards";
import SettingsTabs from "./settings/SettingsTabs";
import TermsCard from "./settings/TermsCard";
import VoiceCard from "./settings/VoiceCard";
import {
  DEFAULT_SETTINGS_TAB,
  SETTINGS_TABS,
  resolveSettingsTab,
  settingsPanelId,
  settingsTabId,
  settingsTabStatus,
  tabForFields,
} from "./settings/tabs";
import {
  Alert,
  Card,
  NumberField,
  SelectField,
  StepHeading,
  buttonGhost,
  buttonSecondary,
  iconButton,
  inputBase,
} from "./controls";

const TAB_ICONS = {
  voice: AudioLines,
  candidate: FileUser,
  proctoring: ScanEye,
  scoring: ClipboardCheck,
  advanced: SlidersHorizontal,
};
const TABS = SETTINGS_TABS.map((tab) => ({ ...tab, Icon: TAB_ICONS[tab.id] }));

// A tab's cards: two columns from xl (1280px). Cells are grids themselves, so the cards in a row
// stretch to the same height; `wide` cards span both columns.
function PanelGrid({ children }) {
  return <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-2">{children}</div>;
}
function Cell({ wide = false, children }) {
  return <div className={`grid min-w-0 ${wide ? "xl:col-span-2" : ""}`}>{children}</div>;
}

function Rubric({ data, onChange, error }) {
  const rubric = data.rubric || [];
  const total = rubricTotal(rubric);
  const set = (next) => onChange({ ...data, rubric: next });
  const update = (id, patch) => set(rubric.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const ok = Math.abs(total - 100) <= 0.001;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-gray-400">
        ANVI rates each answer against these criteria in the report. Weights must total 100%.
      </p>
      <ul className="grid gap-3 xl:grid-cols-2">
        {rubric.map((criterion, index) => (
          <li key={criterion.id} className="rounded-xl border border-slate-200 p-3 dark:border-gray-800">
            <div className="grid grid-cols-[minmax(0,1fr)_110px_auto] items-start gap-2">
              <input
                aria-label={`Criterion ${index + 1} name`}
                value={criterion.name}
                maxLength={120}
                placeholder="Criterion name"
                onChange={(e) => update(criterion.id, { name: e.target.value })}
                className={`${inputBase} h-10 border-slate-300 dark:border-gray-700`}
              />
              <NumberField
                label={`Weight for ${criterion.name || `criterion ${index + 1}`}`}
                hideLabel
                decimals
                min={0}
                max={100}
                suffix="%"
                value={criterion.weight}
                onChange={(weight) => update(criterion.id, { weight })}
              />
              <button
                type="button"
                className={`${iconButton} mt-1`}
                aria-label={`Remove ${criterion.name || `criterion ${index + 1}`}`}
                onClick={() => set(rubric.filter((r) => r.id !== criterion.id))}
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
            <input
              aria-label={`What ${criterion.name || `criterion ${index + 1}`} assesses`}
              value={criterion.description}
              maxLength={2000}
              placeholder="What evidence should this criterion look for?"
              onChange={(e) => update(criterion.id, { description: e.target.value })}
              className={`${inputBase} mt-2 h-9 border-slate-200 text-xs dark:border-gray-800`}
            />
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonSecondary}
            disabled={rubric.length >= 12}
            onClick={() => set([...rubric, { id: uid(), name: "", description: "", weight: 0 }])}
          >
            <Plus size={15} aria-hidden="true" />
            Add criterion
          </button>
          {rubric.length > 0 && !ok && (
            <button type="button" className={buttonGhost} onClick={() => set(equalWeights(rubric))}>
              Split evenly
            </button>
          )}
        </div>
        <p
          data-rubric-total
          className={`text-sm font-semibold tabular-nums ${ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-300"}`}
        >
          Total {total}%
        </p>
      </div>
      {!ok && rubric.length > 0 && (
        <p role={error ? "alert" : undefined} className="text-sm text-amber-800 dark:text-amber-300">
          Weights add up to {total}%. Adjust them so they total exactly 100%.
        </p>
      )}
      {error && ok && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
// The selected sub-tab lives in ?tab=. A tab chosen here (click, or a reveal from Continue or a
// Fix link) renders at once and is then written to the URL, so a reveal can focus its field
// in the same commit.
function useSettingsTab(reveal) {
  const location = useLocation(),
    navigate = useNavigate();
  const [params] = useSearchParams();
  const urlTab = resolveSettingsTab(params.get("tab"));
  const [pending, setPending] = useState(null);
  const [seenReveal, setSeenReveal] = useState(null);
  let active = pending || urlTab || DEFAULT_SETTINGS_TAB;
  if (reveal && reveal.nonce !== seenReveal) {
    setSeenReveal(reveal.nonce);
    const target = tabForFields(reveal.fields);
    if (target && target !== active) {
      setPending(target);
      active = target;
    }
  } else if (pending && pending === urlTab) setPending(null);
  useEffect(() => {
    if (!pending || pending === urlTab) return;
    const search = new URLSearchParams(location.search);
    search.set("tab", pending);
    navigate({ pathname: location.pathname, search: `?${search}` }, { replace: true, state: location.state });
  }, [pending, urlTab, location, navigate]);
  return [active, setPending];
}

// How ANVI runs the conversation is fixed for every interview: the intro and closing lines, the opening
// small talk, pauses before she replies, nudges, voice commands and the ground rules. Admins set her speed.
export default function StepAnviSettings({
  data,
  onChange,
  errors = {},
  reveal,
  readOnly,
  interviewer,
  interviewId,
  published = false,
  summary,
  audioApi,
  voiceSampleApi,
}) {
  const [active, setActive] = useSettingsTab(reveal);
  const panelRef = useRef(null);
  const selectTab = (id) => {
    if (id === active) return;
    setActive(id);
    // From further down the page, bring the start of the new tab into view.
    const top = panelRef.current?.getBoundingClientRect?.().top;
    if (typeof top === "number" && top < 0) panelRef.current.scrollIntoView?.({ block: "start" });
  };
  const answerTime = data.rules?.responseSeconds;
  const status = settingsTabStatus(data, { errors, interviewer });
  const activeTab = SETTINGS_TABS.find((tab) => tab.id === active);

  const panels = {
    voice: (
      <div className="max-w-3xl">
        <VoiceCard data={data} onChange={onChange} readOnly={readOnly} {...(voiceSampleApi ? { sampleApi: voiceSampleApi } : {})} />
      </div>
    ),
    candidate: (
      <PanelGrid>
        <Cell>
          <ResumeCard data={data} onChange={onChange} readOnly={readOnly} />
        </Cell>
        <Cell>
          <TermsCard data={data} onChange={onChange} readOnly={readOnly} />
        </Cell>
      </PanelGrid>
    ),
    proctoring: <ProctoringCard data={data} onChange={onChange} readOnly={readOnly} />,
    scoring: (
      <Card
        data-field="rubric"
        title="Scoring rubric"
        description="Knowledge, communication and problem solving by default."
        icon={ClipboardCheck}
        action={
          Math.abs(rubricTotal(data.rubric) - 100) > 0.001 || errors.rubric ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900">
              Needs attention
            </span>
          ) : null
        }
      >
        <Rubric data={data} onChange={onChange} error={errors.rubric} />
      </Card>
    ),
    advanced: (
      <PanelGrid>
        <Cell>
          <DurationCard data={data} onChange={onChange} summary={summary} />
        </Cell>
        <Cell>
          <AudioCard interviewId={interviewId} published={published} readOnly={readOnly} audioApi={audioApi} />
        </Cell>
        <Cell wide>
          <Card data-field="answerTime" title="Default answer time" description="Used unless a question sets its own." icon={Settings2}>
            <div className="max-w-xs">
              <SelectField
                label="Default answer time"
                field="answerTime"
                value={answerTime === null ? "unlimited" : String(answerTime ?? 120)}
                options={[
                  ...ANSWER_TIMES.map((o) => ({ value: o.value === null ? "unlimited" : String(o.value), label: o.label })),
                  ...(typeof answerTime === "number" && !ANSWER_TIMES.some((o) => o.value === answerTime)
                    ? [{ value: String(answerTime), label: `Custom (${answerTime} s)` }]
                    : []),
                ]}
                hint="How long a student can speak per answer."
                onChange={(value) =>
                  onChange({ ...data, rules: { ...data.rules, responseSeconds: value === "unlimited" ? null : Number(value) } })
                }
              />
            </div>
          </Card>
        </Cell>
        {interviewer?.error && !data.interviewer && (
          <Cell wide>
            <div data-field="interviewer">
              <Alert
                tone="error"
                action={
                  <button type="button" className={buttonSecondary} onClick={interviewer.retry}>
                    Try again
                  </button>
                }
              >
                Couldn't set up ANVI for this interview: {interviewer.error}
              </Alert>
            </div>
          </Cell>
        )}
      </PanelGrid>
    ),
  };

  return (
    <div>
      <StepHeading
        title="How should ANVI conduct it?"
        description="ANVI runs every interview the same professional way, in English. Set her speed, what students share first, proctoring, scoring and the length."
      />
      {/* Outside the read-only fieldset, so the tabs stay usable on archived interviews. */}
      <SettingsTabs tabs={TABS} active={active} status={status} onSelect={selectTab} />
      <div
        ref={panelRef}
        role="tabpanel"
        id={settingsPanelId(active)}
        aria-labelledby={settingsTabId(active)}
        data-settings-panel={active}
        className="min-w-0 scroll-mt-20 pt-8"
      >
        <div className="mb-6">
          <h3 data-settings-panel-title className="text-lg font-semibold leading-7 tracking-tight text-slate-900 dark:text-white">
            {activeTab.label}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-gray-400">{activeTab.description}</p>
        </div>
        <fieldset disabled={readOnly} className="min-w-0 space-y-6 [&>legend+*]:!mt-0">
          <legend className="sr-only">{activeTab.label}</legend>
          {panels[active]}
        </fieldset>
      </div>
    </div>
  );
}
