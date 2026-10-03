import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";
import { displayLabel } from "@/lib/utils";
import type { ConceptFlashcard } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StoryboardPanel {
  type?: string;
  title?: string;
  items?: string[];
  artifact_id?: string;
  visual_mode?: string;
}

function findArtifactRelative(
  chapterAbs: string,
  chapterRel: string,
  artifactId: string
): string | undefined {
  const candidates = [
    path.join(chapterAbs, "artifacts", `${artifactId}.webp`),
    path.join(chapterAbs, "artifacts", `${artifactId}.jpg`),
    path.join(chapterAbs, "artifacts", `${artifactId}.png`),
  ];

  // Also scan micro-lesson artifact folders
  try {
    for (const d of fs.readdirSync(chapterAbs)) {
      if (!d.startsWith("Micro_Lesson")) continue;
      candidates.push(
        path.join(chapterAbs, d, "artifacts", `${artifactId}.webp`),
        path.join(chapterAbs, d, "artifacts", `${artifactId}.jpg`)
      );
    }
  } catch {
    // ignore
  }

  for (const abs of candidates) {
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const rel = path.relative(chapterAbs, abs).split(path.sep).join("/");
      return `${chapterRel}/${rel}`;
    }
  }
  return undefined;
}

function pickTrickQuestion(
  quizPath: string,
  cardTitle: string,
  bullets: string[]
): { question: string; answer?: string } {
  try {
    if (!fs.existsSync(quizPath)) {
      return {
        question: `Exam tip: Can you explain "${cardTitle}" in your own words without looking at the card?`,
      };
    }
    const quiz = JSON.parse(fs.readFileSync(quizPath, "utf-8"));
    const pool: Array<{
      question?: string;
      explanation?: string;
      correct_answer?: string;
      correct_answers?: string[];
      options?: string[];
    }> = Array.isArray(quiz.item_pool) ? quiz.item_pool : [];

    if (pool.length === 0) {
      return {
        question: `True or False: ${bullets[0] || cardTitle}`,
        answer: bullets[0] ? "True — as stated in the lesson concept." : undefined,
      };
    }

    const keywords = `${cardTitle} ${bullets.join(" ")}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);

    let best = pool[0];
    let bestScore = -1;
    for (const item of pool) {
      const hay = `${item.question || ""} ${item.explanation || ""}`.toLowerCase();
      const score = keywords.filter((k) => hay.includes(k)).length;
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }

    const answer =
      best.correct_answer ||
      (Array.isArray(best.correct_answers) ? best.correct_answers.join("; ") : undefined) ||
      best.explanation;

    return {
      question: best.question || `Recall: What are the key points of "${cardTitle}"?`,
      answer: answer ? String(answer).slice(0, 280) : undefined,
    };
  } catch {
    return {
      question: `Exam tip: List 3 points about "${cardTitle}" as you would write them in a 2-mark answer.`,
    };
  }
}

export async function GET(request: NextRequest) {
  const rawPath =
    request.nextUrl.searchParams.get("chapterPath") ||
    request.nextUrl.searchParams.get("path");

  if (!rawPath) {
    return NextResponse.json({ error: "Missing chapterPath" }, { status: 400 });
  }

  let chapterRel = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (chapterRel.includes("Micro_Lesson")) {
    const parts = chapterRel.split("/");
    const mlIdx = parts.findIndex((p) => p.startsWith("Micro_Lesson"));
    if (mlIdx > 0) chapterRel = parts.slice(0, mlIdx).join("/");
  }

  let absoluteChapterDir: string;
  try {
    absoluteChapterDir = resolveUnderRenderedOutput(chapterRel);
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(absoluteChapterDir) || !fs.statSync(absoluteChapterDir).isDirectory()) {
    return NextResponse.json({ error: "Directory not found" }, { status: 404 });
  }

  const cards: ConceptFlashcard[] = [];

  let lessonDirs: string[] = [];
  try {
    lessonDirs = fs
      .readdirSync(absoluteChapterDir)
      .filter((d) => {
        const full = path.join(absoluteChapterDir, d);
        return fs.statSync(full).isDirectory() && d.startsWith("Micro_Lesson");
      })
      .sort((a, b) => {
        const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
        return na - nb;
      });
  } catch {
    lessonDirs = [];
  }

  for (const dirName of lessonDirs) {
    const lessonAbs = path.join(absoluteChapterDir, dirName);
    const lessonRel = `${chapterRel}/${dirName}`;
    const storyboardFile = path.join(lessonAbs, "storyboard.json");
    if (!fs.existsSync(storyboardFile)) continue;

    let panels: StoryboardPanel[] = [];
    try {
      const data = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));
      panels = Array.isArray(data.panels) ? data.panels : [];
    } catch {
      continue;
    }

    const quizFile = path.join(lessonAbs, "quiz.json");
    let cardIndex = 0;

    for (const panel of panels) {
      if (panel.type !== "concept_card" || !panel.title) continue;
      cardIndex += 1;
      const bullets = (panel.items || []).slice(0, 3).map((s) => String(s).trim()).filter(Boolean);
      const trick = pickTrickQuestion(quizFile, panel.title, panel.items || []);
      const artifactPath = panel.artifact_id
        ? findArtifactRelative(absoluteChapterDir, chapterRel, panel.artifact_id)
        : undefined;

      cards.push({
        id: `${dirName}_card_${cardIndex}`,
        title: panel.title,
        bullets:
          bullets.length >= 3
            ? bullets
            : [
                ...bullets,
                ...Array.from({ length: Math.max(0, 3 - bullets.length) }, (_, i) =>
                  `Key idea ${bullets.length + i + 1} from ${panel.title}`
                ),
              ].slice(0, 3),
        trickQuestion: trick.question,
        trickAnswer: trick.answer,
        artifactPath,
        lessonPath: lessonRel,
        lessonName: displayLabel(dirName),
      });
    }
  }

  return NextResponse.json({
    chapterPath: chapterRel,
    chapterName: displayLabel(path.basename(absoluteChapterDir)),
    totalCount: cards.length,
    cards,
  });
}
