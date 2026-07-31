import type { KeywordExportOptions, KeywordExportRow } from "./keyword-import-export-helpers";
import { selectedChecks } from "./keyword-import-export-helpers";

export function keywordExportJson(
  keywords: KeywordExportRow[],
  options: KeywordExportOptions,
  projectId: string,
) {
  return {
    exportedAt: new Date().toISOString(),
    keywords: keywords.map((row) => ({
      device: row.device,
      id: row.publicId,
      keyword: row.text,
      location: row.location,
      intent: row.intent,
      rankingHistory: selectedChecks(row, options).map((check) => ({
        checkedAt: check.checkedAt.toISOString(),
        normalizationVersion: check.normalizationVersion,
        position: check.position,
        previousPosition: check.previousPosition,
        provider: check.provider,
        rankingUrl: check.rankingUrl,
        requestedDepth: check.requestedDepth,
      })),
      tags: row.tags.map((item) => item.tag.name),
      targetUrl: row.targetUrl,
      topic: row.topic,
    })),
    projectId,
    scope: options.scope,
  };
}
