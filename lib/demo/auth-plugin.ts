import "server-only";

import { appPath } from "@/lib/routing/app-path";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  formCsrfMiddleware,
  getAuthoritativeSessionFromCtx,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { demoAuthRequestAllowed, editableDemoAuthRequestAllowed } from "./auth-policy";
import { DEMO_ENTRY_CODE, readDemoConfig } from "./config";
import { loadDemoIdentity, loadEditableDemoOwner, loadEditableDemoViewer } from "./identity";

const OWNER_AUTH_ENDPOINTS = new Set([
  "/email-otp/request-email-change",
  "/email-otp/change-email",
  "/email-otp/verify-email",
]);

function forbidden() {
  return new APIError("FORBIDDEN", {
    message: "This authentication action is unavailable in the demo.",
  });
}

function normalizedEmail(body: unknown) {
  const email = (body as { email?: unknown } | null)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

type DemoAuthContext = Parameters<typeof getAuthoritativeSessionFromCtx>[0];

async function requireEditableOwner(ctx: DemoAuthContext) {
  const owner = await loadEditableDemoOwner();
  const session = await getAuthoritativeSessionFromCtx(ctx);
  if (!owner || session?.user.id !== owner.id) throw forbidden();
  return owner;
}

async function enforceEditableDemoRequest(ctx: DemoAuthContext) {
  const path = ctx.path ?? "";
  if (!editableDemoAuthRequestAllowed(path, ctx.method ?? "GET")) throw forbidden();
  if (path === "/demo/sign-in" || path === "/get-session" || path === "/sign-out") return;
  if (path === "/two-factor/verify-totp" || path === "/two-factor/verify-backup-code") return;
  if (path === "/sign-in/email-otp") {
    const owner = await loadEditableDemoOwner();
    if (!owner || normalizedEmail(ctx.body) !== owner.email.toLowerCase()) {
      throw new APIError("BAD_REQUEST", { message: "Invalid OTP" });
    }
    return;
  }
  if (path === "/email-otp/send-verification-otp") {
    const type = (ctx.body as { type?: unknown } | null)?.type;
    const owner = await loadEditableDemoOwner();
    if (!owner || normalizedEmail(ctx.body) !== owner.email.toLowerCase()) {
      if (type === "sign-in") {
        return new Response(JSON.stringify({ status: true }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }
      throw forbidden();
    }
    if (type === "sign-in") return;
    if (type === "email-verification") {
      await requireEditableOwner(ctx);
      return;
    }
    throw forbidden();
  }
  if (OWNER_AUTH_ENDPOINTS.has(path)) {
    const owner = await requireEditableOwner(ctx);
    if (
      path === "/email-otp/verify-email" &&
      normalizedEmail(ctx.body) !== owner.email.toLowerCase()
    ) {
      throw forbidden();
    }
  }
}

export function readOnlyDemoPlugin(): BetterAuthPlugin {
  return {
    id: "read-only-demo",
    rateLimit: [{ pathMatcher: (path) => path === "/demo/sign-in", window: 60, max: 10 }],
    hooks: {
      before: [
        {
          matcher: () => readDemoConfig().kind !== "disabled",
          handler: createAuthMiddleware(async (ctx) => {
            const config = readDemoConfig();
            if (config.kind === "legacy-read-only") {
              if (!demoAuthRequestAllowed(ctx.path ?? "", ctx.method ?? "GET")) throw forbidden();
              return;
            }
            return enforceEditableDemoRequest(ctx);
          }),
        },
      ],
    },
    endpoints: {
      signInReadOnlyDemo: createAuthEndpoint(
        "/demo/sign-in",
        {
          method: "POST",
          use: [formCsrfMiddleware],
          body: z.object({ code: z.literal(DEMO_ENTRY_CODE) }).strict(),
        },
        async (ctx) => {
          const config = readDemoConfig();
          if (config.kind === "disabled") {
            throw new APIError("NOT_FOUND", { message: "Demo is not enabled." });
          }
          const identity =
            config.kind === "legacy-read-only"
              ? await loadDemoIdentity()
              : await loadEditableDemoViewer();
          if (!identity)
            throw new APIError("SERVICE_UNAVAILABLE", { message: "Demo data is not ready yet." });
          const user = await ctx.context.internalAdapter.findUserById(identity.id);
          if (!user) throw new APIError("SERVICE_UNAVAILABLE", { message: "Demo is unavailable." });
          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session)
            throw new APIError("SERVICE_UNAVAILABLE", { message: "Demo is unavailable." });
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ url: appPath(config.projectPublicId, "dashboard") });
        },
      ),
    },
  };
}
