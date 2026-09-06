"use client";

import { cn } from "@/lib/ui/cn";
import { XIcon as X } from "@phosphor-icons/react";
import { tagChipClassName, tagChipSurfaceClassName } from "./tag-chip-styles";

export type TagChipProps = {
  label: string;
  keywordCount?: number;
  onRemove?: () => void;
  pending?: boolean;
  removeLabel?: string;
};

function formatUsageCount(count: number) {
  return count.toLocaleString("en-US");
}

export function TagChip({
  keywordCount = 0,
  label,
  onRemove,
  pending = false,
  removeLabel,
}: Readonly<TagChipProps>) {
  const showUsage = keywordCount > 0;

  return (
    <span
      className={cn(
        tagChipClassName,
        pending ? "border-dashed border-border bg-transparent" : tagChipSurfaceClassName,
        onRemove ? "py-0 pl-2.5 pr-1" : "px-2.5",
      )}
    >
      <span className="min-w-0 truncate">
        {label}
        {showUsage ? (
          <span className="text-fg-muted"> · {formatUsageCount(keywordCount)}</span>
        ) : null}
      </span>
      {onRemove ? (
        <button
          aria-label={removeLabel ?? `Remove ${label}`}
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full p-0 leading-none text-fg-muted outline-none transition-colors hover:bg-bg-elev hover:text-fg focus-visible:bg-bg-elev focus-visible:text-fg"
          onClick={onRemove}
          type="button"
        >
          <X aria-hidden className="block shrink-0" size={10} weight="regular" />
        </button>
      ) : null}
    </span>
  );
}
