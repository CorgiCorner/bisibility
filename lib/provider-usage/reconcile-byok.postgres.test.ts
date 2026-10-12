import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { canonicalFixture } from "@/lib/metering/canonical-query.test-fixture";
import { ensureProjectSpendingBudget } from "@/lib/metering/project-budget-bootstrap";
import { meteringRuntime } from "@/lib/metering/runtime";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadByokEvidence } from "./byok-evidence-storage";
import { ownCredentialVersion } from "./credential-version";
import { reconcileProviderUsage } from "./reconcile";
import { createProviderRequestJournal } from "./request-journal";
import { buildProviderTag } from "./tag";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/ops/notify", () => ({ notifyOps: vi.fn() }));
const url = new URL(
  process.env.PROVIDER_USAGE_TEST_DATABASE_URL ?? process.env.METERING_TEST_DATABASE_URL ?? "",
);
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_fixture"))
  throw new Error("BYOK reconciliation tests require a disposable loopback fixture database.");
shared.db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }),
});
const users: string[] = [],
  locations: string[] = [],
  projects: string[] = [];
let namespace: string;
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", url.toString());
  namespace = `byok-reconcile-${randomUUID()}`;
  vi.stubEnv("METERING_NAMESPACE", namespace);
  vi.stubEnv("METERING_SHADOW", "on");
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
  for (const projectId of projects.splice(0)) {
    await prisma.instanceSetting.deleteMany({
      where: { key: `metering.shadow.project.${projectId}` },
    });
    await prisma.project.deleteMany({ where: { id: projectId } });
  }
  for (const id of locations.splice(0)) await prisma.location.delete({ where: { id } });
  for (const id of users.splice(0)) await prisma.user.delete({ where: { id } });
  vi.unstubAllEnvs();
});
afterAll(() => prisma.$disconnect());

async function fixture() {
  const ownerId = await createUser();
  const projectId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.project.create({
      data: {
        id: projectId,
        ownerId,
        publicId: makePublicId("prj"),
        name: "BYOK reconciliation fixture",
        domain: `${randomUUID()}.example.com`,
      },
    });
    await ensureProjectSpendingBudget(tx, process.env.METERING_NAMESPACE ?? "default", projectId);
  });
  projects.push(projectId);
  const connection = await prisma.providerConnection.create({
    data: {
      projectId,
      publicId: makePublicId("conn"),
      provider: "dataforseo",
      kind: "serp",
      credentialSource: "own",
      credentialsEncrypted: "reconcile-retained-key",
      enabled: true,
      status: "connected",
    },
  });
  const location = await prisma.location.create({
    data: {
      kind: "country",
      displayName: "Disposable BYOK fixture",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
      canonicalKey: randomUUID(),
    },
  });
  locations.push(location.id);
  const keyword = await prisma.keyword.create({
    data: {
      projectId,
      publicId: makePublicId("kw"),
      text: randomUUID(),
      location: "United States",
      locationId: location.id,
    },
  });
  const check = await prisma.rankCheck.create({
    data: {
      keywordId: keyword.id,
      publicId: makePublicId("check"),
      provider: "dataforseo",
      status: "running",
    },
  });
  const batch = await prisma.queuedRankCheckBatch.create({
    data: {
      id: randomUUID(),
      projectId,
      connectionId: connection.id,
      priority: "normal",
      state: "submitted",
      source: "api",
      trigger: "manual",
      claimedAt: new Date(),
      submittedAt: new Date(),
      queueDeadlineAt: new Date(Date.now() + 3600000),
    },
  });
  const taskId = randomUUID(),
    nativeId = randomUUID();
  const context = {
    projectId,
    correlationId: taskId,
    source: "api",
    trigger: "manual",
    feature: "rank_check",
  } as const;
  const tag = buildProviderTag({
    context,
    credentialSource: "own",
    instanceSlug: "fixture",
    stage: "dev",
  });
  await prisma.queuedRankCheckTask.create({
    data: {
      id: taskId,
      batchId: batch.id,
      keywordId: keyword.id,
      rankCheckId: check.id,
      state: "submitted",
      providerTaskId: nativeId,
      providerTag: tag,
      costCents: "0.6250",
    },
  });
  await prisma.instanceSetting.create({
    data: { key: `metering.shadow.project.${projectId}`, value: "on" },
  });
  return {
    ownerId,
    projectId,
    connectionId: connection.id,
    taskId,
    nativeId,
    keywordId: keyword.id,
    context,
    tag,
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function createUser() {
  const id = randomUUID();
  users.push(id);
  await prisma.user.create({
    data: {
      id,
      publicId: makePublicId("usr"),
      name: "BYOK fixture",
      email: `${randomUUID()}@example.com`,
    },
  });
  return id;
}
function journalFor(base: Fixture, correlationId = base.taskId) {
  const context = { ...base.context, correlationId };
  const tag = buildProviderTag({
    context,
    credentialSource: "own",
    instanceSlug: "fixture",
    stage: "dev",
  });
  return createProviderRequestJournal(prisma, {
    attribution: { context, tag },
    projectId: base.projectId,
    connectionId: base.connectionId,
    keywordId: base.keywordId,
    provider: "dataforseo",
    unit: "cents",
    credentialVersion: ownCredentialVersion(
      "dataforseo",
      base.connectionId,
      "reconcile-retained-key",
    ),
    queued: true,
    estimate: { cents: "1.0000", units: "1.000000" },
  });
}
async function begin(base: Fixture, correlationId = base.taskId) {
  const journal = journalFor(base, correlationId);
  const id = await journal.observer.begin({ attemptKey: randomUUID() });
  await journal.observer.beforeDispatch?.(id);
  return id;
}
async function operation(base: Fixture, id: string) {
  return (await meteringRuntime()).store.getOperation({
    namespace,
    principal: base.ownerId,
    operationId: id,
  });
}

it("reconciles retained paid evidence through the original owner after transfer and replays once", async () => {
  const base = await fixture(),
    id = await begin(base);
  const captured = await prisma.meteringUsageEvidence.findUniqueOrThrow({ where: { id } });
  expect(await canonicalFixture(prisma).count({ where: { id } })).toBe(1);
  const nextOwner = await createUser();
  await prisma.project.update({ where: { id: base.projectId }, data: { ownerId: nextOwner } });
  // A source switch cannot reinterpret this original cs=own transport evidence.
  await prisma.providerConnection.update({
    where: { id: base.connectionId },
    data: { credentialSource: "hosted" },
  });
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 1 });
  const retained = await prisma.meteringUsageEvidence.findUniqueOrThrow({ where: { id } });
  expect(retained).toMatchObject({
    principal: base.ownerId,
    namespace,
    createdAt: captured.createdAt,
    measurementStatus: "recorded",
    receipt: { costCents: "0.6250", quantity: "1.000000" },
  });
  const op = await operation(base, id);
  expect(op).toMatchObject({ state: "settled", scope: { principal: base.ownerId } });
  expect(op?.receipts.at(-1)?.providerRequestId).toBe(base.nativeId);
  expect(await canonicalFixture(prisma).count({ where: { id } })).toBe(1);
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 0 });
  expect((await operation(base, id))?.version).toBe(op?.version);
});

