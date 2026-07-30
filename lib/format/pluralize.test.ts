import { describe, expect, it } from "vitest";
import { countLabel, pluralize } from "./pluralize";

describe("pluralize", () => {
  it.each([
    [0, "0 keywords"],
    [1, "1 keyword"],
    [2, "2 keywords"],
  ])("uses the correct noun for %i", (count, expected) =>
    expect(pluralize(count, "keyword")).toBe(expected),
  );

  it("formats count labels and irregular plurals", () => {
    expect(countLabel(1, "target URL", "target URLs")).toBe("1 target URL");
    expect(countLabel(2, "target URL", "target URLs")).toBe("2 target URLs");
  });
});
