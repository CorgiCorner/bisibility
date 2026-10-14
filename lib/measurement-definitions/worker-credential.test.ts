import { describe, expect, it, vi } from "vitest";
import type { DefinitionTransaction } from "./model";
import { assertDefinitionRunCredential } from "./worker-credential";

vi.mock("server-only", () => ({}));
function fixture(key: unknown = { scopes: ["write"], revokedAt: null, expiresAt: null }) {
  const findFirst = vi.fn(async () => key);
  const raw = vi.fn(async () => []);
  return {
    findFirst,
    raw,
    tx: { $queryRaw: raw, apiKey: { findFirst } } as unknown as DefinitionTransaction,
  };
}
describe("original caller key is separate from provider secret and owner", () => {
  it("renews the exact authenticated launch key with no user/owner impersonation", async () => {
    const f = fixture();
    await assertDefinitionRunCredential(f.tx, "project-a", {
      requestedById: null,
      credentialKind: "project_key",
      credentialId: "original-key",
    });
    expect(f.findFirst).toHaveBeenCalledWith({
      where: { id: "original-key", projectId: "project-a" },
      select: { scopes: true, revokedAt: true, expiresAt: true },
    });
  });
  it.each([
    null,
    { scopes: ["read"], revokedAt: null, expiresAt: null },
    { scopes: ["admin"], revokedAt: new Date(), expiresAt: null },
    { scopes: ["write"], revokedAt: null, expiresAt: new Date(0) },
  ])(
    "cannot replace a missing/disabled key with any same-project writable key (%j)",
    async (key) => {
      const f = fixture(key);
      await expect(
        assertDefinitionRunCredential(f.tx, "project-a", {
          requestedById: null,
          credentialKind: "project_key",
          credentialId: "original-key",
        }),
      ).rejects.toThrow();
      expect(f.findFirst).toHaveBeenCalledOnce();
    },
  );
  it("personal/oauth keys cannot synthesize a user from null requestedBy", async () => {
    const f = fixture();
    for (const credentialKind of ["personal_token", "oauth_client"])
      await expect(
        assertDefinitionRunCredential(f.tx, "project-a", {
          requestedById: null,
          credentialKind,
          credentialId: "original-key",
        }),
      ).rejects.toThrow();
    expect(f.findFirst).not.toHaveBeenCalled();
  });
});

it("refuses attributing a project credential to an unrelated user", async () => {
  const f = fixture();
  await expect(
    assertDefinitionRunCredential(f.tx, "project_1", {
      credentialKind: "project_key",
      credentialId: "key_1",
      requestedById: "user_1",
    }),
  ).rejects.toMatchObject({ code: "measurement_definition_unavailable" });
  expect(f.raw).not.toHaveBeenCalled();
  expect(f.findFirst).not.toHaveBeenCalled();
});
