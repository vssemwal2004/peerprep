import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  AudioLines,
  ClipboardCheck,
  Clock,
  FileUser,
  MessageCircle,
  MessagesSquare,
  Plus,
  ScanEye,
  ScrollText,
  Settings2,
  SlidersHorizontal,
  Trash2,
  UserRound,
} from "lucide-react";
import { ResourcePicker } from "../Resources";
import { avatarApi } from "../avatars/api";
import { FOLLOW_UP_LIMIT, anviSettings, equalWeights, uid } from "../definition";
import { AnviTile, Toggle, surfaceClass } from "../ui";
import {
  readDefaultFollowUps,
  renderScript,
  suggestedScripts,
  toInterviewer,
  writeDefaultFollowUps,
} from "./defaults";
import { questionEntries } from "./structure";
import { ANSWER_TIMES, PACES, TONES, VOICES, rubricTotal, voiceAccent } from "./steps";
import ConductCard from "./settings/ConductCard";
import ProctoringCard from "./settings/ProctoringCard";
import ResumeCard from "./settings/ResumeCard";
import { AudioCard, DurationCard, LiveMinutesCard } from "./settings/RuntimeCards";
import SettingsTabs from "./settings/SettingsTabs";
import TermsCard from "./settings/TermsCard";
import WarmupCard from "./settings/WarmupCard";
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
  FieldLabel,
  NumberField,
  Segmented,
  SelectField,
  StepHeading,
  buttonGhost,
  buttonSecondary,
  iconButton,
  inputBase,
} from "./controls";

