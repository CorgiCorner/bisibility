import { describe, expect, it } from "vitest";
import { demoAuthRequestAllowed, demoIdentityAllowed } from "./auth-policy";

const user = {
  deactivatedAt: null,
  emailVerified: true,
  isInstanceAdmin: false,
  role: "viewer",
  twoFactorEnabled: false,
  memberships: [{ role: "viewer", project: { publicId: "project-demo" } }],
};

describe("public demo auth policy", () => {
  it("allows only demo entry, session read and the visitor's own sign-out", () => {
    expect(demoAuthRequestAllowed("/demo/sign-in", "POST")).toBe(true);
    expect(demoAuthRequestAllowed("/get-session", "GET")).toBe(true);
    expect(demoAuthRequestAllowed("/sign-out", "POST")).toBe(true);
    expect(demoAuthRequestAllowed("/demo/sign-in", "GET")).toBe(false);
  });

  it.each([
    "/change-email",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
    "/sign-in/email-otp",
    "/sign-up/email",
    "/sign-in/social",
    "/link-social",
    "/delete-user",
    "/update-user",
    "/two-factor/enable",
    "/revoke-sessions",
    "/list-sessions",
    "/oauth2/register",
    "/oauth2/token",
    "/future-mutation",
  ])("rejects direct auth access to %s", (path) => {
    expect(demoAuthRequestAllowed(path, "POST")).toBe(false);
    expect(demoAuthRequestAllowed(path, "GET")).toBe(false);
  });

  it("requires one viewer membership and never accepts the seeded owner/admin", () => {
    expect(demoIdentityAllowed(user, "project-demo")).toBe(true);
    expect(demoIdentityAllowed(user, "another-project")).toBe(false);
    expect(demoIdentityAllowed({ ...user, role: "owner" }, "project-demo")).toBe(false);
    expect(demoIdentityAllowed({ ...user, isInstanceAdmin: true }, "project-demo")).toBe(false);
    expect(demoIdentityAllowed({ ...user, twoFactorEnabled: true }, "project-demo")).toBe(false);
    expect(
      demoIdentityAllowed(
        { ...user, memberships: [...user.memberships, ...user.memberships] },
        "project-demo",
      ),
    ).toBe(false);
  });
});
