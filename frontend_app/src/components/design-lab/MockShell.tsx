"use client";

import { SoftStudioShell } from "./SoftStudioShell";
import { TheaterShell } from "./TheaterShell";
import { WarmAcademicShell } from "./WarmAcademicShell";
import type { ThemeId } from "./themes";

/** Routes to three structurally different prototypes. */
export function MockShell({ themeId }: { themeId: ThemeId }) {
  if (themeId === "theater") return <TheaterShell />;
  if (themeId === "warm") return <WarmAcademicShell />;
  return <SoftStudioShell />;
}