it("atomically preserves the pending Meter operation when its retained proof write fails", async () => {
  const base = await fixture(),
    id = await begin(base);
  let failed = false;
  const db = new Proxy(prisma, {
    get(target, key) {
      if (key !== "$transaction") return Reflect.get(target, key);
      return (work: (tx: unknown) => Promise<unknown>) =>
        prisma.$transaction((tx) =>
          work(
            new Proxy(tx, {
              get(transaction, property) {
                if (property !== "meteringUsageEvidence") return Reflect.get(transaction, property);
                return new Proxy(tx.meteringUsageEvidence, {
                  get(delegate, method) {
                    if (method !== "update") return Reflect.get(delegate, method);
                    return (args: Parameters<typeof delegate.update>[0]) => {
                      if (!failed && args.where.id === id) {
                        failed = true;
                        throw new Error("proof fixture failure");
                      }
                      return delegate.update(args);
                    };
                  },
                });
              },
            }),
          ),
        );
    },
  }) as PrismaClient;
  await expect(reconcileProviderUsage(db)).resolves.toMatchObject({
    failed: 1,
    lastReconciledAt: null,
    reconciled: 0,
    unconfirmed: 1,
  });
  expect(failed).toBe(true);
  expect(await canonicalFixture(prisma).count({ where: { id } })).toBe(1);
  expect(await prisma.meteringUsageEvidence.findUniqueOrThrow({ where: { id } })).toMatchObject({
    receipt: null,
  });
  expect((await operation(base, id))?.receipts).toHaveLength(0);
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ failed: 0, reconciled: 1 });
});

it("recovers the canonical proof and retains duplicate zero lineage without a second native Meter identity", async () => {
  const base = await fixture(),
    canonical = await begin(base, randomUUID()),
    duplicate = await begin(base);
  await prisma.meteringUsageEvidence.update({
    where: { id: canonical },
    data: { providerRequestId: base.nativeId },
  });
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 1 });
  expect(await canonicalFixture(prisma).findUnique({ where: { id: duplicate } })).not.toBeNull();
  expect(await loadByokEvidence(prisma, canonical)).toMatchObject({
    ownerId: base.ownerId,
    costCents: "0.6250",
    usageQuantity: "1.000000",
  });
  expect(await loadByokEvidence(prisma, duplicate)).toMatchObject({
    ownerId: base.ownerId,
    costCents: "0",
    usageQuantity: "0",
    providerRequestId: null,
  });
  expect(
    await prisma.meteringUsageEvidence.findUniqueOrThrow({ where: { id: duplicate } }),
  ).toMatchObject({
    canonicalId: canonical,
    measurementStatus: "recorded",
    providerRequestId: base.nativeId,
  });
  expect((await operation(base, canonical))?.receipts.at(-1)?.providerRequestId).toBe(
    base.nativeId,
  );
  const duplicateOperation = await operation(base, duplicate);
  expect(duplicateOperation?.state).toBe("settled");
  expect(duplicateOperation?.receipts.at(-1)?.providerRequestId).toBeUndefined();
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 0 });
  expect((await operation(base, duplicate))?.version).toBe(duplicateOperation?.version);
});

