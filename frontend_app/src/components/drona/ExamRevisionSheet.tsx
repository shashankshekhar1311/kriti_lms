"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Printer, X } from "lucide-react";
import type { RevisionSheetPayload } from "@/lib/types";

interface ExamRevisionSheetProps {
  open: boolean;
  onClose: () => void;
  chapterPath: string;
  chapterName: string;
}

export function ExamRevisionSheet({
  open,
  onClose,
  chapterPath,
  chapterName,
}: ExamRevisionSheetProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<RevisionSheetPayload | null>(null);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !chapterPath) return;
    let mounted = true;
    setLoading(true);
    setError(null);
    setShowAnswerKey(false);

    fetch(`/api/revision-sheet?chapterPath=${encodeURIComponent(chapterPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to build revision sheet");
        return res.json();
      })
      .then((data: RevisionSheetPayload) => {
        if (!mounted) return;
        setSheet(data);
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Load failed");
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, chapterPath]);

  const handlePrint = () => {
    window.print();
  };

  if (!open) return null;

  const qrSrc = sheet
    ? `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(sheet.selfCheckUrl)}`
    : "";

  return (
    <>
      {/* Screen chrome — hidden when printing */}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm print:hidden">
        <div className="flex h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#111] shadow-2xl">
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 bg-[#161616] px-4 py-3">
            <div>
              <h3 className="text-sm font-bold text-white">Kriti Exam Revision Sheet</h3>
              <p className="text-xs text-white/50">{chapterName} · Print or Save as PDF</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAnswerKey((v) => !v)}
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10"
              >
                {showAnswerKey ? "Hide Label Key" : "Show Label Key"}
              </button>
              <button
                type="button"
                onClick={handlePrint}
                disabled={!sheet || loading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-200 hover:bg-amber-500/30 disabled:opacity-40"
              >
                <Printer className="h-3.5 w-3.5" />
                Download / Print PDF
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-white/60 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#1a1a1a] p-4">
            {loading ? (
              <div className="flex h-40 items-center justify-center gap-2 text-white/50">
                <Loader2 className="h-5 w-5 animate-spin" />
                Preparing 2-page worksheet…
              </div>
            ) : error ? (
              <p className="text-sm text-rose-300">{error}</p>
            ) : sheet ? (
              <div className="mx-auto max-w-[210mm] space-y-4">
                <SheetPages sheet={sheet} showAnswerKey={showAnswerKey} qrSrc={qrSrc} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Print-only full document */}
      {sheet ? (
        <div ref={printRef} className="hidden print:block">
          <SheetPages sheet={sheet} showAnswerKey={false} qrSrc={qrSrc} printMode />
        </div>
      ) : null}
    </>
  );
}

function SheetPages({
  sheet,
  showAnswerKey,
  qrSrc,
  printMode = false,
}: {
  sheet: RevisionSheetPayload;
  showAnswerKey: boolean;
  qrSrc: string;
  printMode?: boolean;
}) {
  const wrapperClass = printMode
    ? "kriti-revision-print text-black"
    : "rounded-lg border border-white/10 bg-white text-black shadow";

  return (
    <div className={wrapperClass}>
      {/* PAGE 1 — Diagram labeling */}
      <section className={`p-6 ${printMode ? "print-page-break" : "border-b border-dashed border-black/20"}`}>
        <header className="mb-4 flex items-start justify-between gap-3 border-b-2 border-black pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
              Kriti School · Drona Exam Prep
            </p>
            <h1 className="text-lg font-extrabold leading-tight">
              Exam Revision Sheet — Diagram Labelling
            </h1>
            <p className="mt-0.5 text-xs text-black/70">
              {sheet.classLabel} · {sheet.subjectLabel} · {sheet.chapterName}
            </p>
          </div>
          <div className="rounded border border-black/30 px-2 py-1 text-center text-[10px] font-semibold">
            PAGE 1 OF 2
            <br />
            Pen practice
          </div>
        </header>

        <p className="mb-4 text-xs leading-relaxed text-black/70">
          Label each diagram in the blank callout lines using a pen. Do not peek at the answer key
          until you have attempted every callout.
        </p>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {sheet.diagrams.map((d) => (
            <div key={d.id} className="rounded border border-black/25 p-3">
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide">{d.title}</h2>
              <div className="mb-2 flex min-h-[120px] items-center justify-center rounded bg-neutral-50">
                <img
                  src={`/api/artifact?path=${encodeURIComponent(d.artifactPath)}`}
                  alt={d.title}
                  className="max-h-36 object-contain"
                />
              </div>
              <div className="space-y-2">
                {d.callouts.map((label, i) => (
                  <div key={label} className="flex items-end gap-2 text-xs">
                    <span className="w-6 shrink-0 font-bold">{label}</span>
                    <div className="flex-1 border-b border-black/40 pb-0.5">
                      {showAnswerKey && !printMode ? (
                        <span className="text-[10px] italic text-emerald-700">
                          {d.answers[i] || "—"}
                        </span>
                      ) : (
                        <span className="invisible text-[10px]">.</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {sheet.diagrams.length === 0 ? (
          <p className="text-xs text-black/50">No textbook diagrams available for this chapter yet.</p>
        ) : null}

        <p className="mt-4 text-[10px] text-black/45">
          Student name: ____________________________ &nbsp;&nbsp; Date: ______________
        </p>
      </section>

      {/* PAGE 2 — Subjective practice */}
      <section className="p-6">
        <header className="mb-4 flex items-start justify-between gap-3 border-b-2 border-black pb-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/60">
              Kriti School · Drona Exam Prep
            </p>
            <h1 className="text-lg font-extrabold leading-tight">
              Written Subjective Practice
            </h1>
            <p className="mt-0.5 text-xs text-black/70">
              Answer in CBSE style · Use bullets / tables where required
            </p>
          </div>
          <div className="rounded border border-black/30 px-2 py-1 text-center text-[10px] font-semibold">
            PAGE 2 OF 2
            <br />
            {sheet.questions.reduce((s, q) => s + (q.marks || 0), 0)} Marks
          </div>
        </header>

        <div className="space-y-5">
          {sheet.questions.map((q, idx) => (
            <div key={q.id} className="break-inside-avoid">
              <p className="text-xs font-semibold leading-snug">
                <span className="mr-1">Q{idx + 1}.</span>
                {q.question}
                <span className="ml-1 font-bold text-black/60">[{q.marks} Marks]</span>
              </p>
              <div className="mt-2 space-y-3">
                {Array.from({ length: Math.min(6, Math.max(3, q.marks + 1)) }).map((_, line) => (
                  <div key={line} className="border-b border-black/25" style={{ height: "18px" }} />
                ))}
              </div>
            </div>
          ))}
          {sheet.questions.length === 0 ? (
            <p className="text-xs text-black/50">
              No written_prep.json found — add subjective questions for this chapter to populate page 2.
            </p>
          ) : null}
        </div>

        <footer className="mt-6 flex items-end justify-between gap-4 border-t border-black/20 pt-4">
          <div className="max-w-[70%]">
            <p className="text-[10px] font-bold uppercase tracking-wide text-black/60">
              Self-check QR
            </p>
            <p className="mt-1 text-[10px] leading-relaxed text-black/55">
              Scan to open Drona Written Prep for this chapter and compare your answers with the
              CBSE exemplar + Drona AI examiner feedback.
            </p>
            <p className="mt-1 break-all text-[9px] text-black/40">{sheet.selfCheckUrl}</p>
          </div>
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrSrc}
              alt="Self-check QR code"
              width={100}
              height={100}
              className="rounded border border-black/20"
            />
          ) : null}
        </footer>
      </section>
    </div>
  );
}
