import { describe, expect, it } from "vitest";
import {
  factorStatusLabel,
  passwordActionLabel,
  secretFromTotpUri,
  twoFactorErrorMessage,
} from "./security-factor-utils";
import { createTotpQrDataUrl } from "./totp-qr";

describe("security factor helpers", () => {
  it("extracts the TOTP secret from an otpauth URI", () => {
    expect(
      secretFromTotpUri(
        "otpauth://totp/Bisibility:jan@example.com?secret=ABC123&issuer=Bisibility",
      ),
    ).toBe("ABC123");
  });

  it("maps missing credential password errors to account copy", () => {
    expect(twoFactorErrorMessage({ message: "No password credential found" })).toBe(
      "This account does not have a password credential yet.",
    );
  });

  it("labels factor state and password actions", () => {
    expect(factorStatusLabel(false)).toBe("Not enabled");
    expect(factorStatusLabel(true)).toBe("Enabled");
    expect(passwordActionLabel(false, "setup")).toBe("Continue");
    expect(passwordActionLabel(true, "disable")).toBe("Working");
  });

  it("creates a local QR data URL without leaking the otpauth URI to a remote service", () => {
    const url = createTotpQrDataUrl(
      "otpauth://totp/Bisibility:jan@example.com?secret=ABC123&issuer=Bisibility",
    );

    expect(url).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(decodeURIComponent(url ?? "")).toContain("<svg");
  });
});