it("serializes normal settlement and the pending sweep through the journal before the canonical receipt", async () => {
  const base = await fixture(),
    journal = journalFor(base);
  const id = await journal.observer.begin({ attemptKey: randomUUID() });
  await journal.observer.beforeDispatch?.(id);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let locked!: (pid: number) => void;
  const ready = new Promise<number>((resolve) => {
    locked = resolve;
  });
  const blocker = prisma.$transaction(
    async (tx) => {
      const [{ pid }] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      await tx.$queryRaw`SELECT id FROM metering_usage_evidence WHERE id=${id} FOR UPDATE`;
      locked(pid);
      await held;
    },
    { timeout: 10_000 },
  );
  const blockerPid = await ready;
  const waitFor = async (expected: number) => {
    for (let retry = 0; retry < 100; retry++) {
      const [{ count }] = await prisma.$queryRaw<{ count: number }[]>`
        WITH RECURSIVE waiters(pid) AS (
          SELECT a.pid FROM pg_stat_activity a
          WHERE ${blockerPid} = ANY(pg_blocking_pids(a.pid))
          UNION
          SELECT a.pid FROM pg_stat_activity a
          JOIN waiters w ON w.pid = ANY(pg_blocking_pids(a.pid))
        ) SELECT count(*)::int AS count FROM waiters
      `;
      if (count >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("The actual journal lock contenders did not reach the barrier.");
  };
  const normal = journal.observer.settle(id, {
    cached: false,
    failed: false,
    costCents: 0.625,
    quantity: 1,
    providerRequestId: base.nativeId,
  });
  const normalResult = Promise.allSettled([normal]);
  let sweepResult: Promise<PromiseSettledResult<unknown>[]> | undefined;
  try {
    await waitFor(1);
    sweepResult = Promise.allSettled([reconcileProviderUsage(prisma)]);
    await waitFor(2);
  } finally {
    release();
    await blocker;
  }
  expect((await normalResult)[0].status).toBe("fulfilled");
  if (!sweepResult) throw new Error("The sweep did not start.");
  const swept = (await sweepResult)[0];
  if (swept.status === "rejected") throw swept.reason;
  expect(swept.status).toBe("fulfilled");
  expect(await prisma.meteringUsageEvidence.findUniqueOrThrow({ where: { id } })).toMatchObject({
    proofVersion: 1,
    measurementStatus: "recorded",
    receipt: { costCents: "0.6250", quantity: "1.000000" },
  });
  expect(await canonicalFixture(prisma).count({ where: { id } })).toBe(1);
  expect((await operation(base, id))?.receipts).toHaveLength(1);
});

it("excludes hosted preliminary POST receipts and leaves legacy unknown funding unattributed", async () => {
  const base = await fixture();
  await prisma.queuedRankCheckTask.update({
    where: { id: base.taskId },
    data: { providerTag: base.tag.replace("cs=own", "cs=hosted") },
  });
  for (const credentialSource of ["hosted", "own"] as const) {
    const hosted = await canonicalFixture(prisma).create({
      data: {
        projectId: base.projectId,
        connectionId: base.connectionId,
        provider: "dataforseo",
        feature: "rank_check",
        source: "api",
        trigger: "manual",
        correlationId: base.taskId,
        credentialSource,
        costCents: "0",
        measurementStatus: "unknown",
      },
    });
    expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 0 });
    expect(
      await canonicalFixture(prisma).findUniqueOrThrow({ where: { id: hosted.id } }),
    ).toMatchObject({ measurementStatus: "unknown", priceCents: null });
    await canonicalFixture(prisma).deleteMany({ where: { id: hosted.id } });
  }
  await prisma.queuedRankCheckTask.update({
    where: { id: base.taskId },
    data: { providerTag: "legacy-unscoped-tag" },
  });
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 0 });
  await prisma.queuedRankCheckTask.update({
    where: { id: base.taskId },
    data: { providerTag: base.tag },
  });
  expect(await reconcileProviderUsage(prisma)).toMatchObject({ reconciled: 0 });
  expect(await canonicalFixture(prisma).count({ where: { projectId: base.projectId } })).toBe(0);
  expect(await prisma.meteringUsageEvidence.count({ where: { projectId: base.projectId } })).toBe(
    0,
  );
  expect(await prisma.meteringOperation.count({ where: { namespace } })).toBe(0);
});
