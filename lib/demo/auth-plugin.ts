import "server-only";

import { appPath } from "@/lib/routing/app-path";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  formCsrfMiddleware,
} from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { demoAuthRequestAllowed } from "./auth-policy";
import { DEMO_ENTRY_CODE, readOnlyDemoConfig } from "./config";
import { loadDemoIdentity } from "./identity";

export function readOnlyDemoPlugin(): BetterAuthPlugin {
  return {
    id: "read-only-demo",
    rateLimit: [{ pathMatcher: (path) => path === "/demo/sign-in", window: 60, max: 10 }],
    hooks: {
      before: [
        {
          matcher: () => Boolean(readOnlyDemoConfig()),
          handler: createAuthMiddleware(async (ctx) => {
            if (!demoAuthRequestAllowed(ctx.path ?? "", ctx.method ?? "GET")) {
              throw new APIError("FORBIDDEN", {
                message: "This authentication action is unavailable in the demo.",
              });
            }
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
          const config = readOnlyDemoConfig();
          if (!config) throw new APIError("NOT_FOUND", { message: "Demo is not enabled." });
          const identity = await loadDemoIdentity();
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
