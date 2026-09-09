// @vitest-environment node
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOnlyDemoPlugin } from "./auth-plugin";

const identity = vi.hoisted(() => vi.fn());
vi.mock("./identity", () => ({ loadDemoIdentity: identity }));

const origin = "http://localhost:3456";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
beforeEach(() => {
  vi.stubEnv("READ_ONLY_DEMO", "1");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_PROJECT_ID", projectId);
  vi.stubEnv("DEMO_FIXED_OTP", "0");
  vi.stubEnv("ALLOW_INSECURE_FIXED_OTP", "0");
  identity.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

async function fixture() {
  const sendVerificationOTP = vi.fn();
  const auth = betterAuth({
    baseURL: origin,
    secret: "test-only-demo-auth-secret-at-least-32-characters",
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    plugins: [readOnlyDemoPlugin(), emailOTP({ sendVerificationOTP })],
    rateLimit: { enabled: false },
  });
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({
    email: "demo@example.com",
    name: "Demo",
    emailVerified: true,
  });
  identity.mockResolvedValue(user);
  const request = (path: string, body: object, requestOrigin = origin) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: requestOrigin },
        body: JSON.stringify(body),
      }),
    );
  return { auth, request, sendVerificationOTP, user };
}

describe("public demo authentication boundary", () => {
  it("creates independent sessions for the single identity, without consuming OTPs or sending mail", async () => {
    const { auth, request, sendVerificationOTP } = await fixture();
    const responses = await Promise.all([
      request("/demo/sign-in", { code: "000000" }),
      request("/demo/sign-in", { code: "000000" }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ url: `/app/${projectId}/dashboard` });
      expect(response.headers.get("set-cookie")).toContain("session_token");
    }
    expect(responses[0].headers.get("set-cookie")).not.toBe(responses[1].headers.get("set-cookie"));
    const cookie = responses[0].headers.get("set-cookie")?.split(";")[0] ?? "";
    expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.email).toBe(
      "demo@example.com",
    );
    expect(sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("rejects arbitrary addresses, wrong codes, cross-origin access, and identity drift", async () => {
    const { request } = await fixture();
    expect(
      (await request("/demo/sign-in", { code: "000000", email: "other@example.com" })).status,
    ).toBe(400);
    expect((await request("/demo/sign-in", { code: "123456" })).status).toBe(400);
    expect(
      (await request("/demo/sign-in", { code: "000000" }, "https://outside.example.com")).status,
    ).toBe(403);
    identity.mockResolvedValue(null);
    expect((await request("/demo/sign-in", { code: "000000" })).status).toBe(503);
  });

  it("blocks standard OTP, account and session-management routes before their handlers", async () => {
    const { request, sendVerificationOTP } = await fixture();
    for (const path of [
      "/email-otp/send-verification-otp",
      "/sign-in/email-otp",
      "/update-user",
      "/revoke-sessions",
      "/delete-user",
    ]) {
      const response = await request(path, {
        email: "demo@example.com",
        type: "sign-in",
        otp: "000000",
        name: "Changed",
      });
      expect(response.status, path).toBe(403);
    }
    expect(sendVerificationOTP).not.toHaveBeenCalled();
  });

  it("does not expose demo login on an ordinary deployment", async () => {
    const { request } = await fixture();
    vi.stubEnv("READ_ONLY_DEMO", "0");
    expect((await request("/demo/sign-in", { code: "000000" })).status).toBe(404);
  });
});
