import { requirePublicId } from "@/lib/db/public-id-resources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signRecurringConsent, verifyRecurringConsent } from "./consent";
import { now, policy } from "./recurring.test-fixture";
import { approvalSnapshotSchema, calendarSchema } from "./schema";

beforeEach(() => vi.stubEnv("BISIBILITY_SECRETS_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());
describe("signed recurring approval", () => {
  it("accepts only the captured policy and freshly verified actor", () => {
    const token = signRecurringConsent(policy, now).token;
    expect(verifyRecurringConsent(token, policy, now).projectId).toBe(policy.internalProjectId);
    expect(() =>
      verifyRecurringConsent(token, { ...policy, actorId: "administrator" }, now),
    ).toThrow("mismatch");
  });
  it.each([
    { maximumTotalCents: "100" },
    { maximumPerOccurrenceCents: "1" },
    { validUntil: "2026-12-01T00:00:00.000Z" },
    { connectionStamp: "f".repeat(64) },
    { calendar: { ...policy.calendar, timezone: "UTC" } },
    { targetIds: [requirePublicId("lmt_bcdefghijklmnopqrstuvwxy", "lmt")] },
  ])("rejects changed signed policy %j", (change) => {
    const token = signRecurringConsent(policy, now).token;
    expect(() => verifyRecurringConsent(token, { ...policy, ...change }, now)).toThrow("mismatch");
  });
  it("rejects malformed target or calendar IDs rather than branding them unchecked", () => {
    expect(() => approvalSnapshotSchema.parse({ ...policy, targetIds: ["foreign"] })).toThrow();
    expect(() => calendarSchema.parse({ ...policy.calendar, publicId: "foreign" })).toThrow();
  });
  it("never extends a preview quote or accepts expired consent", () => {
    const token = signRecurringConsent(policy, now).token;
    expect(() => verifyRecurringConsent(token, policy, new Date(policy.quote.expiresAt))).toThrow(
      "expired",
    );
    expect(() => verifyRecurringConsent(token, policy, new Date(policy.validUntil))).toThrow(
      "expired",
    );
  });
});
