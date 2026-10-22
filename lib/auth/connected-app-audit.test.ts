import { describe, expect, it } from "vitest";
import { auditPayloadPolicy } from "./audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "./audit-payload-policy";

describe("connected app audit field declarations", () => {
  it("retains the OAuth issuance client but drops undeclared secrets", () => {
    expect(
      sanitizeDeclaredAuditPayload(
        { viaClientId: "registered-app", raw: "secret", token: "secret" },
        auditPayloadPolicy("pat.exchange_login")?.after,
      ),
    ).toEqual({ viaClientId: "registered-app" });
  });
  it("retains only declared revocation counts and the client identifier", () => {
    const payload = {
      clientId: "app",
      deletedConsentCount: 1,
      revokedRefreshTokenCount: 2,
      deletedAccessTokenCount: 3,
      revokedCreatedTokenCount: 0,
    };
    expect(
      sanitizeDeclaredAuditPayload(
        { ...payload, accessToken: "secret", refreshToken: "secret" },
        auditPayloadPolicy("account.connected_app_revoked")?.after,
      ),
    ).toEqual(payload);
  });
});
