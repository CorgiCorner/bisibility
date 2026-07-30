import { describe, expect, it } from "vitest";
import { effectiveScopes } from "./personal-scope";

describe("personal-token effective scopes", () => {
  it.each([
    { expected: ["read"], role: "viewer", token: ["read", "write", "admin"] },
    { expected: ["read"], role: "auditor", token: ["read", "write", "admin"] },
    { expected: ["read", "write"], role: "member", token: ["read", "write", "admin"] },
    { expected: ["read", "write"], role: "owner", token: ["read", "write"] },
    { expected: ["read", "write", "admin"], role: "admin", token: ["read", "write", "admin"] },
  ] as const)("intersects $role membership with the token tier", ({ expected, role, token }) => {
    expect(effectiveScopes(token, role)).toEqual(expected);
  });
});
