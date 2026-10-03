import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { resolveUnderRenderedOutput } from "@/lib/paths";
import type {
  DilemmaOption,
  InteractiveModuleData,
  InteractiveModuleType,
  InvestigationCard,
  InvestigationIcon,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const ICONS: InvestigationIcon[] = [
  "scroll",
  "shield",
  "scale",
  "landmark",
  "feather",
];

const MODULE_TYPES: InteractiveModuleType[] = [
  "decision_dilemma",
  "historical_investigator",
  "civic_action_lab",
];

function isSocialSciencePath(relativePath: string): boolean {
  const token = relativePath.toLowerCase().replace(/[\s_-]/g, "");
  return (
    token.includes("socialscience") ||
    token.includes("socialstudies") ||
    token.includes("history") ||
    token.includes("civics") ||
    token.includes("geography")
  );
}

function buildFallback(lessonTitle: string): InteractiveModuleData {
  const title = lessonTitle.trim() || "This lesson";
  return {
    module_type: "decision_dilemma",
    scenario_title: `Explore: ${title}`,
    scenario_context: `You step into the world of ${title}. Inspect the clues carefully, then advise Gyanu on the wisest next move for the people living through this moment.`,
    role: "Village Council Advisor",
    investigation_cards: [
      {
        id: "clue_1",
        label: `Key idea from ${title}`,
        detail: `A central concept from ${title}. Look for cause, effect, and whose lives change.`,
        icon: "scroll",
      },
      {
        id: "clue_2",
        label: "A local voice",
        detail:
          "Someone living through this moment shares what fairness and survival feel like day to day.",
        icon: "feather",
      },
      {
        id: "clue_3",
        label: "A place that matters",
        detail:
          "A landmark, market, council hall, or landscape that shapes the choices people can make.",
        icon: "landmark",
      },
    ],
    dilemma_challenge: {
      prompt: `Based on what you discovered about ${title}, which choice best protects people while staying true to the chapter's big idea?`,
      options: [
        {
          id: "opt_a",
          text: "Choose the path that balances fairness with practical needs",
          historical_outcome: `Communities that weighed trade-offs carefully around ${title} often built more durable trust.`,
          socratic_feedback:
            "Beautiful thinking! You noticed that the best choice is rarely the loudest one.",
          is_optimal: true,
        },
        {
          id: "opt_b",
          text: "Rush a bold change without listening to local voices",
          historical_outcome:
            "Rushing past local voices can create short-term wins but long-term resistance.",
          socratic_feedback:
            "Courage is valuable — and so is listening. Whose story might you have missed?",
          is_optimal: false,
        },
        {
          id: "opt_c",
          text: "Do nothing and wait for someone else to decide",
          historical_outcome:
            "Waiting forever often lets problems deepen for people with the least power to wait.",
          socratic_feedback:
            "Patience can be wise — but silence can leave people unprotected. What small action still helps?",
          is_optimal: false,
        },
      ],
    },
  };
}

function normalizeModule(raw: unknown, lessonTitle: string): InteractiveModuleData {
  const fallback = buildFallback(lessonTitle);
  if (!raw || typeof raw !== "object") return fallback;
  const data = raw as Record<string, unknown>;

  const moduleType = String(data.module_type || "");
  const cardsRaw = Array.isArray(data.investigation_cards)
    ? data.investigation_cards
    : [];
  const cards: InvestigationCard[] = [];
  for (let i = 0; i < cardsRaw.length; i++) {
    const card = cardsRaw[i];
    if (!card || typeof card !== "object") continue;
    const c = card as Record<string, unknown>;
    const label = String(c.label || "").trim();
    const detail = String(c.detail || "").trim();
    if (!label || !detail) continue;
    const iconRaw = String(c.icon || "").toLowerCase() as InvestigationIcon;
    cards.push({
      id: String(c.id || `clue_${cards.length + 1}`),
      label,
      detail,
      icon: ICONS.includes(iconRaw) ? iconRaw : ICONS[i % ICONS.length],
    });
  }

  const challenge =
    data.dilemma_challenge && typeof data.dilemma_challenge === "object"
      ? (data.dilemma_challenge as Record<string, unknown>)
      : {};
  const optionsRaw = Array.isArray(challenge.options) ? challenge.options : [];
  const options: DilemmaOption[] = [];
  for (const opt of optionsRaw) {
    if (!opt || typeof opt !== "object") continue;
    const o = opt as Record<string, unknown>;
    const text = String(o.text || "").trim();
    const outcome = String(o.historical_outcome || "").trim();
    const feedback = String(o.socratic_feedback || "").trim();
    if (!text || !outcome || !feedback) continue;
    options.push({
      id: String(o.id || `opt_${String.fromCharCode(97 + options.length)}`),
      text,
      historical_outcome: outcome,
      socratic_feedback: feedback,
      is_optimal: Boolean(o.is_optimal),
    });
  }

  if (cards.length < 2 || options.length < 2) return fallback;
  if (!options.some((o) => o.is_optimal)) options[0].is_optimal = true;

  return {
    module_type: MODULE_TYPES.includes(moduleType as InteractiveModuleType)
      ? (moduleType as InteractiveModuleType)
      : fallback.module_type,
    scenario_title: String(data.scenario_title || "").trim() || fallback.scenario_title,
    scenario_context:
      String(data.scenario_context || "").trim() || fallback.scenario_context,
    role: String(data.role || "").trim() || fallback.role,
    investigation_cards: cards.slice(0, 4),
    dilemma_challenge: {
      prompt: String(challenge.prompt || "").trim() || fallback.dilemma_challenge.prompt,
      options: options.slice(0, 4),
    },
  };
}

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path");
  const lessonPath = request.nextUrl.searchParams.get("lessonPath");
  if (!relativePath && !lessonPath) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  try {
    if (relativePath) {
      const absolute = resolveUnderRenderedOutput(relativePath);
      if (fs.existsSync(absolute) && fs.statSync(absolute).isFile()) {
        const raw = JSON.parse(fs.readFileSync(absolute, "utf-8"));
        const titleGuess = path.basename(path.dirname(absolute)).replace(/_/g, " ");
        return NextResponse.json(normalizeModule(raw, titleGuess));
      }
    }

    if (lessonPath) {
      const lessonAbs = resolveUnderRenderedOutput(lessonPath);
      const moduleFile = path.join(lessonAbs, "interactive_module.json");
      const titleGuess = path.basename(lessonAbs).replace(/_/g, " ");

      if (fs.existsSync(moduleFile) && fs.statSync(moduleFile).isFile()) {
        const raw = JSON.parse(fs.readFileSync(moduleFile, "utf-8"));
        return NextResponse.json(normalizeModule(raw, titleGuess));
      }

      // Soft fallback for Social Science lessons that predate the pipeline field
      if (isSocialSciencePath(lessonPath)) {
        let storyTitle = titleGuess;
        const storyboardFile = path.join(lessonAbs, "storyboard.json");
        if (fs.existsSync(storyboardFile)) {
          try {
            const sb = JSON.parse(fs.readFileSync(storyboardFile, "utf-8"));
            if (typeof sb?.lesson_title === "string" && sb.lesson_title.trim()) {
              storyTitle = sb.lesson_title.trim();
            }
          } catch {
            // ignore
          }
        }
        return NextResponse.json(buildFallback(storyTitle));
      }
    }

    return NextResponse.json({ error: "Interactive module not found" }, { status: 404 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read interactive module";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
