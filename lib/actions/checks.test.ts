import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadCheckRuns } from "./checks";

const mocks = vi.hoisted(() => ({
  actor: { id: "user_1" },
  getActionActor: vi.fn(),
  getCheckRunsView: vi.fn(),
  requireProjectScope: vi.fn(),
}));

vi.mock("@/lib/queries/check-runs", () => ({
  getCheckRunsView: mocks.getCheckRunsView,
}));
vi.mock("./_shared", () => ({
  getActionActor: mocks.getActionActor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: mocks.requireProjectScope,
}));

describe("check actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    vi.clearAllMocks();
    mocks.getActionActor.mockResolvedValue(mocks.actor);
    mocks.requireProjectScope.mockResolvedValue({ id: "project_1" });
    mocks.getCheckRunsView.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("authorizes reads and stamps the range window on the server", async () => {
    await loadCheckRuns({
      filter: "fallback",
      projectId: "prj_1",
      provider: "serpapi",
      range: "30d",
      trigger: "manual",
    });

    expect(mocks.requireProjectScope).toHaveBeenCalledWith(mocks.actor, "read", "prj_1", {
      type: "project",
    });
    expect(mocks.getCheckRunsView).toHaveBeenCalledWith("prj_1", {
      cursor: undefined,
      limit: 50,
      now: new Date("2026-07-24T12:00:00.000Z"),
      provider: "serpapi",
      range: "30d",
      status: "fallback",
      trigger: "manual",
    });
  });

  it("uses an explicit historical end date for the selected range", async () => {
    await loadCheckRuns({
      endAt: "2026-07-20T21:59:59.999Z",
      filter: "all",
      projectId: "prj_1",
      provider: "all",
      range: "7d",
      trigger: "all",
    });

    expect(mocks.getCheckRunsView).toHaveBeenCalledWith(
      "prj_1",
      expect.objectContaining({
        now: new Date("2026-07-20T21:59:59.999Z"),
      }),
    );
  });
});
