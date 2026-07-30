import { describe, expect, it } from "vitest";
import {
  type GettingStartedProgress,
  gettingStartedActiveIndex,
  hasGettingStartedDataSource,
} from "./GettingStartedChecklist";

const baseProgress: GettingStartedProgress = {
  gscOAuthConfigured: true,
  hasAnalyticsSource: false,
  hasCheck: false,
  hasKeywords: false,
  projectId: "prj_1",
  providerConnected: false,
};

describe("GettingStartedChecklist", () => {
  it("counts an analytics source as a connected data source", () => {
    const progress = { ...baseProgress, hasAnalyticsSource: true };

    expect(hasGettingStartedDataSource(progress)).toBe(true);
    expect(gettingStartedActiveIndex(progress)).toBe(2);
  });
});
