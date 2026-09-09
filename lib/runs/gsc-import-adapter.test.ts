import { describe, expect, it } from "vitest";
import { adaptGscImport, adaptGscImports, type GscImportInput } from "./gsc-import-adapter";

const createdAt = new Date("2026-09-01T08:00:00.000Z");
const lastSyncStartedAt = new Date("2026-09-02T08:00:00.000Z");
const syncStartedAt = new Date("2026-09-02T08:01:00.000Z");
const lastSyncFinishedAt = new Date("2026-09-02T08:02:00.000Z");
const lastProbeAt = new Date("2026-09-02T08:03:00.000Z");

function importRow(overrides: Partial<GscImportInput> = {}): GscImportInput {
  return {
    createdAt,
    daysDone: 14,
    daysTotal: 365,
    id: "import_1",
    lastProbeAt,
    lastSyncFinishedAt,
    lastSyncStartedAt,
    pausedReason: null,
    projectId: "project_1",
    property: "sc-domain:example.com",
    searchType: "web",
    source: "gsc",
    state: "running",
    syncStartedAt,
    ...overrides,
  };
}

describe("GSC import Runs adapter", () => {
  it.each([
    { searchType: "web", source: "ga4" },
    { searchType: "image", source: "gsc" },
  ])("omits unsupported source and search type rows", (overrides) => {
    expect(adaptGscImport(importRow(overrides))).toBeNull();
  });

  it("keeps one durable record for one stored GSC property import", () => {
    const row = importRow();

    expect(adaptGscImports([row])).toEqual([
      expect.objectContaining({
        id: "import_1",
        projectId: "project_1",
        property: "sc-domain:example.com",
      }),
    ]);
  });

  it("preserves an arbitrary raw state and pause reason", () => {
    const record = adaptGscImport(
      importRow({ pausedReason: "legacy_pause", state: "legacy_in_progress" }),
    );

    expect(record).toMatchObject({
      pausedReason: "legacy_pause",
      state: "legacy_in_progress",
    });
  });

  it("keeps Import created, non-worker start, intent claim, completion, and provider check timestamps", () => {
    const record = adaptGscImport(importRow());

    expect(record?.timestamps).toEqual({
      createdAt,
      lastProbeAt,
      lastSyncFinishedAt,
      lastSyncStartedAt,
      syncStartedAt,
    });
  });

  it("keeps an existing completed import as one unmodified durable record", () => {
    const completed = Object.freeze(
      importRow({ daysDone: 365, pausedReason: null, state: "completed" }),
    );
    const firstRead = adaptGscImports([completed]);
    const reload = adaptGscImports([completed]);

    expect(firstRead).toEqual([
      expect.objectContaining({
        id: completed.id,
        progress: { daysDone: 365, daysTotal: 365 },
        state: "completed",
      }),
    ]);
    expect(reload).toEqual(firstRead);
    expect(completed.state).toBe("completed");
  });
});
