export type LayoutId = "soft" | "theater" | "warm";

export type LayoutOption = {
  id: LayoutId;
  label: string;
  tagline: string;
  description: string;
  /** CSS custom properties applied to the app shell */
  vars: Record<string, string>;
};

const STORAGE_KEY = "drona-lms-layout-v1";

export const LAYOUT_OPTIONS: Record<LayoutId, LayoutOption> = {
  soft: {
    id: "soft",
    label: "Soft Studio",
    tagline: "Calm study desk",
    description:
      "Lesson list beside the player with notes and quiz tools always nearby. Great for focused studying.",
    vars: {
      "--layout-bg": "#1A1B1E",
      "--layout-surface": "#242628",
      "--layout-surface-2": "#2C2E31",
      "--layout-border": "rgba(255,255,255,0.08)",
      "--layout-text": "#F2F3F4",
      "--layout-muted": "#9AA0A6",
      "--layout-accent": "#2DD4BF",
      "--layout-accent-soft": "rgba(45,212,191,0.14)",
      "--layout-accent-ink": "#0B1F1C",
    },
  },
  theater: {
    id: "theater",
    label: "Focus Theater",
    tagline: "Immersive player",
    description:
      "Full attention on the video. Side panels tuck away; bring tools back when you need them. Great for watching lessons.",
    vars: {
      "--layout-bg": "#050505",
      "--layout-surface": "#0E0E0E",
      "--layout-surface-2": "#161616",
      "--layout-border": "rgba(255,255,255,0.06)",
      "--layout-text": "#FAFAFA",
      "--layout-muted": "#8A8A8A",
      "--layout-accent": "#FBBF24",
      "--layout-accent-soft": "rgba(251,191,36,0.12)",
      "--layout-accent-ink": "#1A1400",
    },
  },
  warm: {
    id: "warm",
    label: "Warm Academic",
    tagline: "Bookish & bright",
    description:
      "Paper-like canvas and warmer accents — feels like a textbook desk. Great if dark neon feels harsh.",
    vars: {
      "--layout-bg": "#F4F0E8",
      "--layout-surface": "#FFFCF7",
      "--layout-surface-2": "#EDE6D9",
      "--layout-border": "rgba(40,28,18,0.12)",
      "--layout-text": "#1C1410",
      "--layout-muted": "#6B5E52",
      "--layout-accent": "#C45C26",
      "--layout-accent-soft": "rgba(196,92,38,0.12)",
      "--layout-accent-ink": "#FFF8F2",
    },
  },
};

export const LAYOUT_ORDER: LayoutId[] = ["soft", "theater", "warm"];

export function isLayoutId(value: unknown): value is LayoutId {
  return value === "soft" || value === "theater" || value === "warm";
}

export function loadLayoutPreference(): LayoutId {
  if (typeof window === "undefined") return "soft";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (isLayoutId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "soft";
}

export function saveLayoutPreference(id: LayoutId): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function applyLayoutVars(id: LayoutId, target: HTMLElement = document.documentElement): void {
  const option = LAYOUT_OPTIONS[id];
  for (const [key, value] of Object.entries(option.vars)) {
    target.style.setProperty(key, value);
  }
  target.dataset.layout = id;
}
