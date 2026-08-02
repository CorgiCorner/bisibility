import { afterEach, describe, expect, it, vi } from "vitest";
import { internalProbeHeaders } from "./probe-request";

afterEach(() => vi.unstubAllEnvs());

describe("internal probe request headers", () => {
  it("adds the configured token without replacing other headers", () => {
    vi.stubEnv("INTERNAL_PROBE_TOKEN", "p".repeat(32));

    const headers = internalProbeHeaders({ accept: "application/json" });

    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("authorization")).toBe(`Bearer ${"p".repeat(32)}`);
  });

  it("leaves authorization unset when the token is disabled", () => {
    expect(internalProbeHeaders().has("authorization")).toBe(false);
  });
});
