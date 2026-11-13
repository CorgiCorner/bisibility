"use client";
import { useAdminViewState } from "@/components/admin/AdminTableState";
import type { RecoveryCase, RecoveryFilters, RecoveryPage } from "@/lib/metering/recovery/contract";
import { MAX_RECOVERY_BATCH } from "@/lib/metering/recovery/input";
import { useCallback, useState } from "react";

export function useRecoverySelection(rows: RecoveryCase[]) {
  // The reference survives the read a URL change causes; a token would no longer match any row.
  const [reference, setReference] = useAdminViewState("case");
  const select = useCallback(
    (row: RecoveryCase | null) => setReference(row?.reference ?? null),
    [setReference],
  );
  return [rows.find((row) => row.reference === reference) ?? null, select] as const;
}

/**
 * Batch selection is local state: writing it to the URL navigated, and read the whole page from the
 * server, on every checkbox. It follows the case reference because tokens change on every read.
 */
export function useRecoveryBatchSelection(rows: RecoveryCase[]) {
  const [references, setReferences] = useState<string[]>([]);
  const loaded = new Set(rows.map((row) => row.reference));
  // A case that left the loaded page cannot be reviewed from it, so it stops counting.
  const selected = references.filter((reference) => loaded.has(reference));
  if (selected.length !== references.length) setReferences(selected);
  // Stable callbacks keep the table columns, and with them every mounted cell, across a selection.
  const select = useCallback(
    (reference: string, checked: boolean) =>
      setReferences((current) => {
        if (!checked) return current.filter((item) => item !== reference);
        return current.includes(reference) || current.length >= MAX_RECOVERY_BATCH
          ? current
          : [...current, reference];
      }),
    [],
  );
  const clear = useCallback(() => setReferences([]), []);
  return { selected, select, clear };
}

export type RecoveryConsoleProps = {
  initial: RecoveryPage | null;
  filters?: RecoveryFilters;
  onNavigate?: (filters: RecoveryFilters) => void;
};
