import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { classifyRecoveryRecord } from "@/lib/metering/recovery/classify";
import { readRecoveryRecords } from "@/lib/metering/recovery/query";
import { meteringRuntime } from "@/lib/metering/runtime";
import { reconcileProviderUsage } from "@/lib/provider-usage/reconcile";
import { reconciliationHealth } from "@/lib/provider-usage/reconcile-state";
import { encryptSecret } from "@/lib/providers/crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { maintainQueuedTaskCosts } from "./queued-cost-recovery";
import {
  type CostRecoveryCase,
  costRecoveryFixture,
  fixtureCredentials,
} from "./queued-cost-recovery.postgres.test-fixture";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
const url = new URL(process.env.METERING_TEST_DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_fixture"))
  throw new Error("Queued cost recovery tests require a disposable loopback fixture database.");
shared.db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }),
});

let namespace: string;
let fx: ReturnType<typeof costRecoveryFixture>;
const fetchMock = vi.fn();
beforeEach(() => {
  namespace = `queued-cost-${randomUUID()}`;
  vi.stubEnv("DATABASE_URL", url.toString());
  vi.stubEnv("METERING_NAMESPACE", namespace);
  vi.stubEnv("METERING_SHADOW", "on");
  vi.stubEnv("BISIBILITY_PROVIDER_RATE_LIMIT_DISABLED", "true");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fx = costRecoveryFixture(shared.db, namespace);
});
afterEach(async () => {
  await prisma.$executeRaw`DELETE FROM metering_paid_attempt_context WHERE namespace=${namespace}`;
  await prisma.meteringUsageEvidence.deleteMany({ where: { namespace } });
  await prisma.$executeRaw`DELETE FROM metering_event WHERE namespace=${namespace}`;
  await prisma.$executeRaw`DELETE FROM metering_measurement WHERE receipt_pk IN
    (SELECT r.receipt_pk FROM metering_receipt r JOIN metering_operation o ON o.operation_pk=r.operation_pk WHERE o.namespace=${namespace})`;
  await prisma.$executeRaw`DELETE FROM metering_receipt WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${namespace})`;
  await prisma.$executeRaw`DELETE FROM metering_command WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${namespace})`;
  await prisma.meteringOperation.deleteMany({ where: { namespace } });
  await prisma.$executeRaw`DELETE FROM metering_budget_usage WHERE namespace=${namespace}`;
  await prisma.$executeRaw`DELETE FROM metering_budget WHERE namespace=${namespace}`;
  await fx.cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(() => prisma.$disconnect());

const taskGet = (id: string, task: Record<string, unknown> = {}) =>
  Response.json({
    status_code: 20000,
    tasks: [
      {
        id,
        status_code: 20000,
        cost: 0.0006,
        result: [{ items: [] }],
        ...task,
      },
    ],
  });
const maintain = (now = new Date()) => maintainQueuedTaskCosts({ now, namespace, client: prisma });
const task = (c: CostRecoveryCase) =>
  prisma.queuedRankCheckTask.findUniqueOrThrow({ where: { id: c.taskId } });
const operation = async (c: CostRecoveryCase) =>
  (await meteringRuntime()).store.getOperation({
    namespace,
    principal: c.ownerId,
    operationId: c.operationId,
  });
const consoleReason = async (c: CostRecoveryCase) => {
  const [row] = await prisma.$transaction((tx) =>
    readRecoveryRecords(tx, namespace, {
      to: new Date(),
      identity: { kind: "operation", id: c.operationId },
      limit: 1,
    }),
  );
  return classifyRecoveryRecord(row, { actor: "admin", namespace, instance: "fixture" }, new Date())
    .blockedReason;
};
const unconfirmed = () =>
  prisma.$transaction((tx) => reconciliationHealth(tx, namespace, new Date()));

it("records the provider cost, then the reconciler settles it and the gate stops deferring", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () => taskGet(c.nativeId as string));
  expect(await operation(c)).toMatchObject({ state: "dispatch_intended" });
  expect((await unconfirmed()).unconfirmed).toBe(1);

  expect(await maintain()).toMatchObject({ recovered: 1 });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(calledUrl).toContain(`/task_get/advanced/${c.nativeId}`);
  expect((init.headers as Record<string, string>).Authorization).toBe(
    `Basic ${Buffer.from(`${fixtureCredentials.login}:${fixtureCredentials.password}`).toString("base64")}`,
  );
  const stored = await task(c);
  expect(Number(stored.costCents)).toBeCloseTo(0.06, 4);
  expect(stored.costEvidence).toMatchObject({
    v: 1,
    status: "recovered",
    source: "task_get",
    providerTaskId: c.nativeId,
    statusCode: 20000,
  });
  expect(JSON.stringify(stored.costEvidence)).not.toContain(fixtureCredentials.password);

  expect(await reconcileProviderUsage(prisma, { namespace })).toMatchObject({
    reconciled: 1,
  });
  const settled = await operation(c);
  expect(settled).toMatchObject({ state: "settled" });
  expect(settled?.receipts.at(-1)?.providerRequestId).toBe(c.nativeId);
  expect(settled?.receipts.at(-1)?.cost.certainty).toBe("measured");
  expect((await unconfirmed()).unconfirmed).toBe(0);

  expect(await maintain()).toMatchObject({ examined: 0 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

const DAY = 24 * 3600_000;

it("writes no cost and names the reason when the provider reports the task as not found", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () =>
    Response.json({ status_code: 40400, status_message: "Not Found." }),
  );
  expect(await consoleReason(c)).toBe("proof_missing");
  expect(await maintain()).toMatchObject({ unrecoverable: 1 });
  expect(await consoleReason(c)).toBe("provider_cost_unrecoverable");
  const stored = await task(c);
  expect(stored.costCents).toBeNull();
  expect(stored.costEvidence).toMatchObject({
    status: "unrecoverable",
    reason: "provider_task_unavailable",
    statusCode: 40400,
  });
  expect(await reconcileProviderUsage(prisma, { namespace })).toMatchObject({
    reconciled: 0,
  });
  expect(await operation(c)).toMatchObject({ state: "dispatch_intended" });
  expect((await unconfirmed()).unconfirmed).toBe(1);
  expect(await maintain()).toMatchObject({ examined: 0 });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("treats a single absent task as retryable, recovers on a later answer and gives up only at the cap", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () =>
    Response.json({
      status_code: 20000,
      tasks: [{ id: randomUUID(), status_code: 20000 }],
    }),
  );
  const start = new Date();
  expect(await maintain(start)).toMatchObject({ retry: 1, unrecoverable: 0 });
  expect((await task(c)).costEvidence).toMatchObject({
    status: "retry",
    reason: "provider_task_unavailable",
    attempts: 1,
  });
  expect(await consoleReason(c)).toBe("provider_cost_pending");
  // An empty task list is the same glitch, and a later full answer recovers the cost.
  fetchMock.mockImplementation(async () => Response.json({ status_code: 20000, tasks: [] }));
  expect(await maintain(new Date(start.getTime() + DAY))).toMatchObject({
    retry: 1,
  });
  fetchMock.mockImplementation(async () => taskGet(c.nativeId as string));
  expect(await maintain(new Date(start.getTime() + 2 * DAY))).toMatchObject({
    recovered: 1,
  });
  expect(Number((await task(c)).costCents)).toBeCloseTo(0.06, 4);

  const never = await fx.create();
  fetchMock.mockImplementation(async () => Response.json({ status_code: 20000, tasks: [] }));
  for (let attempt = 1; attempt <= 6; attempt++)
    await maintain(new Date(start.getTime() + (10 + attempt) * DAY));
  expect((await task(never)).costEvidence).toMatchObject({
    status: "unrecoverable",
    reason: "provider_task_unavailable",
    attempts: 6,
  });
});

it("does not treat a duplicated task id as final", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () =>
    Response.json({
      status_code: 20000,
      tasks: [
        { id: c.nativeId, status_code: 20000, cost: 0.0006 },
        { id: c.nativeId, status_code: 20000, cost: 0.0006 },
      ],
    }),
  );
  expect(await maintain()).toMatchObject({ retry: 1, unrecoverable: 0 });
  expect((await task(c)).costCents).toBeNull();
});

