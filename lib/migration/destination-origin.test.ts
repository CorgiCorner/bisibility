import { afterEach, describe, expect, it, vi } from "vitest";
import { migrationDestinationOrigin } from "./destination-origin";

function headersWithHost(host: string) {
  return new Headers({ host });
}

describe("migrationDestinationOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the request host even when SITE_URL is a public origin", () => {
    vi.stubEnv("SITE_URL", "https://bisibility.com");
    vi.stubEnv("NODE_ENV", "development");

    expect(migrationDestinationOrigin(headersWithHost("localhost:3000"), "self-host")).toBe(
      "http://localhost:3000",
    );
  });

  it("keeps the configured origin on Cloud even when the request host is loopback", () => {
    vi.stubEnv("SITE_URL", "https://rank.example.com");
    vi.stubEnv("NODE_ENV", "development");

    expect(migrationDestinationOrigin(headersWithHost("localhost:3000"), "cloud")).toBe(
      "https://rank.example.com",
    );
  });

  it("falls back to SITE_URL when the request has no host", () => {
    vi.stubEnv("SITE_URL", "https://rank.example.com");
    vi.stubEnv("NODE_ENV", "development");

    expect(migrationDestinationOrigin(new Headers(), "self-host")).toBe("https://rank.example.com");
  });
});
