import { auditPayloadPolicy } from "@/lib/auth/audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "@/lib/auth/audit-payload-policy";
import { describe, expect, it } from "vitest";

describe("exact native rate audit declaration", () => {
  it("retains tiny and maximal exact decimal strings on both sides of the change", () => {
    const policy = auditPayloadPolicy("provider.update_rate");
    expect(
      sanitizeDeclaredAuditPayload(
        { amountCents: "0.0001", provider: "dataforseo", feature: "rank_check" },
        policy?.before,
      ),
    ).toMatchObject({ amountCents: "0.0001" });
    expect(
      sanitizeDeclaredAuditPayload(
        { amountCents: "999999.9999", provider: "dataforseo", feature: "rank_check" },
        policy?.after,
      ),
    ).toMatchObject({ amountCents: "999999.9999" });
  });
  it("preserves legacy numeric audit compatibility without storing undeclared secrets", () => {
    const policy = auditPayloadPolicy("provider.update_rate");
    expect(
      sanitizeDeclaredAuditPayload({ amountCents: 2, password: "synthetic-only" }, policy?.after),
    ).toEqual({ amountCents: 2 });
  });
});