it("treats a provider not-found task status as final and an unfinished or costless one as retryable", async () => {
  const gone = await fx.create();
  fetchMock.mockImplementation(async () =>
    taskGet(gone.nativeId as string, { status_code: 40401 }),
  );
  await maintain();
  expect((await task(gone)).costEvidence).toMatchObject({
    reason: "provider_task_unavailable",
  });
  const costless = await fx.create();
  fetchMock.mockImplementation(async () =>
    taskGet(costless.nativeId as string, { cost: undefined }),
  );
  await maintain();
  expect((await task(costless)).costCents).toBeNull();
  expect((await task(costless)).costEvidence).toMatchObject({
    status: "retry",
    reason: "cost_not_reported",
    attempts: 1,
  });
});

it("backs off retries, counts attempts and ends in a final reason after the cap", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () => taskGet(c.nativeId as string, { cost: undefined }));
  const start = new Date();
  await maintain(start);
  expect(await maintain(new Date(start.getTime() + 1000))).toMatchObject({
    examined: 0,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  let at = start.getTime();
  for (let attempt = 2; attempt <= 6; attempt++) {
    at += 24 * 3600_000;
    await maintain(new Date(at));
  }
  expect(fetchMock).toHaveBeenCalledTimes(6);
  expect((await task(c)).costEvidence).toMatchObject({
    status: "unrecoverable",
    reason: "cost_not_reported",
    attempts: 6,
  });
  at += 24 * 3600_000;
  expect(await maintain(new Date(at))).toMatchObject({ examined: 0 });
});

