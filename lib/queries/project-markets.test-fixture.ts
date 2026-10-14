import { vi } from "vitest";
import {
  legacyAsOf,
  legacyDbCheck,
  legacyKeyword,
  legacyReportOptions,
  legacyScope,
} from "./legacy-dashboard.test-fixture";

const mocks = vi.hoisted(() => ({
  listArchivedProjectMarkets: vi.fn(),
  monthlyTrackingCostCents: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    rankCheck: { count: vi.fn(), findMany: vi.fn() },
    observationItem: { count: vi.fn() },
    keyword: { findMany: vi.fn(), groupBy: vi.fn() },
    location: { findMany: vi.fn() },
    project: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
  },
  requireReadableProject: vi.fn(),
  supportsResearchScope: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cost-estimate/project-estimate", () => ({
  monthlyTrackingCostCents: mocks.monthlyTrackingCostCents,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/markets/registry", () => ({
  listArchivedProjectMarkets: mocks.listArchivedProjectMarkets,
}));
vi.mock("@/lib/serp/research-capability", () => ({
  supportsResearchScope: mocks.supportsResearchScope,
}));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

export const first = legacyKeyword(0, "location_malaga");
export const second = { ...legacyKeyword(1, "location_malaga"), device: "mobile" as const };
const third = legacyKeyword(2, "location_malaga_en");
const archived = legacyKeyword(3, "location_malaga");
export const options = {
  now: legacyAsOf,
  report: legacyReportOptions(legacyAsOf, "project_1", {
    scopes: new Map(
      [first, second, third].map((row) => [
        row.publicId,
        legacyScope(row.publicId, "project_1", row.device),
      ]),
    ),
  }),
};

export const activeMarket = {
  futureKeywordDevices: ["desktop", "mobile"],
  location: {
    canonicalKey: "ES@es",
    countryCode: "ES",
    displayName: "Malaga",
    languageCode: "es",
    languageLabel: "Spanish",
  },
  locationId: "location_malaga",
  name: "Malaga core",
  publicId: "pmkt_abcdefghijklmnopqrstuvwx",
  status: "active",
};

export const pausedMarket = {
  ...activeMarket,
  location: {
    canonicalKey: "ES@en",
    countryCode: "ES",
    displayName: "Malaga",
    languageCode: "en",
    languageLabel: "English",
  },
  locationId: "location_malaga_en",
  name: "Malaga English",
  publicId: "pmkt_bbcdefghijklmnopqrstuvwx",
  status: "paused",
};

export function resetProjectMarketMocks() {
  vi.clearAllMocks();
  mocks.requireReadableProject.mockResolvedValue({
    actor: { id: "owned-fixture-user" },
    project: { id: "project_1", publicId: "prj_abcdefghijklmnopqrstuvwx" },
  });
  mocks.monthlyTrackingCostCents.mockImplementation((count: number) => count * 257.5);
  mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
  const checks = [
    legacyDbCheck(first, 1, 0, {}, "project_1"),
    legacyDbCheck(second, 8, 1, {}, "project_1"),
  ];
  mocks.prisma.rankCheck.count.mockImplementation(
    async ({ where }) =>
      checks.filter((check) => where.keywordId.in.includes(check.keywordId)).length,
  );
  mocks.prisma.rankCheck.findMany.mockImplementation(async ({ where }) =>
    checks.filter((check) => where.keywordId.in.includes(check.keywordId)),
  );
  mocks.prisma.observationItem.count.mockResolvedValue(0);
  mocks.supportsResearchScope.mockReturnValue(true);
  mocks.prisma.project.findUnique.mockResolvedValue({
    defaults: { cronExpression: null, frequency: "daily", serpDepth: 100 },
    checkSchedules: [],
    keywords: [
      {
        archivedAt: null,
        device: "desktop",
        locationId: "location_malaga",
        rankChecks: [{ position: 1 }],
        text: "one",
        id: first.id,
        publicId: first.publicId,
        createdAt: first.createdAt,
      },
      {
        archivedAt: null,
        device: "mobile",
        locationId: "location_malaga",
        rankChecks: [{ position: 8 }],
        text: "two",
        id: second.id,
        publicId: second.publicId,
        createdAt: second.createdAt,
      },
      {
        archivedAt: null,
        device: "desktop",
        locationId: "location_malaga_en",
        rankChecks: [],
        text: "three",
        id: third.id,
        publicId: third.publicId,
        createdAt: third.createdAt,
      },
      {
        archivedAt: new Date("2026-09-06T00:00:00.000Z"),
        device: "desktop",
        locationId: "location_malaga",
        rankChecks: [],
        text: "archived",
        id: archived.id,
        publicId: archived.publicId,
        createdAt: archived.createdAt,
      },
    ],
    markets: [activeMarket, pausedMarket],
    providerConnections: [],
  });
  mocks.listArchivedProjectMarkets.mockResolvedValue([
    {
      ...activeMarket,
      location: activeMarket.location,
      status: "removed",
    },
  ]);
  mocks.prisma.keyword.groupBy.mockResolvedValue([
    { _count: { _all: 2 }, locationId: "location_malaga" },
  ]);
  mocks.prisma.keyword.findMany.mockResolvedValue([
    { locationId: "location_malaga", schedule: null },
    { locationId: "location_malaga", schedule: null },
  ]);
  mocks.prisma.location.findMany.mockResolvedValue([
    {
      canonicalKey: "ES",
      countryCode: "ES",
      displayName: "All of Spain",
      id: "location_spain",
      languageCode: "es",
      languageLabel: "Spanish",
    },
  ]);
  mocks.prisma.projectMarket.findMany.mockResolvedValue([activeMarket, pausedMarket]);
}

export function getProjectMarketMocks() {
  return mocks;
}
