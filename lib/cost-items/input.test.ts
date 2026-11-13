import { describe, expect, it } from "vitest";
import { emptyCostForm, formFromStored } from "./form-state";
import { landingMinor, toCostItemInput } from "./input";
import { buildPriceChanges } from "./schedule";

const form = {
  ...emptyCostForm("prj_current", "2026-11-01"),
  amount: "120.00",
  name: "Notes",
  projectIds: ["prj_current", "prj_other"],
  split: "equal" as const,
};

describe("cost item input", () => {
  it("rejects a blank amount, a bad trial, and a percent outside 0 to 100", () => {
    expect(toCostItemInput({ ...form, amount: "" }, "prj_current")).toBe("amount");
    expect(toCostItemInput({ ...form, trialUntil: "2026-10-01" }, "prj_current")).toBe("trial");
    expect(
      toCostItemInput(
        {
          ...form,
          percents: { prj_current: "-1" },
          projectIds: ["prj_current"],
          split: "percent",
        },
        "prj_current",
      ),
    ).toBe("percent");
  });

  it("stores a partial percent without requiring the rest to be assigned", () => {
    const input = toCostItemInput(
      {
        ...emptyCostForm("prj_current", "2026-11-01"),
        amount: "99.00",
        name: "Notes",
        percents: { prj_current: "50" },
        split: "percent",
      },
      "prj_current",
    );
    if (typeof input === "string") throw new Error(input);
    expect(input.projects).toEqual([{ basisPoints: 5_000, projectPublicId: "prj_current" }]);
    expect(landingMinor(input)).toBe(4_950);
  });

  it("opens an equal item as this project's equivalent percent", () => {
    const stored = {
      amountMinor: 100,
      billing: "monthly" as const,
      catalogKey: null,
      currency: "USD",
      kind: "custom" as const,
      name: "Notes",
      planLabel: "",
      priceChanges: [],
      projects: [
        { basisPoints: null, publicId: "prj_a" },
        { basisPoints: null, publicId: "prj_b" },
        { basisPoints: null, publicId: "prj_c" },
      ],
      split: "equal" as const,
      startedOn: "2026-01-01",
    };
    const current = formFromStored(stored, "prj_a");
    expect(current.split).toBe("percent");
    expect(current.projectIds).toEqual(["prj_a"]);
    expect(current.percents.prj_a).toBe("34");
    const input = toCostItemInput(current, "prj_a");
    if (typeof input === "string") throw new Error(input);
    expect(landingMinor(input)).toBe(34);
    expect(formFromStored(stored, "prj_b").percents.prj_b).toBe("33");
  });

  it("stores the regular share the live line describes", () => {
    const input = toCostItemInput(
      {
        ...form,
        discountMode: "percent",
        discountPercent: "50",
        discountSpan: "months",
        discountMonths: "3",
        trialUntil: "2026-11-30",
      },
      "prj_current",
    );
    if (typeof input === "string") throw new Error(input);
    expect(landingMinor(input)).toBe(6_000);
    expect(buildPriceChanges(input).map((change) => change.reason)).toEqual([
      "trial",
      "discount",
      "regular",
    ]);
    expect(buildPriceChanges(input)[1]?.amountMinor).toBe(6_000);
  });
});
