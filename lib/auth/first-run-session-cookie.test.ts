// @vitest-environment node

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

describe("first-run email OTP completion", () => {
  it("returns a session cookie when the creator signs in", async () => {
    let verificationCode = "";
    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      rateLimit: { enabled: false },
      secret: "test-secret-at-least-32-characters-long",
      plugins: [
        emailOTP({
          async sendVerificationOTP({ otp }) {
            verificationCode = otp;
          },
        }),
        nextCookies(),
      ],
    });

    await auth.api.sendVerificationOTP({
      body: { email: "creator@example.com", type: "sign-in" },
    });
    const completion = await auth.api.signInEmailOTP({
      body: {
        email: "creator@example.com",
        name: "Creator",
        otp: verificationCode,
      },
      returnHeaders: true,
    });

    expect(completion.response.user.email).toBe("creator@example.com");
    expect(completion.headers.get("set-cookie")).toContain("better-auth.session_token=");
  });
});
