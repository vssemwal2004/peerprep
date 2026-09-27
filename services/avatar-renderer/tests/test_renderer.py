import http.client
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from dataclasses import replace
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import renderer as worker

HOST = "account.r2.cloudflarestorage.com"
CAPABILITIES = {"render": True, "tts": False, "stt": False, "ttsLanguages": [], "sttLanguages": []}


class RendererTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.config = worker.Config(token="test-only-token-" * 3, work_dir=self.root,
                                    asset_hosts=frozenset({HOST}), sadtalker_root=self.root / "SadTalker",
                                    sadtalker_python="python", max_waiting=2)
        self.renderer = worker.Renderer(self.config, start_worker=False)
        self.capabilities = patch.object(worker.Config, "capabilities", return_value=CAPABILITIES)
        self.capabilities.start()

    def tearDown(self):
        self.renderer.stopping.set()
        self.capabilities.stop()
        self.temporary.cleanup()

    def job(self, **updates):
        return {"jobId": "job-1", "sourceUrl": f"https://{HOST}/bucket/source.png?signature=one",
                "sourceKind": "image", "audioUrl": f"https://{HOST}/bucket/audio.webm?signature=two",
                "mode": "upload", "text": "Hello", "language": "en", "voice": "default", **updates}

    def test_asset_urls_are_exact_https_allowlist_only(self):
        worker.validate_asset_url(self.job()["sourceUrl"], self.config.asset_hosts)
        for value in ["http://" + HOST + "/x", "https://localhost/x", "https://127.0.0.1/x",
                      "https://" + HOST + ".evil.com/x", "https://user:pass@" + HOST + "/x",
                      "https://" + HOST + ":444/x", "https://" + HOST + "/x#fragment",
                      "https://" + HOST + "/x\r\nHeader: yes", "file:///secret"]:
            with self.subTest(value=value), self.assertRaises(worker.ServiceError):
                worker.validate_asset_url(value, self.config.asset_hosts)

    def test_dns_blocks_private_and_mixed_addresses(self):
        for values in [["127.0.0.1"], ["10.1.2.3"], ["169.254.169.254"], ["::1"], ["1.1.1.1", "192.168.1.2"]]:
            with patch.object(worker.socket, "getaddrinfo", return_value=[(2, 1, 6, "", (value, 443)) for value in values]):
                with self.assertRaises(worker.ServiceError):
                    worker.public_address(HOST)
        with patch.object(worker.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("1.1.1.1", 443))]):
            self.assertEqual(worker.public_address(HOST), "1.1.1.1")

    def test_download_does_not_follow_redirects_or_ignore_size(self):
        response = Mock(status=302)
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(worker, "public_address", return_value="1.1.1.1"), patch.object(worker, "PinnedHTTPSConnection", return_value=connection):
            with self.assertRaises(worker.ServiceError) as error:
                worker.download_asset(self.job()["sourceUrl"], self.root / "download", self.config.asset_hosts, 20)
            self.assertEqual(error.exception.code, "ASSET_DOWNLOAD_FAILED")
            response.status = 200
            response.getheader.return_value = "21"
            with self.assertRaises(worker.ServiceError) as error:
                worker.download_asset(self.job()["sourceUrl"], self.root / "download", self.config.asset_hosts, 20)
            self.assertEqual(error.exception.status, 413)
            response.getheader.return_value = None
            response.read.return_value = b"x" * 21
            with self.assertRaises(worker.ServiceError) as error:
                worker.download_asset(self.job()["sourceUrl"], self.root / "download", self.config.asset_hosts, 20)
            self.assertEqual(error.exception.status, 413)

    def test_job_validation_rejects_paths_extra_fields_and_unsupported_voice(self):
        for patch_value in [{"jobId": "../bad"}, {"jobId": "a/b"}, {"jobId": "x" * 81},
                            {"command": "anything"}, {"sourceKind": "html"}, {"mode": "shell"},
                            {"voice": "cloned-person"}, {"language": "other"}, {"text": "x" * 2001}]:
            with self.subTest(patch_value=patch_value), self.assertRaises(worker.ServiceError):
                worker.validate_job(self.job(**patch_value), self.config)

    def test_manifest_idempotency_handles_rotating_presigned_query_and_conflicts(self):
        state, created = self.renderer.submit(self.job())
        self.assertTrue(created)
        self.assertEqual(state["status"], "queued")
        state, created = self.renderer.submit(self.job(sourceUrl=f"https://{HOST}/bucket/source.png?signature=fresh"))
        self.assertFalse(created)
        self.assertEqual(self.renderer.pending.qsize(), 1)
        with self.assertRaises(worker.ServiceError) as error:
            self.renderer.submit(self.job(text="Different input"))
        self.assertEqual(error.exception.status, 409)
        persisted = (self.renderer.job_dir("job-1") / "manifest.json").read_text()
        self.assertNotIn("signature", persisted)
        self.assertNotIn("Hello", persisted)

    def test_queue_is_bounded_and_jobs_survive_restart_as_interrupted(self):
        self.renderer.submit(self.job())
        self.renderer.submit(self.job(jobId="job-2"))
        with self.assertRaises(worker.ServiceError) as error:
            self.renderer.submit(self.job(jobId="job-3"))
        self.assertEqual(error.exception.status, 429)
        restarted = worker.Renderer(self.config, start_worker=False)
        self.assertEqual(restarted.get("job-1")["status"], "failed")
        self.assertEqual(restarted.get("job-1")["stage"], "interrupted")
        self.assertEqual(restarted.pending.qsize(), 0)

    def test_tts_requires_real_configuration_and_rejects_hinglish(self):
        with self.assertRaises(worker.ServiceError) as error:
            self.renderer.submit(self.job(mode="tts", audioUrl=None))
        self.assertEqual(error.exception.code, "TTS_NOT_CONFIGURED")
        with self.assertRaises(worker.ServiceError):
            self.renderer.submit(self.job(mode="tts", audioUrl=None, language="hinglish"))
        with self.assertRaises(worker.ServiceError) as error:
            self.renderer.transcribe({"audioUrl": self.job()["audioUrl"], "language": "en"})
        self.assertEqual(error.exception.code, "STT_NOT_CONFIGURED")

    def test_media_signatures_reject_non_media_and_recognize_browser_formats(self):
        for expected, content in {"png": b"\x89PNG\r\n\x1a\n", "jpeg": b"\xff\xd8\xff\xe0",
                                  "webm": b"\x1a\x45\xdf\xa3", "mp4": b"\x00\x00\x00\x18ftypM4A ",
                                  "wav": b"RIFFxxxxWAVE", "webp": b"RIFFxxxxWEBP",
                                  "ogg": b"OggS", "mp3": b"ID3"}.items():
            path = self.root / expected
            path.write_bytes(content)
            self.assertEqual(worker.detect_media(path), expected)
        path = self.root / "pretend.png"
        path.write_bytes(b"<html>not media</html>")
        with self.assertRaises(worker.ServiceError):
            worker.detect_media(path)

    def test_duration_and_dimensions_limits_are_enforced(self):
        for duration in ["nan", "inf", "61", "0", "-1", None]:
            with self.subTest(duration=duration), self.assertRaises(worker.ServiceError):
                worker.check_duration({"format": {"duration": duration}}, 60)
        self.assertEqual(worker.check_duration({"format": {"duration": "59.9"}}, 60), 59.9)
        with self.assertRaises(worker.ServiceError):
            worker.ensure_stream({"streams": [{"codec_type": "video", "width": 20000, "height": 400}]}, "video")
        with self.assertRaises(worker.ServiceError):
            worker.ensure_stream({"streams": [{"codec_type": "video", "width": 256, "height": 256}]}, "audio")

    def test_decoded_audio_is_rechecked_not_just_container_metadata(self):
        path = self.root / "audio.webm"
        path.write_bytes(b"\x1a\x45\xdf\xa3")
        info = {"streams": [{"codec_type": "audio"}], "format": {"duration": "5"}}
        with patch.object(worker, "probe", side_effect=[info, {"format": {"duration": "61"}}]), patch.object(worker, "run_process") as process:
            with self.assertRaises(worker.ServiceError):
                worker.prepare_audio(self.config, path, self.root)
            self.assertIn("16000", process.call_args.args[0])
            self.assertIn("file,pipe", process.call_args.args[0])

    def test_browser_recordings_without_container_duration_are_bounded_then_validated(self):
        path = self.root / "recording.webm"
        path.write_bytes(b"\x1a\x45\xdf\xa3")
        unknown = {"streams": [{"codec_type": "audio"}], "format": {}}
        with patch.object(worker, "probe", side_effect=[unknown, {"format": {"duration": "5"}}]), patch.object(worker, "run_process") as process:
            self.assertEqual(worker.prepare_audio(self.config, path, self.root), self.root / "speech.wav")
            args = process.call_args.args[0]
            self.assertEqual(args[args.index("-t") + 1], "61")
        with patch.object(worker, "probe", side_effect=[unknown, {"format": {"duration": "61"}}]), patch.object(worker, "run_process"):
            with self.assertRaises(worker.ServiceError):
                worker.prepare_audio(self.config, path, self.root)

    def test_render_uses_fixed_cpu_flags_and_publishes_only_valid_mp4(self):
        self.renderer.submit(self.job())
        calls = []
        def run(args, **kwargs):
            calls.append((args, kwargs))
            (self.renderer.job_dir("job-1") / "output/final.mp4").write_bytes(b"valid-result")
        info = {"streams": [{"codec_type": "video", "width": 256, "height": 256}, {"codec_type": "audio"}], "format": {"duration": "5"}}
        with patch.object(worker, "download_asset"), patch.object(worker, "prepare_source", return_value=self.root / "portrait.png"), patch.object(worker, "prepare_audio", return_value=self.root / "speech.wav"), patch.object(worker, "probe", return_value=info), patch.object(worker, "run_process", side_effect=run):
            self.renderer.process(self.job())
        args, options = calls[0]
        self.assertIn("--cpu", args)
        self.assertEqual(args[args.index("--size") + 1], "256")
        self.assertEqual(args[args.index("--batch_size") + 1], "1")
        self.assertNotIn("--enhancer", args)
        self.assertEqual(options["timeout"], self.config.render_timeout)
        self.assertTrue(options["offline_model"])
        self.assertEqual(self.renderer.get("job-1")["status"], "ready")
        self.assertEqual(self.renderer.result_path("job-1").read_bytes(), b"valid-result")

    def test_request_duration_policy_can_only_lower_worker_limit(self):
        self.assertEqual(worker.validate_job(self.job(maxIntroSeconds=30), self.config)["maxIntroSeconds"], 30)
        self.assertEqual(worker.validate_job(self.job(maxIntroSeconds=60), replace(self.config, max_seconds=20))["maxIntroSeconds"], 20)
        for value in [True, "30", 0, 61, 1.5, None]:
            with self.subTest(value=value), self.assertRaises(worker.ServiceError):
                worker.validate_job(self.job(maxIntroSeconds=value), self.config)
        self.renderer.submit(self.job(maxIntroSeconds=30))
        with patch.object(worker, "download_asset"), patch.object(worker, "prepare_source", side_effect=worker.ServiceError(422, "TEST_STOP", "Stop")) as source:
            with self.assertRaises(worker.ServiceError):
                self.renderer.process(self.job(maxIntroSeconds=30))
            self.assertEqual(source.call_args.args[0].max_seconds, 30)
        with patch.object(worker.Config, "capabilities", return_value={**CAPABILITIES, "stt": True}), patch.object(worker, "download_asset"), patch.object(worker, "prepare_audio", side_effect=worker.ServiceError(422, "TEST_STOP", "Stop")) as audio:
            with self.assertRaises(worker.ServiceError):
                self.renderer.transcribe({"audioUrl": self.job()["audioUrl"], "language": "hi", "maxIntroSeconds": 15})
            self.assertEqual(audio.call_args.args[0].max_seconds, 15)
            self.assertFalse(self.renderer.compute.locked())

    def test_model_launcher_blocks_request_time_network_without_model_dependencies(self):
        script = self.root / "model.py"
        script.write_text("import socket\nsocket.create_connection(('127.0.0.1', 1))\n", encoding="utf-8")
        with self.assertRaises(worker.ServiceError) as error:
            worker.run_process([sys.executable, script], timeout=5, offline_model=True)
        self.assertEqual(error.exception.code, "PROCESS_FAILED")
        # Local processing remains usable: this is a real, model-free subprocess.
        script.write_text("import sys\nassert sys.argv[1] == 'literal;value'\n", encoding="utf-8")
        worker.run_process([sys.executable, script, "literal;value"], timeout=5, offline_model=True)

    def test_process_is_shell_free_cpu_offline_and_does_not_receive_secrets(self):
        process = Mock(returncode=0)
        with patch.dict(os.environ, {"AVATAR_RENDER_SERVICE_TOKEN": "secret", "R2_SECRET_ACCESS_KEY": "secret", "GEMINI_API_KEY": "secret", "MONGODB_URI": "private-database", "UNRELATED_CREDENTIAL": "secret"}), patch.object(worker.subprocess, "Popen", return_value=process) as spawn:
            worker.run_process(["python", "model.py", "literal;not-a-command"], timeout=12)
        args, options = spawn.call_args
        self.assertEqual(args[0][-1], "literal;not-a-command")
        self.assertFalse(options["shell"])
        self.assertEqual(options["env"]["HF_HUB_OFFLINE"], "1")
        self.assertEqual(options["env"]["CUDA_VISIBLE_DEVICES"], "")
        self.assertNotIn("AVATAR_RENDER_SERVICE_TOKEN", options["env"])
        self.assertNotIn("R2_SECRET_ACCESS_KEY", options["env"])
        self.assertNotIn("GEMINI_API_KEY", options["env"])
        self.assertNotIn("MONGODB_URI", options["env"])
        self.assertNotIn("UNRELATED_CREDENTIAL", options["env"])

    def test_env_loader_preserves_shell_and_never_expands_commands(self):
        path = self.root / ".env"
        path.write_text('AVATAR_TEST_A=file\nAVATAR_TEST_B="$(do-not-run)"\n', encoding="utf-8")
        with patch.dict(os.environ, {"AVATAR_TEST_A": "shell"}):
            worker.load_local_env(path)
            self.assertEqual(os.environ["AVATAR_TEST_A"], "shell")
            self.assertEqual(os.environ["AVATAR_TEST_B"], "$(do-not-run)")

    def test_http_auth_health_job_routes_and_safe_errors(self):
        server = worker.Server(("127.0.0.1", 0), self.renderer)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        def request(method, path, body=None, authorized=True):
            connection = http.client.HTTPConnection("127.0.0.1", server.server_port, timeout=3)
            headers = {"Content-Type": "application/json"}
            if authorized:
                headers["Authorization"] = "Bearer " + self.config.token
            connection.request(method, path, json.dumps(body) if body is not None else None, headers)
            response = connection.getresponse()
            content = response.read()
            status = response.status
            connection.close()
            return status, json.loads(content)
        try:
            self.assertEqual(request("GET", "/health", authorized=False)[0], 401)
            status, health = request("GET", "/health")
            self.assertEqual(status, 200)
            self.assertIn("readiness", health)
            self.assertNotIn(str(self.root), json.dumps(health))
            status, result = request("POST", "/jobs", self.job())
            self.assertEqual(status, 202)
            self.assertEqual(result["jobId"], "job-1")
            self.assertEqual(request("POST", "/jobs", self.job())[0], 200)
            self.assertEqual(request("GET", "/jobs/job-1")[1]["status"], "queued")
            self.assertEqual(request("GET", "/jobs/job-1/result")[0], 409)
            self.assertEqual(request("GET", "/jobs/missing")[0], 404)
            with patch.object(self.renderer, "submit", side_effect=RuntimeError("SECRET /private/path")):
                status, error = request("POST", "/jobs", self.job(jobId="job-2"))
                self.assertEqual(status, 500)
                self.assertNotIn("SECRET", str(error))
                self.assertNotIn("private", str(error))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


