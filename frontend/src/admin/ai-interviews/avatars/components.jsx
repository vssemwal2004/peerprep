import { useEffect, useState } from "react";
import { Check, Play, Video, Languages, Pencil } from "lucide-react";
import { Link } from "react-router-dom";
import { Dialog, Select, secondaryClass, primaryClass } from "../ui";
import { avatarApi, AVATAR_ROOT } from "./api";
import { useRemote } from "../useRemote";

import { renderActive, languageName, languagePreview } from "./definition";

export function SourceVisual({ source, className = "" }) {
  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-slate-100 dark:bg-gray-800 ${className}`}
    >
      {source?.url ? (
        source.kind === "video" || source.mime?.startsWith("video/") ? (
          <video
            src={source.url}
            preload="metadata"
            muted
            playsInline
            className="h-full w-full object-contain"
            aria-label="Avatar source video"
          />
        ) : (
          <img
            src={source.url}
            alt="Avatar source"
            className="h-full w-full object-contain"
          />
        )
      ) : (
        <div className="flex flex-col items-center gap-3 px-5 py-7 text-slate-400">
          <svg width="112" height="90" viewBox="0 0 112 90" fill="none" aria-hidden="true">
            <rect x="15" y="8" width="82" height="68" rx="12" fill="#e0f2fe" />
            <rect x="22" y="15" width="68" height="54" rx="8" fill="#f0f9ff" stroke="#7dd3fc" />
            <circle cx="56" cy="34" r="10" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
            <path d="M37 61c1-12 8-17 19-17s18 5 19 17" fill="#bae6fd" stroke="#0284c7" strokeWidth="1.5" />
            <circle cx="89" cy="70" r="13" fill="#0284c7" /><path d="m86 64 8 6-8 6V64Z" fill="white" />
            <path d="M7 29h8M11 25v8M94 6h7M97.5 2.5v7" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span className="text-xs">Photo or video preview</span>
        </div>
      )}
    </div>
  );
}

export function AvatarStatus({ doc, dirty = false }) {
  const status = renderActive(doc)
    ? doc.render.status
    : doc.render?.status === "failed"
      ? "Failed"
      : (dirty || doc.previewStale) && doc.assets?.preview
        ? "Needs preview"
        : doc.render?.status === "ready"
          ? "Ready"
          : "Draft";
  const tone =
    status === "Ready"
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      : status === "Failed"
        ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
        : "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-1 text-[11px] font-medium capitalize ${tone}`}
    >
      {doc.active === false ? "Archived" : status}
    </span>
  );
}

