import { classifyActionError, type SharedErrorMessages } from "@/lib/ui/action-error";

type CloudBackupErrorMessages = {
  exportFallback: () => string;
  keywordLimit: (values: { limit: number }) => string;
  rankCheckLimit: (values: { limit: number }) => string;
  unsupportedHistory: () => string;
};

const keywordLimitPattern =
  /^Instance import package downloads currently support up to (\d+) keywords\.$/;
const rankCheckLimitPattern =
  /^Instance import package downloads currently support up to (\d+) checks per keyword\.$/;
const unsupportedHistoryMessage =
  "Completed rank check is missing a supported normalization version.";

function limitFromMessage(message: string, pattern: RegExp) {
  const match = pattern.exec(message);
  if (!match) return null;
  const limit = Number(match[1]);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : null;
}

/**
 * Cloud package actions intentionally recognize only their stable domain failures.
 * Unknown server diagnostics stay private while stale deployments and digest references
 * retain the shared recovery guidance supplied by the enclosing shell catalog.
 */
export function presentCloudBackupActionError(
  error: unknown,
  sharedErrors: SharedErrorMessages,
  messages: CloudBackupErrorMessages,
) {
  const classified = classifyActionError(error);
  switch (classified.kind) {
    case "staleDeployment":
      return sharedErrors.staleDeployment();
    case "serverComponentDigest":
      return sharedErrors.serverComponentDigest({ digest: classified.digest });
    case "ownedMessage": {
      const keywordLimit = limitFromMessage(classified.message, keywordLimitPattern);
      if (keywordLimit !== null) return messages.keywordLimit({ limit: keywordLimit });

      const rankCheckLimit = limitFromMessage(classified.message, rankCheckLimitPattern);
      if (rankCheckLimit !== null) return messages.rankCheckLimit({ limit: rankCheckLimit });

      return classified.message === unsupportedHistoryMessage
        ? messages.unsupportedHistory()
        : messages.exportFallback();
    }
    case "fallback":
      return messages.exportFallback();
  }
}
