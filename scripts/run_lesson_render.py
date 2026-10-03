import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config.env import load_env_file
load_env_file(Path(".env"))

import json
from Chapter_Agent import (
    _process_single_lesson,
    extract_pdf_text,
    RENDERED_OUTPUT_DIR,
    MASCOT_VOICES,
)

class_name = "Class-7"
subject_name = "SocialScience-Part1-Class-7"
chapter_name = "Chapter-2"
pdf_path = Path("Source_Books/Class-7/SocialScience-Part1-Class-7/Chapter-2.pdf")
chapter_output_dir = RENDERED_OUTPUT_DIR / class_name / subject_name / chapter_name

pdf_text = extract_pdf_text(pdf_path)
cache_file = chapter_output_dir / "generated_response.json"
lessons = json.loads(cache_file.read_text(encoding="utf-8"))

target_idx = int(sys.argv[1]) if len(sys.argv) > 1 else 0
lesson = lessons[target_idx]

mascot_name = "gyanu"
voice = MASCOT_VOICES.get(mascot_name.lower(), "en-US-AndrewMultilingualNeural")

print(f"🎬 Processing Lesson {target_idx + 1}: {lesson.get('lesson_title')}...")
output = _process_single_lesson(
    lesson=lesson,
    idx=target_idx,
    chapter_output_dir=chapter_output_dir,
    pdf_text=pdf_text,
    mascot_name=mascot_name,
    voice=voice,
    student_name="Saanvi",
    force_regen=False,
    provider="anthropic",
    class_name=class_name,
    subject_name=subject_name,
    chapter_name=chapter_name,
)
print(f"🏁 Finished Lesson {target_idx + 1}! Output: {output}")
