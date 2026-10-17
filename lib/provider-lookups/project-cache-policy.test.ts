import { describe, expect, it, vi } from "vitest";
import {
  projectCacheEntryCurrent,
  projectCacheTtl,
  withProjectCachePolicy,
} from "./project-cache-policy";

vi.mock("server-only", () => ({}));
describe("project research cache lifetime", () => {
  it("isolates concurrent projects and restores defaults after each request", async () => {
    const [first, second] = await Promise.all([
      withProjectCachePolicy(3600, async () => {
        await Promise.resolve();
        return projectCacheTtl(43200);
      }),
      withProjectCachePolicy(86400, async () => {
        await Promise.resolve();
        return projectCacheTtl(43200);
      }),
    ]);
    expect([first, second, projectCacheTtl(43200)]).toEqual([3600, 86400, 43200]);
  });
  it("expires old results after shortening lifetime without expiring catalog entries", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    withProjectCachePolicy(3600, () => {
      expect(
        projectCacheEntryCurrent(
          "kr:v2:p:c:seed:Poland:pl:related:100:0",
          { fetchedAt: "2026-10-16T10:00:00Z" },
          now,
        ),
      ).toBe(false);
      expect(
        projectCacheEntryCurrent("km:v1:p:c:PL:0:hash", { fetchedAt: "2026-10-16T11:30:00Z" }, now),
      ).toBe(true);
      expect(projectCacheEntryCurrent("ai-catalog:v1:p:c", {}, now)).toBe(true);
      expect(projectCacheEntryCurrent("kr:v2:p:c", {}, now)).toBe(true);
    });
  });
});

it("keeps per-project TTL branches independent from the module's stored expiry", async () => {
  const { projectCacheFreshness, unpackProjectCache } = await import("./project-cache-policy");
  const now = new Date("2026-10-16T12:00:00Z");
  expect(projectCacheFreshness(now).OR).toContainEqual({
    project: { lookupCacheTtlSeconds: null },
    fetchedAt: { gt: new Date("2026-10-16T00:00:00Z") },
  });
  expect(projectCacheFreshness(now).OR).toContainEqual({
    project: { lookupCacheTtlSeconds: 3600 },
    fetchedAt: { gt: new Date("2026-10-16T11:00:00Z") },
  });
  expect(
    unpackProjectCache({
      data: { fetchedAt: "2026-10-16T10:00:00Z" },
    }).storedAt,
  ).toBe(Date.parse("2026-10-16T10:00:00Z"));
});
