export type ThemeId = "soft" | "theater" | "warm";

export type ThemeTokens = {
  id: ThemeId;
  label: string;
  shortLabel: string;
  description: string;
  /** CSS custom properties applied to the prototype root */
  vars: Record<string, string>;
  /** Layout behavior flags */
  layout: {
    sidebarCollapsedDefault: boolean;
    iconRail: boolean;
    floatingControls: boolean;
    creamCanvas: boolean;
  };
};

export const THEMES: Record<ThemeId, ThemeTokens> = {
  soft: {
    id: "soft",
    label: "A · Soft Learning Studio",
    shortLabel: "Soft Studio",
    description:
      "Two-column study desk: lesson cards · player · sticky notes/quiz — not an IDE tree.",
    vars: {
      "--lab-bg": "#1A1B1E",
      "--lab-surface": "#242628",
      "--lab-surface-2": "#2C2E31",
      "--lab-border": "rgba(255,255,255,0.08)",
      "--lab-text": "#F2F3F4",
      "--lab-muted": "#9AA0A6",
      "--lab-accent": "#2DD4BF",
      "--lab-accent-soft": "rgba(45,212,191,0.14)",
      "--lab-accent-ink": "#0B1F1C",
      "--lab-danger": "#F87171",
      "--lab-radius": "1rem",
      "--lab-radius-sm": "0.75rem",
      "--lab-shadow": "0 12px 40px rgba(0,0,0,0.28)",
      "--lab-player-bg": "linear-gradient(145deg, #1e3a36 0%, #242628 55%, #1a1b1e 100%)",
      "--lab-font-display": "var(--font-display), Space Grotesk, sans-serif",
    },
    layout: {
      sidebarCollapsedDefault: false,
      iconRail: false,
      floatingControls: false,
      creamCanvas: false,
    },
  },
  theater: {
    id: "theater",
    label: "B · Focus Theater",
    shortLabel: "Focus Theater",
    description:
      "Full-bleed immersive player; chrome auto-hides; playlist/transcript/quiz/notes as overlays only.",
    vars: {
      "--lab-bg": "#050505",
      "--lab-surface": "#0E0E0E",
      "--lab-surface-2": "#161616",
      "--lab-border": "rgba(255,255,255,0.06)",
      "--lab-text": "#FAFAFA",
      "--lab-muted": "#8A8A8A",
      "--lab-accent": "#FBBF24",
      "--lab-accent-soft": "rgba(251,191,36,0.12)",
      "--lab-accent-ink": "#1A1400",
      "--lab-danger": "#FB7185",
      "--lab-radius": "0.75rem",
      "--lab-radius-sm": "0.5rem",
      "--lab-shadow": "0 20px 60px rgba(0,0,0,0.55)",
      "--lab-player-bg": "linear-gradient(180deg, #0a0a0a 0%, #111 40%, #050505 100%)",
      "--lab-font-display": "var(--font-display), Space Grotesk, sans-serif",
    },
    layout: {
      sidebarCollapsedDefault: true,
      iconRail: true,
      floatingControls: true,
      creamCanvas: false,
    },
  },
  warm: {
    id: "warm",
    label: "C · Warm Academic",
    shortLabel: "Warm Academic",
    description:
      "Bookshelf chapter grid home → lesson page with margin notes — textbook desk, no sidebar tree.",
    vars: {
      "--lab-bg": "#F4F0E8",
      "--lab-surface": "#FFFCF7",
      "--lab-surface-2": "#EDE6D9",
      "--lab-border": "rgba(40,28,18,0.12)",
      "--lab-text": "#1C1410",
      "--lab-muted": "#6B5E52",
      "--lab-accent": "#C45C26",
      "--lab-accent-soft": "rgba(196,92,38,0.12)",
      "--lab-accent-ink": "#FFF8F2",
      "--lab-danger": "#B42318",
      "--lab-radius": "1.125rem",
      "--lab-radius-sm": "0.875rem",
      "--lab-shadow": "0 10px 32px rgba(60,40,20,0.08)",
      "--lab-player-bg": "linear-gradient(145deg, #d4c4a8 0%, #e8dfd0 45%, #cfc3ad 100%)",
      "--lab-font-display": "Georgia, 'Times New Roman', serif",
    },
    layout: {
      sidebarCollapsedDefault: false,
      iconRail: false,
      floatingControls: false,
      creamCanvas: true,
    },
  },
};

export const THEME_ORDER: ThemeId[] = ["soft", "theater", "warm"];
