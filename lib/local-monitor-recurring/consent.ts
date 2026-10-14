import "server-only";
import { localQuoteHash } from "@/lib/local-monitoring/quote";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import {
  createPreviewToken,
  PreviewTokenError,
  verifyPreviewToken,
} from "@/lib/rank-check/runs/preview-token";
import type { RecurringApprovalSnapshot } from "./schema";

function expected(binding: RecurringApprovalSnapshot) {
  return {
    projectId: binding.internalProjectId,
    providerId: binding.connectionId,
    depth: null,
    trigger: "manual" as const,
    estimateCents: -1,
    selectionHash: localDigest([
      "local-monitor-recurring-targets-v1",
      [...binding.targetIds].sort(),
    ]),
    sourceHash: localDigest([
      "local-monitor-recurring-consent-v1",
      binding,
      localQuoteHash(binding.quote),
    ]),
  };
}
export function signRecurringConsent(binding: RecurringApprovalSnapshot, now: Date) {
  if (new Date(binding.validUntil) <= now) throw new Error("Approval validity must be future.");
  const signed = createPreviewToken(expected(binding), now);
  return {
    token: signed.token,
    expiresAt: new Date(
      Math.min(signed.expiresAt.getTime(), Date.parse(binding.quote.expiresAt)),
    ).toISOString(),
  };
}
export function verifyRecurringConsent(
  token: string,
  binding: RecurringApprovalSnapshot,
  now: Date,
) {
  if (
    now.getTime() >= Date.parse(binding.quote.expiresAt) ||
    now.getTime() >= Date.parse(binding.validUntil)
  )
    throw new PreviewTokenError("expired");
  return verifyPreviewToken(token, expected(binding), now);
}
