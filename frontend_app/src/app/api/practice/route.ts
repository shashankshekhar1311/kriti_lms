import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { RENDERED_OUTPUT_ROOT, resolveUnderRenderedOutput, toPosixRelative } from "@/lib/paths";
import { normalizeQuizPayload, displayLabel } from "@/lib/utils";
import type { ChapterPracticeItem, PracticeMode } from "@/lib/types";

export const dynamic = "force-dynamic";

function extractMicroLessonIndex(dirName: string): number {
  const match = dirName.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

export async function GET(request: NextRequest) {
  const rawPath = request.nextUrl.searchParams.get("chapterPath") || request.nextUrl.searchParams.get("path");
  const mode = (request.nextUrl.searchParams.get("mode") || "workout") as PracticeMode;
  const countParam = request.nextUrl.searchParams.get("count");

  if (!rawPath) {
    return NextResponse.json({ error: "Missing chapterPath or path parameter" }, { status: 400 });
  }

  let chapterRelPath = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  // If a micro-lesson path was passed (e.g. Class-7/.../Chapter-2/Micro_Lesson_1), get chapter path
  if (chapterRelPath.includes("Micro_Lesson")) {
    const parts = chapterRelPath.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    if (mlIdx > 0) {
      chapterRelPath = parts.slice(0, mlIdx).join("/");
    }
  }

  let absoluteChapterDir: string;
  try {
    absoluteChapterDir = resolveUnderRenderedOutput(chapterRelPath);
  } catch {
    return NextResponse.json({ error: "Invalid chapter path" }, { status: 400 });
  }

  if (!fs.existsSync(absoluteChapterDir) || !fs.statSync(absoluteChapterDir).isDirectory()) {
    return NextResponse.json({ error: "Chapter directory not found" }, { status: 404 });
  }

  // Scan all micro-lesson subdirectories
  let subdirs: string[] = [];
  try {
    subdirs = fs
      .readdirSync(absoluteChapterDir)
      .filter((entry) => {
        const full = path.join(absoluteChapterDir, entry);
        return fs.statSync(full).isDirectory();
      })
      .sort((a, b) => extractMicroLessonIndex(a) - extractMicroLessonIndex(b));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to read chapter directory";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const allItems: ChapterPracticeItem[] = [];

  for (const dirName of subdirs) {
    const quizFile = path.join(absoluteChapterDir, dirName, "quiz.json");
    if (!fs.existsSync(quizFile)) continue;

    try {
      const raw = fs.readFileSync(quizFile, "utf-8");
      const normalized = normalizeQuizPayload(JSON.parse(raw));
      const lessonIndex = extractMicroLessonIndex(dirName);
      const lessonRelPath = toPosixRelative(RENDERED_OUTPUT_ROOT, path.join(absoluteChapterDir, dirName));
      const lessonName = `Micro Lesson ${lessonIndex}`;

      for (const item of normalized.item_pool) {
        allItems.push({
          ...item,
          lessonPath: lessonRelPath,
          lessonName,
          lessonIndex,
        });
      }
    } catch {
      // Continue reading other lessons if one has a malformed quiz
    }
  }

  if (allItems.length === 0) {
    return NextResponse.json(
      {
        chapterPath: chapterRelPath,
        chapterName: displayLabel(path.basename(absoluteChapterDir)),
        totalAvailable: 0,
        mode,
        questions: [],
      },
      { status: 200 }
    );
  }

  // Sample questions based on requested mode
  let questions: ChapterPracticeItem[] = [];

  if (mode === "all") {
    questions = allItems;
  } else if (mode === "mock") {
    // 10 diagnostic questions covering multiple lessons
    const targetCount = countParam ? Math.max(1, parseInt(countParam, 10)) : 10;
    const shuffled = [...allItems].sort(() => Math.random() - 0.5);
    questions = shuffled.slice(0, Math.min(targetCount, shuffled.length));
  } else {
    // mode === "workout" (5 balanced questions)
    const targetCount = countParam ? Math.max(1, parseInt(countParam, 10)) : 5;
    
    // Balance question types across lessons
    const byType: Record<string, ChapterPracticeItem[]> = {};
    for (const item of allItems) {
      if (!byType[item.type]) byType[item.type] = [];
      byType[item.type].push(item);
    }

    // Shuffle inside each type bucket
    for (const t of Object.keys(byType)) {
      byType[t].sort(() => Math.random() - 0.5);
    }

    const picked: ChapterPracticeItem[] = [];
    const types = Object.keys(byType).sort(() => Math.random() - 0.5);

    // Pick 1 from each available type first
    for (const t of types) {
      if (picked.length < targetCount && byType[t].length > 0) {
        const item = byType[t].pop();
        if (item) picked.push(item);
      }
    }

    // Fill remaining from remaining pool
    if (picked.length < targetCount) {
      const remaining = allItems
        .filter((item) => !picked.some((p) => p.id === item.id))
        .sort(() => Math.random() - 0.5);
      
      for (const item of remaining) {
        if (picked.length >= targetCount) break;
        picked.push(item);
      }
    }

    questions = picked;
  }

  return NextResponse.json({
    chapterPath: chapterRelPath,
    chapterName: displayLabel(path.basename(absoluteChapterDir)),
    totalAvailable: allItems.length,
    mode,
    questions,
  });
}
