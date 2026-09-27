# Private CPU avatar renderer

This service renders a **short, prerecorded talking-head introduction**, not a live AI interviewer. The recorded-audio path uses a local official SadTalker checkout on CPU. The fixed `--preprocess crop` mode produces **head/face framing**, not the reference screenshot's full upper-body presenter. A video source contributes its **first frame only**; it is not motion/identity training. Use an image of a consenting person and speech you are authorized to use. Outputs must be presented as AI-generated in the admin UI.

**Models, Python model dependencies and FFmpeg are not included or downloaded by this service.** The HTTP orchestration and tests use Python's standard library. No real render has been verified merely by installing this repository. Start with a 5-second, front-facing portrait test; do not assume this fits a particular laptop's RAM or completes in real time.

## Installation boundary

Use Python 3.10+ for `renderer.py`. Use an independently provisioned Python environment compatible with your **pinned** [official SadTalker checkout](https://github.com/OpenTalker/SadTalker), and follow that revision's dependency instructions. Do not install model packages into the HTTP interpreter. The upstream [inference entry point](https://github.com/OpenTalker/SadTalker/blob/main/inference.py) supplies the CPU, image-size, batch and result-directory arguments used here.

1. Provision a separate directory outside the app for official SadTalker. Fetch a reviewed, immutable commit, not an unattended floating branch. Example setup pattern (replace the placeholder with the reviewed 40-character commit):

   ```text
   git clone --no-checkout https://github.com/OpenTalker/SadTalker.git SadTalker
   git -C SadTalker checkout --detach <REVIEWED_40_CHARACTER_COMMIT>
   ```

2. Create the model's dedicated Python environment. Install the selected checkout's pinned requirements and a compatible **CPU** PyTorch build using upstream instructions. This is an explicit operator setup step; no installer is invoked by this service.
3. Explicitly obtain the official model files required by that checkout, including `checkpoints/SadTalker_V0.0.2_256.safetensors`, `checkpoints/mapping_00229-model.pth.tar`, `gfpgan/weights/alignment_WFLW_4HG.pth` and `gfpgan/weights/detection_Resnet50_Final.pth`, plus any other preprocessing assets required by that revision. Preserve upstream model licence terms. The service checks these four files for readiness; it cannot certify imported dependencies or checkpoint integrity without an actual render.
4. Install FFmpeg **and FFprobe**. Set absolute executable paths if they are not on PATH. The FFmpeg directory is added to the model subprocess PATH.
5. Record immutable source commits, package lock/export, model origin and SHA-256 hashes in your deployment inventory. `deployment-manifest.example.json` documents the required inventory fields; it is an operator record, not an automatic download/verification tool. Never run untrusted Python checkpoints.

The reviewed upstream inference path passes a CPU device through preprocessing, audio-to-pose inference and animation. Its [head-pose conversion](https://github.com/OpenTalker/SadTalker/blob/main/src/facerender/modules/make_animation.py) uses the tensor's device; CUDA calls in the separate training `Audio2Pose.forward` path do not establish a CUDA requirement for `Audio2Pose.test`. This source audit is **not a verified pinned installation**: no deployment revision or installed dependency set is assumed. Verify your pinned checkout and CPU PyTorch combination with the smoke test below.

`model_launcher.py` runs model scripts with Python network connections disabled, in addition to offline hub environment settings. This prevents facexlib or other Python helpers downloading missing assets during a request: missing local assets fail instead. It is not an OS sandbox and cannot constrain arbitrary native extensions; deployment-level model-process egress restrictions remain necessary.

## Configuration and startup

The service reads only its own adjacent `.env`; shell environment takes precedence. It does not read `backend/.env`, interpolate shell expressions, or print secret values. A local `.env` with **blank credentials and default limits** is provided and gitignored.

Set:

| Variable | Meaning |
| --- | --- |
| `AVATAR_RENDER_SERVICE_TOKEN` | A long random shared secret, at least 32 non-space characters. Match the Node backend. |
| `AVATAR_ASSET_HOSTS` | Exact comma-separated R2 API endpoint hosts, e.g. `YOUR_ACCOUNT.r2.cloudflarestorage.com`. No scheme, path, wildcard, CDN or localhost. |
| `SADTALKER_ROOT` | Absolute reviewed SadTalker checkout directory. |
| `SADTALKER_PYTHON` | Absolute executable for its separately installed model environment. |
| `FFMPEG_PATH`, `FFPROBE_PATH` | Executables; defaults `ffmpeg`, `ffprobe`. |
| `AVATAR_WORK_DIR` | Private dedicated work directory; relative paths resolve from the process working directory. |
| `AVATAR_RENDER_PORT` | Default `8010`. The listener is **always 127.0.0.1**. |
| `AVATAR_MAX_INTRO_SECONDS` | 1–60 seconds; default 60. Applies to source video and driving/recorded speech. |
| `AVATAR_RENDER_TIMEOUT_SECONDS` | Per heavy model subprocess timeout; default 1800, maximum 7200 seconds. |
| `AVATAR_MAX_WAITING_JOBS` | Queue capacity, default 4; exactly one compute task runs at a time. |
| `AVATAR_MAX_RETAINED_JOBS` | Default 200. New jobs are rejected when full; old jobs are not silently removed. |
| `HF_HOME` | Optional existing private model cache. Downloads remain disabled in subprocesses. |

From `services/avatar-renderer`, run:

```text
python renderer.py
```

Use one worker process per work directory. On Windows, run the model workload in a compatible environment (WSL/Linux is often easier for upstream dependencies); configure the Node backend to reach the loopback worker through your deployment's private networking. This service is not a public-facing web server. Do not expose it directly or use the bearer secret in a browser. Deploy under an unprivileged account with disk/memory quotas and egress restricted to the configured storage endpoint; isolate the native media/model toolchain from application secrets and unrelated files.

## Optional real TTS and transcription

Both use `speech_helper.py` in **separate configured Python subprocesses**, not heavy imports in the HTTP server.

- TTS: install a reviewed version of [official Chatterbox](https://github.com/resemble-ai/chatterbox) in the environment named by `AVATAR_TTS_PYTHON`. Explicitly provision a pinned multilingual V2 model directory as `AVATAR_TTS_MODEL_DIR`, containing `ve.pt`, `s3gen.pt`, `t3_mtl23ls_v2.safetensors`, `grapheme_mtl_merged_expanded_v1.json` and `conds.pt`, plus other assets required by that pinned release. The helper calls `ChatterboxMultilingualTTS.from_local(..., device="cpu")`, never `from_pretrained`. Only `voice: "default"` is supported. English (`en`) and Hindi (`hi`) use their explicit language IDs. **Hinglish TTS is not advertised or accepted**; upload recorded audio instead. Preserve upstream watermarking.
- STT: install a reviewed version of [faster-whisper](https://github.com/SYSTRAN/faster-whisper) in `AVATAR_STT_PYTHON`. Set `AVATAR_STT_MODEL_DIR` to a pre-provisioned local CTranslate2 Whisper model directory (`model.bin`, config and tokenizer assets). CPU int8 and `local_files_only=True` are used. English and Hindi are explicit languages; Hinglish uses automatic language detection, which is not a guarantee of accurate code-switch transcription. Administrators must review the returned text.
- The backend's `AVATAR_TTS_ENABLED` / `AVATAR_STT_ENABLED` flags are independent UI/API switches; they do not install or enable missing worker prerequisites.
- Synthesis, speech recognition and portrait animation run serially to limit CPU/RAM overlap. `/transcribe` returns 429 while rendering; it is synchronous with a 50-second model timeout. Download/FFmpeg time is additional, so configure backend request timeouts appropriately and use short recordings.

## HTTP contract

Every endpoint, including `/health`, requires `Authorization: Bearer <token>`. JSON bodies are limited to 24,000 bytes. Errors are `{ "code": "...", "error": "safe message" }`; no paths, tracebacks, signed URLs or tokens are returned.

- `GET /health`: `{status:"ok", capabilities:{render,tts,stt,ttsLanguages,sttLanguages}, readiness:{status:"configured"|"setup_required",checks:{...},verifiedInference:false},maxIntroSeconds}`. `configured` means files/tools are present, **not** successful model inference. Unreachable service is distinct from reachable `setup_required`.
- `POST /jobs`: `{jobId,sourceUrl,sourceKind:"image"|"video",audioUrl?,text,language:"en"|"hi"|"hinglish",voice:"default",mode:"upload"|"tts",maxIntroSeconds?}`. The optional integer limit is 1–60 and can only lower the configured worker duration limit. Returns 202 with status for new jobs, 200 for an identical retry, 409 for changed inputs under the same job ID. Identifiers match `[A-Za-z0-9][A-Za-z0-9_-]{0,79}`. Refreshing only presigned URL query parameters does not change the input manifest hash.
- `GET /jobs/:jobId`: `{jobId,status:"queued"|"processing"|"ready"|"failed",stage,error,updatedAt}`. Stages include downloading, synthesizing, rendering, ready, and safe failure codes.
- `GET /jobs/:jobId/result`: complete `video/mp4` only after `ready`; maximum 100 MiB. No public result URL is created here. The Node backend uploads/persists the result in its private storage.
- `POST /transcribe`: `{audioUrl,language,maxIntroSeconds?}` → `{text}`; no job is created. The same optional lower duration limit applies.

Jobs keep durable `manifest.json` (hash only), `status.json`, media working files and `result.mp4` below the dedicated work directory. Queued/processing jobs become `failed/interrupted` after worker restart, rather than pretending to resume with expired signatures. Resubmit a **new job ID** to retry. The backend should grant signed-link lifetime longer than its expected queue delay; a full CPU queue can outlast a 1-hour presign and then fail safely. Work-directory persistence and backup/retention are deployment responsibilities. Stop the worker and explicitly remove only obsolete per-job directories after backend ingestion; do not remove active jobs or the broad work root.

Source downloads are limited to 25 MiB, audio to 25 MiB, public HTTPS IPs only, exact R2-host allowlist, pinned resolution and **no redirects or proxies**. Sources are JPEG/PNG/WebP or MP4/WebM; recorded audio supports WAV/MP3/WebM/OGG/M4A. Magic signatures, stream kind, dimensions and duration are checked. Audio duration is checked again after bounded decoding. Video output contains the first portrait frame animated to the selected speech, at the worker's fixed CPU 256px/batch1 configuration; no enhancer is enabled.

## Verification

```text
python -m unittest discover -s tests -v
```

These tests mock downloads/model processes, exercise real authenticated loopback HTTP, and need **no model downloads**. They do not establish generated-video quality, lip sync, latency or memory usage. Before enabling generation, perform an explicit private 5-second upload-audio render, play the returned MP4, and record measured time, peak memory, supported face framing and the deployment manifest. Test Hindi TTS/transcription independently if enabled.
