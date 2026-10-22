import { beforeEach, describe, expect, it, vi } from "vitest";
import { getConnectedApps } from "./connected-apps";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), tokens: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { oauthClient: { findMany: mocks.findMany } } }));
vi.mock("@/lib/api/connected-app-tokens", () => ({ getAppCreatedTokens: mocks.tokens }));

const date = (day: number) => new Date(Date.UTC(2026, 9, day));
describe("connected app query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tokens.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([
      {
        clientId: "dynamic-client",
        name: "Registered name",
        consents: [{ scopes: ["read"], createdAt: date(1) }],
        refreshTokens: [
          {
            scopes: ["read", "offline_access"],
            revoked: null,
            expiresAt: new Date("2099-01-01"),
            createdAt: date(3),
          },
        ],
        accessTokens: [{ createdAt: date(4) }],
      },
    ]);
  });
  it("scopes membership and every token relation to the viewer", async () => {
    const apps = await getConnectedApps("viewer");
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where.OR).toEqual([
      { consents: { some: { userId: "viewer" } } },
      {
        refreshTokens: {
          some: { userId: "viewer", revoked: null, expiresAt: { gt: expect.any(Date) } },
        },
      },
    ]);
    for (const relation of ["consents", "refreshTokens", "accessTokens"]) {
      expect(query.select[relation].where.userId).toBe("viewer");
    }
    expect(apps[0]).toMatchObject({
      name: "Registered name",
      dynamic: true,
      connectedAt: date(1).toISOString(),
      lastUsedAt: date(4).toISOString(),
      scopes: ["read", "offline_access"],
      createdTokens: [],
    });
  });
  it("uses historical refresh issuance for dates but excludes its revoked scopes", async () => {
    mocks.findMany.mockResolvedValue([
      {
        clientId: "app",
        name: "App",
        consents: [{ createdAt: date(2), scopes: ["read"] }],
        refreshTokens: [
          { createdAt: date(1), scopes: ["admin"], revoked: date(2), expiresAt: date(3) },
          { createdAt: date(5), scopes: ["write"], revoked: date(6), expiresAt: date(7) },
        ],
        accessTokens: [],
      },
    ]);
    await expect(getConnectedApps("viewer")).resolves.toEqual([
      expect.objectContaining({
        connectedAt: date(1).toISOString(),
        lastUsedAt: date(5).toISOString(),
        scopes: ["read"],
      }),
    ]);
  });
  it("lists first-party refresh-only grants and does not invent last use from consent", async () => {
    mocks.findMany.mockResolvedValue([
      {
        clientId: "bisibility-ios",
        name: "iOS",
        consents: [],
        refreshTokens: [
          {
            scopes: ["api:read"],
            revoked: null,
            expiresAt: new Date("2099-01-01"),
            createdAt: date(2),
          },
        ],
        accessTokens: [],
      },
      {
        clientId: "bisibility-cli",
        name: null,
        consents: [{ scopes: ["read"], createdAt: date(1) }],
        refreshTokens: [],
        accessTokens: [],
      },
    ]);
    const apps = await getConnectedApps("viewer");
    expect(apps[0]).toMatchObject({
      dynamic: false,
      connectedAt: date(2).toISOString(),
      lastUsedAt: date(2).toISOString(),
    });
    expect(apps[1]).toMatchObject({ dynamic: false, lastUsedAt: null, name: "bisibility-cli" });
  });
});
