import { hashApiKey } from "@/lib/providers/crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { authenticateBearer } from "./auth";

const mocks = vi.hoisted(() => ({
  apiKey: { findMany: vi.fn(), update: vi.fn() },
  personalAccessToken: { findMany: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }));
beforeEach(() => vi.clearAllMocks());
const invalidScopes = [
  undefined,
  null,
  "admin",
  {},
  [],
  ["unsupported"],
  ["read", "unsupported"],
  [1],
];
for (const kind of ["apiKey", "personalAccessToken"] as const) {
  const raw = kind === "apiKey" ? "bsb_key_test_scope_fixture" : "bsb_pat_live_test_scope_fixture";
  function authenticate(scopes: unknown) {
    mocks[kind].findMany.mockResolvedValue([
      {
        hashedKey: hashApiKey(raw),
        id: "key",
        prefix: raw.slice(0, 21),
        name: "Fixture",
        revokedAt: null,
        expiresAt: null,
        scopes,
        project: {},
        user: { id: "user", memberships: [] },
      },
    ]);
    return authenticateBearer(
      new Request("https://example.test/api/v1/projects", {
        headers: { authorization: `Bearer ${raw}` },
      }),
    );
  }
  it.each(invalidScopes.map((scopes) => ({ scopes })))(
    `${kind} rejects invalid stored scopes: $scopes`,
    async ({ scopes }) => {
      await expect(authenticate(scopes)).rejects.toMatchObject({ status: 401 });
      expect(mocks[kind].update).not.toHaveBeenCalled();
    },
  );
  it.each(
    [["read"], ["write"], ["admin"], ["read", "write", "admin"]].map((scopes) => ({ scopes })),
  )(`${kind} preserves valid scopes: $scopes`, async ({ scopes }) => {
    const result = await authenticate(scopes);
    expect(result.kind === "project_key" ? result.apiKey.scopes : result.token.scopes).toEqual(
      scopes,
    );
    expect(mocks[kind].update).toHaveBeenCalledOnce();
  });
}
