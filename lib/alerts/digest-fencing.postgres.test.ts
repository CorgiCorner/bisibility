import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { makePublicId } from "@/lib/db/public-id";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { closeoutPostgresFixture } from "@/lib/metering/history-closeout/postgres.test-fixture";
import * as pushTransport from "@/lib/notifications/apns";
import * as pushTokens from "@/lib/notifications/push-tokens";
import {
  ALERT_DELIVERY_TASK_QUEUE,
  alertDigestDeliveryWorkflowId,
  enqueueAlertDigestJob,
} from "@/lib/temporal/alert-delivery-client";
import * as fencedActivities from "@/lib/temporal/fenced-digest-activities";
import {
  finalizeAlertDigestDeliveryActivity as legacyFinalize,
  deliverAlertDigestWebhookActivity as legacyWebhook,
} from "@/tests/fixtures/alerts/legacy-digest-delivery";
import { Context } from "@temporalio/activity";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import * as transport from "./delivery";
import { flushAlertDigests } from "./digest";
import { recoverStaleDigestClaims } from "./digest-claims";
import { fencedDigestSend } from "./digest-send-fence";
import type { AlertDigestJob } from "./digest-types";
import { collectAlertDeliveryHealth, getAlertHealthConfig } from "./health";

const shared = vi.hoisted(() => ({
  client: null as unknown as TestWorkflowEnvironment["client"],
  db: null as unknown as PrismaClient,
}));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishNotificationCreated: vi.fn() }));
vi.mock("@/lib/temporal/scheduler-client", () => ({
  getSchedulerTemporalClient: async () => shared.client,
}));
let fixture: Awaited<ReturnType<typeof closeoutPostgresFixture>>;
let projectId: string;
let ruleId: string;
let keywordId: string;
let endpointId: string;
let ownerId: string;
let memberId: string;
let optedOutId: string;
const now = new Date();
const stale = new Date(now.getTime() - 31 * 60_000);

beforeAll(async () => {
  fixture = await closeoutPostgresFixture({ schemaOnly: true });
  shared.db = fixture.db;
  const user = await shared.db.user.create({
    data: { publicId: makePublicId("usr"), name: "Fixture", email: "digest@example.com" },
  });
  ownerId = user.id;
  const members = await shared.db.user.createManyAndReturn({
    data: ["member", "optout"].map((name) => ({
      publicId: makePublicId("usr"),
      name,
      email: `${name}@example.com`,
    })),
  });
  memberId = members[0].id;
  optedOutId = members[1].id;
  const project = await shared.db.project.create({
    data: {
      publicId: makePublicId("prj"),
      ownerId: user.id,
      name: "Fixture",
      domain: "example.com",
    },
  });
  projectId = project.id;
  const location = await shared.db.location.create({
    data: {
      canonicalKey: "digest-fencing",
      kind: "country",
      displayName: "United States",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "United States",
    },
  });
  const keyword = await shared.db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId,
      text: "fixture",
      location: "United States",
      locationId: location.id,
    },
  });
  keywordId = keyword.id;
  const rule = await shared.db.alertRule.create({
    data: {
      publicId: makePublicId("alr"),
      projectId,
      name: "Fixture",
      conditionType: "position_drop",
      severity: "warning",
      channels: ["webhook"],
    },
  });
  ruleId = rule.id;
  const endpoint = await shared.db.webhookEndpoint.create({
    data: {
      publicId: makePublicId("we"),
      projectId,
      url: "https://example.com/hook",
      hmacSecret: "fixture",
    },
  });
  endpointId = endpoint.id;
}, 180_000);
beforeEach(async () => {
  vi.restoreAllMocks();
  await shared.db.membership.deleteMany({ where: { projectId } });
  await shared.db.notificationPreference.deleteMany({ where: { projectId } });
  await shared.db.notification.deleteMany({ where: { projectId } });
  await shared.db.triggeredAlert.deleteMany({ where: { ruleId } });
  await shared.db.alertRuleDailyStat.deleteMany({ where: { ruleId } });
});
afterAll(async () => {
  await fixture?.close();
});

async function seed(count: number) {
  const rows = [];
  for (let index = 0; index < count; index++)
    rows.push(
      await shared.db.triggeredAlert.create({
        data: { publicId: makePublicId("al"), keywordId, ruleId, deliveryState: "digest_pending" },
      }),
    );
  return rows;
}
async function flush() {
  const jobs: AlertDigestJob[] = [];
  await flushAlertDigests(now, {
    enqueueDigestJob: async (job) => {
      jobs.push(job);
    },
    sendOverflowNotice: vi.fn(),
  });
  return jobs;
}

