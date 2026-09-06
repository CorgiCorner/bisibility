import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendCloudWelcomeSequence, wakeCloudWelcomeSequenceWorker } from "./welcome-signup";

const mocks = vi.hoisted(() => ({
  publishWorkerIntent: vi.fn(),
}));

vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: mocks.publishWorkerIntent,
}));

const user = { email: "ada@example.com", id: "user_1", name: "Ada" };

describe("signup welcome sequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.publishWorkerIntent.mockResolvedValue({ mode: "redis", ok: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("adds a durable intent to the Cloud user create payload", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");

    const result = await sendCloudWelcomeSequence(user);

    expect(result).toEqual({
      data: { ...user, welcomeFollowupRequestedAt: expect.any(Date) },
    });
    expect(mocks.publishWorkerIntent).not.toHaveBeenCalled();
  });

  it("does nothing for self-hosted signups", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "self-host");

    await expect(sendCloudWelcomeSequence(user)).resolves.toBeUndefined();

    expect(mocks.publishWorkerIntent).not.toHaveBeenCalled();
  });

  it("wakes the worker without extending the transaction hook", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    mocks.publishWorkerIntent.mockImplementation(() => new Promise(() => undefined));

    await expect(wakeCloudWelcomeSequenceWorker()).resolves.toBeUndefined();
    expect(mocks.publishWorkerIntent).toHaveBeenCalledWith("welcome_followup");
  });

  it("falls back to polling when the wake publish fails", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "cloud");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.publishWorkerIntent.mockResolvedValue({ mode: "redis", ok: false });

    await wakeCloudWelcomeSequenceWorker();

    await vi.waitFor(() => expect(console.error).toHaveBeenCalledOnce());
  });

  it("keeps the signup hook free from engine clients", () => {
    const source = readFileSync("lib/auth/welcome-signup.ts", "utf8");

    expect(source).not.toMatch(/lib\/temporal\/.+-client/);
  });
});
