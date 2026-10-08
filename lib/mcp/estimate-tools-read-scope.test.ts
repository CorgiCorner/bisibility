import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchMcpTool } from "./tools";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  backlinksCache: vi.fn(),
  paidCall: vi.fn(),
  preflightBudget: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    backlinkSnapshot: { findFirst: vi.fn() },
    project: { findFirst: vi.fn() },
  },
  getProvider: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({
  ApiAuthError: class ApiAuthError extends Error {},
  LEGACY_BEARER_PREFIXES: ["bsk_", "bsp_"],
  PERSONAL_TOKEN_PREFIX: "bsb_pat_live_",
  PROJECT_API_KEY_PREFIX: "bsb_key_",
  authenticateBearer: mocks.auth,
}));
vi.mock("@/lib/api/ratelimit", () => ({
  checkRateLimit: vi.fn(() => Promise.resolve({ headers: new Headers(), success: true })),
  rateLimitExceeded: vi.fn(),
}));
vi.mock("@/lib/api/idempotency", () => ({
  withIdempotency: vi.fn((_input, execute) => execute()),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/registry", () => ({ getSerpProvider: mocks.getProvider }));
vi.mock("@/lib/provider-lookups/paid-call", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/provider-lookups/paid-call")>()),
  paidProviderCall: mocks.paidCall,
  preflightProviderBudget: mocks.preflightBudget,
}));
vi.mock("@/lib/backlinks/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/backlinks/cache")>()),
  withBacklinksCache: mocks.backlinksCache,
}));

const projectPublicId = "prj_a00000000000000000000000";
const project = {
  budgetCapCents: 5_000,
  domain: "example.com",
  id: "project_1",
  name: "Example",
  ownerId: "owner_1",
  providerConnections: [
    { credentialsEncrypted: "encrypted", id: "connection_1", provider: "dataforseo" },
  ],
  publicId: projectPublicId,
  writeMode: "writable",
};
const provider = {
  fetchBacklinksHistory: vi.fn(),
  fetchBacklinksRows: vi.fn(),
  fetchBacklinksSummary: vi.fn(),
  id: "dataforseo",
  label: "DataForSEO",
};

describe("MCP estimate tools with read-scope access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({
      apiKey: { id: "key_1", projectId: project.id, scopes: ["read"] },
      kind: "project_key",
      project,
    });
    mocks.prisma.project.findFirst.mockResolvedValue(project);
    mocks.prisma.backlinkSnapshot.findFirst.mockResolvedValue(null);
    mocks.getProvider.mockReturnValue(provider);
    mocks.preflightBudget.mockResolvedValue(undefined);
  });

  it("dispatches estimate_backlinks_cost with a read-scope key without spending budget", async () => {
    const result = await dispatchMcpTool(
      "estimate_backlinks_cost",
      { project_id: projectPublicId, target: "example.com" },
      "bsb_key_live_test",
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      data: { estimate: true, estimated_cost_cents: 2.4 + (2.4 + 100 * 0.0036) + 2.4 },
    });
    expect(mocks.paidCall).not.toHaveBeenCalled();
    expect(mocks.preflightBudget).not.toHaveBeenCalled();
    expect(provider.fetchBacklinksRows).not.toHaveBeenCalled();
  });

  it("still requires write scope for the paid backlinks analysis", async () => {
    const result = await dispatchMcpTool(
      "analyze_backlinks",
      { project_id: projectPublicId, target: "example.com" },
      "bsb_key_live_test",
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
    expect(mocks.paidCall).not.toHaveBeenCalled();
  });
});
