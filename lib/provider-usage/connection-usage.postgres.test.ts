import { randomUUID } from "node:crypto";
import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { aggregateConnectionUsage } from "./connection-usage";
import { assertProviderAllocationAvailable } from "./enforcement";

/**
 * Real-DDL proof of the price-aware connection usage aggregation. The suite
 * may only touch the disposable loopback credits_fixture database through
 * PROVIDER_USAGE_TEST_DATABASE_URL; the shared development database stays
 * off-limits. Fixtures are uniquely owned and cleanup deletes only rows this
 * run inserted. The database is never reset or migrated by this suite.
 */
function fixtureUrl(): string {
  const value = process.env.PROVIDER_USAGE_TEST_DATABASE_URL;
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(
      "PROVIDER_USAGE_TEST_DATABASE_URL is required for the connection usage PostgreSQL suite.",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PROVIDER_USAGE_TEST_DATABASE_URL must be a valid PostgreSQL connection URL.");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("The connection usage PostgreSQL suite must target a loopback host.");
  }
  if (url.pathname !== "/credits_fixture") {
    throw new Error(
      "The connection usage PostgreSQL suite must select the disposable credits fixture.",
    );
  }
  return value;
}

const url = fixtureUrl();
const db = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: url, ...databasePoolConfig(undefined, url), max: 4 },
    { schema: databaseSchemaFromUrl(url) },
  ),
});

const NOW = new Date("2026-09-15T10:00:00.000Z");

type EntryInput = {
  cached?: boolean;
  connectionId?: string;
  costCents: number;
  createdAt?: Date;
  credentialSource?: "own" | "hosted";
  measurementStatus?: "recorded" | "unknown";
  priceCents?: number | null;
  projectId?: string;
  source?: string | null;
  usageQuantity?: number | null;
};

const ownedProjects: string[] = [];
const ownedUsers: string[] = [];

async function fixtureProject(): Promise<{ connectionId: string; projectId: string }> {
  const userId = `priced-usage-user-${randomUUID()}`;
  await db.user.create({
    data: {
      email: `${randomUUID()}@example.com`,
      id: userId,
      name: "Priced usage fixture",
      publicId: makePublicId("usr"),
    },
  });
  ownedUsers.push(userId);
  const projectId = `priced-usage-project-${randomUUID()}`;
  await db.project.create({
    data: {
      domain: "example.com",
      id: projectId,
      name: "Priced usage fixture",
      ownerId: userId,
      publicId: makePublicId("prj"),
      providerAllocationsInitializedAt: NOW,
    },
  });
  ownedProjects.push(projectId);
  return { connectionId: `priced-usage-connection-${randomUUID()}`, projectId };
}

async function entry(projectId: string, connectionId: string, input: EntryInput): Promise<void> {
  await db.providerCostEntry.create({
    data: {
      cached: input.cached ?? false,
      connectionId: input.connectionId ?? connectionId,
      costCents: input.costCents,
      createdAt: input.createdAt ?? new Date("2026-09-10T10:00:00.000Z"),
      credentialSource: input.credentialSource ?? "own",
      measurementStatus: input.measurementStatus ?? "recorded",
      priceCents: input.priceCents,
      projectId: input.projectId ?? projectId,
      source: input.source,
      usageQuantity: input.usageQuantity,
    },
  });
}

beforeEach(async () => {
  ownedProjects.length = 0;
  ownedUsers.length = 0;
});

afterEach(async () => {
  for (const projectId of ownedProjects.splice(0)) {
    await db.providerCostEntry.deleteMany({ where: { projectId } });
    await db.providerConnection.deleteMany({ where: { projectId } });
    await db.project.deleteMany({ where: { id: projectId } });
  }
  for (const userId of ownedUsers.splice(0)) {
    await db.user.deleteMany({ where: { id: userId } });
  }
});

afterAll(async () => {
  await db.$disconnect();
});

