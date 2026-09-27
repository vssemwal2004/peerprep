"""Optional isolated model process. Called only with worker-created local files."""
import json
import os
from pathlib import Path
import sys

# Must be set before imports. Never download weights at request time.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["CUDA_VISIBLE_DEVICES"] = ""


def main():
    if len(sys.argv) != 4 or sys.argv[1] not in {"tts", "stt"}:
        raise ValueError("Invalid helper command")
    mode, request_path, output_path = sys.argv[1:]
    request = json.loads(Path(request_path).read_text(encoding="utf-8"))
    model_dir = Path(request["modelDir"]).resolve(strict=True)
    if mode == "tts":
        if request["language"] not in {"en", "hi"}:
            raise ValueError("Unsupported TTS language")
        import torch
        import torchaudio
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        torch.set_num_threads(2)
        model = ChatterboxMultilingualTTS.from_local(model_dir, device="cpu")
        audio = model.generate(request["text"], language_id=request["language"])
        # Explicit format because the internal output filename is audio.bin.
        torchaudio.save(output_path, audio, model.sr, format="wav")
    else:
        from faster_whisper import WhisperModel
        model = WhisperModel(str(model_dir), device="cpu", compute_type="int8",
                             cpu_threads=2, num_workers=1, local_files_only=True)
        language = None if request["language"] == "hinglish" else request["language"]
        segments, _info = model.transcribe(request["audio"], language=language,
                                          beam_size=1, vad_filter=True)
        parts = []
        count = 0
        for segment in segments:
            count += len(segment.text)
            if count > 2000:
                raise ValueError("Transcription too long")
            parts.append(segment.text.strip())
        Path(output_path).write_text(json.dumps({"text": " ".join(parts)}, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Model errors can include paths and credentials; the parent uses a safe message.
        raise SystemExit(1) from None
