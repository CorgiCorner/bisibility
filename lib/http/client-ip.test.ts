import { beforeEach, describe, expect, it, vi } from "vitest";
import { normalizeIp, resetClientIpWarningForTests, resolveClientIp } from "./client-ip";

function headers(init: Record<string, string>) {
  return new Headers(init);
}

describe("normalizeIp", () => {
  it("accepts plain, ported, bracketed and zoned addresses", () => {
    expect(normalizeIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeIp("203.0.113.7:443")).toBe("203.0.113.7");
    expect(normalizeIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80::1");
  });

  it("rejects anything that is not an address", () => {
    expect(normalizeIp("not-an-ip")).toBeNull();
    expect(normalizeIp("")).toBeNull();
    expect(normalizeIp(null)).toBeNull();
  });
});

describe("resolveClientIp", () => {
  const env: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of Object.keys(env)) {
      delete env[key];
    }
    resetClientIpWarningForTests();
  });

  it("returns null when no header is configured", () => {
    expect(resolveClientIp(headers({ "x-forwarded-for": "203.0.113.7" }), { env })).toBeNull();
  });

  it("reads an overwritten single-value header", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "X-Real-IP";
    expect(resolveClientIp(headers({ "x-real-ip": "203.0.113.7" }), { env })).toBe("203.0.113.7");
  });

  it("ignores other headers once one is configured", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-real-ip";
    expect(resolveClientIp(headers({ "x-forwarded-for": "203.0.113.7" }), { env })).toBeNull();
  });

  it("takes the last x-forwarded-for entry for a single appending edge", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    const value = resolveClientIp(headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" }), { env });
    expect(value).toBe("203.0.113.7");
  });

  it("cannot be shifted by client-supplied prefixes", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    const spoofed = "198.51.100.9, 198.51.100.10, 203.0.113.7";
    expect(resolveClientIp(headers({ "x-forwarded-for": spoofed }), { env })).toBe("203.0.113.7");
  });

  it("keeps the trusted tail when the client pads the header past the length cap", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    const padding = Array.from({ length: 200 }, () => "198.51.100.9").join(", ");
    const value = resolveClientIp(headers({ "x-forwarded-for": `${padding}, 203.0.113.7` }), {
      env,
    });
    expect(value).toBe("203.0.113.7");
  });

  it("honours a deeper trusted chain", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    env.BISIBILITY_CLIENT_IP_XFF_DEPTH = "2";
    const value = resolveClientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }), { env });
    expect(value).toBe("203.0.113.7");
  });

  it("falls back to depth 1 for unusable depth values", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    for (const depth of ["0", "-3", "abc", "99"]) {
      env.BISIBILITY_CLIENT_IP_XFF_DEPTH = depth;
      const value = resolveClientIp(headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" }), {
        env,
      });
      expect(value).toBe("203.0.113.7");
    }
  });

  it("returns null when the chain is shorter than the configured depth", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";
    env.BISIBILITY_CLIENT_IP_XFF_DEPTH = "3";
    expect(resolveClientIp(headers({ "x-forwarded-for": "203.0.113.7" }), { env })).toBeNull();
  });

  it("returns null for a non-address value instead of passing it through", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-real-ip";
    expect(resolveClientIp(headers({ "x-real-ip": "'; DROP" }), { env })).toBeNull();
  });

  it("warns once in production when the configured header is missing", () => {
    env.BISIBILITY_CLIENT_IP_HEADER = "x-real-ip";
    env.NODE_ENV = "production";
    const warn = vi.fn();

    resolveClientIp(headers({}), { env, warn });
    resolveClientIp(headers({}), { env, warn });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("x-real-ip");
  });
});
