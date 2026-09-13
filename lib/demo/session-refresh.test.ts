// @vitest-environment node

import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;
const origin = "http://localhost:3456";

async function sessionFixture(disableSessionRefresh: boolean) {
  let otp = "";
  const auth = betterAuth({
    baseURL: origin,
    rateLimit: { enabled: false },
    secret: "test-only-demo-auth-secret-at-least-32-characters",
    session: {
      disableSessionRefresh,
      expiresIn: SESSION_TTL_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    plugins: [
      emailOTP({
        async sendVerificationOTP({ otp: code }) {
          otp = code;
        },
      }),
    ],
  });
  const email = disableSessionRefresh ? "viewer@example.com" : "owner@example.com";
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
  const completion = await auth.api.signInEmailOTP({
    body: { email, name: "Demo user", otp },
    returnHeaders: true,
  });
  const cookie = completion.headers.get("set-cookie")?.split(";")[0] ?? "";
  const active = await auth.api.getSession({ headers: new Headers({ cookie }) });
  if (!active) throw new Error("Expected Better Auth to create a session.");

  const remainingSeconds = disableSessionRefresh
    ? 2 * 60 * 60
    : SESSION_TTL_SECONDS - SESSION_UPDATE_AGE_SECONDS - 1;
  const initialExpiry = new Date(Date.now() + remainingSeconds * 1000);
  const context = await auth.$context;
  await context.internalAdapter.updateSession(active.session.token, { expiresAt: initialExpiry });
  return { active, auth, context, cookie, initialExpiry };
}

describe("Better Auth session refresh", () => {
  it("refreshes a normal thirty-day session after its update age", async () => {
    const { active, auth, context, cookie, initialExpiry } = await sessionFixture(false);

    await auth.api.getSession({ headers: new Headers({ cookie }) });
    await auth.api.getSession({ headers: new Headers({ cookie }) });

    const persisted = await context.internalAdapter.findSession(active.session.token);
    expect(persisted?.session.expiresAt.valueOf()).toBeGreaterThan(initialExpiry.valueOf());
  });

  it("does not extend an editable Viewer two-hour session across repeated reads", async () => {
    const { active, auth, context, cookie, initialExpiry } = await sessionFixture(true);

    await auth.api.getSession({ headers: new Headers({ cookie }) });
    await auth.api.getSession({ headers: new Headers({ cookie }) });

    const persisted = await context.internalAdapter.findSession(active.session.token);
    expect(persisted?.session.expiresAt).toEqual(initialExpiry);
  });
});
