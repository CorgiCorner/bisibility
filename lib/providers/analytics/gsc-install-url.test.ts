import { describe, expect, it } from "vitest";
import { gscInstallUrl } from "./gsc-install-url";

describe("gscInstallUrl", () => {
  it("connects the Google account before selecting a Search Console property", () => {
    const url = new URL(gscInstallUrl("prj_1"), "https://example.test");

    expect(url.searchParams.get("projectId")).toBe("prj_1");
    expect(url.searchParams.has("property")).toBe(false);
    expect(url.searchParams.get("provider")).toBe("gsc");
  });

  it("returns to onboarding step 5 by default (not the retired step 3)", () => {
    const url = new URL(gscInstallUrl("prj_1"), "https://example.test");

    expect(url.searchParams.get("returnPath")).toBe("/onboarding?step=5&projectId=prj_1");
  });

  it("carries the wizard context return path through the roundtrip", () => {
    const returnPath = "/onboarding?step=5&projectId=prj_1&loc=US&device=desktop&device=mobile";
    const url = new URL(gscInstallUrl("prj_1", returnPath), "https://example.test");

    expect(url.searchParams.get("returnPath")).toBe(returnPath);
  });
});
