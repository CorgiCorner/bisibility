import { afterEach, describe, expect, it, vi } from "vitest";
import { readReachedProjectLimit } from "./resource-limits";

function clientWithCount(count: number) {
  return { project: { count: vi.fn().mockResolvedValue(count) } };
}

describe("readReachedProjectLimit", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is null when the instance has no project limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "");
    const client = clientWithCount(10);

    await expect(readReachedProjectLimit(client as never, "user-1")).resolves.toBeNull();
    expect(client.project.count).not.toHaveBeenCalled();
  });

  it("is null while the owner is under the limit", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "3");

    await expect(readReachedProjectLimit(clientWithCount(2) as never, "user-1")).resolves.toBe(
      null,
    );
  });

  it("returns the limit once the owner reaches it, counting only real owned projects", async () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "3");
    const client = clientWithCount(3);

    await expect(readReachedProjectLimit(client as never, "user-1")).resolves.toBe(3);
    expect(client.project.count).toHaveBeenCalledWith({
      where: { isSample: false, ownerId: "user-1" },
    });
  });
});
