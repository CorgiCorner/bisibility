import { auditPayloadPolicy } from "@/lib/auth/audit-field-declarations";
import { sanitizeDeclaredAuditPayload } from "@/lib/auth/audit-payload-policy";
import { describe, expect, it, vi } from "vitest";
import {
  consumeDefaultsWritePermit,
  consumeReviewedDefaultsAuthority,
  verifyDefaultsWritePermit,
} from "./defaults-permit";
import { signSettingsQuote } from "./quote-binding";
import { verifiedReviewedConsent } from "./reviewed-consent";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-consent-key-012345678900")],
}));
const now = new Date("2026-10-13T12:00:00.000Z");
const binding = {
  projectId: "project",
  actorId: "actor",
  providerId: null,
  depth: 20 as const,
  selection: { geo: "PRIVATE-GEO", credential: "PRIVATE-CREDENTIAL" },
  source: {
    sourceHash: "a".repeat(64),
    policyEpoch: "9007199254740993",
    authority: "PRIVATE-AUTHORITY",
    location: { address: "PRIVATE-ADDRESS", latitude: 52.1 },
    impact: {
      existingTargetRetargets: 0,
      newTargets: 0,
      inheritedDepthTargets: 4,
      recurringEstimate: "unknown",
    },
    targetIds: ["PRIVATE-TARGET"],
  },
};
describe("verified reviewed consent audit", () => {
  it("keeps the old principal consumer and new authority mutually one-use", () => {
    const token = signSettingsQuote("defaults", binding, now).token;
    const permit = verifyDefaultsWritePermit("defaults", token, binding, now);
    const result = consumeReviewedDefaultsAuthority(permit, "project", "actor");
    expect(result.principal).toEqual({ kind: "user", id: "actor" });
    expect(result.consent).toMatchObject({
      confirmed: true,
      policyRevision: "9007199254740993",
      nativeEstimates: null,
      calendar: null,
    });
    expect(() => consumeDefaultsWritePermit(permit, "project", "actor")).toThrow();
    const old = verifyDefaultsWritePermit("defaults", token, binding, now);
    expect(consumeDefaultsWritePermit(old, "project", "actor")).toEqual(result.principal);
    expect(() => consumeReviewedDefaultsAuthority(old, "project", "actor")).toThrow();
    expect(() =>
      consumeReviewedDefaultsAuthority({ projectId: "project" }, "project", "actor"),
    ).toThrow();
    expect(Object.isFrozen(result.consent.impact)).toBe(true);
  });
  it.each([
    "project_defaults.update",
    "settings.defaults.update",
    "settings.rank_check_frequency.update",
    "check_schedule.update",
  ])("actual sanitizer retains consent but strips unrelated secrets for %s", (action) => {
    const token = signSettingsQuote("defaults", binding, now).token;
    const consent = verifiedReviewedConsent("defaults", token, binding, now);
    const after = sanitizeDeclaredAuditPayload(
      {
        consent: { ...consent, rawPayload: "PRIVATE-RAW", token },
        credential: "PRIVATE-CREDENTIAL",
      },
      auditPayloadPolicy(action)?.after,
    );
    expect(after).toMatchObject({ consent });
    expect(JSON.stringify(after)).not.toMatch(/PRIVATE-|previewToken|rawPayload/);
    expect(JSON.stringify(after)).not.toContain(token);
  });
  it("does not expand unrelated audit actions or certify absent legacy estimates", () => {
    const token = signSettingsQuote("defaults", binding, now).token;
    const consent = verifiedReviewedConsent("defaults", token, binding, now);
    for (const action of [
      "settings.presence_inspection_budget.update",
      "settings.search_data_sync.update",
      "check_schedule.create",
    ])
      expect(
        sanitizeDeclaredAuditPayload({ consent }, auditPayloadPolicy(action)?.after),
      ).not.toHaveProperty("consent");
    const legacy = { ...binding, source: {} };
    expect(
      verifiedReviewedConsent(
        "intent",
        signSettingsQuote("intent", legacy, now).token,
        legacy,
        now,
      ),
    ).toMatchObject({
      sourceDigest: null,
      policyRevision: null,
      impact: null,
      calendar: null,
      nativeEstimates: null,
    });
  });
  it("retains exact fractional native estimates and distinct unknowns without copying targets", () => {
    const schedule = {
      ...binding,
      source: {
        sourceHash: binding.source.sourceHash,
        forecast: {
          targetIds: ["PRIVATE-TARGET"],
          calendar: {
            windowStart: now.toISOString(),
            windowEnd: "2026-11-10T12:00:00.000Z",
            dueOccurrences: 4,
            targetScope: { targetCount: 3 },
            recurringEstimates: [
              {
                providerId: "dataforseo",
                unit: "cents",
                quantity: "12.5000",
                unknownTargets: 0,
                certainty: "estimate",
              },
              {
                providerId: "serpapi",
                unit: "operations",
                quantity: null,
                unknownTargets: 2,
                certainty: "unknown",
              },
            ],
          },
        },
      },
    };
    const consent = verifiedReviewedConsent(
      "schedule",
      signSettingsQuote("schedule", schedule, now).token,
      schedule,
      now,
    );
    expect(consent.nativeEstimates).toMatchObject([
      { quantity: "12.5000", unknownTargets: 0 },
      { quantity: null, unknownTargets: 2 },
    ]);
    expect(consent.calendar).toMatchObject({
      dueOccurrences: 4,
      targetCount: 3,
      keywordCount: null,
    });
    expect(JSON.stringify(consent)).not.toContain("PRIVATE-");
    expect(() =>
      verifiedReviewedConsent(
        "schedule",
        signSettingsQuote("defaults", schedule, now).token,
        schedule,
        now,
      ),
    ).toThrow();
  });
});