describe("aggregateConnectionUsage against real PostgreSQL", () => {
  it("keeps own-key rows on provider cost", async () => {
    const { connectionId, projectId } = await fixtureProject();
    await entry(projectId, connectionId, { costCents: 10.5, priceCents: null });
    await entry(projectId, connectionId, { costCents: 4.5, priceCents: 99 });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "own",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 2, unconfirmedCount: 0, used: 15 });
  });

  it("charges a hosted row its price rather than the provider cost", async () => {
    const { connectionId, projectId } = await fixtureProject();
    await entry(projectId, connectionId, {
      costCents: 10,
      credentialSource: "hosted",
      priceCents: 13,
    });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "hosted",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 0, used: 13 });
  });

  it("keeps own-key cost and credits price apart across a mode switch", async () => {
    const { connectionId, projectId } = await fixtureProject();
    await entry(projectId, connectionId, {
      costCents: 10,
      credentialSource: "own",
      priceCents: null,
    });
    await entry(projectId, connectionId, {
      costCents: 20,
      credentialSource: "hosted",
      priceCents: 13,
    });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "own",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 0, used: 10 });
    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "hosted",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 0, used: 13 });
  });

  it("treats an explicit zero hosted price as confirmed free usage", async () => {
    const { connectionId, projectId } = await fixtureProject();
    await entry(projectId, connectionId, {
      costCents: 10,
      credentialSource: "hosted",
      priceCents: 0,
    });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "hosted",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 0, used: 0 });
  });

  it("reports a recorded hosted row without a price as unconfirmed and blocks the cap", async () => {
    const { connectionId, projectId } = await fixtureProject();
    await entry(projectId, connectionId, { costCents: 10, credentialSource: "own" });
    await entry(projectId, connectionId, {
      costCents: 20,
      credentialSource: "hosted",
      priceCents: null,
    });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "hosted",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 1, used: 0 });

    await db.providerConnection.create({
      data: {
        credentialSource: "hosted",
        creditsAllocationAmountPerMonth: 12,
        id: connectionId,
        kind: "serp",
        projectId,
        provider: "metered",
        publicId: makePublicId("conn"),
        status: "connected",
      },
    });
    await expect(
      assertProviderAllocationAvailable(
        {
          catalog: [
            {
              allocation: {
                allocationUnit: "cents",
                billing: "metered",
                kind: "billable",
                quotaReset: "none",
              },
              id: "metered",
              kind: "serp",
              label: "Metered",
              defaultStatus: "ready",
            },
          ] as const,
          connectionId,
          estimatedCostCents: 1,
          now: NOW,
          projectId,
          provider: "metered",
          surface: "app",
        },
        db,
      ),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
  });

  it("keeps scope exact across connection, project, month, cache, and surface", async () => {
    const { connectionId, projectId } = await fixtureProject();
    const other = await fixtureProject();
    await entry(projectId, connectionId, { costCents: 7, credentialSource: "own" });
    await entry(projectId, connectionId, {
      cached: true,
      costCents: 100,
      credentialSource: "hosted",
      priceCents: 100,
    });
    await entry(projectId, connectionId, {
      costCents: 50,
      credentialSource: "own",
      createdAt: new Date("2026-08-10T10:00:00.000Z"),
    });
    await entry(projectId, "priced-usage-other-connection", {
      costCents: 60,
      credentialSource: "own",
    });
    await entry(other.projectId, other.connectionId, { costCents: 70, credentialSource: "own" });
    await entry(projectId, connectionId, {
      costCents: 5,
      credentialSource: "hosted",
      priceCents: 5,
      source: "api",
    });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "own",
        now: NOW,
        projectId,
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 0, used: 7 });
    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "hosted",
        now: NOW,
        projectId,
        surface: "app",
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 0, unconfirmedCount: 0, used: 0 });
    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "hosted",
        now: NOW,
        projectId,
        surface: "programmatic",
        unit: "cents",
      }),
    ).resolves.toEqual({ requestCount: 1, unconfirmedCount: 0, used: 5 });
  });

  it("keeps own-key units on measured quantities and leaves credits rows out", async () => {
    const { connectionId, projectId } = await fixtureProject();
    await entry(projectId, connectionId, { costCents: 1, usageQuantity: 2.5 });
    await entry(projectId, connectionId, {
      costCents: 2,
      credentialSource: "hosted",
      priceCents: 3,
      usageQuantity: 1.5,
    });
    await entry(projectId, connectionId, { costCents: 3, usageQuantity: null });
    await entry(projectId, connectionId, { costCents: 4, measurementStatus: "unknown" });

    await expect(
      aggregateConnectionUsage(db, {
        connectionId,
        credentialSource: "own",
        now: NOW,
        projectId,
        unit: "units",
      }),
    ).resolves.toEqual({ requestCount: 3, unconfirmedCount: 2, used: 2.5 });
  });
});
