import "server-only";

import {
  getActionActor,
  requireProjectScope,
  revalidateProviderViews,
} from "@/lib/actions/_shared";
import { verifyProviderConnectionBeforeSave } from "@/lib/api/provider-verification";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { GoogleOAuthSetup, GooglePropertySelectionResult } from "@/lib/integrations/types";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { decryptProviderCredentials, decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import {
  classifyProviderFailure,
  type ProviderFailureClass,
  ProviderHttpError,
} from "@/lib/providers/failure-class";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { queueSearchInsightsImport } from "@/lib/search-insights/sync/ensure-import";
import { firstSyncIntentOnConnect } from "@/lib/traffic/first-sync-intent-state";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { cookies } from "next/headers";
import { z } from "zod";
import { listGa4Properties, listGoogleSites, refreshGoogleAccessToken } from "./google-client";
import {
  googlePropertyFailure,
  googlePropertyFailureCopy,
  googlePropertySaveFailure,
} from "./google-failure";
import { pendingGscContext } from "./google-oauth-pending-gsc-context";
import { ga4PropertyOptions, gscPropertyOptions } from "./google-property-options";
import { normalizeGa4PropertyId } from "./property-id";

const GOOGLE_OAUTH_PENDING_COOKIE = "google_oauth_pending";
export const GOOGLE_OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;
const pendingSchema = z.object({
  accountEmail: z.string().email().max(320).optional(),
  actorId: z.string().trim().min(1).max(120),
  issuedAt: z.number().int(),
  projectId: z.string().trim().min(1).max(120),
  property: z.string().trim().max(300).default(""),
  provider: z.enum(["gsc", "ga4"]),
  refreshToken: z.string().trim().min(1),
});

type PendingGoogleOAuth = z.infer<typeof pendingSchema>;

function parsePending(raw: string | undefined, now = new Date()): PendingGoogleOAuth | null {
  if (!raw) return null;
  try {
    const pending = pendingSchema.parse(JSON.parse(decryptSecret(raw)));
    if (now.getTime() - pending.issuedAt > GOOGLE_OAUTH_PENDING_TTL_MS) return null;
    return pending;
  } catch {
    return null;
  }
}

function cookieOptions() {
  return {
    httpOnly: true,
    maxAge: Math.floor(GOOGLE_OAUTH_PENDING_TTL_MS / 1000),
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function storePendingGoogleOAuth(input: {
  accountEmail?: string;
  actorId: string;
  projectId: string;
  property?: string;
  provider: "ga4" | "gsc";
  refreshToken: string;
}) {
  const value = encryptSecret(
    JSON.stringify({
      ...input,
      issuedAt: Date.now(),
      property: input.property ?? "",
    } satisfies PendingGoogleOAuth),
  );
  (await cookies()).set(GOOGLE_OAUTH_PENDING_COOKIE, value, cookieOptions());
}

async function pendingForProject(projectId: string) {
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "manage", projectId, {
    type: "provider_connection",
  });
  const cookieStore = await cookies();
  const pending = parsePending(cookieStore.get(GOOGLE_OAUTH_PENDING_COOKIE)?.value);
  if (!pending || pending.actorId !== actor.id || pending.projectId !== project.id) return null;
  return { actor, cookieStore, pending, project };
}

export async function getPendingGoogleOAuthProvider(projectId: string) {
  return (await pendingForProject(projectId))?.pending.provider ?? null;
}

export async function cancelPendingGoogleOAuth(projectId: string) {
  const context = await pendingForProject(projectId);
  if (!context) return { status: "not_found" as const };
  context.cookieStore.delete(GOOGLE_OAUTH_PENDING_COOKIE);
  return { status: "cancelled" as const };
}

export function formatGooglePropertyDiscoveryLog(input: {
  failureClass: ProviderFailureClass;
  httpStatus?: number;
  provider: "ga4" | "gsc";
}) {
  return `[google] property discovery failed | provider ${input.provider} | class ${input.failureClass}${
    input.httpStatus === undefined ? "" : ` | status ${input.httpStatus}`
  }`;
}

export async function getPendingGoogleOAuthSetup(
  projectId: string,
): Promise<GoogleOAuthSetup | null> {
  const context = await pendingForProject(projectId);
  if (!context) return null;
  try {
    const accessToken = await refreshGoogleAccessToken(context.pending.refreshToken);
    const properties =
      context.pending.provider === "ga4"
        ? ga4PropertyOptions(await listGa4Properties(accessToken))
        : gscPropertyOptions(await listGoogleSites(accessToken));
    const gscContext =
      context.pending.provider === "gsc" ? await pendingGscContext(context.project.id) : {};
    return {
      ...gscContext,
      ...(context.pending.accountEmail ? { accountEmail: context.pending.accountEmail } : {}),
      ...(context.pending.property ? { preferredProperty: context.pending.property } : {}),
      properties,
      provider: context.pending.provider,
    };
  } catch (error) {
    const failureClass = classifyProviderFailure(error);
    const failure = googlePropertyFailure(error);
    console.info(
      formatGooglePropertyDiscoveryLog({
        failureClass,
        ...(error instanceof ProviderHttpError ? { httpStatus: error.status } : {}),
        provider: context.pending.provider,
      }),
    );
    return {
      ...(context.pending.accountEmail ? { accountEmail: context.pending.accountEmail } : {}),
      error: googlePropertyFailureCopy(failure),
      failure,
      ...(["reconnect", "reauthorize"].includes(failure.action) ? { requiresReauth: true } : {}),
      failureClass,
      properties: [],
      ...(context.pending.property ? { preferredProperty: context.pending.property } : {}),
      provider: context.pending.provider,
    };
  }
}

export async function completePendingGooglePropertySelection(input: {
  projectId: string;
  property: string;
}): Promise<GooglePropertySelectionResult> {
  const context = await pendingForProject(input.projectId);
  if (!context) throw new Error("Google connection expired. Connect the account again.");

  let property: string;
  let permissionLevel: string | undefined;
  if (context.pending.provider === "ga4") {
    const normalized = normalizeGa4PropertyId(input.property);
    if (!normalized.ok) throw new Error(normalized.error.message);
    property = normalized.value;
  } else {
    property = input.property.trim();
    let sites: Awaited<ReturnType<typeof listGoogleSites>>;
    try {
      const accessToken = await refreshGoogleAccessToken(context.pending.refreshToken);
      sites = await listGoogleSites(accessToken);
    } catch (error) {
      return googlePropertySaveFailure(context.pending.provider, error);
    }
    const selected = sites.find(
      (site) => site.siteUrl === property && site.permissionLevel !== "siteUnverifiedUser",
    );
    if (!selected) {
      throw new Error("Select a verified Search Console property from the connected account.");
    }
    property = selected.siteUrl;
    permissionLevel = selected.permissionLevel;
  }
  const provider = context.pending.provider;
  const providerDefinition = PROVIDER_CATALOG.find((item) => item.id === provider);
  if (!providerDefinition) throw new Error(`Unknown provider: ${provider}`);
  const credentials = {
    ...(context.pending.accountEmail ? { accountEmail: context.pending.accountEmail } : {}),
    apiKey: context.pending.refreshToken,
    login: property,
  };
  try {
    await verifyProviderConnectionBeforeSave({
      credentials,
      hasStoredCredentials: false,
      projectId: context.project.id,
      provider: providerDefinition,
    });
  } catch (error) {
    return googlePropertySaveFailure(provider, error);
  }
  const where = { projectId_provider: { projectId: context.project.id, provider } };
  const savedConnection = await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.project.id);
    const before = await tx.providerConnection.findUnique({ where });
    const previousProperty = decryptProviderCredentials(before?.credentialsEncrypted).login ?? null;
    const after = { enabled: true, kind: "analytics", status: "connected" };
    const firstSyncIntent = firstSyncIntentOnConnect(before, after);
    const data = {
      credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
      enabled: true,
      ...firstSyncIntent,
      kind: "analytics" as const,
      publicId: before?.publicId ?? makePublicId("conn"),
      status: "connected" as const,
    };
    const saved = await tx.providerConnection.upsert({
      create: { ...data, priority: 100, projectId: context.project.id, provider },
      select: { id: true, publicId: true },
      update: data,
      where,
    });
    await writeAudit(
      {
        action: before ? "provider.update" : "provider.connect",
        actorId: context.actor.id,
        after: {
          hasCredentials: true,
          ...(permissionLevel ? { permissionLevel } : {}),
          property,
          provider,
        },
        before: before
          ? {
              hasCredentials: Boolean(before.credentialsEncrypted),
              property: previousProperty,
              provider,
            }
          : null,
        projectId: context.project.id,
        targetId: requiredPublicAuditId(saved.publicId, "conn", "Provider connection"),
        targetType: "provider_connection",
      },
      tx,
    );
    return { saved, shouldWake: "firstSyncRequestedAt" in firstSyncIntent };
  });
  if (savedConnection.shouldWake)
    void publishWorkerIntent("traffic_first_sync").catch(() => undefined);
  context.cookieStore.delete(GOOGLE_OAUTH_PENDING_COOKIE);
  if (provider === "gsc" || provider === "ga4") {
    await queueSearchInsightsImport({ projectId: context.project.id, property, source: provider });
  }
  revalidateProviderViews();
  return { property };
}