it("makes no provider call under an active account incident and retries it later", async () => {
  const c = await fx.create();
  const { ownCredentialVersion } = await import("@/lib/provider-usage/credential-version");
  await prisma.providerAccountIncident.create({
    data: {
      connectionId: c.connectionId,
      credentialVersion: ownCredentialVersion("dataforseo", c.connectionId, c.envelope) ?? "",
      scope: { kind: "account" },
      reason: "billing",
      evidenceSource: "fixture",
    },
  });
  expect(await maintain()).toMatchObject({ retry: 1 });
  expect(fetchMock).not.toHaveBeenCalled();
  const stored = await task(c);
  expect(stored.costCents).toBeNull();
  expect(stored.costEvidence).toMatchObject({
    status: "retry",
    reason: "account_incident",
  });
});

it("maps a provider account refusal to a retryable account incident without a cost", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () =>
    Response.json({ status_code: 40200, status_message: "Payment Required." }, { status: 402 }),
  );
  expect(await maintain()).toMatchObject({ retry: 1 });
  expect((await task(c)).costCents).toBeNull();
  expect((await task(c)).costEvidence).toMatchObject({
    status: "retry",
    reason: "account_incident",
  });
  expect(await reconcileProviderUsage(prisma, { namespace })).toMatchObject({
    reconciled: 0,
  });
});

it("makes no call when the cost is already present, for hosted tasks, live tasks or no native id", async () => {
  const withCost = await fx.create({ costCents: "0.6250" });
  const hosted = await fx.create();
  // A source switch after the original own-key attempt must not make it a hosted task's proof.
  await prisma.providerConnection.update({
    where: { id: hosted.connectionId },
    data: { credentialSource: "hosted" },
  });
  const live = await fx.create({ taskState: "submitted" });
  const noNative = await fx.create({ providerTaskId: null });
  expect(await maintain()).toMatchObject({ examined: 0 });
  expect(fetchMock).not.toHaveBeenCalled();
  for (const c of [withCost, hosted, live, noNative])
    expect((await task(c)).costEvidence).toBeNull();
});

it("never calls the provider with credentials that differ from the original version", async () => {
  const c = await fx.create();
  await prisma.providerConnection.update({
    where: { id: c.connectionId },
    data: {
      credentialsEncrypted: encryptSecret(
        JSON.stringify({ login: "other@example.com", password: "rotated" }),
      ),
    },
  });
  expect(await maintain()).toMatchObject({ unrecoverable: 1 });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await task(c)).costEvidence).toMatchObject({
    status: "unrecoverable",
    reason: "credential_changed",
  });
});

it("never falls back to environment credentials when the stored ones are unusable", async () => {
  vi.stubEnv("DATAFORSEO_LOGIN", "platform@example.com");
  vi.stubEnv("DATAFORSEO_PASSWORD", "platform-secret");
  const envelope = encryptSecret(JSON.stringify({}));
  const c = await fx.create({ envelope });
  expect(await maintain()).toMatchObject({ unrecoverable: 1 });
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await task(c)).costEvidence).toMatchObject({
    reason: "credentials_unavailable",
  });
});

