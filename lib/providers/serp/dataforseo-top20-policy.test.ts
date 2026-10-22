import { frozenRequest } from "@/lib/measurement-definitions/canonical";
import { nativeBindingFixture } from "@/lib/measurement-definitions/worker-native.fixtures";
import { describe, expect, it } from "vitest";
import { dataForSeoRankTask } from "./dataforseo-rank-request";

const input = {
  keyword: "test",
  domain: "example.com",
  device: "desktop" as const,
  location: {
    gl: "us",
    hl: "en",
    primaryGeoCode: 2840,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  },
};
describe("DataForSEO Top20 collection", () => {
  it.each([true, false, undefined])(
    "never sends a native early stop at Top20 with preference %s",
    (stopOnMatch) => {
      const source = nativeBindingFixture("dataforseo").source;
      if (!source.policy.defaults) throw new Error("Missing fixture defaults");
      source.policy.defaults.serpStopOnMatch = stopOnMatch ?? true;
      const request = frozenRequest(source, "dataforseo", 20);
      expect(request).toMatchObject({ compilerVersion: 2, stopOnMatch: false });
      const task = dataForSeoRankTask({ ...input, depth: 20, stopOnMatch: request.stopOnMatch });
      expect(task.depth).toBe(20);
      expect(task).not.toHaveProperty("stop_crawl_on_match");
      expect(task).not.toHaveProperty("find_targets_in");
    },
  );
  it("honors a retained legacy Top20 early-stop boolean at native transport", () => {
    expect(dataForSeoRankTask({ ...input, depth: 20, stopOnMatch: true })).toMatchObject({
      depth: 20,
      stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: "example.com" }],
    });
  });
  it.each([10, 50, 100] as const)("retains the native stop target at Top%i", (depth) => {
    expect(dataForSeoRankTask({ ...input, depth, stopOnMatch: true })).toMatchObject({
      stop_crawl_on_match: [{ match_type: "with_subdomains", match_value: "example.com" }],
    });
  });
});
