import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type {
  BooleanStatement,
  MultiStepOrderingItem,
  OrderingItem,
  QuizItem,
  QuizPayload,
} from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function displayLabel(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Chapter folder label + optional catalog title → "Chapter 12 — Understanding Markets". */
export function chapterDisplayLabel(
  name: string,
  title?: string | null
): string {
  const base = displayLabel(name);
  const clean = title?.trim();
  return clean ? `${base} — ${clean}` : base;
}

/** Prefer catalog book name; fall back to folder label. */
export function subjectDisplayLabel(
  name: string,
  displayName?: string | null
): string {
  const clean = displayName?.trim();
  return clean || displayLabel(name);
}

export function getHints(item: QuizItem): string[] {
  const hints: string[] = [];
  if (item.hint_1) hints.push(item.hint_1);
  if (item.hint_2) hints.push(item.hint_2);
  if (item.hints?.length) {
    for (const h of item.hints) {
      if (!hints.includes(h)) hints.push(h);
    }
  }
  return hints;
}

export function getSolution(item: QuizItem): string {
  if (item.type === "multiple_select") {
    return (
      item.solution_step ||
      item.explanation ||
      `Correct answers: ${item.correct_answers.join(", ")}`
    );
  }
  if (item.type === "match_following") {
    return (
      item.solution_step ||
      item.explanation ||
      `Matches: ${item.pairs.map((p) => `${p.left} → ${p.right}`).join("; ")}`
    );
  }
  if ("correct_answer" in item && item.correct_answer != null) {
    return (
      item.solution_step ||
      item.explanation ||
      String(item.correct_answer)
    );
  }
  return (
    item.solution_step ||
    item.explanation ||
    "Review the worked solution in the lesson video."
  );
}

export function normalizeOrderingItems(
  item: MultiStepOrderingItem
): { id: string; label: string }[] {
  if (item.items && item.items.length > 0) {
    return item.items.map((entry, index) => {
      if (typeof entry === "string") {
        return { id: entry, label: entry };
      }
      return { id: entry.id || String(index + 1), label: entry.label };
    });
  }

  if (!Array.isArray(item.correct_order)) return [];

  return item.correct_order.map((label) => ({
    id: label,
    label,
  }));
}

function looksMostlyNumeric(answer: string): boolean {
  const cleaned = answer.replace(/,/g, "").trim();
  if (!cleaned) return false;
  // Pure number, fraction, or number + short unit (e.g. "485 years")
  return /^-?\d+(\.\d+)?(\s*\/\s*-?\d+(\.\d+)?)?(\s+[A-Za-z%°]+)?$/.test(
    cleaned
  );
}

function normalizeTextAnswer(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9/\s.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Loose check for short-answer / conceptual items from Chapter_Agent. */
export function checkTextAnswer(user: string, correct: string): boolean {
  const u = normalizeTextAnswer(user);
  const c = normalizeTextAnswer(correct);
  if (!u || !c) return false;
  if (u === c) return true;

  const userNum = normalizeNumericAnswer(user);
  const correctNum = normalizeNumericAnswer(correct);
  if (
    userNum !== null &&
    correctNum !== null &&
    Math.abs(userNum - correctNum) < 1e-9
  ) {
    return true;
  }

  // Accept if user typed a substantial contiguous phrase from the solution
  if (u.length >= 12 && c.includes(u)) return true;
  if (c.length >= 12 && u.includes(c)) return true;

  return false;
}

type RawQuizItem = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
}

function parseBooleanStatements(raw: unknown): BooleanStatement[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const statements: BooleanStatement[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const row = entry as Record<string, unknown>;
    const text = asString(row.text).trim();
    if (!text || typeof row.correct_flag !== "boolean") return null;
    statements.push({ text, correct_flag: row.correct_flag });
  }
  return statements;
}

/**
 * Chapter_Agent emits numerical/conceptual/MCQ shapes; the Drona UI
 * historically expected numeric_entry/boolean_flags/multi_step_ordering.
 * Normalize so the overlay never crashes on mismatched schemas.
 */
export function normalizeQuizItem(
  raw: unknown,
  index: number
): QuizItem | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as RawQuizItem;
  const id = asString(item.id, `q-${index + 1}`);
  const question = asString(item.question).trim();
  if (!question) return null;

  const base = {
    id,
    question,
    hints: Array.isArray(item.hints)
      ? item.hints.filter((h): h is string => typeof h === "string")
      : undefined,
    hint_1: typeof item.hint_1 === "string" ? item.hint_1 : undefined,
    hint_2: typeof item.hint_2 === "string" ? item.hint_2 : undefined,
    solution_step:
      typeof item.solution_step === "string" ? item.solution_step : undefined,
    explanation:
      typeof item.explanation === "string" ? item.explanation : undefined,
    video_remediation_timestamp_seconds:
      typeof item.video_remediation_timestamp_seconds === "number"
        ? item.video_remediation_timestamp_seconds
        : undefined,
  };

  const type = asString(item.type);

  // 1. Match the following
  if (type === "match_following" || type === "matching") {
    const rawPairs = Array.isArray(item.pairs) ? item.pairs : [];
    const pairs: { left: string; right: string }[] = [];
    for (const p of rawPairs) {
      if (
        p &&
        typeof p === "object" &&
        typeof (p as Record<string, unknown>).left === "string" &&
        typeof (p as Record<string, unknown>).right === "string"
      ) {
        pairs.push({
          left: (p as Record<string, unknown>).left as string,
          right: (p as Record<string, unknown>).right as string,
        });
      }
    }
    if (pairs.length >= 2) {
      return {
        ...base,
        type: "match_following",
        pairs,
      };
    }
  }

  const options = Array.isArray(item.options)
    ? item.options.filter((o): o is string => typeof o === "string")
    : [];

  // Generators sometimes emit the MCQ key as `correct_answers` (string) instead of
  // `correct_answer` / `answer`. Treat a single string as the MCQ key; only arrays
  // with 2+ entries are multi-select.
  const correctAnswersField = item.correct_answers;
  const mcqAnswer =
    typeof item.answer === "string"
      ? item.answer
      : typeof item.correct_answer === "string"
        ? item.correct_answer
        : typeof correctAnswersField === "string"
          ? correctAnswersField
          : Array.isArray(correctAnswersField) &&
              correctAnswersField.length === 1 &&
              typeof correctAnswersField[0] === "string"
            ? correctAnswersField[0]
            : "";

  const multiAnswers = Array.isArray(correctAnswersField)
    ? correctAnswersField.filter((a): a is string => typeof a === "string")
    : Array.isArray(item.answer)
      ? item.answer.filter((a): a is string => typeof a === "string")
      : [];

  // 2. Multiple select (multiple options correct)
  if (
    (type === "multiple_select" || type === "multi_select" || multiAnswers.length >= 2) &&
    options.length >= 2 &&
    multiAnswers.length >= 2
  ) {
    return {
      ...base,
      type: "multiple_select",
      options,
      correct_answers: multiAnswers,
    };
  }

  // 3. Single multiple choice — never invent a default answer (that marked wrong
  // selections as "Needs review" while solution_step still said the real key).
  if (options.length >= 2 && mcqAnswer) {
    const matched =
      options.find(
        (o) => o.trim().toLowerCase() === mcqAnswer.trim().toLowerCase()
      ) ?? mcqAnswer;
    return {
      ...base,
      type: "multiple_choice",
      options,
      correct_answer: matched,
    };
  }

  if (type === "multiple_choice" && options.length >= 2 && mcqAnswer) {
    const matched =
      options.find(
        (o) => o.trim().toLowerCase() === mcqAnswer.trim().toLowerCase()
      ) ?? mcqAnswer;
    return {
      ...base,
      type: "multiple_choice",
      options,
      correct_answer: matched,
    };
  }

  if (type === "boolean_flags") {
    const statements = parseBooleanStatements(item.statements);
    if (!statements) return null;
    return {
      ...base,
      type: "boolean_flags",
      statements,
    };
  }

  if (type === "multi_step_ordering") {
    const correct_order = Array.isArray(item.correct_order)
      ? item.correct_order.filter((x): x is string => typeof x === "string")
      : [];
    const items = Array.isArray(item.items)
      ? (item.items as OrderingItem[] | string[])
      : undefined;
    if (!correct_order.length && !(items && items.length)) return null;
    return {
      ...base,
      type: "multi_step_ordering",
      items,
      correct_order,
    };
  }

  if (type === "numeric_entry" || type === "numerical") {
    const correct = item.correct_answer ?? item.answer ?? "";
    const correctStr = asString(correct);
    if (!correctStr) return null;

    if (type === "numerical" && !looksMostlyNumeric(correctStr)) {
      return {
        ...base,
        type: "text_entry",
        correct_answer: correctStr,
      };
    }

    return {
      ...base,
      type: "numeric_entry",
      correct_answer: typeof correct === "number" ? correct : correctStr,
      unit: typeof item.unit === "string" ? item.unit : undefined,
      tolerance:
        typeof item.tolerance === "number" ? item.tolerance : undefined,
    };
  }

  if (type === "conceptual" || type === "text_entry") {
    const correct = asString(item.correct_answer ?? item.answer);
    if (!correct) return null;
    return {
      ...base,
      type: "text_entry",
      correct_answer: correct,
    };
  }

  // Unknown typed item with a free-text answer — treat as text/numeric entry
  if (item.correct_answer != null) {
    const correct = asString(item.correct_answer);
    if (!correct) return null;
    if (looksMostlyNumeric(correct)) {
      return {
        ...base,
        type: "numeric_entry",
        correct_answer: correct,
      };
    }
    return {
      ...base,
      type: "text_entry",
      correct_answer: correct,
    };
  }

  return null;
}