it("rejects a negative or non-numeric provider cost instead of recording it", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () => taskGet(c.nativeId as string, { cost: -1 }));
  await maintain();
  expect((await task(c)).costCents).toBeNull();
  fetchMock.mockImplementation(async () => taskGet(c.nativeId as string, { cost: "0.5" }));
  await maintain(new Date(Date.now() + 24 * 3600_000));
  expect((await task(c)).costCents).toBeNull();
});

it.each([
  ["top-level 40200 with HTTP 200", { status_code: 40200, status_message: "Payment Required." }],
  ["top-level 40201", { status_code: 40201, status_message: "Insufficient funds." }],
  ["top-level 40104", { status_code: 40104, status_message: "Account not verified." }],
  ["top-level 40101", { status_code: 40101, status_message: "Authentication failed." }],
])(
  "maps %s to a non-counting account incident that never opens the closeout",
  async (_name, body) => {
    const c = await fx.create();
    fetchMock.mockImplementation(async () => Response.json(body));
    const start = new Date();
    for (let attempt = 0; attempt < 8; attempt++)
      expect(await maintain(new Date(start.getTime() + attempt * DAY))).toMatchObject({
        retry: 1,
        unrecoverable: 0,
      });
    const stored = await task(c);
    expect(stored.costCents).toBeNull();
    expect(stored.costEvidence).toMatchObject({
      status: "retry",
      reason: "account_incident",
      attempts: 0,
      statusCode: body.status_code,
    });
    expect(await consoleReason(c)).toBe("provider_cost_pending");
  },
);

it("maps a task-level account status inside an HTTP 200 answer to an account incident", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () =>
    taskGet(c.nativeId as string, { status_code: 40210, cost: undefined }),
  );
  expect(await maintain()).toMatchObject({ retry: 1, unrecoverable: 0 });
  expect((await task(c)).costEvidence).toMatchObject({
    status: "retry",
    reason: "account_incident",
    attempts: 0,
    statusCode: 40210,
  });
});

it("still counts an unclassified provider failure as an attempt (negative control)", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async () =>
    Response.json({ status_code: 50000, status_message: "Internal Error." }),
  );
  expect(await maintain()).toMatchObject({ retry: 1 });
  expect((await task(c)).costEvidence).toMatchObject({
    status: "retry",
    reason: "provider_unreachable",
    attempts: 1,
  });
});

const urlTaskId = (input: unknown) => String(input).split("/").at(-1) as string;

it("backs a skipped row off and lets later rows through instead of blocking the head of the line", async () => {
  const stuck = [];
  for (let i = 0; i < 5; i++) stuck.push(await fx.create());
  const healthy = await fx.create();
  const stuckIds = new Set(stuck.map((c) => c.nativeId));
  fetchMock.mockImplementation(async (input: unknown) =>
    stuckIds.has(urlTaskId(input))
      ? Response.json({ status_code: 50000 }, { status: 503 })
      : taskGet(urlTaskId(input)),
  );
  const start = new Date();
  expect(await maintain(start)).toMatchObject({ examined: 5, skipped: 5 });
  for (const c of stuck)
    expect((await task(c)).costEvidence).toMatchObject({
      status: "retry",
      attempts: 0,
    });
  expect(await maintain(new Date(start.getTime() + 1000))).toMatchObject({
    examined: 1,
    recovered: 1,
  });
  expect(Number((await task(healthy)).costCents)).toBeCloseTo(0.06, 4);
  // The deferred rows come back once their backoff has elapsed.
  expect(await maintain(new Date(start.getTime() + DAY))).toMatchObject({
    examined: 5,
  });
});

