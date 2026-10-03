import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";
import { normalizeQuizPayload } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  if (!relativePath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  let absolute: string;
  try {
    absolute = resolveUnderRenderedOutput(relativePath);
  } catch {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
  }

  try {
    const raw = fs.readFileSync(absolute, "utf-8");
    const quiz = normalizeQuizPayload(JSON.parse(raw));
    return NextResponse.json(quiz);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read quiz";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
