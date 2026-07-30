import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetDeployReplayStateForTests } from "./deploy-replay";
import { ingestDeployEvent } from "./ingest-deploy-event";

const mocks = vi.hoisted(() => ({
  emitSignal: vi.fn(),
  markDeployIngestHookUsed: vi.fn(),
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/queries/ingest-deploy", () => ({
  markDeployIngestHookUsed: mocks.markDeployIngestHookUsed,
}));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  redisConfigured: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));

describe("ingestDeployEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDeployReplayStateForTests();
    mocks.emitSignal.mockResolvedValue({
      id: "signal_1",
      publicId: "sig_abcdefghijklmnopqrstuvwx",
    });
  });

  it("marks synthetic events and uses the production parse and emit path", async () => {
    const result = await ingestDeployEvent({
      actorId: "user_1",
      body: {
        deployment_id: "test_123",
        environment: "test",
        paths: ["/"],
      },
      hookId: "hook_1",
      projectId: "project_1",
      provider: null,
      test: true,
    });

    expect(result).toMatchObject({
      payload: {
        deploymentId: "test_123",
        environment: "test",
        paths: ["/"],
        provider: "generic",
        test: true,
      },
      signal: { id: "signal_1", publicId: "sig_abcdefghijklmnopqrstuvwx" },
      status: "created",
    });
    expect(mocks.emitSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        createdById: "user_1",
        payload: expect.objectContaining({ test: true }),
        projectId: "project_1",
        type: "deploy.completed",
      }),
    );
    expect(mocks.writeAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: "sig_abcdefghijklmnopqrstuvwx",
        targetType: "signal",
      }),
    );
    expect(mocks.markDeployIngestHookUsed).toHaveBeenCalledWith("hook_1");
  });

  it("acknowledges known non-success events without emitting", async () => {
    await expect(
      ingestDeployEvent({
        actorId: null,
        body: { type: "deployment.failed" },
        hookId: "hook_1",
        projectId: "project_1",
        provider: "vercel",
      }),
    ).resolves.toEqual({ status: "ignored" });

    expect(mocks.emitSignal).not.toHaveBeenCalled();
    expect(mocks.markDeployIngestHookUsed).toHaveBeenCalledWith("hook_1");
  });
});
