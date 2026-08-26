import { downloadExportLimits } from "@/lib/migration/limits";

export function assertKeywordExportMembershipLimit(count: number) {
  const { maxKeywords } = downloadExportLimits();
  if (count > maxKeywords) {
    throw new Error(
      `Instance import package downloads currently support up to ${maxKeywords} keywords.`,
    );
  }
}

export function keywordExportMembershipProbeLimit() {
  return downloadExportLimits().maxKeywords + 1;
}
