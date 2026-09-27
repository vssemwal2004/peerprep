"""Private CPU avatar worker. HTTP and orchestration use only Python's stdlib."""
from __future__ import annotations

import hashlib
import hmac
import http.client
import ipaddress
import json
import math
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import socket
import ssl
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass, replace
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

JOB_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,79}\Z")
MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_RESULT_BYTES = 100 * 1024 * 1024
MAX_BODY_BYTES = 24000
HERE = Path(__file__).resolve().parent


def load_local_env(path=HERE / ".env"):
    """Read only this service's explicit .env; shell environment wins. No expansion."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", key):
            raise ValueError("Invalid service environment file")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


class ServiceError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


def invalid(message="Invalid request."):
    raise ServiceError(422, "INVALID_INPUT", message)


def number_env(name, default, minimum, maximum):
    value = int(os.environ.get(name, default))
    if not minimum <= value <= maximum:
        raise ValueError(f"Invalid {name} configuration")
    return value


@dataclass(frozen=True)
class Config:
    token: str
    work_dir: Path
    asset_hosts: frozenset[str]
    sadtalker_root: Path
    sadtalker_python: str
    ffmpeg: str = "ffmpeg"
    ffprobe: str = "ffprobe"
    port: int = 8010
    max_seconds: int = 60
    render_timeout: int = 1800
    max_waiting: int = 4
    max_jobs: int = 200
    tts_python: str = ""
    tts_model_dir: str = ""
    stt_python: str = ""
    stt_model_dir: str = ""

    @classmethod
    def from_env(cls):
        token = os.environ.get("AVATAR_RENDER_SERVICE_TOKEN", "")
        if len(token) < 32 or any(c.isspace() for c in token):
            raise ValueError("AVATAR_RENDER_SERVICE_TOKEN must be at least 32 non-space characters")
        hosts = frozenset(x.strip().lower() for x in os.environ.get("AVATAR_ASSET_HOSTS", "").split(",") if x.strip())
        if not hosts or any(not re.fullmatch(r"[a-z0-9.-]+\.r2\.cloudflarestorage\.com", x) for x in hosts):
            raise ValueError("AVATAR_ASSET_HOSTS must contain exact R2 endpoint hostnames")
        root = Path(os.environ.get("SADTALKER_ROOT") or "./external/SadTalker").resolve()
        ffmpeg = os.environ.get("FFMPEG_PATH", "ffmpeg")
        ffprobe_default = str(Path(ffmpeg).with_name("ffprobe.exe" if ffmpeg.lower().endswith(".exe") else "ffprobe")) if Path(ffmpeg).parent != Path(".") else "ffprobe"
        return cls(
            token=token,
            work_dir=Path(os.environ.get("AVATAR_WORK_DIR", "./var/avatar-renderer")).resolve(),
            asset_hosts=hosts, sadtalker_root=root,
            sadtalker_python=os.environ.get("SADTALKER_PYTHON", ""),
            ffmpeg=ffmpeg, ffprobe=os.environ.get("FFPROBE_PATH", ffprobe_default),
            port=number_env("AVATAR_RENDER_PORT", 8010, 1, 65535),
            max_seconds=number_env("AVATAR_MAX_INTRO_SECONDS", 60, 1, 60),
            render_timeout=number_env("AVATAR_RENDER_TIMEOUT_SECONDS", 1800, 10, 7200),
            max_waiting=number_env("AVATAR_MAX_WAITING_JOBS", 4, 1, 20),
            max_jobs=number_env("AVATAR_MAX_RETAINED_JOBS", 200, 1, 10000),
            tts_python=os.environ.get("AVATAR_TTS_PYTHON", ""),
            tts_model_dir=os.environ.get("AVATAR_TTS_MODEL_DIR", ""),
            stt_python=os.environ.get("AVATAR_STT_PYTHON", ""),
            stt_model_dir=os.environ.get("AVATAR_STT_MODEL_DIR", ""),
        )

    def capabilities(self):
        render = self.readiness()["status"] == "configured"
        # These are configured prerequisites, not a model inference smoke test.
        tts = bool(self.tts_python and shutil.which(self.tts_python) and self.tts_model_dir
                   and all((Path(self.tts_model_dir) / x).is_file() for x in (
                       "ve.pt", "s3gen.pt", "t3_mtl23ls_v2.safetensors",
                       "grapheme_mtl_merged_expanded_v1.json", "conds.pt")))
        stt = bool(self.stt_python and shutil.which(self.stt_python) and self.stt_model_dir
                   and (Path(self.stt_model_dir) / "model.bin").is_file())
        return {"render": render, "tts": tts, "stt": stt,
                "ttsLanguages": ["en", "hi"] if tts else [],
                "sttLanguages": ["en", "hi", "hinglish"] if stt else []}

    def readiness(self):
        checks = {
            "sadtalkerPython": bool(self.sadtalker_python and shutil.which(self.sadtalker_python)),
            "sadtalkerSource": (self.sadtalker_root / "inference.py").is_file(),
            "sadtalker256Weights": (self.sadtalker_root / "checkpoints/SadTalker_V0.0.2_256.safetensors").is_file(),
            "mappingWeights": (self.sadtalker_root / "checkpoints/mapping_00229-model.pth.tar").is_file(),
            "alignmentWeights": (self.sadtalker_root / "gfpgan/weights/alignment_WFLW_4HG.pth").is_file(),
            "detectionWeights": (self.sadtalker_root / "gfpgan/weights/detection_Resnet50_Final.pth").is_file(),
            "ffmpeg": bool(shutil.which(self.ffmpeg)),
            "ffprobe": bool(shutil.which(self.ffprobe)),
        }
        return {"status": "configured" if all(checks.values()) else "setup_required", "checks": checks,
                "verifiedInference": False}


def validate_asset_url(value, hosts):
    if not isinstance(value, str) or not 1 <= len(value) <= 8192 or any(ord(c) < 33 for c in value):
        invalid("An HTTPS asset URL is required.")
    try:
        url = urlsplit(value)
        valid = (url.scheme == "https" and url.hostname in hosts
                 and url.hostname.endswith(".r2.cloudflarestorage.com")
                 and not url.username and not url.password and url.port in (None, 443)
                 and not url.fragment and url.path.startswith("/"))
    except ValueError:
        valid = False
    if not valid:
        invalid("Asset URL is outside the configured storage endpoint.")
    return url


def public_address(host):
    try:
        addresses = {result[4][0] for result in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(value).is_global for value in addresses):
            raise ValueError("Non-public address")
    except (OSError, ValueError):
        raise ServiceError(422, "ASSET_ADDRESS_REJECTED", "Storage endpoint did not resolve to public addresses.") from None
    return sorted(addresses)[0]


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    def __init__(self, host, address):
        super().__init__(host, timeout=15, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        # DNS resolution happens once, is checked, then the connection is pinned.
        sock = socket.create_connection((self.address, 443), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def download_asset(url, destination, hosts, limit):
    parsed = validate_asset_url(url, hosts)
    connection = PinnedHTTPSConnection(parsed.hostname, public_address(parsed.hostname))
    deadline = time.monotonic() + 60
    try:
        connection.request("GET", parsed.path + ("?" + parsed.query if parsed.query else ""),
                           headers={"Accept-Encoding": "identity", "User-Agent": "PeerPrepAvatarWorker/1"})
        response = connection.getresponse()
        if response.status != 200:  # Redirects are never followed.
            raise ServiceError(422, "ASSET_DOWNLOAD_FAILED", "Asset could not be downloaded. Its signed link may have expired.")
        declared = response.getheader("Content-Length")
        if declared is not None and (not declared.isdigit() or int(declared) > limit):
            raise ServiceError(413, "ASSET_TOO_LARGE", "Asset exceeds the permitted file size.")
        size = 0
        with destination.open("xb") as target:
            while True:
                if time.monotonic() > deadline:
                    raise ServiceError(504, "DOWNLOAD_TIMEOUT", "Asset download timed out.")
                chunk = response.read(min(65536, limit + 1 - size))
                if not chunk:
                    break
                size += len(chunk)
                if size > limit:
                    raise ServiceError(413, "ASSET_TOO_LARGE", "Asset exceeds the permitted file size.")
                target.write(chunk)
        if size == 0:
            invalid("Asset file is empty.")
    except (OSError, http.client.HTTPException):
        raise ServiceError(422, "ASSET_DOWNLOAD_FAILED", "Asset could not be downloaded.") from None
    finally:
        connection.close()


def detect_media(path):
    with path.open("rb") as source:
        head = source.read(64)
    if head.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "webp"
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return "wav"
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return "webm"
    if head[4:8] == b"ftyp":
        return "mp4"
    if head.startswith(b"OggS"):
        return "ogg"
    if head.startswith(b"ID3") or (len(head) > 1 and head[0] == 255 and head[1] & 0xE0 == 0xE0):
        return "mp3"
    invalid("Unsupported or unrecognized media file.")


def run_process(args, *, timeout, cwd=None, capture=False, additional_path=None, offline_model=False):
    # Pass only OS/runtime paths, never the application's arbitrary credentials.
    runtime_keys = {
        "PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR",
        "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PROGRAMDATA", "VIRTUAL_ENV",
        "CONDA_PREFIX", "PYTHONIOENCODING", "LANG", "LC_ALL", "HF_HOME", "HF_HUB_CACHE",
        "TRANSFORMERS_CACHE", "TORCH_HOME", "XDG_CACHE_HOME", "LD_LIBRARY_PATH",
        "DYLD_LIBRARY_PATH", "SSL_CERT_FILE", "SSL_CERT_DIR",
    }
    env = {key: value for key, value in os.environ.items() if key.upper() in runtime_keys}
    env.update({"CUDA_VISIBLE_DEVICES": "", "HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1",
                "HF_HUB_DISABLE_TELEMETRY": "1", "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2"})
    if additional_path:
        env["PATH"] = str(additional_path) + os.pathsep + env.get("PATH", "")
    if offline_model:
        # Only fixed, administrator-configured Python model scripts reach here.
        args = [args[0], HERE / "model_launcher.py", *args[1:]]
    with tempfile.TemporaryFile() as output:
        try:
            process = subprocess.Popen([str(arg) for arg in args], cwd=cwd, env=env,
                                       stdin=subprocess.DEVNULL, stdout=output if capture else subprocess.DEVNULL,
                                       stderr=subprocess.DEVNULL, shell=False,
                                       start_new_session=os.name != "nt",
                                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            try:
                process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10,
                                   creationflags=subprocess.CREATE_NO_WINDOW, check=False)
                else:
                    os.killpg(process.pid, signal.SIGKILL)
                process.kill()
                process.wait(timeout=10)
                raise ServiceError(504, "PROCESS_TIMEOUT", "Media processing exceeded its time limit.") from None
            if process.returncode:
                raise ServiceError(422, "PROCESS_FAILED", "Media processing failed. Check the source, audio and installed model prerequisites.")
        except (OSError, subprocess.SubprocessError):
            raise ServiceError(503, "PROCESS_UNAVAILABLE", "A required media tool could not run.") from None
        if output.tell() > 65536:
            raise ServiceError(422, "INVALID_TOOL_OUTPUT", "Media tool returned an invalid result.")
        output.seek(0)
        return output.read(65536) if capture else b""


def probe(config, path):
    raw = run_process([config.ffprobe, "-v", "error", "-protocol_whitelist", "file,pipe",
                       "-show_entries", "format=duration:stream=codec_type,width,height,duration",
                       "-of", "json", path], timeout=30, capture=True)
    try:
        result = json.loads(raw)
        if not isinstance(result.get("streams"), list) or len(result["streams"]) > 8:
            raise ValueError()
        return result
    except (ValueError, KeyError, TypeError):
        invalid("Media could not be inspected.")


def check_duration(info, maximum):
    try:
        seconds = float(info.get("format", {}).get("duration", "nan"))
    except (ValueError, TypeError):
        seconds = math.nan
    if not math.isfinite(seconds) or seconds <= 0 or seconds > maximum:
        invalid(f"Media must have a readable duration of no more than {maximum} seconds.")
    return seconds


def ensure_stream(info, kind):
    matches = [stream for stream in info["streams"] if stream.get("codec_type") == kind]
    if not matches:
        invalid(f"Media must include a {kind} stream.")
    if kind == "video" and any(not 0 < int(stream.get("width", 0)) <= 4096 or not 0 < int(stream.get("height", 0)) <= 4096 for stream in matches):
        invalid("Source image or video dimensions exceed 4096 pixels.")


def prepare_audio(config, source, directory):
    if detect_media(source) not in {"wav", "mp3", "webm", "ogg", "mp4"}:
        invalid("Use WAV, MP3, WebM, OGG or M4A audio.")
    info = probe(config, source)
    ensure_stream(info, "audio")
    # Browser MediaRecorder WebM may omit container duration until remuxed.
    # Never trust this omission: decode at most max+1 seconds, then reject if
    # the resulting WAV exceeds the cap. Known invalid/oversized values fail now.
    if info.get("format", {}).get("duration") not in (None, "N/A"):
        check_duration(info, config.max_seconds)
    target = directory / "speech.wav"
    run_process([config.ffmpeg, "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe",
                 "-i", source, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
                 "-t", str(config.max_seconds + 1), "-f", "wav", target], timeout=60)
    # Enforce duration again on decoded media, not only untrusted container metadata.
    check_duration(probe(config, target), config.max_seconds)
    return target


def prepare_source(config, source, directory, kind):
    detected = detect_media(source)
    if detected not in ({"jpeg", "png", "webp"} if kind == "image" else {"mp4", "webm"}):
        invalid("Source content does not match the selected image or video type.")
    info = probe(config, source)
    ensure_stream(info, "video")
    if kind == "video":
        check_duration(info, config.max_seconds)
    target = directory / "portrait.png"
    run_process([config.ffmpeg, "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe",
                 "-i", source, "-map", "0:v:0", "-frames:v", "1", "-vf",
                 "scale=1024:1024:force_original_aspect_ratio=decrease", target], timeout=60)
    if not target.is_file() or target.stat().st_size > MAX_SOURCE_BYTES:
        invalid("A valid portrait frame could not be extracted.")
    return target


def effective_limit(value, config):
    requested = value.get("maxIntroSeconds", config.max_seconds)
    if type(requested) is not int or not 1 <= requested <= 60:
        invalid("maxIntroSeconds must be an integer between 1 and 60.")
    return min(requested, config.max_seconds)


def validate_job(value, config):
    if not isinstance(value, dict) or set(value) - {"jobId", "sourceUrl", "sourceKind", "audioUrl", "text", "language", "voice", "mode", "maxIntroSeconds"}:
        invalid()
    job_id = value.get("jobId")
    if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
        invalid("Invalid job identifier.")
    if value.get("sourceKind") not in {"image", "video"} or value.get("mode") not in {"upload", "tts"}:
        invalid("Select an image/video source and an upload/tts mode.")
    if value.get("language") not in {"en", "hi", "hinglish"}:
        invalid("Unsupported language.")
    text = value.get("text", "")
    if not isinstance(text, str) or len(text) > 2000 or (value["mode"] == "tts" and not text.strip()):
        invalid("Introduction text must contain at most 2000 characters.")
    voice = value.get("voice", "default")
    if voice != "default":
        invalid("Only the configured default voice is supported.")
    validate_asset_url(value.get("sourceUrl"), config.asset_hosts)
    if value["mode"] == "upload":
        validate_asset_url(value.get("audioUrl"), config.asset_hosts)
    elif value.get("audioUrl"):
        invalid("TTS mode does not accept an audio URL.")
    if value["mode"] == "tts" and value["language"] not in {"en", "hi"}:
        invalid("TTS currently supports English and Hindi. Upload recorded audio for Hinglish.")
    return {**value, "text": text.strip(), "voice": voice, "maxIntroSeconds": effective_limit(value, config)}


def manifest_hash(value):
    stable = dict(value)
    for key in ("sourceUrl", "audioUrl"):
        if stable.get(key):
            url = urlsplit(stable[key])
            stable[key] = f"{url.scheme}://{url.hostname}{url.path}"
    return hashlib.sha256(json.dumps(stable, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def atomic_json(path, value):
    temporary = path.with_suffix(".tmp")
    with temporary.open("w", encoding="utf-8") as target:
        json.dump(value, target, ensure_ascii=False)
        target.flush()
        os.fsync(target.fileno())
    os.replace(temporary, path)


class Renderer:
    def __init__(self, config, start_worker=True):
        self.config = config
        self.directory = config.work_dir / "jobs"
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.compute = threading.Lock()
        self.pending = queue.Queue(maxsize=config.max_waiting)
        self.stopping = threading.Event()
        for path in self.directory.iterdir():
            if path.is_dir() and not path.is_symlink() and JOB_ID.fullmatch(path.name):
                try:
                    state = self.get(path.name)
                    if state["status"] in {"queued", "processing"}:
                        self.set_state(path.name, "failed", "interrupted", "Worker restarted. Submit a new job to retry.")
                except (ServiceError, OSError, ValueError):
                    pass
        self.worker = threading.Thread(target=self.work, daemon=True, name="avatar-renderer")
        if start_worker:
            self.worker.start()

    def job_dir(self, job_id):
        if not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
            invalid("Invalid job identifier.")
        path = self.directory / job_id
        if path.is_symlink() or path.resolve().parent != self.directory.resolve():
            invalid("Invalid job storage path.")
        return path

    def get(self, job_id):
        path = self.job_dir(job_id) / "status.json"
        with self.lock:
            if not path.is_file() or path.is_symlink():
                raise ServiceError(404, "JOB_NOT_FOUND", "Render job not found.")
            try:
                return json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                raise ServiceError(503, "JOB_STATE_UNAVAILABLE", "Render status is unavailable.") from None

    def set_state(self, job_id, status, stage, error=None):
        state = {"jobId": job_id, "status": status, "stage": stage, "error": error, "updatedAt": int(time.time())}
        with self.lock:
            atomic_json(self.job_dir(job_id) / "status.json", state)
        return state

    def submit(self, value):
        value = validate_job(value, self.config)
        digest = manifest_hash(value)
        with self.lock:
            directory = self.job_dir(value["jobId"])
            if directory.exists():
                manifest = directory / "manifest.json"
                if not manifest.is_file() or json.loads(manifest.read_text(encoding="utf-8")).get("hash") != digest:
                    raise ServiceError(409, "JOB_ID_CONFLICT", "This job identifier belongs to different input.")
                return self.get(value["jobId"]), False
            caps = self.config.capabilities()
            if not caps["render"]:
                raise ServiceError(503, "RENDERER_NOT_CONFIGURED", "Install the renderer prerequisites before generating an avatar.")
            if value["mode"] == "tts" and not caps["tts"]:
                raise ServiceError(503, "TTS_NOT_CONFIGURED", "Text-to-speech is not configured. Upload recorded audio instead.")
            if self.pending.full():
                raise ServiceError(429, "QUEUE_FULL", "Renderer queue is full. Try again later.")
            if sum(path.is_dir() for path in self.directory.iterdir()) >= self.config.max_jobs:
                raise ServiceError(507, "JOB_STORAGE_FULL", "Renderer job storage requires administrator maintenance.")
            directory.mkdir(mode=0o700)
            # Do not persist presigned URLs or tokens. Only their manifest digest.
            atomic_json(directory / "manifest.json", {"hash": digest, "createdAt": int(time.time())})
            state = self.set_state(value["jobId"], "queued", "queued")
            self.pending.put_nowait(value)
            return state, True

    def work(self):
        while not self.stopping.is_set():
            try:
                job = self.pending.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                with self.compute:
                    self.process(job)
            except ServiceError as error:
                self.set_state(job["jobId"], "failed", error.code.lower(), error.message)
            except Exception:
                self.set_state(job["jobId"], "failed", "processing_failed", "Avatar rendering failed. Check worker prerequisites and retry with a new job.")
            finally:
                self.pending.task_done()

    def process(self, job):
        config = replace(self.config, max_seconds=effective_limit(job, self.config))
        job_id = job["jobId"]
        directory = self.job_dir(job_id)
        self.set_state(job_id, "processing", "downloading")
        source = directory / "source.bin"
        download_asset(job["sourceUrl"], source, self.config.asset_hosts, MAX_SOURCE_BYTES)
        portrait = prepare_source(config, source, directory, job["sourceKind"])
        audio = directory / "audio.bin"
        if job["mode"] == "upload":
            download_asset(job["audioUrl"], audio, self.config.asset_hosts, MAX_AUDIO_BYTES)
        else:
            self.set_state(job_id, "processing", "synthesizing")
            request = directory / "tts.json"
            atomic_json(request, {"text": job["text"], "language": job["language"], "modelDir": self.config.tts_model_dir})
            run_process([self.config.tts_python, HERE / "speech_helper.py", "tts", request, audio], timeout=self.config.render_timeout, offline_model=True)
            if not audio.is_file() or audio.stat().st_size > MAX_AUDIO_BYTES:
                invalid("Speech generation did not return valid bounded audio.")
        speech = prepare_audio(config, audio, directory)
        self.set_state(job_id, "processing", "rendering")
        output = directory / "output"
        output.mkdir()
        run_process([self.config.sadtalker_python, self.config.sadtalker_root / "inference.py",
                     "--cpu", "--size", "256", "--batch_size", "1", "--preprocess", "crop",
                     "--source_image", portrait, "--driven_audio", speech,
                     "--checkpoint_dir", self.config.sadtalker_root / "checkpoints", "--result_dir", output],
                    timeout=self.config.render_timeout, cwd=self.config.sadtalker_root,
                    additional_path=Path(shutil.which(self.config.ffmpeg) or self.config.ffmpeg).resolve().parent,
                    offline_model=True)
        # Official inference.py publishes its final MP4 directly in result_dir.
        videos = [path for path in output.glob("*.mp4") if path.is_file() and not path.is_symlink()]
        if len(videos) != 1 or not 0 < videos[0].stat().st_size <= MAX_RESULT_BYTES:
            raise ServiceError(422, "INVALID_RENDER_RESULT", "Renderer did not produce a valid bounded video.")
        info = probe(self.config, videos[0])
        ensure_stream(info, "video")
        ensure_stream(info, "audio")
        check_duration(info, config.max_seconds + 1)
        os.replace(videos[0], directory / "result.mp4")
        self.set_state(job_id, "ready", "ready")

    def result_path(self, job_id):
        if self.get(job_id)["status"] != "ready":
            raise ServiceError(409, "RESULT_NOT_READY", "The rendered video is not ready.")
        path = self.job_dir(job_id) / "result.mp4"
        if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_RESULT_BYTES:
            raise ServiceError(404, "RESULT_NOT_FOUND", "The rendered video is unavailable.")
        return path

    def transcribe(self, value):
        if not isinstance(value, dict) or set(value) - {"audioUrl", "language", "maxIntroSeconds"} or value.get("language") not in {"en", "hi", "hinglish"}:
            invalid("Provide audio and a supported language.")
        config = replace(self.config, max_seconds=effective_limit(value, self.config))
        validate_asset_url(value.get("audioUrl"), self.config.asset_hosts)
        if not self.config.capabilities()["stt"]:
            raise ServiceError(503, "STT_NOT_CONFIGURED", "Audio transcription is not configured.")
        # Never run a transcription model concurrently with the render model.
        if not self.compute.acquire(blocking=False):
            raise ServiceError(429, "WORKER_BUSY", "Renderer is busy. Try transcription again later.")
        try:
            with tempfile.TemporaryDirectory(prefix="transcribe-", dir=self.config.work_dir) as temporary:
                directory = Path(temporary)
                audio = directory / "audio.bin"
                download_asset(value["audioUrl"], audio, self.config.asset_hosts, MAX_AUDIO_BYTES)
                speech = prepare_audio(config, audio, directory)
                request, output = directory / "stt.json", directory / "text.json"
                atomic_json(request, {"language": value["language"], "modelDir": self.config.stt_model_dir, "audio": str(speech)})
                run_process([self.config.stt_python, HERE / "speech_helper.py", "stt", request, output], timeout=50, offline_model=True)
                if not output.is_file() or output.stat().st_size > 16000:
                    invalid("Transcription did not return valid text.")
                text = json.loads(output.read_text(encoding="utf-8")).get("text")
                if not isinstance(text, str) or len(text) > 2000:
                    invalid("Transcription is too long or invalid.")
                return {"text": text.strip()}
        finally:
            self.compute.release()


class Server(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, renderer):
        self.renderer = renderer
        self.slots = threading.BoundedSemaphore(12)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "PeerPrepAvatarWorker"

    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def log_message(self, *_args):
        pass  # Never log bearer credentials, signed URLs or request bodies.

    def send_json(self, status, value):
        content = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(content)

    def authorized(self):
        supplied = self.headers.get("Authorization", "")
        expected = "Bearer " + self.server.renderer.config.token
        if not hmac.compare_digest(supplied.encode(), expected.encode()):
            raise ServiceError(401, "UNAUTHORIZED", "Authentication required.")

    def body(self):
        length = self.headers.get("Content-Length", "")
        if self.headers.get("Transfer-Encoding") or not length.isdigit() or not 0 < int(length) <= MAX_BODY_BYTES:
            raise ServiceError(413, "INVALID_BODY_SIZE", "A bounded JSON request body is required.")
        if self.headers.get_content_type() != "application/json":
            raise ServiceError(415, "INVALID_CONTENT_TYPE", "Use application/json.")
        try:
            return json.loads(self.rfile.read(int(length)))
        except (ValueError, UnicodeError):
            invalid("Invalid JSON body.")

    def dispatch(self):
        self.authorized()
        renderer = self.server.renderer
        if self.command == "GET" and self.path == "/health":
            return self.send_json(200, {"status": "ok", "capabilities": renderer.config.capabilities(),
                                        "readiness": renderer.config.readiness(), "maxIntroSeconds": renderer.config.max_seconds})
        if self.command == "POST" and self.path == "/jobs":
            state, created = renderer.submit(self.body())
            return self.send_json(202 if created else 200, state)
        if self.command == "POST" and self.path == "/transcribe":
            return self.send_json(200, renderer.transcribe(self.body()))
        match = re.fullmatch(r"/jobs/([A-Za-z0-9][A-Za-z0-9_-]{0,79})(/result)?", self.path)
        if self.command == "GET" and match:
            if not match[2]:
                return self.send_json(200, renderer.get(match[1]))
            path = renderer.result_path(match[1])
            self.send_response(200)
            self.send_header("Content-Type", "video/mp4")
            self.send_header("Content-Length", str(path.stat().st_size))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            with path.open("rb") as source:
                shutil.copyfileobj(source, self.wfile, length=65536)
            return
        raise ServiceError(404, "NOT_FOUND", "Endpoint not found.")

    def handle_method(self):
        try:
            self.dispatch()
        except ServiceError as error:
            self.send_json(error.status, {"error": error.message, "code": error.code})
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            pass
        except Exception:
            self.send_json(500, {"error": "Renderer request failed.", "code": "INTERNAL_ERROR"})

    do_GET = handle_method
    do_POST = handle_method


def main():
    try:
        load_local_env()
        config = Config.from_env()
        renderer = Renderer(config)
        server = Server(("127.0.0.1", config.port), renderer)
    except (ValueError, OSError):
        raise SystemExit("Renderer could not start. Check configuration and work-directory permissions.") from None
    print(f"Avatar worker listening on loopback port {config.port}; one render at a time.")
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        renderer.stopping.set()
        server.server_close()


if __name__ == "__main__":
    main()
