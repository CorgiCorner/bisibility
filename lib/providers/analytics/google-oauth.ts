import "server-only";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { prisma } from "@/lib/db/prisma";
import { GoogleOAuthInstallError } from "@/lib/integrations/google-oauth-failure";
import { decryptProviderCredentials, decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  exchangeGoogleCode,
  GOOGLE_AUTHORIZE_URL,
  type GoogleProviderId,
  googleAnalyticsScopes,
  googleClientId,
  googleRedirectUri,
} from "./google-client";
import { storePendingGoogleOAuth } from "./google-oauth-pending";
import { normalizeGa4PropertyId, normalizeGscProperty } from "./property-id";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
/** Reuse an in-flight state only while at least this much of its TTL is left. */
export const GOOGLE_OAUTH_STATE_REUSE_FLOOR_MS = GOOGLE_OAUTH_STATE_TTL_MS / 2;

const idSchema = z.string().trim().min(1).max(120);
const returnPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\"));

const googleStateSchema = z
  .object({
    actorId: idSchema,
    issuedAt: z.number().int(),
    projectId: idSchema,
    property: z.string().trim().max(300).default(""),
    provider: z.enum(["gsc", "ga4"]),
    redirectUri: z.url(),
    returnPath: returnPathSchema,
  })
  .superRefine((state, context) => {
    const result = state.property
      ? state.provider === "ga4"
        ? normalizeGa4PropertyId(state.property)
        : normalizeGscProperty(state.property)
      : null;
    if (result && !result.ok) {
      context.addIssue({
        code: "custom",
        message: result.error.message,
        path: ["property"],
      });
    }
  });

type GoogleState = z.infer<typeof googleStateSchema>;

export function createGoogleInstallState(input: Omit<GoogleState, "issuedAt">, now = new Date()) {
  const state = googleStateSchema.parse({ ...input, issuedAt: now.getTime() });
  return encryptSecret(JSON.stringify(state));
}

function parseGoogleInstallState(raw: string | null): GoogleState {
  if (!raw) {
    throw new Error("Google OAuth state is missing.");
  }
  return googleStateSchema.parse(JSON.parse(decryptSecret(raw)));
}

function stateRemainingMs(state: GoogleState, now = new Date()) {
  return state.issuedAt + GOOGLE_OAUTH_STATE_TTL_MS - now.getTime();
}

function readGoogleInstallState(raw: string | null, now = new Date()): GoogleState {
  const state = parseGoogleInstallState(raw);
  if (stateRemainingMs(state, now) <= 0) {
    throw new GoogleOAuthInstallError("state_expired", "Google OAuth state has expired.", {
      projectId: state.projectId,
      provider: state.provider,
      returnPath: state.returnPath,
    });
  }
  return state;
}

/**
 * Context for an error redirect, never authorization - so the TTL is deliberately not checked.
 * An expired state still names the surface the user started from, and that is exactly when they
 * most need to land back on it and read why the connection failed. The return target stays
 * app-relative because the state schema validated it before the state was ever encrypted.
 */
export function googleOAuthReturnContextFromState(raw: string | null) {
  try {
    const state = parseGoogleInstallState(raw);
    return {
      projectId: state.projectId,
      provider: state.provider,
      returnPath: state.returnPath,
    };
  } catch {
    return null;
  }
}

