import json
import sys


def main():
    payload = json.load(sys.stdin)
    namespace = {"__name__": "peerprep_validation"}
    source = payload["source"].encode("utf-8", errors="replace").decode("utf-8")
    exec(compile(source, "<peerprep-reference>", "exec"), namespace)
    execute = namespace["_pp_execute"]
    json.dump([execute(value) for value in payload["inputs"]], sys.stdout)


if __name__ == "__main__":
    main()
