import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("iOS OAuth callback fallback", () => {
  it("serves a script-free page that never leaks the code through a referrer or cache", async () => {
    const response = GET();
    const body = await response.text();

    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
    expect(body).not.toMatch(/<script|<img|<link|src=|href=/i);
  });
});