it("does not reclaim a legacy [a,b] into [a,b,c] while its old transport is running", async () => {
  const rows = await seed(2);
  const [legacy] = await flush();
  await shared.db.triggeredAlert.updateMany({
    data: { deliveryClaimedAt: stale, digestSubmissionStarted: null },
    where: { id: { in: rows.map((row) => row.id) } },
  });
  let entered = () => {};
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sends = vi.spyOn(transport, "postSignedBody").mockImplementation(async () => {
    entered();
    await blocked;
    return { latencyMs: 1, status: 204 };
  });
  vi.spyOn(transport, "stampWebhookDelivery").mockResolvedValue(undefined);
  const oldSend = legacyWebhook({ endpointId, job: legacy });
  await ready;
  await seed(1);
  try {
    const jobs = await flush();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].alertIds).toHaveLength(1);
    expect(jobs[0].alertIds.some((id) => legacy.alertIds.includes(id))).toBe(false);
  } finally {
    release();
    await oldSend;
  }
  expect(sends).toHaveBeenCalledOnce();
});

it("parks an expired legacy claim with unknown attempts instead of resending", async () => {
  const [row] = await seed(1);
  await shared.db.triggeredAlert.update({
    where: { id: row.id },
    data: { deliveryState: "digesting", deliveryClaimToken: "legacy", deliveryClaimedAt: stale },
  });
  await recoverStaleDigestClaims(now);
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { deliveryState: "dead_letter" },
  );
  expect(await shared.db.deliveryAttempt.findMany({ where: { triggeredAlertId: row.id } })).toEqual(
    [expect.objectContaining({ channel: "webhook", status: "unknown" })],
  );
  expect(await flush()).toEqual([]);
});

it("two concurrent submissions enter the provider once and keep retries unknown", async () => {
  await seed(2);
  const [job] = await flush();
  let release = () => {};
  let entered = () => {};
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entries = 0;
  const send = vi.fn(async () => {
    entered();
    if (++entries === 1) await blocked;
    return { delivered: true };
  });
  const first = fencedDigestSend(job, "webhook", endpointId, send);
  await started;
  try {
    expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
      unknown: true,
      delivered: false,
    });
  } finally {
    release();
    await first;
  }
  expect(await first).toMatchObject({ delivered: true });
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(send).toHaveBeenCalledOnce();
});

it("an accepted send followed by a crash is never sent again after reclaim", async () => {
  const [row] = await seed(1);
  const [job] = await flush();
  const send = vi.fn(async () => {
    // A killed process cannot write the receipt; leave its durable submission boundary.
    await shared.db
      .$executeRaw`CREATE FUNCTION fail_digest_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'process terminated'; END $$`;
    await shared.db
      .$executeRaw`CREATE TRIGGER fail_digest_finish BEFORE UPDATE ON alert_digest_sends FOR EACH ROW EXECUTE FUNCTION fail_digest_finish()`;
    return { delivered: true };
  });
  try {
    expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
      unknown: true,
    });
  } finally {
    await shared.db.$executeRaw`DROP TRIGGER fail_digest_finish ON alert_digest_sends`;
    await shared.db.$executeRaw`DROP FUNCTION fail_digest_finish()`;
  }
  await shared.db.triggeredAlert.update({
    where: { id: row.id },
    data: { deliveryClaimedAt: stale },
  });
  await recoverStaleDigestClaims(now);
  expect(await flush()).toEqual([]);
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: false,
  });
  expect(send).toHaveBeenCalledOnce();
  expect(await shared.db.alertDigestSend.findMany({ where: { alertId: row.id } })).toEqual([
    expect.objectContaining({ state: "unknown" }),
  ]);
  expect(await shared.db.deliveryAttempt.findMany({ where: { triggeredAlertId: row.id } })).toEqual(
    [expect.objectContaining({ status: "unknown" })],
  );
});

it("reclaims unsubmitted [a,b] as [a,b,c] and fences the stale prepared owner", async () => {
  await seed(2);
  const [old] = await flush();
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: old.alertIds } },
    data: { deliveryClaimedAt: stale },
  });
  await seed(1);
  const [current] = await flush();
  expect(current.alertIds).toHaveLength(3);
  const send = vi.fn(async () => ({ delivered: true }));
  expect(await fencedDigestSend(old, "webhook", endpointId, send)).toMatchObject({
    delivered: false,
    skipped: true,
  });
  expect(await fencedDigestSend(current, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(send).toHaveBeenCalledOnce();
});

