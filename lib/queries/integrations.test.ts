import { encryptSecret } from "@/lib/providers/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIntegrationCategories, getIntegrationsView, isProviderConnected } from "./integrations";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    operationalRun: { findMany: vi.fn() },
    providerCostEntry: { findMany: vi.fn() },
    providerConnection: {
      count: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
  project: {
    domain: "example.com",
    id: "project_1",
    name: "Example",
    ownerId: "user_1",
    publicId: "prj_1",
  },
  requireReadableProject: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));

function connection(overrides: Record<string, unknown>) {
  return {
    costPerCheckCents: 0.01,
    credentialsEncrypted: null,
    enabled: true,
    id: `connection_${String(overrides.provider ?? "serpapi")}`,
    kind: "serp",
    lastUsedAt: null,
    priority: 100,
    provider: "serpapi",
    status: "connected",
    updatedAt: new Date("2026-06-28T10:00:00.000Z"),
    ...overrides,
  };
}

const now = new Date("2026-06-28T12:00:00.000Z");
const secretsKey = (byte: number) => Buffer.alloc(32, byte).toString("base64");

describe("integration queries", () => {
  afterEach(() => vi.unstubAllEnvs());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({ project: mocks.project });
    mocks.prisma.providerConnection.count.mockResolvedValue(2);
    mocks.prisma.operationalRun.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([]);
  });

  it("loads connected providers from ProviderConnection rows in priority order", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({ priority: 0, provider: "serpapi" }),
      connection({ enabled: false, priority: 20, provider: "dataforseo" }),
    ]);

    const categories = await getIntegrationCategories("prj_1");
    const serpProviders = categories.find((category) => category.id === "serp")?.providers ?? [];

    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith({
      include: {
        rates: {
          select: { amountCents: true, feature: true },
        },
      },
      orderBy: [{ priority: "asc" }, { provider: "asc" }],
      where: { projectId: "project_1" },
    });
    expect(serpProviders.map((provider) => provider.id)).toEqual(["serpapi", "dataforseo"]);
    expect(serpProviders[0]).toMatchObject({
      primary: true,
      priority: 0,
      secondaryAction: "Test",
      status: "connected",
    });
    expect(serpProviders[1]).toMatchObject({
      enabled: false,
      priority: 20,
      status: "connected",
    });
  });

  it("omits planned enrichment from app integration categories", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);

    const categories = await getIntegrationCategories("prj_1", { now });

    expect(categories.map((category) => category.id)).toEqual(["serp", "analytics"]);
    expect(JSON.stringify(categories)).not.toContain("SEO enrichment");
  });

  it("prefills the stored SERP login while keeping the password out of the view", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ login: "dfs-user@example.com", password: "dfs-secret" }),
        ),
        priority: 7,
        provider: "dataforseo",
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1");
    const provider = categories[0].providers[0];

    expect(provider.drawer.defaults).toMatchObject({
      costPerCheck: 0.0001,
      enabled: true,
      login: "dfs-user@example.com",
      priority: 7,
      secret: "",
    });
    expect(provider.meta).toContainEqual({ label: "Account", value: "dfs-user@example.com" });
    expect(provider.meta.map((row) => row.label)).not.toContain("Fallback priority");
    expect(provider.meta.map((row) => row.label)).not.toContain("Est. provider cost");
    expect(JSON.stringify(provider)).not.toContain("dfs-secret");
  });

  it("keeps an unset provider rate blank in the drawer", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({ costPerCheckCents: null, provider: "dataforseo" }),
    ]);

    const categories = await getIntegrationCategories("prj_1");
    const provider = categories[0].providers[0];

    expect(provider.drawer.defaults.costPerCheck).toBeUndefined();
  });

  it("resolves drawer rates with provenance and provider capabilities", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        costPerCheckCents: null,
        id: "connection_dataforseo",
        provider: "dataforseo",
        rates: [{ amountCents: 1, feature: "keyword_research" }],
      }),
      connection({
        costPerCheckCents: null,
        id: "connection_serpapi",
        provider: "serpapi",
        rates: [],
      }),
    ]);
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        cached: false,
        connectionId: "connection_dataforseo",
        costCents: 1,
        createdAt: new Date("2026-07-26T00:00:00.000Z"),
        failed: false,
        feature: "rank_check",
      },
      {
        cached: false,
        connectionId: "connection_dataforseo",
        costCents: 2,
        createdAt: new Date("2026-07-26T01:00:00.000Z"),
        failed: false,
        feature: "rank_check",
      },
      {
        cached: false,
        connectionId: "connection_dataforseo",
        costCents: 3,
        createdAt: new Date("2026-07-26T02:00:00.000Z"),
        failed: false,
        feature: "rank_check",
      },
      {
        cached: false,
        connectionId: "connection_dataforseo",
        costCents: 4,
        createdAt: new Date("2026-07-26T03:00:00.000Z"),
        failed: false,
        feature: "rank_check",
      },
      {
        cached: false,
        connectionId: "connection_dataforseo",
        costCents: 100,
        createdAt: new Date("2026-07-26T04:00:00.000Z"),
        failed: false,
        feature: "rank_check",
      },
    ]);

    const categories = await getIntegrationCategories("prj_1", {
      now: new Date("2026-07-27T00:00:00.000Z"),
    });
    const [dataforseo, serpapi] = categories[0].providers;

    expect(dataforseo.drawer.rates).toMatchObject([
      { amountCents: 3, sampleSize: 5, source: "measured" },
      { amountCents: 1, fallbackSource: "list", source: "manual" },
      { source: "list" },
      { source: "list" },
    ]);
    expect(serpapi.drawer.rates?.map((rate) => rate.feature)).toEqual(["rank_check"]);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("marks secret fields as saved only for connected providers", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ login: "dfs-user@example.com", password: "dfs-secret" }),
        ),
        provider: "dataforseo",
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1");
    const [dataforseo, serpapi] = categories[0].providers;

    const connectedSecret = dataforseo.drawer.credentialFields.find(
      (field) => field.name === "secret",
    );
    expect(connectedSecret?.placeholder).toBe("••••••••");
    expect(connectedSecret?.description).toContain("Leave blank to keep");

    const disconnectedSecret = serpapi.drawer.credentialFields.find(
      (field) => field.name === "secret",
    );
    expect(disconnectedSecret?.placeholder).toBe("Your private API key");
    expect(disconnectedSecret?.description).toBeUndefined();
  });

  it("returns non-secret analytics source identity while keeping tokens masked", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        credentialsEncrypted: encryptSecret(
          JSON.stringify({
            apiKey: "secret-token",
            endpoint: "https://stats.example.com",
            login: "example.com",
          }),
        ),
        kind: "analytics",
        provider: "plausible",
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "analytics")?.providers[0];

    expect(provider?.drawer.defaults).toMatchObject({
      endpoint: "https://stats.example.com",
      login: "example.com",
      secret: "",
    });
    expect(provider?.meta).toContainEqual({ label: "Site domain", value: "example.com" });
    expect(provider?.meta).toContainEqual({
      label: "API service",
      value: "https://stats.example.com",
    });
    expect(provider?.meta.map((row) => row.label)).not.toContain("Billing");
    expect(JSON.stringify(provider)).not.toContain("secret-token");
  });

  it("marks an enabled analytics connection as never synced until its first successful import", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        kind: "analytics",
        lastUsedAt: null,
        provider: "plausible",
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "analytics")?.providers[0];

    expect(provider).toMatchObject({
      enabled: true,
      id: "plausible",
      neverSynced: true,
      status: "connected",
    });
    expect(provider?.meta).toContainEqual({ label: "Last sync", value: "Never" });
  });

  it("surfaces the latest consecutive traffic-sync failure streak", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({ id: "connection_gsc", kind: "analytics", provider: "gsc" }),
    ]);
    mocks.prisma.operationalRun.findMany.mockResolvedValue([
      {
        connectionId: "connection_gsc",
        errorClass: "provider_5xx",
        startedAt: new Date("2026-06-28T11:30:00.000Z"),
        status: "failed",
      },
      {
        connectionId: "connection_gsc",
        errorClass: "network",
        startedAt: new Date("2026-06-28T10:30:00.000Z"),
        status: "failed",
      },
      {
        connectionId: "connection_gsc",
        errorClass: null,
        startedAt: new Date("2026-06-28T09:30:00.000Z"),
        status: "succeeded_with_data",
      },
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "analytics")?.providers[0];

    expect(provider?.neverSynced).toBeUndefined();
    expect(provider?.syncFailure).toEqual({
      consecutiveFailures: 2,
      errorClass: "provider_5xx",
      since: "2026-06-28T10:30:00.000Z",
    });
  });

  it("keeps provider state and failures for legacy credential placeholders", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        costPerCheckCents: 1.55,
        credentialsEncrypted: "sha256:redacted-dataforseo-credentials",
        id: "connection_dataforseo",
        priority: 0,
        provider: "dataforseo",
      }),
      connection({
        credentialsEncrypted: "legacy-redacted-gsc-credentials",
        id: "connection_gsc",
        kind: "analytics",
        provider: "gsc",
      }),
    ]);
    mocks.prisma.operationalRun.findMany.mockResolvedValue([
      {
        connectionId: "connection_gsc",
        errorClass: null,
        startedAt: new Date("2026-06-28T11:30:00.000Z"),
        status: "failed",
      },
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const dataforseo = categories.find((category) => category.id === "serp")?.providers[0];
    const gsc = categories.find((category) => category.id === "analytics")?.providers[0];

    expect(dataforseo).toMatchObject({
      credentialIssue: undefined,
      drawer: { defaults: { costPerCheck: 0.0155, login: "", secret: "" } },
      primary: true,
      status: "connected",
    });
    expect(gsc).toMatchObject({
      credentialIssue: undefined,
      drawer: { defaults: { login: "", secret: "" } },
      status: "connected",
      syncFailure: {
        consecutiveFailures: 1,
        errorClass: "unknown",
        since: "2026-06-28T11:30:00.000Z",
      },
    });
    expect(JSON.stringify(categories)).not.toContain("redacted");
  });

  it("surfaces unreadable current ciphertext without changing connection status", async () => {
    vi.stubEnv("BISIBILITY_SECRETS_KEY", secretsKey(1));
    const credentialsEncrypted = encryptSecret(JSON.stringify({ login: "dfs-user@example.com" }));
    vi.stubEnv("BISIBILITY_SECRETS_KEY", secretsKey(2));
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({ credentialsEncrypted, provider: "dataforseo" }),
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "serp")?.providers[0];

    expect(provider).toMatchObject({
      credentialIssue: "unreadable",
      drawer: { defaults: { login: "", secret: "" } },
      status: "connected",
    });
  });

  it("shows the canonical Google id for legacy bare-domain GSC connections", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ apiKey: "secret-token", login: "example.com" }),
        ),
        kind: "analytics",
        provider: "gsc",
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "analytics")?.providers[0];

    expect(provider?.drawer.defaults.login).toBe("sc-domain:example.com");
    expect(provider?.meta).toContainEqual({
      label: "Property",
      value: "sc-domain:example.com",
    });
    expect(JSON.stringify(provider)).not.toContain("secret-token");
  });

  it("counts only connected rows for the empty state", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);

    const view = await getIntegrationsView("prj_1", { now });

    expect(mocks.prisma.providerConnection.count).toHaveBeenCalledWith({
      where: { projectId: "project_1", status: "connected" },
    });
    expect(view.connectionCount).toBe(2);
  });

  it("surfaces a Google connection that needs reauthorization", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        credentialsEncrypted: encryptSecret(
          JSON.stringify({ apiKey: "revoked-token", login: "sc-domain:example.com" }),
        ),
        kind: "analytics",
        provider: "gsc",
        status: "needs_reauth",
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "analytics")?.providers[0];

    expect(provider).toMatchObject({
      enabled: true,
      id: "gsc",
      secondaryAction: undefined,
      status: "needs_reauth",
    });
    expect(JSON.stringify(provider)).not.toContain("revoked-token");
  });

  it("routes pending Google OAuth setup only to its GA4 provider", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([]);
    const googleOAuth = {
      properties: [
        {
          kind: "ga4" as const,
          label: "Bisibility (123456789)",
          permissionLevel: "CorgiCorner",
          value: "123456789",
        },
      ],
      provider: "ga4" as const,
    };

    const categories = await getIntegrationCategories("prj_1", { googleOAuth, now });
    const providers = categories.find((category) => category.id === "analytics")?.providers ?? [];

    expect(providers.find((provider) => provider.id === "ga4")?.drawer.googleOAuth).toEqual(
      googleOAuth,
    );
    expect(providers.find((provider) => provider.id === "gsc")?.drawer.googleOAuth).toBeUndefined();
  });

  it("formats provider ages from the page-provided clock", async () => {
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      connection({
        lastUsedAt: new Date("2026-06-28T10:00:00.000Z"),
        provider: "dataforseo",
        updatedAt: new Date("2026-06-28T09:00:00.000Z"),
      }),
    ]);

    const categories = await getIntegrationCategories("prj_1", { now });
    const provider = categories.find((category) => category.id === "serp")?.providers[0];

    expect(provider?.meta).toContainEqual({ label: "Last rank check", value: "2h ago" });
    expect(provider?.drawer.activities).toContainEqual({
      label: "Connection updated",
      value: "3h ago",
    });
  });

  it.each([
    [{ enabled: true, status: "connected" }, true],
    [{ enabled: false, status: "connected" }, false],
    [{ enabled: true, status: "ready" }, false],
    [null, false],
  ])("reports the effective provider connection state", async (connectionState, expected) => {
    mocks.prisma.providerConnection.findUnique.mockResolvedValue(connectionState);

    await expect(isProviderConnected("prj_1", "gsc")).resolves.toBe(expected);
    expect(mocks.prisma.providerConnection.findUnique).toHaveBeenCalledWith({
      select: { enabled: true, status: true },
      where: { projectId_provider: { projectId: "project_1", provider: "gsc" } },
    });
  });
});
