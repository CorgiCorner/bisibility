import { afterEach, describe, expect, it, vi } from "vitest";
import { keywordResearchCachedUntil } from "./cache";

vi.mock("server-only", () => ({}));

describe("keyword research cache expiry", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the server-configured TTL and the earliest source fetch", () => {
    vi.stubEnv("KEYWORD_RESEARCH_CACHE_TTL_SECONDS", "1800");

    expect(
      keywordResearchCachedUntil(["2026-07-22T10:15:00.000Z", "2026-07-22T10:00:00.000Z"]),
    ).toBe("2026-07-22T10:30:00.000Z");
  });
});
