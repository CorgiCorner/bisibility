import { AuthorizationError } from "@/lib/auth/authorize";
import { RankReportCapacityError } from "@/lib/rank-reports/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "./DashboardPage";

vi.mock("@/components/dashboard-competitors/DashboardComparisonSurface", () => ({
  DashboardComparisonSurface: () => null,
}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  personal: vi.fn(),
  overview: vi.fn(),
  health: vi.fn(),
  competitors: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/audit", () => ({ writeAuditFailure: vi.fn() }));
vi.mock("@/lib/queries/_auth", () => ({
  resolveProjectAccess: async () => ({ isSample: false, publicId: "prj_abcdefghijklmnopqrstuvwx" }),
  requireReadableProject: mocks.access,
}));
vi.mock("@/lib/queries/dashboard-personal-context", () => ({
  loadDashboardPersonalContext: mocks.personal,
}));
vi.mock("@/lib/queries/overview", () => ({
  getOverview: mocks.overview,
  parseOverviewFilters: () => ({}),
}));
vi.mock("@/lib/queries/check-health", () => ({ getCheckHealth: mocks.health }));
vi.mock("@/lib/queries/overview-competitors", () => ({
  getOverviewCompetitors: mocks.competitors,
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: async () => ({}) }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: async () => ({ locale: "en", timeZone: "UTC" }),
}));
vi.mock("@/components/overview/OverviewPersonalDashboard", () => ({
  OverviewPersonalDashboard: () => null,
}));
vi.mock("@/components/overview/OverviewDashboardView", () => ({
  OverviewDashboardView: () => null,
}));
vi.mock("@/components/dashboard-layout/DashboardScopeUnavailable", () => ({
  DashboardScopeUnavailable: () => null,
}));

async function readData() {
  const page = await DashboardPage({
    params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
  });
  const data = page.props.children.props.children.props.children;
  return data.type(data.props);
}
const personal = () => ({
  invalidPreset: false,
  access: {},
  scopeKey: "personal-scope",
  composition: {
    layout: { preset: "general" },
    projections: { all: ["coverage_summary", "competitor_comparison"] },
  },
  preference: {},
  local: null,
});
describe("dashboard optional read isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      actor: { id: "viewer", memberships: [{ projectId: "p", role: "viewer" }] },
      project: { id: "p" },
    });
    mocks.personal.mockResolvedValue(personal());
    mocks.overview.mockResolvedValue({
      state: "populated",
      isEmpty: false,
      retained: "organic-data",
    });
    mocks.health.mockResolvedValue({ budget: { exhausted: false }, failed24h: { count: 0 } });
    mocks.competitors.mockResolvedValue({ retained: "competitor-data" });
  });
  it("keeps organic data and exposes an error for a failed optional competitor read", async () => {
    mocks.competitors.mockRejectedValue(new Error("private DB detail"));
    const result = await readData();
    expect(result.props.overview.retained).toBe("organic-data");
    expect(result.props.competitors).toBeNull();
    expect(result.props.failedProjections).toContain("competitor_comparison");
    expect(JSON.stringify(result.props)).not.toContain("private DB detail");
  });
  it("retains unknown health rather than constructing healthy zero counts", async () => {
    mocks.health.mockRejectedValue(new Error("unavailable"));
    const result = await readData();
    expect(result.props.checkHealth).toBeNull();
    expect(result.props.failedProjections).toContain("connection_details");
    expect(result.props.overview.retained).toBe("organic-data");
  });
  it("does not start optional reads when fresh project authorization fails", async () => {
    mocks.access.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(readData()).rejects.toBeInstanceOf(AuthorizationError);
    expect(mocks.personal).not.toHaveBeenCalled();
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.health).not.toHaveBeenCalled();
    expect(mocks.competitors).not.toHaveBeenCalled();
  });
  it("propagates authorization revoked during an optional read", async () => {
    mocks.competitors.mockRejectedValue(new AuthorizationError("forbidden"));
    await expect(readData()).rejects.toBeInstanceOf(AuthorizationError);
  });
  it("keeps an explicit Local capacity failure scoped unavailable without a General retry", async () => {
    mocks.personal.mockResolvedValue({
      ...personal(),
      local: { state: "ready", selection: { locationId: "loc" } },
    });
    mocks.overview.mockRejectedValue(new RankReportCapacityError());
    const result = await readData();
    expect(result.props.personal.local).toMatchObject({ state: "capacity", selection: null });
    expect(mocks.overview).toHaveBeenCalledOnce();
    expect(mocks.overview.mock.calls[0][1].localSelection).toEqual({ locationId: "loc" });
  });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue({ state: "populated" });
  mocks.competitors.mockResolvedValue(null);
});
it("renders Dedicated Competitors only from its bound comparison without invoking General or unfiltered comparison reads", async () => {
  mocks.access.mockResolvedValue({ actor: { id: "viewer" }, project: { id: "p" } });
  mocks.personal.mockResolvedValue({
    ...personal(),
    composition: {
      layout: { preset: "competitors" },
      projections: { all: ["coverage_summary", "competitor_comparison"] },
    },
    comparison: { state: "ready", report: { selectionRevisionId: "view:3" } },
  });
  mocks.health.mockResolvedValue(null);
  const result = await readData();
  expect(result.props.personal.comparison.report.selectionRevisionId).toBe("view:3");
  expect(mocks.overview).not.toHaveBeenCalled();
  expect(mocks.competitors).not.toHaveBeenCalled();
});
it("leaves an unresolved explicit comparison scoped unavailable without any aggregate read", async () => {
  mocks.access.mockResolvedValue({ actor: { id: "viewer" }, project: { id: "p" } });
  mocks.personal.mockResolvedValue({
    ...personal(),
    composition: { layout: { preset: "competitors" }, projections: { all: ["scope_context"] } },
    comparison: { state: "unavailable", report: null },
  });
  const result = await readData();
  expect(result.props.personal.comparison.state).toBe("unavailable");
  expect(mocks.overview).not.toHaveBeenCalled();
  expect(mocks.competitors).not.toHaveBeenCalled();
});
