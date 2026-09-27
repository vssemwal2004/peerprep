import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Film,
  ImagePlus,
  LoaderCircle,
  Play,
  Save,
  Upload,
} from "lucide-react";
import { avatarApi, AVATAR_ROOT } from "./api";
import {
  AvatarStatus,
  AvatarSteps,
  PreviewDialog,
  PreviewPlaceholder,
  SourceVisual,
} from "./components";
import { languageName, languagePreview, previewReady, renderActive, renderStageLabel } from "./definition";
import AudioRecorder from "./AudioRecorder";
import { AnnuBrand } from "../AnnuBrand";
import { useRemote } from "../useRemote";
import {
  Dialog,
  Field,
  Notice,
  Panel,
  Select,
  TextArea,
  TextInput,
  primaryClass,
  secondaryClass,
} from "../ui";

const initialData = () => ({
  name: "",
  role: "",
  description: "",
  language: "en",
  introduction: "",
  speechMode: "upload",
  voice: "default",
  consent: false,
});
const recoveredDrafts = new Map();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
function remember(key, entry) {
  recoveredDrafts.delete(key);
  recoveredDrafts.set(key, entry);
  while (recoveredDrafts.size > 20)
    recoveredDrafts.delete(recoveredDrafts.keys().next().value);
}
const sourceTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/webm",
];
const audioTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
];

