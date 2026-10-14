import "server-only";
import type { MonitorRetryApproval } from "@/lib/local-monitor-retry/input-schema";
import { type LocalQuote, localQuoteHash } from "@/lib/local-monitoring/quote";
import { localDigest, requireLocalTime } from "@/lib/local-monitoring-store/canonical";
import {
  createPreviewToken,
  PreviewTokenError,
  verifyPreviewToken,
} from "@/lib/rank-check/runs/preview-token";
export type MonitorConsentBinding = Readonly<{
  actorId: string;
  projectId: string;
  monitorId: string;
  monitorVersion: number;
  revisionId: string;
  scheduleIntentId: string;
  connectionId: string;
  connectionStamp: string;
  targetIds: readonly string[];
  idempotencyKey: string;
  quote: LocalQuote;
  retry?: MonitorRetryApproval;
}>;
function expected(binding: MonitorConsentBinding) {
  const { quote, targetIds, ...source } = binding;
  return {
    projectId: binding.projectId,
    providerId: binding.connectionId,
    depth: null,
    trigger: "manual" as const,
    estimateCents: -1,
    selectionHash: localDigest([
      "local-monitor-manual-selection-v1",
      [...targetIds].sort(),
      [...quote.expectedTargetKeys].sort(),
    ]),
    sourceHash: localDigest(["local-monitor-manual-consent-v1", source, localQuoteHash(quote)]),
  };
}
export function signMonitorConsent(binding: MonitorConsentBinding, now: Date) {
  const signed = createPreviewToken(expected(binding), requireLocalTime(now));
  return {
    token: signed.token,
    expiresAt: new Date(
      Math.min(signed.expiresAt.getTime(), new Date(binding.quote.expiresAt).getTime()),
    ).toISOString(),
  };
}
export function verifyMonitorConsent(token: string, binding: MonitorConsentBinding, now: Date) {
  if (requireLocalTime(now).getTime() >= new Date(binding.quote.expiresAt).getTime())
    throw new PreviewTokenError("expired");
  return verifyPreviewToken(token, expected(binding), now);
}
