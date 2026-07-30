import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimDeployReplay,
  completeDeployReplay,
  releaseDeployReplay,
  resetDeployReplayStateForTests,
} from "./deploy-replay";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/redis/redis", () => ({
  getRedisClient: vi.fn().mockResolvedValue(null),
  redisConfigured: vi.fn().mockReturnValue(false),
}));

describe("deploy replay claims", () => {
  beforeEach(() => {
    resetDeployReplayStateForTests();
  });

  it("collapses a completed deployment only within the same hook", async () => {
    const first = await claimDeployReplay("hook_1", "deploy_1");
    await completeDeployReplay(first);

    await expect(claimDeployReplay("hook_1", "deploy_1")).resolves.toEqual({
      status: "duplicate",
    });
    await expect(claimDeployReplay("hook_2", "deploy_1")).resolves.toMatchObject({
      status: "acquired",
    });
  });

  it("allows a retry when signal emission releases the claim", async () => {
    const first = await claimDeployReplay("hook_1", "deploy_1");
    await releaseDeployReplay(first);

    await expect(claimDeployReplay("hook_1", "deploy_1")).resolves.toMatchObject({
      status: "acquired",
    });
  });

  it("does not claim events that have no deployment identifier", async () => {
    await expect(claimDeployReplay("hook_1", undefined)).resolves.toEqual({
      status: "untracked",
    });
  });
});
