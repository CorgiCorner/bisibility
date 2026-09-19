import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleApiRequest } from "./router";

const mocks = vi.hoisted(() => ({
  authenticateBearer: vi.fn(),
  providerConnection: { findMany: vi.fn() },
}));

vi.mock("./auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  authenticateBearer: mocks.authenticateBearer,
}));
vi.mock("./ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { providerConnection: mocks.providerConnection } }));

const ids = {
  connection: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
  project: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
} as const;

const project = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  domain: "example.com",
  id: "project_1",
  name: "Example",
  publicId: ids.project,
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const serpCatalogId = PROVIDER_CATALOG.find((item) => item.kind === "serp")?.id ?? "";
const analyticsCatalogId = PROVIDER_CATALOG.find((item) => item.kind === "analytics")?.id ?? "";
const serpCatalogStatus =
  PROVIDER_CATALOG.find((item) => item.kind === "serp")?.defaultStatus ?? "ready";

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    costPerCheckCents: null,
    enabled: true,
    kind: "serp",
    lastUsedAt: new Date("2026-02-03T04:05:06.000Z"),
    priority: 0,
    provider: serpCatalogId,
    publicId: ids.connection,
    status: "connected",
    updatedAt: new Date("2026-02-03T04:05:06.000Z"),
    ...overrides,
  };
}

async function listProviders() {
  const response = await handleApiRequest(
    new Request(`https://example.test/api/v1/projects/${ids.project}/providers`, {
      headers: { authorization: "Bearer bsb_key_live_test_key" },
      method: "GET",
    }),
    ["projects", ids.project, "providers"],
  );
  return { body: (await response.json()) as { data: Record<string, unknown>[] }, response };
}

describe("list_providers connection state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticateBearer.mockResolvedValue({
      kind: "project_key",
      apiKey: {
        id: "key_1",
        name: "Key",
        prefix: "bsb_key_live_",
        projectId: project.id,
        scopes: ["admin"],
      },
      project,
    });
  });

  it("reports catalog providers without a connection row as not connected", async () => {
    mocks.providerConnection.findMany.mockResolvedValue([]);

    const { body, response } = await listProviders();
    const provider = body.data.find((item) => item.id === serpCatalogId);

    expect(response.status).toBe(200);
    expect(provider).toMatchObject({
      capabilities: {
        backlinks: false,
        domain_overview: false,
        keyword_metrics: false,
        keyword_research: false,
        rank_checks: false,
        search_performance: false,
      },
      connected: false,
      connection_status: "not_connected",
      last_used_at: null,
      status: serpCatalogStatus,
    });
  });

  it("keeps connection_status connected while a disabled provider blocks capabilities", async () => {
    mocks.providerConnection.findMany.mockResolvedValue([
      connectionRow({ enabled: false, provider: serpCatalogId }),
    ]);

    const { body } = await listProviders();
    const provider = body.data.find((item) => item.id === serpCatalogId);

    expect(provider).toMatchObject({
      capabilities: expect.objectContaining({ rank_checks: false }),
      connected: true,
      connection_status: "connected",
      enabled: false,
    });
  });

  it("exposes capabilities and last_used_at for a connected enabled provider", async () => {
    mocks.providerConnection.findMany.mockResolvedValue([connectionRow()]);

    const { body } = await listProviders();
    const provider = body.data.find((item) => item.id === serpCatalogId);

    expect(provider).toMatchObject({
      capabilities: expect.objectContaining({ rank_checks: true }),
      connected: true,
      connection_status: "connected",
      last_used_at: "2026-02-03T04:05:06.000Z",
    });
  });

  it("reports needs_reauth as the connection status without claiming capabilities", async () => {
    mocks.providerConnection.findMany.mockResolvedValue([
      connectionRow({ status: "needs_reauth" }),
    ]);

    const { body } = await listProviders();
    const provider = body.data.find((item) => item.id === serpCatalogId);

    expect(provider).toMatchObject({
      capabilities: expect.objectContaining({ rank_checks: false }),
      connected: false,
      connection_status: "needs_reauth",
    });
  });

  it("exposes search_performance capabilities for a connected analytics source", async () => {
    mocks.providerConnection.findMany.mockResolvedValue([
      connectionRow({ kind: "analytics", provider: analyticsCatalogId }),
    ]);

    const { body } = await listProviders();
    const provider = body.data.find((item) => item.id === analyticsCatalogId);

    expect(provider).toMatchObject({
      capabilities: expect.objectContaining({ search_performance: true }),
      connected: true,
      connection_status: "connected",
    });
  });
});
