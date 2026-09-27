# Admin Avatar Studio

## Scope and user journey

Avatar Studio is an **admin-only authoring feature**, not a live interview engine. It creates real-person talking-face introduction clips from consented source media. It does not provide automatic full-body gestures, live conversation, scoring, or candidate sessions.

The workspace is `/admin/ai-interviews/avatars`. The global AI Interviews menu and the workspace navigation have one Avatars destination; creation is an action inside that workspace. Existing `/profiles` resources and interview snapshots remain compatible and separate from generated media.

The compact creation journey is:

1. **Avatar details:** name, interviewer role, description, photo/video source and consent.
2. **Voice & introduction:** supported language, editable introduction, recorded/uploaded speech or configured local TTS. Transcription and Gemini text assistance return suggestions for administrator approval.
3. **Preview:** generate, inspect status, play the actual output, and finish only with a current successful preview.

### Library and multilingual previews

Cards expose a clickable portrait/name, role, description, generation status and generated-language badges. Clicking opens a wide introduction viewer with video, language selector and the exact paragraph saved with that clip. Editing and archiving remain separate actions. The creation workspace groups identity, appearance, permission, speech source and introduction under a three-step progress line, with a persistent preview, checklist and save/navigation footer.

Each successful render stores an immutable media object and its source key, language, introduction, speech mode and fingerprint in `languagePreviews.<language>`. The existing `assets.preview` remains the most recently generated clip for compatibility. Switching languages in the viewer replays an existing signed clip without calling the models or modifying the avatar. A missing language shows an explicit empty state with a link to the language-prefilled introduction editor; it never plays a different language under a new label. Generate that version after preparing its script/audio. Changing source media marks all saved language versions as previous versions.

Uploaded recordings are tagged with the language selected at upload. A recording-language mismatch blocks generation until the admin replaces the audio or chooses TTS. This tag is an admin declaration, not automatic language detection. Gemini translation changes text only, requires explicit approval, and never translates an existing audio file. TTS language quality still requires manual acceptance testing. Source/video rendering limitations below remain unchanged.

Video source is used to extract its first portrait frame for SadTalker. The initial CPU preset renders a cropped talking face at 256-pixel model resolution, not a photorealistic upper-body interviewer at reference-image quality. It is **not** full-video dubbing and does not preserve or synthesize hand gestures. The first acceptance test should use a clear frontal photo and five seconds of recorded speech.

## Runtime boundary

```text
Local React admin UI
        |
Authenticated PeerPrep API ---- MongoDB avatar metadata and revision
        |                                  |
        | authenticated HTTP jobs          | render status / input revision
        v                                  |
Separate CPU renderer <---------------------+
  source validation -> audio -> SadTalker -> MP4
        |
Private R2 storage -> short-lived signed preview -> browser video player
```

The renderer runs separately from the application. It must never run a heavy model in an Express request process. Node keeps durable avatar/render references; the renderer owns the serialized rendering queue and per-job status. There is no need to deploy an additional GPU or add a new Redis instance for this CPU prototype. Browser polling reconciles renderer status and stores completed output; reopening the editor resumes polling. A renderer being offline does not make a saved preview unavailable.

Generated clips are reusable. Replaying a saved preview does not call TTS, Gemini or SadTalker. Editing generation inputs marks the preview stale; an older in-flight result must not replace a newer draft. In uploaded-audio mode, the introduction paragraph is a transcript/reference: editing that text alone does not change the actual speech or invalidate an otherwise current clip. In TTS mode it is the spoken script, so changing it requires generation again. No button pretends that unavailable models or credentials have generated a video.

## Required configuration

New headings and empty credential placeholders are in `backend/.env.example` and the local ignored `backend/.env`. Existing application database and authentication settings remain unchanged.

| Setting | Purpose |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account identifier; used to derive the S3 endpoint |
| `R2_ENDPOINT` | Optional explicit S3 endpoint override |
| `R2_BUCKET_NAME` | Private avatar media bucket |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Bucket-scoped object credentials, never frontend values |
| `AVATAR_RENDER_SERVICE_URL` | Renderer address; default local port 8010 |
| `AVATAR_RENDER_SERVICE_TOKEN` | Strong shared secret matching the renderer configuration |
| `AVATAR_MAX_UPLOAD_MB` | Bounded media upload size; pilot default 25 MB |
| `AVATAR_MAX_INTRO_SECONDS` | Maximum generated introduction length; pilot default 60 seconds |
| `AVATAR_TTS_ENABLED` | Enable only after installing and testing the local TTS environment |
| `AVATAR_STT_ENABLED` | Enable only after installing and testing the local transcription environment |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Optional introduction writing/translation assistant |

