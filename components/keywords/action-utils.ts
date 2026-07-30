import type {
  AddKeywordsInput,
  BulkKeywordFrequencyInput,
  BulkKeywordIdsInput,
  BulkKeywordTagInput,
  BulkKeywordTargetInput,
  KeywordScheduleUpdateInput,
  RunCheckNowInput,
  UpdateKeywordInput,
} from "@/lib/schemas/keyword";
import type { SerpDevice } from "@/lib/serp/markets";

export type KeywordAction<TInput> = (input: TInput) => Promise<unknown>;
export type { AddKeywordsInput };
export type CreateKeywordAlertInput = { keywordId: string; projectId: string };

export type KeywordWorkspaceActions = {
  addKeywordsAction: KeywordAction<AddKeywordsInput>;
  bulkClearTargetAction: KeywordAction<BulkKeywordIdsInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  bulkSetFrequencyAction: KeywordAction<BulkKeywordFrequencyInput>;
  bulkSetTargetAction: KeywordAction<BulkKeywordTargetInput>;
  bulkTagAction: KeywordAction<BulkKeywordTagInput>;
};

export type KeywordDetailActions = {
  createKeywordAlertAction?: KeywordAction<CreateKeywordAlertInput>;
  runCheckNowAction: KeywordAction<RunCheckNowInput>;
  updateKeywordAction: KeywordAction<UpdateKeywordInput>;
  updateKeywordScheduleAction?: KeywordAction<KeywordScheduleUpdateInput>;
};

export { actionErrorMessage } from "@/lib/ui/action-error";

export function actionWarningMessage(result: unknown) {
  if (!result || typeof result !== "object" || !("warning" in result)) {
    return null;
  }
  const warning = (result as { warning?: unknown }).warning;
  return typeof warning === "string" && warning.trim() ? warning : null;
}

export function actionResultCount(result: unknown, fallback: number) {
  if (!result || typeof result !== "object") {
    return fallback;
  }
  const values = Object.values(result);
  const count = values.find((value) => typeof value === "number" && Number.isFinite(value));
  return typeof count === "number" ? count : fallback;
}

export function keywordCountLabel(count: number) {
  return `${count.toLocaleString("en-US")} keyword${count === 1 ? "" : "s"}`;
}

export function splitTagInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function deviceValue(label: string): SerpDevice {
  return label.toLowerCase() === "mobile" ? "mobile" : "desktop";
}
