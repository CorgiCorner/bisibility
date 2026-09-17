import { describe, expect, it } from "vitest";
import {
  factorStatusKey,
  passwordActionKey,
  secretFromTotpUri,
  twoFactorErrorKey,
} from "./security-factor-utils";
import { createTotpQrDataUrl } from "./totp-qr";

describe("security factor helpers", () => {
  it("extracts the TOTP secret from an otpauth URI", () => {
    expect(
      secretFromTotpUri(
        "otpauth://totp/bisibility:jan@example.com?secret=ABC123&issuer=bisibility",
      ),
    ).toBe("ABC123");
  });

  it("maps missing credential password errors to account copy", () => {
    expect(twoFactorErrorKey({ message: "No password credential found" })).toBe(
      "passwordUnavailable",
    );
  });

  it("labels factor state and password actions", () => {
    expect(factorStatusKey(false)).toBe("notEnabled");
    expect(factorStatusKey(true)).toBe("enabled");
    expect(passwordActionKey(false, "setup")).toBe("continue");
    expect(passwordActionKey(true, "disable")).toBe("working");
  });

  it("creates a local QR data URL without leaking the otpauth URI to a remote service", () => {
    const url = createTotpQrDataUrl(
      "otpauth://totp/bisibility:jan@example.com?secret=ABC123&issuer=bisibility",
    );

    expect(url).toMatch(/^data:image\/svg\+xml;utf8,/);
    expect(decodeURIComponent(url ?? "")).toContain("<svg");
  });
});
