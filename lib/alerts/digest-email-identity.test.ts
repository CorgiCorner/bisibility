import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertIndexedDigestIdentity, digestEmailIdentity } from "./prepared-email-delivery";

function canonicalDigestInputs(input: {
  alertIds: readonly string[];
  ruleId: string;
  userId: string;
}) {
  return [
    "v1",
    `rule:${input.ruleId.length}:${input.ruleId}`,
    `user:${input.userId.length}:${input.userId}`,
    ...[...input.alertIds].sort().map((id) => `alert:${id.length}:${id}`),
  ].join("\n");
}

describe("digestEmailIdentity", () => {
  it("is the sha256 hex of a versioned encoding of rule, sorted alert ids, and user", () => {
    const input = { alertIds: ["alert_b", "alert_a"], ruleId: "rule_1", userId: "user_1" };
    const encoded = canonicalDigestInputs({ ...input, alertIds: ["alert_a", "alert_b"] });
    expect(encoded.startsWith("v1\n")).toBe(true);
    expect(digestEmailIdentity(input)).toBe(createHash("sha256").update(encoded).digest("hex"));
  });

  it("stays a 64 character key when the digest holds 200 alert ids", () => {
    const alertIds = Array.from(
      { length: 200 },
      (_, index) => `c${index.toString(36).padStart(24, "0")}`,
    );
    const input = { alertIds, ruleId: "c".padEnd(25, "r"), userId: "c".padEnd(25, "u") };
    const identity = digestEmailIdentity(input);
    const encoded = canonicalDigestInputs(input);
    expect(alertIds.every((id) => id.length === 25)).toBe(true);
    expect(Buffer.byteLength(encoded)).toBeGreaterThan(2704);
    expect(identity).toMatch(/^[0-9a-f]{64}$/);
    expect(identity).toBe(createHash("sha256").update(encoded).digest("hex"));
    expect(digestEmailIdentity({ ...input, alertIds: [...alertIds].reverse() })).toBe(identity);
    expect(digestEmailIdentity({ ...input, alertIds: alertIds.slice(1) })).not.toBe(identity);
    expect(digestEmailIdentity({ ...input, ruleId: "c".padEnd(25, "q") })).not.toBe(identity);
    expect(digestEmailIdentity({ ...input, userId: "c".padEnd(25, "t") })).not.toBe(identity);
  });

  it("rejects a digest identity that is not a 64 character sha256 hex key", () => {
    expect(() => assertIndexedDigestIdentity(`digest:${"a,".repeat(200)}email:user`)).toThrow(
      /64 character sha256 hex key/,
    );
  });
});
