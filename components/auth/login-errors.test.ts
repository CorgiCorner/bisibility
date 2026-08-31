import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./login-errors";

const unavailableMessage =
  "This instance has no email provider configured, so sign-in codes cannot be sent. The instance admin needs to set EMAIL_PROVIDER.";

describe("authErrorMessage", () => {
  it.each([
    [{ code: "EMAIL_NOT_CONFIGURED" }],
    [{ message: "EMAIL_NOT_CONFIGURED" }],
    [{ body: { code: "EMAIL_NOT_CONFIGURED" } }],
  ])("maps a direct email configuration rejection", (error) => {
    expect(authErrorMessage(error)).toBe(unavailableMessage);
  });
});
