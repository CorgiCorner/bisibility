import { describe, expect, it } from "vitest";
import {
  type GettingStartedProgress,
  gettingStartedActiveIndex,
  hasGettingStartedDataSource,
} from "./getting-started";

const baseProgress: GettingStartedProgress = {
  gscOAuthConfigured: true,
  hasAnalyticsSource: false,
  hasCheck: false,
  hasKeywords: false,
  projectId: "prj_1",
  providerConnected: false,
};

describe("getting-started", () => {
  it("counts an analytics source as a connected data source", () => {
    const progress = { ...baseProgress, hasAnalyticsSource: true };

    expect(hasGettingStartedDataSource(progress)).toBe(true);
    expect(gettingStartedActiveIndex(progress)).toBe(2);
  });

  it("walks the stages in order and lands on 0 when everything is done", () => {
    expect(gettingStartedActiveIndex(baseProgress)).toBe(1);
    expect(gettingStartedActiveIndex({ ...baseProgress, providerConnected: true })).toBe(2);
    expect(
      gettingStartedActiveIndex({ ...baseProgress, hasKeywords: true, providerConnected: true }),
    ).toBe(3);
    expect(
      gettingStartedActiveIndex({
        ...baseProgress,
        hasCheck: true,
        hasKeywords: true,
        providerConnected: true,
      }),
    ).toBe(0);
  });
});
