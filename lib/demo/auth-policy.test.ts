import { describe, expect, it } from "vitest";
import {
  demoAuthRequestAllowed,
  demoIdentityAllowed,
  editableDemoAuthRequestAllowed,
  editableOwnerIdentityAllowed,
  editableViewerIdentityAllowed,
} from "./auth-policy";

const user = {
  id: "viewer_1",
  deactivatedAt: null,
  emailVerified: true,
  isInstanceAdmin: false,
  role: "viewer",
  twoFactorEnabled: false,
  memberships: [{ role: "viewer", project: { ownerId: "owner_1", publicId: "project-demo" } }],
};

const owner = {
  ...user,
  id: "owner_1",
  isInstanceAdmin: true,
  role: "owner",
  twoFactorEnabled: true,
  memberships: [
    { role: "owner", project: { ownerId: "owner_1", publicId: "project-demo" } },
    { role: "member", project: { ownerId: "other", publicId: "another-project" } },
  ],
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

  it("keeps legacy null-MFA viewers valid while editable viewers require false", () => {
    expect(demoIdentityAllowed({ ...user, twoFactorEnabled: null }, "project-demo")).toBe(true);
    expect(editableViewerIdentityAllowed({ ...user, twoFactorEnabled: null }, "project-demo")).toBe(
      false,
    );
  });

  it("permits only the configured active owner, including an instance admin with extra memberships", () => {
    expect(editableOwnerIdentityAllowed(owner, "project-demo")).toBe(true);
    expect(
      editableOwnerIdentityAllowed(
        {
          ...owner,
          memberships: [{ project: { ownerId: "other", publicId: "project-demo" }, role: "owner" }],
        },
        "project-demo",
      ),
    ).toBe(false);
    expect(
      editableOwnerIdentityAllowed({ ...owner, deactivatedAt: new Date() }, "project-demo"),
    ).toBe(false);
  });

  it("never promotes the viewer and keeps its single-membership requirement", () => {
    expect(editableViewerIdentityAllowed(user, "project-demo")).toBe(true);
    expect(editableViewerIdentityAllowed({ ...user, isInstanceAdmin: true }, "project-demo")).toBe(
      false,
    );
    expect(editableViewerIdentityAllowed({ ...user, role: "owner" }, "project-demo")).toBe(false);
    expect(
      editableViewerIdentityAllowed(
        { ...user, memberships: [...user.memberships, ...user.memberships] },
        "project-demo",
      ),
    ).toBe(false);
  });

  it("allows only the editable public entry, owner OTP/email actions, and pending MFA routes", () => {
    for (const [path, method] of [
      ["/demo/sign-in", "POST"],
      ["/get-session", "GET"],
      ["/sign-out", "POST"],
      ["/email-otp/send-verification-otp", "POST"],
      ["/sign-in/email-otp", "POST"],
      ["/email-otp/request-email-change", "POST"],
      ["/email-otp/change-email", "POST"],
      ["/email-otp/verify-email", "POST"],
      ["/two-factor/verify-totp", "POST"],
      ["/two-factor/verify-backup-code", "POST"],
    ] as const) {
      expect(editableDemoAuthRequestAllowed(path, method), path).toBe(true);
    }
    for (const path of ["/sign-up/email", "/sign-in/social", "/link-social", "/future-mutation"]) {
      expect(editableDemoAuthRequestAllowed(path, "POST"), path).toBe(false);
    }
  });
});
