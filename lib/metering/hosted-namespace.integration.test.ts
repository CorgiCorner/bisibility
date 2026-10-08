import type { PrismaClient } from "@/lib/generated/prisma/client";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: undefined as unknown as PrismaClient,
  snapshot: vi.fn(),
  evidence: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target: unknown, property: string | symbol) =>
        (mocks.prisma as unknown as Record<string | symbol, unknown>)[property],
    },
  ) as unknown as PrismaClient,
}));
vi.mock("@/lib/providers/execution-extension", () => ({
  readDeploymentMeteringSnapshot: mocks.snapshot,
  readDeploymentMeteringEvidence: mocks.evidence,
  readDeploymentMeteringExecutionOwner: vi.fn().mockResolvedValue("legacy"),
}));

import { beginHostedExecution, recordHostedExecution } from "./hosted-sync";
import { Prisma } from "./store/sql";
import { fixture } from "./store/test-fixture";

it("settles retained hosted proof in its original namespace after an environment switch", async () => {
  const f = await fixture();
  const snapshot = {
    schemaVersion: 1 as const,
    namespace: "hosted-original",
    operationKey: "hosted-namespace-operation",
    ownerId: "owner_1",
    walletId: "wallet_1",
    projectId: "project_1",
    connectionId: "connection_1",
    provider: "dataforseo",
    feature: "ranked_keywords",
    source: "app" as const,
    credentialKind: null,
    credentialId: null,
    correlationId: "00000000-0000-4000-8000-000000000001",
    occurredAt: "2026-09-01T00:00:00Z",
    estimatedCostCents: "5.0000",
    estimatedPriceCents: "6.5000",
    estimatedQuantity: "1.000000",
    customerPriceVersion: "price-v1",
    platformPoolId: "account_1",
    providerCredentialVersion: "version_1",
    providerCostOwner: "platform",
  };
  const observation = { ...snapshot };
  const proof = {
    snapshot,
    costCents: "5.0000",
    usageQuantity: "1.000000",
    customerCents: "6.5000",
    failed: false,
    cached: false,
  };
  try {
    mocks.prisma = f.client();
    vi.stubEnv("DATABASE_URL", `${f.url}?schema=${f.schema}`);
    vi.stubEnv("METERING_SHADOW", "on");
    vi.stubEnv("METERING_NAMESPACE", snapshot.namespace);
    await f.client().$executeRaw(Prisma.sql`CREATE TABLE instance_settings (
      key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
    await f.client().$executeRaw(Prisma.sql`
      INSERT INTO instance_settings(key, value) VALUES('metering.shadow.project.project_1','on')`);
    mocks.snapshot.mockResolvedValue(snapshot);
    mocks.evidence.mockResolvedValue(proof);
    await beginHostedExecution(observation, { cents: "5.0000", units: "1.000000" });
    const ref = {
      namespace: snapshot.namespace,
      principal: snapshot.ownerId,
      operationId: snapshot.operationKey,
    };
    expect((await f.store.getOperation(ref))?.state).toBe("dispatch_intended");
    vi.stubEnv("METERING_NAMESPACE", "hosted-current");
    await recordHostedExecution(observation, { costCents: 5, usageQuantity: 1, failed: false });
    const settled = await f.store.getOperation(ref);
    expect(settled?.state).toBe("settled");
    expect(settled?.receipts.at(-1)?.cost.money?.units).toBe(50000n);
    expect(settled?.receipts.at(-1)?.occurredAt).toBe(new Date(snapshot.occurredAt).toISOString());
    expect(await f.store.getOperation({ ...ref, namespace: "hosted-current" })).toBeNull();

    // Historical snapshots without original namespace cannot acquire today's attribution.
    const { namespace: _namespace, ...historical } = snapshot;
    const unknown = { ...historical, operationKey: "hosted-namespace-unknown" };
    mocks.snapshot.mockResolvedValue(unknown);
    mocks.evidence.mockResolvedValue({ ...proof, snapshot: unknown });
    await beginHostedExecution(unknown, { cents: "5.0000", units: "1.000000" });
    await recordHostedExecution(unknown, { costCents: 5, usageQuantity: 1, failed: false });
    expect(
      await f.store.getOperation({
        ...ref,
        namespace: "hosted-current",
        operationId: unknown.operationKey,
      }),
    ).toBeNull();
  } finally {
    vi.unstubAllEnvs();
    await f.client().$executeRaw(Prisma.sql`DROP TABLE IF EXISTS instance_settings`);
    await f.close();
  }
});
