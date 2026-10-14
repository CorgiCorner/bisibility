import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";
import type { MeasurementScope } from "@/lib/rank-measurements/types";
import { hostOrganicReportPolicy, RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { vi } from "vitest";
import type { Check, Keyword } from "./overview-trend";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    project: { findUnique: vi.fn() },
    apiKey: { findFirst: vi.fn() },
    keyword: { count: vi.fn(), findMany: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    projectDefaults: { findUnique: vi.fn() },
    providerConnection: { findMany: vi.fn() },
    rankCheck: { count: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    tag: { findMany: vi.fn() },
  },
  metadata: vi.fn(),
  ledger: vi.fn(),
  requireReadableProject: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/google-client", () => ({ isGoogleOAuthConfigured: () => true }));
vi.mock("./rank-check-run-accounting", async (original) => ({
  ...(await original<typeof import("./rank-check-run-accounting")>()),
  rankCheckLedgerActuals: mocks.ledger,
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: (at: Date, days: number) => reportOptions(at, days),
}));

export const now = new Date("2026-06-28T12:00:00.000Z");
export const project = {
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "user_1",
  publicId: "prj_1",
  writeMode: "active",
};
export const activeMarketScope = {
  archivedAt: null,
  locationRef: { projectMarkets: { some: { projectId: "project_1", status: "active" } } },
};
const scopes = new Map<string, MeasurementScope>();
let nextCheck = 0;

function reportOptions(at: Date, days = 28): RankTrackerReportOptions {
  return {
    asOf: at,
    context: { actor: { id: "user_1" }, transport: "session" },
    limits: RANK_REPORT_HOST_LIMITS,
    policyAt: (time) => hostOrganicReportPolicy(time, days),
    loadMetadata: mocks.metadata,
  };
}

export function rankCheck(overrides: Partial<Check> = {}) {
  const at = overrides.checkedAt ?? new Date("2026-06-28T10:00:00.000Z");
  const position = overrides.position === undefined ? 10 : overrides.position;
  const id = overrides.id ?? `check-${++nextCheck}`;
  const recorded = recordedFixture(position, {
    id,
    observedAt: at,
    recordedAt: at,
    execution: overrides.status === "failed" ? "failed" : "completed",
  });
  return {
    ...recorded,
    createdAt: at,
    updatedAt: at,
    publicId: id,
    rankingUrl: "/",
    ...overrides,
    observationRun: position === 101 ? null : recorded.observationRun,
  };
}

export function keyword(overrides: Partial<Keyword> & { locationId?: string } = {}) {
  const publicId = overrides.publicId ?? "kw_1";
  // This fixture declares a current definition independently of retained checks.
  const locationRef = overrides.locationRef ?? {
    displayName: "United States",
    languageCode: "en",
    languageLabel: "English",
  };
  const scope = {
    ...fixtureScope,
    projectId: project.id,
    targetId: publicId,
    location: locationRef.displayName,
    language: locationRef.languageCode ?? "en",
    device: overrides.device ?? "desktop",
  };
  scopes.set(publicId, scope);
  const checks = (overrides.rankChecks ?? []).map((check) => ({
    ...check,
    observationRun: check.observationRun
      ? {
          ...check.observationRun,
          projectId: project.id,
          configuredScope: scope,
          effectiveScope: scope,
        }
      : null,
  }));
  return {
    _count: { rankChecks: checks.length },
    createdAt: new Date("2026-06-01T00:00:00Z"),
    device: "desktop",
    id: overrides.id ?? publicId,
    projectId: project.id,
    locationId: "loc_us_en",
    publicId,
    schedule: null,
    text: "keyword",
    ...overrides,
    locationRef,
    rankChecks: checks,
  };
}

export function resetOverviewMocks() {
  vi.resetAllMocks();
  scopes.clear();
  nextCheck = 0;
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
  mocks.prisma.project.findUnique.mockResolvedValue({ id: project.id, publicId: project.publicId });
  mocks.metadata.mockImplementation(
    async (_tx, _project, targets: { publicId: string }[], at: Date) =>
      new Map(
        targets.map(({ publicId }) => [
          publicId,
          {
            expectedScope: scopes.get(publicId) ?? null,
            volume: 1,
            freshForMs: 30 * 86_400_000,
            baselineWindow: {
              mode: "before",
              before: new Date(at.getTime() - 28 * 86_400_000),
              notBefore: new Date(at.getTime() - 29 * 86_400_000),
            },
          },
        ]),
      ),
  );
  mocks.ledger.mockResolvedValue(new Map());
  mocks.requireReadableProject.mockResolvedValue({ project, actor: { id: "user_1" } });
  mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
  mocks.prisma.keyword.count.mockResolvedValue(0);
  mocks.prisma.keyword.findMany.mockResolvedValue([]);
  mocks.prisma.projectMarket.findMany.mockResolvedValue([]);
  mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
  mocks.prisma.apiKey.findFirst.mockResolvedValue(null);
  mocks.prisma.rankCheck.count.mockResolvedValue(0);
  mocks.prisma.rankCheck.findMany.mockResolvedValue([]);
  mocks.prisma.rankCheck.findFirst.mockResolvedValue(null);
  mocks.prisma.tag.findMany.mockResolvedValue([]);
}

export function getOverviewMocks() {
  return mocks;
}
