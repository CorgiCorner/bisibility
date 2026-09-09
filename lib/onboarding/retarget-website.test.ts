import { describe, expect, it } from "vitest";
import { retargetWebsiteUrl } from "./retarget-website";

describe("onboarding target URL correction", () => {
  it.each([
    ["https://old.com/docs?q=logs#install", "https://tes.co/docs?q=logs#install"],
    ["http://OLD.com:8080/a%20b", "http://tes.co:8080/a%20b"],
    ["https://other.com/docs", "https://other.com/docs"],
    ["https://www.old.com/docs", "https://www.old.com/docs"],
    ["https://old.com.evil.com/docs", "https://old.com.evil.com/docs"],
    ["/docs/logs", "/docs/logs"],
    ["ftp://old.com/file", "ftp://old.com/file"],
    [null, null],
  ])("preserves unrelated targets and URL details: %s", (input, output) => {
    expect(retargetWebsiteUrl(input, "old.com", "tes.co")).toBe(output);
  });
});
