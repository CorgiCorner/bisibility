import { WorkflowExecutionAlreadyStartedError } from "@temporalio/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertDigestJob } from "../alerts/digest-types";
import { buildAlertDigestWebhookBody } from "../alerts/webhook-envelope";
import {
  alertDeliveryWorkflowId,
  alertDigestDeliveryWorkflowId,
  enqueueAlertDeliveries,
  enqueueAlertDigestJob,
  startAlertDeliveryWorkflow,
} from "./alert-delivery-client";

const publicId = (prefix: string) => `${prefix}_a${"0".repeat(23)}`;

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
}));

vi.mock("./client", () => ({
  getTemporalClient: vi.fn(() => Promise.resolve({ workflow: { start: mocks.start } })),
}));

describe("alert delivery client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.start.mockResolvedValue({});
  });

  it("starts a deterministic workflow on the dedicated task queue", async () => {
    expect(alertDeliveryWorkflowId("alert_1")).toBe("alert-delivery-alert_1");
    await startAlertDeliveryWorkflow("alert_1");
    expect(mocks.start).toHaveBeenCalledWith("alertDeliveryWorkflow", {
      args: [{ alertId: "alert_1" }],
      taskQueue: "alert-deliveries",
      workflowId: "alert-delivery-alert_1",
    });
  });

  it("treats an already-started workflow as success", async () => {
    mocks.start.mockRejectedValue(
      new WorkflowExecutionAlreadyStartedError(
        "already started",
        "alert-delivery-alert_1",
        "alertDeliveryWorkflow",
      ),
    );
    await expect(startAlertDeliveryWorkflow("alert_1")).resolves.toBeUndefined();
  });

  it("enqueues every alert best-effort", async () => {
    mocks.start.mockRejectedValueOnce(new Error("Temporal unavailable"));
    await expect(enqueueAlertDeliveries(["alert_1", "alert_2"])).resolves.toBeUndefined();
    expect(mocks.start).toHaveBeenCalledTimes(2);
  });

  it("starts digest delivery with a deterministic id and no endpoint secrets", async () => {
    const job: AlertDigestJob = {
      alertIds: ["alert_1", "alert_2"],
      alerts: [],
      channels: ["webhook"],
      conditionType: "position_drop",
      createdAt: "2026-07-21T20:00:00.000Z",
      deliveryClaimToken: "claim_1",
      email: { html: "", subject: "Digest", text: "" },
      projectDomain: "example.com",
      projectId: "project_1",
      projectName: "Example",
      recipients: [],
      ruleId: "rule_1",
      ruleName: "Drop",
      slackText: "Digest",
      suppressedTodayCount: 0,
      webhookBody: buildAlertDigestWebhookBody(
        {
          alert_count: 0,
          alerts: [],
          condition_type: "position_drop",
          project_domain: "example.com",
          project_id: publicId("prj"),
          rule_id: publicId("alr"),
          rule_name: "Drop",
          suppressed_today_count: 0,
        },
        "2026-07-21T20:00:00.000Z",
      ),
      webhookEndpointIds: ["webhook_1"],
    };
    expect(alertDigestDeliveryWorkflowId(job)).toBe("alert-digest-rule_1-alert_1-2");
    await enqueueAlertDigestJob(job);
    expect(mocks.start).toHaveBeenCalledWith("alertDigestDeliveryWorkflow", {
      args: [job],
      taskQueue: "alert-deliveries",
      workflowId: "alert-digest-rule_1-alert_1-2",
    });
    expect(JSON.stringify(job)).not.toContain("hmacSecret");
  });
});
