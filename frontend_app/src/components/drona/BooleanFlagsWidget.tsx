"use client";

interface BooleanFlagsWidgetProps {
  question: string;
  statements: { text: string }[];
  values: (boolean | null)[];
  disabled?: boolean;
  onChange: (index: number, value: boolean) => void;
}

export function BooleanFlagsWidget({
  question,
  statements,
  values,
  disabled,
  onChange,
}: BooleanFlagsWidgetProps) {
  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
      <div className="overflow-hidden rounded-xl border border-[color:var(--layout-border)]">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 bg-[color:var(--layout-surface-2)] px-4 py-2 text-xs uppercase tracking-wider text-[color:var(--layout-muted)]">
          <span>Statement</span>
          <span className="w-16 text-center">True</span>
          <span className="w-16 text-center">False</span>
        </div>
        {statements.map((statement, index) => {
          const selected = values[index];
          return (
            <div
              key={`${index}-${statement.text.slice(0, 24)}`}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-t border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-4 py-3"
            >
              <p className="pr-3 text-sm text-[color:var(--layout-text)]/90">{statement.text}</p>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(index, true)}
                className={`h-9 w-16 rounded-lg text-xs font-semibold transition ${
                  selected === true
                    ? "bg-[color:var(--layout-accent)] text-[color:var(--layout-accent-ink)]"
                    : "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)]"
                } disabled:opacity-50`}
              >
                True
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(index, false)}
                className={`h-9 w-16 rounded-lg text-xs font-semibold transition ${
                  selected === false
                    ? "bg-drona-amber text-[color:var(--layout-accent-ink)]"
                    : "bg-[color:var(--layout-accent-soft)] text-[color:var(--layout-muted)] hover:bg-[color:var(--layout-accent-soft)]"
                } disabled:opacity-50`}
              >
                False
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
