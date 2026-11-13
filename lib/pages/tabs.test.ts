import { describe, expect, it } from "vitest";
import {
  defaultProjectPagesTab,
  projectPagesTabOrder,
  projectPagesTabs,
  resolveProjectPagesTab,
} from "./tabs";

describe("project pages tabs", () => {
  it("keeps the final order and registers every Pages tab", () => {
    expect(projectPagesTabOrder).toEqual(["all", "by-tag", "existing-vs-new", "compare"]);
    expect(projectPagesTabs.map((tab) => tab.id)).toEqual([
      "all",
      "by-tag",
      "existing-vs-new",
      "compare",
    ]);
    expect(defaultProjectPagesTab()).toBe("all");
  });

  it("resolves a known tab and falls back to All pages otherwise", () => {
    expect(resolveProjectPagesTab("all")).toBe("all");
    expect(resolveProjectPagesTab("by-tag")).toBe("by-tag");
    expect(resolveProjectPagesTab("existing-vs-new")).toBe("existing-vs-new");
    expect(resolveProjectPagesTab("compare")).toBe("compare");
    expect(resolveProjectPagesTab("missing")).toBe("all");
    expect(resolveProjectPagesTab(null)).toBe("all");
  });
});