export function normalizeQuizPayload(raw: unknown): QuizPayload {
  const data =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const poolRaw = Array.isArray(data.item_pool) ? data.item_pool : [];
  const item_pool = poolRaw
    .map((item, index) => normalizeQuizItem(item, index))
    .filter((item): item is QuizItem => item !== null);

  return {
    item_pool,
    gating_config:
      data.gating_config && typeof data.gating_config === "object"
        ? (data.gating_config as QuizPayload["gating_config"])
        : undefined,
    video_remediation_timestamp_seconds:
      typeof data.video_remediation_timestamp_seconds === "number"
        ? data.video_remediation_timestamp_seconds
        : undefined,
  };
}

/** Prefer unseen items; if pool exhausted, reset and resample. */
export function sampleQuizItems(
  quiz: QuizPayload,
  seenItemIds: string[]
): QuizItem[] {
  const pool = quiz.item_pool || [];
  const count = quiz.gating_config?.questions_per_attempt ?? 5;
  const unseen = pool.filter((item) => !seenItemIds.includes(item.id));
  const source = unseen.length >= count ? unseen : pool.length ? pool : [];

  // Prefer objectively gradeable items (MCQ / numeric / flags / order)
  // when mixed with open-ended conceptual answers from Chapter_Agent.
  const preferred = source.filter((item) => item.type !== "text_entry");
  const pickFrom = preferred.length >= count ? preferred : source;

  const shuffled = [...pickFrom].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function normalizeNumericAnswer(value: string | number): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!cleaned) return null;

  // Fraction like 1/3
  const fraction = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);
  if (fraction) {
    const num = Number(fraction[1]);
    const den = Number(fraction[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
  }

  const direct = Number(cleaned);
  if (Number.isFinite(direct)) return direct;

  // Extract first number from answers like "485 years" or "Approximately 182 BCE"
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function checkNumeric(
  user: string,
  correct: number | string,
  tolerance = 0
): boolean {
  const u = normalizeNumericAnswer(user);
  const c = normalizeNumericAnswer(correct);
  if (u === null || c === null) {
    return (
      String(user).trim().toLowerCase() === String(correct).trim().toLowerCase()
    );
  }
  return Math.abs(u - c) <= tolerance;
}

export type AnswerState =
  | { type: "numeric_entry"; value: string }
  | { type: "boolean_flags"; values: (boolean | null)[] }
  | { type: "multi_step_ordering"; order: string[] }
  | { type: "multiple_choice"; value: string | null }
  | { type: "multiple_select"; values: string[] }
  | { type: "match_following"; matches: Record<string, string> }
  | { type: "text_entry"; value: string };

export function initAnswer(item: QuizItem): AnswerState {
  if (item.type === "numeric_entry") {
    return { type: "numeric_entry", value: "" };
  }
  if (item.type === "boolean_flags") {
    return {
      type: "boolean_flags",
      values: item.statements.map(() => null),
    };
  }
  if (item.type === "multiple_choice") {
    return { type: "multiple_choice", value: null };
  }
  if (item.type === "multiple_select") {
    return { type: "multiple_select", values: [] };
  }
  if (item.type === "match_following") {
    return { type: "match_following", matches: {} };
  }
  if (item.type === "text_entry") {
    return { type: "text_entry", value: "" };
  }
  if (item.type === "multi_step_ordering") {
    const normalized = normalizeOrderingItems(item);
    const shuffled = [...normalized]
      .map((entry) => entry.id)
      .sort(() => Math.random() - 0.5);
    // Avoid starting already correct
    if (arraysEqual(shuffled, item.correct_order) && shuffled.length > 1) {
      const tmp = shuffled[0];
      shuffled[0] = shuffled[1];
      shuffled[1] = tmp;
    }
    return { type: "multi_step_ordering", order: shuffled };
  }
  return { type: "text_entry", value: "" };
}

export function gradeItem(item: QuizItem, answer: AnswerState | undefined): boolean {
  if (!answer || answer.type !== item.type) return false;

  if (item.type === "numeric_entry" && answer.type === "numeric_entry") {
    return checkNumeric(
      answer.value,
      item.correct_answer,
      item.tolerance ?? 0
    );
  }

  if (item.type === "boolean_flags" && answer.type === "boolean_flags") {
    return item.statements.every(
      (statement, index) => answer.values[index] === statement.correct_flag
    );
  }

  if (item.type === "multi_step_ordering" && answer.type === "multi_step_ordering") {
    return arraysEqual(answer.order, item.correct_order);
  }

  if (item.type === "multiple_choice" && answer.type === "multiple_choice") {
    return (
      answer.value != null &&
      answer.value.trim().toLowerCase() ===
        item.correct_answer.trim().toLowerCase()
    );
  }

  if (item.type === "multiple_select" && answer.type === "multiple_select") {
    const normAnswer = answer.values.map((v) => v.trim().toLowerCase()).sort();
    const normCorrect = item.correct_answers
      .map((v) => v.trim().toLowerCase())
      .sort();
    if (normAnswer.length !== normCorrect.length) return false;
    return normAnswer.every((v, i) => v === normCorrect[i]);
  }

  if (item.type === "match_following" && answer.type === "match_following") {
    if (item.pairs.length === 0) return false;
    return item.pairs.every((pair) => {
      const matched = answer.matches[pair.left];
      return (
        matched != null &&
        matched.trim().toLowerCase() === pair.right.trim().toLowerCase()
      );
    });
  }

  if (item.type === "text_entry" && answer.type === "text_entry") {
    return checkTextAnswer(answer.value, item.correct_answer);
  }

  return false;
}
