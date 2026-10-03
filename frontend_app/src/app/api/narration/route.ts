import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";

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
    return NextResponse.json({ error: "Narration not found" }, { status: 404 });
  }

  const text = fs.readFileSync(absolute, "utf-8");
  return NextResponse.json({ text });
}
