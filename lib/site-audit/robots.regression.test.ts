import { describe, expect, it } from "vitest";
import { robotsDisallows } from "./robots";

describe("robots product-token groups", () => {
  it("uses matching agent rules without retaining wildcard disallows", () => {
    const robots = "User-agent: *\nDisallow: /\n\nUser-agent: BisibilitySiteAudit\nAllow: /allowed";
    expect(robotsDisallows(robots, "/other")).toBe(false);
  });

  it("does not let a wildcard allow override matching agent restrictions", () => {
    const robots =
      "User-agent: *\nAllow: /private/allowed\n\nUser-agent: BisibilitySiteAudit\nDisallow: /private";
    expect(robotsDisallows(robots, "/private/allowed")).toBe(true);
  });

  it("combines repeated matching agent groups case-insensitively", () => {
    const robots =
      "User-agent: bisibilitysiteaudit\nDisallow: /one\nUser-agent: OtherBot\nDisallow: /other\nUser-agent: BISIBILITYSITEAUDIT\nDisallow: /two";
    expect(robotsDisallows(robots, "/one")).toBe(true);
    expect(robotsDisallows(robots, "/two")).toBe(true);
    expect(robotsDisallows(robots, "/other")).toBe(false);
  });

  it("uses wildcard rules only when no specific agent group exists", () => {
    expect(
      robotsDisallows(
        "User-agent: *\nDisallow: /private\nUser-agent: OtherBot\nAllow: /",
        "/private",
      ),
    ).toBe(true);
    expect(
      robotsDisallows("User-agent: *\nDisallow: /\nUser-agent: BisibilitySiteAudit", "/private"),
    ).toBe(false);
  });
});
