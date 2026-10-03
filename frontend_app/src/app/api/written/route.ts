import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";
import { displayLabel } from "@/lib/utils";
import type { SubjectiveQuestion } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rawPath =
    request.nextUrl.searchParams.get("chapterPath") ||
    request.nextUrl.searchParams.get("lessonPath") ||
    request.nextUrl.searchParams.get("path");

  if (!rawPath) {
    return NextResponse.json(
      { error: "Missing chapterPath or lessonPath" },
      { status: 400 }
    );
  }

  let relPath = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const isLessonRequest = relPath.includes("Micro_Lesson");

  let chapterRelPath = relPath;
  if (isLessonRequest) {
    const parts = relPath.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    if (mlIdx > 0) {
      chapterRelPath = parts.slice(0, mlIdx).join("/");
    }
  }

  let absoluteChapterDir: string;
  try {
    absoluteChapterDir = resolveUnderRenderedOutput(chapterRelPath);
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(absoluteChapterDir) || !fs.statSync(absoluteChapterDir).isDirectory()) {
    return NextResponse.json({ error: "Directory not found" }, { status: 404 });
  }

  const allQuestions: SubjectiveQuestion[] = [];

  // 1. Check chapter-level written_prep.json
  const chapterWrittenFile = path.join(absoluteChapterDir, "written_prep.json");
  if (fs.existsSync(chapterWrittenFile)) {
    try {
      const raw = fs.readFileSync(chapterWrittenFile, "utf-8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.questions)) {
        allQuestions.push(...data.questions);
      }
    } catch {
      // Ignore parse failure and continue
    }
  }

  // 2. Check micro-lesson directories for additional written_prep.json files
  try {
    const subdirs = fs.readdirSync(absoluteChapterDir).filter((d) => {
      const full = path.join(absoluteChapterDir, d);
      return fs.statSync(full).isDirectory() && d.startsWith("Micro_Lesson");
    });

    for (const dirName of subdirs) {
      const lessonFile = path.join(absoluteChapterDir, dirName, "written_prep.json");
      if (fs.existsSync(lessonFile)) {
        try {
          const raw = fs.readFileSync(lessonFile, "utf-8");
          const data = JSON.parse(raw);
          if (Array.isArray(data.questions)) {
            // Avoid duplicate question IDs
            for (const q of data.questions) {
              if (!allQuestions.some((existing) => existing.id === q.id)) {
                allQuestions.push(q);
              }
            }
          }
        } catch {
          // Continue
        }
      }
    }
  } catch {
    // Continue
  }

  // Filter if specifically requested for a single micro-lesson
  let filtered = allQuestions;
  if (isLessonRequest) {
    const matching = allQuestions.filter(
      (q) => q.lessonPath && q.lessonPath.replace(/\\/g, "/") === relPath
    );
    if (matching.length > 0) {
      filtered = matching;
    }
  }

  return NextResponse.json({
    chapterPath: chapterRelPath,
    chapterName: displayLabel(path.basename(absoluteChapterDir)),
    totalCount: filtered.length,
    questions: filtered,
  });
}
