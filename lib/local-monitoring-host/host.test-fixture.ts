import { executionFixture } from "@/lib/local-monitoring/execution.test-fixture";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { localQuoteHash } from "@/lib/local-monitoring/quote";
import { applySubmissionEvent, initialSubmission } from "@/lib/local-monitoring/submission-state";
import { executionTargetKey, operationKey } from "@/lib/local-monitoring/target-key";
import type { LocalSubmissionOutcome } from "@/lib/providers/local-search/contracts";
import { originalCustodySchema } from "./proof-schema";

export function originalReply(): LocalSubmissionOutcome {
  return {
    acceptance: "accepted",
    taskIds: ["00000000-0000-4000-8000-000000000001"],
    receivedAt: "2026-10-12T12:00:00.000Z",
    usage: {
      cached: false,
      costCents: 1,
      quantity: 1,
      failed: false,
      providerRequestId: "synthetic-original-native",
    },
    taskCharges: [
      { taskId: "00000000-0000-4000-8000-000000000001", statusCode: 20100, costUsd: 0.01 },
    ],
    envelopeCostUsd: 0.01,
    dispatchEvidenceVerified: true,
  };
}
export function hostRecord(): SubmissionRecord {
  const f = executionFixture();
  const initial = initialSubmission({
    key: operationKey(f.scope),
    scope: f.scope,
    targetKey: executionTargetKey(f.target),
    quoteHash: localQuoteHash(f.quote),
    provider: "dataforseo",
    adapterVersion: "synthetic-adapter-v1",
    providerPriceVersion: "synthetic-price-v1",
  });
  const fenced = applySubmissionEvent(initial, {
    kind: "possible_send",
    attemptId: "synthetic-attempt",
  });
  const reply = originalReply();
  return {
    ...applySubmissionEvent(fenced, {
      kind: "outcome",
      attemptId: "synthetic-attempt",
      outcome: {
        acceptance: reply.acceptance,
        taskIds: reply.taskIds,
        receivedAt: reply.receivedAt,
        usage: reply.usage,
      },
    }),
    settlementRecorded: true,
  };
}
export function hostCustody() {
  const record = hostRecord();
  return originalCustodySchema.parse({
    projectId: record.scope.projectId,
    namespace: "synthetic-local-host",
    principal: "synthetic-principal",
    provider: "dataforseo",
    connectionId: "synthetic-connection",
    credentialVersion: "synthetic-credential-hash",
    correlationId: record.key,
    attemptId: record.attemptId,
    preparedAttemptId: record.attemptId,
    preparedLeaseId: "synthetic-lease",
    requestHash: "synthetic-request-hash",
    operationKey: record.key,
    targetKey: record.targetKey,
    adapterVersion: record.adapterVersion,
    device: "desktop",
  });
}
