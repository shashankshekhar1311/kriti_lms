"use client";

interface MultipleChoiceWidgetProps {
  question: string;
  options: string[];
  value: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function MultipleChoiceWidget({
  question,
  options,
  value,
  disabled,
  onChange,
}: MultipleChoiceWidgetProps) {
  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
      <div className="space-y-2">
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              disabled={disabled}
              onClick={() => onChange(option)}
              className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                selected
                  ? "border-[color:var(--layout-accent)]/60 bg-[color:var(--layout-accent)]/10 text-[color:var(--layout-text)]"
                  : "border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] text-[color:var(--layout-text)]/80 hover:border-[color:var(--layout-border)] hover:bg-[color:var(--layout-surface-2)]"
              } disabled:opacity-50`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                  selected
                    ? "border-[color:var(--layout-accent)] bg-[color:var(--layout-accent)]"
                    : "border-[color:var(--layout-border)]"
                }`}
              >
                {selected ? (
                  <span className="h-2 w-2 rounded-full bg-[color:var(--layout-bg)]" />
                ) : null}
              </span>
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
