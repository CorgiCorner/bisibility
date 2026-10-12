import type { PrismaClient } from "@/lib/generated/prisma/client";
import { vi } from "vitest";
import { byokTestEvidence } from "./byok-test-evidence";

type Row = Record<string, unknown> & { id: string };
/** Neutral evidence fixture with a flattened receipt view for transport assertions. */
export function byokTestJournal(provider: string, seed: Row[] = []) {
  const evidence = byokTestEvidence(provider);
  for (const row of seed)
    evidence.rows.push({
      namespace: "test",
      principal: "owner_1",
      projectId: "project_1",
      provider,
      feature: "rank_check",
      source: "app",
      unit: "units",
      createdAt: new Date(),
      estimate: {},
      discarded: false,
      canonicalId: null,
      proofVersion: 0,
      ...row,
      receipt: {
        costCents: String(row.costCents ?? 0),
        quantity: row.usageQuantity == null ? null : String(row.usageQuantity),
        failed: row.failed ?? false,
        cached: row.cached ?? false,
      },
    });
  const db = {
    ...evidence,
    $transaction: vi.fn(async (run: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(evidence.rows);
      try {
        return await run(db);
      } catch (error) {
        evidence.rows.splice(0, evidence.rows.length, ...snapshot);
        throw error;
      }
    }),
  };
  return {
    db: db as unknown as PrismaClient,
    get rows() {
      return evidence.rows.map((row) => {
        const receipt = row.receipt as Record<string, unknown> | undefined;
        return {
          ...row,
          correlationId: row.correlationId,
          measurementStatus: row.measurementStatus,
          discarded: row.discarded,
          costCents: Number(receipt?.costCents ?? 0),
          usageQuantity: receipt?.quantity == null ? null : Number(receipt.quantity),
          failed: receipt?.failed ?? false,
          cached: receipt?.cached ?? false,
          providerRequestId: row.providerRequestId ?? undefined,
        };
      });
    },
    table: { ...evidence.meteringUsageEvidence, createMany: evidence.meteringUsageEvidence.create },
  };
}