const TAB_ICONS = {
  voice: AudioLines,
  conversation: MessagesSquare,
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

const VARIABLES = [
  ["{name}", "Student's first name"],
  ["{role}", "Job role"],
  ["{company}", "Company name"],
  ["{count}", "Number of questions"],
  ["{duration}", "Estimated length"],
];
const NUDGE_OPTIONS = [15, 30, 45, 60, 90, 120].map((s) => ({
  value: String(s),
  label: s < 60 ? `${s} seconds` : `${s / 60} minute${s === 60 ? "" : "s"}`,
}));

function ScriptField({ label, value, onChange, fallback, suggestion, data, readOnly }) {
  const ref = useRef(null);
  const id = `script-${label.toLowerCase().replace(/\W+/g, "-")}`;
  const insert = (variable) => {
    const element = ref.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}${variable}${value.slice(end)}`.slice(0, 2000));
    setTimeout(() => {
      if (!element?.isConnected) return;
      element.focus();
      element.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };
  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FieldLabel htmlFor={id} optional>
          {label}
        </FieldLabel>
        {!value && !readOnly && (
          <button type="button" className={`${buttonGhost} mb-1 text-xs`} onClick={() => onChange(suggestion)}>
            Use a suggested script
          </button>
        )}
      </div>
      <textarea
        ref={ref}
        id={id}
        rows={3}
        maxLength={2000}
        value={value}
        placeholder={suggestion}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputBase} min-h-20 resize-y border-slate-300 py-2 leading-relaxed dark:border-gray-700`}
      />
      <div role="group" aria-label={`Insert a variable into the ${label.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 dark:text-gray-400">Insert:</span>
        {VARIABLES.map(([variable, help]) => (
          <button
            key={variable}
            type="button"
            title={help}
            aria-label={`Insert ${variable} (${help})`}
            onClick={() => insert(variable)}
            className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs text-slate-700 hover:border-sky-300 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-sky-950"
          >
            {variable}
          </button>
        ))}
        <span className="ml-auto text-xs tabular-nums text-slate-400">{value.length} / 2000</span>
      </div>
      <div className="rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-800/60">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">
          Preview
        </p>
        <p data-script-preview className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-gray-200">
          {value.trim() ? (
            <>“{renderScript(value, data)}”</>
          ) : (
            <span className="italic text-slate-500 dark:text-gray-400">{fallback}</span>
          )}
        </p>
      </div>
    </div>
  );
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
}) {
  const settings = anviSettings(data.anvi);
  const { persona, turns } = settings;
  const [active, setActive] = useSettingsTab(reveal);
  const [followUps, setFollowUps] = useState(readDefaultFollowUps);
  const [avatars, setAvatars] = useState([]);
  const [avatarError, setAvatarError] = useState("");
  const panelRef = useRef(null);
  useEffect(() => {
    let mounted = true;
    avatarApi.list({ page: 1, limit: 50, active: true }).then((result) => {
      if (mounted) setAvatars(result.items || []);
    }).catch(() => { if (mounted) setAvatarError("Avatar library could not be loaded."); });
    return () => { mounted = false; };
  }, []);
  const selectTab = (id) => {
    if (id === active) return;
    setActive(id);
    // From further down the page, bring the start of the new tab into view.
    const top = panelRef.current?.getBoundingClientRect?.().top;
    if (typeof top === "number" && top < 0) panelRef.current.scrollIntoView?.({ block: "start" });
  };
  const setPersona = (patch) =>
    onChange({ ...data, anvi: { ...settings, persona: { ...persona, ...patch } } });
  const setTurns = (patch) =>
    onChange({ ...data, anvi: { ...settings, turns: { ...turns, ...patch } } });
  const setVoice = (patch) =>
    onChange({ ...data, anvi: { ...settings, voice: { ...settings.voice, ...patch } } });
  const setAvatar = (patch) =>
    onChange({ ...data, anvi: { ...settings, avatar: { ...settings.avatar, ...patch } } });
  const voice = VOICES.find((option) => option.value === settings.voice.name) || VOICES[0];
  const suggestion = suggestedScripts(data);
  const questions = questionEntries(data);
  const answerTime = data.rules?.responseSeconds;
  const status = settingsTabStatus(data, { errors, interviewer });
  const activeTab = SETTINGS_TABS.find((tab) => tab.id === active);
  const applyFollowUps = () =>
    onChange({
      ...data,
      sections: data.sections.map((s) => ({
        ...s,
        groups: s.groups.map((g) =>
          g.source === "annu"
            ? g
            : {
                ...g,
                questions: g.questions.map((q) => ({
                  ...q,
                  maxFollowUps: Math.max(
                    0,
                    Math.min(followUps, FOLLOW_UP_LIMIT - (q.followUps || []).length),
                  ),
                })),
              },
        ),
      })),
    });

  const panels = {
    voice: (
      <PanelGrid>
        <Cell>
        <section data-field="voice" aria-labelledby="anvi-voice-heading" className={`${surfaceClass} overflow-hidden`}>
          <header className="flex flex-wrap items-center gap-4 border-b border-violet-100 bg-gradient-to-br from-violet-50/80 via-white to-fuchsia-50/50 px-5 py-4 dark:border-violet-500/15 dark:from-violet-500/10 dark:via-gray-900 dark:to-fuchsia-500/5">
            <AnviTile size="lg" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">Your interviewer</p>
              <h3 id="anvi-voice-heading" className="mt-0.5 text-[15px] font-semibold leading-6 text-slate-900 dark:text-white">ANVI&apos;s voice</h3>
              <p data-anvi-voice className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-gray-300">
                <AudioLines size={15} aria-hidden="true" className="shrink-0 text-violet-500 dark:text-violet-400" />
                <span>
                  Speaks as <strong className="font-semibold text-slate-900 dark:text-white">{voice.label}</strong> · {voiceAccent(data)}
                </span>
              </p>
            </div>
          </header>
          <div className="space-y-6 p-5">
            <Segmented
              label="Voice"
              variant="cards"
              columns="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-2"
              options={VOICES.map((option) => ({ ...option, ariaLabel: `${option.label}, ${option.gender.toLowerCase()}, ${option.style.toLowerCase()}` }))}
              value={voice.value}
              disabled={readOnly}
              onChange={(name) => setVoice({ name })}
              renderCard={(option, checked) => (
                <>
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${checked ? "bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm shadow-violet-600/30" : "bg-slate-100 text-slate-500 dark:bg-gray-800 dark:text-gray-400"}`}
                  >
                    <AudioLines size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                      {option.label}
                      {option.note && (
                        <span className="rounded-full bg-violet-100 px-1.5 py-px text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                          {option.note}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-slate-500 dark:text-gray-400">
                      {option.gender} · {option.style}
                    </span>
                  </span>
                </>
              )}
            />
          </div>
        </section>
        </Cell>
        <Cell>
          <div className="grid content-start gap-6">
        <Card data-field="persona" title="Personality" description="How ANVI speaks to the student." icon={MessageCircle}>
          <div className="grid gap-6 sm:grid-cols-2">
            <Segmented label="Tone" options={TONES} value={persona.tone} onChange={(tone) => setPersona({ tone })} />
            <Segmented label="Pace" options={PACES} value={persona.pace} onChange={(pace) => setPersona({ pace })} />
            <div className="sm:col-span-2">
            <Toggle
              label="Short acknowledgements"
              description="ANVI says a brief “Thank you” or “Got it” before moving on. Turn off to go straight to the next question."
              checked={persona.acknowledgements}
              onChange={(acknowledgements) => setPersona({ acknowledgements })}
              disabled={readOnly}
            />
            </div>
          </div>
        </Card>
        <Card title="Video avatar" description="Show a reusable ANVI video during the live interview." icon={UserRound}>
          <div className="space-y-5">
            <Toggle
              label="Enable ANVI video avatar"
              description="ANVI switches between uploaded gesture clips while listening, thinking and speaking. No new video is generated for each response."
              checked={settings.avatar.enabled}
              onChange={(enabled) => setAvatar({ enabled })}
              disabled={readOnly}
            />
            {settings.avatar.enabled && (
              <SelectField
                label="Avatar"
                field="avatar"
                value={settings.avatar.avatarId || ""}
                options={[
                  { value: "", label: "Choose an avatar" },
                  ...avatars.filter((item) => item.gestures?.idle && item.gestures?.speaking_neutral).map((item) => ({
                    value: String(item._id), label: item.data?.name || "Untitled avatar",
                  })),
                ]}
                hint="Create gesture clips in Avatar Studio. Idle and Speaking · neutral are required; missing optional gestures fall back automatically."
                disabled={readOnly}
                onChange={(avatarId) => setAvatar({ avatarId })}
              />
            )}
            {settings.avatar.enabled && !settings.avatar.avatarId && <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">Choose a ready avatar before publishing.</p>}
            {avatarError && <p className="text-xs text-amber-700 dark:text-amber-300">{avatarError}</p>}
          </div>
        </Card>
          </div>
        </Cell>
        <Cell wide>
        <Card title="What ANVI says" description="Optional scripts for the start and the end. Variables are filled in for each student." icon={ScrollText}>
          <div className="grid gap-6 xl:grid-cols-2">
            <ScriptField
              label="Introduction script"
              value={persona.introduction}
              onChange={(introduction) => setPersona({ introduction })}
              suggestion={suggestion.introduction}
              fallback="Empty: ANVI introduces herself and the interview in her own words."
              data={data}
              readOnly={readOnly}
            />
            <ScriptField
              label="Closing script"
              value={persona.closing}
              onChange={(closing) => setPersona({ closing })}
              suggestion={suggestion.closing}
              fallback="Empty: ANVI thanks the student and says the report is on its way."
              data={data}
              readOnly={readOnly}
            />
          </div>
        </Card>
        </Cell>
      </PanelGrid>
    ),
    conversation: (
      <>
        <Card data-field="turns" title="Turn-taking" description="How ANVI handles pauses and spoken commands." icon={Clock}>
          <div className="grid gap-6 xl:grid-cols-2 xl:gap-x-10">
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="anvi-silence" className="text-sm font-medium text-slate-800 dark:text-gray-200">
                  Reply after silence
                </label>
                <output htmlFor="anvi-silence" className="rounded-md bg-sky-50 px-2 py-0.5 text-sm font-semibold tabular-nums text-sky-800 dark:bg-sky-950 dark:text-sky-200">
                  {turns.silenceSeconds.toFixed(1)} s
                </output>
              </div>
              <input
                id="anvi-silence"
                type="range"
                min={1.5}
                max={4}
                step={0.5}
                value={turns.silenceSeconds}
                aria-describedby="anvi-silence-help"
                aria-valuetext={`${turns.silenceSeconds} seconds`}
                onChange={(e) => setTurns({ silenceSeconds: Number(e.target.value) })}
                className="w-full accent-sky-600"
              />
              <div aria-hidden="true" className="mt-1 flex justify-between text-xs tabular-nums text-slate-400">
                <span>1.5 s · quicker</span>
                <span>4 s · more time to think</span>
              </div>
              <p id="anvi-silence-help" className="mt-1.5 text-xs text-slate-500 dark:text-gray-400">
                ANVI replies after this much silence. Longer suits students who pause while thinking.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <SelectField
                label="Nudge if silent after"
                value={String(turns.nudgeSeconds)}
                options={
                  NUDGE_OPTIONS.some((o) => o.value === String(turns.nudgeSeconds))
                    ? NUDGE_OPTIONS
                    : [...NUDGE_OPTIONS, { value: String(turns.nudgeSeconds), label: `${turns.nudgeSeconds} seconds` }]
                }
                hint="ANVI checks in gently when a student goes quiet."
                onChange={(value) => setTurns({ nudgeSeconds: Number(value) })}
              />
              <Segmented
                label="Maximum nudges per question"
                options={[0, 1, 2, 3].map((n) => ({ value: n, label: n === 0 ? "None" : String(n) }))}
                value={turns.maxNudges}
                hint="After this many, ANVI moves on."
                onChange={(maxNudges) => setTurns({ maxNudges })}
              />
            </div>
            <div className="xl:col-span-2">
            <Toggle
              label="Voice commands"
              description="Students can say “skip” or “repeat the question” to control the interview."
              checked={turns.voiceCommands}
              onChange={(voiceCommands) => setTurns({ voiceCommands })}
              disabled={readOnly}
            />
            </div>
          </div>
        </Card>
        <PanelGrid>
          <Cell>
            <WarmupCard data={data} onChange={onChange} readOnly={readOnly} />
          </Cell>
          <Cell>
            <ConductCard data={data} onChange={onChange} readOnly={readOnly} />
          </Cell>
        </PanelGrid>
      </>
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
          <LiveMinutesCard data={data} onChange={onChange} readOnly={readOnly} />
        </Cell>
        <Cell>
        <Card
          data-field="interviewer"
          title="Interviewer profile"
          description="Use a saved interviewer profile instead of the default ANVI profile."
          icon={UserRound}
        >
          <div className="space-y-3">
            <FieldLabel optional>Use a saved interviewer profile</FieldLabel>
            <div className="max-w-md">
              <ResourcePicker
                kind="profiles"
                disabled={readOnly}
                selected={data.interviewer?.name}
                onSelect={(profile) => onChange({ ...data, interviewer: toInterviewer(profile) })}
              />
            </div>
            {interviewer?.busy ? (
              <p role="status" className="text-sm text-slate-500">Setting up the default ANVI profile…</p>
            ) : interviewer?.error && !data.interviewer ? (
              <Alert
                tone="error"
                action={
                  <button type="button" className={buttonSecondary} onClick={interviewer.retry}>
                    Try again
                  </button>
                }
              >
                Couldn't set up the default interviewer: {interviewer.error}
              </Alert>
            ) : (
              <p className="text-sm text-slate-500 dark:text-gray-400">
                {data.interviewer
                  ? `Using “${data.interviewer.name || data.interviewer.displayName}”. A profile's own introduction is used only when the introduction script (Voice & personality tab) is empty.`
                  : "No profile selected yet."}
              </p>
            )}
          </div>
        </Card>
        </Cell>
        <Cell>
        <Card title="Defaults for questions" description="Used unless a question sets its own." icon={Settings2}>
          <div className="grid gap-6 sm:grid-cols-2">
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
            <div>
              <NumberField
                label="Default follow-ups for new questions"
                stepper
                min={0}
                max={FOLLOW_UP_LIMIT}
                value={followUps}
                onChange={(value) => {
                  setFollowUps(value);
                  writeDefaultFollowUps(value);
                }}
                hint="Remembered in this browser for questions you add next."
              />
              {questions.length > 0 && !readOnly && (
                <button type="button" className={`${buttonGhost} mt-1 text-xs`} onClick={applyFollowUps}>
                  Apply to all {questions.length} question{questions.length === 1 ? "" : "s"}
                </button>
              )}
            </div>
          </div>
        </Card>
        </Cell>
      </PanelGrid>
    ),
  };

  return (
    <div>
      <StepHeading
        title="How should ANVI conduct it?"
        description="Set how ANVI sounds, how she runs the conversation and the rules she follows. Interviews are in English, and the defaults suit most of them."
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
