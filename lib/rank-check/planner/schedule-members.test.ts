import { describe, expect, it } from "vitest";
import { scheduledRunMembers } from "./schedule-members";

describe("scheduled run members", () => {
  it("keeps schedule order while hashing membership independently of order", () => {
    const first = scheduledRunMembers([{ id: "keyword_b" }, { id: "keyword_a" }]);
    const second = scheduledRunMembers([{ id: "keyword_a" }, { id: "keyword_b" }]);

    expect(first.keywordIds).toEqual(["keyword_b", "keyword_a"]);
    expect(first.selectionHash).toBe(second.selectionHash);
  });
});