it("old SQL recovery cannot steal new claims before or after provider entry", async () => {
  await seed(1);
  const [job] = await flush();
  const oldRecover = () =>
    shared.db.triggeredAlert.updateMany({
      where: { id: { in: job.alertIds }, deliveryState: "digesting" },
      data: { deliveryState: "digest_pending", deliveryClaimedAt: null, deliveryClaimToken: null },
    });
  expect(await oldRecover()).toEqual({ count: 0 });
  const send = vi.fn(async () => {
    expect(await oldRecover()).toEqual({ count: 0 });
    return { delivered: true };
  });
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(await oldRecover()).toEqual({ count: 0 });
  expect(send).toHaveBeenCalledOnce();
});

it.each(["empty token", "empty batch", "missing row", "foreign owner"])(
  "refuses %s at provider entry",
  async (kind) => {
    await seed(1);
    const [source] = await flush();
    const job = { ...source, alertIds: [...source.alertIds] };
    if (kind === "empty token") job.deliveryClaimToken = "";
    if (kind === "empty batch") job.alertIds = [];
    if (kind === "missing row") job.alertIds.push("missing");
    if (kind === "foreign owner") job.deliveryClaimToken = "foreign";
    const send = vi.fn(async () => ({ delivered: true }));
    expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
      delivered: false,
      skipped: true,
    });
    expect(send).not.toHaveBeenCalled();
  },
);

it("completion cannot overwrite a replacement destination owner", async () => {
  const [row] = await seed(1);
  const [job] = await flush();
  expect(
    await fencedDigestSend(job, "webhook", endpointId, async () => {
      await shared.db.alertDigestSend.updateMany({
        where: { alertId: row.id },
        data: { ownerToken: "replacement" },
      });
      return { delivered: true };
    }),
  ).toMatchObject({ unknown: true });
  expect(
    await shared.db.alertDigestSend.findFirstOrThrow({ where: { alertId: row.id } }),
  ).toMatchObject({ state: "submitting", ownerToken: "replacement" });
  const send = vi.fn(async () => ({ delivered: true }));
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: false,
    skipped: true,
  });
  expect(send).not.toHaveBeenCalled();
});

it("distinct recipients and channels retain independent fences", async () => {
  await seed(1);
  const [job] = await flush();
  const send = vi.fn(async () => ({ delivered: true }));
  for (const [channel, destination] of [
    ["email", "reader-a"],
    ["email", "reader-b"],
    ["webhook", endpointId],
    ["push", "device-a"],
  ]) {
    expect(await fencedDigestSend(job, channel, destination, send)).toMatchObject({
      delivered: true,
    });
    expect(await fencedDigestSend(job, channel, destination, send)).toMatchObject({
      delivered: true,
    });
  }
  expect(send).toHaveBeenCalledTimes(4);
});

it("runs legacy and fenced workers concurrently without an overlapping send", async () => {
  const environment = await TestWorkflowEnvironment.createLocal();
  shared.client = environment.client;
  await seed(2);
  const [legacy] = await flush();
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: legacy.alertIds } },
    data: { deliveryClaimedAt: stale, digestSubmissionStarted: null },
  });
  let entered = () => {};
  let release = () => {};
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sends = vi
    .spyOn(transport, "postSignedBody")
    .mockImplementation(async (_endpoint, body) => {
      if (JSON.stringify(body) === JSON.stringify(legacy.webhookBody)) {
        entered();
        await blocked;
      }
      return { latencyMs: 1, status: 204 };
    });
  vi.spyOn(transport, "stampWebhookDelivery").mockResolvedValue(undefined);
  try {
    const oldWorker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue: ALERT_DELIVERY_TASK_QUEUE,
      workflowsPath: resolve("tests/fixtures/temporal/legacy-alert-delivery-workflows.ts"),
      activities: {
        prepareAlertDigestDeliveryActivity: async () => legacy,
        deliverAlertDigestWebhookActivity: legacyWebhook,
        finalizeAlertDigestDeliveryActivity: legacyFinalize,
      },
    });
    const newWorker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue: `${ALERT_DELIVERY_TASK_QUEUE}-fenced-v1`,
      workflowsPath: resolve("lib/temporal/alert-delivery-workflows.ts"),
      activities: fencedActivities,
    });
    await oldWorker.runUntil(() =>
      newWorker.runUntil(async () => {
        const handle = await environment.client.workflow.start("alertDigestDeliveryWorkflow", {
          args: [legacy],
          taskQueue: ALERT_DELIVERY_TASK_QUEUE,
          workflowId: alertDigestDeliveryWorkflowId(legacy),
        });
        await ready;
        try {
          await expect(enqueueAlertDigestJob(legacy)).rejects.toThrow(
            "another batch or claim owner",
          );
          await seed(1);
          const [current] = await flush();
          expect(current.alertIds).toHaveLength(1);
          expect(current.alertIds.some((id) => legacy.alertIds.includes(id))).toBe(false);
          await enqueueAlertDigestJob(current);
          await environment.client.workflow
            .getHandle(alertDigestDeliveryWorkflowId(current))
            .result();
        } finally {
          release();
          await handle.result();
        }
      }),
    );
    expect(sends).toHaveBeenCalledTimes(2);
  } finally {
    release();
    await environment.teardown();
  }
}, 60_000);