class ConfigurationTests(unittest.TestCase):
    def test_environment_requires_safe_token_hosts_and_bounded_limits(self):
        base = {"AVATAR_RENDER_SERVICE_TOKEN": "x" * 40, "AVATAR_ASSET_HOSTS": HOST}
        with patch.dict(os.environ, base, clear=True):
            config = worker.Config.from_env()
            self.assertEqual(config.port, 8010)
            self.assertEqual(config.max_seconds, 60)
            self.assertEqual(config.max_waiting, 4)
        for value in [{"AVATAR_RENDER_SERVICE_TOKEN": "short"}, {"AVATAR_RENDER_SERVICE_TOKEN": "x" * 40 + " "},
                      {"AVATAR_ASSET_HOSTS": "localhost"}, {"AVATAR_ASSET_HOSTS": "*.r2.cloudflarestorage.com"},
                      {"AVATAR_ASSET_HOSTS": "https://" + HOST}, {"AVATAR_RENDER_PORT": "0"},
                      {"AVATAR_MAX_INTRO_SECONDS": "61"}, {"AVATAR_MAX_WAITING_JOBS": "0"},
                      {"AVATAR_MAX_RETAINED_JOBS": "10001"}]:
            with self.subTest(value=value), patch.dict(os.environ, {**base, **value}, clear=True), self.assertRaises(ValueError):
                worker.Config.from_env()

    def test_readiness_requires_executables_and_every_local_checkpoint_not_only_folder(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = worker.Config(token="x" * 40, work_dir=root / "jobs", asset_hosts=frozenset({HOST}),
                                   sadtalker_root=root, sadtalker_python="configured-python")
            with patch.object(worker.shutil, "which", return_value="/configured/tool"):
                self.assertFalse(config.capabilities()["render"])
                self.assertEqual(config.readiness()["status"], "setup_required")
                for path in ["inference.py", "checkpoints/SadTalker_V0.0.2_256.safetensors", "checkpoints/mapping_00229-model.pth.tar",
                             "gfpgan/weights/alignment_WFLW_4HG.pth", "gfpgan/weights/detection_Resnet50_Final.pth"]:
                    target = root / path
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(b"test-presence-only-not-models")
                self.assertTrue(config.capabilities()["render"])
                readiness = config.readiness()
                self.assertEqual(readiness["status"], "configured")
                self.assertFalse(readiness["verifiedInference"])
                self.assertNotIn(str(root), json.dumps(readiness))
            with patch.object(worker.shutil, "which", return_value=None):
                self.assertFalse(config.capabilities()["render"])
                self.assertFalse(config.readiness()["checks"]["sadtalkerPython"])

    def test_optional_speech_requires_local_models_and_never_claims_hinglish_tts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = worker.Config(token="x" * 40, work_dir=root, asset_hosts=frozenset({HOST}),
                                   sadtalker_root=root, sadtalker_python="", tts_python="python", stt_python="python",
                                   tts_model_dir=str(root), stt_model_dir=str(root))
            with patch.object(worker.shutil, "which", return_value="/configured/tool"):
                self.assertFalse(config.capabilities()["tts"])
                self.assertFalse(config.capabilities()["stt"])
                for name in ["ve.pt", "s3gen.pt", "t3_mtl23ls_v2.safetensors", "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "model.bin"]:
                    (root / name).write_bytes(b"test-presence-only")
                self.assertTrue(config.capabilities()["tts"])
                self.assertTrue(config.capabilities()["stt"])
                self.assertEqual(config.capabilities()["ttsLanguages"], ["en", "hi"])
                self.assertIn("hinglish", config.capabilities()["sttLanguages"])


if __name__ == "__main__":
    unittest.main()
