import { AuthorizationError } from "@/lib/auth/authorize";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { createReportCursorCodec } from "@/lib/rank-reports/cursor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LocalResultSelectionError } from "./errors";
import { readMonitorRunHistory } from "./history";

const scope = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/local-monitoring-store/access", () => ({ localProjectScope: scope }));
const projectId = "prj_abcdefghijklmnopqrstuvwx",
  monitorId = "lmn_abcdefghijklmnopqrstuvwx",
  now = new Date("2026-10-12T12:00:00.000Z"),
  codec = createReportCursorCodec("synthetic-history-cursor-key-123456789");
describe("signed bounded immutable occurrence history", () => {
  beforeEach(() => vi.clearAllMocks());
  function fixture() {
    const rows = Array.from({ length: 23 }, (_, index) => ({
      id: `occurrence-${index}`,
      runId: `run-${index}`,
      bodyHash: `body-${index}`,
      definitionRevisionId: "revision-1",
      createdAt: new Date(now.getTime() - index * 1000),
    }));
    const tx = {
      localMonitor: { findFirst: vi.fn(async () => ({ id: "monitor" })) },
      localMonitorOccurrence: {
        count: vi.fn(async () => rows.length),
        findMany: vi.fn(async () => rows),
      },
      localMeasurementRun: {
        findMany: vi.fn(async () =>
          rows.map((row) => ({
            id: row.runId,
            publicId: `lmr_${row.id.padEnd(24, "a").replaceAll("-", "a")}`,
          })),
        ),
      },
      localMonitorRevision: { findMany: vi.fn(async () => [{ id: "revision-1", revision: 1 }]) },
    };
    rows.forEach((row) => {
      Object.assign(row, { mode: "manual" });
    });
    scope.mockResolvedValue({ project: { id: "project" } });
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as LocalDatabase;
    return { rows, tx, options: { db, codec, now } };
  }
  it("pages full source membership20+3 with a stable signed asOf and no repeated rows", async () => {
    const f = fixture();
    const first = await readMonitorRunHistory({ projectId, monitorId }, { actor: null }, f.options);
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toBeTruthy();
    const last = await readMonitorRunHistory(
      { projectId, monitorId, cursor: first.nextCursor },
      { actor: null },
      f.options,
    );
    expect(last.items).toHaveLength(3);
    expect(last.nextCursor).toBeNull();
    expect(last.asOf).toBe(first.asOf);
    expect(new Set([...first.items, ...last.items].map((row) => row.runId)).size).toBe(23);
  });
  it("refuses foreign monitor, cursor tampering and changed source membership", async () => {
    const f = fixture();
    const first = await readMonitorRunHistory({ projectId, monitorId }, { actor: null }, f.options);
    expect(first.nextCursor).toBeTruthy();
    await expect(
      readMonitorRunHistory(
        { projectId, monitorId: "lmn_bcdefghijklmnopqrstuvwxyza", cursor: first.nextCursor },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
    await expect(
      readMonitorRunHistory(
        { projectId, monitorId, cursor: first.nextCursor + "x" },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
    f.rows[0].bodyHash = "changed";
    await expect(
      readMonitorRunHistory(
        { projectId, monitorId, cursor: first.nextCursor },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
  });
  it("capacity and fresh deactivation denial prevent reading or paging partial membership", async () => {
    const f = fixture();
    f.tx.localMonitorOccurrence.count.mockResolvedValue(1001);
    await expect(
      readMonitorRunHistory({ projectId, monitorId }, { actor: null }, f.options),
    ).rejects.toThrow();
    expect(f.tx.localMonitorOccurrence.findMany).not.toHaveBeenCalled();
    scope.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(
      readMonitorRunHistory({ projectId, monitorId }, { actor: null }, f.options),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("binds an explicit historical asOf to both SQL membership and subsequent cursors", async () => {
    const f = fixture(),
      asOf = "2026-10-11T12:00:00.000Z";
    const first = await readMonitorRunHistory(
      { projectId, monitorId, asOf },
      { actor: null },
      f.options,
    );
    expect(first.asOf).toBe(asOf);
    expect(f.tx.localMonitorOccurrence.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdAt: { lte: new Date(asOf) } }),
      }),
    );
    await expect(
      readMonitorRunHistory(
        { projectId, monitorId, asOf: now.toISOString(), cursor: first.nextCursor },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
  });
  it("applies inclusive history bounds to the complete SQL source and binds paging to that window", async () => {
    const f = fixture(),
      from = "2026-10-12T11:59:40.000Z",
      to = now.toISOString();
    const first = await readMonitorRunHistory(
      { projectId, monitorId, from, to },
      { actor: null },
      f.options,
    );
    expect(first).toMatchObject({
      window: { from, to, timeBasis: "occurrence_created_at" },
      eligibleTotal: 23,
    });
    expect(f.tx.localMonitorOccurrence.count).toHaveBeenCalledWith({
      where: {
        projectId: "project",
        monitorId: "monitor",
        createdAt: { gte: new Date(from), lte: now },
      },
    });
    const last = await readMonitorRunHistory(
      { projectId, monitorId, from, to, cursor: first.nextCursor },
      { actor: null },
      f.options,
    );
    expect(last.items).toHaveLength(3);
    await expect(
      readMonitorRunHistory(
        { projectId, monitorId, from: "2026-10-12T11:59:00.000Z", to, cursor: first.nextCursor },
        { actor: null },
        f.options,
      ),
    ).rejects.toThrow();
  });
  it("rejects a later end on continuation against the signed asOf with a typed input error", async () => {
    const f = fixture();
    const first = await readMonitorRunHistory({ projectId, monitorId }, { actor: null }, f.options);
    vi.mocked(f.options.db.$transaction).mockClear();
    const later = new Date(now.getTime() + 1000);
    await expect(
      readMonitorRunHistory(
        { projectId, monitorId, cursor: first.nextCursor, to: later.toISOString() },
        { actor: null },
        { ...f.options, now: later },
      ),
    ).rejects.toBeInstanceOf(LocalResultSelectionError);
    expect(f.options.db.$transaction).not.toHaveBeenCalled();
  });
  it.each([
    { from: "2026-10-13T00:00:00.000Z" },
    { to: "2026-10-13T00:00:00.000Z" },
    { from: "2026-10-12T11:00:00.000Z", to: "2026-10-12T10:00:00.000Z" },
  ])("rejects invalid history interval before any transaction: %j", async (window) => {
    const f = fixture();
    await expect(
      readMonitorRunHistory({ projectId, monitorId, ...window }, { actor: null }, f.options),
    ).rejects.toThrow();
    expect(f.options.db.$transaction).not.toHaveBeenCalled();
  });
});
