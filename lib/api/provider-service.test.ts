import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auditProviderMutation: vi.fn(),
  lockProjectForProviderMutation: vi.fn(),
  publishWorkerIntent: vi.fn(),
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    providerConnection: { findUnique: vi.fn(), update: vi.fn() },
  },
  renumberProviderChain: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/db/public-id", () => ({ makePublicId: vi.fn() }));
vi.mock("@/lib/format/currency", () => ({ dollarsToCents: vi.fn() }));
vi.mock("@/lib/provider-allocations/project-lock", () => ({
  lockProjectForProviderMutation: mocks.lockProjectForProviderMutation,
}));
vi.mock("@/lib/providers/registry", () => ({
  PROVIDER_CATALOG: [{ id: "gsc", kind: "analytics" }],
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: mocks.publishWorkerIntent,
}));
vi.mock("./provider-audit", () => ({
  auditConnection: vi.fn((connection) => connection),
  auditProviderMutation: mocks.auditProviderMutation,
}));
vi.mock("./provider-chain-writer", () => ({
  renumberProviderChain: mocks.renumberProviderChain,
}));
vi.mock("./public-id", () => ({ requireApiPublicId: vi.fn((value) => value) }));

import { setProviderSettings } from "./provider-service";

const context = { actorId: "user_1", projectId: "project_1" };
const providerRef = { projectId: "prj_a00000000000000000000000", providerId: "gsc" as const };

function connectedAnalyticsConnection(overrides: Record<string, unknown> = {}) {
  return {
    enabled: true,
    firstSyncFinishedAt: null,
    firstSyncRequestedAt: null,
    firstSyncStartedAt: null,
    id: "connection_1",
    kind: "analytics",
    publicId: "conn_a00000000000000000000000",
    status: "connected",
    ...overrides,
  };
}

describe("provider settings", () => {
  let stored: ReturnType<typeof connectedAnalyticsConnection>;

  beforeEach(() => {
    vi.clearAllMocks();
    stored = connectedAnalyticsConnection();
    mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma));
    mocks.prisma.providerConnection.findUnique.mockImplementation(async () => stored);
    mocks.prisma.providerConnection.update.mockImplementation(async ({ data }) => {
      stored = { ...stored, ...data };
      return stored;
    });
    mocks.publishWorkerIntent.mockResolvedValue({ mode: "redis", ok: true });
  });

  it("creates a first-sync intent when analytics is disabled then re-enabled", async () => {
    await setProviderSettings({ ...providerRef, enabled: false }, context);
    const reenabled = await setProviderSettings({ ...providerRef, enabled: true }, context);

    expect(reenabled).toMatchObject({
      enabled: true,
      firstSyncFinishedAt: null,
      firstSyncRequestedAt: expect.any(Date),
      firstSyncStartedAt: null,
    });
    expect(mocks.publishWorkerIntent).toHaveBeenCalledWith("traffic_first_sync");
  });

  it("leaves an already-enabled analytics connection's intent unchanged", async () => {
    await setProviderSettings({ ...providerRef, enabled: true }, context);

    expect(mocks.prisma.providerConnection.update).toHaveBeenCalledWith({
      data: { enabled: true },
      where: { id: "connection_1" },
    });
  });
});
