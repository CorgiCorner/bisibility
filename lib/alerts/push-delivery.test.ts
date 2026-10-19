import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteInvalid: vi.fn(), recipients: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/push-tokens", () => ({
  deleteInvalidPushToken: mocks.deleteInvalid,
  projectPushRecipients: mocks.recipients,
}));

import type { PushResult, PushSender } from "@/lib/notifications/apns";
import { deliverPushToProject } from "./push-delivery";

const message = { body: "b", collapseId: "c", data: {}, threadId: "t", title: "t" };

function fakeSender(results: Record<string, PushResult>): PushSender {
  return {
    send: vi.fn(async (token: string) => results[token] ?? { kind: "sent" }),
    topic: "com.example.app",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recipients.mockResolvedValue([
    { environment: "production", token: "aa", userId: "u1" },
    { environment: "sandbox", token: "bb", userId: "u2" },
  ]);
});

describe("push delivery", () => {
  it("sends to every device for the configured bundle and drops unregistered tokens", async () => {
    const sender = fakeSender({ bb: { kind: "invalid_token", reason: "Unregistered" } });
    const result = await deliverPushToProject(sender, "project_1", message);
    expect(mocks.recipients).toHaveBeenCalledWith("project_1", "com.example.app");
    expect(result).toEqual({ devices: 2, failures: [], retryable: false, sent: 1 });
    expect(mocks.deleteInvalid).toHaveBeenCalledWith("bb");
  });

  it("reports retryable failures without hiding sent devices", async () => {
    const sender = fakeSender({
      aa: { kind: "retryable", reason: "TooManyRequests" },
      bb: { kind: "rejected", reason: "InvalidProviderToken" },
    });
    expect(await deliverPushToProject(sender, "project_1", message)).toEqual({
      devices: 2,
      failures: ["TooManyRequests", "InvalidProviderToken"],
      retryable: true,
      sent: 0,
    });
  });
});
