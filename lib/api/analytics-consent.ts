import "server-only";

import {
  readAccountAnalyticsConsent,
  saveAccountAnalyticsConsent,
} from "@/lib/analytics/account-consent";
import { parseClientAttribution } from "@/lib/analytics/client-attribution";
import { FIRST_PARTY_OAUTH_CLIENT_ID } from "@/lib/auth/oauth-policy";
import { z } from "zod";
import type { PersonalApiContext } from "./context";
import { ApiForbiddenError } from "./errors";
import { resourceResponse } from "./responses";
import { parseApiInput, readJsonBody } from "./surface";

const consentUpdate = z.object({ analytics: z.boolean() }).strict();

export async function getAnalyticsConsent(ctx: PersonalApiContext) {
  const consent = await readAccountAnalyticsConsent(ctx.auth.user.id);
  ctx.headers.set("Cache-Control", "private, no-store");
  return resourceResponse(consent, { headers: ctx.headers });
}

export async function updateAnalyticsConsent(ctx: PersonalApiContext) {
  if (ctx.auth.oauthClientId && ctx.auth.oauthClientId !== FIRST_PARTY_OAUTH_CLIENT_ID)
    throw new ApiForbiddenError("Account consent requires a personal token or first-party client.");
  const input = parseApiInput(consentUpdate, await readJsonBody(ctx));
  const { client } = parseClientAttribution(ctx.req.headers, "personal_token");
  const consent = await saveAccountAnalyticsConsent(
    ctx.auth.user.id,
    input.analytics,
    client === "ios" ? "ios" : "api",
    new Date(),
    {
      authKind: ctx.auth.oauthClientId ? "oauth" : "personal_token",
      credentialId: ctx.auth.oauthClientId ?? ctx.auth.token.publicId ?? ctx.auth.token.id,
    },
  );
  ctx.headers.set("Cache-Control", "private, no-store");
  return resourceResponse(consent, { headers: ctx.headers });
}
