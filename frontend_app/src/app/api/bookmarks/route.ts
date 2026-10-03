import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";
import type { ConceptBookmark, LessonDetailsPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 });
  }

  let dirPath: string;
  try {
    const resolved = resolveUnderRenderedOutput(relativePath);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      dirPath = resolved;
    } else {
      dirPath = path.dirname(resolved);
    }
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(dirPath)) {
    return NextResponse.json({ error: "Directory not found" }, { status: 404 });
  }

  const propsFile = path.join(dirPath, "props.json");
  const storyboardFile = path.join(dirPath, "storyboard.json");
  const timelineFile = path.join(dirPath, "narration_timeline.json");

  let lessonTitle = "";
  let studentName = "";
  const bookmarks: ConceptBookmark[] = [];

  if (fs.existsSync(propsFile)) {
    try {
      const raw = fs.readFileSync(propsFile, "utf-8");
      const props = JSON.parse(raw);
      lessonTitle = props.lesson_title || "";
      studentName = props.student_name || "";

      if (Array.isArray(props.visual_events)) {
        for (const ev of props.visual_events) {
          const ts = typeof ev.start_time === "number" ? ev.start_time : 0;
          const endTs = typeof ev.end_time === "number" ? ev.end_time : undefined;
          const title = ev.title || ev.caption || (ev.type ? String(ev.type).replace(/_/g, " ") : "Concept");
          bookmarks.push({
            timestamp: ts,
            endTime: endTs,
            title,
            type: ev.type,
            artifactId: ev.artifact_id,
            artifactImageUrl: ev.artifact_image_url,
          });
        }
      }
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback to storyboard.json if no bookmarks yet
  if (bookmarks.length === 0 && fs.existsSync(storyboardFile)) {
    try {
      const raw = fs.readFileSync(storyboardFile, "utf-8");
      const sb = JSON.parse(raw);
      lessonTitle = lessonTitle || sb.lesson_title || "";
      const panels = sb.panels || sb.visual_events || [];
      if (Array.isArray(panels)) {
        for (const p of panels) {
          bookmarks.push({
            timestamp: p.start_time ?? 0,
            endTime: p.end_time,
            title: p.title || p.caption || "Concept Beat",
            type: p.type,
            artifactId: p.artifact_id,
          });
        }
      }
    } catch {
      // Fall through
    }
  }

  // Fallback to narration_timeline.json if still empty
  if (bookmarks.length === 0 && fs.existsSync(timelineFile)) {
    try {
      const raw = fs.readFileSync(timelineFile, "utf-8");
      const tl = JSON.parse(raw);
      if (Array.isArray(tl)) {
        // Sample every few sentences or major pauses
        const step = Math.max(1, Math.floor(tl.length / 5));
        for (let i = 0; i < tl.length; i += step) {
          const cue = tl[i];
          if (cue && typeof cue.start_time === "number") {
            bookmarks.push({
              timestamp: cue.start_time,
              endTime: cue.end_time,
              title: cue.text ? cue.text.slice(0, 35) + "..." : `Part ${Math.floor(i / step) + 1}`,
            });
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  // Ensure unique timestamps and chronological order
  const seen = new Set<number>();
  const uniqueBookmarks: ConceptBookmark[] = [];
  bookmarks.sort((a, b) => a.timestamp - b.timestamp);

  for (const bm of bookmarks) {
    const rounded = Math.round(bm.timestamp * 10) / 10;
    if (!seen.has(rounded)) {
      seen.add(rounded);
      uniqueBookmarks.push({
        ...bm,
        timestamp: rounded,
      });
    }
  }

  const payload: LessonDetailsPayload = {
    lesson_title: lessonTitle,
    student_name: studentName,
    bookmarks: uniqueBookmarks,
  };

  return NextResponse.json(payload);
}