it("a disabled endpoint still blocks the fenced transport", async () => {
  await seed(1);
  const [job] = await flush();
  const sends = vi
    .spyOn(transport, "postSignedBody")
    .mockResolvedValue({ latencyMs: 1, status: 204 });
  await shared.db.webhookEndpoint.update({ where: { id: endpointId }, data: { enabled: false } });
  try {
    expect(
      await fencedActivities.deliverFencedAlertDigestWebhookActivity({ endpointId, job }),
    ).toMatchObject({ delivered: false, skipped: true });
    expect(sends).not.toHaveBeenCalled();
  } finally {
    await shared.db.webhookEndpoint.update({ where: { id: endpointId }, data: { enabled: true } });
  }
});

it("owner-checked finalization cannot complete a reclaimed batch", async () => {
  await seed(1);
  const [old] = await flush();
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: old.alertIds } },
    data: { deliveryClaimedAt: stale },
  });
  const [current] = await flush();
  await fencedActivities.finalizeFencedAlertDigestActivity({
    job: old,
    outcomes: [{ channel: "webhook", delivered: true }],
  });
  expect(
    await shared.db.triggeredAlert.findMany({ where: { id: { in: current.alertIds } } }),
  ).toEqual([
    expect.objectContaining({
      deliveryState: "digesting",
      deliveryClaimToken: current.deliveryClaimToken,
    }),
  ]);
  expect(
    await shared.db.deliveryAttempt.count({
      where: { triggeredAlertId: { in: current.alertIds } },
    }),
  ).toBe(0);
});

it("a new worker never resends a legacy activity that an old worker may have accepted", async () => {
  await seed(1);
  const [job] = await flush();
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: job.alertIds } },
    data: { digestSubmissionStarted: null },
  });
  const sends = vi
    .spyOn(transport, "postSignedBody")
    .mockResolvedValue({ latencyMs: 1, status: 204 });
  const { deliverAlertDigestWebhookActivity } = await import("./digest-delivery");
  expect(await deliverAlertDigestWebhookActivity({ endpointId, job })).toMatchObject({
    delivered: false,
    unknown: true,
  });
  expect(sends).not.toHaveBeenCalled();
  const currentSend = vi.fn(async () => ({ delivered: true }));
  expect(await fencedDigestSend(job, "webhook", endpointId, currentSend)).toMatchObject({
    delivered: false,
    unknown: true,
  });
  expect(currentSend).not.toHaveBeenCalled();
});

it("releases only its unsubmitted claim when preparation fails", async () => {
  await seed(1);
  const [job] = await flush();
  shared.db = fixture.db.$extends({
    query: {
      triggeredAlert: {
        async findMany({ args, query }) {
          if (args.select?.publicId) throw new Error("fixture preparation failure");
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;
  try {
    await expect(fencedActivities.prepareFencedAlertDigestActivity(job)).rejects.toThrow(
      "fixture preparation failure",
    );
  } finally {
    shared.db = fixture.db;
  }
  expect(await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } })).toEqual([
    expect.objectContaining({ deliveryState: "digest_pending", deliveryClaimToken: null }),
  ]);
});

it("does not orphan a claim when group construction fails after budget reservation", async () => {
  const [row] = await seed(1);
  shared.db = fixture.db.$extends({
    query: {
      alertRuleDailyStat: {
        async findUnique() {
          throw new Error("fixture group failure");
        },
      },
    },
  }) as unknown as PrismaClient;
  try {
    expect(await flush()).toEqual([]);
  } finally {
    shared.db = fixture.db;
  }
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { deliveryState: "digest_pending", deliveryClaimToken: null },
  );
});

it("parks pre-existing pending rows with detached legacy histories and sends only fresh peers", async () => {
  const old = await seed(2);
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: old.map((row) => row.id) } },
    data: { digestSubmissionStarted: null },
  });
  const [fresh] = await seed(1);
  const [job] = await flush();
  const prepared = await fencedActivities.prepareFencedAlertDigestActivity(job);
  expect(prepared?.alertIds).toEqual([fresh.id]);
  expect(
    await shared.db.deliveryAttempt.count({
      where: { triggeredAlertId: { in: old.map((row) => row.id) }, status: "unknown" },
    }),
  ).toBe(2);
  const send = vi.fn(async () => ({ delivered: true }));
  if (!prepared) throw new Error("Fresh digest was not prepared");
  expect(await fencedDigestSend(prepared, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(send).toHaveBeenCalledOnce();
});

