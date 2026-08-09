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
import type { GoogleOAuthSetup, GooglePropertyOption } from "@/lib/integrations/types";
import { decryptProviderCredentials, decryptSecret, encryptSecret } from "@/lib/providers/crypto";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { cookies } from "next/headers";
import { z } from "zod";
import { listGa4Properties, listGoogleSites, refreshGoogleAccessToken } from "./google-client";
import { normalizeGa4PropertyId } from "./property-id";

const GOOGLE_OAUTH_PENDING_COOKIE = "google_oauth_pending";
export const GOOGLE_OAUTH_PENDING_TTL_MS = 10 * 60 * 1000;

const pendingSchema = z.object({
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

function propertyKind(siteUrl: string): GooglePropertyOption["kind"] {
  return siteUrl.startsWith("sc-domain:") ? "domain" : "url-prefix";
}

function propertyLabel(siteUrl: string) {
  return siteUrl.startsWith("sc-domain:")
    ? `${siteUrl.slice("sc-domain:".length)} (Domain property)`
    : `${siteUrl} (URL-prefix property)`;
}

function propertyOptions(
  sites: Awaited<ReturnType<typeof listGoogleSites>>,
): GooglePropertyOption[] {
  return sites
    .filter((site) => site.permissionLevel !== "siteUnverifiedUser")
    .map((site) => ({
      kind: propertyKind(site.siteUrl),
      label: propertyLabel(site.siteUrl),
      permissionLevel: site.permissionLevel,
      value: site.siteUrl,
    }))
    .sort((left, right) => {
      const kindDelta = Number(left.kind === "url-prefix") - Number(right.kind === "url-prefix");
      return kindDelta || left.label.localeCompare(right.label);
    });
}

function ga4PropertyOptions(
  properties: Awaited<ReturnType<typeof listGa4Properties>>,
): GooglePropertyOption[] {
  return properties
    .map((property) => ({
      kind: "ga4" as const,
      label: `${property.displayName} (${property.propertyId})`,
      permissionLevel: property.accountDisplayName,
      value: property.propertyId,
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
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
        : propertyOptions(await listGoogleSites(accessToken));
    return {
      ...(context.pending.property ? { preferredProperty: context.pending.property } : {}),
      properties,
      provider: context.pending.provider,
    };
  } catch {
    return {
      error:
        context.pending.provider === "ga4"
          ? "We couldn't load Google Analytics 4 properties from this Google account. You can enter the numeric Property ID manually."
          : "We couldn't load verified properties from this Google account. Reconnect and try again.",
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
  const credentials = { apiKey: context.pending.refreshToken, login: property };
  await verifyProviderConnectionBeforeSave({
    credentials,
    hasStoredCredentials: false,
    projectId: context.project.id,
    provider: providerDefinition,
  });

  const where = { projectId_provider: { projectId: context.project.id, provider } };
  const before = await prisma.providerConnection.findUnique({ where });
  const previousProperty = decryptProviderCredentials(before?.credentialsEncrypted).login ?? null;
  const publicId = before?.publicId ?? makePublicId("conn");
  const data = {
    credentialsEncrypted: encryptSecret(JSON.stringify(credentials)),
    enabled: true,
    kind: "analytics" as const,
    publicId,
    status: "connected" as const,
  };
  const connection = await prisma.providerConnection.upsert({
    create: { ...data, priority: 100, projectId: context.project.id, provider },
    select: { id: true, publicId: true },
    update: data,
    where,
  });

  await writeAudit({
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
    targetId: requiredPublicAuditId(connection.publicId, "conn", "Provider connection"),
    targetType: "provider_connection",
  });
  context.cookieStore.delete(GOOGLE_OAUTH_PENDING_COOKIE);
  revalidateProviderViews();
  return { property };
}
