import { createHash } from "node:crypto";
import type { ProviderDispatchIdentity } from "@/lib/generated/prisma/client";
import { now, payload, scope } from "@/lib/provider-evidence/dataforseo/fixtures.test-support";
import { encryptSecret } from "@/lib/providers/crypto";
import { providerRecoveryScope } from "./scope";

export function identityFixture(
  patch: Partial<ProviderDispatchIdentity> = {},
): ProviderDispatchIdentity {
  const { priority: _priority, ...livePayload } = payload;
  const body = JSON.stringify(patch.executionMode === "live" ? livePayload : payload);
  return {
    operationPk: "operation",
    ...providerRecoveryScope(),
    projectId: "old-project",
    connectionId: "original",
    publicConnectionId: "connection",
    rankCheckId: "check",
    rankCheckRunId: null,
    rankCheckRunItemId: null,
    queuedTaskId: null,
    keywordId: "keyword",
    keywordRevision: now,
    executionMode: "queued",
    payerKind: "byok",
    principal: "original-principal",
    costOwner: "original-owner",
    payerAccountRef: "original",
    providerCredentialVersion: "v1",
    provider: "dataforseo",
    feature: "rank_check",
    requestSource: "api",
    requestSurface: "api",
    nativeTag: payload.tag,
    endpointPath:
      patch.executionMode === "live"
        ? "/v3/serp/google/organic/live/advanced"
        : scope.submittedEndpointPath,
    payloadSchemaVersion: 1,
    payloadEncrypted: encryptSecret(body),
    payloadHash: createHash("sha256").update(body).digest("hex"),
    identityHash: "fixture",
    createdAt: new Date("2026-10-23T10:30:00Z"),
    expiresAt: new Date("2027-03-01T00:00:00Z"),
    ...patch,
  };
}
