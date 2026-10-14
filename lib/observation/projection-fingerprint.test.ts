import { describe, expect, it } from "vitest";
import { projectionFingerprint } from "./projection-fingerprint";

describe("normalized observation replay identity", () => {
  it("preserves historical times and source ordinals independently of object insertion order", () => {
    const a = {
      observedAt: new Date("2026-10-01T00:00:00Z"),
      items: [{ sourceOrdinal: 4, cid: "90071992547409931234" }],
    };
    const b = {
      items: [{ cid: "90071992547409931234", sourceOrdinal: 4 }],
      observedAt: new Date("2026-10-01T00:00:00Z"),
    };
    expect(projectionFingerprint(a)).toBe(projectionFingerprint(b));
    expect(projectionFingerprint({ ...a, observedAt: new Date("2026-10-02T00:00:00Z") })).not.toBe(
      projectionFingerprint(a),
    );
    expect(
      projectionFingerprint({ ...a, items: [{ sourceOrdinal: 3, cid: "90071992547409931234" }] }),
    ).not.toBe(projectionFingerprint(a));
  });
  it("does not turn invalid numeric or date evidence into JSON null", () => {
    for (const value of [NaN, Infinity, new Date(NaN)])
      expect(() => projectionFingerprint({ value })).toThrow();
  });
});
