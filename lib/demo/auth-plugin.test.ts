// @vitest-environment node
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOnlyDemoPlugin } from "./auth-plugin";

const identities = vi.hoisted(() => ({ owner: vi.fn(), viewer: vi.fn(), legacy: vi.fn() }));
vi.mock("./identity", () => ({
  loadDemoIdentity: identities.legacy,
  loadEditableDemoOwner: identities.owner,
  loadEditableDemoViewer: identities.viewer,
}));

const origin = "http://localhost:3456";
const projectId = "prj_abcdefghijklmnopqrstuvwx";
beforeEach(() => {
  vi.stubEnv("READ_ONLY_DEMO", "1");
  vi.stubEnv("DEMO_USER_ID", "usr_abcdefghijklmnopqrstuvwx");
  vi.stubEnv("DEMO_PROJECT_ID", projectId);
  vi.stubEnv("DEMO_FIXED_OTP", "0");
  vi.stubEnv("ALLOW_INSECURE_FIXED_OTP", "0");
  identities.legacy.mockReset();
  identities.owner.mockReset();
  identities.viewer.mockReset();
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
  identities.legacy.mockResolvedValue(user);
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
    identities.legacy.mockResolvedValue(null);
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

  it("selects only the viewer publicly, while permitting the current owner email OTP", async () => {
    vi.stubEnv("READ_ONLY_DEMO", "0");
    vi.stubEnv("DEMO_MODE", "editable");
    vi.stubEnv("DEMO_OWNER_ID", "usr_zyxwvutsrqponmlkjihgfedc");
    const sendVerificationOTP = vi.fn();
    const auth = betterAuth({
      baseURL: origin,
      secret: "test-only-demo-auth-secret-at-least-32-characters",
      advanced: { disableOriginCheck: false, disableCSRFCheck: false },
      plugins: [readOnlyDemoPlugin(), emailOTP({ sendVerificationOTP })],
      rateLimit: { enabled: false },
    });
    const context = await auth.$context;
    const owner = await context.internalAdapter.createUser({
      email: "owner@example.com",
      name: "Owner",
      emailVerified: true,
    });
    const viewer = await context.internalAdapter.createUser({
      email: "viewer@example.com",
      name: "Viewer",
      emailVerified: true,
    });
    identities.owner.mockResolvedValue(owner);
    identities.viewer.mockResolvedValue(viewer);
    const request = (path: string, body: object) =>
      auth.handler(
        new Request(`${origin}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify(body),
        }),
      );

    const entry = await request("/demo/sign-in", { code: "000000" });
    expect(entry.status).toBe(200);
    const entryCookie = entry.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(
      (await auth.api.getSession({ headers: new Headers({ cookie: entryCookie }) }))?.user.email,
    ).toBe("viewer@example.com");
    expect(sendVerificationOTP).not.toHaveBeenCalled();

    expect(
      (
        await request("/email-otp/send-verification-otp", {
          email: "OWNER@example.com",
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    expect(sendVerificationOTP).toHaveBeenCalledOnce();
    expect(
      (
        await request("/email-otp/send-verification-otp", {
          email: "viewer@example.com",
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/email-otp/send-verification-otp", {
          email: "other@example.com",
          type: "sign-in",
        })
      ).status,
    ).toBe(200);
    expect(sendVerificationOTP).toHaveBeenCalledOnce();
    expect(
      (await request("/sign-in/email-otp", { email: "other@example.com", otp: "123456" })).status,
    ).toBe(400);

    for (const path of ["/sign-up/email", "/sign-in/social", "/link-social"]) {
      expect(
        (await request(path, { email: "other@example.com", name: "Other" })).status,
        path,
      ).toBe(403);
    }
  });
});
