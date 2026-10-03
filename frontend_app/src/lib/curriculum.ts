import fs from "fs";
import path from "path";
import {
  RENDERED_OUTPUT_ROOT,
  toPosixRelative,
} from "@/lib/paths";
import type {
  ChapterMeta,
  ClassMeta,
  CurriculumTree,
  MicroLessonMeta,
  SubjectMeta,
} from "@/lib/types";

type ChapterCatalogBook = {
  display_name?: string;
  textbook?: string;
  chapters?: Record<string, string>;
};

type ChapterCatalog = {
  books?: Record<string, ChapterCatalogBook>;
};

let cachedCatalog: ChapterCatalog | null = null;

function loadChapterCatalog(): ChapterCatalog {
  if (cachedCatalog) return cachedCatalog;
  const candidates = [
    path.resolve(process.cwd(), "..", "config", "chapter_catalog.json"),
    path.resolve(process.cwd(), "config", "chapter_catalog.json"),
    path.resolve(__dirname, "..", "..", "..", "config", "chapter_catalog.json"),
  ];
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      cachedCatalog = JSON.parse(
        fs.readFileSync(candidate, "utf-8")
      ) as ChapterCatalog;
      return cachedCatalog;
    } catch {
      // try next candidate
    }
  }
  cachedCatalog = { books: {} };
  return cachedCatalog;
}

function catalogBook(bookPath: string): ChapterCatalogBook | null {
  const books = loadChapterCatalog().books || {};
  return books[bookPath] || null;
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function listDirs(dir: string): string[] {
  if (!isDir(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "__pycache__")
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function microLessonIndex(name: string): number {
  const match = name.match(/Micro_Lesson_(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function scanMicroLesson(absoluteDir: string): MicroLessonMeta | null {
  const name = path.basename(absoluteDir);
  if (!/^Micro_Lesson_\d+$/i.test(name)) return null;

  const files = fs.readdirSync(absoluteDir);
  const videoFile =
    files.find((f) => /^Micro_Lesson_\d+_Video\.mp4$/i.test(f)) ||
    files.find((f) => f.toLowerCase().endsWith(".mp4"));
  const quizFile = files.find((f) => f.toLowerCase() === "quiz.json");
  const narrationFile = files.find((f) => f.toLowerCase() === "narration.txt");
  const interactiveFile = files.find(
    (f) => f.toLowerCase() === "interactive_module.json"
  );

  const rel = toPosixRelative(RENDERED_OUTPUT_ROOT, absoluteDir);

  return {
    id: rel,
    name: name.replace(/_/g, " "),
    index: microLessonIndex(name),
    path: rel,
    hasVideo: Boolean(videoFile),
    hasQuiz: Boolean(quizFile),
    hasNarration: Boolean(narrationFile),
    hasInteractiveModule: Boolean(interactiveFile),
    videoPath: videoFile
      ? toPosixRelative(RENDERED_OUTPUT_ROOT, path.join(absoluteDir, videoFile))
      : null,
    quizPath: quizFile
      ? toPosixRelative(RENDERED_OUTPUT_ROOT, path.join(absoluteDir, quizFile))
      : null,
    narrationPath: narrationFile
      ? toPosixRelative(RENDERED_OUTPUT_ROOT, path.join(absoluteDir, narrationFile))
      : null,
    interactiveModulePath: interactiveFile
      ? toPosixRelative(
          RENDERED_OUTPUT_ROOT,
          path.join(absoluteDir, interactiveFile)
        )
      : null,
  };
}

function scanChapter(absoluteDir: string, bookPath: string): ChapterMeta {
  const folderName = path.basename(absoluteDir);
  const rel = toPosixRelative(RENDERED_OUTPUT_ROOT, absoluteDir);
  const microLessons = listDirs(absoluteDir)
    .map((dirName) => scanMicroLesson(path.join(absoluteDir, dirName)))
    .filter((m): m is MicroLessonMeta => m !== null)
    .sort((a, b) => a.index - b.index);

  const book = catalogBook(bookPath);
  const title = book?.chapters?.[folderName]?.trim() || null;

  return {
    id: rel,
    name: folderName.replace(/-/g, " "),
    title,
    path: rel,
    microLessons,
  };
}

function scanSubject(absoluteDir: string, className: string): SubjectMeta {
  const name = path.basename(absoluteDir);
  const rel = toPosixRelative(RENDERED_OUTPUT_ROOT, absoluteDir);
  const bookPath = `${className}/${name}`;
  const book = catalogBook(bookPath);
  const chapters = listDirs(absoluteDir)
    .filter((d) => /^Chapter/i.test(d) || true)
    .map((dirName) =>
      scanChapter(path.join(absoluteDir, dirName), bookPath)
    )
    .filter((c) => c.microLessons.length > 0);

  return {
    id: rel,
    name: name.replace(/-/g, " "),
    displayName: book?.display_name?.trim() || null,
    path: rel,
    chapters,
  };
}

function scanClass(absoluteDir: string): ClassMeta {
  const name = path.basename(absoluteDir);
  const rel = toPosixRelative(RENDERED_OUTPUT_ROOT, absoluteDir);
  const subjects = listDirs(absoluteDir)
    .map((dirName) =>
      scanSubject(path.join(absoluteDir, dirName), name)
    )
    .filter((s) => s.chapters.length > 0);

  return {
    id: rel,
    name: name.replace(/-/g, " "),
    path: rel,
    subjects,
  };
}

export function scanCurriculum(): CurriculumTree {
  if (!isDir(RENDERED_OUTPUT_ROOT)) {
    return { root: RENDERED_OUTPUT_ROOT, classes: [] };
  }

  const classes = listDirs(RENDERED_OUTPUT_ROOT)
    .map((dirName) => scanClass(path.join(RENDERED_OUTPUT_ROOT, dirName)))
    .filter((c) => c.subjects.length > 0);

  return {
    root: RENDERED_OUTPUT_ROOT,
    classes,
  };
}

/**
 * Flatten micro-lessons in curriculum order.
 * Gating is subject-scoped (see DronaProgressStore.subjectScopedPaths);
 * the flat list is still used for browsing/stats.
 */
export function flattenMicroLessons(tree: CurriculumTree): MicroLessonMeta[] {
  const lessons: MicroLessonMeta[] = [];
  for (const cls of tree.classes) {
    for (const subject of cls.subjects) {
      for (const chapter of subject.chapters) {
        lessons.push(...chapter.microLessons);
      }
    }
  }
  return lessons;
}