it("isolates a throwing row, defers it and still processes the rest of the batch", async () => {
  const bad = await fx.create();
  const good = await fx.create();
  fetchMock.mockImplementation(async (input: unknown) => taskGet(urlTaskId(input)));
  let failures = 0;
  const flaky = {
    $queryRaw: prisma.$queryRaw.bind(prisma),
    $executeRaw: (query: { values: unknown[] }) => {
      if (
        query.values.includes(bad.taskId) &&
        query.values.some((v) => String(v).includes('"recovered"'))
      ) {
        failures++;
        throw new Error("write failed");
      }
      return (prisma.$executeRaw as unknown as (q: unknown) => Promise<number>)(query);
    },
  } as unknown as NonNullable<Parameters<typeof maintainQueuedTaskCosts>[0]>["client"];
  const result = await maintainQueuedTaskCosts({
    now: new Date(),
    namespace,
    client: flaky,
  });
  expect(failures).toBe(1);
  expect(result).toMatchObject({ examined: 2, recovered: 1, failed: 1 });
  expect(Number((await task(good)).costCents)).toBeCloseTo(0.06, 4);
  expect((await task(bad)).costEvidence).toMatchObject({
    status: "retry",
    attempts: 0,
  });
});

it("does not let ambiguous duplicate correlations occupy the whole batch", async () => {
  const ambiguous = [];
  for (let i = 0; i < 5; i++) {
    const c = await fx.create();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL TIME ZONE 'UTC'`;
      await tx.$executeRaw`INSERT INTO metering_operation (operation_pk, namespace, principal, operation_id, state, version, semantic_hash, budget_epochs, reservation_expires_at, lease_id, lease_holder, lease_expires_at, lease_kind, created_at, updated_at, input, warnings)
      SELECT gen_random_uuid()::text, namespace, principal, operation_id || '-dup', state, version, semantic_hash || '-dup', budget_epochs, reservation_expires_at, lease_id, lease_holder, lease_expires_at, lease_kind, created_at, updated_at, input, warnings
      FROM metering_operation WHERE namespace=${namespace} AND operation_id=${c.operationId}`;
    });
    ambiguous.push(c);
  }
  const healthy = await fx.create();
  fetchMock.mockImplementation(async (input: unknown) => taskGet(urlTaskId(input)));
  expect(await maintain()).toMatchObject({ examined: 1, recovered: 1 });
  expect(Number((await task(healthy)).costCents)).toBeCloseTo(0.06, 4);
  for (const c of ambiguous) expect((await task(c)).costEvidence).toBeNull();
});

it("never writes a cost read for an old native id after the task's id changed", async () => {
  const c = await fx.create();
  fetchMock.mockImplementation(async (input: unknown) => taskGet(urlTaskId(input)));
  const racing = {
    $queryRaw: async (query: never) => {
      const rows = await prisma.$queryRaw<unknown[]>(query);
      await prisma.queuedRankCheckTask.update({
        where: { id: c.taskId },
        data: { providerTaskId: randomUUID() },
      });
      return rows;
    },
    $executeRaw: prisma.$executeRaw.bind(prisma),
  } as unknown as NonNullable<Parameters<typeof maintainQueuedTaskCosts>[0]>["client"];
  expect(
    await maintainQueuedTaskCosts({ now: new Date(), namespace, client: racing }),
  ).toMatchObject({ examined: 1, recovered: 0, skipped: 1 });
  const stored = await task(c);
  expect(stored.costCents).toBeNull();
  expect(stored.costEvidence).toBeNull();
});

it.each([40501, 40106])(
  "does not settle a paid task at a zero cost reported under status %i",
  async (statusCode) => {
    const c = await fx.create();
    fetchMock.mockImplementation(async (input: unknown) =>
      taskGet(urlTaskId(input), { status_code: statusCode, cost: 0 }),
    );
    expect(await maintain()).toMatchObject({ retry: 1, recovered: 0 });
    const stored = await task(c);
    expect(stored.costCents).toBeNull();
    expect(stored.costEvidence).toMatchObject({ status: "retry", reason: "cost_not_reported" });
  },
);

it("still records a positive cost under 40501 and a measured zero under 20000 (negative control)", async () => {
  const partial = await fx.create();
  const free = await fx.create();
  fetchMock.mockImplementation(async (input: unknown) =>
    urlTaskId(input) === partial.nativeId
      ? taskGet(partial.nativeId as string, { status_code: 40501, cost: 0.0006 })
      : taskGet(free.nativeId as string, { cost: 0 }),
  );
  expect(await maintain()).toMatchObject({ recovered: 2 });
  expect(Number((await task(partial)).costCents)).toBeCloseTo(0.06, 4);
  expect(Number((await task(free)).costCents)).toBe(0);
});
