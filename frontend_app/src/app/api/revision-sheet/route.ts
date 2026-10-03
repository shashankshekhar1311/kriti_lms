import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";
import { displayLabel } from "@/lib/utils";
import type { RevisionDiagram, RevisionSheetPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Prefer well-known textbook diagrams suitable for labeling practice. */
const PREFERRED_DIAGRAM_IDS = [
  "p33_rain_gauge_diagram",
  "p32_max_min_thermometer",
  "p28_layers_of_atmosphere",
  "p35_aneroid_barometer",
  "p37_cup_anemometer",
  "p37_wind_sock_airport",
  "p39_automated_weather_station",
  "p34_atmospheric_pressure_elevation",
  "p40_imd_weather_warning_map",
];

function findArtifact(
  chapterAbs: string,
  chapterRel: string,
  artifactId: string
): string | undefined {
  const exts = [".webp", ".jpg", ".png"];
  for (const ext of exts) {
    const abs = path.join(chapterAbs, "artifacts", `${artifactId}${ext}`);
    if (fs.existsSync(abs)) {
      return `${chapterRel}/artifacts/${artifactId}${ext}`;
    }
  }
  return undefined;
}

function collectDiagrams(
  chapterAbs: string,
  chapterRel: string
): RevisionDiagram[] {
  const diagrams: RevisionDiagram[] = [];
  const used = new Set<string>();

  // Prefer curated diagram IDs
  for (const id of PREFERRED_DIAGRAM_IDS) {
    if (diagrams.length >= 4) break;
    const artifactPath = findArtifact(chapterAbs, chapterRel, id);
    if (!artifactPath) continue;
    used.add(id);
    diagrams.push({
      id,
      title: displayLabel(id.replace(/^p\d+_/, "")),
      artifactPath,
      callouts: ["(a)", "(b)", "(c)"],
      answers: [
        "Label the main instrument / feature shown",
        "Name one labeled part of the diagram",
        "State the SI unit or measurement purpose",
      ],
    });
  }

  // Fill from concept_card artifacts in storyboards
  if (diagrams.length < 4) {
    try {
      const dirs = fs.readdirSync(chapterAbs).filter((d) => d.startsWith("Micro_Lesson"));
      for (const dir of dirs) {
        if (diagrams.length >= 4) break;
        const sb = path.join(chapterAbs, dir, "storyboard.json");
        if (!fs.existsSync(sb)) continue;
        const data = JSON.parse(fs.readFileSync(sb, "utf-8"));
        for (const panel of data.panels || []) {
          if (diagrams.length >= 4) break;
          if (panel.type !== "concept_card" || !panel.artifact_id) continue;
          if (used.has(panel.artifact_id)) continue;
          const artifactPath = findArtifact(chapterAbs, chapterRel, panel.artifact_id);
          if (!artifactPath) continue;
          used.add(panel.artifact_id);
          const items = (panel.items || []).slice(0, 3);
          diagrams.push({
            id: panel.artifact_id,
            title: panel.title || displayLabel(panel.artifact_id),
            artifactPath,
            callouts: ["(a)", "(b)", "(c)"],
            answers: items.length
              ? items
              : ["Main concept", "Key part", "Exam-relevant fact"],
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return diagrams;
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function collectWrittenQuestions(chapterAbs: string): RevisionSheetPayload["questions"] {
  const file = path.join(chapterAbs, "written_prep.json");
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"));
    const qs = Array.isArray(data.questions) ? [...data.questions] : [];
    if (qs.length === 0) return [];

    // Shuffle full chapter bank, then take 5 so each download is a fresh practice set
    shuffleInPlace(qs);
    return qs.slice(0, 5).map((q: { id: string; marks: number; question: string; archetype: string }) => ({
      id: q.id,
      marks: q.marks,
      question: q.question,
      archetype: q.archetype,
    }));
  } catch {
    return [];
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

  const parts = chapterRel.split("/");
  const classLabel = displayLabel(parts[0] || "Class");
  const subjectLabel = displayLabel(parts[1] || "Subject");
  const chapterName = displayLabel(path.basename(absoluteChapterDir));

  const origin = request.nextUrl.origin;
  const selfCheckUrl = `${origin}/?chapter=${encodeURIComponent(chapterRel)}&mode=exam_prep&written=1`;

  const payload: RevisionSheetPayload = {
    chapterPath: chapterRel,
    chapterName,
    classLabel,
    subjectLabel,
    diagrams: collectDiagrams(absoluteChapterDir, chapterRel),
    questions: collectWrittenQuestions(absoluteChapterDir),
    selfCheckUrl,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(payload);
}
