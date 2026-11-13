"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/ui/cn";
import { AnnotationEntryRow } from "./AnnotationMarkerBadge";

export function AnnotationLegendChip({
  className,
  count,
  label,
  marker,
  onClick,
  pressed,
}: Readonly<{
  className?: string;
  count?: number;
  label: string;
  marker: string;
  onClick: () => void;
  pressed: boolean;
}>) {
  return (
    <Button
      aria-pressed={pressed}
      className={cn(
        "shrink-0 gap-1 rounded-full border px-2 py-0.5 text-ui-caption",
        pressed ? "border-current" : "border-border",
        className,
      )}
      onClick={onClick}
      size="xs"
      type="button"
      variant="ghost"
    >
      <AnnotationEntryRow inheritTone marker={marker} title={label} />
      {count === undefined ? null : <span className="tabular-nums">{count}</span>}
    </Button>
  );
}
