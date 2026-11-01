import { describe, expect, it } from "vitest";
import { closeoutManifest } from "./manifest";
import { closeoutFixture } from "./plan.test-fixture";

describe("retired connection settings closeout", () => {
  it("requires an explicit separate policy for a deleted project with a retained connection snapshot", () => {
    const { projectPublicId: _, ...base } = closeoutFixture().manifest;
    const manifest = {
      ...base,
      policy: "known-cost-incomplete-byok-retired-settings-v1",
      retiredProjectId: "project",
    };
    expect(() => closeoutManifest.parse(manifest)).not.toThrow();
    expect(() =>
      closeoutManifest.parse({
        ...manifest,
        retiredProjectId: undefined,
        projectPublicId: "prj_fixture",
      }),
    ).toThrow();
  });
});
