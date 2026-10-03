"""
Batch-render Remotion micro-lesson videos for a Social Science chapter.

Usage (from repo root):
  python scripts/render_chapter_lessons.py --chapter 3
  python scripts/render_chapter_lessons.py --chapter 10
  python scripts/render_chapter_lessons.py --chapter 3 --only 1
  python scripts/render_chapter_lessons.py --chapter 3 --from 4
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
REMOTION_DIR = BASE_DIR / "remotion"
REMOTION_PUBLIC_DIR = REMOTION_DIR / "public"
# System/Winget FFmpeg copy — Remotion's bundled compositor is blocked by
# Windows Application Control on this machine (spawn UNKNOWN).
REMOTION_FFMPEG_BIN = REMOTION_DIR / "ffmpeg-bin"
CHAPTER_ROOT = (
    BASE_DIR / "Rendered_Output" / "Class-7" / "SocialScience-Part1-Class-7"
)


def sync_assets(lesson_dir: Path, chapter_dir: Path, props: dict) -> None:
    # Backgrounds
    for ev in props.get("visual_events", []) or []:
        bg = ev.get("bg_image_url")
        if bg and (lesson_dir / bg).is_file():
            shutil.copy2(lesson_dir / bg, REMOTION_PUBLIC_DIR / bg)

    # Lesson + chapter artifacts
    dest_art = REMOTION_PUBLIC_DIR / "artifacts"
    dest_art.mkdir(parents=True, exist_ok=True)
    for art_root in (lesson_dir / "artifacts", chapter_dir / "artifacts"):
        if not art_root.is_dir():
            continue
        for f in art_root.glob("*.*"):
            shutil.copy2(f, dest_art / f.name)

    # Also honor explicit artifact_image_url paths
    for ev in props.get("visual_events", []) or []:
        art = ev.get("artifact_image_url")
        if not art:
            continue
        src = lesson_dir / art
        if not src.is_file():
            src = chapter_dir / art
        if src.is_file():
            dest = REMOTION_PUBLIC_DIR / art
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)

    # Beat audios
    for clip in props.get("mascot_clips", []) or []:
        aud = clip.get("audio_url")
        if aud and (lesson_dir / aud).is_file():
            shutil.copy2(lesson_dir / aud, REMOTION_PUBLIC_DIR / aud)

    narr = props.get("narration_audio_url")
    if narr and (lesson_dir / narr).is_file():
        shutil.copy2(lesson_dir / narr, REMOTION_PUBLIC_DIR / narr)


def render_lesson(
    lesson_num: int,
    total: int,
    chapter_dir: Path,
    npx: str,
    concurrency: int = 2,
) -> str:
    lesson_dir = chapter_dir / f"Micro_Lesson_{lesson_num}"
    props_file = lesson_dir / "props.json"
    output_mp4 = lesson_dir / "output.mp4"

    if not props_file.is_file():
        return "Missing props.json"

    props = json.loads(props_file.read_text(encoding="utf-8"))
    title = props.get("lesson_title", f"Lesson {lesson_num}")
    timeline = props.get("narration_timeline") or [{}]
    dur = float(timeline[-1].get("end_time", 0) or 0)
    student = props.get("student_name", "Student")

    print("\n" + "=" * 65)
    print(f"🎥 Rendering Lesson {lesson_num}/{total}: {title}")
    print(f"   Student: {student} | Duration: {dur:.1f}s")
    print(f"   Destination: {output_mp4}")
    print("=" * 65)

    sync_assets(lesson_dir, chapter_dir, props)

    cmd = [
        npx,
        "remotion",
        "render",
        "ComicLesson",
        str(output_mp4.resolve()),
        f"--props={props_file.resolve()}",
        f"--concurrency={max(1, concurrency)}",
        "--scale=0.75",
        "--timeout=600000",
    ]
    if REMOTION_FFMPEG_BIN.is_dir() and (REMOTION_FFMPEG_BIN / "ffmpeg.exe").is_file():
        cmd.append(f"--binaries-directory={REMOTION_FFMPEG_BIN.resolve()}")

    t0 = time.time()
    proc = subprocess.Popen(
        cmd,
        cwd=str(REMOTION_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    last_report = time.time()
    while True:
        line = proc.stdout.readline() if proc.stdout else ""
        if not line and proc.poll() is not None:
            break
        if not line:
            continue
        clean = line.strip()
        low = clean.lower()
        if any(k in low for k in ("render", "bundle", "frame", "comp", "done", "error", "warn")):
            if "rendered" in low:
                if time.time() - last_report >= 8:
                    print(f"   [Progress] {clean}", flush=True)
                    last_report = time.time()
            else:
                print(f"   {clean}", flush=True)

    proc.wait()
    elapsed = time.time() - t0

    if proc.returncode == 0 and output_mp4.is_file() and output_mp4.stat().st_size > 1_000_000:
        mb = output_mp4.stat().st_size / (1024 * 1024)
        msg = f"Success ({mb:.2f} MB, {elapsed/60:.1f} min)"
        print(f"✅ Successfully rendered Lesson {lesson_num} in {elapsed/60:.1f} mins ({mb:.2f} MB)")
        return msg

    print(f"❌ Failed rendering Lesson {lesson_num} (code {proc.returncode})")
    return f"Failed (exit {proc.returncode})"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--chapter", required=True, help="Chapter number, e.g. 3 or 10")
    parser.add_argument("--only", type=int)
    parser.add_argument("--from", dest="from_lesson", type=int, default=1)
    parser.add_argument("--to", dest="to_lesson", type=int, default=6)
    parser.add_argument("--concurrency", type=int, default=2)
    args = parser.parse_args()

    ch = str(args.chapter).strip()
    if ch.isdigit():
        chapter_name = f"Chapter-{int(ch)}"
    elif ch.lower().startswith("chapter-"):
        chapter_name = f"Chapter-{ch.split('-', 1)[1]}"
    else:
        chapter_name = ch

    chapter_dir = CHAPTER_ROOT / chapter_name
    if not chapter_dir.is_dir():
        raise SystemExit(f"Chapter directory not found: {chapter_dir}")

    npx = shutil.which("npx")
    if not npx:
        raise SystemExit("npx not found in PATH")

    start_n = args.only or args.from_lesson
    end_n = args.only or args.to_lesson
    lessons = list(range(start_n, end_n + 1))
    total = len(lessons)

    print(f"🎬 Starting Remotion batch render for {chapter_name}")
    print(f"   Lessons: {lessons}")
    print(f"   Concurrency: {args.concurrency}")
    print(f"   Output: {chapter_dir}")

    overall = time.time()
    results: dict[int, str] = {}
    for lesson_num in lessons:
        results[lesson_num] = render_lesson(
            lesson_num, total, chapter_dir, npx, concurrency=args.concurrency
        )

    print("\n" + "#" * 65)
    print(f"🎉 {chapter_name} render pass done in {(time.time()-overall)/60:.1f} mins")
    for k, v in results.items():
        print(f"  Lesson {k}: {v}")
    print("#" * 65)

    failed = [k for k, v in results.items() if not str(v).startswith("Success")]
    if failed:
        raise SystemExit(f"Failed lessons: {failed}")


if __name__ == "__main__":
    main()
