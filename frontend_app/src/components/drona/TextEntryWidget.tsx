"use client";

import { useState } from "react";

interface TextEntryWidgetProps {
  question: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export function TextEntryWidget({
  question,
  value,
  disabled,
  onChange,
}: TextEntryWidgetProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={3}
        placeholder="Type your answer"
        className={`w-full resize-y rounded-xl border bg-[color:var(--layout-surface-2)] px-4 py-3 text-base text-[color:var(--layout-text)] outline-none placeholder:text-[color:var(--layout-muted)] disabled:opacity-60 ${
          focused
            ? "border-[color:var(--layout-accent)] shadow-[0_0_0_1px_rgba(0,255,255,0.35)]"
            : "border-[color:var(--layout-border)]"
        }`}
        aria-label="Text answer"
      />
    </div>
  );
}
