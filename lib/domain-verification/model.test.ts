import { describe, expect, it } from "vitest";
import {
  domainApex,
  hasRecentVerification,
  newVerificationToken,
  nextVerificationState,
} from "./model";

describe("domain verification model", () => {
  it("normalizes an apex and rejects non-public host forms", () => {
    expect(domainApex("https://www.example.com/path")).toBe("example.com");
    for (const host of ["localhost", "127.0.0.1", "https://example.com@127.0.0.1", "com"])
      expect(() => domainApex(host)).toThrow();
  });
  it("generates unique 32-byte base32 challenges", () => {
    const tokens = new Set(Array.from({ length: 100 }, newVerificationToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Z2-7]{52}$/);
  });
  it("keeps two transient failures and revokes on the third", () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    expect(nextVerificationState({ verifiedAt, failures: 0 }, false)).toEqual({
      verifiedAt,
      failures: 1,
    });
    expect(nextVerificationState({ verifiedAt, failures: 1 }, false)).toEqual({
      verifiedAt,
      failures: 2,
    });
    expect(nextVerificationState({ verifiedAt, failures: 2 }, false)).toEqual({
      verifiedAt: null,
      failures: 3,
    });
    expect(nextVerificationState({ verifiedAt: null, failures: 3 }, true, verifiedAt)).toEqual({
      verifiedAt,
      failures: 0,
    });
  });
  it("refreshes the last successful proof time only on success", () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-01-03T00:00:00Z");
    expect(nextVerificationState({ verifiedAt, failures: 2 }, true, now)).toEqual({
      verifiedAt: now,
      failures: 0,
    });
    expect(nextVerificationState({ verifiedAt, failures: 1 }, false, now)).toEqual({
      verifiedAt,
      failures: 2,
    });
  });
  it("retains two daily failures without extending the hard proof deadline", () => {
    const verifiedAt = new Date("2026-01-01T00:00:00Z");
    let row = { verifiedAt: verifiedAt as Date | null, failures: 0, revokedAt: null };
    for (const day of [1, 2, 3]) {
      const now = new Date(verifiedAt.getTime() + day * 86400000);
      row = { ...row, ...nextVerificationState(row, false, now) };
      expect(hasRecentVerification(row, now)).toBe(day < 3);
      expect(row.verifiedAt).toEqual(day < 3 ? verifiedAt : null);
    }
  });
});