export function PreviewDialog({ doc, onClose, allowEdit = false, draftChanged = false }) {
  const remote = useRemote(() => avatarApi.get(doc._id), [doc._id]);
  const [mediaError, setMediaError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [live, setLive] = useState(null);
  const [pollError, setPollError] = useState("");
  const [language, setLanguage] = useState(doc.data.language);
  const fresh = remote.result;
  const current = live && live.revision >= (fresh?.revision || 0) ? live : fresh || doc;
  const activeJob = renderActive(current);
  useEffect(() => {
    if (!activeJob) return;
    let alive = true, timer;
    const poll = async () => {
      try {
        const next = await avatarApi.status(doc._id);
        if (!alive) return;
        setLive(next);
        setPollError("");
        if (renderActive(next)) timer = setTimeout(poll, 2500);
      } catch {
        if (alive) { setPollError("Could not refresh generation status. Retrying shortly."); timer = setTimeout(poll, 5000); }
      }
    };
    timer = setTimeout(poll, 2000);
    return () => { alive = false; clearTimeout(timer); };
  }, [activeJob, doc._id]);
  const clip = languagePreview(current, language);
  const previous = Boolean(clip && (clip.stale || draftChanged));
  return (
    <Dialog
      wide
      title={previous ? "Previous avatar preview" : `${current.data.name} · Preview`}
      onClose={onClose}
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(240px,1fr)]">
      <div className="min-w-0">
      {activeJob && <p role="status" className="mb-3 rounded-lg bg-sky-50 p-3 text-xs text-sky-700">Generating the {languageName(current.data.language)} introduction. This panel updates when the video is ready.</p>}
      {pollError && <p role="status" className="mb-3 text-xs text-amber-700">{pollError}</p>}
      {current.render?.status === "failed" && language === current.data.language && <p role="alert" className="mb-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{current.render.error || "This introduction could not be generated. Edit the avatar to review its inputs and try again."}</p>}
      {previous && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Previous version. Generate a new preview to reflect the latest saved
          settings.
        </p>
      )}
      {(remote.error || mediaError) && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          {remote.error ||
            "The preview could not load. Its media link may have expired or the connection was interrupted."}{" "}
          <button
            type="button"
            className="ml-1 font-medium underline"
            onClick={() => {
              setMediaError(false);
              setLive(null);
              setRetryCount((value) => value + 1);
              remote.reload();
            }}
          >
            Refresh preview
          </button>
        </p>
      )}
      {remote.loading ? (
        <p role="status" className="py-8 text-center text-sm text-slate-500">
          Loading the latest preview…
        </p>
      ) : !remote.error && clip?.url ? (
        <video
          key={`${language}:${clip.url}:${retryCount}`}
          controls
          playsInline
          preload="metadata"
          src={clip.url}
          poster={
            current.assets?.source?.kind === "image"
              ? current.assets.source.url
              : undefined
          }
          className="aspect-video max-h-[60vh] w-full rounded-xl bg-slate-950 object-contain"
          aria-label="Generated avatar video"
          onError={() => setMediaError(true)}
        />
      ) : (
        !remote.error && (
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-gray-700">
            <SourceVisual source={current.assets?.source} className="aspect-video w-full" />
            <div className="space-y-2 p-4 text-sm">
              <p className="font-medium">No {languageName(language)} preview yet</p>
              <p className="text-xs leading-relaxed text-slate-500">Prepare the introduction in this language, then generate its video. Existing language previews are kept.</p>
            </div>
          </div>
        )
      )}
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Video size={14} />AI-generated introduction · Talking-face preview</p>
      </div>
      <aside className="min-w-0 space-y-5">
        <div>
          <div className="flex items-start justify-between gap-3"><h3 className="break-words text-lg font-semibold">{current.data.name}</h3><AvatarStatus doc={current} /></div>
          <p className="mt-1 text-sm text-slate-500">{current.data.role || "Interviewer"}</p>
          {current.data.description && <p className="mt-3 break-words text-xs leading-relaxed text-slate-500">{current.data.description}</p>}
        </div>
        <label className="block space-y-2">
          <span className="flex items-center gap-2 text-xs font-semibold"><Languages size={14} />Preview language</span>
          <Select aria-label="Preview language" value={language} options={[{value:"en",label:"English"},{value:"hi",label:"Hindi"},{value:"hinglish",label:"Hinglish (experimental)"}]} onChange={(event) => { setLanguage(event.target.value); setMediaError(false); }} />
        </label>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <h4 className="mb-2 text-xs font-semibold">{clip ? "Introduction in this video" : "Introduction"}</h4>
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-600 dark:text-gray-300">{clip?.introduction || (!clip && language === current.data.language ? current.data.introduction : "") || "No introduction saved for this language yet."}</p>
        </div>
        {allowEdit && current.active !== false && <Link className={!clip || previous ? primaryClass : secondaryClass} to={`${AVATAR_ROOT}/${doc._id}/edit`} state={{avatarStep: !clip || previous ? 1 : 0, avatarLanguage: language}} onClick={onClose}><Pencil size={14} />{!clip ? `Create ${languageName(language).split(" · ")[0]} preview` : previous ? "Update introduction" : "Edit avatar"}</Link>}
      </aside>
      </div>
    </Dialog>
  );
}

export function AvatarSteps({ step, onStep, disabled }) {
  return (
    <nav
      aria-label="Avatar creation progress"
      className="rounded-xl border border-slate-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6"
    >
      <ol className="flex items-start">
        {["Identity", "Voice & introduction", "Preview"].map((label, index) => (
          <li
            key={label}
            className={`relative flex min-w-0 flex-1 justify-center ${index !== 2 ? "after:absolute after:left-[calc(50%+18px)] after:right-[calc(-50%+18px)] after:top-4 after:h-0.5" : ""} ${index < step ? "after:bg-sky-500" : "after:bg-slate-200 dark:after:bg-gray-700"}`}
          >
            <button
              type="button"
              aria-current={step === index ? "step" : undefined}
              disabled={disabled || index > step}
              onClick={() => onStep(index)}
              className="relative z-10 flex min-w-0 flex-col items-center gap-2 disabled:cursor-default"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-semibold ${index <= step ? "border-sky-500 bg-sky-600 text-white" : "border-slate-200 bg-white text-slate-400 dark:border-gray-700 dark:bg-gray-900"}`}
              >
                {index < step ? <Check size={14} /> : index + 1}
              </span>
              <span
                className={`text-center text-[11px] font-medium sm:text-xs ${index === step ? "text-sky-700 dark:text-sky-300" : "text-slate-500"}`}
              >
                {label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PreviewPlaceholder({ source, busy = false }) {
  return (
    <div className="relative">
      <SourceVisual
        source={source}
        className="aspect-[4/3] w-full rounded-xl"
      />
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-600 shadow-sm dark:bg-gray-900/95 dark:text-gray-300">
        {busy ? (
          <Video size={15} className="text-sky-600" />
        ) : (
          <Play size={15} className="text-sky-600" />
        )}
        {busy
          ? "Creating your preview…"
          : "Generate a preview to see this avatar speak."}
      </div>
    </div>
  );
}
