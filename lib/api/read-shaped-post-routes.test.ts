import { describe, expect, it } from "vitest";
import {
  isReadShapedProjectPostRoute,
  readShapedProjectPostScope,
} from "./read-shaped-post-routes";

describe("read-shaped project POST routes", () => {
  it.each(["keyword-matches", "keyword-metrics"])("recognizes %s", (resource) => {
    expect(isReadShapedProjectPostRoute("POST", ["projects", "prj_1", resource])).toBe(true);
  });

  it("rejects writes and unrelated routes", () => {
    expect(isReadShapedProjectPostRoute("GET", ["projects", "prj_1", "keyword-matches"])).toBe(
      false,
    );
    expect(isReadShapedProjectPostRoute("POST", ["projects", "prj_1", "keywords"])).toBe(false);
  });

  it("keeps budget-spending metrics on write scope", () => {
    expect(readShapedProjectPostScope("POST", ["projects", "prj_1", "keyword-matches"])).toBe(
      "read",
    );
    expect(readShapedProjectPostScope("POST", ["projects", "prj_1", "keyword-metrics"])).toBe(
      "write",
    );
  });
});
