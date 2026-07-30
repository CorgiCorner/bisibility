import "server-only";

import { getActionActor, requireProjectScope } from "@/lib/actions/_shared";
import { prisma } from "@/lib/db/prisma";
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

function readGoogleInstallState(raw: string | null, now = new Date()): GoogleState {
  if (!raw) {
    throw new Error("Google OAuth state is missing.");
  }
  const state = googleStateSchema.parse(JSON.parse(decryptSecret(raw)));
  if (now.getTime() - state.issuedAt > GOOGLE_OAUTH_STATE_TTL_MS) {
    throw new Error("Google OAuth state has expired.");
  }
  return state;
}

export function googleOAuthReturnContextFromState(raw: string | null, now = new Date()) {
  try {
    const state = readGoogleInstallState(raw, now);
    return {
      projectId: state.projectId,
      provider: state.provider,
      returnPath: state.returnPath,
    };
  } catch {
    return null;
  }
}

export function createGoogleInstallUrl(input: {
  actorId: string;
  origin: string;
  projectId: string;
  property?: string;
  provider: GoogleProviderId;
  returnPath: string;
}) {
  const redirectUri = googleRedirectUri(input.origin);
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", googleClientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", googleAnalyticsScopes(input.provider).join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set(
    "state",
    createGoogleInstallState({
      actorId: input.actorId,
      projectId: input.projectId,
      property: input.property ?? "",
      provider: input.provider,
      redirectUri,
      returnPath: input.returnPath,
    }),
  );
  return url.toString();
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

  const cookieStore = await cookies();
  const cookieState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  if (!cookieState || cookieState !== input.state) {
    throw new Error("Google OAuth state did not match the initiating session.");
  }
  cookieStore.delete(GOOGLE_OAUTH_STATE_COOKIE);

  const actor = await getActionActor();
  if (actor.id !== state.actorId) {
    throw new Error("Google OAuth installer does not match the current session.");
  }
  const project = await requireProjectScope(actor, "manage", state.projectId, {
    type: "provider_connection",
  });

  const where = { projectId_provider: { projectId: project.id, provider: state.provider } };
  const before = await prisma.providerConnection.findUnique({ where });
  const exchanged = await exchangeGoogleCode(code, state.redirectUri);
  const refreshToken =
    exchanged.refreshToken ??
    decryptProviderCredentials(before?.credentialsEncrypted).apiKey ??
    null;
  if (!refreshToken) {
    throw new Error("Google did not return a refresh token. Remove app access and reconnect.");
  }
  await storePendingGoogleOAuth({
    actorId: actor.id,
    projectId: project.id,
    ...(state.property ? { property: pendingProperty(state) } : {}),
    provider: state.provider,
    refreshToken,
  });

  return {
    projectId: project.id,
    provider: state.provider,
    returnPath: state.returnPath,
    status: "select" as const,
  };
}
