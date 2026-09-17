import type { KeywordRow } from "@/lib/queries/keywords";

export type BulkTargetView = {
  actionKey:
    | "targetChangeAction"
    | "targetReplaceAction"
    | "targetSetAction"
    | "targetSetSameAction";
  hasTargets: boolean;
  initialValue: string;
  mixed: boolean;
  submitKey: "targetChangeSubmit" | "targetReplaceSubmit" | "targetSetSubmit";
  titleKey: "targetChangeTitle" | "targetReplaceTitle" | "targetSetSameTitle" | "targetSetTitle";
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
          actionKey: "targetChangeAction",
          hasTargets,
          initialValue,
          mixed,
          submitKey: "targetChangeSubmit",
          titleKey: "targetChangeTitle",
        }
      : {
          actionKey: "targetSetAction",
          hasTargets,
          initialValue,
          mixed,
          submitKey: "targetSetSubmit",
          titleKey: "targetSetTitle",
        };
  }

  return hasTargets
    ? {
        actionKey: "targetReplaceAction",
        hasTargets,
        initialValue,
        mixed,
        submitKey: "targetReplaceSubmit",
        titleKey: "targetReplaceTitle",
      }
    : {
        actionKey: "targetSetSameAction",
        hasTargets,
        initialValue,
        mixed,
        submitKey: "targetSetSubmit",
        titleKey: "targetSetSameTitle",
      };
}
