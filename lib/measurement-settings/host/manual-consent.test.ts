import { auditPayloadPolicy } from "@/lib/auth/audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "@/lib/auth/audit-payload-policy";
import { describe, expect, it, vi } from "vitest";
import { signSettingsQuote } from "./quote-binding";
import { consumeManualConsent, verifiedManualConsent } from "./reviewed-consent";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-manual-consent-key-012345")],
}));
const now = new Date("2026-10-13T12:00:00.000Z");
const binding = {
  projectId: "project",
  actorId: "actor",
  depth: 20 as const,
  providerId: "serpapi",
  selection: { targetIds: ["PRIVATE-TARGET"] },
  source: {
    sourceHash: "a".repeat(64),
    nativeToken: "PRIVATE-NATIVE-TOKEN",
    manual: {
      targetIds: ["PRIVATE-TARGET"],
      estimates: [
        {
          providerId: "serpapi",
          unit: "searches",
          quantity: "2",
          unknownTargets: 0,
          certainty: "estimate",
        },
        {
          providerId: "dataforseo",
          unit: "cents",
          quantity: null,
          unknownTargets: 1,
          certainty: "unknown",
        },
      ],
    },
  },
};
describe("manual reviewed consent", () => {
  it("MAC-verifies before immutable safe projection and one-use canonical consumption", () => {
    const token = signSettingsQuote("manual", binding, now).token;
    const summary = verifiedManualConsent(token, binding, now);
    expect(summary).toMatchObject({
      purpose: "manual",
      outcome: "measurement_queued",
      reviewedTargetCount: 1,
      calendar: null,
      impact: null,
      nativeEstimates: [{ quantity: "2" }, { quantity: null, unknownTargets: 1 }],
    });
    expect(Object.isFrozen(summary.nativeEstimates?.[0])).toBe(true);
    expect(JSON.stringify(summary)).not.toMatch(/PRIVATE-|targetIds|nativeToken/);
    expect(JSON.stringify(summary)).not.toContain(token);
    expect(() => consumeManualConsent(summary, "foreign", "actor")).toThrow();
    expect(() => consumeManualConsent(summary, "project", "foreign")).toThrow();
    expect(consumeManualConsent(summary, "project", "actor")).toBe(summary);
    expect(() => consumeManualConsent(summary, "project", "actor")).toThrow(
      "verified_manual_consent_required",
    );
    expect(() => consumeManualConsent({ ...summary }, "project", "actor")).toThrow(
      "verified_manual_consent_required",
    );
    expect(() => verifiedManualConsent(token, { ...binding, actorId: "foreign" }, now)).toThrow();
    expect(() =>
      verifiedManualConsent(signSettingsQuote("schedule", binding, now).token, binding, now),
    ).toThrow();
  });
  it("retains only declared manual consent and leaves missing estimates unknown", () => {
    const legacy = { ...binding, source: {} };
    const summary = verifiedManualConsent(
      signSettingsQuote("manual", legacy, now).token,
      legacy,
      now,
    );
    const after = sanitizeDeclaredAuditPayload(
      { consent: { ...summary, rawToken: "PRIVATE-RAW" } },
      auditPayloadPolicy("rank_check_run.launch")?.after,
    );
    expect(after).toMatchObject({
      consent: {
        purpose: "manual",
        confirmed: true,
        nativeEstimates: null,
        reviewedTargetCount: null,
      },
    });
    expect(JSON.stringify(after)).not.toContain("PRIVATE-");
    expect(
      sanitizeDeclaredAuditPayload(
        { consent: summary },
        auditPayloadPolicy("rank_check_run.retry")?.after,
      ),
    ).not.toHaveProperty("consent");
  });
});
