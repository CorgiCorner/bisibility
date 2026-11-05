import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { temporal } from "@temporalio/proto";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { Worker } from "@temporalio/worker";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { AlertDigestJob } from "../alerts/digest-types";

let environment: TestWorkflowEnvironment;
const historyPath = resolve("tests/fixtures/temporal/digest-legacy-history.json");
const job = {
  alertIds: ["a", "b"],
  alerts: [],
  channels: ["webhook"],
  deliveryClaimToken: "legacy-owner",
  webhookEndpointIds: ["fixture-endpoint"],
} as unknown as AlertDigestJob;

beforeAll(async () => {
  environment = await TestWorkflowEnvironment.createLocal();
}, 60_000);
afterAll(async () => {
  await environment?.teardown();
});

it("replays the recorded pre-fence digest history without changing its commands", async () => {
  await Worker.runReplayHistory(
    { workflowsPath: resolve("lib/temporal/alert-delivery-workflows.ts") },
    temporal.api.history.v1.History.fromObject(JSON.parse(readFileSync(historyPath, "utf8"))),
  );
}, 60_000);

it.each([false, true, "", 42])(
  "uses isolated fenced activities with persisted queue %s",
  async (withMemo) => {
    const calls: string[] = [];
    const activities = Object.fromEntries(
      [
        ["prepareAlertDigestDeliveryActivity", job],
        ["prepareFencedAlertDigestActivity", job],
        ["deliverAlertDigestWebhookActivity", { delivered: true }],
        ["deliverFencedAlertDigestWebhookActivity", { delivered: true }],
        ["finalizeAlertDigestDeliveryActivity", { deliveryState: "digested" }],
        ["finalizeFencedAlertDigestActivity", { deliveryState: "digested" }],
      ].map(([name, result]) => [
        String(name),
        async () => {
          calls.push(String(name));
          return result;
        },
      ]),
    );
    const queue = `digest-patch-test-${withMemo}-fenced-v1`;
    const worker = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue: queue,
      workflowsPath: resolve("lib/temporal/alert-delivery-workflows.ts"),
      activities,
    });
    const fenced = await Worker.create({
      connection: environment.nativeConnection,
      taskQueue: `${queue}-fenced-v1`,
      workflowsPath: resolve("lib/temporal/alert-delivery-workflows.ts"),
      activities,
    });
    const history = await worker.runUntil(() =>
      fenced.runUntil(async () => {
        const handle = await environment.client.workflow.start("alertDigestDeliveryWorkflow", {
          args: [job],
          taskQueue: withMemo === true ? `${queue}-fenced-v1` : queue,
          memo:
            withMemo === true
              ? { digestActivityTaskQueue: `${queue}-fenced-v1` }
              : withMemo === false
                ? {}
                : { digestActivityTaskQueue: withMemo },
          workflowId: `digest-new-history-${withMemo}`,
        });
        await handle.result();
        return handle.fetchHistory();
      }),
    );
    const scheduled =
      history.events?.flatMap((event) =>
        event.activityTaskScheduledEventAttributes
          ? [event.activityTaskScheduledEventAttributes]
          : [],
      ) ?? [];
    expect(scheduled).toHaveLength(3);
    expect(scheduled.map((event) => event.taskQueue?.name)).toEqual(
      Array(3).fill(`${queue}-fenced-v1`),
    );
    expect(calls).toEqual([
      "prepareFencedAlertDigestActivity",
      "deliverFencedAlertDigestWebhookActivity",
      "finalizeFencedAlertDigestActivity",
    ]);
  },
  60_000,
);

it("sends fenced push activities on the owned queue and retains counts", async () => {
  const counts = { acceptedCount: 1, failedCount: 0, unknownCount: 1 };
  const outcome = { delivered: true, unknown: true, counts };
  const pushJob = { ...job, channels: ["push"] };
  const calls: string[] = [];
  const worker = await Worker.create({
    connection: environment.nativeConnection,
    taskQueue: "digest-push-routing-fenced-v1",
    workflowsPath: resolve("lib/temporal/alert-delivery-workflows.ts"),
    activities: {
      prepareFencedAlertDigestActivity: async () => pushJob,
      deliverFencedAlertDigestPushActivity: async () => {
        calls.push("fenced-push");
        return outcome;
      },
      finalizeFencedAlertDigestActivity: async (input: { outcomes: unknown[] }) => {
        expect(input.outcomes).toEqual([{ channel: "push", ...outcome }]);
        return { deliveryState: "digested" };
      },
    },
  });
  const result = await worker.runUntil(() =>
    environment.client.workflow.execute("alertDigestDeliveryWorkflow", {
      args: [pushJob],
      taskQueue: "digest-push-routing-fenced-v1",
      workflowId: "fenced-push-counts",
      memo: { digestActivityTaskQueue: "digest-push-routing-fenced-v1" },
    }),
  );
  expect(result).toMatchObject({ status: "digested", outcomes: [{ channel: "push", ...outcome }] });
  expect(calls).toEqual(["fenced-push"]);
}, 60_000);
