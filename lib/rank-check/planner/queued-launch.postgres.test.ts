import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { databaseSchemaFromUrl } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { claimQueuedRankCheckRun } from "./queued-launch";

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL is required for the PostgreSQL queued-launch race test.");
  }
  return value;
}

const databaseUrl = requiredDatabaseUrl();

function postgresClient() {
  return new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: databaseUrl, max: 1 },
      { schema: databaseSchemaFromUrl(databaseUrl) },
    ),
  });
}

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function waitForBlockedTransaction(input: { holderPid: number; waiterPid: number }) {
  const inspector = new Client({ connectionString: databaseUrl });
  await inspector.connect();
  try {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await inspector.query<{ blocked: boolean }>(
        `
          SELECT EXISTS (
            SELECT 1
            FROM pg_locks waiting
            JOIN pg_locks holding
              ON holding.locktype = waiting.locktype
              AND holding.transactionid IS NOT DISTINCT FROM waiting.transactionid
            WHERE waiting.pid = $1
              AND holding.pid = $2
              AND NOT waiting.granted
              AND holding.granted
          ) AS blocked
        `,
        [input.waiterPid, input.holderPid],
      );
      if (result.rows[0]?.blocked) return;
      await delay(20);
    }
  } finally {
    await inspector.end();
  }
  throw new Error("Second launcher did not block on the first transaction's lease.");
}

describe("queued rank-check run launch race against PostgreSQL", () => {
  const primary = postgresClient();
  const contender = postgresClient();
  const suffix = randomUUID();
  const userId = `queued-launch-user-${suffix}`;
  const projectId = `queued-launch-project-${suffix}`;
  const runId = `queued-launch-run-${suffix}`;
  const workflowId = `rank-check-run-${suffix}`;

  afterEach(async () => {
    await primary.project.deleteMany({ where: { id: projectId } });
    await primary.user.deleteMany({ where: { id: userId } });
    await Promise.all([primary.$disconnect(), contender.$disconnect()]);
  });

  it("persists one lease and starts one workflow when two transactions interleave", async () => {
    await primary.user.create({
      data: {
        email: `queued-launch-${suffix}@example.test`,
        id: userId,
        name: "Queued launch race fixture",
        publicId: makePublicId("usr"),
      },
    });
    await primary.project.create({
      data: {
        domain: `queued-launch-${suffix}.example.test`,
        id: projectId,
        name: "Queued launch race fixture",
        ownerId: userId,
        publicId: makePublicId("prj"),
      },
    });
    await primary.rankCheckRun.create({
      data: {
        id: runId,
        orchestrationWorkflowId: workflowId,
        projectId,
        publicId: makePublicId("rcr"),
        selectionHash: "queued-launch-race",
        selectionKind: "scheduled_due",
        selectionSpec: { fixture: "queued-launch-race" },
        status: "queued",
        trigger: "scheduled",
      },
    });

    const now = new Date("2026-09-05T10:00:00.000Z");
    const firstClaimed = deferred();
    const releaseFirst = deferred();
    const secondEntered = deferred();
    let firstPid = 0;
    let secondPid = 0;
    const workflowStarts: Array<{ runId: string; workflowId: string }> = [];
    const startRun = async (input: { runId: string; workflowId: string }) => {
      workflowStarts.push(input);
      if (workflowStarts.length > 1) throw new Error("A second transaction started the workflow.");
      firstClaimed.resolve();
      await releaseFirst.promise;
      return { alreadyExists: false };
    };

    const first = primary.$transaction(async (tx) => {
      const pids = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      firstPid = pids[0]?.pid ?? 0;
      return claimQueuedRankCheckRun({ now, runId, startRun, workflowId }, tx as never);
    });
    await firstClaimed.promise;

    const second = contender.$transaction(async (tx) => {
      const pids = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      secondPid = pids[0]?.pid ?? 0;
      secondEntered.resolve();
      return claimQueuedRankCheckRun({ now, runId, startRun, workflowId }, tx as never);
    });
    await secondEntered.promise;
    expect(firstPid).toBeGreaterThan(0);
    expect(secondPid).toBeGreaterThan(0);
    await waitForBlockedTransaction({ holderPid: firstPid, waiterPid: secondPid });
    releaseFirst.resolve();

    await expect(Promise.all([first, second])).resolves.toEqual([
      { claimed: true, launched: true, runId },
      { claimed: false, launched: false, runId },
    ]);
    await expect(
      primary.rankCheckRun.findUniqueOrThrow({ where: { id: runId } }),
    ).resolves.toMatchObject({
      claimedAt: now,
      status: "queued",
    });
    expect(workflowStarts).toEqual([{ runId, workflowId }]);
  });
});
