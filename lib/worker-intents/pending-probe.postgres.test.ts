import { randomUUID } from "node:crypto";
import { databasePoolConfig, databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, describe, expect, it } from "vitest";
import { WORKER_INTENT_PENDING_PROBE } from "./pending-probe";

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for the PostgreSQL pending-probe test.");
  return value;
}

const databaseUrl = requiredDatabaseUrl();

describe("worker intent pending probe against PostgreSQL", () => {
  // The probe is raw SQL with unqualified table names, so the connection must carry the same
  // search_path the application sets. Prisma's schema option only qualifies its own queries.
  const client = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: databaseUrl, ...databasePoolConfig(undefined, databaseUrl), max: 1 },
      { schema: databaseSchemaFromUrl(databaseUrl) },
    ),
  });
  const suffix = randomUUID();
  const userId = `pending-probe-user-${suffix}`;
  const projectId = `pending-probe-project-${suffix}`;
  const runId = `pending-probe-run-${suffix}`;

  // The probe is a whole-table OR, so a shared database or a live worker could answer it. The
  // fixture-scoped copy asks the same question about this run alone and stays deterministic.
  const scopedProbe = Prisma.sql`
    SELECT EXISTS (
      SELECT 1
      FROM "rank_check_runs"
      WHERE "id" = ${runId}
        AND "status" = 'queued'
        AND "claimedAt" IS NULL
        AND "orchestrationWorkflowId" IS NOT NULL
    ) AS "pending"
  `;
  const pendingForRun = async () => {
    const [row] = await client.$queryRaw<Array<{ pending: boolean }>>(scopedProbe);
    return row?.pending ?? false;
  };
  const pendingAnywhere = async () => {
    const [row] = await client.$queryRaw<Array<{ pending: boolean }>>(WORKER_INTENT_PENDING_PROBE);
    return row?.pending ?? false;
  };

  afterEach(async () => {
    await client.project.deleteMany({ where: { id: projectId } });
    await client.user.deleteMany({ where: { id: userId } });
    await client.$disconnect();
  });

  it("reports an unclaimed queued run and stops once the run is claimed", async () => {
    await client.user.create({
      data: {
        email: `pending-probe-${suffix}@example.test`,
        id: userId,
        name: "Pending probe fixture",
        publicId: makePublicId("usr"),
      },
    });
    await client.project.create({
      data: {
        domain: `pending-probe-${suffix}.example.test`,
        id: projectId,
        name: "Pending probe fixture",
        ownerId: userId,
        publicId: makePublicId("prj"),
      },
    });
    await client.rankCheckRun.create({
      data: {
        id: runId,
        orchestrationWorkflowId: `rank-check-run-${suffix}`,
        projectId,
        publicId: makePublicId("rcr"),
        selectionHash: "pending-probe",
        selectionKind: "single",
        selectionSpec: { fixture: "pending-probe" },
        status: "queued",
        trigger: "manual",
      },
    });

    // The shipped probe must see this run, and the scoped copy proves the clause is what saw it.
    expect(await pendingAnywhere()).toBe(true);
    expect(await pendingForRun()).toBe(true);

    await client.rankCheckRun.update({ data: { claimedAt: new Date() }, where: { id: runId } });
    expect(await pendingForRun()).toBe(false);
  });
});
