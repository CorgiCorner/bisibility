import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientIpForRequest, resetRateLimitStateForTests } from "./ratelimit";

function requestWithHeaders(headers: HeadersInit = {}) {
  return new Request("https://example.test/api/v1/openapi.json", { headers });
}

describe("API rate limiting", () => {
  beforeEach(() => {
    resetRateLimitStateForTests();
    process.env.REDIS_URL = "";
    process.env.BISIBILITY_CLIENT_IP_HEADER = "";
    process.env.BISIBILITY_CLIENT_IP_XFF_DEPTH = "";
    process.env.BISIBILITY_API_ANON_RATE_LIMIT_PER_MINUTE = "1";
  });

  it("falls back to in-memory limiting when Redis env is absent", async () => {
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-real-ip";
    const req = requestWithHeaders({ "x-real-ip": "198.51.100.10" });

    const first = await checkRateLimit(req, { kind: "anonymous" });
    const second = await checkRateLimit(req, { kind: "anonymous" });

    expect(first.success).toBe(true);
    expect(second.success).toBe(false);
    expect(second.headers.get("RateLimit-Limit")).toBe("1");
    expect(second.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(second.headers.get("Retry-After")).toBeTruthy();
  });

  it("keeps separate buckets per resolved IP", async () => {
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-real-ip";

    const first = await checkRateLimit(requestWithHeaders({ "x-real-ip": "198.51.100.1" }), {
      kind: "anonymous",
    });
    const other = await checkRateLimit(requestWithHeaders({ "x-real-ip": "198.51.100.2" }), {
      kind: "anonymous",
    });

    expect(first.success).toBe(true);
    expect(other.success).toBe(true);
  });

  it("shares one bucket when no client IP can be resolved", async () => {
    const first = await checkRateLimit(requestWithHeaders({ "x-real-ip": "198.51.100.1" }), {
      kind: "anonymous",
    });
    const other = await checkRateLimit(requestWithHeaders({ "x-real-ip": "198.51.100.2" }), {
      kind: "anonymous",
    });

    expect(first.success).toBe(true);
    expect(other.success).toBe(false);
  });

  it("does not trust forwarded headers unless one is configured", () => {
    const req = requestWithHeaders({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });

    expect(clientIpForRequest(req)).toBeNull();

    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";

    expect(clientIpForRequest(req)).toBe("10.0.0.1");
  });
});
