import type { Prisma } from "@/lib/generated/prisma/client";
import type { Budget, Receipt } from "@usagekit/core";
import type { PaidAttemptInput } from "./paid-attempt-types";
import { Prisma as SqlPrisma } from "./store/sql";
import { fixture } from "./store/test-fixture";

export const input = (
  operationId = crypto.randomUUID(),
  connectionId = "connection",
): PaidAttemptInput => ({
  reservation: {
    operationId,
    scope: {
      namespace: "test",
      principal: "owner",
      group: "project",
      connection: connectionId,
      providerCredentialVersion: "version",
    },
    fundingSource: "byok",
    costOwner: "owner",
    surface: "app",
    source: "app",
    provider: "dataforseo",
    operation: "rank_check",
    estimate: [
      { unit: "cents", value: 2n, scale: 0 },
      { unit: "requests", value: 1n, scale: 0 },
    ],
    reservationTtlMs: 60000,
  },
  context: {
    projectId: "project",
    connectionId,
    publicConnectionId: "public-connection",
    providerCredentialVersion: "version",
    correlationId: "correlation",
    rankCheckRunId: "run",
  },
});
export const budget = (
  unit = "budget_cents",
  limit = 3n,
  kind: "group" | "connection" = "group",
): Budget => ({
  id: `${kind}:${unit}`,
  version: 1,
  scope:
    kind === "group"
      ? { kind, namespace: "test", group: "project" }
      : { kind, namespace: "test", connection: "connection" },
  surface: "any",
  unit,
  limit: { unit, value: limit, scale: 0 },
  onExceed: "block",
  window: { kind: "calendar_month", timezone: "UTC" },
});
export const nativeReceipt = (unknown = false): Receipt => ({
  id: crypto.randomUUID(),
  source: "dispatch",
  cost: unknown
    ? { certainty: "unknown", money: null }
    : { certainty: "measured", money: { units: 20000n, currency: "USD" } },
  measurements: [
    {
      unit: "requests",
      certainty: "measured",
      quantity: { unit: "requests", value: 1n, scale: 0 },
    },
  ],
  cached: false,
  failed: unknown,
  occurredAt: "2026-09-01T00:00:00.000Z",
  recordedAt: "2026-09-01T00:00:00.000Z",
});
export async function paidFixture() {
  const f = await fixture();
  const run = <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
    f.client().$transaction(
      async (tx) => {
        await tx.$executeRaw(SqlPrisma.sql`SET LOCAL search_path TO ${SqlPrisma.raw(f.schema)}`);
        return body(tx);
      },
      { timeout: 30000 },
    );
  return { ...f, run, options: { clock: f.clock, verifyBinding: async () => {} } };
}

export function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Missing paid attempt fixture value");
  return value;
}
