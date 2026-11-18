import type { ReportSaveStatus } from "@/lib/model-playground/report-state";
import type { useTranslations } from "next-intl";

export const resultCopyKeys = [
  "notStarted",
  "unlinkedSources",
  "emptySource",
  "usageDetails",
  "apiResponse",
  "settings",
  "scrollAnswers",
  "trackedScope",
  "unknown",
  "retainedAnswer",
  "legacyExcerpt",
  "providerTruncated",
  "applicationTruncated",
  "citationsTruncated",
  "providerSources",
  "citationOccurrences",
  "sourcesAll",
  "totalUnknown",
  "retentionCounts",
  "omittedUnknown",
  "sourceListTruncated",
  "showSources",
  "hideSources",
  "showCitations",
  "hideCitations",
  "costUnavailable",
  "tokensUnknown",
  "tokens",
  "estimatedUsage",
  "reportedProvider",
  "subtotal",
  "total",
  "scopeUnknown",
  "duration",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheRead",
  "cacheWrite",
  "cacheAccounting",
  "searchCalls",
  "searchTokens",
  "usageCompleteness",
  "basis",
  "rateCard",
  "includes",
  "excludes",
  "unknownComponents",
  "upstreamInference",
  "localEstimate",
  "actualRoute",
  "unreported",
  "notNamed",
  "seconds",
  "cacheTtl",
  "sourceRange",
] as const;
export type ResultCopyKey = (typeof resultCopyKeys)[number];

type PlaygroundTranslator = ReturnType<typeof useTranslations<"projectAiResearch">>;

export function reportStatusLabel(t: PlaygroundTranslator, status: ReportSaveStatus): string {
  switch (status) {
    case "saving":
      return t("modelPlayground.reportStatus.saving");
    case "pending":
      return t("modelPlayground.reportStatus.pending");
    case "saved":
      return t("modelPlayground.reportStatus.saved");
    case "check_failed":
      return t("modelPlayground.reportStatus.check_failed");
    case "storage":
      return t("modelPlayground.reportStatus.storage");
    case "forbidden":
      return t("modelPlayground.reportStatus.forbidden");
    case "read_only":
      return t("modelPlayground.reportStatus.read_only");
    case "too_large":
      return t("modelPlayground.reportStatus.too_large");
    case "unavailable":
      return t("modelPlayground.reportStatus.unavailable");
    case "unclassified":
      return t("modelPlayground.reportStatus.unclassified");
    case "dismissed":
      return t("modelPlayground.reportStatus.dismissed");
    default: {
      // Exhaustive at compile time; an unexpected runtime status still shows translated copy.
      const unexpected: never = status;
      void unexpected;
      return t("modelPlayground.reportStatus.unavailable");
    }
  }
}

export function reportHint(t: PlaygroundTranslator, status: ReportSaveStatus): string {
  switch (status) {
    case "saving":
      return t("modelPlayground.reportHints.saving");
    case "pending":
      return t("modelPlayground.reportHints.pending");
    case "saved":
      return t("modelPlayground.reportHints.saved");
    case "check_failed":
      return t("modelPlayground.reportHints.check_failed");
    case "storage":
      return t("modelPlayground.reportHints.storage");
    case "forbidden":
      return t("modelPlayground.reportHints.forbidden");
    case "read_only":
      return t("modelPlayground.reportHints.read_only");
    case "too_large":
      return t("modelPlayground.reportHints.too_large");
    case "unavailable":
      return t("modelPlayground.reportHints.unavailable");
    case "unclassified":
      return t("modelPlayground.reportHints.unclassified");
    case "dismissed":
      return t("modelPlayground.reportHints.dismissed");
    default: {
      // Exhaustive at compile time; an unexpected runtime status still shows translated copy.
      const unexpected: never = status;
      void unexpected;
      return t("modelPlayground.reportHints.unavailable");
    }
  }
}
