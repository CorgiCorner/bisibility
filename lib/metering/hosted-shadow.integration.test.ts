import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { DeploymentExecution } from "@/lib/providers/execution-extension-types";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: undefined as unknown as PrismaClient,
  startExecution: vi.fn(),
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
  startDeploymentExecution: mocks.startExecution,
}));
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true as const, resetAt: new Date() }),
}));

import { runDeploymentPaidCall } from "@/lib/provider-lookups/paid-call-deployment";
import { createProviderRequestAttribution } from "@/lib/provider-usage/tag";
import { Prisma, transactions } from "./store/sql";
import { fixture } from "./store/test-fixture";

it("returns the hosted provider result when a shadow step throws", async () => {
  const f = await fixture();
  const previous = {
    databaseUrl: process.env.DATABASE_URL,
    shadow: process.env.METERING_SHADOW,
    namespace: process.env.METERING_NAMESPACE,
  };
  try {
    mocks.prisma = f.client();
    process.env.DATABASE_URL = `${f.url}?schema=${f.schema}`;
    process.env.METERING_SHADOW = "on";
    process.env.METERING_NAMESPACE = "hosted-shadow";
    const tx = transactions(f.client(), f.schema, f.counters);
    // The fixture schema carries the metering tables, while the application models resolve
    // through the default search path of the disposable database.
    const client = f.client();
    await client.$executeRaw(
      Prisma.sql`CREATE TABLE instance_settings (
      key text PRIMARY KEY, value text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
    );
    await client.$executeRaw(
      Prisma.sql`CREATE TABLE projects (id text PRIMARY KEY, "ownerId" text NOT NULL)`,
    );
    await client.$executeRaw(
      Prisma.sql`INSERT INTO instance_settings(key, value) VALUES('metering.shadow.project.project_1','on')`,
    );
    await client.$executeRaw(
      Prisma.sql`INSERT INTO projects(id, "ownerId") VALUES('project_1','owner_1')`,
    );
    // The meter store fails its reserve, while the shadow sink stays writable: the hosted
    // provider call must still complete and the failure must land as an observation row.
    await tx.write((sql) => sql.execute(Prisma.sql`DROP TABLE metering_operation CASCADE`));
    mocks.startExecution.mockResolvedValue({
      credentials: { login: "hosted-login", password: "hosted-password" },
      get started() {
        return true;
      },
      get costCents() {
        return 5;
      },
      get quantity() {
        return 1;
      },
      async finish() {},
    } satisfies DeploymentExecution);
    const attribution = await createProviderRequestAttribution({
      correlationId: "00000000-0000-4000-8000-000000000001",
      feature: "ranked_keywords",
      projectId: "project_1",
      source: "app",
      trigger: "manual",
    });
    const result = await runDeploymentPaidCall({
      attribution,
      call: async () => ({ costCents: 5 }),
      connectionId: "connection_1",
      estimatedCostCents: 5,
      estimatedQuantity: 1,
      provider: "dataforseo",
    });
    expect(result).toEqual({ costCents: 5 });
    const [failures] = await tx.read((sql) =>
      sql.query<{ count: bigint }>(Prisma.sql`
        SELECT count(*) AS count FROM metering_shadow
        WHERE failures > 0 AND funding_source = 'platform'`),
    );
    expect(failures?.count).toBeGreaterThan(0n);
  } finally {
    if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous.databaseUrl;
    if (previous.shadow === undefined) delete process.env.METERING_SHADOW;
    else process.env.METERING_SHADOW = previous.shadow;
    if (previous.namespace === undefined) delete process.env.METERING_NAMESPACE;
    else process.env.METERING_NAMESPACE = previous.namespace;
    await f
      .client()
      .$executeRaw(Prisma.sql`DROP TABLE IF EXISTS instance_settings, projects`)
      .catch(() => undefined);
    await f.close();
  }
});
