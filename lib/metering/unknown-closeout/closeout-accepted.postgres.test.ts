import type { PrismaClient } from "@/lib/generated/prisma/client";
import { key } from "@/lib/metering/store/codec";
import { closedUnknownOperations } from "@/lib/provider-usage/uncertainty-closeout-state";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { now, unknownFixture } from "./postgres.test-fixture";

const shared = vi.hoisted(() => ({ db: null as unknown as PrismaClient, namespace: "" }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/metering/runtime", () => ({ meteringNamespace: () => shared.namespace }));
let f: Awaited<ReturnType<typeof unknownFixture>>;
beforeAll(async () => {
  f = await unknownFixture();
  shared.db = f.db;
  shared.namespace = f.namespace;
}, 60000);
afterAll(async () => {
  if (f) await f.close();
});

const evidence = (status: "recovered" | "retry" | "unrecoverable", providerTaskId: string) => ({
  v: 1,
  status,
  reason: "provider_task_unavailable",
  attempts: 3,
  at: "2026-10-13T09:00:00.000Z",
  source: "task_get",
  providerTaskId,
  credentialVersion: "synthetic",
});
const accepted = async (costEvidence: object | null = null) => {
  const n = await f.native({ accepted: { taskState: "failed" } });
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: { costEvidence: costEvidence ?? undefined },
  });
  return n;
};
const unrecoverable = (providerTaskId: string) => evidence("unrecoverable", providerTaskId);

it("closes an accepted-then-failed task whose provider cost could not be recovered, with the plan hash", async () => {
  const n = await f.native({ accepted: { taskState: "failed" } });
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: { costEvidence: unrecoverable(n.task.providerTaskId as string) },
  });
  const plan = await f.preview(n.manifest);
  expect(plan).toMatchObject({ count: 1, cost: "unknown", providerCalls: 0, paidReplay: false });
  await expect(f.apply(n.manifest, "0".repeat(64))).rejects.toThrow(/changed/);
  expect(await f.apply(n.manifest, plan.planHash)).toMatchObject({
    closed: 1,
    replayed: false,
    cost: "unknown",
  });
  expect(await f.apply(n.manifest, plan.planHash)).toMatchObject({ closed: 1, replayed: true });
  expect(await closedUnknownOperations(f.db, [key(f.namespace, n.id)])).toEqual(
    new Set([key(f.namespace, n.id)]),
  );
  expect(
    await f.db.queuedRankCheckTask.findUniqueOrThrow({ where: { id: n.task.id } }),
  ).toMatchObject({ costCents: null, state: "failed" });
});

it("still refuses a failed task that was never accepted", async () => {
  const n = await f.native();
  await f.db.queuedRankCheckTask.update({ where: { id: n.task.id }, data: { state: "failed" } });
  await expect(f.preview(n.manifest)).rejects.toThrow(/qualify/);
  const noNative = await f.native({ accepted: { taskState: "failed" } });
  await f.db.queuedRankCheckTask.update({
    where: { id: noNative.task.id },
    data: { providerTaskId: null, costEvidence: unrecoverable("synthetic") },
  });
  await expect(f.preview(noNative.manifest)).rejects.toThrow(/qualify/);
});

it("refuses an accepted failed task unless recovery was attempted and gave up", async () => {
  const none = await accepted();
  await expect(f.preview(none.manifest)).rejects.toThrow(/qualify/);
  const retry = await accepted(evidence("retry", "synthetic"));
  await expect(f.preview(retry.manifest)).rejects.toThrow(/qualify/);
  const recovered = await accepted(evidence("recovered", "synthetic"));
  await expect(f.preview(recovered.manifest)).rejects.toThrow(/qualify/);
  const malformed = await accepted({ status: "unrecoverable" });
  await expect(f.preview(malformed.manifest)).rejects.toThrow(/qualify/);
});

it("refuses when the cost is already recorded or the tag is not an own-key proof", async () => {
  const priced = await accepted();
  await f.db.queuedRankCheckTask.update({
    where: { id: priced.task.id },
    data: { costCents: "1.2000", costEvidence: unrecoverable("synthetic") },
  });
  await expect(f.preview(priced.manifest)).rejects.toThrow(/qualify/);
  const hosted = await accepted();
  await f.db.queuedRankCheckTask.update({
    where: { id: hosted.task.id },
    data: {
      providerTag: `legacy;cs=hosted;f=rank_check;c=${hosted.task.id}`,
      costEvidence: unrecoverable("synthetic"),
    },
  });
  await expect(f.preview(hosted.manifest)).rejects.toThrow(/qualify/);
});

it("refuses an accepted failed task whose persistence lease is live", async () => {
  const n = await accepted();
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: {
      costEvidence: unrecoverable("synthetic"),
      persistenceLeaseExpiresAt: new Date(now.getTime() + 60000),
    },
  });
  await expect(f.preview(n.manifest)).rejects.toThrow(/qualify/);
});

it("refuses unrecoverable evidence that was recorded for another native task id", async () => {
  const n = await accepted();
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: { costEvidence: unrecoverable("another-native-task") },
  });
  await expect(f.preview(n.manifest)).rejects.toThrow(/qualify/);
  await f.db.queuedRankCheckTask.update({
    where: { id: n.task.id },
    data: { costEvidence: unrecoverable(n.task.providerTaskId as string) },
  });
  expect(await f.preview(n.manifest)).toMatchObject({ count: 1 });
});
