import type { MarketDefinitionMessages } from "@/components/markets/blocks/MarketDefinition";
import type { MarketPasteIssue } from "@/lib/markets/create-input";
import { actionErrorMessage } from "@/lib/ui/action-error";
import type { useTranslations } from "next-intl";

export type NewMarketCreatorMessages = {
  actionError: (error: unknown) => string;
  backToMarket: string;
  cancel: string;
  createMarket: string;
  description: string;
  marketDefinition: MarketDefinitionMessages;
  newMarket: string;
  newSchedule: string;
};

export function pasteErrorMessage(
  error: { issue: MarketPasteIssue | "unknown"; line: number | null } | null,
  t: ReturnType<typeof useTranslations<"projectMarkets">>,
) {
  if (!error) return null;
  if (error.issue === "empty") return t("pasteEmpty");
  if (error.issue === "missing_keyword")
    return t("pasteLineMissingKeyword", { line: error.line ?? 0 });
  if (error.issue === "keyword_too_long")
    return t("pasteLineKeywordTooLong", { line: error.line ?? 0 });
  if (error.issue === "invalid_target_url")
    return t("pasteLineInvalidUrl", { line: error.line ?? 0 });
  if (error.issue === "duplicate_keyword")
    return t("pasteLineDuplicate", { line: error.line ?? 0 });
  return t("pasteInvalid");
}

export function marketActionError(
  error: unknown,
  t: ReturnType<typeof useTranslations<"projectMarkets">>,
) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : null;
  if (code === "market_exists") return t("marketAlreadyTracked");
  if (code === "market_source_invalid") return t("sourceMarketUnavailable");
  if (code === "market_schedule_invalid") return t("scheduleUnavailable");
  if (code === "market_paste_invalid") return t("pasteInvalid");
  return actionErrorMessage(error, t("updateMarketFailed"));
}
