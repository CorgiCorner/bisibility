import { AuthorizationError } from "@/lib/auth/authorize";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDashboardPersonalContext } from "./dashboard-personal-context";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  preference: vi.fn(),
  count: vi.fn(),
  local: vi.fn(),
  comparison: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.access }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { competitor: { count: mocks.count } } }));
vi.mock("@/lib/project-surface-preferences/dashboard-store", () => ({
  readDashboardPreferenceFor: mocks.preference,
}));
vi.mock("@/lib/dashboard-local/context", () => ({ loadDashboardLocalContext: mocks.local }));
vi.mock("@/lib/dashboard-competitors/context", () => ({
  loadDashboardComparisonContext: mocks.comparison,
}));
const preference = () => ({
  projectId: "prj_abcdefghijklmnopqrstuvwx",
  revision: 7,
  defaultPreset: "general",
  presentation: { schemaVersion: 1, layouts: {} },
});
describe("dashboard personal scope failure boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      actor: { id: "viewer" },
      project: { id: "p", publicId: preference().projectId },
    });
    mocks.preference.mockResolvedValue(preference());
    mocks.count.mockResolvedValue(1);
  });
  it("retains a readable organic scope when the optional competitor count fails, without claiming zero competitors", async () => {
    mocks.count.mockRejectedValue(new Error("query failed"));
    const value = await loadDashboardPersonalContext(preference().projectId, undefined);
    expect(value.invalidPreset).toBe(false);
    expect(value.composition.projections.all).toContain("coverage_summary");
    expect(
      value.composition.layout.widgets.find((item) => item.id === "competitor_comparison")?.visible,
    ).toBe(true);
    expect(mocks.access).toHaveBeenCalledTimes(2);
  });
  it("does not reinterpret an unavailable persisted scope as General data", async () => {
    mocks.preference.mockResolvedValue({
      ...preference(),
      defaultPreset: "local",
      notice: { kind: "unsupported_version", scopeUnavailable: true },
    });
    const value = await loadDashboardPersonalContext(preference().projectId, undefined);
    expect(value.invalidPreset).toBe(true);
    expect(value.composition.layout.preset).toBe("local");
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("stops before preferences/counts when authorization fails", async () => {
    mocks.access.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(
      loadDashboardPersonalContext(preference().projectId, undefined),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.preference).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    actor: { id: "viewer" },
    project: { id: "p", publicId: preference().projectId },
  });
  mocks.preference.mockResolvedValue(preference());
  mocks.count.mockResolvedValue(1);
});
it("binds Dedicated Competitors to an actual authorized revision instead of a null scope", async () => {
  const selection = { viewId: "viw_abcdefghijklmnopqrstuvwx", revision: 3 };
  mocks.comparison.mockResolvedValue({
    state: "ready",
    selection,
    choices: [],
    report: { selectionRevisionId: `${selection.viewId}:3` },
  });
  const filters = {
    device: "mobile" as const,
    marketIds: ["loc"],
    range: "7d" as const,
    tag: "core",
  };
  const at = new Date("2026-10-12T12:00:00Z");
  const result = await loadDashboardPersonalContext(preference().projectId, "competitors", {
    comparison: JSON.stringify(selection),
    filters,
    scopeParams: { device: "mobile" },
    asOf: at,
  });
  expect(result.access.competitorScope).toEqual({
    projectId: preference().projectId,
    selectionRevisionId: `${selection.viewId}:3`,
  });
  expect(result.composition.projections.all).toContain("coverage_summary");
  expect(mocks.comparison.mock.calls[0][2]).toMatchObject({
    explicit: JSON.stringify(selection),
    filters,
    scopeParams: { device: "mobile" },
    asOf: at,
  });
});
it("does not initialize a comparison or change General merely because one remembered reference exists", async () => {
  mocks.preference.mockResolvedValue({
    ...preference(),
    presentation: {
      schemaVersion: 1,
      layouts: {},
      competitorSelection: { viewId: "viw_abcdefghijklmnopqrstuvwx", revision: 3 },
    },
  });
  const result = await loadDashboardPersonalContext(preference().projectId, undefined);
  expect(result.composition.layout.preset).toBe("general");
  expect(mocks.comparison).not.toHaveBeenCalled();
});
it("keeps a failed Dedicated comparison unavailable and rechecks auth without loading General", async () => {
  mocks.comparison.mockRejectedValue(new Error("DB unavailable"));
  const value = await loadDashboardPersonalContext(preference().projectId, "competitors");
  expect(value.comparison?.state).toBe("unavailable");
  expect(value.access.competitorScope).toBeNull();
  expect(value.composition.projections.all).not.toContain("coverage_summary");
  expect(mocks.access).toHaveBeenCalledTimes(2);
});
