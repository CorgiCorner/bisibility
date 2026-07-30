import { describe, expect, it } from "vitest";
import {
  completeTwoFactorEnrollmentSchema,
  twoFactorManagementSchema,
} from "./two-factor-management-schema";

describe("two-factor management schemas", () => {
  it("uses the same conditional password and current-factor rules on both boundaries", () => {
    const schema = twoFactorManagementSchema({
      factorRequired: true,
      passwordRequired: true,
    });

    expect(schema.safeParse({ code: "123456", method: "totp", password: "" }).success).toBe(false);
    expect(
      schema.safeParse({
        code: "abcde-12345",
        method: "backup_code",
        password: "password",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed factor codes and accepts initial enrollment without one", () => {
    expect(
      twoFactorManagementSchema({
        factorRequired: true,
        passwordRequired: false,
      }).safeParse({ code: "123", method: "totp", password: "" }).success,
    ).toBe(false);
    expect(
      twoFactorManagementSchema({
        factorRequired: false,
        passwordRequired: false,
      }).safeParse({ code: "", method: "totp", password: "" }).success,
    ).toBe(true);
  });

  it("requires a UUID enrollment handle and a six-digit new authenticator code", () => {
    expect(
      completeTwoFactorEnrollmentSchema.safeParse({
        code: "123456",
        enrollmentId: "11111111-1111-4111-8111-111111111111",
      }).success,
    ).toBe(true);
    expect(
      completeTwoFactorEnrollmentSchema.safeParse({
        code: "backup-code",
        enrollmentId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
