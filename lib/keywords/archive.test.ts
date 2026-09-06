import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { archiveKeyword, restoreKeyword } from "./archive";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { keyword: { updateMany: vi.fn() } } }));

describe("keyword archive state", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps the keyword identity unique across archive and restore", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).toMatch(/^\s*archivedAt\s+DateTime\?$/m);
    expect(schema).toContain("@@unique([projectId, text, locationId, device])");
  });

  it("archives and restores idempotently without moving the archive timestamp", async () => {
    let archivedAt: Date | null = null;
    const updateMany = vi.fn(async ({ data, where }) => {
      const canArchive = where.archivedAt === null && archivedAt === null;
      const canRestore = where.archivedAt?.not === null && archivedAt !== null;
      if (!canArchive && !canRestore) return { count: 0 };
      archivedAt = data.archivedAt;
      return { count: 1 };
    });
    const client = { keyword: { updateMany } };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T06:00:00.000Z"));
    await archiveKeyword("keyword_1", client as never);
    vi.setSystemTime(new Date("2026-09-05T07:00:00.000Z"));
    await archiveKeyword("keyword_1", client as never);

    expect(archivedAt).toEqual(new Date("2026-09-05T06:00:00.000Z"));
    expect(updateMany.mock.results.map(({ value }) => value)).toHaveLength(2);

    await restoreKeyword("keyword_1", client as never);
    await restoreKeyword("keyword_1", client as never);

    expect(archivedAt).toBeNull();
    await expect(updateMany.mock.results[0]?.value).resolves.toEqual({ count: 1 });
    await expect(updateMany.mock.results[1]?.value).resolves.toEqual({ count: 0 });
    await expect(updateMany.mock.results[2]?.value).resolves.toEqual({ count: 1 });
    await expect(updateMany.mock.results[3]?.value).resolves.toEqual({ count: 0 });
  });
});
