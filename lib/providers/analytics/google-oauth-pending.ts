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
import type { GoogleOAuthSetup } from "@/lib/integrations/types";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { decryptProviderCredentials, decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import {
  classifyProviderFailure,
  type ProviderFailureClass,
  ProviderHttpError,
} from "@/lib/providers/failure-class";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { dateKey } from "@/lib/search-insights/dates";
import { queueSearchInsightsImport } from "@/lib/search-insights/sync/ensure-import";
import { cookies } from "next/headers";
import { z } from "zod";
import { listGa4Properties, listGoogleSites, refreshGoogleAccessToken } from "./google-client";
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

async function pendingGscContext(projectId: string) {
  const [project, rows] = await Promise.all([
    prisma.project?.findUnique?.({ select: { domain: true }, where: { id: projectId } }) ??
      Promise.resolve(null),
    prisma.searchInsightsPropertyRegistry?.findMany?.({
      select: { propertyKey: true },
      where: { projectId, status: "archived" },
    }) ?? Promise.resolve([]),
  ]);
  const archivedProperties = await Promise.all(
    rows.map(async (row) => {
      const partition = await prisma.searchAnalyticsSyncPartition.findFirst({
        orderBy: { date: "desc" },
        select: { date: true },
        where: { projectId, property: row.propertyKey, source: "gsc" },
      });
      if (!partition) return null;
      const kind = row.propertyKey.startsWith("sc-domain:") ? "domain" : "url-prefix";
      return {
        kind,
        label: row.propertyKey.startsWith("sc-domain:")
          ? row.propertyKey.slice(10)
          : row.propertyKey,
        lastSyncedDate: dateKey(partition.date),
        permissionLevel: "",
        value: row.propertyKey,
      } as const;
    }),
  );
  return {
    archivedProperties: archivedProperties.filter((property) => property !== null),
    projectDomain: project?.domain ?? "",
  };
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

const GA4_FAILURE_COPY: Record<ProviderFailureClass, string> = {
  auth: "This Google account may not have Analytics access, or Google rejected the request.",
  config_invalid:
    "The Google Analytics API configuration is invalid. Check the API setup and try again.",
  network: "Google Analytics is temporarily unavailable.",
  provider_4xx:
    "This Google account may not have Analytics access, or Google rejected the request.",
  provider_5xx: "Google Analytics is temporarily unavailable.",
  rate_limit: "Google's request limit was reached. Try again shortly.",
  unknown:
    "This Google account may not have Analytics access, or the Analytics API rejected the request.",
};

function pendingSetupError(provider: "ga4" | "gsc", failureClass: ProviderFailureClass) {
  return provider === "ga4"
    ? `Couldn't load your GA4 properties. ${GA4_FAILURE_COPY[failureClass]}`
    : "We couldn't load verified properties from this Google account. Reconnect and try again.";
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
    console.info(
      formatGooglePropertyDiscoveryLog({
        failureClass,
        ...(error instanceof ProviderHttpError ? { httpStatus: error.status } : {}),
        provider: context.pending.provider,
      }),
    );
    return {
      ...(context.pending.accountEmail ? { accountEmail: context.pending.accountEmail } : {}),
      error: pendingSetupError(context.pending.provider, failureClass),
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
}) {
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
    const accessToken = await refreshGoogleAccessToken(context.pending.refreshToken);
    const sites = await listGoogleSites(accessToken);
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
  await verifyProviderConnectionBeforeSave({
    credentials,
    hasStoredCredentials: false,
    projectId: context.project.id,
    provider: providerDefinition,
  });

  const where = { projectId_provider: { projectId: context.project.id, provider } };
  await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, context.project.id);
    const before = await tx.providerConnection.findUnique({ where });
    const previousProperty = decryptProviderCredentials(before?.credentialsEncrypted).login ?? null;
    const data = {
      credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
      enabled: true,
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
    return saved;
  });
  context.cookieStore.delete(GOOGLE_OAUTH_PENDING_COOKIE);
  if (provider === "gsc" || provider === "ga4") {
    await queueSearchInsightsImport({ projectId: context.project.id, property, source: provider });
  }
  revalidateProviderViews();
  return { property };
}
