import { NextRequest, NextResponse } from "next/server";
import type { SubjectiveQuestion, WrittenGradingResult } from "@/lib/types";

export const dynamic = "force-dynamic";

interface GradeRequestPayload {
  question: SubjectiveQuestion;
  studentAnswer: string;
  structuredAnswer?: {
    points?: string[];
    table?: {
      headers: [string, string];
      rows: [string, string][];
    };
    instrument?: {
      principle: string;
      working: string;
      precautionsOrUnits: string;
    };
    rawText?: string;
  };
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// Check if a keyword or common variant matches in the normalized answer
function matchesKeyword(normalizedAnswer: string, keyword: string): boolean {
  const normKw = normalize(keyword);
  if (!normKw) return true;

  // Direct substring match
  if (normalizedAnswer.includes(normKw)) return true;

  // Check word-by-word presence for multi-word phrases (e.g. "atmospheric pressure")
  const words = normKw.split(" ").filter((w) => w.length > 2);
  if (words.length > 1) {
    const allFound = words.every((w) => {
      // Check word stem (trim 's', 'es', 'ed', 'ing')
      const stem = w.replace(/(ing|es|ed|s)$/, "");
      return normalizedAnswer.includes(w) || (stem.length >= 4 && normalizedAnswer.includes(stem));
    });
    if (allFound) return true;
  } else if (words.length === 1) {
    const stem = words[0].replace(/(ing|es|ed|s)$/, "");
    if (stem.length >= 4 && normalizedAnswer.includes(stem)) {
      return true;
    }
  }

  return false;
}

function evaluateDeterministically(
  question: SubjectiveQuestion,
  studentAnswer: string,
  structuredAnswer?: GradeRequestPayload["structuredAnswer"]
): WrittenGradingResult {
  const normalizedAnswer = normalize(studentAnswer);
  const totalMarks = question.marks || 3;

  // 1. Keyword Analysis
  const mandatory = question.mandatory_keywords || [];
  const matched: string[] = [];
  const missing: string[] = [];

  for (const kw of mandatory) {
    if (matchesKeyword(normalizedAnswer, kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const coverageRatio = mandatory.length > 0 ? matched.length / mandatory.length : 1;

  // 2. Rubric Breakdown
  const rubric = question.marking_rubric || [
    {
      step: "Core Definition / Concept",
      marks_allocated: Math.ceil(totalMarks / 2),
      criterion: "Accurate scientific explanation with core concept",
    },
    {
      step: "Application / Structure & Accuracy",
      marks_allocated: Math.floor(totalMarks / 2),
      criterion: "Correct examples, scientific cause, or precise distinction",
    },
  ];

  let cumulativeAwarded = 0;
  const rubricBreakdown = rubric.map((stepItem, idx) => {
    const allocated = stepItem.marks_allocated;
    const stepNormCrit = normalize(stepItem.criterion + " " + stepItem.step);

    // Check which step keywords or concepts are present
    const stepWords = stepNormCrit.split(" ").filter((w) => w.length > 3);
    const stepMatches = stepWords.filter((w) => normalizedAnswer.includes(w));
    const stepCoverage = stepWords.length > 0 ? stepMatches.length / stepWords.length : 0.5;

    // Structure checks
    let structureBonus = 0;
    if (question.archetype === "differentiate") {
      if (
        structuredAnswer?.table?.rows &&
        structuredAnswer.table.rows.filter((r) => r[0]?.trim() && r[1]?.trim()).length >= 2
      ) {
        structureBonus = 0.25;
      }
    } else if (question.archetype === "describe_instrument") {
      if (
        structuredAnswer?.instrument?.principle &&
        structuredAnswer?.instrument?.working
      ) {
        structureBonus = 0.25;
      }
    } else if (question.archetype === "points") {
      if (
        structuredAnswer?.points &&
        structuredAnswer.points.filter((p) => p.trim().length > 10).length >= 2
      ) {
        structureBonus = 0.25;
      }
    }

    // Determine performance for this step
    const combinedScore = Math.min(1, Math.max(0, stepCoverage * 0.5 + coverageRatio * 0.4 + structureBonus));

    let awarded: number;
    let stepFeedback: string;

    if (normalizedAnswer.length < 15) {
      awarded = 0;
      stepFeedback = "Answer is too brief or incomplete to award marks for this step.";
    } else if (combinedScore >= 0.75) {
      awarded = allocated;
      stepFeedback = `Full marks awarded (${allocated}/${allocated}). Excellent coverage of ${stepItem.step.toLowerCase()}.`;
    } else if (combinedScore >= 0.4) {
      awarded = Math.round((allocated * 0.5) * 2) / 2;
      stepFeedback = `Partial credit (${awarded}/${allocated}). Concept touched upon, but lacks specific scientific terms.`;
    } else {
      awarded = Math.round((allocated * 0.25) * 2) / 2;
      stepFeedback = `Minimal credit (${awarded}/${allocated}). Missing key points required by the CBSE rubric: "${stepItem.criterion}".`;
    }

    cumulativeAwarded += awarded;

    return {
      step: stepItem.step,
      marks_awarded: awarded,
      max_marks: allocated,
      criterion: stepItem.criterion,
      feedback: stepFeedback,
    };
  });

  // Clamp final score
  const finalScore = Math.min(totalMarks, Math.max(0, Math.round(cumulativeAwarded * 2) / 2));
  const percentage = Math.round((finalScore / totalMarks) * 100);

  // Determine CBSE Grade Band
  let cbseBand = "D (Needs Revision)";
  if (percentage >= 90) cbseBand = "A1 (CBSE Topper Standard)";
  else if (percentage >= 80) cbseBand = "A2 (Distinction)";
  else if (percentage >= 70) cbseBand = "B1 (Merit)";
  else if (percentage >= 60) cbseBand = "B2 (Above Average)";
  else if (percentage >= 50) cbseBand = "C1 (Passing)";

  // Generate Examiner Comment
  let examinerComment = "";
  if (percentage >= 90) {
    examinerComment = `Exemplary performance! You scored ${finalScore}/${totalMarks}. Your answer integrates key scientific terminology accurately and follows standard CBSE presentation rules.`;
  } else if (percentage >= 70) {
    examinerComment = `Well written! You scored ${finalScore}/${totalMarks}. Your understanding is solid. To reach the full ${totalMarks}/${totalMarks} topper grade, ensure you explicitly incorporate: ${missing.length > 0 ? missing.slice(0, 3).map((k) => `"${k}"`).join(", ") : "more precise units/examples"}.`;
  } else if (percentage >= 50) {
    examinerComment = `Moderate attempt (${finalScore}/${totalMarks}). You understand the basic idea, but CBSE examiners look for precise scientific definitions rather than colloquial language. Missing critical terms: ${missing.slice(0, 3).map((k) => `"${k}"`).join(", ")}. Compare your response with the model exemplar.`;
  } else {
    examinerComment = `Needs thorough revision (${finalScore}/${totalMarks}). The response lacks essential scientific keywords (${missing.slice(0, 4).map((k) => `"${k}"`).join(", ")}). Re-read the micro-lesson concept and study the structured exemplar answer below.`;
  }

  return {
    score: finalScore,
    max_marks: totalMarks,
    percentage,
    keyword_analysis: {
      matched,
      missing,
      coverage_pct: Math.round(coverageRatio * 100),
    },
    rubric_breakdown: rubricBreakdown,
    examiner_comment: examinerComment,
    cbse_band: cbseBand,
  };
}

async function gradeWithLLM(
  question: SubjectiveQuestion,
  studentAnswer: string,
  deterministic: WrittenGradingResult
): Promise<WrittenGradingResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return null;

  const prompt = `You are a senior CBSE Board Examiner evaluating a Class 7 student's written subjective answer.

QUESTION (${question.marks} Marks):
"${question.question}"

ARCHETYPE: ${question.archetype}
MANDATORY KEYWORDS: ${question.mandatory_keywords.join(", ")}

MARKING RUBRIC:
${question.marking_rubric.map((r, i) => `${i + 1}. Step: "${r.step}" (${r.marks_allocated} marks) - Criterion: "${r.criterion}"`).join("\n")}

MODEL EXEMPLAR ANSWER:
${question.exemplar_answer}

STUDENT ANSWER TO EVALUATE:
"${studentAnswer}"

Evaluate strictly against the CBSE marking scheme. Return ONLY valid JSON with this exact schema:
{
  "score": number (total marks awarded, max ${question.marks}),
  "rubric_breakdown": [
    {
      "step": string,
      "marks_allocated": number,
      "marks_awarded": number,
      "feedback": string
    }
  ],
  "examiner_comment": string (2-3 concise sentences giving encouraging, constructive CBSE examiner feedback and mentioning any missing keywords),
  "cbse_band": string ("A1 (CBSE Topper Standard)" | "A2 (Distinction)" | "B1 (Merit)" | "B2 (Above Average)" | "C1 (Passing)" | "D (Needs Revision)")
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (typeof parsed.score === "number" && Array.isArray(parsed.rubric_breakdown)) {
      const totalMarks = question.marks || 3;
      const score = Math.min(totalMarks, Math.max(0, parsed.score));
      const formattedRubric = parsed.rubric_breakdown.map((item: any, idx: number) => {
        const orig = question.marking_rubric[idx] || { step: item.step, marks_allocated: 1, criterion: "" };
        return {
          step: item.step || orig.step,
          marks_awarded: typeof item.marks_awarded === "number" ? item.marks_awarded : orig.marks_allocated,
          max_marks: orig.marks_allocated,
          criterion: orig.criterion,
          feedback: item.feedback || "Evaluated by CBSE Examiner.",
        };
      });

      return {
        score,
        max_marks: totalMarks,
        percentage: Math.round((score / totalMarks) * 100),
        keyword_analysis: deterministic.keyword_analysis,
        rubric_breakdown: formattedRubric,
        examiner_comment: parsed.examiner_comment || deterministic.examiner_comment,
        cbse_band: parsed.cbse_band || deterministic.cbse_band,
      };
    }
  } catch {
    // Fall back smoothly to deterministic result
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body: GradeRequestPayload = await request.json();

    if (!body.question || (!body.studentAnswer && !body.structuredAnswer)) {
      return NextResponse.json(
        { error: "Missing question or student answer" },
        { status: 400 }
      );
    }

    // Assemble unified answer text
    let fullText = body.studentAnswer || "";
    if (body.structuredAnswer) {
      if (body.structuredAnswer.table?.rows) {
        fullText += "\n" + body.structuredAnswer.table.rows.map((r) => `${r[0]} | ${r[1]}`).join("\n");
      }
      if (body.structuredAnswer.points) {
        fullText += "\n" + body.structuredAnswer.points.join("\n");
      }
      if (body.structuredAnswer.instrument) {
        fullText += `\nPrinciple: ${body.structuredAnswer.instrument.principle}\nWorking: ${body.structuredAnswer.instrument.working}\nPrecautions: ${body.structuredAnswer.instrument.precautionsOrUnits}`;
      }
    }

    // Deterministic baseline (instant & mathematically strict)
    const deterministicResult = evaluateDeterministically(
      body.question,
      fullText,
      body.structuredAnswer
    );

    // Attempt AI enrichment with tight 4s timeout
    const llmResult = await gradeWithLLM(body.question, fullText, deterministicResult);

    const finalResult = llmResult || deterministicResult;

    return NextResponse.json(finalResult);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
