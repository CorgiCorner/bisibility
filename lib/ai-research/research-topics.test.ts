import { describe, expect, it } from "vitest";
import { RESEARCH_TOPIC_RULE, researchTopics } from "./research-topics";

describe("researchTopics", () => {
  it("groups questions by the most frequent significant word", () => {
    expect(RESEARCH_TOPIC_RULE).toBe("significant-word-v1");
    expect(
      researchTopics([
        { id: "1", text: "what directories list tools" },
        { id: "2", text: "which directories name both" },
        { id: "3", text: "who owns example tools" },
        { id: "4", text: "how do teams start" },
      ]),
    ).toEqual([
      { id: "directories", label: "Directories", questionIds: ["1", "2"] },
      { id: "tools", label: "Tools", questionIds: ["3"] },
    ]);
  });

  it("returns no topic when no significant word is shared", () => {
    expect(
      researchTopics([
        { id: "1", text: "how do teams start" },
        { id: "2", text: "where can buyers compare" },
      ]),
    ).toEqual([]);
  });
});
