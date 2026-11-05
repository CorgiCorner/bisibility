import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteInvalid: vi.fn(), recipients: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/push-tokens", () => ({
  deleteInvalidPushToken: mocks.deleteInvalid,
  projectPushRecipients: mocks.recipients,
}));

import type { PushResult, PushSender } from "@/lib/notifications/apns";
import { storedDeliverySummary } from "./delivery-counts";
import { deliverPushToProject } from "./push-delivery";

const message = { body: "b", collapseId: "c", data: {}, threadId: "t", title: "t" };

it("accepts measured summaries and unmeasured unknowns, rejecting malformed counters", () => {
  const measured = {
    channel: "push",
    counts: { acceptedCount: 1, failedCount: 0, unknownCount: 1 },
    status: "partial",
  };
  expect(storedDeliverySummary([measured, { channel: "push", status: "unknown" }])).toEqual([
    measured,
    { channel: "push", status: "unknown" },
  ]);
  for (const counts of [
    { acceptedCount: -1, failedCount: 1, unknownCount: 0 },
    { acceptedCount: 0.5, failedCount: 1, unknownCount: 0 },
    { acceptedCount: 0, failedCount: null, unknownCount: 1 },
    { acceptedCount: 0, unknownCount: 1 },
  ])
    expect(storedDeliverySummary([{ channel: "email", counts }])).toEqual([]);
  expect(storedDeliverySummary([{ channel: "other", counts: measured.counts }])).toEqual([]);
});

function fakeSender(results: Record<string, PushResult>): PushSender {
  return {
    send: vi.fn(async (token: string) => results[token] ?? { kind: "sent" }),
    topic: "com.example.app",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.deleteInvalid.mockResolvedValue(undefined);
  mocks.recipients.mockResolvedValue([
    { environment: "production", token: "aa", userId: "u1" },
    { environment: "sandbox", token: "bb", userId: "u2" },
  ]);
});

describe("push delivery", () => {
  it("counts accepted, rejected and ambiguous devices separately", async () => {
    const sender = fakeSender({ aa: { kind: "sent" } });
    vi.mocked(sender.send).mockRejectedValueOnce(new Error("connection lost"));
    expect(await deliverPushToProject(sender, "project_1", message)).toMatchObject({
      acceptedCount: 1,
      failedCount: 0,
      unknownCount: 1,
    });
    expect(sender.send).toHaveBeenCalledTimes(2);
  });
  it("sends to every device for the configured bundle and drops unregistered tokens", async () => {
    const sender = fakeSender({ bb: { kind: "invalid_token", reason: "Unregistered" } });
    const result = await deliverPushToProject(sender, "project_1", message);
    expect(mocks.recipients).toHaveBeenCalledWith("project_1", "com.example.app");
    expect(result).toEqual({
      acceptedCount: 1,
      failedCount: 1,
      unknownCount: 0,
      devices: 2,
      failures: [],
      retryable: false,
      sent: 1,
    });
    expect(mocks.deleteInvalid).toHaveBeenCalledWith("bb");
  });

  it("reports retryable failures without hiding sent devices", async () => {
    const sender = fakeSender({
      aa: { kind: "retryable", reason: "TooManyRequests" },
      bb: { kind: "rejected", reason: "InvalidProviderToken" },
    });
    expect(await deliverPushToProject(sender, "project_1", message)).toEqual({
      acceptedCount: 0,
      failedCount: 2,
      unknownCount: 0,
      devices: 2,
      failures: ["TooManyRequests", "InvalidProviderToken"],
      retryable: true,
      sent: 0,
    });
  });
});
