import { describe, expect, it } from "vitest";
import { validateSecurityReturnTo } from "./security-return-to";

describe("security return destination", () => {
  it.each([
    "/app/admin/billing",
    "/app/admin/administration?tab=mail",
    "/app/admin?filter=active#actions",
  ])("accepts %s", (path) => {
    expect(validateSecurityReturnTo(path)).toBe(path);
  });
  it.each([
    undefined,
    ["/app/admin"],
    "https://evil.test/app/admin",
    "//evil.test/app/admin",
    "/login",
    "/app",
    "/application/admin",
    "/app/../login",
    "/app/%2e%2e/login",
    "/app/%2f%2fevil.test",
    "/app/%252f%252fevil.test",
    "/app/\\evil",
    "/app/\nadmin",
    "/app/%00",
    "/app/%zz",
  ])("rejects %s", (path) => {
    expect(validateSecurityReturnTo(path)).toBeNull();
  });
});