it("marks an old producer's claim of a fresh row as legacy before it can be reclaimed", async () => {
  const [row] = await seed(1);
  await shared.db.triggeredAlert.updateMany({
    where: { id: row.id, deliveryState: "digest_pending" },
    data: {
      deliveryClaimedAt: stale,
      deliveryClaimToken: "old-producer",
      deliveryState: "digesting",
    },
  });
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { digestSubmissionStarted: null },
  );
  await recoverStaleDigestClaims(now);
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { deliveryState: "dead_letter" },
  );
  expect(await flush()).toEqual([]);
});

it("refuses an empty destination and an alert that left digesting", async () => {
  const [row] = await seed(1);
  const [job] = await flush();
  const send = vi.fn(async () => ({ delivered: true }));
  expect(await fencedDigestSend(job, "webhook", "", send)).toMatchObject({
    delivered: false,
    skipped: true,
  });
  await shared.db.triggeredAlert.update({
    where: { id: row.id },
    data: { deliveryState: "skipped" },
  });
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: false,
    skipped: true,
  });
  expect(send).not.toHaveBeenCalled();
});

it("incomplete prior destination rows never admit a larger batch", async () => {
  await seed(2);
  const [job] = await flush();
  const send = vi.fn(async () => ({ delivered: true }));
  expect(
    await fencedDigestSend({ ...job, alertIds: [job.alertIds[0]] }, "webhook", endpointId, send),
  ).toMatchObject({ delivered: true });
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({ unknown: true });
  expect(send).toHaveBeenCalledOnce();
});

it("retries only explicit rate-limit rejection under the same destination owner", async () => {
  const { ApplicationFailure } = await import("@temporalio/common");
  await seed(1);
  const [job] = await flush();
  const send = vi
    .fn()
    .mockRejectedValueOnce(
      ApplicationFailure.create({ message: "rate limited", type: "rate_limited" }),
    )
    .mockResolvedValue({ delivered: true });
  await expect(fencedDigestSend(job, "webhook", endpointId, send)).rejects.toThrow("rate limited");
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(await fencedDigestSend(job, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(send).toHaveBeenCalledTimes(2);
});

it("renews a prepared active job beyond its original TTL", async () => {
  await seed(1);
  const [job] = await flush();
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: job.alertIds } },
    data: { deliveryClaimedAt: stale },
  });
  expect(await fencedActivities.prepareFencedAlertDigestActivity(job)).not.toBeNull();
  await recoverStaleDigestClaims(now);
  expect(await shared.db.triggeredAlert.findMany({ where: { id: { in: job.alertIds } } })).toEqual([
    expect.objectContaining({
      deliveryState: "digesting",
      deliveryClaimToken: job.deliveryClaimToken,
    }),
  ]);
});

it("database defaults distinguish post-migration pending inserts by old producers", async () => {
  await shared.db
    .$executeRaw`INSERT INTO triggered_alerts (id, "publicId", "ruleId", "keywordId", "deliveryState", "updatedAt") VALUES ('raw-pending', ${makePublicId("al")}, ${ruleId}, ${keywordId}, 'digest_pending', CURRENT_TIMESTAMP)`;
  expect(
    await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: "raw-pending" } }),
  ).toMatchObject({ digestSubmissionStarted: false });
});

it("preparation refuses a partially missing batch rather than adopting its subset", async () => {
  await seed(1);
  const [job] = await flush();
  expect(
    await fencedActivities.prepareFencedAlertDigestActivity({
      ...job,
      alertIds: [...job.alertIds, "missing"],
    }),
  ).toBeNull();
  expect(await shared.db.alertDigestSend.count()).toBe(0);
});

