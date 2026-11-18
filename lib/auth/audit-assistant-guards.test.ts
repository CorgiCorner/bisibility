import { expect, test } from "vitest";
import { auditPayloadPolicy } from "./audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "./audit-payload-policy";

// Undeclared actions keep row metadata only, which would silently drop the level of a flip.
test("kill switch, guard and breaker audits keep their before and after values", () => {
  const flip = auditPayloadPolicy("instance_admin.assistant_kill_switch.set");
  expect(sanitizeDeclaredAuditPayload({ level: "credits" }, flip?.after)).toEqual({
    level: "credits",
  });
  const guard = auditPayloadPolicy("instance_admin.assistant_guard.set");
  expect(
    sanitizeDeclaredAuditPayload(
      { key: "assistant.guard.teamDailyCents", value: 500 },
      guard?.after,
    ),
  ).toEqual({ key: "assistant.guard.teamDailyCents", value: 500 });
  const trip = auditPayloadPolicy("assistant.spend_breaker.tripped");
  expect(
    sanitizeDeclaredAuditPayload(
      { level: "credits", reason: "hourly_spend", threshold: 2000, hourlyCents: 2500 },
      trip?.after,
    ),
  ).toEqual({ level: "credits", reason: "hourly_spend", threshold: 2000, hourlyCents: 2500 });
});
