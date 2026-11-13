import { describe, expect, it } from "vitest";
import { classifyManualPageLines } from "./manual-lines";

describe("classifyManualPageLines", () => {
  it("accepts project URLs and paths and rejects another host per line", () => {
    const result = classifyManualPageLines("example.com", [
      "https://www.example.com/pricing/\nhttps://other.example/nope",
      "/docs?tab=api#section",
      "mailto:person@example.com",
      "",
    ]);

    expect(result.paths).toEqual(["/pricing", "/docs?tab=api"]);
    expect(result.rejected).toEqual([
      { line: 2, reason: "This URL is on another site.", value: "https://other.example/nope" },
      {
        line: 4,
        reason: "Enter a URL or a path on this site.",
        value: "mailto:person@example.com",
      },
    ]);
  });

  it("rejects every line when the project has no domain", () => {
    expect(classifyManualPageLines(null, ["https://example.com/pricing"]).rejected).toEqual([
      {
        line: 1,
        reason: "This project has no site domain.",
        value: "https://example.com/pricing",
      },
    ]);
  });
});
