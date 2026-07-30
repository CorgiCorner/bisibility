import "server-only";

import { IMPORT_PACKAGE_MAX_KEYWORDS } from "./package-limits";

const DEFAULT_DOWNLOAD_MAX_KEYWORDS = IMPORT_PACKAGE_MAX_KEYWORDS;
const DEFAULT_PUSH_MAX_KEYWORDS = 50_000;
const DOWNLOAD_MAX_HISTORY_ROWS_PER_KEYWORD = 5_000;

export const CHUNK_TARGET_KEYWORDS = 200;
export const CHUNK_MAX_HISTORY_ROWS = 25_000;

type ExportKeyword = {
  rankChecks: readonly unknown[];
};

type SessionThresholdInput = {
  keywords: number;
  rankChecks: number;
};

function positiveIntegerEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function downloadExportLimits() {
  return {
    maxKeywords: positiveIntegerEnv(
      "BISIBILITY_MIGRATION_EXPORT_MAX_KEYWORDS",
      DEFAULT_DOWNLOAD_MAX_KEYWORDS,
    ),
  };
}

export function pushMigrationLimits() {
  return {
    maxKeywords: positiveIntegerEnv("BISIBILITY_MIGRATION_MAX_KEYWORDS", DEFAULT_PUSH_MAX_KEYWORDS),
  };
}

export function shouldUseSessions({ keywords, rankChecks }: SessionThresholdInput) {
  return keywords > 400 || rankChecks > CHUNK_MAX_HISTORY_ROWS;
}

export function assertCloudImportPackageLimits(keywords: readonly ExportKeyword[]) {
  const limits = downloadExportLimits();
  if (keywords.length > limits.maxKeywords) {
    throw new Error(
      `Cloud import package downloads currently support up to ${limits.maxKeywords} keywords.`,
    );
  }
  if (
    keywords.some((keyword) => keyword.rankChecks.length > DOWNLOAD_MAX_HISTORY_ROWS_PER_KEYWORD)
  ) {
    throw new Error(
      `Cloud import package downloads currently support up to ${DOWNLOAD_MAX_HISTORY_ROWS_PER_KEYWORD} checks per keyword.`,
    );
  }
}

export function assertPushMigrationKeywordLimit(totalKeywords: number) {
  const limits = pushMigrationLimits();
  if (totalKeywords > limits.maxKeywords) {
    throw new Error(
      `Direct migration push supports up to ${limits.maxKeywords} keywords. Reduce the source project size or raise BISIBILITY_MIGRATION_MAX_KEYWORDS.`,
    );
  }
}
