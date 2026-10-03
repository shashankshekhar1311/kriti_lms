"use client";

import { useState } from "react";

interface NumericWidgetProps {
  question: string;
  unit?: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function NumericWidget({
  question,
  unit,
  value,
  disabled,
  onChange,
}: NumericWidgetProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
      <div
        className={`flex items-center gap-3 rounded-xl border bg-[color:var(--layout-surface-2)] px-4 py-3 transition ${
          focused
            ? "border-[color:var(--layout-accent)] shadow-[0_0_0_1px_rgba(0,255,255,0.35)]"
            : "border-[color:var(--layout-border)]"
        }`}
      >
        <input
          type="text"
          inputMode="decimal"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Enter exact value"
          className="w-full bg-transparent text-lg text-[color:var(--layout-text)] outline-none placeholder:text-[color:var(--layout-muted)] disabled:opacity-60"
          aria-label="Numeric answer"
        />
        {unit ? (
          <span className="shrink-0 text-sm font-medium text-[color:var(--layout-accent)]">
            {unit}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export { NumericWidget as NumericEntryWidget };