function googleAuthorizeUrl(input: {
  provider: GoogleProviderId;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleAnalyticsScopes(input.provider).join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", input.state);
  return url.toString();
}

type GoogleInstallInput = {
  actorId: string;
  origin: string;
  projectId: string;
  property?: string;
  provider: GoogleProviderId;
  returnPath: string;
};

export function createGoogleInstallUrl(input: GoogleInstallInput) {
  const redirectUri = googleRedirectUri(input.origin);
  return googleAuthorizeUrl({
    provider: input.provider,
    redirectUri,
    state: createGoogleInstallState({
      actorId: input.actorId,
      projectId: input.projectId,
      property: input.property ?? "",
      provider: input.provider,
      redirectUri,
      returnPath: input.returnPath,
    }),
  });
}

/**
 * Reissuing state on every install hit invalidates the flow the user is already completing:
 * a prefetch or a double click during consent overwrites the cookie, so the callback sees a
 * cookie that no longer equals the state Google returns. When the browser still carries a live
 * state cookie for the exact same install (actor, project, provider, property, return target and
 * redirect URI), send the user back to Google with that state instead of minting a new one.
 *
 * The CSRF binding is unchanged: the cookie still has to equal the state that comes back, and
 * TTL still runs from the original `issuedAt`, so reuse cannot extend a flow's lifetime. That
 * last property is also why reuse stops well before expiry: handing back a state with a minute
 * left would turn a retry that used to work into a guaranteed `state_expired`, because the user
 * still has to get through Google's account picker and consent screen.
 */
export function reusableGoogleInstallUrl(
  input: GoogleInstallInput & { now?: Date; state: string | null },
) {
  if (!input.state) return null;
  let state: GoogleState;
  try {
    state = readGoogleInstallState(input.state, input.now);
  } catch {
    return null;
  }
  if (stateRemainingMs(state, input.now) < GOOGLE_OAUTH_STATE_REUSE_FLOOR_MS) return null;
  const matches =
    state.actorId === input.actorId &&
    state.projectId === input.projectId &&
    state.provider === input.provider &&
    state.property === (input.property ?? "") &&
    state.returnPath === input.returnPath &&
    state.redirectUri === googleRedirectUri(input.origin);
  if (!matches) return null;
  return googleAuthorizeUrl({
    provider: state.provider,
    redirectUri: state.redirectUri,
    state: input.state,
  });
}

function pendingProperty(state: GoogleState) {
  if (!state.property) return undefined;
  const result =
    state.provider === "ga4"
      ? normalizeGa4PropertyId(state.property)
      : normalizeGscProperty(state.property);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

// Store the refresh token in `apiKey` and property in `login` within the existing
// encrypted credentials JSON so adapters use the normal resolution path.
export async function completeGoogleOAuthInstall(input: {
  code: string | null;
  now?: Date;
  state: string | null;
}) {
  const code = input.code?.trim();
  if (!code) {
    throw new Error("Google OAuth code is missing.");
  }

  const state = readGoogleInstallState(input.state, input.now);
  const failureContext = {
    projectId: state.projectId,
    provider: state.provider,
    returnPath: state.returnPath,
  };

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== input.state) {
    throw new GoogleOAuthInstallError(
      "state_cookie_mismatch",
      "Google OAuth state did not match the initiating session.",
      failureContext,
    );
  }
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);

  const actor = await getActionActor();
  if (actor.id !== state.actorId) {
    throw new GoogleOAuthInstallError(
      "actor_mismatch",
      "Google OAuth installer does not match the current session.",
      failureContext,
    );
  }
  const project = await requireProjectScope(actor, "manage", state.projectId, {
    type: "provider_connection",
  });

  // Resolved before the exchange so an unusable property is a validation failure, not a store one.
  const property = state.property ? pendingProperty(state) : undefined;
  const where = { projectId_provider: { projectId: project.id, provider: state.provider } };
  const before = await prisma.providerConnection.findUnique({ where });
  let exchanged: Awaited<ReturnType<typeof exchangeGoogleCode>>;
  try {
    exchanged = await exchangeGoogleCode(code, state.redirectUri);
  } catch (error) {
    throw new GoogleOAuthInstallError(
      "token_exchange",
      error instanceof Error ? error.message : "Google token exchange failed.",
      failureContext,
    );
  }
  // A refresh token already stored for this project/provider is the fallback when Google does
  // not send a new one; a decryption failure of that stored blob is its own classified reason.
  let refreshToken = exchanged.refreshToken;
  if (refreshToken == null) {
    try {
      refreshToken = decryptProviderCredentials(before?.credentialsEncrypted).apiKey ?? null;
    } catch (error) {
      throw new GoogleOAuthInstallError(
        "credentials_decrypt",
        error instanceof Error ? error.message : "Stored Google credentials could not be read.",
        failureContext,
      );
    }
  }
  if (!refreshToken) {
    throw new GoogleOAuthInstallError(
      "no_refresh_token",
      "Google did not return a refresh token. Remove app access and reconnect.",
      failureContext,
    );
  }
  try {
    await storePendingGoogleOAuth({
      actorId: actor.id,
      projectId: project.id,
      ...(property ? { property } : {}),
      provider: state.provider,
      refreshToken,
    });
  } catch (error) {
    throw new GoogleOAuthInstallError(
      "store_failed",
      error instanceof Error ? error.message : "Storing the Google connection failed.",
      failureContext,
    );
  }

  return {
    projectId: project.id,
    provider: state.provider,
    returnPath: state.returnPath,
    status: "select" as const,
  };
}
