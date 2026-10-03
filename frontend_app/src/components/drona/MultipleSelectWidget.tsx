"use client";

import { Check } from "lucide-react";

interface MultipleSelectWidgetProps {
  question: string;
  options: string[];
  values: string[];
  disabled?: boolean;
  onChange: (values: string[]) => void;
}

export function MultipleSelectWidget({
  question,
  options,
  values,
  disabled,
  onChange,
}: MultipleSelectWidgetProps) {
  const toggleOption = (option: string) => {
    if (disabled) return;
    if (values.includes(option)) {
      onChange(values.filter((v) => v !== option));
    } else {
      onChange([...values, option]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
        <span className="inline-flex items-center rounded-full border border-[color:var(--layout-accent)]/30 bg-[color:var(--layout-accent)]/10 px-2.5 py-0.5 text-xs font-semibold text-[color:var(--layout-accent)]">
          Select all that apply (multiple options correct)
        </span>
      </div>
      <div className="space-y-2">
        {options.map((option) => {
          const selected = values.includes(option);
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => toggleOption(option)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                selected
                  ? "border-[color:var(--layout-accent)]/60 bg-[color:var(--layout-accent)]/10 text-[color:var(--layout-text)]"
                  : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)]/80 hover:border-[color:var(--layout-border)] hover:bg-[color:var(--layout-surface-2)]"
              } disabled:opacity-50`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                  selected
                    ? "border-[color:var(--layout-accent)] bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)]"
                    : "border-[color:var(--layout-border)] bg-transparent"
                }`}
              >
                {selected ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : null}
              </span>
              <span className="flex-1">{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