it("requeues a provably unsubmitted refusal and permits its next owner", async () => {
  await seed(1);
  const [job] = await flush();
  expect(
    await fencedDigestSend(job, "webhook", endpointId, async () => ({
      delivered: false,
      skipped: true,
      reason: "Alert is no longer deliverable.",
    })),
  ).toMatchObject({ skipped: true });
  await fencedActivities.finalizeFencedAlertDigestActivity({
    job,
    outcomes: [
      {
        channel: "webhook",
        delivered: false,
        skipped: true,
        reason: "Alert is no longer deliverable.",
      },
    ],
  });
  const [current] = await flush();
  expect(current.deliveryClaimToken).not.toBe(job.deliveryClaimToken);
  const send = vi.fn(async () => ({ delivered: true }));
  expect(await fencedDigestSend(current, "webhook", endpointId, send)).toMatchObject({
    delivered: true,
  });
  expect(send).toHaveBeenCalledOnce();
});

it("a skipped recipient cannot erase another destination's accepted exposure", async () => {
  const [row] = await seed(1);
  const [job] = await flush();
  await fencedDigestSend(job, "email", "accepted-reader", async () => ({ delivered: true }));
  await fencedDigestSend(job, "email", "skipped-reader", async () => ({
    delivered: false,
    skipped: true,
  }));
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { digestSubmissionStarted: true },
  );
  await shared.db.triggeredAlert.update({
    where: { id: row.id },
    data: { deliveryClaimedAt: stale },
  });
  await recoverStaleDigestClaims(now);
  expect(await flush()).toEqual([]);
});

it("a definite failed outcome cannot become an unsubmitted skip", async () => {
  const [row] = await seed(1);
  const [job] = await flush();
  expect(
    await fencedDigestSend(job, "push", "rejected-device", async () => ({
      delivered: false,
      skipped: false,
    })),
  ).toMatchObject({ delivered: false, skipped: false });
  expect(
    await shared.db.alertDigestSend.findFirstOrThrow({ where: { alertId: row.id } }),
  ).toMatchObject({ state: "failed" });
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { digestSubmissionStarted: true },
  );
});

it("migration preserves pre-existing uncertainty while defaulting only future rows", async () => {
  await fixture.client.query("BEGIN");
  try {
    await fixture.client.query("DROP TRIGGER digest_reclaim_fence ON triggered_alerts");
    await fixture.client.query("DROP FUNCTION fence_digest_reclaim()");
    await fixture.client.query("DROP TRIGGER roadmap_delivery_fence ON roadmap_deliveries");
    await fixture.client.query("DROP FUNCTION fence_roadmap_delivery()");
    await fixture.client.query("DROP TABLE alert_digest_sends");
    await fixture.client.query(
      'ALTER TABLE triggered_alerts DROP COLUMN "digestSubmissionStarted"',
    );
    await fixture.client.query('ALTER TABLE roadmap_deliveries DROP COLUMN "submissionStarted"');
    const insert = `INSERT INTO triggered_alerts (id, "publicId", "ruleId", "keywordId", "deliveryState", "updatedAt") VALUES ($1, $2, $3, $4, 'digest_pending', CURRENT_TIMESTAMP)`;
    await fixture.client.query(insert, ["migration-old", makePublicId("al"), ruleId, keywordId]);
    await fixture.client.query(
      readFileSync(
        resolve("prisma/migrations/20261105060000_digest_send_fencing/migration.sql"),
        "utf8",
      ),
    );
    await fixture.client.query(insert, ["migration-new", makePublicId("al"), ruleId, keywordId]);
    const rows = await fixture.client.query(
      'SELECT id, "digestSubmissionStarted" FROM triggered_alerts WHERE id IN ($1, $2) ORDER BY id',
      ["migration-old", "migration-new"],
    );
    expect(rows.rows).toEqual([
      { id: "migration-new", digestSubmissionStarted: false },
      { id: "migration-old", digestSubmissionStarted: null },
    ]);
  } finally {
    await fixture.client.query("ROLLBACK");
  }
});

it.each([0, 1])("durably parks legacy alerts and bells with %s fresh peers", async (freshCount) => {
  await shared.db.membership.createMany({
    data: [ownerId, memberId, optedOutId].map((userId) => ({
      publicId: makePublicId("mbr"),
      projectId,
      userId,
    })),
  });
  await shared.db.notificationPreference.create({
    data: { projectId, userId: optedOutId, alertInApp: false },
  });
  const legacy = await seed(2);
  await shared.db.triggeredAlert.updateMany({
    where: { id: { in: legacy.map(({ id }) => id) } },
    data: { digestSubmissionStarted: null },
  });
  await seed(freshCount);
  const [job] = await flush();
  const prepared = await fencedActivities.prepareFencedAlertDigestActivity(job);
  expect(prepared?.alertIds.length ?? 0).toBe(freshCount);
  expect(await shared.db.notification.count({ where: { projectId } })).toBe(4);
  expect(
    await shared.db.deliveryAttempt.count({
      where: { triggeredAlertId: { in: legacy.map(({ id }) => id) }, status: "unknown" },
    }),
  ).toBe(2);
  expect(
    await shared.db.triggeredAlert.findMany({ where: { id: { in: legacy.map(({ id }) => id) } } }),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        deliveryState: "dead_letter",
        deliverySummary: [{ channel: "webhook", status: "unknown" }],
      }),
    ]),
  );
  const bells = await shared.db.notification.findMany({ where: { projectId } });
  for (const row of legacy)
    expect(
      bells
        .filter((bell) => bell.idempotencyKey === `triggered-alert:${row.id}:delivered`)
        .map((bell) => bell.userId)
        .sort(),
    ).toEqual([ownerId, memberId].sort());
  await fencedActivities.prepareFencedAlertDigestActivity(job);
  expect(await shared.db.notification.count({ where: { projectId } })).toBe(4);
});

