import { describe, expect, it, vi } from "vitest";
import { apiKeyTierAllowedForRole, capApiScopesToRole, effectiveApiKeyScopes } from "./key-creator";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const all = ["read", "write", "admin"] as const;

describe("project API keys follow their creator's current role", () => {
  it.each([
    ["owner", ["read", "write", "admin"]],
    ["admin", ["read", "write", "admin"]],
    ["member", ["read", "write"]],
    ["auditor", ["read"]],
    ["viewer", ["read"]],
  ] as const)("a %s caps an admin key to %j", (role, expected) => {
    expect(capApiScopesToRole(all, role)).toEqual(expected);
  });

  it("a creator with no role leaves the key without rights", () => {
    expect(capApiScopesToRole(all, null)).toEqual([]);
  });

  it("never raises a narrower key", () => {
    expect(capApiScopesToRole(["read"], "owner")).toEqual(["read"]);
  });

  it("refuses a new key above the creator's role", () => {
    expect(apiKeyTierAllowedForRole("admin", "member")).toBe(false);
    expect(apiKeyTierAllowedForRole("write", "member")).toBe(true);
    expect(apiKeyTierAllowedForRole("read", "viewer")).toBe(true);
    expect(apiKeyTierAllowedForRole("read", null)).toBe(false);
  });

  it("reads the creator's role at use time, so a downgrade lowers the key", async () => {
    const findUnique = vi.fn(async () => ({ role: "viewer" as const }));
    const scopes = await effectiveApiKeyScopes({ membership: { findUnique } } as never, {
      scopes: ["read", "write", "admin"],
      createdById: "user",
      projectId: "project",
    });
    expect(scopes).toEqual(["read"]);
    expect(findUnique).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: "user", projectId: "project" } },
      select: { role: true },
    });
  });

  it("a key whose creator left the project or was deleted has no rights", async () => {
    const findUnique = vi.fn(async () => null);
    const db = { membership: { findUnique } } as never;
    const key = { scopes: ["read"], projectId: "project" };
    expect(await effectiveApiKeyScopes(db, { ...key, createdById: "gone" })).toEqual([]);
    expect(await effectiveApiKeyScopes(db, { ...key, createdById: null })).toEqual([]);
  });
});
