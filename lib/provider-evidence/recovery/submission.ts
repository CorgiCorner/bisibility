import "server-only";
import { createHash } from "node:crypto";
import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { decryptSecret } from "@/lib/providers/crypto";

export type RetainedSubmission = Pick<ProviderDispatchIdentity, "endpointPath" | "nativeTag"> & {
  payload: Record<string, unknown>;
};
export type IdentityReviewReason =
  | "missing_dispatch_identity"
  | "untagged_live_task"
  | "invalid_retained_payload"
  | "identity_expired";
export function retainedSubmission(
  identity: ProviderDispatchIdentity | null,
  now = new Date(),
):
  | { kind: "retained"; submission: RetainedSubmission }
  | { kind: "operator_review"; reason: IdentityReviewReason } {
  if (!identity) return { kind: "operator_review", reason: "missing_dispatch_identity" };
  if (identity.executionMode === "live" && !identity.nativeTag)
    return { kind: "operator_review", reason: "untagged_live_task" };
  if (identity.expiresAt <= now) return { kind: "operator_review", reason: "identity_expired" };
  try {
    const body = decryptSecret(identity.payloadEncrypted);
    const payload: unknown = JSON.parse(body);
    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload) ||
      createHash("sha256").update(body).digest("hex") !== identity.payloadHash ||
      (payload as Record<string, unknown>).tag !== identity.nativeTag
    )
      throw new Error("Invalid payload");
    return {
      kind: "retained",
      submission: {
        endpointPath: identity.endpointPath,
        nativeTag: identity.nativeTag,
        payload: payload as Record<string, unknown>,
      },
    };
  } catch {
    return { kind: "operator_review", reason: "invalid_retained_payload" };
  }
}
