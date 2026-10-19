import { describe, expect, it } from "vitest";
import {
  firstPartyAppApiScopes,
  grantedApiScopes,
  hasApiScope,
  scopesForTier,
  tierFromScopes,
} from "./scope-policy";

describe("API scope containment", () => {
  it.each([
    { granted: "read", required: "read", result: true },
    { granted: "read", required: "write", result: false },
    { granted: "read", required: "admin", result: false },
    { granted: "write", required: "read", result: true },
    { granted: "write", required: "write", result: true },
    { granted: "write", required: "admin", result: false },
    { granted: "admin", required: "read", result: true },
    { granted: "admin", required: "write", result: true },
    { granted: "admin", required: "admin", result: true },
  ] as const)("$granted contains $required: $result", ({ granted, required, result }) => {
    expect(hasApiScope([granted], required)).toBe(result);
  });

  it("uses the same cumulative tiers for storage and OAuth grants", () => {
    expect(scopesForTier("read")).toEqual(["read"]);
    expect(scopesForTier("write")).toEqual(["read", "write"]);
    expect(scopesForTier("admin")).toEqual(["read", "write", "admin"]);
    expect(grantedApiScopes(["openid", "admin"])).toEqual(["read", "write", "admin"]);
    expect(grantedApiScopes(["openid"])).toEqual([]);
    expect(tierFromScopes(["read", "write"])).toBe("write");
  });
});

describe("first-party app API scopes", () => {
  it.each([
    [["api:read"], ["read"]],
    [["api:write"], ["read", "write"]],
    [
      ["api:read", "api:write"],
      ["read", "write"],
    ],
    [["read", "write", "admin"], []],
    [["openid", "offline_access"], []],
  ])("maps %j to %j and never to admin", (scopes, expected) => {
    expect(firstPartyAppApiScopes(scopes)).toEqual(expected);
  });

  it("keeps api scopes out of the MCP mapping", () => {
    expect(grantedApiScopes(["api:read", "api:write"])).toEqual([]);
  });
});
