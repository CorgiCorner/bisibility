import { beforeEach, expect, it, vi } from "vitest";
import { listDataSyncSchedules } from "./data-syncs";

const mocks = vi.hoisted(() => ({ connection: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    project: {
      findUnique: async () => ({
        publicId: "prj_one",
        domain: "example.com",
        syncPauses: [],
      }),
    },
    providerConnection: { findUnique: mocks.connection },
    domainRatingCheck: { findFirst: async () => null },
    sitemapSnapshot: { findFirst: async () => null },
    pageIndexingDay: { findFirst: async () => null },
    searchAnalyticsImport: { findFirst: async () => null },
  },
}));
vi.mock("@/lib/domain-rating/credentials", () => ({
  resolveDomainRatingCredentials: async () => null,
}));
vi.mock("@/lib/provider-responses/connection", () => ({
  connectionResponseRecorder: () => () => undefined,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "true");
  vi.stubEnv("PRESENCE_SYNC_ENABLED", "true");
  vi.stubEnv("SITEMAP_SYNC_ENABLED", "true");
});

it("keeps every sync readable when the real credential reader cannot decrypt a stored secret", async () => {
  mocks.connection.mockResolvedValue({
    id: "connection",
    provider: "gsc",
    enabled: true,
    status: "connected",
    credentialsEncrypted: "malformed-envelope",
  });
  const rows = await listDataSyncSchedules("project", new Date());
  expect(rows).toHaveLength(4);
  for (const sync_kind of ["search_console", "page_indexing"])
    expect(rows.find((row) => row.sync_kind === sync_kind)).toMatchObject({
      state: "active",
      state_reason: "integration_disconnected",
    });
  expect(rows.find((row) => row.sync_kind === "sitemap")?.state_reason).toBeNull();
});

it("propagates unrelated database failures from the real credential reader", async () => {
  const error = new Error("database unavailable");
  mocks.connection.mockRejectedValue(error);
  await expect(listDataSyncSchedules("project", new Date())).rejects.toBe(error);
});
