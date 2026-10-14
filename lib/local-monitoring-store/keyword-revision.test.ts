import { describe, expect, it } from "vitest";
import { localKeywordRevision } from "./canonical";
import { localKeywordSelect } from "./repository";

describe("persisted Local keyword target/policy revision", () => {
  it("selects actual independent Keyword scalars rather than a fictitious calendar epoch", () => {
    expect(localKeywordSelect).toMatchObject({
      measurementTargetEpoch: true,
      measurementPolicyEpoch: true,
    });
    expect(localKeywordSelect).not.toHaveProperty("measurementEpoch");
  });
  it("retains exact BigInt values beyond Number precision in a collision-free ordered pair", () => {
    const actual = localKeywordRevision({
      measurementTargetEpoch: 9007199254740993n,
      measurementPolicyEpoch: 9007199254740994n,
    });
    expect(actual).toBe("9007199254740993:9007199254740994");
    expect(
      localKeywordRevision({
        measurementTargetEpoch: "9007199254740993",
        measurementPolicyEpoch: "9007199254740994",
      }),
    ).toBe(actual);
    expect(
      localKeywordRevision({
        measurementTargetEpoch: 9007199254740994n,
        measurementPolicyEpoch: 9007199254740993n,
      }),
    ).not.toBe(actual);
  });
  it.each(["measurementTargetEpoch", "measurementPolicyEpoch"] as const)(
    "invalidates A → B → A on an independent %s increment",
    (epoch) => {
      const initial = { measurementTargetEpoch: "0", measurementPolicyEpoch: "0" };
      expect(localKeywordRevision({ ...initial, [epoch]: "2" })).not.toBe(
        localKeywordRevision(initial),
      );
    },
  );
  it.each([undefined, null, 1, NaN, -1n, "01", "-1", "1.5", "", "1:2", "9223372036854775808"])(
    "refuses unavailable/noncanonical epochs without a zero or numeric alias (%s)",
    (value) => {
      expect(() =>
        localKeywordRevision({ measurementTargetEpoch: value, measurementPolicyEpoch: "0" }),
      ).toThrow(RangeError);
      expect(() =>
        localKeywordRevision({ measurementTargetEpoch: "0", measurementPolicyEpoch: value }),
      ).toThrow(RangeError);
    },
  );
});
