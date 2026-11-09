"use client";
import { useAdminViewState } from "@/components/admin/AdminTableState";
import type { RecoveryCase, RecoveryFilters, RecoveryPage } from "@/lib/metering/recovery/contract";
import { useCallback } from "react";

export function useRecoverySelection(rows: RecoveryCase[]) {
  const [caseToken, setCaseToken] = useAdminViewState("case");
  const select = useCallback(
    (row: RecoveryCase | null) => setCaseToken(row?.token ?? null),
    [setCaseToken],
  );
  return [rows.find((row) => row.token === caseToken) ?? null, select] as const;
}

export type RecoveryConsoleProps = {
  initial: RecoveryPage | null;
  filters?: RecoveryFilters;
  onNavigate?: (filters: RecoveryFilters) => void;
};
