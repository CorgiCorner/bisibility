"use client";

import { MenuSelect } from "@/components/ui";
import type { StoredResultsIndexEntry } from "@/lib/checks/contract";

const TIER_LABEL: Record<StoredResultsIndexEntry["tier"], string> = {
  compact: "compact",
  full: "full detail",
  none: "not stored",
};

type PickerProps = {
  ariaLabel: string;
  entries: readonly StoredResultsIndexEntry[];
  formatDate: (iso: string) => string;
  onChange: (checkId: string) => void;
  value: string;
};

/** A stored check reads as its date, what survives of it, and where the tracked domain sat. */
export function storedCheckLabel(
  entry: StoredResultsIndexEntry,
  formatDate: (iso: string) => string,
) {
  const tier =
    entry.tier === "full" && entry.position === null ? "not found" : TIER_LABEL[entry.tier];
  const position = entry.position === null ? "" : ` · #${entry.position}`;
  return `${formatDate(entry.checkedAt)}${position} · ${tier} · ${entry.providerLabel}`;
}

export function RetrievedResultsPicker({
  ariaLabel,
  entries,
  formatDate,
  onChange,
  value,
}: Readonly<PickerProps>) {
  return (
    <MenuSelect
      ariaLabel={ariaLabel}
      onChange={onChange}
      options={entries.map((entry) => ({
        label: storedCheckLabel(entry, formatDate),
        value: entry.checkId,
      }))}
      value={value}
    />
  );
}
