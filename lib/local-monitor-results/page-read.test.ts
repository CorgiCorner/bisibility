import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalResultsPage } from "./page-read";

const mocks = vi.hoisted(() => ({ history: vi.fn(), result: vi.fn() }));
vi.mock("./history", () => ({ readMonitorRunHistory: mocks.history }));
vi.mock("./read", () => ({ readMonitorRunResult: mocks.result }));
const projectId = "prj_abcdefghijklmnopqrstuvwx",
  monitorId = "lmn_abcdefghijklmnopqrstuvwx",
  runId = "lmr_abcdefghijklmnopqrstuvwx",
  at = "2026-10-12T12:00:00.000Z";
describe("saved run URL scope precedence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.history.mockResolvedValue({ items: [{ runId }], asOf: at });
    mocks.result.mockResolvedValue({ runId, asOf: at });
  });
  it("uses latest saved membership only when no run was named", async () => {
    const page = await readLocalResultsPage(projectId, monitorId, {}, { actor: null });
    expect(page.resultUnavailable).toBe(false);
    expect(mocks.result).toHaveBeenCalledWith(
      { projectId, monitorId, runId, asOf: at },
      { actor: null },
    );
  });
  it.each([
    { run: "lmr_bcdefghijklmnopqrstuvwxyza" },
    { run: "" },
    { run: [runId] },
    { run: runId, asOf: [at] },
  ])("explicit foreign or invalid run never falls back: %j", async (query) => {
    mocks.result.mockRejectedValue(new Error("Foreign saved run"));
    const page = await readLocalResultsPage(projectId, monitorId, query, { actor: null });
    expect(page).toMatchObject({ runResult: null, resultUnavailable: true });
    expect(
      mocks.result.mock.calls.every(([input]) => input.runId !== runId || query.run === runId),
    ).toBe(true);
  });
  it("keeps explicit historical asOf and controlled unavailable evidence", async () => {
    mocks.result.mockRejectedValue(new Error("Unavailable at historical time"));
    const old = "2026-10-11T12:00:00.000Z";
    const page = await readLocalResultsPage(
      projectId,
      monitorId,
      { run: runId, asOf: old },
      { actor: null },
    );
    expect(page.resultUnavailable).toBe(true);
    expect(mocks.history).toHaveBeenCalledWith(
      { projectId, monitorId, asOf: old },
      { actor: null },
    );
    expect(mocks.result).toHaveBeenCalledWith(
      { projectId, monitorId, runId, asOf: old },
      { actor: null },
    );
  });
  it("preserves canonical URL history bounds without widening or launching a scan", async () => {
    const from = "2026-10-01T00:00:00.000Z";
    await readLocalResultsPage(projectId, monitorId, { from, to: at, asOf: at }, { actor: null });
    expect(mocks.history).toHaveBeenCalledWith(
      { projectId, monitorId, from, to: at, asOf: at },
      { actor: null },
    );
    mocks.history.mockClear();
    const invalid = await readLocalResultsPage(
      projectId,
      monitorId,
      { from: [from] },
      { actor: null },
    );
    expect(invalid.resultUnavailable).toBe(true);
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
