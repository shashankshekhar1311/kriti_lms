"use client";

import { Reorder, useDragControls } from "framer-motion";
import { GripVertical } from "lucide-react";

interface OrderingWidgetProps {
  question: string;
  items: { id: string; label: string }[];
  order: string[];
  disabled?: boolean;
  onChange: (nextOrder: string[]) => void;
}

function OrderCard({
  id,
  label,
  index,
  disabled,
}: {
  id: string;
  label: string;
  index: number;
  disabled?: boolean;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      className="flex items-center gap-3 rounded-xl border border-[color:var(--layout-border)] bg-[color:var(--layout-surface-2)] px-3 py-3 shadow-sm"
      whileDrag={{ scale: 1.02, boxShadow: "0 0 0 1px #00FFFF" }}
    >
      <button
        type="button"
        disabled={disabled}
        onPointerDown={(e) => controls.start(e)}
        className="cursor-grab touch-none text-[color:var(--layout-muted)] hover:text-[color:var(--layout-accent)] disabled:cursor-not-allowed"
        aria-label={`Drag step ${index + 1}`}
      >
        <GripVertical className="h-5 w-5" />
      </button>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--layout-accent)]/15 text-xs font-bold text-[color:var(--layout-accent)]">
        {index + 1}
      </span>
      <p className="flex-1 text-sm text-[color:var(--layout-text)]">{label}</p>
    </Reorder.Item>
  );
}

export function OrderingWidget({
  question,
  items,
  order,
  disabled,
  onChange,
}: OrderingWidgetProps) {
  const labelById = new Map(items.map((item) => [item.id, item.label]));

  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed text-[color:var(--layout-text)]">{question}</p>
      <p className="text-xs uppercase tracking-wider text-[color:var(--layout-accent)]/80">
        Drag to reorder the steps
      </p>
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={(next) => {
          if (!disabled) onChange(next);
        }}
        className="space-y-2"
      >
        {order.map((id, index) => (
          <OrderCard
            key={id}
            id={id}
            label={labelById.get(id) || id}
            index={index}
            disabled={disabled}
          />
        ))}
      </Reorder.Group>
    </div>
  );
}

export { OrderingWidget as MultiStepOrderingWidget };
