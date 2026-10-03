import { NextResponse } from "next/server";
import { scanCurriculum } from "@/lib/curriculum";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tree = scanCurriculum();
    return NextResponse.json(tree);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