See [the renderer setup](../services/avatar-renderer/README.md) for its separate Python environments, `SADTALKER_ROOT`, checkpoint requirements, FFmpeg, private asset host allowlist and optional speech engines. Installing Python alone is not enough: model checkpoints and compatible dependencies must be present. The backend API and renderer must use the same introduction-duration ceiling.

No MuseTalk, SadTalker, or local TTS/STT API subscription key is required. A Hugging Face token, when a checkpoint requires one, belongs in the renderer environment. Hosted Hugging Face inference is **not** treated as an unlimited free API.

Before enabling the feature against a deployment database, create its additive indexes from `backend` with `node --env-file=.env src/migrations/create-avatar-indexes.js`. Review the intended database configuration first. The partial unique render-owner index enforces one active rendering job per administrator across application instances. This migration was not run against the application database during development.

R2 remains private. Uploads pass through the authenticated application; the browser receives temporary read URLs rather than bucket credentials. The renderer may download media only from its configured asset hosts. Do not expose the local rendering service to the public Internet without HTTPS, authentication and network access controls.

## Optional speech and text assistance

- Uploaded/recorded audio is the lowest-cost starting path. Its actual spoken content, not the text box, determines the resulting speech. Update or regenerate audio when changing the introduction.
- TTS creates speech from the saved introduction using a configured local model; it is optional and may be slow on CPU.
- STT transcribes uploaded audio into a suggested paragraph. It is not required to animate a photo, and it does not implement live candidate transcription.
- Gemini improves or translates text only when requested. It does not render faces or automatically overwrite the administrator's wording. Free-tier quotas and applicable data-use terms must be checked before sending confidential text.
- Hindi and English are the initial language targets. Hinglish must be labelled experimental; selecting a language does not guarantee pronunciation quality or translate the existing paragraph automatically.

## Validation and operations

- Every API and media action is administrator- and owner-scoped.
- Metadata and media replacement use revision checks; conflicts preserve the user's draft rather than silently overwriting it.
- Source/voice consent is required before generation.
- Upload signatures, sizes and supported types are checked. The renderer validates decodability and media duration before inference.
- Rendering is bounded, idempotent by job identity, and serialized for the CPU pilot. Timeouts and safe error messages prevent endless spinners.
- Source, generated audio and output media are private. Keep model checkpoints on local disk, not inside the application's repository or its R2 free-tier media allowance.
- Archives are reversible and do not delete source files. A full media retention/deletion workflow is a separate operational concern; monitor bucket usage during testing.

## Acceptance checklist

Automated verification for this implementation: 15 backend tests, 11 Avatar Studio UI tests, 29 existing sidebar/interview regression tests and 20 Python worker tests passed. Provider/model operations are mocked in these tests; API tests use an ephemeral database. Targeted frontend ESLint passed. An interactive browser was unavailable in the coding environment, so responsive visual QA and real video playback still need a browser smoke test.

Re-run the focused checks:

```text
# From backend (do not load the application .env for tests)
node --test --test-concurrency=1 test/avatarApi.test.js test/avatarDefinition.test.js

# From frontend
node --test test/avatarStudio.test.js test/aiInterviewWorkspace.test.js test/globalSidebar.test.js
npm run build

# From services/avatar-renderer
python -m unittest discover -s tests -v
```

Run automated tests without loading the real backend `.env` or application database. For a real smoke test, use a dedicated test account/bucket and consented sample media:

1. Create, refresh, edit and archive/unarchive an avatar.
2. Verify another admin cannot access its metadata or media.
3. Upload a portrait and a short recorded introduction; generate a real CPU-rendered MP4.
4. Reopen and play the saved preview with the renderer stopped.
5. Change source, audio, language or the TTS introduction; verify the previous preview is not represented as current. Editing only the reference transcript in uploaded-audio mode must not claim to change the spoken words.
6. Disconnect the renderer during generation and verify safe retry/recovery.
7. Test optional TTS/STT/Gemini independently, including provider errors and unsupported languages.
8. Check desktop/mobile layout, keyboard navigation, recording permission denial and one-at-a-time playback.

A completed UI or passing mocked tests does not establish real rendering quality or laptop performance. Actual output, duration, peak RAM and visual lip-sync must be measured after model installation.

## Upstream references

- [SadTalker](https://github.com/OpenTalker/SadTalker) and its explicit CPU inference mode.
- [Chatterbox](https://github.com/resemble-ai/chatterbox) for optional multilingual TTS.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) for optional transcription.
- [R2 credentials](https://developers.cloudflare.com/r2/api/tokens/) and [pricing limits](https://developers.cloudflare.com/r2/pricing/).

Upstream code, model weights and their dependencies can carry different licence conditions. Use a consenting source person and review all asset/model terms before a commercial rollout.
