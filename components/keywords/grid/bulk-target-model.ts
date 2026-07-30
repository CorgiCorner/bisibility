import type { KeywordRow } from "@/lib/queries/keywords";

export type BulkTargetView = {
  actionLabel: string;
  hasTargets: boolean;
  initialValue: string;
  mixed: boolean;
  modalTitle: string;
  submitLabel: string;
};

export function bulkTargetView(rows: readonly KeywordRow[]): BulkTargetView {
  const targets = rows.map((row) => row.targetUrl?.trim() || null);
  const uniqueTargets = new Set(targets);
  const hasTargets = targets.some(Boolean);
  const mixed = uniqueTargets.size > 1;
  const initialValue = !mixed && targets[0] ? targets[0] : "";

  if (rows.length === 1) {
    return hasTargets
      ? {
          actionLabel: "Change target URL",
          hasTargets,
          initialValue,
          mixed,
          modalTitle: "Change target URL",
          submitLabel: "Change target",
        }
      : {
          actionLabel: "Set target URL",
          hasTargets,
          initialValue,
          mixed,
          modalTitle: "Set target URL",
          submitLabel: "Set target",
        };
  }

  return hasTargets
    ? {
        actionLabel: "Replace target URLs...",
        hasTargets,
        initialValue,
        mixed,
        modalTitle: "Replace target URLs",
        submitLabel: "Replace targets",
      }
    : {
        actionLabel: "Set same target URL...",
        hasTargets,
        initialValue,
        mixed,
        modalTitle: "Set same target URL",
        submitLabel: "Set target",
      };
}
