import { historySourceHash } from "@/lib/metering/history-evidence";
import { historicalOperation } from "@/lib/metering/history-mapping";
import { source } from "@/lib/metering/history-test-data";
import { canonical, encode, hash } from "@/lib/metering/store/codec";
import { type CloseoutManifest, closeoutPolicy } from "./manifest";
import type { CloseoutSnapshot } from "./snapshot";

export function closeoutFixture() {
  const original = source({
    provider: null,
    usageQuantity: null,
    providerRequestId: null,
    correlationId: null,
    keywordId: null,
  });
  const operation = historicalOperation(original, "test", "2026-10-12T00:00:00.000Z");
  const snapshot: CloseoutSnapshot = {
    identity: {
      database: "fixture",
      schema: "public",
      server: "127.0.0.1",
      port: 5432,
      role: "fixture",
      sessionRole: "fixture",
    },
    actor: {
      id: "operator",
      publicId: "usr_operator",
      isInstanceAdmin: true,
      emailVerified: true,
      deactivatedAt: null,
    },
    project: { id: "project", publicId: "prj_fixture" },
    migration: { checksum: "verified", finished: true, verified: true },
    schemaAvailable: true,
    entries: [
      {
        operation,
        source: original,
        journal: {
          source_id: original.id,
          source_hash: historySourceHash(original, []),
          target_hash: hash(canonical(operation)),
          created_operation: true,
          body: JSON.parse(encode({ input: operation, operation })),
          payload: original,
        },
        proofs: [],
        leaseKind: null,
        facts: {
          binding: false,
          evidence: false,
          reference: false,
          retainedIdentity: false,
          commands: 0n,
        },
        budgets: [],
        disposition: null,
      },
    ],
  };
  const manifest: CloseoutManifest = {
    policy: closeoutPolicy,
    namespace: "test",
    projectPublicId: "prj_fixture",
    connection: "connection",
    operator: "usr_operator",
    recordedAt: "2026-10-18T12:00:00.000Z",
    reason: "Original identity irrecoverable after retained evidence search",
    evidenceRef: "operator-case:retained-search",
    operations: [
      {
        operationId: operation.operationId,
        expectedVersion: 1,
        receiptId: operation.receipts[0]!.id,
      },
    ],
  };
  return { snapshot, manifest, now: new Date("2026-10-18T12:01:00.000Z") };
}
