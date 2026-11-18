import { createModelUsageReceipt } from "@/lib/model-playground/usage";
import {
  binding,
  measuredResult,
  present,
  pricedBinding,
  reportedResult,
} from "@/lib/model-playground/usage.test-support";
import {
  bindModelUsageEvidence,
  loadModelUsageEvidence,
  persistModelUsageEvidence,
} from "@/lib/model-playground/usage-storage";
import { usageStorageHarness } from "@/lib/model-playground/usage-storage.test-support";
import { PGlite } from "@electric-sql/pglite";
import type { Receipt } from "@usagekit/core";
import {
  createPostgresStore,
  migratePostgresStore,
  type PostgresDriver,
} from "@usagekit/store-postgres";
import { expect, it } from "vitest";
import { modelUsageMeasurements, modelUsageMeterReceipt } from "./model-usage";

const f = usageStorageHarness();
it.each([false, true])(
  "installed PostgreSQL Meter settlement state with reported money = %s",
  async (reported) => {
    const db = new PGlite();
    const driver: PostgresDriver = {
      transaction: (_readOnly, body) =>
        db.transaction((tx) =>
          body({
            query: async <T>(query: { text: string; values: unknown[] }) =>
              (await tx.query<T>(query.text, query.values)).rows,
            execute: async (query) => (await tx.query(query.text, query.values)).affectedRows ?? 0,
          }),
        ),
    };
    try {
      await migratePostgresStore({ driver });
      const now = new Date("2026-11-12T00:00:00Z");
      const store = await createPostgresStore({ driver, clock: { now: () => now } });
      const bound = reported ? pricedBinding() : binding();
      const response = reported ? reportedResult("0.000123") : measuredResult();
      const native = createModelUsageReceipt(bound, response);
      await f.transaction(async (tx) => {
        await bindModelUsageEvidence(tx, "attempt-1", bound);
        await persistModelUsageEvidence(tx, "attempt-1", response);
      });
      const loaded = present(await loadModelUsageEvidence(f.tx, "attempt-1", bound.projectId));
      if (!reported)
        expect(() => modelUsageMeterReceipt(loaded, now)).toThrow(
          "Meter companion required for native usage settlement independent of money.",
        );
      const receipt: Receipt = reported
        ? modelUsageMeterReceipt(loaded, now)
        : {
            id: "quantity-only",
            measurements: modelUsageMeasurements(native),
            cost: { certainty: "unknown", money: null },
            occurredAt: now.toISOString(),
            recordedAt: now.toISOString(),
            cached: false,
            failed: false,
          };
      const reservation = await store.reserve({
        operationId: "native-model",
        scope: {
          namespace: "test",
          principal: "owner",
          group: "project",
          connection: "connection",
        },
        fundingSource: "byok",
        costOwner: "owner",
        surface: "app",
        source: "app",
        provider: "openrouter",
        operation: "model_playground",
        estimate: [{ unit: "input_tokens", value: 100n, scale: 0 }],
      });
      if (reservation.outcome !== "reserved") throw new Error("Reservation fixture failed");
      const grant = await store.markDispatchIntent({
        namespace: "test",
        principal: "owner",
        operationId: "native-model",
        expectedVersion: reservation.operation.version,
        commandId: "dispatch",
        holder: "worker",
        leaseTtlMs: 10000,
      });
      if (!("granted" in grant) || !grant.granted) throw new Error("Dispatch fixture failed");
      const input = {
        namespace: "test",
        principal: "owner",
        operationId: "native-model",
        expectedVersion: grant.operation.version,
        commandId: "settle",
        authority: { kind: "lease" as const, leaseId: grant.lease.leaseId },
        receipt,
      };
      const settled = await store.settle(input);
      expect(settled).toMatchObject({
        outcome: "settled",
        operation: { state: reported ? "settled" : "pending", receipts: [receipt] },
      });
      expect(await store.settle(input)).toMatchObject({
        outcome: "settled",
        replayed: true,
        operation: { receipts: [receipt] },
      });
    } finally {
      await db.close();
    }
  },
);
