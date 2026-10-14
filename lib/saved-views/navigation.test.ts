import { describe, expect, it } from "vitest";
import { canonicalSavedViewHref } from "./navigation";
import { viewProjectId, viewPublicId } from "./view-test-fixture";

describe("explicit General navigation", () => {
  it("preserves an empty view key on both surfaces", () => {
    for (const surface of ["keywords", "competitors"] as const) {
      const url = new URL(
        canonicalSavedViewHref(viewProjectId, surface, null),
        "https://example.test",
      );
      expect(url.searchParams.has("view")).toBe(true);
      expect(url.searchParams.get("view")).toBe("");
    }
    expect(canonicalSavedViewHref(viewProjectId, "keywords", viewPublicId)).toContain(
      `view=${viewPublicId}`,
    );
  });
});
