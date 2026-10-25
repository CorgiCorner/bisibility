"use client";

import { useTranslations } from "next-intl";

const labelKeys = {
  verdict: {
    VERDICT_UNSPECIFIED: "enums.verdict.VERDICT_UNSPECIFIED",
    PASS: "enums.verdict.PASS",
    PARTIAL: "enums.verdict.PARTIAL",
    FAIL: "enums.verdict.FAIL",
    NEUTRAL: "enums.verdict.NEUTRAL",
  },
  crawledAs: {
    CRAWLING_USER_AGENT_UNSPECIFIED: "enums.crawledAs.CRAWLING_USER_AGENT_UNSPECIFIED",
    DESKTOP: "enums.crawledAs.DESKTOP",
    MOBILE: "enums.crawledAs.MOBILE",
  },
  pageFetchState: {
    PAGE_FETCH_STATE_UNSPECIFIED: "enums.pageFetchState.PAGE_FETCH_STATE_UNSPECIFIED",
    SUCCESSFUL: "enums.pageFetchState.SUCCESSFUL",
    SOFT_404: "enums.pageFetchState.SOFT_404",
    BLOCKED_ROBOTS_TXT: "enums.pageFetchState.BLOCKED_ROBOTS_TXT",
    NOT_FOUND: "enums.pageFetchState.NOT_FOUND",
    ACCESS_DENIED: "enums.pageFetchState.ACCESS_DENIED",
    SERVER_ERROR: "enums.pageFetchState.SERVER_ERROR",
    REDIRECT_ERROR: "enums.pageFetchState.REDIRECT_ERROR",
    ACCESS_FORBIDDEN: "enums.pageFetchState.ACCESS_FORBIDDEN",
    BLOCKED_4XX: "enums.pageFetchState.BLOCKED_4XX",
    INTERNAL_CRAWL_ERROR: "enums.pageFetchState.INTERNAL_CRAWL_ERROR",
    INVALID_URL: "enums.pageFetchState.INVALID_URL",
  },
  robotsTxtState: {
    ROBOTS_TXT_STATE_UNSPECIFIED: "enums.robotsTxtState.ROBOTS_TXT_STATE_UNSPECIFIED",
    ALLOWED: "enums.robotsTxtState.ALLOWED",
    DISALLOWED: "enums.robotsTxtState.DISALLOWED",
  },
  indexingState: {
    INDEXING_STATE_UNSPECIFIED: "enums.indexingState.INDEXING_STATE_UNSPECIFIED",
    INDEXING_ALLOWED: "enums.indexingState.INDEXING_ALLOWED",
    BLOCKED_BY_META_TAG: "enums.indexingState.BLOCKED_BY_META_TAG",
    BLOCKED_BY_HTTP_HEADER: "enums.indexingState.BLOCKED_BY_HTTP_HEADER",
    BLOCKED_BY_ROBOTS_TXT: "enums.indexingState.BLOCKED_BY_ROBOTS_TXT",
  },
} as const;
export type InspectionEnumField = keyof typeof labelKeys;

export function useInspectionLabel() {
  const t = useTranslations("projectSearchInsights.indexing");
  return (field: InspectionEnumField, value: string | null | undefined) => {
    if (!value) return "-";
    const key = Object.entries(labelKeys[field]).find(([known]) => known === value)?.[1];
    return key ? t(key) : value;
  };
}
