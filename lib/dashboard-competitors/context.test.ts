import { AuthorizationError } from "@/lib/auth/authorize";
import { normalizeOverviewFilters } from "@/lib/queries/overview-filters";
import type { ViewDatabase } from "@/lib/saved-views/access";
import { beforeEach, expect, it, vi } from "vitest";
import { loadDashboardComparisonContext } from "./context";
import {
  comparisonAsOf,
  comparisonContext,
  comparisonProject,
  comparisonSelection,
  comparisonView,
} from "./fixture";

const mocks = vi.hoisted(() => ({ scope: vi.fn(), options: vi.fn(), read: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/measurement-definitions/access", () => ({ definitionProjectScope: mocks.scope }));
vi.mock("@/lib/queries/rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: mocks.options,
}));
vi.mock("./read", () => ({ readDashboardComparison: mocks.read }));
const tx = {
  $executeRaw: vi.fn(),
  project: { findUniqueOrThrow: vi.fn() },
  projectDefaults: { findUnique: vi.fn() },
  savedView: { findMany: vi.fn(), findFirst: vi.fn() },
  projectMarket: { findMany: vi.fn() },
};
const transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>, _options?: unknown) =>
  run(tx),
);
const db = { $transaction: transaction } as unknown as ViewDatabase;
const input = () => ({
  explicit: JSON.stringify(comparisonSelection),
  filters: normalizeOverviewFilters({ range: "90d" }),
  scopeParams: {},
  asOf: comparisonAsOf,
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.mockResolvedValue(comparisonProject);
  mocks.options.mockResolvedValue({ context: { actor: { id: "viewer" }, transport: "session" } });
  tx.project.findUniqueOrThrow.mockResolvedValue(comparisonProject);
  tx.projectDefaults.findUnique.mockResolvedValue({ enabledExperimentalModules: ["competitors"] });
  tx.savedView.findMany.mockResolvedValue([comparisonView()]);
  tx.savedView.findFirst.mockResolvedValue(comparisonView());
  tx.projectMarket.findMany.mockResolvedValue([
    { locationId: "loc", location: { displayName: "Krakow", languageLabel: "Polish" } },
  ]);
  mocks.read.mockResolvedValue({ selectionRevisionId: "verified" });
});
it("uses fresh read authority and a repeatable read-only transaction before any view/report read", async () => {
  const result = await loadDashboardComparisonContext(
    comparisonProject.publicId,
    comparisonContext,
    input(),
    db,
  );
  expect(result.state).toBe("ready");
  expect(mocks.scope).toHaveBeenCalledWith(
    tx,
    { actor: { id: "viewer" } },
    comparisonProject.publicId,
    "read",
    "saved_view",
  );
  expect(mocks.options).toHaveBeenCalledWith(comparisonAsOf, 90);
  expect(transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
  expect(tx.$executeRaw).toHaveBeenCalledOnce();
  expect(mocks.read.mock.calls[0][5]).toEqual({
    range: "90d",
    device: "mobile",
    marketIds: ["loc"],
    tag: null,
  });
});
it("revocation fails before optional reads, and cannot become a missing-scope fallback", async () => {
  mocks.scope.mockRejectedValue(new AuthorizationError("forbidden"));
  await expect(
    loadDashboardComparisonContext(comparisonProject.publicId, comparisonContext, input(), db),
  ).rejects.toBeInstanceOf(AuthorizationError);
  expect(tx.savedView.findMany).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it("does not accept a different session actor or a project credential as personal authority", async () => {
  mocks.options.mockResolvedValue({ context: { actor: { id: "other" }, transport: "session" } });
  await expect(
    loadDashboardComparisonContext(comparisonProject.publicId, comparisonContext, input(), db),
  ).rejects.toBeInstanceOf(AuthorizationError);
  expect(transaction).not.toHaveBeenCalled();
});
it.each(["missing", "stale", "foreign", "conflict", "disabled"])(
  "retains explicit %s unavailability without a report read",
  async (kind) => {
    const args = input();
    if (kind === "missing") args.explicit = "";
    if (kind === "stale")
      tx.savedView.findFirst.mockResolvedValue({ ...comparisonView(), revision: 4 });
    if (kind === "foreign")
      tx.savedView.findFirst.mockResolvedValue({ ...comparisonView(), projectId: "other" });
    if (kind === "conflict") Object.assign(args.scopeParams, { device: "all" });
    if (kind === "disabled")
      tx.projectDefaults.findUnique.mockResolvedValue({ enabledExperimentalModules: [] });
    const result = await loadDashboardComparisonContext(
      comparisonProject.publicId,
      comparisonContext,
      args,
      db,
    );
    expect(result.state).toBe(kind === "missing" ? "missing" : "unavailable");
    expect(result.report).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  },
);
