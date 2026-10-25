import { vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    urlPresence: {
      upsert: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    urlPresenceChange: { create: vi.fn() },
    projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
  };
  return {
    getInspectionBudget: vi.fn(),
    reserveInspections: vi.fn(),
    releaseInspections: vi.fn(),
    decryptProviderCredentials: vi.fn(),
    emitSignal: vi.fn(),
    markProviderNeedsReauth: vi.fn(),
    notifyPresenceBudgetExhausted: vi.fn(),
    prisma: {
      $transaction: vi.fn(),
      keyword: { findMany: vi.fn() },
      project: { findFirst: vi.fn(), findMany: vi.fn() },
      providerConnection: { findFirst: vi.fn() },
      urlPresence: {
        findMany: vi.fn(),
        upsert: vi.fn(),
        findUnique: vi.fn(),
        createMany: vi.fn(),
        updateMany: vi.fn(),
      },
      $executeRaw: vi.fn(),
      urlPresenceChange: { create: vi.fn() },
      projectDefaults: { findUnique: vi.fn(), upsert: vi.fn() },
    },
    provider: { createUrlInspectionSession: vi.fn(), inspectUrl: vi.fn() },
    tx,
  };
});

vi.mock("server-only", () => ({}));
vi.mock("./daily-summary", () => ({ persistIndexingDay: vi.fn() }));
vi.mock("./sitemap-snapshot", () => ({ persistSitemapSnapshot: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/gsc", () => ({ gscAnalyticsProvider: mocks.provider }));
vi.mock("@/lib/providers/auth-state", () => ({
  markProviderNeedsReauth: mocks.markProviderNeedsReauth,
}));
vi.mock("@/lib/providers/crypto", () => ({
  decryptProviderCredentials: mocks.decryptProviderCredentials,
}));
vi.mock("@/lib/signals/emit", () => ({ emitSignal: mocks.emitSignal }));
vi.mock("./inspection-budget", async (original) => ({
  ...(await original<typeof import("./inspection-budget")>()),
  reserveInspections: mocks.reserveInspections,
  releaseInspections: mocks.releaseInspections,
}));
vi.mock("./property-quota", async (original) => ({
  ...(await original<typeof import("./property-quota")>()),
  startPropertyInspection: vi.fn(),
  recordProperty429: vi.fn(),
}));
vi.mock("./ops", () => ({
  notifyPresenceBudgetExhausted: mocks.notifyPresenceBudgetExhausted,
}));

export { mocks };
