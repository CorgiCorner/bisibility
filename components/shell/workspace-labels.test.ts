import { describe, expect, it } from "vitest";
import { truncateProjectName } from "./workspace-labels";

describe("truncateProjectName", () => {
  it("keeps names up to 14 characters", () => {
    expect(truncateProjectName("acme.dev")).toBe("acme.dev");
    expect(truncateProjectName("12345678901234")).toBe("12345678901234");
  });

  it("truncates longer names to 14 characters with an ellipsis", () => {
    expect(truncateProjectName("very-long-project-name")).toBe("very-long-proj…");
    expect(truncateProjectName("very-long-project-name")).toHaveLength(15);
  });
});
