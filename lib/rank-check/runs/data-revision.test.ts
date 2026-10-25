import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRankDataRevision } from "./data-revision";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: query } }));

describe("rank data revision read", () => {
  beforeEach(() => {
    query.mockReset();
  });
  it("returns the database token without transferring run history to the server", async () => {
    const revision = "a".repeat(64);
    query.mockResolvedValue([{ revision }]);
    expect(await readRankDataRevision("project_1")).toBe(revision);
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.any(Array), "project_1", "project_1", 25);
  });
  it("propagates failed reads instead of publishing a fabricated revision", async () => {
    query.mockRejectedValue(new Error("database unavailable"));
    await expect(readRankDataRevision("project_1")).rejects.toThrow("database unavailable");
  });
});
