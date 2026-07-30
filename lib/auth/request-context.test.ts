import { afterEach, describe, expect, it, vi } from "vitest";
import { auditRequestContextFromHeaders, hashIpAddress, maskIpAddress } from "./request-context";

vi.mock("server-only", () => ({}));

describe("audit request context", () => {
  afterEach(() => {
    process.env.APP_VERSION = undefined;
    process.env.AUDIT_IP_HMAC_SECRET = undefined;
  });

  it("masks IPv4 addresses to /24", () => {
    expect(maskIpAddress("192.168.1.42")).toBe("192.168.1.0");
  });

  it("masks IPv6 addresses to /48", () => {
    expect(maskIpAddress("2001:0db8:abcd:1234:5678:9abc:def0:1111")).toBe("2001:db8:abcd::");
  });

  it("hashes IPs deterministically with HMAC-SHA256", () => {
    const first = hashIpAddress("203.0.113.7", "audit-secret");
    const second = hashIpAddress("203.0.113.7", "audit-secret");

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(hashIpAddress("203.0.113.8", "audit-secret")).not.toBe(first);
  });

  it("derives context without retaining the raw IP", () => {
    process.env.APP_VERSION = "1.2.3";
    process.env.AUDIT_IP_HMAC_SECRET = "audit-secret";
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    const context = auditRequestContextFromHeaders(
      new Headers({
        "user-agent": "Vitest",
        "x-correlation-id": "corr_123",
        "x-forwarded-for": "10.0.0.1, 203.0.113.8",
      }),
    );

    expect(context).toMatchObject({
      appVersion: "1.2.3",
      correlationId: "corr_123",
      sourceIpMasked: "203.0.113.0",
      userAgent: "Vitest",
    });
    expect(context.sourceIpHash).toBe(hashIpAddress("203.0.113.8", "audit-secret"));
    expect(JSON.stringify(context)).not.toContain("203.0.113.8");
  });

  it("records no IP when no trusted header is configured", () => {
    process.env.AUDIT_IP_HMAC_SECRET = "audit-secret";
    process.env.BISIBILITY_CLIENT_IP_HEADER = "";

    const context = auditRequestContextFromHeaders(
      new Headers({ "x-forwarded-for": "203.0.113.8" }),
    );

    expect(context.sourceIpHash).toBeNull();
    expect(context.sourceIpMasked).toBeNull();
  });
});
