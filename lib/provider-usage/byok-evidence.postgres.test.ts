import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { syncUsageEntry } from "@/lib/metering/entry-sync";
import { maintainMeteringShadow } from "@/lib/metering/maintenance";
import { receiptFromEntry } from "@/lib/metering/mapping";
import { meteringRuntime } from "@/lib/metering/runtime";
import { ProviderUsagePersistenceError, readObservedResponse } from "@/lib/providers/usage";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captureByokEvidence, loadByokEvidence, recordByokEvidence } from "./byok-evidence";
import { createProviderRequestJournal } from "./request-journal";
import type { ProviderRequestAttribution } from "./tag";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));

const url = new URL(process.env.METERING_TEST_DATABASE_URL ?? "");
if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.endsWith("_fixture"))
  throw new Error("BYOK evidence tests require a disposable loopback fixture database.");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url.toString(), max: 5 }),
});
shared.db = db;
const namespaces: string[] = [],
  users: string[] = [],
  projects: string[] = [];
let principal: string,
  nextPrincipal: string,
  projectId: string,
  connectionId: string,
  namespace: string;
const receipt = {
  cached: false,
  costCents: 0.625,
  quantity: 1,
  failed: false,
  providerRequestId: "native-request",
};

beforeEach(async () => {
  namespace = `byok-evidence-${randomUUID()}`;
  namespaces.push(namespace);
  vi.stubEnv("DATABASE_URL", url.toString());
  vi.stubEnv("METERING_NAMESPACE", namespace);
  vi.stubEnv("METERING_SHADOW", "on");
  for (let n = 0; n < 2; n++) {
    const id = `byok-user-${randomUUID()}`;
    users.push(id);
    await db.user.create({
      data: {
        id,
        email: `${randomUUID()}@example.com`,
        name: "BYOK accounting fixture",
        publicId: makePublicId("usr"),
      },
    });
  }
  [principal, nextPrincipal] = users.slice(-2) as [string, string];
  projectId = `byok-project-${randomUUID()}`;
  projects.push(projectId);
  await db.project.create({
    data: {
      id: projectId,
      ownerId: principal,
      name: "BYOK fixture",
      domain: `${randomUUID()}.example.com`,
      publicId: makePublicId("prj"),
    },
  });
  const connection = await db.providerConnection.create({
    data: {
      projectId,
      provider: "dataforseo",
      kind: "serp",
      status: "connected",
      credentialSource: "own",
      publicId: makePublicId("conn"),
    },
  });
  connectionId = connection.id;
  await db.instanceSetting.create({
    data: { key: `metering.shadow.project.${projectId}`, value: "on" },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  for (const ns of namespaces) {
    await db.$executeRaw`DELETE FROM metering_event WHERE namespace=${ns}`;
    await db.$executeRaw`DELETE FROM metering_measurement WHERE receipt_pk IN (SELECT receipt_pk FROM metering_receipt r JOIN metering_operation o ON o.operation_pk=r.operation_pk WHERE o.namespace=${ns})`;
    for (const table of ["metering_receipt", "metering_command"])
      await db.$executeRaw(
        Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE operation_pk IN (SELECT operation_pk FROM metering_operation WHERE namespace=${ns})`,
      );
    for (const table of [
      "metering_shadow",
      "metering_event",
      "metering_alert",
      "metering_budget_usage",
      "metering_budget",
      "metering_operation",
      "metering_request_command",
      "metering_request_count",
    ])
      await db.$executeRaw(Prisma.sql`DELETE FROM ${Prisma.raw(table)} WHERE namespace=${ns}`);
  }
  await db.meteringUsageEvidence.deleteMany({ where: { projectId: { in: projects } } });
  await db.instanceSetting.deleteMany({
    where: { key: { in: projects.map((id) => `metering.shadow.project.${id}`) } },
  });
  await db.project.deleteMany({ where: { id: { in: projects } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});

function journal(correlationId = randomUUID()) {
  const attribution: ProviderRequestAttribution = {
    context: { projectId, source: "app", feature: "rank_check", correlationId, trigger: "manual" },
    tag: "business-content-must-not-enter-accounting-evidence",
  };
  return createProviderRequestJournal(db, {
    attribution,
    projectId,
    connectionId,
    provider: "dataforseo",
    unit: "cents",
    estimate: { cents: "0.625", units: "1" },
  });
}
async function operation(id: string, originalNamespace = namespace) {
  const { store } = await meteringRuntime();
  return store.getOperation({ namespace: originalNamespace, principal, operationId: id });
}

describe("immutable BYOK accounting evidence in real Postgres", () => {
  it("retries prior-month late proof after failed synchronization and project deletion", async () => {
    const id = randomUUID(),
      occurredAt = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15),
      );
    const attribution: ProviderRequestAttribution = {
      context: {
        projectId,
        source: "worker",
        feature: "rank_check",
        correlationId: randomUUID(),
        trigger: "scheduled",
      },
      tag: "not-retained",
    };
    await db.$transaction((tx) =>
      captureByokEvidence(
        tx,
        {
          attribution,
          projectId,
          connectionId,
          provider: "dataforseo",
          unit: "cents",
          estimate: { cents: "0.625", units: "1" },
        },
        id,
        occurredAt,
      ),
    );
    await db.project.delete({ where: { id: projectId } });
    await db.$transaction((tx) => recordByokEvidence(tx, id, receipt, null));
    await db.instanceSetting.update({
      where: { key: `metering.shadow.project.${projectId}` },
      data: { value: "off" },
    });
    await syncUsageEntry(id);
    expect(await operation(id)).toBeNull();
    await db.instanceSetting.update({
      where: { key: `metering.shadow.project.${projectId}` },
      data: { value: "on" },
    });
    await maintainMeteringShadow();
    expect((await operation(id))?.receipts.at(-1)).toMatchObject({
      occurredAt: occurredAt.toISOString(),
      cost: { money: { units: 6250n } },
    });
  });
  it("retries changed proof on an already settled operation and preserves replay identity", async () => {
    const usage = journal(),
      id = await usage.observer.begin();
    await usage.observer.settle(id, receipt);
    const before = await db.meteringUsageEvidence.findUniqueOrThrow({ where: { id } });
    await usage.observer.settle(id, receipt);
    expect((await db.meteringUsageEvidence.findUniqueOrThrow({ where: { id } })).proofVersion).toBe(
      before.proofVersion,
    );
    await db.$transaction((tx) => recordByokEvidence(tx, id, { ...receipt, costCents: 0.9 }, null));
    await db.instanceSetting.update({
      where: { key: `metering.shadow.project.${projectId}` },
      data: { value: "off" },
    });
    await syncUsageEntry(id);
    expect((await operation(id))?.receipts.at(-1)?.cost.money?.units).toBe(6250n);
    await db.project.delete({ where: { id: projectId } });
    await db.instanceSetting.update({
      where: { key: `metering.shadow.project.${projectId}` },
      data: { value: "on" },
    });
    await maintainMeteringShadow();
    expect((await operation(id))?.receipts.at(-1)?.cost.money?.units).toBe(9000n);
    await db.$transaction((tx) => recordByokEvidence(tx, id, receipt, null));
    await maintainMeteringShadow();
    expect((await operation(id))?.receipts.at(-1)?.cost.money?.units).toBe(6250n);
    expect((await operation(id))?.receipts).toHaveLength(3);
  });
  it("settles original principal/namespace after transfer and project cascading deletion", async () => {
    const usage = journal(),
      id = await usage.observer.begin({ attemptKey: "paid-request-1" });
    const original = await loadByokEvidence(db, id);
    expect((await operation(id))?.state).toBe("dispatch_intended");
    await db.project.update({ where: { id: projectId }, data: { ownerId: nextPrincipal } });
    vi.stubEnv("METERING_NAMESPACE", "changed-after-dispatch");
    expect(await loadByokEvidence(db, id)).toMatchObject({ ownerId: principal, namespace });
    await db.project.delete({ where: { id: projectId } });
    expect(await db.providerCostEntry.count({ where: { id } })).toBe(0);
    await usage.observer.settle(id, receipt);
    const evidence = await loadByokEvidence(db, id),
      op = await operation(id);
    expect(evidence).toMatchObject({
      ownerId: principal,
      namespace,
      createdAt: original?.createdAt,
      costCents: "0.6250",
      usageQuantity: "1.000000",
    });
    expect(op).toMatchObject({
      state: "settled",
      scope: { namespace, principal, group: projectId, connection: connectionId },
    });
    expect(op?.receipts.at(-1)?.cost.money?.units).toBe(6250n);
    expect(
      JSON.stringify(await db.meteringUsageEvidence.findUnique({ where: { id } })),
    ).not.toContain("business-content");
    await expect(
      db.meteringUsageEvidence.update({ where: { id }, data: { principal: nextPrincipal } }),
    ).rejects.toThrow("immutable");
  });
  it("retains both native duplicate attempts with one charged canonical proof and zero duplicate", async () => {
    const usage = journal(),
      first = await usage.observer.begin({ attemptKey: "request-1" });
    await usage.observer.settle(first, receipt);
    const second = await usage.observer.begin({ attemptKey: "request-2" });
    await usage.observer.settle(second, receipt);
    await usage.observer.settle(first, receipt);
    const rows = await db.meteringUsageEvidence.findMany({
      where: { id: { in: [first, second] } },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === second)).toMatchObject({
      canonicalId: first,
      providerRequestId: "native-request",
      measurementStatus: "recorded",
    });
    expect(await loadByokEvidence(db, second)).toMatchObject({
      costCents: "0",
      usageQuantity: "0",
      providerRequestId: null,
    });
    expect((await operation(first))?.receipts.at(-1)?.cost.money?.units).toBe(6250n);
    expect((await operation(second))?.receipts.at(-1)).toMatchObject({
      cost: { certainty: "measured", money: { units: 0n } },
    });
    expect((await operation(second))?.receipts.at(-1)?.providerRequestId).toBeUndefined();
    expect(usage.costCents).toBe(0.625);
    expect(await db.providerCostEntry.count({ where: { projectId } })).toBe(1);
  });
  it.each([
    [0.625, null],
    [null, 1],
  ] as const)(
    "keeps independently measured cost %s and quantity %s",
    async (costCents, quantity) => {
      const usage = journal(),
        id = await usage.observer.begin();
      await usage.observer.settle(id, { ...receipt, costCents, quantity });
      const entry = await loadByokEvidence(db, id);
      expect(entry).not.toBeNull();
      if (!entry) throw new Error("Missing retained evidence");
      const proof = receiptFromEntry(entry, new Date());
      expect(proof.cost.certainty).toBe(costCents === null ? "unknown" : "measured");
      expect(proof.measurements.map((m) => m.certainty)).toEqual([
        costCents === null ? "unknown" : "measured",
        quantity === null ? "unknown" : "measured",
      ]);
      expect((await operation(id))?.receipts.at(-1)?.measurements.map((m) => m.certainty)).toEqual(
        proof.measurements.map((m) => m.certainty),
      );
    },
  );
  it("refuses historical attribution inference and missing pre-dispatch identity before HTTP", async () => {
    const oldId = randomUUID();
    await db.providerCostEntry.create({
      data: {
        id: oldId,
        projectId,
        connectionId,
        provider: "dataforseo",
        feature: "rank_check",
        source: "app",
        costCents: 1,
        usageQuantity: 1,
        measurementStatus: "recorded",
      },
    });
    await db.project.update({ where: { id: projectId }, data: { ownerId: nextPrincipal } });
    expect(await loadByokEvidence(db, oldId)).toBeNull();
    await db.project.delete({ where: { id: projectId } });
    const request = vi.fn(async () => new Response("{}"));
    await expect(
      readObservedResponse({ observer: journal().observer, request, measure: () => receipt }),
    ).rejects.toBeInstanceOf(ProviderUsagePersistenceError);
    expect(request).not.toHaveBeenCalled();
    expect(await db.meteringUsageEvidence.count({ where: { projectId } })).toBe(0);
  });
});
