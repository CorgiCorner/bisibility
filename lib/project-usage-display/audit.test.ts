import { auditPayloadPolicy } from "@/lib/auth/audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "@/lib/auth/audit-payload-policy";
import { expect, it } from "vitest";

it("records only bounded display options and revision, without names, currencies or credentials", () => {
  const policy = auditPayloadPolicy("settings.usage_display.update");
  const options = {
    moneyDisplay: "raw-unit",
    moneyFractionDigits: 4,
    quantityFractionDigits: 4,
    revision: 2,
  };
  const input = {
    ...options,
    credentials: "private",
    businessAddress: "private",
    currency: "EUR",
    amount: "123.4567",
  };
  expect(sanitizeDeclaredAuditPayload(input, policy?.after)).toEqual(options);
  expect(sanitizeDeclaredAuditPayload(input, policy?.before)).toEqual(options);
});
