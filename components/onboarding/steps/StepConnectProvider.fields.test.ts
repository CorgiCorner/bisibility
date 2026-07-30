import { describe, expect, it } from "vitest";
import { costPerCheckCentsFromUsd } from "./StepConnectProvider.fields";

describe("costPerCheckCentsFromUsd", () => {
  it("converts a USD form value to cents", () => {
    expect(costPerCheckCentsFromUsd(0.0155)).toBeCloseTo(1.55, 6);
  });

  it("returns null for undefined and non-positive values", () => {
    expect(costPerCheckCentsFromUsd(undefined)).toBeNull();
    expect(costPerCheckCentsFromUsd(0)).toBeNull();
  });
});
