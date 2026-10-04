import { beforeEach, describe, expect, it, vi } from "vitest";
import { claimSnapshotExtension, finishSnapshotExtension } from "./snapshot-extension-store";

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  rankCheck: { findFirst: vi.fn(), updateMany: vi.fn() },
  providerConnection: { findFirst: vi.fn() },
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
}));
const audit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/audit", () => ({ writeAudit: audit }));
vi.mock("server-only", () => ({}));
const input = {
  actorId: "actor-1",
  projectId: "project-1",
  checkId: "check_original",
  nextStart: 20,
};
const context = {
  version: 1,
  capturedAt: new Date().toISOString(),
  keyword: "sample",
  domain: "example.com",
  device: "desktop",
  connectionId: "connection-1",
  nextStart: 20,
  ended: false,
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: null,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};
let stored: Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  stored = { organic_results: [], snapshotContinuation: context };
  db.$transaction.mockImplementation((fn) => fn(db));
  db.project.findUnique.mockResolvedValue({ id: input.projectId, writeMode: "active" });
  db.providerConnection.findFirst.mockResolvedValue({ id: "connection-1" });
  db.rankCheck.findFirst.mockImplementation(async () => ({
    id: "internal-check",
    publicId: input.checkId,
    keywordId: "keyword-1",
    keyword: { publicId: "kw_example" },
    provider: "serpapi",
    raw: structuredClone(stored),
  }));
  db.rankCheck.updateMany.mockImplementation(async ({ where, data }) => {
    if (
      !where.raw.path &&
      where.raw.equals &&
      JSON.stringify(where.raw.equals) !== JSON.stringify(stored)
    )
      return { count: 0 };
    if (
      where.raw.path &&
      (stored.snapshotExtension as { requestId: string })?.requestId !== where.raw.equals
    )
      return { count: 0 };
    stored = structuredClone(data.raw);
    return { count: 1 };
  });
});

describe("snapshot extension claim", () => {
  it("admits only one concurrent request for the same page", async () => {
    const results = await Promise.all([
      claimSnapshotExtension(input),
      claimSnapshotExtension(input),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, reason: "running" }]);
    expect(audit).toHaveBeenCalledTimes(1);
  });
  it("binds both the snapshot and original provider connection to the authorized project", async () => {
    await claimSnapshotExtension(input);
    expect(db.rankCheck.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          publicId: input.checkId,
          keyword: { projectId: input.projectId },
          status: "completed",
        },
      }),
    );
    expect(db.providerConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: context.connectionId,
          projectId: input.projectId,
          credentialSource: "own",
          provider: "serpapi",
        }),
      }),
    );
  });
  it("rejects a stale page confirmation before claiming or calling a provider", async () => {
    expect(await claimSnapshotExtension({ ...input, nextStart: 30 })).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(db.rankCheck.updateMany).not.toHaveBeenCalled();
  });
  it("rejects expired and disconnected snapshots", async () => {
    stored.snapshotContinuation = {
      ...context,
      capturedAt: new Date(Date.now() - 900_000).toISOString(),
    };
    expect(await claimSnapshotExtension(input)).toEqual({ ok: false, reason: "expired" });
    stored.snapshotContinuation = context;
    db.providerConnection.findFirst.mockResolvedValue(null);
    expect(await claimSnapshotExtension(input)).toEqual({ ok: false, reason: "disconnected" });
    expect(db.rankCheck.updateMany).not.toHaveBeenCalled();
  });
  it("checks project write mode under the same lock as deletion", async () => {
    db.project.findUnique.mockResolvedValue({ id: input.projectId, writeMode: "migration_hold" });
    await expect(claimSnapshotExtension(input)).rejects.toThrow("read-only");
    expect(db.$queryRaw).toHaveBeenCalled();
    expect(db.rankCheck.updateMany).not.toHaveBeenCalled();
  });
  it("appends only extension data without replacing rank, original rows or dates", async () => {
    const claim = await claimSnapshotExtension(input);
    if (!claim.ok) throw new Error("Expected claim");
    const page = { start: 20, fetchedAt: new Date().toISOString(), rows: [], skippedDuplicates: 1 };
    await finishSnapshotExtension({
      ...input,
      claim,
      state: { ...claim.state, state: "idle", nextStart: 30, pages: [page] },
    });
    const update = db.rankCheck.updateMany.mock.calls.at(-1)?.[0];
    expect(Object.keys(update.data)).toEqual(["raw"]);
    expect(update.where.raw).toEqual({
      path: ["snapshotExtension", "requestId"],
      equals: claim.requestId,
    });
    expect(stored.organic_results).toEqual([]);
    expect(stored.snapshotContinuation).toEqual(context);
    expect(stored.snapshotExtension).toMatchObject({ nextStart: 30, pages: [page] });
  });
  it("cannot resurrect raw data after purge or deletion", async () => {
    const claim = await claimSnapshotExtension(input);
    if (!claim.ok) throw new Error("Expected claim");
    db.rankCheck.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      finishSnapshotExtension({ ...input, claim, state: { ...claim.state, state: "idle" } }),
    ).rejects.toThrow("changed");
  });
});
