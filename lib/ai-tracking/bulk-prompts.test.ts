import { describe, expect, it } from "vitest";
import {
  BULK_PROMPT_LIMIT,
  PROMPT_TEXT_LIMIT,
  parseBulkPrompts,
  singlePromptIssue,
} from "./bulk-prompts";

describe("parseBulkPrompts", () => {
  it("keeps valid lines and reports empty, long, and duplicate lines", () => {
    const parsed = parseBulkPrompts(
      ["  Which tools?  ", "", "Which tools?", "x".repeat(PROMPT_TEXT_LIMIT + 1), "Fresh"].join(
        "\n",
      ),
      ["Which tools?"],
    );
    expect(parsed.valid).toEqual(["Fresh"]);
    expect(parsed.skipped.map((line) => line.reason)).toEqual([
      "duplicate",
      "empty",
      "duplicate",
      "too_long",
    ]);
  });

  it("does not create anything for lines past the first 50 non-empty lines", () => {
    const lines = Array.from({ length: BULK_PROMPT_LIMIT + 2 }, (_, index) => `Prompt ${index}`);
    const parsed = parseBulkPrompts(lines.join("\n"), []);
    expect(parsed.valid).toHaveLength(BULK_PROMPT_LIMIT);
    expect(parsed.skipped.map((line) => line.reason)).toEqual(["over_limit", "over_limit"]);
    expect(parsed.valid).not.toEqual(
      expect.arrayContaining(parsed.skipped.map((line) => line.text)),
    );
  });

  it("flags a single prompt that is empty or over the dialog limit", () => {
    expect(singlePromptIssue("  ")).toBe("empty");
    expect(singlePromptIssue("x".repeat(PROMPT_TEXT_LIMIT))).toBeNull();
    expect(singlePromptIssue("x".repeat(PROMPT_TEXT_LIMIT + 1))).toBe("too_long");
  });
});
