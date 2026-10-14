import { describe, expect, it } from "vitest";
import { validateMcpPublicIds } from "./public-id-input";

const suffix = "a00000000000000000000000";
describe("surface-specific MCP run identifiers", () => {
  it.each([
    ["getRankCheckRun", "rcr"],
    ["getAiTrackingRun", "air"],
    ["getLocalMonitorRunResults", "lmr"],
  ] as const)("accepts only the native %s / %s identity", (name, prefix) => {
    expect(() => validateMcpPublicIds(name, { run_id: `${prefix}_${suffix}` })).not.toThrow();
    for (const other of ["rcr", "air", "lmr"].filter((value) => value !== prefix)) {
      expect(() => validateMcpPublicIds(name, { run_id: `${other}_${suffix}` })).toThrow(
        expect.objectContaining({ code: "invalid_public_id" }),
      );
    }
  });
});