it.each([false, true])(
  "rolls back parking with failed bell writes (recovery=%s)",
  async (recovery) => {
    const [row] = await seed(1);
    await shared.db.triggeredAlert.update({
      where: { id: row.id },
      data: { digestSubmissionStarted: null },
    });
    const [job] = await flush();
    await shared.db.triggeredAlert.updateMany({
      where: { id: row.id },
      data: { deliveryClaimedAt: stale },
    });
    await fixture.client.query(
      `CREATE FUNCTION fail_parking_bell() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture bell failure'; END $$; CREATE TRIGGER fail_parking_bell BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fail_parking_bell()`,
    );
    try {
      await expect(
        recovery
          ? recoverStaleDigestClaims(now)
          : fencedActivities.prepareFencedAlertDigestActivity(job),
      ).rejects.toThrow("fixture bell failure");
      expect(
        await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } }),
      ).toMatchObject({ deliveryState: "digesting", deliveryClaimToken: job.deliveryClaimToken });
      expect(await shared.db.deliveryAttempt.count({ where: { triggeredAlertId: row.id } })).toBe(
        0,
      );
    } finally {
      await fixture.client.query(
        `DROP TRIGGER fail_parking_bell ON notifications; DROP FUNCTION fail_parking_bell()`,
      );
    }
    await recoverStaleDigestClaims(new Date(Date.now() + 31 * 60_000));
    expect(await shared.db.notification.count({ where: { projectId } })).toBe(1);
    await recoverStaleDigestClaims(new Date(Date.now() + 31 * 60_000));
    expect(await shared.db.notification.count({ where: { projectId } })).toBe(1);
  },
);

function pushSender(statuses: Array<number | Error>) {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const transport = vi.fn(async () => {
    const next = statuses.shift() ?? 200;
    if (next instanceof Error) throw next;
    return {
      status: next,
      body: JSON.stringify({ reason: next === 429 ? "TooManyRequests" : "ServiceUnavailable" }),
    };
  });
  vi.spyOn(pushTransport, "defaultPushSender").mockReturnValue(
    pushTransport.createApnsSender(
      {
        keyId: "fixture",
        teamId: "fixture",
        topic: "com.example.app",
        privateKey: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      },
      { transport },
    ),
  );
  return transport;
}

it.each([false, true])(
  "preserves unknown push counts through real finalization and health (mixed=%s)",
  async (mixed) => {
    await seed(1);
    const [job] = await flush();
    job.channels = ["push", "slack"];
    vi.spyOn(pushTokens, "projectPushRecipients").mockResolvedValue(
      Array.from({ length: mixed ? 2 : 1 }, (_, i) => ({
        token: String(i).repeat(64),
        environment: "sandbox" as const,
        userId: ownerId,
      })),
    );
    const transport = pushSender(
      mixed ? [200, new Error("lost receipt")] : [new Error("lost receipt")],
    );
    const outcome = await fencedActivities.deliverFencedAlertDigestPushActivity(job);
    expect(outcome).toMatchObject({
      counts: { acceptedCount: mixed ? 1 : 0, failedCount: 0, unknownCount: 1 },
    });
    await fencedActivities.finalizeFencedAlertDigestActivity({
      job,
      outcomes: [
        { channel: "push", ...outcome },
        { channel: "slack", delivered: false, unknown: true },
      ],
    });
    const health = await collectAlertDeliveryHealth(new Date(), getAlertHealthConfig());
    expect(health).toMatchObject({
      unknown: 2,
      recipientCounts: { acceptedCount: mixed ? 1 : 0, failedCount: 0, unknownCount: 1 },
    });
    expect(transport).toHaveBeenCalledTimes(mixed ? 2 : 1);
  },
);

