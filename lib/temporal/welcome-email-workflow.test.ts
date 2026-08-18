import { beforeEach, describe, expect, it, vi } from "vitest";
import { welcomeFollowupWorkflow } from "./welcome-email-workflow";

const mocks = vi.hoisted(() => {
  const welcomeActivity = vi.fn();
  const followupActivity = vi.fn();
  const proxyActivities = vi.fn();
  const sleep = vi.fn();
  return { welcomeActivity, followupActivity, proxyActivities, sleep };
});

vi.mock("@temporalio/workflow", () => ({
  proxyActivities: mocks.proxyActivities.mockReturnValue({
    sendWelcomeEmailActivity: mocks.welcomeActivity,
    sendWelcomeFollowupActivity: mocks.followupActivity,
  }),
  sleep: mocks.sleep,
}));

function invocationOrder() {
  return [
    mocks.sleep.mock.invocationCallOrder[0],
    mocks.welcomeActivity.mock.invocationCallOrder[0],
    mocks.sleep.mock.invocationCallOrder[1],
    mocks.followupActivity.mock.invocationCallOrder[0],
  ];
}

describe("welcome follow-up workflow", () => {
  beforeEach(() => {
    mocks.sleep.mockClear();
    mocks.welcomeActivity.mockClear();
    mocks.followupActivity.mockClear();
    mocks.sleep.mockResolvedValue(undefined);
    mocks.welcomeActivity.mockResolvedValue({ status: "sent" });
    mocks.followupActivity.mockResolvedValue({ status: "sent" });
  });

  it("sleeps 1 hour, sends welcome, sleeps 47 hours, sends follow-up, in that order", async () => {
    await expect(welcomeFollowupWorkflow({ userId: "user_1" })).resolves.toEqual({
      status: "sent",
    });

    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).toHaveBeenNthCalledWith(1, "1 hour");
    expect(mocks.sleep).toHaveBeenNthCalledWith(2, "47 hours");
    expect(mocks.welcomeActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });
    expect(mocks.followupActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });

    const order = invocationOrder();
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it.each([
    ["already_sent", { status: "already_sent" as const }],
    ["missing", { status: "missing" as const }],
    ["deactivated", { status: "deactivated" as const }],
  ])(
    "still sleeps 47 hours and sends follow-up when welcome result is %s",
    async (_label, welcomeResult) => {
      mocks.welcomeActivity.mockResolvedValue(welcomeResult);
      mocks.followupActivity.mockResolvedValue({ status: "sent" });

      await expect(welcomeFollowupWorkflow({ userId: "user_1" })).resolves.toEqual({
        status: "sent",
      });

      expect(mocks.sleep).toHaveBeenCalledTimes(2);
      expect(mocks.sleep).toHaveBeenNthCalledWith(1, "1 hour");
      expect(mocks.sleep).toHaveBeenNthCalledWith(2, "47 hours");
      expect(mocks.welcomeActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });
      expect(mocks.followupActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });

      const order = invocationOrder();
      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThan(order[i - 1]);
      }
    },
  );

  it("returns invited_member immediately with only the first sleep and no follow-up", async () => {
    mocks.welcomeActivity.mockResolvedValue({ status: "invited_member" });

    await expect(welcomeFollowupWorkflow({ userId: "user_1" })).resolves.toEqual({
      status: "invited_member",
    });

    expect(mocks.sleep).toHaveBeenCalledTimes(1);
    expect(mocks.sleep).toHaveBeenNthCalledWith(1, "1 hour");
    expect(mocks.welcomeActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });
    expect(mocks.followupActivity).not.toHaveBeenCalled();
  });

  it("still reaches the second sleep and follow-up when the welcome activity rejects", async () => {
    mocks.welcomeActivity.mockRejectedValue(new Error("retries exhausted"));
    mocks.followupActivity.mockResolvedValue({ status: "sent" });

    await expect(welcomeFollowupWorkflow({ userId: "user_1" })).resolves.toEqual({
      status: "sent",
    });

    expect(mocks.sleep).toHaveBeenCalledTimes(2);
    expect(mocks.sleep).toHaveBeenNthCalledWith(1, "1 hour");
    expect(mocks.sleep).toHaveBeenNthCalledWith(2, "47 hours");
    expect(mocks.welcomeActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });
    expect(mocks.followupActivity).toHaveBeenCalledExactlyOnceWith({ userId: "user_1" });

    const order = invocationOrder();
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1]);
    }
  });

  it("returns the follow-up activity result, not the welcome result", async () => {
    mocks.welcomeActivity.mockResolvedValue({ status: "already_sent" });
    mocks.followupActivity.mockResolvedValue({ status: "unsubscribed" });

    await expect(welcomeFollowupWorkflow({ userId: "user_1" })).resolves.toEqual({
      status: "unsubscribed",
    });
  });

  it("configures the activity proxy with the required retry policy", () => {
    welcomeFollowupWorkflow({ userId: "user_1" });

    expect(mocks.proxyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        retry: expect.objectContaining({
          maximumAttempts: 24,
          backoffCoefficient: 2,
          initialInterval: "10 seconds",
          maximumInterval: "10 minutes",
        }),
        startToCloseTimeout: "1 minute",
      }),
    );
  });
});