function EditorSession({ initial, capabilities, onReload }) {
  const navigate = useNavigate(),
    location = useLocation();
  const cacheKey = initial._id || "new-avatar";
  const [recovery, setRecovery] = useState(() => recoveredDrafts.get(cacheKey));
  const canRecover = Boolean(recovery && same(recovery.base, initial.data));
  const [data, setData] = useState(
    () => {
      const values = structuredClone(canRecover ? recovery.data : initial.data);
      const language = location.state?.avatarLanguage;
      if (!canRecover && ["en", "hi", "hinglish"].includes(language) && initial.active !== false) {
        values.language = language;
        const previous = languagePreview(initial, language);
        if (previous?.introduction) values.introduction = previous.introduction;
      }
      return values;
    },
  );
  const [doc, setDoc] = useState(initial),
    [step, setStep] = useState(
      Math.max(0, Math.min(2, Number(location.state?.avatarStep) || 0)),
    );
  const [source, setSource] = useState(null),
    [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(
      canRecover
        ? "Your unsaved avatar details were recovered in this tab."
        : "",
    );
  const [recording, setRecording] = useState(false),
    [preview, setPreview] = useState(false),
    [suggestion, setSuggestion] = useState(null);
  const [pollError, setPollError] = useState("");
  const [conflict, setConflict] = useState(false);
  const documentRef = useRef(doc),
    mounted = useRef(true),
    guard = useRef(false);
  const staleRecovery = Boolean(recovery && !canRecover);
  const dirty = !same(data, doc.data) || Boolean(source || audio);
  const archived = doc.active === false;
  const rendering = renderActive(doc);
  const locked = Boolean(busy || rendering || archived || recording);
  const availableStorage = capabilities.storage?.ready === true;
  const availableRenderer =
    capabilities.renderer?.configured === true &&
    capabilities.renderer?.available !== false;
  const maxUpload = capabilities.limits?.maxUploadMB || 25,
    maxDuration = capabilities.limits?.maxIntroSeconds || 60;
  const ready = previewReady(doc) && !dirty;
  const displayedSource = source || doc.assets?.source;
  const languages = capabilities.languages?.length
    ? capabilities.languages
    : [
        { value: "en", label: "English" },
        { value: "hi", label: "Hindi" },
        { value: "hinglish", label: "Hinglish (experimental)" },
      ];
  const voices = capabilities.voices?.length
    ? capabilities.voices
    : [{ value: "default", label: "Default voice" }];
  const ttsSupported =
    capabilities.tts?.configured === true && data.language !== "hinglish";
  const audioLanguage = audio?.language || doc.assets?.audio?.language || initial.data.language;
  const audioMismatch = data.speechMode === "upload" && Boolean(audio || doc.assets?.audio) && audioLanguage !== data.language;
  guard.current = dirty || recording || Boolean(busy);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(
    () => () => {
      if (source?.url) URL.revokeObjectURL(source.url);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (audio?.url) URL.revokeObjectURL(audio.url);
    },
    [audio],
  );
  useEffect(() => {
    const beforeUnload = (event) => {
      if (guard.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const beforeLink = (event) => {
      const link = event.target.closest?.("a[href]");
      if (
        !guard.current ||
        !link ||
        link.target === "_blank" ||
        event.defaultPrevented
      )
        return;
      if (
        !window.confirm(
          "Leave this avatar? Unsaved uploads or recordings will be lost.",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", beforeLink, true);
    };
  }, []);
  useEffect(() => {
    if (!rendering || !doc._id || busy) return;
    let active = true,
      timer;
    const poll = async () => {
      try {
        const next = await avatarApi.status(doc._id);
        if (!active) return;
        documentRef.current = next;
        setDoc(next);
        setPollError("");
        if (renderActive(next)) timer = setTimeout(poll, 2500);
      } catch (err) {
        if (active) {
          setPollError(`Preview status could not refresh: ${err.message}`);
          timer = setTimeout(poll, 5000);
        }
      }
    };
    timer = setTimeout(poll, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [doc._id, rendering, busy]);

  const update = (next) => {
    if (locked) return;
    setData(next);
    if (same(next, documentRef.current.data)) recoveredDrafts.delete(cacheKey);
    else
      remember(cacheKey, {
        base: structuredClone(documentRef.current.data),
        data: structuredClone(next),
      });
    setMessage("");
  };
  const set = (key, value) => update({ ...data, [key]: value });
  const acceptFile = (kind, file) => {
    if (!file || busy || rendering || archived) return;
    const mime = file.type.split(";")[0];
    if (!(kind === "source" ? sourceTypes : audioTypes).includes(mime)) {
      setError(
        kind === "source"
          ? "Choose a JPG, PNG, WebP, MP4 or WebM source."
          : "Choose a WAV, MP3, M4A, WebM or OGG audio file.",
      );
      return;
    }
    if (file.size > maxUpload * 1024 * 1024) {
      setError(`Files must be ${maxUpload} MB or smaller.`);
      return;
    }
    const selection = {
      file,
      name: file.name,
      mime: file.type,
      kind: mime.startsWith("video/") ? "video" : "image",
      language: data.language,
      url: URL.createObjectURL(file),
    };
    if (kind === "source") setSource(selection);
    else setAudio(selection);
    setError("");
    setMessage("");
  };
  const applyDoc = (next) => {
    documentRef.current = next;
    if (mounted.current) setDoc(next);
    return next;
  };
  const persist = async () => {
    if (!data.name.trim())
      throw new Error("Give your avatar a name before saving.");
    if (staleRecovery)
      throw new Error("Restore or discard the recovered edit before saving.");
    let next = documentRef.current;
    if (!next._id) next = applyDoc(await avatarApi.create(data));
    else if (!same(data, next.data))
      next = applyDoc(await avatarApi.save(next._id, next.revision, data));
    recoveredDrafts.delete(cacheKey);
    if (mounted.current) setData(next.data);
    if ((source || audio) && !availableStorage)
      throw new Error(
        "Media storage setup is required before uploading files.",
      );
    if (source) {
      next = applyDoc(
        await avatarApi.upload(next._id, next.revision, "source", source.file),
      );
      if (mounted.current) setSource(null);
    }
    if (audio) {
      if (audio.language !== data.language) throw new Error("Select the recording language again or replace the audio before saving this upload.");
      next = applyDoc(
        await avatarApi.upload(next._id, next.revision, "audio", audio.file),
      );
      if (mounted.current) setAudio(null);
    }
    return next;
  };
  const canonical = (next, nextStep = step) => {
    if (!mounted.current) return;
    if (!initial._id) {
      guard.current = false;
      navigate(`${AVATAR_ROOT}/${next._id}/edit`, {
        replace: true,
        state: { avatarStep: nextStep },
      });
    } else setStep(nextStep);
  };
  const perform = async (label, operation) => {
    if (busy || archived || recording || rendering) return;
    setBusy(label);
    setError("");
    setMessage("");
    try {
      await operation();
    } catch (err) {
      if (
        mounted.current &&
        (err.status === 409 || err.code === "REVISION_CONFLICT")
      )
        setConflict(true);
      if (mounted.current)
        setError(
          err.status === 409 || err.code === "REVISION_CONFLICT"
            ? "This avatar changed elsewhere. Your edits are still here. Reload the saved version before trying again."
            : err.message ||
                "Unable to complete this action. Your changes are still here.",
        );
    } finally {
      if (mounted.current) setBusy("");
    }
  };
  const save = () =>
    perform("Saving draft…", async () => {
      const next = await persist();
      setMessage("Draft saved.");
      canonical(next);
    });
  const stepProblem = (index) => {
    if (!data.name.trim()) return "Add an avatar name.";
    if (!data.consent)
      return "Confirm that you have permission to use the source and voice.";
    if (!source && !doc.assets?.source)
      return "Add a photo or video for your avatar.";
    if (index >= 1) {
      if (!data.introduction.trim())
        return "Write the introduction your avatar should deliver.";
      if (data.speechMode === "upload" && !audio && !doc.assets?.audio)
        return "Upload or record the introduction audio.";
      if (audioMismatch) return `Your recording is in ${languageName(audioLanguage)}. Upload or record ${languageName(data.language)} audio, or use text-to-speech.`;
      if (data.speechMode === "tts" && !ttsSupported)
        return data.language === "hinglish"
          ? "Hinglish is experimental and currently supports uploaded audio only."
          : "Text-to-speech setup is required. You can upload or record audio instead.";
    }
    return "";
  };
  const next = () => {
    const problem = stepProblem(step);
    if (problem) {
      setError(problem);
      return;
    }
    perform("Saving step…", async () => {
      const saved = await persist();
      canonical(saved, Math.min(2, step + 1));
    });
  };
  const generate = () => {
    const problem = stepProblem(1);
    if (problem) {
      setError(problem);
      return;
    }
    if (!availableRenderer || !availableStorage) {
      setError(
        "Configure media storage and the video renderer to generate a real preview.",
      );
      return;
    }
    perform("Starting preview…", async () => {
      const saved = await persist();
      const nextDoc = applyDoc(
        await avatarApi.render(saved._id, saved.revision),
      );
      canonical(nextDoc, 2);
    });
  };
  const assist = (action) =>
    perform(
      action === "transcribe" ? "Transcribing audio…" : "Preparing suggestion…",
      async () => {
        const saved = await persist();
        const result =
          action === "transcribe"
            ? await avatarApi.transcribe(saved._id, saved.revision)
            : await avatarApi.assist(
                saved._id,
                saved.revision,
                action,
                data.language,
              );
        if (!result.text?.trim())
          throw new Error(
            "No suggestion was returned. Your introduction has not changed.",
          );
        setSuggestion({ text: result.text, action });
      },
    );
  const goBack = () => {
    if (busy || recording) return;
    if (step > 0) {
      setStep(step - 1);
      return;
    }
    if (
      !dirty ||
      window.confirm(
        "Leave this avatar? Unsaved uploads or recordings will be lost.",
      )
    )
      navigate(AVATAR_ROOT);
  };
  const sourceInput = (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-900 ${!availableStorage || locked ? "cursor-not-allowed opacity-60" : "hover:border-sky-400 hover:bg-sky-50/40"}`}
    >
      <ImagePlus size={25} className="text-sky-600" />
      <span className="text-sm font-medium">
        {displayedSource
          ? "Replace source photo or video"
          : "Upload a photo or video"}
      </span>
      <span className="text-xs text-slate-500">
        JPG, PNG, WebP, MP4 or WebM · Up to {maxUpload} MB
      </span>
      <input
        type="file"
        aria-label="Avatar photo or video"
        accept={sourceTypes.join(",")}
        disabled={locked || !availableStorage}
        className="sr-only"
        onChange={(event) => {
          acceptFile("source", event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <AvatarSteps
        step={step}
        onStep={(value) => {
          setStep(value);
          setError("");
        }}
        disabled={Boolean(busy || recording)}
      />
      {archived && (
        <Notice>
          This avatar is archived and read-only. Restore it from the avatar
          library to make changes.
        </Notice>
      )}
      {staleRecovery && (
        <Notice>
          A previous unsaved edit is available, but the saved avatar has
          changed.
          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className="underline"
              disabled={locked}
              onClick={() => {
                update(recovery.data);
                setRecovery(null);
              }}
            >
              Restore unsaved edit
            </button>
            <button
              type="button"
              className="underline"
              disabled={locked}
              onClick={() => {
                recoveredDrafts.delete(cacheKey);
                setRecovery(null);
              }}
            >
              Keep saved avatar
            </button>
          </div>
        </Notice>
      )}
      {(error || pollError) && <Notice error>{error || pollError}</Notice>}
      {conflict && (
        <button
          type="button"
          className={secondaryClass}
          disabled={Boolean(busy)}
          onClick={() => {
            if (
              window.confirm(
                "Reload the saved avatar? Your current changes will remain available for recovery, but pending uploads must be selected again.",
              )
            )
              onReload();
          }}
        >
          Reload saved avatar
        </button>
      )}
      {message && (
        <p role="status" className="text-xs text-emerald-700">
          {message}
        </p>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <div className="px-1">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sky-600">Step {step + 1} of 3</p>
            <h2 className="text-xl font-semibold tracking-tight">{["Give your avatar an identity", "Make the introduction sound right", "Review your avatar before finishing"][step]}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">{["Add the person, their role and the photo or video to animate.", "Choose a language and voice source, then prepare what your avatar will say.", "Check the details, generate the video and watch the introduction."][step]}</p>
          </div>
          {step === 0 && (
            <Panel title="Avatar identity">
              <fieldset disabled={locked} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Avatar name *">
                    <TextInput
                      maxLength={120}
                      value={data.name}
                      placeholder="e.g. Annu"
                      onChange={(event) => set("name", event.target.value)}
                    />
                  </Field>
                  <Field label="Role">
                    <TextInput
                      maxLength={120}
                      value={data.role}
                      placeholder="e.g. Technical interviewer"
                      onChange={(event) => set("role", event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <TextArea
                    maxLength={2000}
                    rows={2}
                    value={data.description}
                    placeholder="A short note to help your team identify this avatar."
                    onChange={(event) => set("description", event.target.value)}
                  />
                </Field>
                <div className="space-y-3 border-t border-slate-100 pt-5 dark:border-gray-800">
                  <div><h3 className="text-sm font-semibold">Appearance</h3><p className="mt-1 text-xs text-slate-500">One clear, front-facing person. The source determines the look and background.</p></div>
                  {sourceInput}
                </div>
                {source && (
                  <p className="text-xs text-sky-700">
                    {source.name} · Pending upload when you save
                  </p>
                )}
                {!source && doc.assets?.source?.name && (
                  <p className="text-xs text-slate-500">
                    Saved source: {doc.assets.source.name}
                  </p>
                )}
                {!availableStorage && (
                  <p className="text-xs text-amber-700">
                    {capabilities.storage?.reason ||
                      "Media storage is not configured. Avatar details can still be saved as a draft."}
                  </p>
                )}
                <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-600 dark:bg-gray-800 dark:text-gray-300">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={data.consent}
                    onChange={(event) => set("consent", event.target.checked)}
                  />
                  I have permission to use this person’s photo or video and
                  voice to create an AI avatar.
                </label>
              </fieldset>
            </Panel>
          )}
          {step === 1 && (
            <div className="space-y-4">
              <Panel title="Voice & introduction">
                <fieldset
                  disabled={Boolean(busy || rendering || archived)}
                  className="space-y-5"
                >
                  <div role="group" aria-label="Avatar speech source" className="grid gap-3 sm:grid-cols-2">
                    {[["upload", "Upload / record audio", "Use your own voice recording."], ["tts", "Text-to-speech", "Generate speech from your script."]].map(([value, label, hint]) => (
                      <button key={value} type="button" disabled={locked} aria-label={label} aria-pressed={data.speechMode === value} onClick={() => set("speechMode", value)} className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${data.speechMode === value ? "border-sky-500 bg-sky-50 text-sky-800 ring-1 ring-sky-500 dark:bg-sky-950 dark:text-sky-200" : "border-slate-200 text-slate-600 hover:border-sky-300 dark:border-gray-700 dark:text-gray-300"}`}>
                        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${data.speechMode === value ? "border-sky-600 bg-sky-600" : "border-slate-300"}`}>{data.speechMode === value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
                        <span><span className="block text-sm font-semibold">{label}</span><span className="mt-1 block text-xs leading-relaxed opacity-80">{hint}</span></span>
                      </button>
                    ))}
                  </div>
                  <Field label="Introduction language">
                    <Select
                      disabled={locked}
                      options={languages}
                      value={data.language}
                      onChange={(event) => {
                        const language = event.target.value;
                        const previous = languagePreview(doc, language);
                        if (previous?.introduction && previous.introduction !== data.introduction && window.confirm("Load the saved introduction for this language? This replaces the paragraph currently in the editor.")) update({ ...data, language, introduction: previous.introduction });
                        else set("language", language);
                      }}
                    />
                  </Field>
                  <p className="text-xs leading-relaxed text-slate-500">Each language has its own introduction video. Translate and review the script, or provide a recording in the selected language.</p>
                  {data.language === "hinglish" && (
                    <p className="text-xs text-amber-700">
                      Hinglish is experimental. Upload or record your own audio
                      for this language.
                    </p>
                  )}
                  <Field
                    label={
                      data.speechMode === "upload"
                        ? "Introduction transcript *"
                        : "Introduction script *"
                    }
                  >
                    <TextArea
                      disabled={locked}
                      rows={5}
                      className="min-h-36 leading-relaxed"
                      maxLength={2000}
                      value={data.introduction}
                      placeholder="Hello, I’m Annu. I’ll guide you through today’s practice interview…"
                      onChange={(event) =>
                        set("introduction", event.target.value)
                      }
                    />
                  </Field>
                  {data.speechMode === "upload" && (
                    <p className="text-xs leading-relaxed text-slate-500">
                      This text is a transcript/reference. The uploaded audio
                      determines the spoken words. Upload or record again to
                      change what the avatar says.
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">
                      Aim for a clear introduction under {maxDuration} seconds.
                    </span>
                    <span className="text-xs tabular-nums text-slate-400">
                      {data.introduction.length} / 2,000
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-gray-800">
                    <AnnuBrand compact />
                    <button
                      type="button"
                      className={secondaryClass}
                      disabled={
                        locked ||
                        !capabilities.gemini?.configured ||
                        !data.introduction.trim()
                      }
                      onClick={() => assist("improve")}
                    >
                      Improve wording
                    </button>
                    <button
                      type="button"
                      className={secondaryClass}
                      disabled={
                        locked ||
                        !capabilities.gemini?.configured ||
                        !data.introduction.trim()
                      }
                      onClick={() => assist("translate")}
                    >
                      Translate to {languageName(data.language).split(" · ")[0]}
                    </button>
                  </div>
                  {!capabilities.gemini?.configured && (
                    <p className="text-xs text-slate-500">
                      Writing assistance requires Gemini configuration. Your
                      script remains fully editable.
                    </p>
                  )}
                  {capabilities.gemini?.configured && (
                    <p className="text-xs text-slate-500">
                      Writing assistance sends this paragraph to Gemini. Review
                      the suggestion before applying it; avoid confidential text.
                    </p>
                  )}
                  {data.speechMode === "tts" ? (
                    <div className="space-y-3">
                      <Field label="Voice">
                        <Select
                          options={voices}
                          value={data.voice || "default"}
                          onChange={(event) => set("voice", event.target.value)}
                        />
                      </Field>
                      <p
                        className={`text-xs ${ttsSupported ? "text-slate-500" : "text-amber-700"}`}
                      >
                        {ttsSupported
                          ? "The configured voice reads your script when you generate a preview."
                          : data.language === "hinglish"
                            ? "Text-to-speech does not support Hinglish. Switch to uploaded audio."
                            : "Text-to-speech is not configured. Use uploaded audio or complete provider setup."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-gray-700">
                      <div><h3 className="text-sm font-semibold">Introduction recording</h3><p className="mt-1 text-xs text-slate-500">Record or upload the words you want this avatar to speak.</p></div>
                      {audioMismatch && <Notice>Your current recording is in {languageName(audioLanguage)}. Replace it with {languageName(data.language)} audio before generating this preview.</Notice>}
                      <div className="flex flex-wrap items-start gap-3">
                        <label
                          className={`${secondaryClass} cursor-pointer ${!availableStorage ? "opacity-50" : ""}`}
                        >
                          <Upload size={14} />
                          Upload audio
                          <input
                            type="file"
                            className="sr-only"
                            aria-label="Introduction audio file"
                            accept={audioTypes.join(",")}
                            disabled={locked || !availableStorage}
                            onChange={(event) => {
                              acceptFile("audio", event.target.files?.[0]);
                              event.target.value = "";
                            }}
                          />
                        </label>
                        <AudioRecorder
                          disabled={Boolean(
                            busy || rendering || archived || !availableStorage,
                          )}
                          maxSeconds={maxDuration}
                          onRecorded={(file) => acceptFile("audio", file)}
                          onRecordingChange={setRecording}
                        />
                      </div>
                      <p className="text-xs text-slate-500">
                        WAV, MP3, M4A, WebM or OGG · {maxDuration}s maximum ·{" "}
                        {maxUpload} MB maximum
                      </p>
                      {(audio?.url || doc.assets?.audio?.url) && (
                        <div className="space-y-2">
                          <audio
                            controls
                            preload="metadata"
                            src={audio?.url || doc.assets.audio.url}
                            className="h-10 w-full"
                            aria-label="Introduction audio preview"
                          />
                          <p className="text-xs text-slate-500">
                            {audio
                              ? `${audio.name} · Pending upload`
                              : doc.assets.audio.name}
                          </p>
                        </div>
                      )}
                      <button
                        type="button"
                        className={secondaryClass}
                        disabled={
                          locked || audioMismatch ||
                          !capabilities.stt?.configured ||
                          (!audio && !doc.assets?.audio)
                        }
                        onClick={() => assist("transcribe")}
                      >
                        Transcribe audio to script
                      </button>
                      {!capabilities.stt?.configured && (
                        <p className="text-xs text-slate-500">
                          Transcription requires speech-to-text setup.
                        </p>
                      )}
                    </div>
                  )}
                </fieldset>
              </Panel>
            </div>
          )}
          {step === 2 && (
            <Panel title="Review & generate">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">
                      {data.name || "Untitled avatar"}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {data.role || "Interviewer"} ·{" "}
                      {languageName(data.language)}
                    </p>
                  </div>
                  <AvatarStatus doc={doc} dirty={dirty} />
                </div>
                <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-xs dark:bg-gray-800">
                  <div>
                    <dt className="text-slate-500">Source</dt>
                    <dd className="mt-1 truncate font-medium">
                      {displayedSource?.name || "Not added"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Voice</dt>
                    <dd className="mt-1 font-medium">
                      {data.speechMode === "tts"
                        ? "Text-to-speech"
                        : "Uploaded / recorded audio"}
                    </dd>
                  </div>
                </dl>
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-slate-500">
                    INTRODUCTION
                  </h3>
                  <p className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-3 text-sm leading-relaxed dark:border-gray-700">
                    {data.introduction || "No introduction added."}
                  </p>
                </div>
                {rendering && (
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                  >
                    <LoaderCircle size={18} className="animate-spin" />
                    <span>
                      {doc.render.status === "queued"
                        ? "Preview queued"
                        : "Generating preview"}
                      <span className="mt-0.5 block text-xs">
                        {renderStageLabel(doc.render.stage)}. You
                        can return to the library while this runs.
                      </span>
                    </span>
                  </div>
                )}
                {doc.render?.status === "failed" && (
                  <Notice error>
                    {doc.render.error ||
                      "The preview could not be generated. Check your source and audio, then try again."}
                  </Notice>
                )}
                {!availableRenderer && (
                  <Notice>
                    {capabilities.renderer?.configured
                      ? "The video renderer is currently unavailable. Your draft is safe; try again when the renderer is online."
                      : "Video renderer setup is required. You can save the complete avatar draft now and generate later."}
                  </Notice>
                )}
                {!availableStorage && (
                  <Notice>
                    Media storage setup is required before generating an avatar.
                  </Notice>
                )}
                {ready && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-emerald-700"
                  >
                    <CheckCircle2 size={17} />
                    Your latest preview is ready.
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  This creates a short introduction video only. It does not
                  launch an interview or enable live conversation.
                </p>
              </div>
            </Panel>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Avatar preview</h2>
              <AvatarStatus doc={doc} dirty={dirty} />
            </div>
            {ready ? (
              <div className="relative">
                <SourceVisual
                  source={displayedSource}
                  className="aspect-[4/3] rounded-xl"
                />
                <button
                  type="button"
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-950/10"
                  aria-label="Play avatar preview"
                  onClick={() => setPreview(true)}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-600 text-white shadow-lg">
                    <Play size={20} fill="currentColor" />
                  </span>
                </button>
              </div>
            ) : (
              <PreviewPlaceholder source={displayedSource} busy={rendering} />
            )}
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {data.name || "Your avatar"}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {data.role || "Interviewer"}
                </p>
              </div>
              <span className="text-xs text-slate-500">
                {languageName(data.language)}
              </span>
            </div>
            {!ready && doc.assets?.preview?.url && (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-gray-800">
                <p className="mb-2 text-xs text-amber-700">
                  Previous version — regenerate after your changes.
                </p>
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => setPreview(true)}
                >
                  <Play size={13} />
                  View previous preview
                </button>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <h3 className="mb-3 text-xs font-semibold">Creation checklist</h3>
            <ul className="space-y-3">
              {[[Boolean(data.name.trim() && data.consent && displayedSource), "Identity & source", 0], [Boolean(data.introduction.trim() && (data.speechMode === "tts" ? ttsSupported : (audio || doc.assets?.audio) && !audioMismatch)), "Voice & introduction", 1], [ready, "Generated preview", 2]].map(([complete, label, index]) => <li key={label} className="flex items-center gap-2 text-xs"><CheckCircle2 size={15} className={complete ? "text-emerald-600" : "text-slate-300"} /><button type="button" disabled={index > step || Boolean(busy || recording)} onClick={() => setStep(index)} className="text-left text-slate-600 enabled:hover:text-sky-700 dark:text-gray-300">{label}</button><span className="ml-auto text-[10px] text-slate-400">{complete ? "Done" : "Pending"}</span></li>)}
            </ul>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">A generated introduction, not a live interview. Facial animation depends on the source and renderer; body gestures are not configured here.</p>
        </aside>
      </div>
      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          className={secondaryClass}
          disabled={Boolean(busy || recording)}
          onClick={goBack}
        >
          <ArrowLeft size={14} />
          {step ? "Back" : "Avatar library"}
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span role="status" className="mr-1 text-xs text-slate-500">
            {busy ||
              (recording
                ? "Recording…"
                : dirty
                  ? "Unsaved changes"
                  : doc._id
                    ? "Draft saved"
                    : "New draft")}
          </span>
          <button
            type="button"
            className={secondaryClass}
            disabled={locked || staleRecovery}
            onClick={save}
          >
            <Save size={14} />
            Save draft
          </button>
          {step < 2 ? (
            <button
              type="button"
              className={primaryClass}
              disabled={locked || staleRecovery}
              onClick={next}
            >
              Next
              <ArrowRight size={14} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className={ready ? secondaryClass : primaryClass}
                disabled={
                  ready ||
                  locked ||
                  staleRecovery ||
                  !availableRenderer ||
                  !availableStorage
                }
                onClick={generate}
              >
                <Film size={14} />
                {ready
                  ? "Preview up to date"
                  : doc.assets?.preview
                    ? "Regenerate preview"
                    : "Generate preview"}
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={!ready || Boolean(busy || recording)}
                onClick={() => {
                  guard.current = false;
                  navigate(AVATAR_ROOT);
                }}
              >
                <CheckCircle2 size={14} />
                Finish
              </button>
            </>
          )}
        </div>
      </footer>
      {preview && (
        <PreviewDialog
          doc={doc}
          draftChanged={dirty}
          onClose={() => setPreview(false)}
        />
      )}
      {suggestion && (
        <Dialog
          title={
            suggestion.action === "transcribe"
              ? "Review transcription"
              : "Review script suggestion"
          }
          onClose={() => setSuggestion(null)}
        >
          <div className="space-y-4">
            <p className="text-xs text-slate-500">
              Review and edit this suggestion. Your introduction changes only
              when you apply it.
            </p>
            <Field label="Suggested introduction">
              <TextArea
                maxLength={2000}
                rows={6}
                className="min-h-36"
                value={suggestion.text}
                onChange={(event) =>
                  setSuggestion({ ...suggestion, text: event.target.value })
                }
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={secondaryClass}
                onClick={() => setSuggestion(null)}
              >
                Discard
              </button>
              <button
                type="button"
                className={primaryClass}
                disabled={
                  !suggestion.text.trim() || suggestion.text.length > 2000
                }
                onClick={() => {
                  set("introduction", suggestion.text);
                  setSuggestion(null);
                }}
              >
                Apply to introduction
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default function AvatarEditor({ capabilities }) {
  const { id } = useParams();
  const remote = useRemote(
    () =>
      id
        ? avatarApi.get(id)
        : Promise.resolve({
            revision: 0,
            active: true,
            data: initialData(),
            assets: {},
            render: { status: "idle" },
            previewStale: false,
          }),
    [id],
  );
  if (remote.loading)
    return (
      <p role="status" className="py-12 text-center text-sm text-slate-500">
        Loading avatar…
      </p>
    );
  if (remote.error)
    return (
      <Notice error>
        {remote.error}{" "}
        <button
          type="button"
          className="ml-2 underline"
          onClick={remote.reload}
        >
          Retry
        </button>
      </Notice>
    );
  return (
    <EditorSession
      key={id || "new"}
      initial={remote.result}
      capabilities={capabilities}
      onReload={remote.reload}
    />
  );
}
