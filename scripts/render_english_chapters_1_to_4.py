"""Sequentially prepare+render English-Poorvi chapters via Chapter_Agent."""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = ROOT / "temp"
LOG_DIR.mkdir(exist_ok=True)

CHAPTERS = [1, 2, 3, 4]


def run_chapter(chapter: int) -> int:
    log_path = LOG_DIR / f"english_ch{chapter}_render.log"
    cmd = [
        sys.executable,
        str(ROOT / "Chapter_Agent.py"),
        "--grade",
        "Class-7",
        "--subject",
        "English-Poorvi",
        "--chapter",
        str(chapter),
        "--provider",
        "gemini",
        "--mascot",
        "gyanu",
        "--student-name",
        "Saanvi",
    ]
    print(f"\n{'=' * 70}", flush=True)
    print(f"Starting English Chapter-{chapter}", flush=True)
    print(f"Log: {log_path}", flush=True)
    print("=" * 70, flush=True)

    t0 = time.time()
    with open(log_path, "w", encoding="utf-8") as log:
        log.write(f"CMD: {' '.join(cmd)}\n\n")
        log.flush()
        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env={
                **dict(**{k: v for k, v in __import__("os").environ.items()}),
                "PYTHONPATH": str(ROOT),
                "PYTHONIOENCODING": "utf-8",
                "PYTHONUTF8": "1",
                "KRITI_PREPARE_PROVIDER": "gemini",
            },
        )
        assert proc.stdout is not None
        for line in proc.stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
            log.write(line)
            log.flush()
        code = proc.wait()

    elapsed = (time.time() - t0) / 60
    status = "OK" if code == 0 else f"FAILED({code})"
    print(f"\nChapter-{chapter} finished: {status} in {elapsed:.1f} min", flush=True)
    return code


def main() -> int:
    results: dict[int, int] = {}
    for ch in CHAPTERS:
        results[ch] = run_chapter(ch)
        if results[ch] != 0:
            print(f"Stopping after Chapter-{ch} failure.", flush=True)
            break
        print("Cooldown 15s before next chapter...", flush=True)
        time.sleep(15)

    print("\n" + "#" * 70)
    for ch, code in results.items():
        print(f"  Chapter-{ch}: {'SUCCESS' if code == 0 else f'FAILED ({code})'}")
    print("#" * 70)
    return 0 if all(c == 0 for c in results.values()) and len(results) == 4 else 1


if __name__ == "__main__":
    raise SystemExit(main())