it("retries a definitive push rate rejection under the same owner and retains accepted devices", async () => {
  await seed(1);
  const [job] = await flush();
  job.channels = ["push"];
  vi.spyOn(pushTokens, "projectPushRecipients").mockResolvedValue(
    [0, 1].map((i) => ({
      token: String(i).repeat(64),
      environment: "sandbox" as const,
      userId: ownerId,
    })),
  );
  const transport = pushSender([200, 429, 200]);
  await expect(fencedActivities.deliverFencedAlertDigestPushActivity(job)).rejects.toMatchObject({
    type: "rate_limited",
    nextRetryDelay: "60 seconds",
  });
  expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
    counts: { acceptedCount: 2, failedCount: 0, unknownCount: 0 },
  });
  await fencedActivities.deliverFencedAlertDigestPushActivity(job);
  expect(transport).toHaveBeenCalledTimes(3);
});

it.each([503, new Error("transport receipt lost")])(
  "never resends an ambiguous push result %s",
  async (status) => {
    await seed(1);
    const [job] = await flush();
    job.channels = ["push"];
    vi.spyOn(pushTokens, "projectPushRecipients").mockResolvedValue([
      { token: "a".repeat(64), environment: "sandbox", userId: ownerId },
    ]);
    const transport = pushSender([status]);
    expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
      counts: { acceptedCount: 0, failedCount: 0, unknownCount: 1 },
    });
    expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
      counts: { acceptedCount: 0, failedCount: 0, unknownCount: 1 },
    });
    expect(transport).toHaveBeenCalledOnce();
  },
);

it("never repeats an accepted push after a lost completion write", async () => {
  await seed(1);
  const [job] = await flush();
  job.channels = ["push"];
  vi.spyOn(pushTokens, "projectPushRecipients").mockResolvedValue([
    { token: "a".repeat(64), environment: "sandbox", userId: ownerId },
  ]);
  const transport = pushSender([200]);
  await fixture.client.query(
    `CREATE FUNCTION fail_push_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'lost completion'; END $$; CREATE TRIGGER fail_push_receipt BEFORE UPDATE ON alert_digest_sends FOR EACH ROW EXECUTE FUNCTION fail_push_receipt()`,
  );
  try {
    expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
      unknown: true,
    });
  } finally {
    await fixture.client.query(
      `DROP TRIGGER fail_push_receipt ON alert_digest_sends; DROP FUNCTION fail_push_receipt()`,
    );
  }
  expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
    counts: { acceptedCount: 0, failedCount: 0, unknownCount: 1 },
  });
  expect(transport).toHaveBeenCalledOnce();
});

it("leaves an old SQL reclaim for recovery with transactional bells", async () => {
  const [row] = await seed(1);
  await shared.db.triggeredAlert.update({
    where: { id: row.id },
    data: { digestSubmissionStarted: null },
  });
  const [job] = await flush();
  await shared.db.triggeredAlert.updateMany({
    where: { id: row.id },
    data: { deliveryClaimedAt: stale },
  });
  expect(
    await shared.db.triggeredAlert.updateMany({
      where: { id: row.id },
      data: { deliveryState: "digest_pending", deliveryClaimToken: null },
    }),
  ).toEqual({ count: 0 });
  expect(await shared.db.notification.count({ where: { projectId } })).toBe(0);
  await recoverStaleDigestClaims(now);
  expect(await shared.db.notification.count({ where: { projectId } })).toBe(1);
  expect(await shared.db.triggeredAlert.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
    { deliveryState: "dead_letter", deliveryClaimToken: null },
  );
  expect(await fencedActivities.prepareFencedAlertDigestActivity(job)).toBeNull();
});

it("keeps accepted devices and definitive failures counted when push retries are exhausted", async () => {
  await seed(1);
  const [job] = await flush();
  job.channels = ["push"];
  vi.spyOn(Context, "current").mockReturnValue({ info: { attempt: 5 } } as Context);
  vi.spyOn(pushTokens, "projectPushRecipients").mockResolvedValue(
    [0, 1].map((i) => ({
      token: String(i).repeat(64),
      environment: "sandbox" as const,
      userId: ownerId,
    })),
  );
  const transport = pushSender([200, 429]);
  expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
    counts: { acceptedCount: 1, failedCount: 1, unknownCount: 0 },
  });
  expect(await fencedActivities.deliverFencedAlertDigestPushActivity(job)).toMatchObject({
    counts: { acceptedCount: 1, failedCount: 1, unknownCount: 0 },
  });
  expect(transport).toHaveBeenCalledTimes(2);
});
