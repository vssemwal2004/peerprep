"""Run a configured model script with Python network connections disabled.

This prevents facexlib/torch/hub helpers from downloading missing assets during a
request. It is not an OS sandbox: deploy the model process with restricted egress
and an unprivileged account as documented.
"""
import os
from pathlib import Path
import runpy
import socket
import sys


def blocked(*_args, **_kwargs):
    raise OSError("Model network access is disabled; provision local assets first.")


def main():
    if len(sys.argv) < 2:
        return 1
    target = Path(sys.argv[1]).resolve()
    socket.socket.connect = blocked
    socket.socket.connect_ex = blocked
    socket.create_connection = blocked
    socket.getaddrinfo = blocked
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    sys.argv = [str(target), *sys.argv[2:]]
    sys.path.insert(0, str(target.parent))
    try:
        runpy.run_path(str(target), run_name="__main__")
        return 0
    except Exception:
        # Parent worker returns a safe error; do not print paths or model input.
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
