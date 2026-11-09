import { afterEach, describe, expect, it, vi } from "vitest";
import { assertResolvedCapacity, readEnvironmentCapacity } from "./env-capacity";
import { CapacityLimitError } from "./errors";

describe("capacity transaction contract", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("preserves self-host limits and treats absent or invalid settings as unlimited", () => {
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "3");
    vi.stubEnv("BISIBILITY_MAX_KEYWORDS_PER_PROJECT", "7");
    expect(readEnvironmentCapacity("projects")).toBe(3);
    expect(readEnvironmentCapacity("keywordsPerProject")).toBe(7);
    expect(readEnvironmentCapacity("weeklyRequests")).toBeNull();
    vi.stubEnv("BISIBILITY_MAX_PROJECTS_PER_USER", "-3");
    expect(readEnvironmentCapacity("projects")).toBeNull();
  });
  it("counts under the transaction lock before admitting or blocking creation", async () => {
    const steps: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => {
        steps.push("lock");
      }),
    };
    const request = {
      additional: 1,
      countUsed: vi.fn(async (client) => {
        expect(client).toBe(tx);
        steps.push("count");
        return 3;
      }),
    };
    await expect(
      assertResolvedCapacity(tx as never, "owner", "projects", request, 3, "account"),
    ).rejects.toBeInstanceOf(CapacityLimitError);
    expect(steps).toEqual(["lock", "count"]);
    request.countUsed.mockResolvedValue(2);
    await expect(
      assertResolvedCapacity(tx as never, "owner", "projects", request, 3, "account"),
    ).resolves.toBeUndefined();
  });
  it.each([-1, 1.5, NaN, Infinity])("rejects invalid increments: %s", async (additional) => {
    await expect(
      assertResolvedCapacity(
        {} as never,
        "owner",
        "projects",
        { additional, countUsed: vi.fn() },
        null,
        "account",
      ),
    ).rejects.toThrow(RangeError);
  });
  it.each([-1, 1.5, NaN])("rejects invalid current usage: %s", async (used) => {
    await expect(
      assertResolvedCapacity(
        { $executeRaw: vi.fn() } as never,
        "owner",
        "projects",
        { additional: 1, countUsed: vi.fn().mockResolvedValue(used) },
        3,
        "account",
      ),
    ).rejects.toThrow(RangeError);
  });
  it("requires a project for project-scoped locks and skips unbounded counters", async () => {
    const request = { additional: 1, countUsed: vi.fn() };
    await expect(
      assertResolvedCapacity({} as never, "owner", "competitorsPerProject", request, 3, "project"),
    ).rejects.toThrow("Project capacity requires a project id.");
    await assertResolvedCapacity({} as never, "owner", "projects", request, null, "account");
    expect(request.countUsed).not.toHaveBeenCalled();
  });
});
