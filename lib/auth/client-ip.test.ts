// @vitest-environment node

import { betterAuth } from "better-auth";
import { afterEach, describe, expect, it } from "vitest";
import { AUTH_IP_ADDRESS_OPTIONS, RESOLVED_CLIENT_IP_HEADER, withAuthClientIp } from "./client-ip";

const auth = betterAuth({
  advanced: {
    ipAddress: AUTH_IP_ADDRESS_OPTIONS,
  },
  baseURL: "https://example.test",
  rateLimit: {
    customRules: {
      "/sign-in/social": { max: 1, window: 60 },
    },
    enabled: true,
  },
  secret: "test-secret-at-least-32-characters-long",
});

// The trusted edge appends the address it received from, so the client sits at
// the end of the chain and 10.0.0.2 is the proxy that forwarded the request.
function socialSignInRequest(clientIp: string) {
  return new Request("https://example.test/api/auth/sign-in/social", {
    body: JSON.stringify({
      callbackURL: "/app/settings",
      provider: "missing-provider",
    }),
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
      "x-forwarded-for": `10.0.0.2, ${clientIp}`,
    },
    method: "POST",
  });
}

describe("better-auth client IP rate limiting", () => {
  afterEach(() => {
    delete process.env.BISIBILITY_CLIENT_IP_HEADER;
    delete process.env.BISIBILITY_CLIENT_IP_XFF_DEPTH;
  });

  it("keeps two forwarded client addresses in independent buckets", async () => {
    process.env.BISIBILITY_CLIENT_IP_HEADER = "x-forwarded-for";

    const firstClientAttempt = await auth.handler(
      withAuthClientIp(socialSignInRequest("198.51.100.31")),
    );
    const repeatedClientAttempt = await auth.handler(
      withAuthClientIp(socialSignInRequest("198.51.100.31")),
    );
    const secondClientAttempt = await auth.handler(
      withAuthClientIp(socialSignInRequest("198.51.100.32")),
    );

    expect(firstClientAttempt.status).not.toBe(429);
    expect(repeatedClientAttempt.status).toBe(429);
    expect(secondClientAttempt.status).not.toBe(429);
  });

  it("strips a client-supplied resolved-IP header when nothing can be trusted", () => {
    const request = new Request("https://example.test/api/auth/sign-in/social", {
      headers: { [RESOLVED_CLIENT_IP_HEADER]: "203.0.113.99" },
      method: "POST",
    });

    expect(withAuthClientIp(request).headers.get(RESOLVED_CLIENT_IP_HEADER)).toBeNull();
  });
});
